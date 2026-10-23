const DOCTOR_ADMIN_UID = "8fUdGutQHRau3RXQIrRtZUqQ9Nm1";
const EXPECTED_PROJECT_ID = "clinics-manger";
const STAFF_COLLECTION = "clinicStaff";
const PATIENTS_COLLECTION = "clinicPatients";
const USERNAMES_COLLECTION = "clinicPatientUsernames";
const MEDICAL_PATIENTS_COLLECTION = "clinicMedicalPatients";
const FIREBASE_LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
const FIREBASE_SIGNUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:signUp";
const FIREBASE_ADMIN_UPDATE_URL = "https://identitytoolkit.googleapis.com/v1/projects/clinics-manger/accounts:update";
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
function normalizeUsername(value) {
  return String(value || "").normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي")
    .replace(/\s+/g, " ").trim().toLocaleLowerCase("ar");
}
function validUsername(value) {
  return value.length >= 3 && value.length <= 40 &&
    /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(value);
}
async function internalEmailFor(usernameKey) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(usernameKey));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return "patient-" + hash + "@clinic-manger.invalid";
}

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

  if (!body || typeof body !== "object" || Array.isArray(body) || !["create", "list", "searchMedicalPatients", "accountStatus", "resetPassword"].includes(body.action)) {
    return jsonResponse({ message: "الإجراء المطلوب غير معروف." }, 400);
  }

  if (body.action === "list") {
    const user = await verifyUser(request, env);
    if (!user.ok) return jsonResponse({ message: user.message }, user.status);
    if (user.uid !== DOCTOR_ADMIN_UID) return jsonResponse({ message: "قائمة حسابات المريضات متاحة للدكتور فقط." }, 403);
    let account, token;
    try {
      account = parseServiceAccount(env);
      token = await googleAccessToken(account);
      const result = await firestore(account.project_id, token, ":runQuery", {
        method: "POST",
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: PATIENTS_COLLECTION }] } })
      });
      const patients = (Array.isArray(result) ? result : []).filter(item => item.document).map(item => {
        const fields = item.document.fields || {};
        return {
          uid: readString(fields, "uid") || String(item.document.name || "").split("/").pop(),
          role: readString(fields, "role"),
          active: fields.active?.booleanValue === true,
          displayName: readString(fields, "displayName"),
          email: readString(fields, "email"),
          phone: readString(fields, "phone"),
          username: readString(fields, "username"),
          patientId: readString(fields, "patientId"),
          createdAt: readString(fields, "createdAt"),
          updatedAt: readString(fields, "updatedAt")
        };
      });
      return jsonResponse({ patients });
    } catch (error) {
      console.error("Patient list export failed:", error);
      return jsonResponse({ message: "تعذر تحميل بيانات حسابات المريضات للتصدير." }, 503);
    }
  }

  if (body.action === "searchMedicalPatients") {
    const user = await verifyUser(request, env);
    if (!user.ok) return jsonResponse({ message: user.message }, user.status);
    try {
      const account = parseServiceAccount(env);
      const token = await googleAccessToken(account);
      const permission = await verifyPatientsEditor(user, account, token);
      if (!permission.ok) return jsonResponse({ message: permission.message }, permission.status);
      const query = String(body.query || "").trim().normalize("NFKC").replace(/\s+/g, " ").toLocaleLowerCase("ar");
      if (query.length < 1 || query.length > 120) return jsonResponse({ patients: [] });
      const result = await firestore(account.project_id, token, ":runQuery", {
        method: "POST",
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: MEDICAL_PATIENTS_COLLECTION }] } })
      });
      const patients = (Array.isArray(result) ? result : []).filter(item => item.document).map(item => {
        const fields = item.document.fields || {};
        return { patientId: String(item.document.name || "").split("/").pop(), displayName: readString(fields, "displayName"), phone: readString(fields, "phone"), patientNumber: readString(fields, "patientNumber") };
      }).filter(patient => patient.patientId && (patient.displayName.toLocaleLowerCase("ar").includes(query) || patient.phone.includes(query) || patient.patientNumber.toLocaleLowerCase("ar").includes(query))).slice(0, 20);
      return jsonResponse({ patients });
    } catch (error) {
      console.error("Medical patient account search failed:", error);
      return jsonResponse({ message: "تعذر البحث في ملفات المرضى." }, 503);
    }
  }

  const patientId = typeof body.patientId === "string" ? body.patientId.trim() : "";
  const username = normalizeUsername(body.username);
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(patientId)) return jsonResponse({ message: "اختَر ملف مريض مسجلًا من نتائج البحث." }, 400);

  if (["accountStatus", "resetPassword"].includes(body.action)) {
    if (body.action === "resetPassword" && (password.length < 8 || password.length > 128)) {
      return jsonResponse({ message: "كلمة المرور الجديدة يجب أن تكون من 8 إلى 128 حرفًا." }, 400);
    }
    const user = await verifyUser(request, env);
    if (!user.ok) return jsonResponse({ message: user.message }, user.status);
    try {
      const account = parseServiceAccount(env);
      const token = await googleAccessToken(account);
      const permission = await verifyPatientsEditor(user, account, token);
      if (!permission.ok) return jsonResponse({ message: permission.message }, permission.status);
      const patientDoc = await firestore(account.project_id, token, "/" + MEDICAL_PATIENTS_COLLECTION + "/" + encodeURIComponent(patientId));
      if (!patientDoc) return jsonResponse({ message: "ملف المريض المحدد غير موجود. ابحث عنه مرة أخرى." }, 404);
      const accountQuery = await firestore(account.project_id, token, ":runQuery", {
        method: "POST",
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: PATIENTS_COLLECTION }] } })
      });
      const linkedDoc = (Array.isArray(accountQuery) ? accountQuery : []).find(item => item.document &&
        readString(item.document.fields || {}, "patientId") === patientId &&
        item.document.fields?.active?.booleanValue === true)?.document;
      if (!linkedDoc) return jsonResponse({ accountExists: false, message: "لا يوجد حساب نشط مرتبط بهذا الملف." });
      const linkedFields = linkedDoc.fields || {};
      const linkedUid = readString(linkedFields, "uid") || String(linkedDoc.name || "").split("/").pop();
      const linkedUsername = readString(linkedFields, "username");
      if (body.action === "accountStatus") {
        return jsonResponse({ accountExists: true, username: linkedUsername, active: true });
      }
      const updateResponse = await fetch(FIREBASE_ADMIN_UPDATE_URL, {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ localId: linkedUid, password })
      });
      if (!updateResponse.ok) {
        const detail = await updateResponse.text();
        console.error("Patient password reset failed:", updateResponse.status, detail.slice(0, 400));
        return jsonResponse({ message: "تعذر إعادة تعيين كلمة المرور من خدمة Firebase. لم يتم حفظ أي كلمة مرور." }, 503);
      }
      const now = new Date().toISOString();
      const updatePath = "/" + PATIENTS_COLLECTION + "/" + encodeURIComponent(linkedUid) +
        "?updateMask.fieldPaths=updatedAt&updateMask.fieldPaths=passwordResetAt&updateMask.fieldPaths=passwordResetBy";
      await firestore(account.project_id, token, updatePath, {
        method: "PATCH",
        body: JSON.stringify(encodeDocument({
          updatedAt: fsString(now),
          passwordResetAt: fsString(now),
          passwordResetBy: fsString(user.uid)
        }))
      });
      return jsonResponse({
        success: true,
        patient: { patientId, username: linkedUsername },
        credentials: { username: linkedUsername, password },
        message: "تم تغيير كلمة المرور. سلّمها للمريض بشكل خاص؛ لن يتم حفظها كنص مكشوف."
      });
    } catch (error) {
      console.error("Patient account status/reset failed:", error);
      return jsonResponse({ message: error.message || "تعذر التحقق من حساب المريض أو إعادة تعيين كلمة المرور." }, error.status === 403 ? 403 : 503);
    }
  }

  if (!validUsername(username)) return jsonResponse({ message: "اسم المستخدم يجب أن يكون من 3 إلى 40 حرفًا أو رقمًا، ويمكن أن يكون بالعربية أو رقم الهاتف." }, 400);
  if (password.length < 8 || password.length > 128) return jsonResponse({ message: "كلمة المرور يجب أن تكون من 8 إلى 128 حرفًا." }, 400);

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

    const usernameKey = normalizeUsername(username);
    const existingUsername = await firestore(account.project_id, token, "/" + USERNAMES_COLLECTION + "/" + encodeURIComponent(usernameKey));
    if (existingUsername) return jsonResponse({ message: "اسم المستخدم مستخدم بالفعل. اختَر اسمًا آخر." }, 409);

    const medicalPatient = await firestore(account.project_id, token, "/" + MEDICAL_PATIENTS_COLLECTION + "/" + encodeURIComponent(patientId));
    if (!medicalPatient) return jsonResponse({ message: "ملف المريض المحدد غير موجود. ابحث عنه مرة أخرى." }, 404);
    const medicalFields = medicalPatient.fields || {};
    const displayName = readString(medicalFields, "displayName").trim();
    const phone = readString(medicalFields, "phone").trim();
    if (displayName.length < 2 || !phone) return jsonResponse({ message: "ملف المريض لا يحتوي على الاسم ورقم الهاتف اللازمين لإنشاء الحساب." }, 400);

    const existingPatientAccounts = await firestore(account.project_id, token, ":runQuery", {
      method: "POST",
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: PATIENTS_COLLECTION }] } })
    });
    const alreadyLinked = (Array.isArray(existingPatientAccounts) ? existingPatientAccounts : []).some(item => item.document && readString(item.document.fields || {}, "patientId") === patientId && item.document.fields?.active?.booleanValue === true);
    if (alreadyLinked) return jsonResponse({ message: "يوجد حساب نشط مرتبط بملف هذا المريض بالفعل." }, 409);

    const email = await internalEmailFor(usernameKey);
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
        body: JSON.stringify(encodeDocument({ uid: fsString(uid), role: fsString("patient"), active: fsBool(true), patientId: fsString(patientId), displayName: fsString(displayName), email: fsString(email), phone: fsString(phone), username: fsString(username), usernameKey: fsString(usernameKey), createdAt: fsString(now), updatedAt: fsString(now) }))
      });
      await firestore(account.project_id, token, "/" + USERNAMES_COLLECTION + "/" + encodeURIComponent(usernameKey), {
        method: "PATCH",
        body: JSON.stringify(encodeDocument({ uid: fsString(uid), email: fsString(email), username: fsString(username), usernameKey: fsString(usernameKey), active: fsBool(true), createdAt: fsString(now) }))
      });
    } catch (error) {
      try {
        await firestore(account.project_id, token, "/" + PATIENTS_COLLECTION + "/" + encodeURIComponent(uid), {
          method: "DELETE"
        });
        await firestore(account.project_id, token, "/" + USERNAMES_COLLECTION + "/" + encodeURIComponent(usernameKey), {
          method: "DELETE"
        });
      } catch (cleanupError) {
        console.error("Patient account rollback cleanup failed:", cleanupError);
      }
      await deleteAuthUser(env.FIREBASE_API_KEY, signupResult.idToken);
      throw error;
    }

    return jsonResponse({
      success: true,
      patient: { uid, patientId, displayName, phone, username },
      credentials: { username, password },
      message: "تم إنشاء حساب المريض وربطه بملفه الطبي. سلّم بيانات الدخول له بشكل خاص. كلمة المرور غير محفوظة في قاعدة البيانات."
    }, 201);
  } catch (error) {
    console.error("Patient account creation failed:", error);
    return jsonResponse({ message: error.message || "تعذر إنشاء حساب المريضة." }, error.status === 403 ? 403 : 503);
  }
}
