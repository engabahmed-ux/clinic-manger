const EXPECTED_PROJECT_ID = "clinics-manger";
const PATIENTS_COLLECTION = "clinicPatients";
const BOOKINGS_COLLECTION = "clinicBookings";
const FIREBASE_LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
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
function b64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64text(value) { return b64url(new TextEncoder().encode(value)); }
function privateKeyBytes(pem) {
  const raw = atob(pem.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s/g, ""));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
function parseServiceAccount(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error("Missing service account secret.");
  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (account.project_id !== EXPECTED_PROJECT_ID || !account.client_email || !account.private_key) throw new Error("Invalid service account.");
  return account;
}
async function googleAccessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = [
    b64text(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    b64text(JSON.stringify({ iss: account.client_email, scope: GOOGLE_SCOPE, aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3600 }))
  ].join(".");
  const key = await crypto.subtle.importKey("pkcs8", privateKeyBytes(account.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: unsigned + "." + b64url(new Uint8Array(signature)) })
  });
  if (!response.ok) throw new Error("Unable to obtain access token.");
  const result = await response.json();
  if (!result.access_token) throw new Error("Access token missing.");
  return result.access_token;
}
function documentsUrl(projectId, path = "") {
  return "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(projectId) + "/databases/(default)/documents" + path;
}
async function firestore(projectId, token, path, options = {}) {
  const response = await fetch(documentsUrl(projectId, path), {
    ...options,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(options.headers || {}) },
    cache: "no-store"
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const details = await response.text();
    console.error("Patient portal Firestore error:", response.status, details.slice(0, 500));
    throw new Error("تعذر تحميل بيانات البوابة.");
  }
  const raw = await response.text();
  return raw ? JSON.parse(raw) : null;
}
function readString(fields, key) { return fields?.[key]?.stringValue || ""; }
function normalizePhone(value) { return String(value || "").replace(/\D/g, ""); }

async function verifyUser(request, env) {
  if (!env.FIREBASE_API_KEY) return { ok: false, status: 503, message: "خدمة التحقق غير مهيأة." };
  const match = (request.headers.get("Authorization") || "").match(/^Bearer\s+(\S+)$/i);
  if (!match || match[1].length > 8192) return { ok: false, status: 401, message: "يلزم تسجيل الدخول." };
  const response = await fetch(FIREBASE_LOOKUP_URL + "?key=" + encodeURIComponent(env.FIREBASE_API_KEY), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: match[1] })
  });
  if (!response.ok) return { ok: false, status: 401, message: "جلسة الدخول غير صالحة." };
  const result = await response.json();
  const user = result.users?.[0];
  return user?.localId ? { ok: true, uid: user.localId } : { ok: false, status: 401, message: "تعذر التحقق من الحساب." };
}

export async function onRequest({ request, env }) {
  if (request.method !== "GET" && request.method !== "POST") return jsonResponse({ message: "طريقة الطلب غير مسموحة." }, 405);
  const user = await verifyUser(request, env);
  if (!user.ok) return jsonResponse({ message: user.message }, user.status);

  try {
    const account = parseServiceAccount(env);
    const token = await googleAccessToken(account);
    const patientDoc = await firestore(account.project_id, token, "/" + PATIENTS_COLLECTION + "/" + encodeURIComponent(user.uid));
    const patientFields = patientDoc?.fields || {};
    if (
      readString(patientFields, "uid") !== user.uid ||
      readString(patientFields, "role") !== "patient" ||
      patientFields.active?.booleanValue !== true
    ) {
      return jsonResponse({ message: "حساب المريضة غير نشط أو غير معتمد." }, 403);
    }

    const patientName = readString(patientFields, "displayName").trim().toLocaleLowerCase("ar");
    const patientPhone = normalizePhone(readString(patientFields, "phone"));
    if (!patientName || !patientPhone) {
      return jsonResponse({
        appointments: [],
        message: "لم يتم ربط حجوزات بحسابك حتى الآن. إذا كان لديك طلب سابق، تواصلي مع العيادة لربطه بحسابك."
      });
    }

    const result = await firestore(account.project_id, token, ":runQuery", {
      method: "POST",
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: BOOKINGS_COLLECTION }],
          limit: 300
        }
      })
    });

    const appointments = (Array.isArray(result) ? result : [])
      .filter((item) => item.document)
      .map((item) => {
        const fields = item.document.fields || {};
        return {
          id: (item.document.name || "").split("/").pop(),
          patientName: readString(fields, "patientName").trim().toLocaleLowerCase("ar"),
          patientPhone: normalizePhone(readString(fields, "patientPhone")),
          appointmentDate: readString(fields, "appointmentDate"),
          service: readString(fields, "service"),
          status: readString(fields, "status") || "pending"
        };
      })
      .filter((booking) => booking.patientName === patientName && booking.patientPhone === patientPhone)
      .map(({ id, appointmentDate, service, status }) => ({
        id,
        appointmentDate,
        service,
        status
      }))
      .sort((a, b) => a.appointmentDate.localeCompare(b.appointmentDate));

    return jsonResponse({ appointments, message: appointments.length ? "" : "لا توجد مواعيد مرتبطة بحسابك حتى الآن." });
  } catch (error) {
    console.error("Patient portal request failed:", error);
    return jsonResponse({ message: "تعذر تحميل المواعيد حاليًا. حاولي مرة أخرى لاحقًا." }, 503);
  }
}
