import { getClinicDatabase, d1All, d1First, d1Run } from "../../_shared/d1.js";
import { publishClinicRealtime } from "../../_shared/realtime.js";

const DOCTOR_ADMIN_UID = "8fUdGutQHRau3RXQIrRtZUqQ9Nm1";
const EXPECTED_PROJECT_ID = "clinics-manger";
const STAFF_COLLECTION = "clinicStaff";
const BOOKINGS_COLLECTION = "clinicBookings";

const FIREBASE_LOOKUP_URL =
  "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

const STATUSES = ["pending", "confirmed", "waiting", "completed", "postponed", "no_show", "apologized", "cancelled", "archived"];

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

  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);

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

  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: account.client_email,
    scope: GOOGLE_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600
  };

  const unsigned = [
    encodeText(JSON.stringify(header)),
    encodeText(JSON.stringify(claims))
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
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
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

async function verifyFirebaseUser(request, env) {
  if (!env.FIREBASE_API_KEY) {
    return {
      ok: false,
      status: 503,
      message: "خدمة التحقق غير مهيأة على الخادم."
    };
  }

  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(\S+)$/i);

  if (!match || match[1].length > 8192) {
    return {
      ok: false,
      status: 401,
      message: "يلزم تسجيل الدخول."
    };
  }

  const response = await fetch(
    `${FIREBASE_LOOKUP_URL}?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: match[1] })
    }
  );

  if (!response.ok) {
    return {
      ok: false,
      status: 401,
      message: "جلسة الدخول غير صالحة. سجّل الدخول مجددًا."
    };
  }

  const result = await response.json();
  const user = result.users?.[0];

  if (!user?.localId) {
    return {
      ok: false,
      status: 401,
      message: "تعذر التحقق من الحساب."
    };
  }

  return {
    ok: true,
    uid: user.localId,
    email: user.email || ""
  };
}

function firestoreUrl(projectId, path = "") {
  return (
    "https://firestore.googleapis.com/v1/projects/" +
    `${encodeURIComponent(projectId)}/databases/(default)/documents${path}`
  );
}

async function firestoreRequest(projectId, accessToken, path, options = {}) {
  const response = await fetch(firestoreUrl(projectId, path), {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const details = await response.text();

    console.error(
      "Bookings Firestore request failed:",
      response.status,
      details.slice(0, 1000)
    );

    const error = new Error("تعذر الوصول إلى بيانات الحجوزات.");
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) return null;

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function stringField(value) {
  return { stringValue: String(value ?? "") };
}

function readString(fields, key) {
  return fields?.[key]?.stringValue || "";
}

function cairoDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function decodeBooking(document) {
  if (document?.fields) {
    const fields = document.fields || {};
    const id = (document.name || "").split("/").pop();
    return {
      id, patientName:readString(fields,"patientName"), patientId:readString(fields,"patientId"),
      bloodPressure:readString(fields,"bloodPressure"), weight:readString(fields,"weight"),
      bloodSugar:readString(fields,"bloodSugar"), preVisitNotes:readString(fields,"preVisitNotes"),
      patientPhone:readString(fields,"patientPhone"), appointmentDate:readString(fields,"appointmentDate"),
      service:readString(fields,"service"), servicePrice:readString(fields,"servicePrice"),
      paidAmount:readString(fields,"paidAmount"), completedFee:readString(fields,"completedFee"),
      completedAt:readString(fields,"completedAt"), completedByUid:readString(fields,"completedByUid"),
      completedByName:readString(fields,"completedByName"), paymentEnteredByUid:readString(fields,"paymentEnteredByUid"),
      paymentEnteredByName:readString(fields,"paymentEnteredByName"), paymentUpdatedAt:readString(fields,"paymentUpdatedAt"),
      rescheduleHistory:readString(fields,"rescheduleHistory"), archivedRescheduleHistory:readString(fields,"archivedRescheduleHistory"),
      queueNumber:readString(fields,"queueNumber"), isArchived:readString(fields,"isArchived")==="true",
      archivedAt:readString(fields,"archivedAt"), archivedByUid:readString(fields,"archivedByUid"),
      archivedByName:readString(fields,"archivedByName"), notes:readString(fields,"notes"),
      status:readString(fields,"status")||"pending", createdAt:readString(fields,"createdAt"), updatedAt:readString(fields,"updatedAt")
    };
  }
  let payload = {};
  try { payload = JSON.parse(document?.source_payload_json || "{}"); } catch {}
  const pick = (camel, snake, fallback = "") => payload[camel] ?? document?.[snake] ?? fallback;
  return {
    ...payload,
    id: document?.id || payload.id || "",
    patientName:pick("patientName","patient_name"), patientId:pick("patientId","patient_id"),
    bloodPressure:pick("bloodPressure","blood_pressure"), weight:pick("weight","weight"),
    bloodSugar:pick("bloodSugar","blood_sugar"), preVisitNotes:pick("preVisitNotes","pre_visit_notes"),
    patientPhone:pick("patientPhone","patient_phone"), appointmentDate:pick("appointmentDate","appointment_date"),
    service:pick("service","service"), servicePrice:pick("servicePrice","service_price","0"),
    paidAmount:pick("paidAmount","paid_amount","0"), completedFee:pick("completedFee","completed_fee"),
    completedAt:pick("completedAt","completed_at"), completedByUid:pick("completedByUid","completed_by_uid"),
    completedByName:pick("completedByName","completed_by_name"), paymentEnteredByUid:pick("paymentEnteredByUid","payment_entered_by_uid"),
    paymentEnteredByName:pick("paymentEnteredByName","payment_entered_by_name"), paymentUpdatedAt:pick("paymentUpdatedAt","payment_updated_at"),
    rescheduleHistory:pick("rescheduleHistory","reschedule_history_json","[]"),
    archivedRescheduleHistory:pick("archivedRescheduleHistory","archived_reschedule_history_json","[]"),
    queueNumber:pick("queueNumber","queue_number"), isArchived:Number(document?.is_archived)===1 || payload.isArchived===true,
    archivedAt:pick("archivedAt","archived_at"), archivedByUid:pick("archivedByUid","archived_by_uid"),
    archivedByName:pick("archivedByName","archived_by_name"), notes:pick("notes","notes"),
    status:pick("status","status","pending"), createdAt:pick("createdAt","created_at"), updatedAt:pick("updatedAt","updated_at")
  };
}

async function writeBooking(env, booking) {
  const database = getClinicDatabase(env);
  const payload = { ...booking, id: booking.id };
  const values = [
    booking.id, booking.patientName||"", booking.patientId||"", booking.patientPhone||"",
    booking.bloodPressure||"", booking.weight||"", booking.bloodSugar||"", booking.preVisitNotes||"",
    booking.appointmentDate||"", booking.service||"", booking.servicePrice||"0", booking.paidAmount||"0",
    booking.completedFee||"", booking.completedAt||"", booking.completedByUid||"", booking.completedByName||"",
    booking.paymentEnteredByUid||"", booking.paymentEnteredByName||"", booking.paymentUpdatedAt||"",
    booking.rescheduleHistory||"[]", booking.archivedRescheduleHistory||"[]", booking.queueNumber||"",
    booking.isArchived ? 1 : 0, booking.archivedAt||"", booking.archivedByUid||"", booking.archivedByName||"",
    booking.notes||"", booking.status||"pending", booking.createdAt||"", booking.updatedAt||"", JSON.stringify(payload)
  ];
  const sql = "INSERT INTO bookings (id,patient_name,patient_id,patient_phone,blood_pressure,weight,blood_sugar,pre_visit_notes,appointment_date,service,service_price,paid_amount,completed_fee,completed_at,completed_by_uid,completed_by_name,payment_entered_by_uid,payment_entered_by_name,payment_updated_at,reschedule_history_json,archived_reschedule_history_json,queue_number,is_archived,archived_at,archived_by_uid,archived_by_name,notes,status,created_at,updated_at,source_payload_json) VALUES ("+
    values.map(()=>"?").join(",")+") ON CONFLICT(id) DO UPDATE SET "+
    "patient_name=excluded.patient_name,patient_id=excluded.patient_id,patient_phone=excluded.patient_phone,blood_pressure=excluded.blood_pressure,weight=excluded.weight,blood_sugar=excluded.blood_sugar,pre_visit_notes=excluded.pre_visit_notes,appointment_date=excluded.appointment_date,service=excluded.service,service_price=excluded.service_price,paid_amount=excluded.paid_amount,completed_fee=excluded.completed_fee,completed_at=excluded.completed_at,completed_by_uid=excluded.completed_by_uid,completed_by_name=excluded.completed_by_name,payment_entered_by_uid=excluded.payment_entered_by_uid,payment_entered_by_name=excluded.payment_entered_by_name,payment_updated_at=excluded.payment_updated_at,reschedule_history_json=excluded.reschedule_history_json,archived_reschedule_history_json=excluded.archived_reschedule_history_json,queue_number=excluded.queue_number,is_archived=excluded.is_archived,archived_at=excluded.archived_at,archived_by_uid=excluded.archived_by_uid,archived_by_name=excluded.archived_by_name,notes=excluded.notes,status=excluded.status,created_at=excluded.created_at,updated_at=excluded.updated_at,source_payload_json=excluded.source_payload_json";
  await d1Run(database, sql, values);
  return { ...booking };
}

function encodeBooking(data) {
  const fields = {};

  for (const key of [
    "patientName",
    "patientId",
    "patientPhone",
    "bloodPressure",
    "weight",
    "bloodSugar",
    "preVisitNotes",
    "appointmentDate",
    "service",
    "servicePrice",
    "paidAmount",
    "completedFee",
    "completedAt",
    "completedByUid",
    "completedByName",
    "paymentEnteredByUid",
    "paymentEnteredByName",
    "paymentUpdatedAt",
    "rescheduleHistory",
    "archivedRescheduleHistory",
    "queueNumber",
    "isArchived",
    "archivedAt",
    "archivedByUid",
    "archivedByName",
    "notes",
    "status",
    "createdAt",
    "updatedAt"
  ]) {
    fields[key] = stringField(data[key]);
  }

  return { fields };
}

async function getAccountAccess(user, env) {
  if (user.uid === DOCTOR_ADMIN_UID) return {
    ok:true, accountType:"doctor", permission:"edit", accountsPermission:"edit", uid:user.uid, displayName:"الدكتور"
  };
  const database = getClinicDatabase(env);
  const row = await d1First(database,
    "SELECT role, active, display_name, permissions_json FROM staff WHERE uid = ? LIMIT 1", [user.uid]);
  if (!row || row.role !== "staff" || Number(row.active) !== 1) return {
    ok:false,status:403,message:"حساب الموظف غير نشط أو غير معتمد."
  };
  let permissions = {};
  try { permissions = JSON.parse(row.permissions_json || "{}"); } catch {}
  const permission = permissions.bookings || "none";
  const accountsPermission = permissions.accounts || "none";
  if (!["view","edit"].includes(permission) && !["view","edit"].includes(accountsPermission)) return {
    ok:false,status:403,message:"لم يمنحك الدكتور صلاحية الوصول إلى هذا القسم."
  };
  return {ok:true,accountType:"staff",permission,accountsPermission,uid:user.uid,displayName:row.display_name||""};
}

function validateBooking(data, partial = false) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "بيانات الحجز غير صحيحة.";
  }

  const allowed = [
    "patientName",
    "patientId",
    "patientPhone",
    "appointmentDate",
    "service",
    "servicePrice",
    "bloodPressure",
    "weight",
    "bloodSugar",
    "preVisitNotes",
    "notes",
    "status"
  ];

  if (Object.keys(data).some((key) => !allowed.includes(key))) {
    return "تم إرسال حقول غير معتمدة.";
  }

  for (const key of ["patientName", "patientPhone", "appointmentDate"]) {
    if (partial && !(key in data)) continue;

    if (typeof data[key] !== "string" || !data[key].trim()) {
      return "يرجى إدخال اسم المريضة ورقم الهاتف وموعد الحجز.";
    }

    if (data[key].length > 200) {
      return "أحد الحقول أطول من المسموح.";
    }
  }

  if (data.patientName && data.patientName.trim().length > 120) {
    return "اسم المريضة أطول من المسموح.";
  }

  if (data.patientPhone && data.patientPhone.trim().length > 40) {
    return "رقم الهاتف أطول من المسموح.";
  }

  if (
    data.appointmentDate &&
    (
      data.appointmentDate.length > 40 ||
      Number.isNaN(Date.parse(data.appointmentDate))
    )
  ) {
    return "تاريخ الحجز غير صحيح.";
  }

  if (data.service && data.service.length > 120) {
    return "اسم الخدمة أطول من المسموح.";
  }

  if (data.servicePrice !== undefined && data.servicePrice !== "" && (!/^\d{1,8}(\.\d{1,2})?$/.test(String(data.servicePrice)) || Number(data.servicePrice) < 0)) {
    return "قيمة الخدمة يجب أن تكون رقمًا موجبًا أو صفرًا وبحد أقصى منزلتين عشريتين.";
  }

  if (data.paidAmount !== undefined && data.paidAmount !== "" && (!/^\d{1,8}(\.\d{1,2})?$/.test(String(data.paidAmount)) || Number(data.paidAmount) < 0)) return "قيمة المبلغ المدفوع غير صحيحة.";

  for (const key of ["bloodPressure", "weight", "bloodSugar"]) {
    if (data[key] !== undefined && String(data[key]).length > 40) return "إحدى القياسات أطول من المسموح.";
  }
  if (data.preVisitNotes && data.preVisitNotes.length > 1000) return "ملاحظات ما قبل الكشف أطول من المسموح.";
  if (data.patientId && !/^[A-Za-z0-9_-]{1,150}$/.test(data.patientId)) return "رقم ملف المريض غير صحيح.";
  if (data.weight !== undefined && data.weight !== "" && (!/^\d{1,3}(\.\d{1,2})?$/.test(String(data.weight)) || Number(data.weight) < 0 || Number(data.weight) > 500)) return "قيمة الوزن غير صحيحة.";

  if (data.notes && data.notes.length > 2000) {
    return "الملاحظات أطول من المسموح.";
  }

  if (data.status && !STATUSES.includes(data.status)) {
    return "حالة الحجز غير صحيحة.";
  }

  return null;
}


async function listBookings(env) {
  const database = getClinicDatabase(env);
  const rows = await d1All(database, "SELECT * FROM bookings ORDER BY created_at ASC, id ASC");
  return rows.map(decodeBooking);
}
async function listArchivePage(env, cursor = null, pageSize = 10) {
  const all = await listBookings(env);
  const rows = [];
  const compactBooking = booking => {
    const { rescheduleHistory, archivedRescheduleHistory, ...compact } = booking;
    return compact;
  };
  for (const booking of all) {
    if (booking.isArchived || ["archived","cancelled"].includes(booking.status)) {
      rows.push({ ...compactBooking(booking), isArchivedOccurrence:false });
    }
    let history = [];
    try { history = JSON.parse(booking.archivedRescheduleHistory || "[]"); } catch {}
    if (!Array.isArray(history)) continue;
    for (const entry of history) {
      if (!entry || !/^\\d{4}-\\d{2}-\\d{2}$/.test(entry.fromDate||"") || !/^\\d{4}-\\d{2}-\\d{2}$/.test(entry.toDate||"")) continue;
      rows.push({ ...compactBooking(booking), appointmentDate:entry.fromDate,
        queueNumber:entry.fromQueueNumber||booking.queueNumber,status:"postponed",isArchived:true,
        isArchivedOccurrence:true,archivedAt:entry.archivedAt||"",archivedByUid:entry.archivedByUid||"",
        archivedByName:entry.archivedByName||"",rescheduleToDate:entry.toDate });
    }
  }
  rows.sort((a,b)=>(Date.parse(b.archivedAt||b.updatedAt||b.createdAt||"")||0)-(Date.parse(a.archivedAt||a.updatedAt||a.createdAt||"")||0));
  return { rows, nextCursor:null };
}
async function listBookingChanges(env, since) {
  const database = getClinicDatabase(env);
  const rows = await d1All(database, "SELECT * FROM bookings WHERE updated_at >= ? ORDER BY updated_at ASC, id ASC", [since]);
  return rows.map(decodeBooking);
}
async function listCompletedBookingsForDate(env, date) {
  const all = await listBookings(env);
  return all.filter(booking => booking.status === "completed" && cairoDate(booking.completedAt) === date);
}
async function isFinancialPeriodClosed(env, dateValue, employeeUid = "") {
  const date = String(dateValue || "").slice(0,10);
  if (!employeeUid || !/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) return false;
  const database = getClinicDatabase(env);
  const row = await d1First(database,
    "SELECT id FROM account_records WHERE record_type = 'settlement' AND employee_uid = ? AND ((period_type = 'day' AND period_key = ?) OR (period_type = 'month' AND period_key = ?)) LIMIT 1",
    [employeeUid, date, date.slice(0,7)]);
  return !!row;
}
async function normalizeQueueNumbersForDate(env, date, knownBookings = null) {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(date || ""))) return knownBookings || await listBookings(env);
  const database = getClinicDatabase(env);
  const all = knownBookings || await listBookings(env);
  const rows = all.filter(booking=>String(booking.appointmentDate||"").slice(0,10)===date)
    .sort((a,b)=>(Date.parse(a.createdAt||"")||0)-(Date.parse(b.createdAt||"")||0)||a.id.localeCompare(b.id));
  let max=0;
  for(const booking of all){
    if(String(booking.appointmentDate||"").slice(0,10)===date) max=Math.max(max,Number(booking.queueNumber)||0);
    for(const entry of historyForBooking(booking)){
      if(entry.fromDate===date) max=Math.max(max,Number(entry.fromQueueNumber)||0);
      if(entry.toDate===date) max=Math.max(max,Number(entry.toQueueNumber)||0);
    }
  }
  const used=new Set();
  for(const booking of rows){
    const current=Number(booking.queueNumber);
    if(Number.isInteger(current)&&current>0&&!used.has(current)){used.add(current);continue;}
    do{max++;}while(used.has(max));
    booking.queueNumber=String(max);
    booking.updatedAt=booking.updatedAt||new Date().toISOString();
    await writeBooking(env,booking);
    used.add(max);
  }
  return all;
}
async function createBooking(env, data) {
  const now=new Date().toISOString(), date=String(data.appointmentDate||"").slice(0,10);
  const existing=await normalizeQueueNumbersForDate(env,date);
  const queueNumber=nextQueueNumberForDate(existing,date);
  const booking={...data, id:crypto.randomUUID(), queueNumber:String(queueNumber),
    patientName:data.patientName.trim(),patientPhone:data.patientPhone.trim(),
    appointmentDate:data.appointmentDate.trim(),service:(data.service||"").trim(),
    notes:(data.notes||"").trim(),status:"waiting",createdAt:now,updatedAt:now,
    isArchived:false,archivedAt:"",archivedByUid:"",archivedByName:"",
    paidAmount:data.paidAmount||"0",completedFee:"",completedAt:"",completedByUid:"",
    completedByName:"",paymentEnteredByUid:"",paymentEnteredByName:"",paymentUpdatedAt:"",
    rescheduleHistory:"[]",archivedRescheduleHistory:"[]"};
  return writeBooking(env,booking);
}

function historyForBooking(booking) {
  try {
    const history = JSON.parse(booking.rescheduleHistory || "[]");
    return Array.isArray(history) ? history.filter(item => item && typeof item.fromDate === "string" && typeof item.toDate === "string") : [];
  } catch { return []; }
}

function currentQueueNumberForDate(bookings, booking, date) {
  if (String(booking.appointmentDate || "").slice(0, 10) !== date) return 0;
  if (Number(booking.queueNumber) > 0) return Number(booking.queueNumber);
  const rows = bookings.filter(item => String(item.appointmentDate || "").slice(0, 10) === date).sort((a, b) => (Date.parse(a.createdAt || "") || 0) - (Date.parse(b.createdAt || "") || 0));
  return rows.findIndex(item => item.id === booking.id) + 1;
}

function nextQueueNumberForDate(bookings, date) {
  if (!date) return 1;
  let max = 0;
  for (const booking of bookings) {
    if (String(booking.appointmentDate || "").slice(0, 10) === date) {
      max = Math.max(max, currentQueueNumberForDate(bookings, booking, date));
    }
    for (const entry of historyForBooking(booking)) {
      if (entry.fromDate === date) max = Math.max(max, Number(entry.fromQueueNumber) || 0);
      if (entry.toDate === date) max = Math.max(max, Number(entry.toQueueNumber) || 0);
    }
  }
  return max + 1;
}

async function updateBooking(env, data, actorUid = "", actorAccountType = "doctor", actorDisplayName = "") {
  if (
    typeof data.id !== "string" ||
    !/^[A-Za-z0-9_-]{1,150}$/.test(data.id)
  ) {
    throw new Error("رقم الحجز غير صحيح.");
  }

  const changes = { ...data };
  delete changes.action;
  delete changes.id;

  const error = validateBooking(changes, true);
  if (error) throw new Error(error);

  const database = getClinicDatabase(env);
  const current = await d1First(database, "SELECT * FROM bookings WHERE id = ? LIMIT 1", [data.id]);
  if (!current) { const error = new Error("الحجز غير موجود."); error.status = 404; throw error; }
  const existing = decodeBooking(current);
  if (existing.status === "completed") {
    throw new Error("حالة «تم الكشف» نهائية؛ لا يمكن تعديل حالة الحجز أو بياناته بعد اعتماد الكشف.");
  }
  const financialFields = ["appointmentDate","servicePrice","paidAmount","status"];
  const changesFinancialFields = financialFields.some(key => changes[key] !== undefined);
  if (
    actorAccountType === "staff" &&
    changesFinancialFields &&
    !existing.paymentEnteredByUid &&
    Number(existing.paidAmount) > 0
  ) {
    throw new Error("هذا الحجز يحتوي على مبلغ سابق غير منسوب لموظف. يلزم أن يراجعه الدكتور قبل تعديل بياناته المالية.");
  }
  let closedPeriodForUnpaidCompletion = false;
  if (changesFinancialFields) {
    const dates = new Set([
      String(existing.appointmentDate || "").slice(0,10),
      String(changes.appointmentDate ?? existing.appointmentDate ?? "").slice(0,10)
    ].filter(Boolean));
    const ownerUid = existing.paymentEnteredByUid || (actorAccountType === "staff" && changes.status === "completed" ? actorUid : "");
    if (ownerUid) {
      for (const date of dates) {
        if (await isFinancialPeriodClosed(env, date, ownerUid)) {
          const isUnpaidStatusOnlyCompletion =
            actorAccountType === "staff" &&
            changes.status === "completed" &&
            Object.keys(changes).every(key => key === "status") &&
            !(Number(existing.paidAmount) > 0) &&
            !existing.paymentEnteredByUid;
          if (isUnpaidStatusOnlyCompletion) {
            closedPeriodForUnpaidCompletion = true;
            continue;
          }
          throw new Error("لا يمكن تعديل التاريخ أو الحالة أو المبالغ لحجز مرتبط بفترة مالية تمت تصفيتها.");
        }
      }
    }
  }

  const now = new Date().toISOString();
  let rescheduleHistory = [];
  try {
    const parsedHistory = JSON.parse(existing.rescheduleHistory || "[]");
    if (Array.isArray(parsedHistory)) rescheduleHistory = parsedHistory.filter(item => item && typeof item.fromDate === "string" && typeof item.toDate === "string");
  } catch {}
  const oldDate = String(existing.appointmentDate || "").slice(0, 10);
  const nextDate = String(changes.appointmentDate ?? existing.appointmentDate ?? "").slice(0, 10);
  let queueNumber = String(existing.queueNumber || "");
  if (changes.appointmentDate !== undefined && oldDate && nextDate && oldDate !== nextDate) {
    let allBookings = await listBookings(env);
    allBookings = await normalizeQueueNumbersForDate(env, oldDate, allBookings);
    allBookings = await normalizeQueueNumbersForDate(env, nextDate, allBookings);
    const refreshedExisting = allBookings.find(item => item.id === existing.id) || existing;
    const oldQueueNumber = Number(refreshedExisting.queueNumber) > 0 ? Number(refreshedExisting.queueNumber) : currentQueueNumberForDate(allBookings, refreshedExisting, oldDate);
    const newQueueNumber = nextQueueNumberForDate(allBookings, nextDate);
    rescheduleHistory.push({ fromDate: oldDate, toDate: nextDate, fromQueueNumber: oldQueueNumber, toQueueNumber: newQueueNumber, at: now });
    queueNumber = String(newQueueNumber);
  } else if (!(Number(queueNumber) > 0) && nextDate) {
    const allBookings = await listBookings(projectId, accessToken);
    queueNumber = String(currentQueueNumberForDate(allBookings, existing, nextDate) || nextQueueNumberForDate(allBookings, nextDate));
  }
  let paidAmount = changes.paidAmount !== undefined ? String(changes.paidAmount).trim() : existing.paidAmount;
  let completedFee = existing.completedFee || "";
  let completedAt = existing.completedAt || "";
  let completedByUid = existing.completedByUid || "";
  let completedByName = existing.completedByName || "";
  let paymentEnteredByUid = existing.paymentEnteredByUid || "";
  let paymentEnteredByName = existing.paymentEnteredByName || "";
  let paymentUpdatedAt = existing.paymentUpdatedAt || "";
  if (changes.status === "completed" && existing.status !== "completed") {
    const fee = Number(changes.servicePrice ?? existing.servicePrice) || 0;
    completedFee = fee.toFixed(2);
    completedAt = now;
    completedByUid = actorUid;
    completedByName = actorDisplayName || (actorAccountType === "doctor" ? "الدكتور" : "الموظف");
    if (!(Number(existing.paidAmount) > 0) && !closedPeriodForUnpaidCompletion && fee > 0) {
      paidAmount = fee.toFixed(2);
      paymentEnteredByUid = actorUid;
      paymentEnteredByName = completedByName;
      paymentUpdatedAt = now;
    } else if (Number(existing.paidAmount) > 0) {
      // Keep the already-recorded amount from being counted twice, but attribute
      // this completed visit to the account that finalized it.
      paymentEnteredByUid = actorUid;
      paymentEnteredByName = completedByName;
      paymentUpdatedAt = now;
    }
  }

  const booking = {
    ...existing,
    ...changes,
    patientName: changes.patientName?.trim() ?? existing.patientName,
    patientPhone: changes.patientPhone?.trim() ?? existing.patientPhone,
    appointmentDate:
      changes.appointmentDate?.trim() ?? existing.appointmentDate,
    service: changes.service?.trim() ?? existing.service,
    servicePrice: changes.servicePrice !== undefined ? String(changes.servicePrice).trim() : existing.servicePrice,
    paidAmount,
    completedFee,
    completedAt,
    completedByUid,
    completedByName,
    paymentEnteredByUid,
    paymentEnteredByName,
    paymentUpdatedAt,
    rescheduleHistory: JSON.stringify(rescheduleHistory),
    queueNumber,
    notes: changes.notes?.trim() ?? existing.notes,
    updatedAt: now
  };

  const updatedBooking = await writeBooking(env, booking);
  updatedBooking.financialPeriodClosed = closedPeriodForUnpaidCompletion;
  return updatedBooking;
}

async function cancelBooking(env, data, actorUid = "", actorAccountType = "doctor") {
  if (
    typeof data.id !== "string" ||
    !/^[A-Za-z0-9_-]{1,150}$/.test(data.id)
  ) {
    throw new Error("رقم الحجز غير صحيح.");
  }

  return updateBooking(env, {
    id: data.id,
    status: "cancelled"
  }, actorUid, actorAccountType);
}

async function onRequestInternal(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return jsonResponse(
      { message: "طريقة الطلب غير مسموحة." },
      405
    );
  }

  let data;

  try {
    const raw = await request.text();

    if (raw.length > 20000) {
      return jsonResponse(
        { message: "حجم الطلب أكبر من المسموح." },
        413
      );
    }

    data = JSON.parse(raw);
  } catch {
    return jsonResponse(
      { message: "صيغة الطلب غير صحيحة." },
      400
    );
  }

  const user = await verifyFirebaseUser(request, env);

  if (!user.ok) {
    return jsonResponse(
      { message: user.message },
      user.status
    );
  }

  let access;

  try {
    access = await getAccountAccess(user, env);
  } catch (error) {
    console.error("Bookings authorization error:", error);

    return jsonResponse(
      { message: "تعذر التحقق من صلاحيات الحساب." },
      503
    );
  }

  if (!access.ok) {
    return jsonResponse(
      { message: access.message },
      access.status
    );
  }

  const action = data?.action;

  if (["list", "changesSince", "archiveList"].includes(action) && !["view","edit"].includes(access.permission)) return jsonResponse({ message:"لم تمنح صلاحية عرض الحجوزات." },403);
  if (action === "listDailyAccounts" && !["view","edit"].includes(access.accountsPermission)) return jsonResponse({ message:"لم تمنح صلاحية عرض حسابات اليوم." },403);
  if (action === "updatePaidAmount" && access.accountsPermission !== "edit") return jsonResponse({ message:"لا تملك صلاحية تعديل المدفوعات." },403);
  if (!["list","changesSince","archiveList","listDailyAccounts","updatePaidAmount"].includes(action) && access.permission !== "edit") return jsonResponse({ message:"صلاحية العرض فقط؛ لا يمكنك تعديل الحجوزات." },403);

  try {
    switch (action) {
      case "listDailyAccounts": {
        const date = typeof data.date === "string" ? data.date : "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T12:00:00"))) return jsonResponse({ message:"التاريخ غير صحيح." },400);
        const bookings = await listCompletedBookingsForDate(env, date);
        // Daily accounts include only visits completed on the selected Cairo-local date.
        // Exclude archived/cancelled records even if legacy data still has completion fields.
        const daily = bookings.filter(b =>
          b.status === "completed" &&
          !b.isArchived &&
          !["archived", "cancelled"].includes(b.status) &&
          cairoDate(b.completedAt) === date
        ).map(b => {
          // Older completed visits may predate paidAmount tracking. Completion has
          // historically represented a collected service fee, so restore that
          // amount for account calculations when the receipt field is missing.
          const recordedPaidAmount = Number(b.paidAmount) || 0;
          const completedFee = Number(b.completedFee) || Number(b.servicePrice) || 0;
          const effectivePaidAmount = recordedPaidAmount > 0
            ? String(b.paidAmount)
            : b.status === "completed" && completedFee > 0
              ? completedFee.toFixed(2)
              : "0";
          const otherOwner = access.accountType === "staff" && !!b.paymentEnteredByUid && b.paymentEnteredByUid !== access.uid;
          return { id:b.id, patientName:b.patientName, appointmentDate:b.appointmentDate, service:b.service,
            servicePrice:b.servicePrice, completedFee:b.completedFee, completedAt:b.completedAt,
            paidAmount:effectivePaidAmount, status:b.status,
            paymentEnteredByUid:b.paymentEnteredByUid, paymentEnteredByName:b.paymentEnteredByName,
            paymentUpdatedAt:b.paymentUpdatedAt, paymentReadOnly:otherOwner,
            paymentAttributedToCurrentUser:access.accountType === "doctor" || b.paymentEnteredByUid === access.uid,
            paymentUnassigned:!b.paymentEnteredByUid && Number(effectivePaidAmount)>0 };
        });
        return jsonResponse({ bookings:daily, date });
      }
      case "updatePaidAmount": {
        const bookingId = String(data.id || ""), paidAmount = String(data.paidAmount ?? "");
        if (!/^[A-Za-z0-9_-]{1,150}$/.test(bookingId) || !/^\d{1,8}(\.\d{1,2})?$/.test(paidAmount) || Number(paidAmount) < 0) return jsonResponse({ message:"أدخل مبلغًا مدفوعًا صحيحًا." },400);
        const currentDoc = await firestoreRequest(serviceAccount.project_id, accessToken, `/${BOOKINGS_COLLECTION}/${encodeURIComponent(bookingId)}`);
        const current = decodeBooking(currentDoc);
        if (access.accountType === "staff" && current.paymentEnteredByUid && current.paymentEnteredByUid !== access.uid) return jsonResponse({message:"لا يمكنك تعديل مبلغ سجله موظف آخر."},403);
        if (await isFinancialPeriodClosed(env, current.appointmentDate, current.paymentEnteredByUid || access.uid)) return jsonResponse({message:"تمت تصفية عهدة هذا الموظف؛ لا يمكن تعديل المبلغ بعد الإقفال."},409);
        const now = new Date().toISOString();
        const patch = {fields:{
          paidAmount:stringField(paidAmount),
          paymentEnteredByUid:stringField(access.uid),
          paymentEnteredByName:stringField(access.displayName || (access.accountType === "doctor" ? "الدكتور" : "الموظف")),
          paymentUpdatedAt:stringField(now),
          updatedAt:stringField(now)
        }};
        const updated = await firestoreRequest(serviceAccount.project_id, accessToken, `/${BOOKINGS_COLLECTION}/${encodeURIComponent(bookingId)}?updateMask.fieldPaths=paidAmount&updateMask.fieldPaths=paymentEnteredByUid&updateMask.fieldPaths=paymentEnteredByName&updateMask.fieldPaths=paymentUpdatedAt&updateMask.fieldPaths=updatedAt`, {method:"PATCH",body:JSON.stringify(patch)});
        const booking = decodeBooking(updated);
        return jsonResponse({ booking:{ id:booking.id, paidAmount:booking.paidAmount, paymentEnteredByUid:booking.paymentEnteredByUid, paymentEnteredByName:booking.paymentEnteredByName } });
      }
      case "archiveList": {
        let cursor = data.cursor && typeof data.cursor === "object" && !Array.isArray(data.cursor) ? data.cursor : null;
        if (cursor) {
          for (const key of ["primary", "history"]) {
            const item = cursor[key];
            if (item && (!/^[A-Za-z0-9_-]{1,150}$/.test(String(item.id || "")) ||
                (key === "history" && (typeof item.history !== "string" || item.history.length > 16000)))) {
              return jsonResponse({ message: "مؤشر صفحة الأرشيف غير صحيح." }, 400);
            }
          }
        }
        const page = await listArchivePage(env, cursor, data.limit);
        return jsonResponse({ rows: page.rows, nextCursor: page.nextCursor, hasMore: !!page.nextCursor });
      }

      case "changesSince": {
        const since = typeof data.since === "string" ? data.since : "";
        if (!since || since.length > 40 || Number.isNaN(Date.parse(since))) {
          return jsonResponse({ message: "وقت مزامنة الحجوزات غير صحيح." }, 400);
        }
        const nextSince = new Date(Date.now() - 1000).toISOString();
        let bookings = await listBookingChanges(env, since);
        bookings = bookings.map(booking => {
          if (booking.status !== "completed" || Number(booking.paidAmount) > 0) return booking;
          const fee = Number(booking.completedFee) || Number(booking.servicePrice) || 0;
          return fee > 0 ? { ...booking, paidAmount: fee.toFixed(2) } : booking;
        });
        return jsonResponse({
          bookings,
          accountType: access.accountType,
          permission: access.permission,
          since,
          nextSince
        });
      }

      case "list": {
        const syncCursor = new Date(Date.now() - 1000).toISOString();
        let bookings = await listBookings(env);
        const bookingDates = new Set(bookings.map(booking => String(booking.appointmentDate || "").slice(0, 10)).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)));
        for (const date of bookingDates) {
          bookings = await normalizeQueueNumbersForDate(env, date, bookings);
        }

        // Backward compatibility for completed visits created before paidAmount
        // was consistently stored: use the completed fee/service price as the
        // collected amount when no receipt amount exists.
        bookings = bookings.map(booking => {
          if (booking.status !== "completed" || Number(booking.paidAmount) > 0) return booking;
          const fee = Number(booking.completedFee) || Number(booking.servicePrice) || 0;
          return fee > 0 ? { ...booking, paidAmount: fee.toFixed(2) } : booking;
        });

        return jsonResponse({
          bookings,
          accountType: access.accountType,
          permission: access.permission,
          syncCursor
        });
      }

      case "restoreArchived": {
        const id = typeof data.id === "string" ? data.id : "";
        if (!/^[A-Za-z0-9_-]{1,150}$/.test(id)) return jsonResponse({ message: "رقم الحجز غير صحيح." }, 400);
        const current = await firestoreRequest(serviceAccount.project_id, accessToken, `/${BOOKINGS_COLLECTION}/${encodeURIComponent(id)}`);
        const booking = decodeBooking(current);
        if (!booking.isArchived) return jsonResponse({ booking, restored: false });
        const now = new Date().toISOString();
        const fields = {
          isArchived: stringField("false"),
          archivedAt: stringField(""),
          archivedByUid: stringField(""),
          archivedByName: stringField(""),
          updatedAt: stringField(now)
        };
        const mask = new URLSearchParams();
        for (const key of Object.keys(fields)) mask.append("updateMask.fieldPaths", key);
        const updated = await firestoreRequest(serviceAccount.project_id, accessToken, `/${BOOKINGS_COLLECTION}/${encodeURIComponent(id)}?${mask}`, {
          method: "PATCH", body: JSON.stringify({ fields })
        });
        return jsonResponse({ booking: decodeBooking(updated), restored: true });
      }

      case "archiveDay": {
        const date = typeof data.date === "string" ? data.date : "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00`))) {
          return jsonResponse({ message: "تاريخ الأرشفة غير صحيح." }, 400);
        }
        const all = await listBookings(serviceAccount.project_id, accessToken);
        let archivedCount = 0;
        const archivedAt = new Date().toISOString();
        const archivedByUid = access.uid || "";
        const archivedByName = access.displayName || (access.accountType === "doctor" ? "الدكتور" : "الموظف");
        for (const booking of all) {
          const currentDateMatches = String(booking.appointmentDate || "").slice(0, 10) === date;
          if (currentDateMatches && !booking.isArchived) {
            const fields = {
              isArchived: stringField("true"),
              archivedAt: stringField(archivedAt),
              archivedByUid: stringField(archivedByUid),
              archivedByName: stringField(archivedByName),
              updatedAt: stringField(archivedAt)
            };
            const mask = new URLSearchParams();
            for (const key of Object.keys(fields)) mask.append("updateMask.fieldPaths", key);
            await firestoreRequest(serviceAccount.project_id, accessToken, `/${BOOKINGS_COLLECTION}/${encodeURIComponent(booking.id)}?${mask}`, {
              method: "PATCH", body: JSON.stringify({ fields })
            });
            archivedCount += 1;
            continue;
          }

          // Archive the old appointment occurrence, not the whole booking, so its new date remains active.
          const matchingEntries = historyForBooking(booking).filter(entry => entry.fromDate === date);
          if (!matchingEntries.length) continue;
          let archivedHistory = [];
          try {
            const parsed = JSON.parse(booking.archivedRescheduleHistory || "[]");
            if (Array.isArray(parsed)) archivedHistory = parsed;
          } catch {}
          let changed = false;
          for (const entry of matchingEntries) {
            const alreadyArchived = archivedHistory.some(item =>
              item && item.fromDate === entry.fromDate &&
              item.toDate === entry.toDate &&
              item.at === entry.at
            );
            if (alreadyArchived) continue;
            archivedHistory.push({
              fromDate: entry.fromDate,
              toDate: entry.toDate,
              fromQueueNumber: entry.fromQueueNumber || "",
              toQueueNumber: entry.toQueueNumber || "",
              at: entry.at || "",
              status: "postponed",
              archivedAt,
              archivedByUid,
              archivedByName
            });
            changed = true;
            archivedCount += 1;
          }
          if (!changed) continue;
          const fields = {
            archivedRescheduleHistory: stringField(JSON.stringify(archivedHistory)),
            updatedAt: stringField(archivedAt)
          };
          const mask = new URLSearchParams();
          for (const key of Object.keys(fields)) mask.append("updateMask.fieldPaths", key);
          await firestoreRequest(serviceAccount.project_id, accessToken, `/${BOOKINGS_COLLECTION}/${encodeURIComponent(booking.id)}?${mask}`, {
            method: "PATCH", body: JSON.stringify({ fields })
          });
        }
        return jsonResponse({ archivedCount, date });
      }

      case "create": {
        const error = validateBooking(data.booking);

        if (error) return jsonResponse({ message: error }, 400);

        const booking = await createBooking(env, data.booking);

        return jsonResponse({ booking }, 201);
      }

      case "update": {
        if (access.accountType === "staff" && data.booking?.paidAmount !== undefined) {
          return jsonResponse({ message: "تعديل المبلغ المقبوض يتم من قسم حسابات اليوم فقط حتى يُنسب الاستلام إلى الحساب الصحيح." }, 403);
        }
        const booking = await updateBooking(
          env,
          data.booking || {},
          access.accountType === "staff" ? access.uid : "",
          access.accountType,
          access.displayName || ""
        );

        return jsonResponse({ booking });
      }

      case "cancel": {
        const booking = await cancelBooking(
          env,
          { id: data.id },
          access.accountType === "staff" ? access.uid : "",
          access.accountType
        );

        return jsonResponse({ booking });
      }

      default:
        return jsonResponse(
          { message: "الإجراء المطلوب غير معروف." },
          400
        );
    }
  } catch (error) {
    console.error("Bookings request failed:", error);

    return jsonResponse(
      {
        message: error.message || "تعذر تنفيذ العملية."
      },
      error.status === 404 ? 404 : 400
    );
  }
}


export async function onRequest(context) {
  const input = context.request.method === "POST"
    ? await context.request.clone().json().catch(() => ({}))
    : {};
  const result = await onRequestInternal(context);
  if (result.ok) {
    let event = "";
    if (input.action === "create") event = "booking_created";
    else if (input.action === "cancel") event = "booking_cancelled";
    else if (input.action === "update") event = input.booking?.status ? "booking_status_changed" : "booking_updated";
    else if (["archiveDay", "restoreArchived", "updatePaidAmount"].includes(input.action)) event = "booking_updated";
    if (event) {
      const notification = publishClinicRealtime(context.env, event);
      if (typeof context.waitUntil === "function") context.waitUntil(notification);
      else void notification;
    }
  }
  return result;
}
