import { publishClinicRealtime } from "../_shared/realtime.js";

const DOCTOR_ADMIN_UID = "8fUdGutQHRau3RXQIrRtZUqQ9Nm1";
const EXPECTED_PROJECT_ID = "clinics-manger";
const SETTINGS_DOCUMENT = "clinicSettings/current";
const LOGS_COLLECTION = "clinicLogs";
const STAFF_COLLECTION = "clinicStaff";
const FIREBASE_LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const LOG_RETENTION_DAYS = 30;
const MAX_BODY_LENGTH = 50000;

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  }});
}
function str(value) { return { stringValue: String(value ?? "") }; }
function ts(value) { return { timestampValue: value }; }
function decodeValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
  return null;
}
function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)]));
}
function b64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64text(value) { return b64url(new TextEncoder().encode(value)); }
function privateKeyBytes(pem) {
  const base64 = String(pem || "").replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s/g, "");
  const binary = atob(base64), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function parseServiceAccount(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error("Missing service account.");
  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (!account.client_email || !account.private_key || !account.project_id || account.project_id !== EXPECTED_PROJECT_ID) throw new Error("Invalid service account.");
  return account;
}
async function createGoogleAccessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = [b64text(JSON.stringify({ alg: "RS256", typ: "JWT" })), b64text(JSON.stringify({
    iss: account.client_email, scope: GOOGLE_SCOPE, aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3600
  }))].join(".");
  const key = await crypto.subtle.importKey("pkcs8", privateKeyBytes(account.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: unsigned + "." + b64url(new Uint8Array(signature)) })
  });
  if (!tokenResponse.ok) throw new Error("Google access token unavailable.");
  const token = (await tokenResponse.json()).access_token;
  if (!token) throw new Error("Google access token missing.");
  return token;
}
async function firestoreRequest(projectId, token, path, options = {}) {
  const url = "https://firestore.googleapis.com/v1/projects/" + projectId + "/databases/(default)/documents" + path;
  const result = await fetch(url, {
    method: options.method || "GET",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    ...(options.body ? { body: options.body } : {})
  });
  const text = await result.text();
  let parsed = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch {}
  if (!result.ok) {
    const error = new Error("Firestore request failed.");
    error.status = result.status;
    error.details = parsed;
    throw error;
  }
  return parsed;
}
async function verifyUser(request, env) {
  if (!env.FIREBASE_API_KEY) return { ok: false, status: 503, message: "إعدادات التحقق غير مكتملة على الخادم." };
  const match = (request.headers.get("Authorization") || "").match(/^Bearer\s+(\S+)$/i);
  if (!match || match[1].length > 8192) return { ok: false, status: 401, message: "يلزم تسجيل الدخول." };
  const check = await fetch(FIREBASE_LOOKUP_URL + "?key=" + encodeURIComponent(env.FIREBASE_API_KEY), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: match[1] })
  });
  if (!check.ok) return { ok: false, status: 401, message: "جلسة الدخول غير صالحة." };
  const user = (await check.json()).users?.[0];
  if (!user?.localId) return { ok: false, status: 401, message: "جلسة الدخول غير صالحة." };
  if (user.localId === DOCTOR_ADMIN_UID) return { ok: true, accountType: "doctor", uid: user.localId, displayName: "الدكتور", permission: "edit" };
  const account = parseServiceAccount(env);
  const token = await createGoogleAccessToken(account);
  let doc;
  try { doc = await firestoreRequest(account.project_id, token, "/" + STAFF_COLLECTION + "/" + encodeURIComponent(user.localId)); }
  catch (error) {
    if (error.status === 404) return { ok: false, status: 403, message: "هذا الحساب ليس حساب موظف نشطًا." };
    throw error;
  }
  const fields = doc.fields || {};
  const role = fields.role?.stringValue || "";
  const active = fields.active?.booleanValue !== false;
  const permissions = decodeFields(fields.permissions?.mapValue?.fields || {});
  if (role !== "staff" || !active) return { ok: false, status: 403, message: "هذا الحساب ليس حساب موظف نشطًا." };
  return { ok: true, accountType: "staff", uid: user.localId, displayName: fields.displayName?.stringValue || user.email || "موظف", permission: permissions.settings || "none" };
}
function validSettings(settings) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings) || JSON.stringify(settings).length > 40000) return false;
  if (settings.clinic?.id && settings.clinic.id !== "reDa-elSherbiny-clinic") return false;
  if (settings.branding && typeof settings.branding === "object") {
    for (const key of ["background", "surface", "accent", "secondary"]) {
      if (settings.branding[key] !== undefined && (typeof settings.branding[key] !== "string" || !/^#[0-9a-fA-F]{6}$/.test(settings.branding[key]))) return false;
    }
  }
  if (settings.services && (!Array.isArray(settings.services.items) || settings.services.items.length > 100)) return false;
  if (settings.services?.items) {
    const ids = new Set();
    for (const item of settings.services.items) {
      if (!item || typeof item !== "object" || typeof item.id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(item.id) ||
          typeof item.title !== "string" || !item.title.trim() || item.title.length > 120 ||
          typeof item.description !== "string" || item.description.length > 500 ||
          typeof item.icon !== "string" || item.icon.length > 12) return false;
      if (ids.has(item.id)) return false;
      ids.add(item.id);
    }
  }
  if (settings.statuses && typeof settings.statuses !== "object") return false;
  if (settings.statuses) for (const [key, item] of Object.entries(settings.statuses)) {
    if (!/^[a-z_]{2,30}$/.test(key) || !item || typeof item.label !== "string" || !item.label.trim() ||
        item.label.length > 60 || typeof item.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(item.color)) return false;
  }
  return true;
}
async function getSettings(projectId, token) {
  try {
    const doc = await firestoreRequest(projectId, token, "/" + SETTINGS_DOCUMENT);
    const fields = doc.fields || {};
    const raw = fields.settingsJson?.stringValue || "";
    return { settings: raw ? JSON.parse(raw) : null, updatedAt: fields.updatedAt?.timestampValue || null };
  } catch (error) {
    if (error.status === 404) return { settings: null, updatedAt: null };
    throw error;
  }
}
async function saveSettings(projectId, token, uid, settings) {
  const now = new Date().toISOString();
  const fields = { settingsJson: str(JSON.stringify(settings)), updatedAt: ts(now), updatedByUid: str(uid) };
  const query = "?updateMask.fieldPaths=settingsJson&updateMask.fieldPaths=updatedAt&updateMask.fieldPaths=updatedByUid";
  await firestoreRequest(projectId, token, "/" + SETTINGS_DOCUMENT + query, { method: "PATCH", body: JSON.stringify({ fields }) });
  return { settings, updatedAt: now };
}
function safeText(value, max = 240) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max) : "";
}
let ttlAttempted = false;
let ttlEnabled = null;
async function ensureLogTtl(projectId, token) {
  if (ttlAttempted) return ttlEnabled;
  ttlAttempted = true;
  const url = "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(projectId) +
    "/databases/(default)/collectionGroups/" + LOGS_COLLECTION + "/fields/expiresAt?updateMask=ttlConfig";
  try {
    const result = await fetch(url, {
      method: "PATCH",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ ttlConfig: {} })
    });
    if (result.ok) {
      ttlEnabled = true;
      return true;
    }
    const details = await result.text();
    console.error("Firestore TTL configuration unavailable:", result.status, details.slice(0, 300));
    ttlEnabled = false;
    return false;
  } catch (error) {
    console.error("Firestore TTL configuration request failed:", error.message);
    ttlEnabled = false;
    return false;
  }
}
let lastCleanupAttemptAt = 0;
async function cleanupExpiredLogs(projectId, token) {
  const nowMs = Date.now();
  if (ttlEnabled === true || nowMs - lastCleanupAttemptAt < 6 * 60 * 60 * 1000) return;
  lastCleanupAttemptAt = nowMs;
  const query = {
    structuredQuery: {
      from: [{ collectionId: LOGS_COLLECTION }],
      where: { fieldFilter: { field: { fieldPath: "expiresAt" }, op: "LESS_THAN_OR_EQUAL", value: { timestampValue: new Date().toISOString() } } },
      orderBy: [{ field: { fieldPath: "expiresAt" }, direction: "ASCENDING" }],
      limit: 100
    }
  };
  const rows = await firestoreRequest(projectId, token, ":runQuery", { method: "POST", body: JSON.stringify(query) });
  const documents = (Array.isArray(rows) ? rows : []).filter(row => row.document).map(row => row.document);
  await Promise.all(documents.map(async doc => {
    const id = doc.name.split("/").pop();
    try { await firestoreRequest(projectId, token, "/" + LOGS_COLLECTION + "/" + encodeURIComponent(id), { method: "DELETE" }); }
    catch (error) { console.error("Expired audit log cleanup failed:", error.status || "server"); }
  }));
}
async function writeLog(projectId, token, actor, input) {
  try { await cleanupExpiredLogs(projectId, token); } catch (error) { console.error("Expired audit log cleanup unavailable:", error.status || "server"); }
  const allowedLevels = ["info", "warning", "error", "security"];
  const now = new Date(), expires = new Date(now.getTime() + LOG_RETENTION_DAYS * 86400000);
  const record = {
    actorUid: actor.uid, actorName: safeText(actor.displayName, 100), actorType: actor.accountType,
    action: safeText(input.action, 80) || "event", area: safeText(input.area, 80) || "unknown",
    level: allowedLevels.includes(input.level) ? input.level : "info",
    message: safeText(input.message, 500), targetType: safeText(input.targetType, 60), targetId: safeText(input.targetId, 100),
    createdAt: now.toISOString(), expiresAt: expires.toISOString()
  };
  const fields = Object.fromEntries(Object.entries(record).map(([key, value]) => [key, key === "createdAt" || key === "expiresAt" ? ts(value) : str(value)]));
  const doc = await firestoreRequest(projectId, token, "/" + LOGS_COLLECTION, { method: "POST", body: JSON.stringify({ fields }) });
  return { id: doc.name?.split("/").pop() || "", ...record };
}
async function listLogs(projectId, token, input) {
  try { await cleanupExpiredLogs(projectId, token); } catch (error) { console.error("Expired audit log cleanup unavailable:", error.status || "server"); }
  const limit = Math.min(1000, Math.max(1, Number.isInteger(input.limit) ? input.limit : 1000));
  const query = { structuredQuery: { from: [{ collectionId: LOGS_COLLECTION }], where: { fieldFilter: { field: { fieldPath: "expiresAt" }, op: "GREATER_THAN", value: { timestampValue: new Date().toISOString() } } }, orderBy: [{ field: { fieldPath: "expiresAt" }, direction: "DESCENDING" }], limit } };
  const rows = await firestoreRequest(projectId, token, ":runQuery", { method: "POST", body: JSON.stringify(query) });
  return (Array.isArray(rows) ? rows : []).filter(row => row.document).map(row => {
    const doc = row.document;
    return { id: doc.name.split("/").pop(), ...decodeFields(doc.fields || {}) };
  }).filter(row => !row.expiresAt || Date.parse(row.expiresAt) > Date.now());
}
async function onRequestGet({ env }) {
  try {
    const account = parseServiceAccount(env), token = await createGoogleAccessToken(account);
    return response(await getSettings(account.project_id, token));
  } catch (error) {
    console.error("Clinic settings read failed:", error.status || "server", error.message);
    return response({ message: "تعذر تحميل إعدادات العيادة حاليًا." }, 503);
  }
}
async function onRequestPost({ request, env }) {
  if (!env.FIREBASE_API_KEY || !env.FIREBASE_SERVICE_ACCOUNT_JSON) return response({ message: "إعدادات العيادة غير مكتملة على الخادم." }, 503);
  if (Number(request.headers.get("Content-Length") || 0) > MAX_BODY_LENGTH) return response({ message: "حجم الطلب أكبر من المسموح." }, 413);
  if (!(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) return response({ message: "نوع الطلب غير مدعوم." }, 415);
  let input;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_LENGTH) return response({ message: "حجم الطلب أكبر من المسموح." }, 413);
    input = JSON.parse(raw);
  } catch { return response({ message: "بيانات الطلب غير صحيحة." }, 400); }
  if (!input || typeof input !== "object" || Array.isArray(input)) return response({ message: "صيغة الطلب غير صحيحة." }, 400);
  let actor;
  try { actor = await verifyUser(request, env); }
  catch (error) {
    console.error("Clinic management authorization failed:", error.status || "server", error.message);
    return response({ message: "تعذر التحقق من الحساب." }, 503);
  }
  if (!actor.ok) return response({ message: actor.message }, actor.status);
  let account, token;
  try { account = parseServiceAccount(env); token = await createGoogleAccessToken(account); }
  catch (error) {
    console.error("Clinic management service setup failed:", error.message);
    return response({ message: "تعذر الاتصال بخدمة البيانات الآمنة." }, 503);
  }
  try {
    if (input.action === "saveSettings") {
      if (actor.accountType !== "doctor") return response({ message: "تعديل إعدادات العيادة متاح للدكتور فقط." }, 403);
      if (!validSettings(input.settings)) return response({ message: "راجع إعدادات العيادة؛ توجد بيانات غير صحيحة أو أكبر من المسموح." }, 400);
      const saved = await saveSettings(account.project_id, token, actor.uid, input.settings);
      await writeLog(account.project_id, token, actor, { action: "settings_saved", area: "clinic_settings", level: "info", message: "تم حفظ إعدادات العيادة." });
      return response(saved);
    }
    if (input.action === "listLogs") {
      if (actor.accountType !== "doctor") return response({ message: "سجل الأحداث متاح للدكتور فقط." }, 403);
      const ttlActive = await ensureLogTtl(account.project_id, token);
      return response({ logs: await listLogs(account.project_id, token, input), retentionDays: LOG_RETENTION_DAYS, ttlEnabled: ttlActive });
    }
    if (input.action === "recordLog") {
      const allowedActions = ["page_opened", "booking_created", "booking_updated", "booking_status_changed", "booking_cancelled", "payment_updated", "patient_created", "medical_record_saved", "request_failed", "settings_saved", "login_failed", "employee_created", "expense_recorded", "settlement_closed"];
      const log = input.log || {}, action = safeText(log.action, 80);
      if (!allowedActions.includes(action)) return response({ message: "نوع الحدث غير مسموح بتسجيله." }, 400);
      if (actor.accountType !== "doctor" && ["settings_saved", "employee_created", "settlement_closed"].includes(action)) return response({ message: "لا تملك صلاحية تسجيل هذا النوع من الأحداث." }, 403);
      return response({ log: await writeLog(account.project_id, token, actor, { ...log, action, message: safeText(log.message, 500) }) }, 201);
    }
    return response({ message: "الإجراء المطلوب غير معروف." }, 400);
  } catch (error) {
    console.error("Clinic management request failed:", error.status || "server", error.message);
    return response({ message: "حدث خطأ أثناء معالجة طلب العيادة." }, 500);
  }
}
export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") {
    let input = {};
    try { input = await context.request.clone().json(); } catch {}
    const result = await onRequestPost(context);
    let event = "";
    if (result.ok && input.action === "saveSettings") event = "clinic_settings_changed";
    if (event) {
      const notification = publishClinicRealtime(context.env, event);
      if (typeof context.waitUntil === "function") context.waitUntil(notification);
      else void notification;
    }
    return result;
  }
  return new Response(null, { status: 405, headers: { Allow: "GET, POST", "Cache-Control": "no-store" } });
}
