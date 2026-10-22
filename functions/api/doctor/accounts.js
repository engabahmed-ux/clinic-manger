const DOCTOR_ADMIN_UID = "8fUdGutQHRau3RXQIrRtZUqQ9Nm1";
const EXPECTED_PROJECT_ID = "clinics-manger";
const COLLECTION = "clinicAccountRecords";
const LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  }});
}
function b64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64text(value) { return b64url(new TextEncoder().encode(value)); }
function privateKeyBytes(pem) {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s/g, "");
  const binary = atob(base64), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function accessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = [b64text(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    b64text(JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }))].join(".");
  const key = await crypto.subtle.importKey("pkcs8", privateKeyBytes(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const response = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: unsigned + "." + b64url(new Uint8Array(signature)) }) });
  if (!response.ok) throw new Error("تعذر تهيئة خدمة الحسابات.");
  const result = await response.json();
  if (!result.access_token) throw new Error("تعذر تهيئة خدمة الحسابات.");
  return result.access_token;
}
async function verifyDoctor(request, env) {
  if (!env.FIREBASE_API_KEY || !env.FIREBASE_SERVICE_ACCOUNT_JSON) return { error: "إعدادات الحسابات غير مكتملة.", status: 503 };
  const match = (request.headers.get("Authorization") || "").match(/^Bearer\s+(\S+)$/i);
  if (!match || match[1].length > 8192) return { error: "يلزم تسجيل الدخول.", status: 401 };
  const response = await fetch(LOOKUP_URL + "?key=" + encodeURIComponent(env.FIREBASE_API_KEY), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: match[1] })
  });
  if (!response.ok) return { error: "جلسة الدخول غير صالحة.", status: 401 };
  const result = await response.json(), user = result.users?.[0];
  if (!user?.localId) return { error: "تعذر التحقق من الحساب.", status: 401 };
  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (account.project_id !== EXPECTED_PROJECT_ID || !account.client_email || !account.private_key) return { error: "إعدادات الحسابات غير صحيحة.", status: 503 };
  const token = await accessToken(account);
  if (user.localId === DOCTOR_ADMIN_UID) return { account, token, accountType:"doctor", permission:"edit" };
  let staffDoc;
  try { staffDoc = await fsRequest(account.project_id, token, "/clinicStaff/" + encodeURIComponent(user.localId)); }
  catch { return { error:"الحساب غير مصرح له بحسابات اليوم.", status:403 }; }
  const fields = staffDoc?.fields || {}, permission = fields.permissions?.mapValue?.fields?.accounts?.stringValue || "none";
  if (fields.active?.booleanValue !== true || fields.role?.stringValue !== "staff" || !["view","edit"].includes(permission)) return { error:"لم يمنحك الدكتور صلاحية الوصول إلى حسابات اليوم.", status:403 };
  return { account, token, accountType:"staff", permission };
}
function fsUrl(projectId, path = "") {
  return "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(projectId) + "/databases/(default)/documents" + path;
}
async function fsRequest(projectId, token, path, options = {}) {
  const response = await fetch(fsUrl(projectId, path), { ...options, headers: {
    Authorization: "Bearer " + token, "Content-Type": "application/json", ...(options.headers || {})
  }});
  if (!response.ok) {
    const details = await response.text();
    console.error("Account records Firestore error:", response.status, details.slice(0, 500));
    throw new Error("تعذر حفظ أو تحميل بيانات الحسابات.");
  }
  if (response.status === 204) return null;
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}
const str = value => ({ stringValue: String(value ?? "") });
const read = (fields, key) => fields?.[key]?.stringValue || "";
function decode(doc) {
  const f = doc.fields || {};
  return { id: doc.name.split("/").pop(), type: read(f,"type"), name: read(f,"name"), kind: read(f,"kind"),
    categoryId: read(f,"categoryId"), personName: read(f,"personName"), amount: read(f,"amount"),
    date: read(f,"date"), notes: read(f,"notes"), createdAt: read(f,"createdAt"), updatedAt: read(f,"updatedAt") };
}
function encode(record) {
  const fields = {};
  for (const key of ["type","name","kind","categoryId","personName","amount","date","notes","createdAt","updatedAt"]) fields[key] = str(record[key]);
  return { fields };
}
async function listRecords(projectId, token) {
  const result = await fsRequest(projectId, token, ":runQuery", { method: "POST", body: JSON.stringify({ structuredQuery: { from: [{ collectionId: COLLECTION }] } }) });
  return (Array.isArray(result) ? result : []).filter(x => x.document).map(x => decode(x.document));
}
function cleanString(value, max) { return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max; }
export async function onRequestPost({ request, env }) {
  let data;
  try {
    const raw = await request.text();
    if (raw.length > 12000) return jsonResponse({ message: "حجم الطلب أكبر من المسموح." }, 413);
    data = JSON.parse(raw);
  } catch { return jsonResponse({ message: "صيغة الطلب غير صحيحة." }, 400); }
  let verified;
  try { verified = await verifyDoctor(request, env); }
  catch (error) { console.error("Accounts authorization error:", error); return jsonResponse({ message: "تعذر التحقق من صلاحية الدكتور." }, 503); }
  if (verified.error) return jsonResponse({ message: verified.error }, verified.status);
  const projectId = verified.account.project_id, token = verified.token;
  if (["list","createCategory","createEntry"].includes(data.action) && verified.accountType !== "doctor") return jsonResponse({ message:"هذه الوظيفة متاحة للدكتور فقط." },403);
  if (data.action === "createDailyExpense" && verified.permission !== "edit") return jsonResponse({ message:"لا تملك صلاحية تسجيل المصروفات." },403);
  try {
    if (data.action === "listDailyExpenses") {
      const date = String(data.date || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T12:00:00"))) return jsonResponse({ message:"التاريخ غير صحيح." },400);
      const records = await listRecords(projectId, token);
      const expenses = records.filter(x => x.type === "dailyExpense" && x.date === date).map(x => ({ id:x.id, description:x.personName, amount:x.amount, date:x.date, notes:x.notes, createdAt:x.createdAt }));
      return jsonResponse({ expenses, date });
    }
    if (data.action === "createDailyExpense") {
      const entry = data.entry || {}, description = String(entry.description || "").trim(), date = String(entry.date || ""), notes = String(entry.notes || "").trim(), amount = String(entry.amount ?? "");
      if (!cleanString(description,160) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T12:00:00")) || !/^\d{1,8}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || notes.length > 500) return jsonResponse({ message:"راجع وصف المصروف والمبلغ والتاريخ." },400);
      const now = new Date().toISOString();
      const result = await fsRequest(projectId, token, "/" + COLLECTION, { method:"POST", body:JSON.stringify(encode({ type:"dailyExpense", personName:description, amount, date, notes, createdAt:now, updatedAt:now })) });
      return jsonResponse({ expense:decode(result) },201);
    }
    if (data.action === "list") {
      const records = await listRecords(projectId, token);
      return jsonResponse({ categories: records.filter(x => x.type === "category"), entries: records.filter(x => x.type === "entry") });
    }
    if (data.action === "createCategory") {
      const name = String(data.name || "").trim(), kind = data.kind;
      if (!cleanString(name, 80) || !["income","expense"].includes(kind)) return jsonResponse({ message: "أدخل اسم القسم وحدد إن كان دخلًا أو مصروفًا." }, 400);
      const now = new Date().toISOString();
      const result = await fsRequest(projectId, token, "/" + COLLECTION, { method: "POST", body: JSON.stringify(encode({ type:"category", name, kind, createdAt:now, updatedAt:now })) });
      return jsonResponse({ category: decode(result) }, 201);
    }
    if (data.action === "createEntry") {
      const entry = data.entry || {}, categoryId = String(entry.categoryId || "");
      const personName = String(entry.personName || "").trim(), date = String(entry.date || ""), notes = String(entry.notes || "").trim();
      const amount = String(entry.amount ?? "");
      if (!/^[A-Za-z0-9_-]{1,150}$/.test(categoryId) || !cleanString(personName,120) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T12:00:00")) ||
          !/^\d{1,8}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || notes.length > 1000) {
        return jsonResponse({ message: "راجع البيان والقيمة والتاريخ والملاحظات." }, 400);
      }
      const builtIn = categoryId === "employee-salaries";
      const categories = builtIn ? [] : (await listRecords(projectId, token)).filter(x => x.type === "category" && x.id === categoryId);
      if (!builtIn && !categories.length) return jsonResponse({ message: "قسم الحسابات المحدد غير موجود." }, 404);
      const kind = builtIn ? "expense" : categories[0].kind;
      const now = new Date().toISOString();
      const result = await fsRequest(projectId, token, "/" + COLLECTION, { method: "POST", body: JSON.stringify(encode({
        type:"entry", categoryId, kind, personName, amount, date, notes, createdAt:now, updatedAt:now
      }))});
      return jsonResponse({ entry: decode(result) }, 201);
    }
    return jsonResponse({ message: "الإجراء المطلوب غير معروف." }, 400);
  } catch (error) {
    console.error("Accounts request failed:", error);
    return jsonResponse({ message: error.message || "تعذر تنفيذ العملية." }, 500);
  }
}
export async function onRequest(context) {
  if (context.request.method !== "POST") return new Response(null, { status:405, headers:{ Allow:"POST", "Cache-Control":"no-store" } });
  return onRequestPost(context);
}
