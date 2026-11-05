import { getClinicDatabase, d1First, d1Run } from "../../_shared/d1.js";
import { publishClinicRealtime } from "../../_shared/realtime.js";
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

async function createBooking(env, data) {
  const database = getClinicDatabase(env);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const sourcePayload = {
    patientName: data.patientName.trim(),
    patientPhone: data.patientPhone.trim(),
    appointmentDate: data.appointmentDate,
    service: data.service.trim(),
    notes: data.notes.trim(),
    status: "pending",
    createdAt: now,
    updatedAt: now,
    source: "public-website"
  };
  await d1Run(database,
    "INSERT INTO bookings (id, patient_name, patient_phone, appointment_date, service, notes, status, created_at, updated_at, source_payload_json) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)",
    [id, sourcePayload.patientName, sourcePayload.patientPhone, sourcePayload.appointmentDate, sourcePayload.service, sourcePayload.notes, now, now, JSON.stringify(sourcePayload)]);
  return id;
}

async function writePublicAuditLog(env, action, level, message, targetId = "") {
  const database = getClinicDatabase(env);
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const id = crypto.randomUUID();
  const record = {
    actorUid: "public-visitor", actorName: "زائر الموقع", actorType: "public",
    action, area: "public_booking", level, message,
    targetType: "booking", targetId, createdAt: now.toISOString(), expiresAt: expires.toISOString()
  };
  await d1Run(database,
    "INSERT INTO clinic_logs (id, actor_uid, actor_name, actor_type, action, area, level, message, target_type, target_id, created_at, expires_at, source_payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, record.actorUid, record.actorName, record.actorType, record.action, record.area, record.level, record.message, record.targetType, record.targetId, record.createdAt, record.expiresAt, JSON.stringify(record)]);
}

async function validateConfiguredService(env, serviceName) {
  if (!serviceName) return null;
  const database = getClinicDatabase(env);
  const row = await d1First(database, "SELECT settings_json FROM clinic_settings WHERE id = ? LIMIT 1", ["singleton"]);
  let settings = null;
  try { settings = JSON.parse(row?.settings_json || "null"); } catch { throw new Error("Clinic settings are invalid."); }
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

  try {
    const serviceError = await validateConfiguredService(env, data.service ?? "");
    if (serviceError) return jsonResponse({ message: serviceError }, 400);
    const id = await createBooking(env, {
      patientName: data.patientName,
      patientPhone: data.patientPhone,
      appointmentDate: data.appointmentDate,
      service: data.service ?? "",
      notes: data.notes ?? ""
    });
    try { await writePublicAuditLog(env, "booking_created", "info", "تم استلام طلب حجز من الموقع العام.", id); } catch (logError) { console.error("Public audit log failed:", logError); }
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
    try { await writePublicAuditLog(env, "request_failed", "error", "فشل حفظ طلب حجز من الموقع العام."); } catch (logError) { console.error("Public booking failure log failed:", logError); }
    return jsonResponse({ message: "تعذر حفظ طلب الحجز الآن. حاولي مرة أخرى لاحقًا." }, 503);
  }
}
