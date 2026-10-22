
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

function decodeBooking(document) {
  const fields = document.fields || {};
  const id = (document.name || "").split("/").pop();

  return {
    id,
    patientName: readString(fields, "patientName"),
    patientPhone: readString(fields, "patientPhone"),
    appointmentDate: readString(fields, "appointmentDate"),
    service: readString(fields, "service"),
    servicePrice: readString(fields, "servicePrice"),
    paidAmount: readString(fields, "paidAmount"),
    paymentEnteredByUid: readString(fields, "paymentEnteredByUid"),
    paymentEnteredByName: readString(fields, "paymentEnteredByName"),
    paymentUpdatedAt: readString(fields, "paymentUpdatedAt"),
    rescheduleHistory: readString(fields, "rescheduleHistory"),
    notes: readString(fields, "notes"),
    status: readString(fields, "status") || "pending",
    createdAt: readString(fields, "createdAt"),
    updatedAt: readString(fields, "updatedAt")
  };
}

function encodeBooking(data) {
  const fields = {};

  for (const key of [
    "patientName",
    "patientPhone",
    "appointmentDate",
    "service",
    "servicePrice",
    "paidAmount",
    "paymentEnteredByUid",
    "paymentEnteredByName",
    "paymentUpdatedAt",
    "rescheduleHistory",
    "notes",
    "status",
    "createdAt",
    "updatedAt"
  ]) {
    fields[key] = stringField(data[key]);
  }

  return { fields };
}

async function getAccountAccess(
  user,
  serviceAccount,
  accessToken
) {
  if (user.uid === DOCTOR_ADMIN_UID) {
    return {
      ok: true,
      accountType: "doctor",
      permission: "edit",
      accountsPermission: "edit",
      uid: user.uid,
      displayName: "الدكتور"
    };
  }

  let document;

  try {
    document = await firestoreRequest(
      serviceAccount.project_id,
      accessToken,
      `/${STAFF_COLLECTION}/${encodeURIComponent(user.uid)}`
    );
  } catch {
    return {
      ok: false,
      status: 403,
      message: "هذا الحساب غير مصرح له بإدارة حجوزات العيادة."
    };
  }

  const fields = document?.fields || {};
  const active = fields.active?.booleanValue === true;
  const role = readString(fields, "role");
  const permission = readString(fields.permissions?.mapValue?.fields, "bookings");
  const accountsPermission = readString(fields.permissions?.mapValue?.fields, "accounts");
  const displayName = readString(fields, "displayName");

  if (role !== "staff" || !active) {
    return {
      ok: false,
      status: 403,
      message: "حساب الموظف غير نشط أو غير معتمد."
    };
  }

  if (!["view", "edit"].includes(permission) && !["view", "edit"].includes(accountsPermission)) return { ok:false, status:403, message:"لم يمنحك الدكتور صلاحية الوصول إلى هذا القسم." };
  return { ok:true, accountType:"staff", permission, accountsPermission, uid:user.uid, displayName };
}

function validateBooking(data, partial = false) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "بيانات الحجز غير صحيحة.";
  }

  const allowed = [
    "patientName",
    "patientPhone",
    "appointmentDate",
    "service",
    "servicePrice",
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

  if (data.notes && data.notes.length > 2000) {
    return "الملاحظات أطول من المسموح.";
  }

  if (data.status && !STATUSES.includes(data.status)) {
    return "حالة الحجز غير صحيحة.";
  }

  return null;
}


async function listBookings(projectId, accessToken) {
  const result = await firestoreRequest(
    projectId,
    accessToken,
    ":runQuery",
    {
      method: "POST",
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: BOOKINGS_COLLECTION }]
        }
      })
    }
  );

  return (Array.isArray(result) ? result : [])
    .filter((item) => item.document)
    .map((item) => decodeBooking(item.document))
    .sort((a, b) => (Date.parse(a.createdAt || "") || 0) - (Date.parse(b.createdAt || "") || 0));
}


async function isFinancialPeriodClosed(projectId, accessToken, dateValue, employeeUid = "") {
  const date = String(dateValue || "").slice(0,10);
  if (!employeeUid || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const result = await firestoreRequest(projectId, accessToken, ":runQuery", {
    method:"POST",
    body:JSON.stringify({structuredQuery:{from:[{collectionId:"clinicAccountRecords"}]}})
  });
  return (Array.isArray(result)?result:[]).some(item => {
    const fields = item.document?.fields || {};
    if (readString(fields,"type") !== "settlement" || readString(fields,"employeeUid") !== employeeUid) return false;
    const type = readString(fields,"periodType"), key = readString(fields,"periodKey");
    return (type === "day" && key === date) || (type === "month" && key === date.slice(0,7));
  });
}

async function createBooking(projectId, accessToken, data) {
  const now = new Date().toISOString();

  const booking = {
    ...data,
    patientName: data.patientName.trim(),
    patientPhone: data.patientPhone.trim(),
    appointmentDate: data.appointmentDate.trim(),
    service: (data.service || "").trim(),
    notes: (data.notes || "").trim(),
    status: "waiting",
    createdAt: now,
    updatedAt: now
  };

  const result = await firestoreRequest(
    projectId,
    accessToken,
    `/${BOOKINGS_COLLECTION}`,
    {
      method: "POST",
      body: JSON.stringify(encodeBooking(booking))
    }
  );

  return decodeBooking(result);
}

async function updateBooking(projectId, accessToken, data, actorUid = "", actorAccountType = "doctor", actorDisplayName = "") {
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

  const current = await firestoreRequest(
    projectId,
    accessToken,
    `/${BOOKINGS_COLLECTION}/${encodeURIComponent(data.id)}`
  );

  const existing = decodeBooking(current);
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
  if (changesFinancialFields) {
    const dates = new Set([
      String(existing.appointmentDate || "").slice(0,10),
      String(changes.appointmentDate ?? existing.appointmentDate ?? "").slice(0,10)
    ].filter(Boolean));
    const ownerUid = existing.paymentEnteredByUid || (actorAccountType === "staff" && changes.status === "completed" ? actorUid : "");
    if (ownerUid) {
      for (const date of dates) {
        if (await isFinancialPeriodClosed(projectId, accessToken, date, ownerUid)) {
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
  if (changes.appointmentDate !== undefined && oldDate && nextDate && oldDate !== nextDate) {
    rescheduleHistory.push({ fromDate: oldDate, toDate: nextDate, at: now });
  }
  let paidAmount = changes.paidAmount !== undefined ? String(changes.paidAmount).trim() : existing.paidAmount;
  let paymentEnteredByUid = existing.paymentEnteredByUid || "";
  let paymentEnteredByName = existing.paymentEnteredByName || "";
  let paymentUpdatedAt = existing.paymentUpdatedAt || "";
  if (actorAccountType === "staff" && changes.status === "completed" && existing.status !== "completed" && !(Number(existing.paidAmount) > 0)) {
    const fee = Number(changes.servicePrice ?? existing.servicePrice) || 0;
    if (fee > 0) {
      paidAmount = fee.toFixed(2);
      paymentEnteredByUid = actorUid;
      paymentEnteredByName = actorDisplayName || "الموظف";
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
    paymentEnteredByUid,
    paymentEnteredByName,
    paymentUpdatedAt,
    rescheduleHistory: JSON.stringify(rescheduleHistory),
    notes: changes.notes?.trim() ?? existing.notes,
    updatedAt: now
  };

  const query = new URLSearchParams();

  for (const key of [
    "patientName",
    "patientPhone",
    "appointmentDate",
    "service",
    "servicePrice",
    "paidAmount",
    "paymentEnteredByUid",
    "paymentEnteredByName",
    "paymentUpdatedAt",
    "rescheduleHistory",
    "notes",
    "status",
    "updatedAt"
  ]) {
    query.append("updateMask.fieldPaths", key);
  }

  const result = await firestoreRequest(
    projectId,
    accessToken,
    `/${BOOKINGS_COLLECTION}/${encodeURIComponent(data.id)}?${query}`,
    {
      method: "PATCH",
      body: JSON.stringify(encodeBooking(booking))
    }
  );

  return decodeBooking(result);
}

async function cancelBooking(projectId, accessToken, data, actorUid = "", actorAccountType = "doctor") {
  if (
    typeof data.id !== "string" ||
    !/^[A-Za-z0-9_-]{1,150}$/.test(data.id)
  ) {
    throw new Error("رقم الحجز غير صحيح.");
  }

  return updateBooking(projectId, accessToken, {
    id: data.id,
    status: "cancelled"
  }, actorUid, actorAccountType);
}

export async function onRequest(context) {
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

  let serviceAccount;
  let accessToken;

  try {
    serviceAccount = parseServiceAccount(env);
    accessToken = await createGoogleAccessToken(serviceAccount);
  } catch (error) {
    console.error("Bookings service configuration error:", error);

    return jsonResponse(
      { message: "خدمة الحجوزات غير مهيأة على الخادم." },
      503
    );
  }

  let access;

  try {
    access = await getAccountAccess(
      user,
      serviceAccount,
      accessToken
    );
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

  if (action === "list" && !["view","edit"].includes(access.permission)) return jsonResponse({ message:"لم تمنح صلاحية عرض الحجوزات." },403);
  if (action === "listDailyAccounts" && !["view","edit"].includes(access.accountsPermission)) return jsonResponse({ message:"لم تمنح صلاحية عرض حسابات اليوم." },403);
  if (action === "updatePaidAmount" && access.accountsPermission !== "edit") return jsonResponse({ message:"لا تملك صلاحية تعديل المدفوعات." },403);
  if (!["list","listDailyAccounts","updatePaidAmount"].includes(action) && access.permission !== "edit") return jsonResponse({ message:"صلاحية العرض فقط؛ لا يمكنك تعديل الحجوزات." },403);

  try {
    switch (action) {
      case "listDailyAccounts": {
        const date = typeof data.date === "string" ? data.date : "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T12:00:00"))) return jsonResponse({ message:"التاريخ غير صحيح." },400);
        const bookings = await listBookings(serviceAccount.project_id, accessToken);
        const daily = bookings.filter(b => String(b.appointmentDate || "").slice(0,10) === date && (b.status !== "pending" || Number(b.paidAmount) > 0)).map(b => { const otherOwner = access.accountType === "staff" && !!b.paymentEnteredByUid && b.paymentEnteredByUid !== access.uid; return { id:b.id, patientName:b.patientName, appointmentDate:b.appointmentDate, service:b.service, servicePrice:b.servicePrice, paidAmount:otherOwner ? "0" : (b.paidAmount || "0"), status:b.status, paymentEnteredByUid:b.paymentEnteredByUid, paymentEnteredByName:b.paymentEnteredByName, paymentReadOnly:otherOwner, paymentAttributedToCurrentUser:access.accountType === "doctor" || b.paymentEnteredByUid === access.uid, paymentUnassigned:!b.paymentEnteredByUid && Number(b.paidAmount)>0 }; });
        return jsonResponse({ bookings:daily, date });
      }
      case "updatePaidAmount": {
        const bookingId = String(data.id || ""), paidAmount = String(data.paidAmount ?? "");
        if (!/^[A-Za-z0-9_-]{1,150}$/.test(bookingId) || !/^\d{1,8}(\.\d{1,2})?$/.test(paidAmount) || Number(paidAmount) < 0) return jsonResponse({ message:"أدخل مبلغًا مدفوعًا صحيحًا." },400);
        const currentDoc = await firestoreRequest(serviceAccount.project_id, accessToken, `/${BOOKINGS_COLLECTION}/${encodeURIComponent(bookingId)}`);
        const current = decodeBooking(currentDoc);
        if (access.accountType === "staff" && current.paymentEnteredByUid && current.paymentEnteredByUid !== access.uid) return jsonResponse({message:"لا يمكنك تعديل مبلغ سجله موظف آخر."},403);
        if (await isFinancialPeriodClosed(serviceAccount.project_id, accessToken, current.appointmentDate, current.paymentEnteredByUid || access.uid)) return jsonResponse({message:"تمت تصفية عهدة هذا الموظف؛ لا يمكن تعديل المبلغ بعد الإقفال."},409);
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
      case "list": {
        const bookings = await listBookings(
          serviceAccount.project_id,
          accessToken
        );

        return jsonResponse({
          bookings,
          accountType: access.accountType,
          permission: access.permission
        });
      }

      case "archiveDay": {
        const date = typeof data.date === "string" ? data.date : "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00`))) {
          return jsonResponse({ message: "تاريخ الأرشفة غير صحيح." }, 400);
        }
        const all = await listBookings(serviceAccount.project_id, accessToken);
        const targets = all.filter((booking) => booking.appointmentDate.slice(0, 10) === date && !["pending", "archived", "cancelled"].includes(booking.status));
        let archivedCount = 0;
        for (const booking of targets) {
          await updateBooking(
            serviceAccount.project_id,
            accessToken,
            { id: booking.id, status: "archived" },
            access.accountType === "staff" ? access.uid : "",
            access.accountType
          );
          archivedCount += 1;
        }
        return jsonResponse({ archivedCount, date });
      }

      case "create": {
        const error = validateBooking(data.booking);

        if (error) return jsonResponse({ message: error }, 400);

        const booking = await createBooking(
          serviceAccount.project_id,
          accessToken,
          data.booking
        );

        return jsonResponse({ booking }, 201);
      }

      case "update": {
        if (access.accountType === "staff" && data.booking?.paidAmount !== undefined) {
          return jsonResponse({ message: "تعديل المبلغ المقبوض يتم من قسم حسابات اليوم فقط حتى يُنسب الاستلام إلى الحساب الصحيح." }, 403);
        }
        const booking = await updateBooking(
          serviceAccount.project_id,
          accessToken,
          data.booking || {},
          access.accountType === "staff" ? access.uid : "",
          access.accountType,
          access.displayName || ""
        );

        return jsonResponse({ booking });
      }

      case "cancel": {
        const booking = await cancelBooking(
          serviceAccount.project_id,
          accessToken,
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
