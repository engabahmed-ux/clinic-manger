const DOCTOR_ADMIN_UID = "8fUdGutQHRau3RXQIrRtZUqQ9Nm1";
const EXPECTED_PROJECT_ID = "clinics-manger";
const STAFF_COLLECTION = "clinicStaff";
const PATIENTS_COLLECTION = "clinicPatients";
const USERNAMES_COLLECTION = "clinicPatientUsernames";
const FIREBASE_LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
const FIREBASE_SIGNUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:signUp";
const FIREBASE_DELETE_URL = "https://identitytoolkit.googleapis.com/v1/accounts:delete";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const PERMISSION_KEYS = ["bookings", "patients", "medicalRecords", "settings"];

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
  if (account.project_id !== EXPECTED_PROJECT_ID || !account.client_email || !account.private_key) {
    throw new Error("Invalid service account configuration.");
  }
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
  if (!response.ok) throw new Error("Unable to obtain Google access token.");
  const result = await response.json();
  if (!result.access_token) throw new Error("Google access token missing.");
  return result.access_token;
}
function docsUrl(projectId, path = "") {
  return "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(projectId) + "/databases/(default)/documents" + path;
}
async function firestore(projectId, token, path, options = {}) {
  const response = await fetch(docsUrl(projectId, path), {
    ...options,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const details = await response.text();
    console.error("Patient API Firestore error:", response.status, details.slice(0, 500));
    const error = new Error("تعذر الوصول إلى بيانات المرضى.");
    error.status = response.status;
    throw error;
  }
  const raw = await response.text();
  return raw ? JSON.parse(raw) : null;
}
function fsString(value) { return { stringValue: String(value ?? "") }; }
function fsBool(value) { return { booleanValue: Boolean(value) }; }
function readString(fields, key) { return fields?.[key]?.stringValue || ""; }

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
  return user?.localId ? { ok: true, uid: user.localId, email: user.email || "" } : { ok: false, status: 401, message: "تعذر التحقق من الحساب." };
}

async function verifyPatientsEditor(user, account, token) {
  if (user.uid === DOCTOR_ADMIN_UID) return { ok: true };
  const document = await firestore(account.project_id, token, "/" + STAFF_COLLECTION + "/" + encodeURIComponent(user.uid));
  const fields = document?.fields || {};
  if (readString(fields, "role") !== "staff" || fields.active?.booleanValue !== true) {
    return { ok: false, status: 403, message: "حساب الموظف غير نشط أو غير معتمد." };
  }
  const permissions = fields.permissions?.mapValue?.fields || {};
  const permission = readString(permissions, "patients");
  if (permission !== "edit") return { ok: false, status: 403, message: "تحتاج إلى صلاحية تعديل بيانات المرضى لإنشاء حساب." };
  return { ok: true };
}

function generateTemporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return "Pt!" + b64url(bytes) + "9a";
}

function encodeDocument(fields) {
  return { fields };
}

async function deleteAuthUser(apiKey, idToken) {
  if (!idToken) return;
  try {
    await fetch(FIREBASE_DELETE_URL + "?key=" + encodeURIComponent(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken })
    });
  } catch (error) {
    console.error("Could not roll back newly created Auth user:", error);
  }
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return jsonResponse({ message: "طريقة الطلب غير مسموحة." }, 405);
  if (!(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) {
    return jsonResponse({ message: "نوع محتوى الطلب غير مدعوم." }, 415);
  }

  let body;
  try {
    const raw = await request.text();
    if (raw.length > 12000) return jsonResponse({ message: "حجم الطلب أكبر من المسموح." }, 413);
    body = JSON.parse(raw);
  } catch {
    return jsonResponse({ message: "بيانات الطلب غير صحيحة." }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body) || body.action !== "create") {
    return jsonResponse({ message: "الإجراء المطلوب غير معروف." }, 400);
  }

  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";

  if (displayName.length < 2 || displayName.length > 120) return jsonResponse({ message: "اسم المريضة مطلوب ويجب ألا يتجاوز 120 حرفًا." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return jsonResponse({ message: "البريد الإلكتروني غير صحيح." }, 400);
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) return jsonResponse({ message: "اسم المستخدم يجب أن يكون من 3 إلى 30 حرفًا إنجليزيًا أو رقمًا، ويمكن أن يحتوي على نقطة أو شرطة أو شرطة سفلية." }, 400);
  if (!phone) return jsonResponse({ message: "رقم هاتف المريضة مطلوب لربط حجوزاتها بحسابها." }, 400);
  if (phone.length > 40) return jsonResponse({ message: "رقم الهاتف أطول من المسموح." }, 400);

  let account, token;
  try {
    account = parseServiceAccount(env);
    token = await googleAccessToken(account);
  } catch (error) {
    console.error("Patient API configuration error:", error);
    return jsonResponse({ message: "خدمة إنشاء الحسابات غير مهيأة حاليًا." }, 503);
  }

  const user = await verifyUser(request, env);
  if (!user.ok) return jsonResponse({ message: user.message }, user.status);

  try {
    const permission = await verifyPatientsEditor(user, account, token);
    if (!permission.ok) return jsonResponse({ message: permission.message }, permission.status);

    const existingUsername = await firestore(account.project_id, token, "/" + USERNAMES_COLLECTION + "/" + encodeURIComponent(username));
    if (existingUsername) return jsonResponse({ message: "اسم المستخدم مستخدم بالفعل. اختاري اسمًا آخر." }, 409);

    const password = generateTemporaryPassword();
    const signup = await fetch(FIREBASE_SIGNUP_URL + "?key=" + encodeURIComponent(env.FIREBASE_API_KEY || ""), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName, returnSecureToken: true })
    });
    const signupResult = await signup.json().catch(() => ({}));
    if (!signup.ok || !signupResult.localId) {
      const code = signupResult.error?.message || "";
      const message = code.includes("EMAIL_EXISTS")
        ? "هذا البريد الإلكتروني مرتبط بحساب موجود بالفعل."
        : code.includes("OPERATION_NOT_ALLOWED")
          ? "إنشاء الحسابات بالبريد وكلمة المرور غير مفعّل في Firebase."
          : "تعذر إنشاء حساب المريضة. راجعي البيانات وحاولي مرة أخرى.";
      return jsonResponse({ message }, code.includes("EMAIL_EXISTS") ? 409 : 400);
    }

    const uid = signupResult.localId;
    const now = new Date().toISOString();
    try {
      await firestore(account.project_id, token, "/" + PATIENTS_COLLECTION + "/" + encodeURIComponent(uid), {
        method: "PATCH",
        body: JSON.stringify(encodeDocument({ uid: fsString(uid), role: fsString("patient"), active: fsBool(true), displayName: fsString(displayName), email: fsString(email), phone: fsString(phone), username: fsString(username), createdAt: fsString(now), updatedAt: fsString(now) }))
      });
      await firestore(account.project_id, token, "/" + USERNAMES_COLLECTION + "/" + encodeURIComponent(username), {
        method: "PATCH",
        body: JSON.stringify(encodeDocument({ uid: fsString(uid), email: fsString(email), username: fsString(username), active: fsBool(true), createdAt: fsString(now) }))
      });
    } catch (error) {
      await deleteAuthUser(env.FIREBASE_API_KEY, signupResult.idToken);
      throw error;
    }

    return jsonResponse({
      success: true,
      patient: { uid, displayName, email, phone, username },
      credentials: { username, email, temporaryPassword: password },
      message: "تم إنشاء حساب المريضة. سلّمي بيانات الدخول لها بشكل خاص، ولا تحفظي كلمة المرور في ملف أو قاعدة البيانات."
    }, 201);
  } catch (error) {
    console.error("Patient account creation failed:", error);
    return jsonResponse({ message: error.message || "تعذر إنشاء حساب المريضة." }, error.status === 403 ? 403 : 503);
  }
}
