import { getClinicDatabase, d1All, d1First, d1Run } from "../../_shared/d1.js";
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
async function verifyUser(request, env) {
  if (!env.FIREBASE_API_KEY) return { ok: false, status: 503, message: "خدمة التحقق غير مهيأة." };
  const match = (request.headers.get("Authorization") || "").match(/^Bearer\s+(\S+)$/i);
  if (!match || match[1].length > 8192) return { ok: false, status: 401, message: "يلزم تسجيل الدخول." };
  const response = await fetch(FIREBASE_LOOKUP_URL + "?key=" + encodeURIComponent(env.FIREBASE_API_KEY), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: match[1] }) });
  if (!response.ok) return { ok: false, status: 401, message: "جلسة الدخول غير صالحة." };
  const result = await response.json(), user = result.users?.[0];
  return user?.localId ? { ok: true, uid: user.localId } : { ok: false, status: 401, message: "تعذر التحقق من الحساب." };
}
async function getPatientContext(user,env) {
  const database=getClinicDatabase(env);
  const account=await d1First(database,"SELECT uid, role, active, patient_id, display_name FROM patient_accounts WHERE uid = ? LIMIT 1",[user.uid]);
  if(!account||account.role!=="patient"||Number(account.active)!==1)return {error:jsonResponse({message:"حساب المريض غير نشط أو غير معتمد."},403)};
  const patientId=account.patient_id||"";
  if(!/^[A-Za-z0-9_-]{1,150}$/.test(patientId))return {error:jsonResponse({message:"هذا الحساب غير مرتبط بملف طبي. تواصل مع العيادة لتصحيح الربط."},409)};
  const medical=await d1First(database,"SELECT * FROM medical_patients WHERE id = ? LIMIT 1",[patientId]);
  if(!medical)return {error:jsonResponse({message:"الملف الطبي المرتبط بالحساب غير موجود. تواصل مع العيادة."},409)};
  let payload={};try{payload=JSON.parse(medical.source_payload_json||"{}");}catch{}
  const patient={id:patientId,patientNumber:payload.patientNumber??medical.patient_number??"",displayName:payload.displayName??medical.display_name??"",phone:payload.phone??medical.phone??"",gender:payload.gender??medical.gender??"",birthDate:payload.birthDate??medical.birth_date??"",notes:payload.notes??medical.notes??""};
  return {database,patientId,patient};
}

async function getPortalData(context) {
  const {database,patientId,patient}=context;
  const [bookingRows,visitRows]=await Promise.all([
    d1All(database,"SELECT * FROM bookings ORDER BY created_at DESC LIMIT 1000"),
    d1All(database,"SELECT * FROM medical_visits WHERE patient_id = ? ORDER BY visit_date DESC, created_at DESC LIMIT 500",[patientId])
  ]);
  const appointments=bookingRows.map(row=>{
    let p={};try{p=JSON.parse(row.source_payload_json||"{}");}catch{}
    return {id:row.id,patientId:p.patientId??row.patient_id??"",patientName:p.patientName??row.patient_name??"",patientPhone:p.patientPhone??row.patient_phone??"",appointmentDate:p.appointmentDate??row.appointment_date??"",service:p.service??row.service??"",status:p.status??row.status??"pending",createdAt:p.createdAt??row.created_at??""};
  }).filter(b=>b.patientId===patientId||(!b.patientId&&normalize(b.patientName)===normalize(patient.displayName)&&normalizePhone(b.patientPhone)===normalizePhone(patient.phone)))
    .map(({id,appointmentDate,service,status,createdAt})=>({id,appointmentDate,service,status,createdAt}))
    .sort((a,b)=>String(b.appointmentDate).localeCompare(String(a.appointmentDate)));
  const visits=visitRows.map(row=>{
    let p={};try{p=JSON.parse(row.source_payload_json||"{}");}catch{}
    return {...p,id:row.id,patientId:row.patient_id,bookingId:row.booking_id,visitDate:row.visit_date,queueNumber:row.queue_number,bloodPressure:row.blood_pressure,weight:row.weight,bloodSugar:row.blood_sugar,preVisitNotes:row.pre_visit_notes,diagnosis:row.diagnosis,clinicalNotes:row.clinical_notes,treatment:row.treatment,followUp:row.follow_up,createdAt:row.created_at};
  }).sort((a,b)=>String(b.visitDate).localeCompare(String(a.visitDate))||String(b.createdAt).localeCompare(String(a.createdAt)));
  return {patient,appointments,visits};
}

async function requestBooking(context,body) {
  const appointmentDate=typeof body.appointmentDate==="string"?body.appointmentDate.trim():"";
  const service=typeof body.service==="string"?body.service.trim():"";
  if(!/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)||Number.isNaN(Date.parse(appointmentDate+"T12:00:00")))throw Object.assign(new Error("اختَر تاريخًا صحيحًا للموعد."),{status:400});
  if(appointmentDate<new Date().toISOString().slice(0,10))throw Object.assign(new Error("لا يمكن طلب موعد بتاريخ مضى."),{status:400});
  if(service.length>160)throw Object.assign(new Error("اسم الخدمة أطول من المسموح."),{status:400});
  const {database,patient,patientId}=context,now=new Date().toISOString(),id=crypto.randomUUID();
  const record={id,patientId,patientName:patient.displayName,patientPhone:patient.phone,appointmentDate,service,notes:"",status:"pending",source:"patient-portal",createdAt:now,updatedAt:now};
  await d1Run(database,"INSERT INTO bookings (id,patient_id,patient_name,patient_phone,appointment_date,service,notes,status,created_at,updated_at,source_payload_json) VALUES (?,?,?,?,?,?,?,'pending',?,?,?)",
    [id,patientId,patient.displayName,patient.phone,appointmentDate,service,"",now,now,JSON.stringify(record)]);
  return {id,appointmentDate,service,status:"pending"};
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
