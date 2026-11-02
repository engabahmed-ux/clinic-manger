import { getClinicDatabase, d1Batch, d1First } from "../../_shared/d1.js";

const DOCTOR_UID = "8fUdGutQHRau3RXQIrRtZUqQ9Nm1";
const PROJECT_ID = "clinics-manger";
const LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const DOCUMENTS_URL = "https://firestore.googleapis.com/v1/projects/" + PROJECT_ID + "/databases/(default)/documents";

const COLLECTIONS = {
  clinicStaff: { table: "staff", key: "uid", columns: ["uid","email","display_name","role","active","permissions_json","expense_mode","created_at","updated_at","source_payload_json"] },
  clinicBookings: { table: "bookings", key: "id", columns: ["id","patient_name","patient_id","patient_phone","blood_pressure","weight","blood_sugar","pre_visit_notes","appointment_date","service","service_price","paid_amount","completed_fee","completed_at","completed_by_uid","completed_by_name","payment_entered_by_uid","payment_entered_by_name","payment_updated_at","reschedule_history_json","archived_reschedule_history_json","queue_number","is_archived","archived_at","archived_by_uid","archived_by_name","notes","status","created_at","updated_at","source_payload_json"] },
  clinicPatients: { table: "patient_accounts", key: "uid", columns: ["uid","role","active","patient_id","display_name","email","phone","username","username_key","created_at","updated_at","source_payload_json"] },
  clinicPatientUsernames: { table: "patient_usernames", key: "username_key", columns: ["username_key","uid","email","username","active","created_at","source_payload_json"] },
  clinicMedicalPatients: { table: "medical_patients", key: "id", columns: ["id","patient_number","display_name","phone","gender","birth_date","notes","created_at","updated_at","source_payload_json"] },
  clinicMedicalVisits: { table: "medical_visits", key: "id", columns: ["id","patient_id","booking_id","visit_date","queue_number","blood_pressure","weight","blood_sugar","pre_visit_notes","diagnosis","clinical_notes","treatment","follow_up","follow_up_notes","follow_up_days","follow_up_date","created_at","updated_at","created_by_name","source_payload_json"] },
  clinicAccountRecords: { table: "account_records", key: "id", columns: ["id","record_type","name","kind","category_id","person_name","amount","date","notes","created_at","updated_at","status","entered_by","entered_by_name","approved_by","approved_by_name","approved_at","reviewed_by","reviewed_by_name","reviewed_at","rejection_reason","period_type","period_key","employee_uid","employee_name","closed_by","closed_by_name","closed_at","total_receipts","total_expenses","net_total","booking_count","payload_json"] },
  clinicLogs: { table: "clinic_logs", key: "id", columns: ["id","actor_uid","actor_name","actor_type","action","area","level","message","target_type","target_id","created_at","expires_at","source_payload_json"] }
};

function json(body, status = 200) {
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
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64text(value) { return b64url(new TextEncoder().encode(value)); }
function privateKeyBytes(pem) {
  const raw = atob(pem.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s/g, ""));
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}
function parseServiceAccount(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error("Service account unavailable.");
  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (account.project_id !== PROJECT_ID || !account.client_email || !account.private_key) throw new Error("Invalid service account.");
  return account;
}
async function googleAccessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = [
    b64text(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    b64text(JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }))
  ].join(".");
  const key = await crypto.subtle.importKey("pkcs8", privateKeyBytes(account.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: unsigned + "." + b64url(new Uint8Array(signature)) })
  });
  if (!response.ok) throw new Error("Google access token request failed.");
  const result = await response.json();
  if (!result.access_token) throw new Error("Google access token missing.");
  return result.access_token;
}
async function verifyDoctor(request, env) {
  if (!env.FIREBASE_API_KEY) return { ok: false, status: 503 };
  const match = (request.headers.get("Authorization") || "").match(/^Bearer\s+(\S+)$/i);
  if (!match || match[1].length > 8192) return { ok: false, status: 401 };
  const response = await fetch(LOOKUP_URL + "?key=" + encodeURIComponent(env.FIREBASE_API_KEY), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: match[1] })
  });
  if (!response.ok) return { ok: false, status: 401 };
  const result = await response.json();
  if (result.users?.[0]?.localId !== DOCTOR_UID) return { ok: false, status: 403 };
  return { ok: true };
}
function decodeValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("referenceValue" in value) return value.referenceValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
  return null;
}
function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)]));
}
function camel(snake) { return snake.replace(/_([a-z])/g, (_, char) => char.toUpperCase()); }
function rawField(payload, column) {
  const aliases = {
    record_type: ["recordType", "type"],
    person_name: ["personName", "person"],
    employee_uid: ["employeeUid", "employeeId"],
    employee_name: ["employeeName"],
    is_archived: ["isArchived", "archived"],
    completed_fee: ["completedFee"],
    completed_at: ["completedAt"],
    completed_by_uid: ["completedByUid"],
    completed_by_name: ["completedByName"],
    payment_entered_by_uid: ["paymentEnteredByUid"],
    payment_entered_by_name: ["paymentEnteredByName"],
    payment_updated_at: ["paymentUpdatedAt"],
    reschedule_history_json: ["rescheduleHistory", "rescheduleHistoryJson"],
    archived_reschedule_history_json: ["archivedRescheduleHistory", "archivedRescheduleHistoryJson"],
    settings_json: ["settings", "clinicSettings"]
  };
  for (const key of [camel(column), column, ...(aliases[column] || [])]) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) return payload[key];
  }
  return undefined;
}
function dbValue(column, value, payload, documentId) {
  if (column === "id" || column === "uid" || column === "username_key") {
    if (value !== undefined && value !== null && String(value) !== "") return String(value);
    return documentId;
  }
  if (column === "source_payload_json") return JSON.stringify(payload);
  if (column === "payload_json") {
    const original = rawField(payload, column);
    return typeof original === "string" ? original : JSON.stringify(original ?? payload);
  }
  if (column.endsWith("_json")) {
    if (value === undefined || value === null || value === "") {
      if (column.includes("history")) return "[]";
      return "{}";
    }
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  if (column === "active") return value === undefined ? 1 : (value === false || value === 0 ? 0 : 1);
  if (column === "is_archived") return value === true || value === 1 || value === "true" ? 1 : 0;
  if (value === undefined || value === null) {
    if (column === "status") return "pending";
    return "";
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function makeUpsert(config, documentId, payload) {
  const columns = config.columns;
  const values = columns.map(column => {
    const value = rawField(payload, column);
    return dbValue(column, value, payload, documentId);
  });
  const placeholders = columns.map(() => "?").join(", ");
  const updates = columns.filter(column => column !== config.key).map(column => column + "=excluded." + column).join(", ");
  const sql = "INSERT INTO " + config.table + " (" + columns.join(", ") + ") VALUES (" + placeholders + ") ON CONFLICT(" + config.key + ") DO UPDATE SET " + updates;
  return { sql, params: values };
}
async function fetchFirestorePage(token, collection, pageSize, pageToken) {
  const url = new URL(DOCUMENTS_URL + "/" + encodeURIComponent(collection));
  url.searchParams.set("pageSize", String(pageSize));
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  const response = await fetch(url.toString(), { headers: { Authorization: "Bearer " + token } });
  if (!response.ok) throw new Error("Firestore collection read failed.");
  return response.json();
}
async function migrationStatus(database) {
  const counts = await d1First(database,
    "SELECT " +
    "(SELECT COUNT(*) FROM bookings) AS bookings, " +
    "(SELECT COUNT(*) FROM staff) AS staff, " +
    "(SELECT COUNT(*) FROM patient_accounts) AS patient_accounts, " +
    "(SELECT COUNT(*) FROM patient_usernames) AS patient_usernames, " +
    "(SELECT COUNT(*) FROM medical_patients) AS medical_patients, " +
    "(SELECT COUNT(*) FROM medical_visits) AS medical_visits, " +
    "(SELECT COUNT(*) FROM account_records) AS account_records, " +
    "(SELECT COUNT(*) FROM clinic_logs) AS clinic_logs, " +
    "(SELECT COUNT(*) FROM clinic_settings) AS clinic_settings");
  return { database: "cloudflare-d1-preview", counts: counts || {}, collections: Object.keys(COLLECTIONS).concat(["clinicSettings/current"]) };
}

export async function onRequestPost({ request, env }) {
  if (request.method !== "POST") return json({ ok: false, message: "طريقة الطلب غير مدعومة." }, 405);
  if (env.D1_MIGRATION_ENABLED !== "true" || env.CF_PAGES_BRANCH !== "feature/cloudflare-d1-migration") {
    return json({ ok: false, message: "أداة النقل مفعّلة فقط في بيئة الاختبار." }, 404);
  }
  try {
    const auth = await verifyDoctor(request, env);
    if (!auth.ok) return json({ ok: false, message: auth.status === 403 ? "غير مصرح." : "يلزم تسجيل الدخول." }, auth.status);
    const body = await request.json();
    const action = body?.action;
    const database = getClinicDatabase(env);
    if (action === "status") return json({ ok: true, ...(await migrationStatus(database)) });
    if (action !== "import-page") return json({ ok: false, message: "إجراء غير مدعوم." }, 400);
    if (body.confirm !== "IMPORT_TO_D1_PREVIEW") return json({ ok: false, message: "يلزم تأكيد النقل إلى قاعدة الاختبار." }, 400);
    const collection = String(body.collection || "");
    const pageSize = Math.min(50, Math.max(1, Number(body.pageSize) || 25));
    const pageToken = typeof body.pageToken === "string" ? body.pageToken : "";
    const account = parseServiceAccount(env);
    const accessToken = await googleAccessToken(account);

    if (collection === "clinicSettings/current") {
      const response = await fetch(DOCUMENTS_URL + "/clinicSettings/current", { headers: { Authorization: "Bearer " + accessToken } });
      if (response.status === 404) return json({ ok: true, collection, imported: 0, done: true, note: "لم يوجد مستند إعدادات في المصدر." });
      if (!response.ok) throw new Error("Settings document read failed.");
      const document = await response.json();
      const payload = decodeFields(document.fields || {});
      await d1Batch(database, [{
        sql: "INSERT INTO clinic_settings (id, settings_json, updated_at, updated_by_uid) VALUES ('singleton', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET settings_json=excluded.settings_json, updated_at=excluded.updated_at, updated_by_uid=excluded.updated_by_uid",
        params: [JSON.stringify(payload), String(payload.updatedAt || ""), String(payload.updatedByUid || "")]
      }]);
      return json({ ok: true, collection, imported: 1, done: true });
    }

    const config = COLLECTIONS[collection];
    if (!config) return json({ ok: false, message: "المجموعة غير مسموح بنقلها." }, 400);
    const page = await fetchFirestorePage(accessToken, collection, pageSize, pageToken);
    const statements = (page.documents || []).map(document => {
      const documentId = String(document.name || "").split("/").pop();
      const payload = decodeFields(document.fields || {});
      return makeUpsert(config, documentId, payload);
    });
    if (statements.length) await d1Batch(database, statements);
    return json({
      ok: true,
      collection,
      imported: statements.length,
      done: !page.nextPageToken,
      nextPageToken: page.nextPageToken || null
    });
  } catch (error) {
    console.error("D1 migration page failed:", error);
    return json({ ok: false, message: "تعذر تنفيذ خطوة النقل. راجع إعدادات بيئة الاختبار والسجلات." }, 503);
  }
}
export async function onRequest(context) {
  if (context.request.method !== "POST") return json({ ok: false, message: "طريقة الطلب غير مدعومة." }, 405);
  return onRequestPost(context);
}
