const EXPECTED_PROJECT_ID = "clinics-manger";
const PATIENTS_COLLECTION = "clinicPatients";
const MEDICAL_PATIENTS_COLLECTION = "clinicMedicalPatients";
const VISITS_COLLECTION = "clinicMedicalVisits";
const BOOKINGS_COLLECTION = "clinicBookings";
const FIREBASE_LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  }});
}
function b64url(bytes) { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function b64text(value) { return b64url(new TextEncoder().encode(value)); }
function privateKeyBytes(pem) {
  const raw = atob(pem.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s/g, ""));
  const bytes = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i); return bytes;
}
function parseServiceAccount(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error("Missing service account secret.");
  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (account.project_id !== EXPECTED_PROJECT_ID || !account.client_email || !account.private_key) throw new Error("Invalid service account.");
  return account;
}
async function googleAccessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = [b64text(JSON.stringify({ alg: "RS256", typ: "JWT" })), b64text(JSON.stringify({ iss: account.client_email, scope: GOOGLE_SCOPE, aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3600 }))].join(".");
  const key = await crypto.subtle.importKey("pkcs8", privateKeyBytes(account.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const response = await fetch(GOOGLE_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: unsigned + "." + b64url(new Uint8Array(signature)) }) });
  if (!response.ok) throw new Error("Unable to obtain access token.");
  const result = await response.json(); if (!result.access_token) throw new Error("Access token missing."); return result.access_token;
}
function documentsUrl(projectId, path = "") { return "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(projectId) + "/databases/(default)/documents" + path; }
async function firestore(projectId, token, path, options = {}) {
  const response = await fetch(documentsUrl(projectId, path), { ...options, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(options.headers || {}) }, cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) { const details = await response.text(); console.error("Patient portal Firestore error:", response.status, details.slice(0, 400)); throw new Error("تعذر تحميل بيانات البوابة."); }
  const raw = await response.text(); return raw ? JSON.parse(raw) : null;
}
function readString(fields, key) { return fields?.[key]?.stringValue || ""; }
function normalize(value) { return String(value || "").normalize("NFKC").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/\s+/g, " ").trim().toLocaleLowerCase("ar"); }
function normalizePhone(value) { return String(value || "").replace(/\D/g, ""); }
async function verifyUser(request, env) {
  if (!env.FIREBASE_API_KEY) return { ok: false, status: 503, message: "خدمة التحقق غير مهيأة." };
  const match = (request.headers.get("Authorization") || "").match(/^Bearer\s+(\S+)$/i);
  if (!match || match[1].length > 8192) return { ok: false, status: 401, message: "يلزم تسجيل الدخول." };
  const response = await fetch(FIREBASE_LOOKUP_URL + "?key=" + encodeURIComponent(env.FIREBASE_API_KEY), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: match[1] }) });
  if (!response.ok) return { ok: false, status: 401, message: "جلسة الدخول غير صالحة." };
  const result = await response.json(), user = result.users?.[0];
  return user?.localId ? { ok: true, uid: user.localId } : { ok: false, status: 401, message: "تعذر التحقق من الحساب." };
}
async function getPatientContext(user, env) {
  const account = parseServiceAccount(env), token = await googleAccessToken(account);
  const accountDoc = await firestore(account.project_id, token, "/" + PATIENTS_COLLECTION + "/" + encodeURIComponent(user.uid));
  const fields = accountDoc?.fields || {};
  if (readString(fields, "uid") !== user.uid || readString(fields, "role") !== "patient" || fields.active?.booleanValue !== true) {
    return { error: jsonResponse({ message: "حساب المريض غير نشط أو غير معتمد." }, 403) };
  }
  const patientId = readString(fields, "patientId");
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(patientId)) return { error: jsonResponse({ message: "هذا الحساب غير مرتبط بملف طبي. تواصل مع العيادة لتصحيح الربط." }, 409) };
  const medicalDoc = await firestore(account.project_id, token, "/" + MEDICAL_PATIENTS_COLLECTION + "/" + encodeURIComponent(patientId));
  if (!medicalDoc) return { error: jsonResponse({ message: "الملف الطبي المرتبط بالحساب غير موجود. تواصل مع العيادة." }, 409) };
  const medical = medicalDoc.fields || {};
  return { account, token, patientId, patient: { id: patientId, patientNumber: readString(medical, "patientNumber"), displayName: readString(medical, "displayName"), phone: readString(medical, "phone"), gender: readString(medical, "gender"), birthDate: readString(medical, "birthDate"), notes: readString(medical, "notes") } };
}
async function collection(projectId, token, name) {
  const result = await firestore(projectId, token, ":runQuery", { method: "POST", body: JSON.stringify({ structuredQuery: { from: [{ collectionId: name }], limit: 500 } }) });
  return (Array.isArray(result) ? result : []).filter(item => item.document).map(item => item.document);
}
async function getPortalData(context) {
  const { account, token, patientId, patient } = context;
  const [bookingDocs, visitDocs] = await Promise.all([collection(account.project_id, token, BOOKINGS_COLLECTION), collection(account.project_id, token, VISITS_COLLECTION)]);
  const appointments = bookingDocs.map(doc => {
    const f = doc.fields || {};
    return { id: (doc.name || "").split("/").pop(), patientId: readString(f, "patientId"), patientName: readString(f, "patientName"), patientPhone: readString(f, "patientPhone"), appointmentDate: readString(f, "appointmentDate"), service: readString(f, "service"), status: readString(f, "status") || "pending", createdAt: readString(f, "createdAt") };
  }).filter(b => b.patientId === patientId || (!b.patientId && normalize(b.patientName) === normalize(patient.displayName) && normalizePhone(b.patientPhone) === normalizePhone(patient.phone)))
    .map(({ id, appointmentDate, service, status, createdAt }) => ({ id, appointmentDate, service, status, createdAt }))
    .sort((a, b) => String(b.appointmentDate).localeCompare(String(a.appointmentDate)));
  const visits = visitDocs.map(doc => {
    const f = doc.fields || {};
    return { id: (doc.name || "").split("/").pop(), patientId: readString(f, "patientId"), bookingId: readString(f, "bookingId"), visitDate: readString(f, "visitDate"), queueNumber: readString(f, "queueNumber"), bloodPressure: readString(f, "bloodPressure"), weight: readString(f, "weight"), bloodSugar: readString(f, "bloodSugar"), preVisitNotes: readString(f, "preVisitNotes"), diagnosis: readString(f, "diagnosis"), clinicalNotes: readString(f, "clinicalNotes"), treatment: readString(f, "treatment"), followUp: readString(f, "followUp"), createdAt: readString(f, "createdAt") };
  }).filter(v => v.patientId === patientId).sort((a, b) => String(b.visitDate).localeCompare(String(a.visitDate)) || String(b.createdAt).localeCompare(String(a.createdAt)));
  return { patient, appointments, visits };
}
async function requestBooking(context, body) {
  const appointmentDate = typeof body.appointmentDate === "string" ? body.appointmentDate.trim() : "";
  const service = typeof body.service === "string" ? body.service.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate) || Number.isNaN(Date.parse(appointmentDate + "T12:00:00"))) throw Object.assign(new Error("اختَر تاريخًا صحيحًا للموعد."), { status: 400 });
  if (appointmentDate < new Date().toISOString().slice(0, 10)) throw Object.assign(new Error("لا يمكن طلب موعد بتاريخ مضى."), { status: 400 });
  if (service.length > 160) throw Object.assign(new Error("اسم الخدمة أطول من المسموح."), { status: 400 });
  const { account, token, patient, patientId } = context, now = new Date().toISOString();
  const fields = { patientId: { stringValue: patientId }, patientName: { stringValue: patient.displayName }, patientPhone: { stringValue: patient.phone }, appointmentDate: { stringValue: appointmentDate }, service: { stringValue: service }, notes: { stringValue: "" }, status: { stringValue: "pending" }, source: { stringValue: "patient-portal" }, createdAt: { stringValue: now }, updatedAt: { stringValue: now } };
  const doc = await firestore(account.project_id, token, "/" + BOOKINGS_COLLECTION, { method: "POST", body: JSON.stringify({ fields }) });
  return { id: (doc?.name || "").split("/").pop(), appointmentDate, service, status: "pending" };
}
export async function onRequest({ request, env }) {
  if (!["GET", "POST"].includes(request.method)) return jsonResponse({ message: "طريقة الطلب غير مسموحة." }, 405);
  if (request.method === "POST" && !(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) return jsonResponse({ message: "نوع محتوى الطلب غير مدعوم." }, 415);
  const user = await verifyUser(request, env); if (!user.ok) return jsonResponse({ message: user.message }, user.status);
  let body = {};
  if (request.method === "POST") { try { const raw = await request.text(); if (raw.length > 5000) return jsonResponse({ message: "حجم الطلب أكبر من المسموح." }, 413); body = JSON.parse(raw); } catch { return jsonResponse({ message: "صيغة الطلب غير صحيحة." }, 400); } }
  try {
    const context = await getPatientContext(user, env); if (context.error) return context.error;
    if (request.method === "POST") {
      if (body?.action !== "requestBooking") return jsonResponse({ message: "الإجراء المطلوب غير معروف." }, 400);
      const appointment = await requestBooking(context, body);
      return jsonResponse({ success: true, appointment, message: "تم إرسال طلب الحجز للعيادة، وحالته الآن قيد المراجعة." }, 201);
    }
    return jsonResponse({ ...await getPortalData(context), message: "" });
  } catch (error) {
    console.error("Patient portal request failed:", error);
    return jsonResponse({ message: error.message || "تعذر تنفيذ الطلب حاليًا." }, error.status === 400 ? 400 : 503);
  }
}
