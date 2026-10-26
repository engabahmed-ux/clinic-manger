import { publishClinicRealtime } from "../../../_shared/realtime.js";
const EXPECTED_PROJECT_ID = "clinics-manger";
const BOOKINGS_COLLECTION = "clinicBookings";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}

function encodeBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function encodeText(value) {
  return encodeBytes(new TextEncoder().encode(value));
}

function decodePrivateKey(pem) {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function parseServiceAccount(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new Error("Missing service account configuration.");
  }

  let account;
  try {
    account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch {
    throw new Error("Invalid service account JSON.");
  }

  if (
    account.project_id !== EXPECTED_PROJECT_ID ||
    typeof account.client_email !== "string" ||
    typeof account.private_key !== "string"
  ) {
    throw new Error("Invalid service account configuration.");
  }

  return account;
}

async function createGoogleAccessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = [
    encodeText(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    encodeText(JSON.stringify({
      iss: account.client_email,
      scope: GOOGLE_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600
    }))
  ].join(".");

  const key = await crypto.subtle.importKey(
    "pkcs8",
    decodePrivateKey(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );

  const assertion = `${unsigned}.${encodeBytes(new Uint8Array(signature))}`;
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  if (!response.ok) {
    throw new Error("Unable to obtain Google access token.");
  }

  const result = await response.json();
  if (!result.access_token) {
    throw new Error("Google access token missing.");
  }

  return result.access_token;
}

function firestoreUrl(projectId, path = "") {
  return "https://firestore.googleapis.com/v1/projects/" +
    `${encodeURIComponent(projectId)}/databases/(default)/documents${path}`;
}

async function createBooking(projectId, accessToken, data) {
  const now = new Date().toISOString();
  const fields = {
    patientName: { stringValue: data.patientName.trim() },
    patientPhone: { stringValue: data.patientPhone.trim() },
    appointmentDate: { stringValue: data.appointmentDate },
    service: { stringValue: data.service.trim() },
    notes: { stringValue: data.notes.trim() },
    status: { stringValue: "pending" },
    createdAt: { stringValue: now },
    updatedAt: { stringValue: now },
    source: { stringValue: "public-website" }
  };

  const response = await fetch(firestoreUrl(
    projectId,
    `/${BOOKINGS_COLLECTION}`
  ), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fields })
  });

  if (!response.ok) {
    const details = await response.text();
    console.error("Public booking write failed:", response.status, details.slice(0, 500));
    throw new Error("تعذر حفظ طلب الحجز.");
  }

  const document = await response.json();
  return (document.name || "").split("/").pop();
}

async function writePublicAuditLog(projectId, accessToken, action, level, message, targetId = "") {
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const fields = {
    actorUid: { stringValue: "public-visitor" },
    actorName: { stringValue: "زائر الموقع" },
    actorType: { stringValue: "public" },
    action: { stringValue: action },
    area: { stringValue: "public_booking" },
    level: { stringValue: level },
    message: { stringValue: message },
    targetType: { stringValue: "booking" },
    targetId: { stringValue: targetId },
    createdAt: { timestampValue: now.toISOString() },
    expiresAt: { timestampValue: expires.toISOString() }
  };
  const response = await fetch(firestoreUrl(projectId, "/clinicLogs"), {
    method: "POST",
    headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({ fields })
  });
  if (!response.ok) {
    const details = await response.text();
    console.error("Public audit log write failed:", response.status, details.slice(0, 300));
  }
}

async function validateConfiguredService(projectId, accessToken, serviceName) {
  if (!serviceName) return null;
  const response = await fetch(firestoreUrl(projectId, "/clinicSettings/current"), {
    headers: { Authorization: "Bearer " + accessToken }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Unable to read clinic settings.");
  const document = await response.json();
  let settings = null;
  try { settings = JSON.parse(document.fields?.settingsJson?.stringValue || "null"); } catch { throw new Error("Clinic settings are invalid."); }
  const services = settings?.services?.items;
  if (!Array.isArray(services)) return null;
  const selected = services.find(item => item && item.enabled !== false && String(item.title || "").trim() === serviceName.trim());
  return selected ? null : "الخدمة المختارة لم تعد متاحة. حدّث الصفحة واختر خدمة من القائمة الحالية.";
}

function validateBooking(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "بيانات الحجز غير صحيحة.";
  }

  const allowed = ["patientName", "patientPhone", "appointmentDate", "service", "notes"];
  if (Object.keys(data).some((key) => !allowed.includes(key))) {
    return "تم إرسال حقول غير معتمدة.";
  }

  for (const key of ["patientName", "patientPhone", "appointmentDate"]) {
    if (typeof data[key] !== "string" || !data[key].trim()) {
      return "يرجى إدخال الاسم ورقم الهاتف والتاريخ المفضل.";
    }
  }

  if (data.patientName.trim().length > 120) return "الاسم أطول من المسموح.";
  if (data.patientPhone.trim().length > 40) return "رقم الهاتف أطول من المسموح.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.appointmentDate)) {
    return "تاريخ الحجز غير صحيح.";
  }

  const [year, month, day] = data.appointmentDate.split("-").map(Number);
  const requestedDate = new Date(Date.UTC(year, month - 1, day));
  if (
    requestedDate.getUTCFullYear() !== year ||
    requestedDate.getUTCMonth() !== month - 1 ||
    requestedDate.getUTCDate() !== day
  ) {
    return "تاريخ الحجز غير صحيح.";
  }

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

  if (data.appointmentDate < today) return "اختاري تاريخًا اليوم أو بعده.";
  if (typeof (data.service ?? "") !== "string" || String(data.service ?? "").length > 120) {
    return "اسم الخدمة غير صحيح.";
  }
  if (typeof (data.notes ?? "") !== "string" || String(data.notes ?? "").length > 1000) {
    return "الملاحظات أطول من المسموح.";
  }

  return null;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "POST") {
    return jsonResponse({ message: "طريقة الطلب غير مسموحة." }, 405);
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonResponse({ message: "نوع محتوى الطلب غير مدعوم." }, 415);
  }

  const origin = request.headers.get("Origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) {
        return jsonResponse({ message: "مصدر الطلب غير مسموح." }, 403);
      }
    } catch {
      return jsonResponse({ message: "مصدر الطلب غير صحيح." }, 403);
    }
  }

  let data;
  try {
    const raw = await request.text();
    if (raw.length > 10000) {
      return jsonResponse({ message: "حجم الطلب أكبر من المسموح." }, 413);
    }
    data = JSON.parse(raw);
  } catch {
    return jsonResponse({ message: "صيغة الطلب غير صحيحة." }, 400);
  }

  const validationError = validateBooking(data);
  if (validationError) return jsonResponse({ message: validationError }, 400);

  let account;
  let accessToken;
  try {
    account = parseServiceAccount(env);
    accessToken = await createGoogleAccessToken(account);
  } catch (error) {
    console.error("Public booking service configuration error:", error);
    return jsonResponse({ message: "خدمة الحجز غير مهيأة حاليًا." }, 503);
  }

  try {
    const serviceError = await validateConfiguredService(account.project_id, accessToken, data.service ?? "");
    if (serviceError) return jsonResponse({ message: serviceError }, 400);
    const id = await createBooking(account.project_id, accessToken, {
      patientName: data.patientName,
      patientPhone: data.patientPhone,
      appointmentDate: data.appointmentDate,
      service: data.service ?? "",
      notes: data.notes ?? ""
    });
    try { await writePublicAuditLog(account.project_id, accessToken, "booking_created", "info", "تم استلام طلب حجز من الموقع العام.", id); } catch (logError) { console.error("Public audit log failed:", logError); }
    const notification = publishClinicRealtime(env, "booking_created");
    if (typeof context.waitUntil === "function") context.waitUntil(notification);
    else void notification;

    return jsonResponse({
      success: true,
      bookingId: id,
      status: "pending",
      message: "تم استلام طلب الحجز بنجاح، وسيتم التواصل معك لتأكيد الموعد."
    }, 201);
  } catch (error) {
    console.error("Public booking request failed:", error);
    try { if (account?.project_id && accessToken) await writePublicAuditLog(account.project_id, accessToken, "request_failed", "error", "فشل حفظ طلب حجز من الموقع العام."); } catch (logError) { console.error("Public booking failure log failed:", logError); }
    return jsonResponse({ message: "تعذر حفظ طلب الحجز الآن. حاولي مرة أخرى لاحقًا." }, 503);
  }
}
