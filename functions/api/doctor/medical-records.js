import { getClinicDatabase, d1All, d1First, d1Run } from "../../_shared/d1.js";
import { publishClinicRealtime } from "../../_shared/realtime.js";
const DOCTOR_ADMIN_UID = "8fUdGutQHRau3RXQIrRtZUqQ9Nm1";
const LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer"
  }});
}
function read(fields,key){return fields?.[key]?.stringValue||"";}
function decode(row) {
  if (row?.fields) {
    const f=row.fields; return {id:(row.name||"").split("/").pop(),patientNumber:read(f,"patientNumber"),displayName:read(f,"displayName"),phone:read(f,"phone"),gender:read(f,"gender"),birthDate:read(f,"birthDate"),notes:read(f,"notes"),createdAt:read(f,"createdAt"),updatedAt:read(f,"updatedAt")};
  }
  let p={};try{p=JSON.parse(row?.source_payload_json||"{}");}catch{}
  return {...p,id:row?.id||p.id||"",patientNumber:p.patientNumber??row?.patient_number??"",displayName:p.displayName??row?.display_name??"",phone:p.phone??row?.phone??"",gender:p.gender??row?.gender??"",birthDate:p.birthDate??row?.birth_date??"",notes:p.notes??row?.notes??"",createdAt:p.createdAt??row?.created_at??"",updatedAt:p.updatedAt??row?.updated_at??""};
}
function decodeVisit(row) {
  if(row?.fields){const f=row.fields;return {id:(row.name||"").split("/").pop(),patientId:read(f,"patientId"),bookingId:read(f,"bookingId"),visitDate:read(f,"visitDate"),queueNumber:read(f,"queueNumber"),bloodPressure:read(f,"bloodPressure"),weight:read(f,"weight"),bloodSugar:read(f,"bloodSugar"),preVisitNotes:read(f,"preVisitNotes"),diagnosis:read(f,"diagnosis"),clinicalNotes:read(f,"clinicalNotes"),treatment:read(f,"treatment"),followUp:read(f,"followUp"),followUpNotes:read(f,"followUpNotes"),followUpDays:read(f,"followUpDays"),followUpDate:read(f,"followUpDate"),createdAt:read(f,"createdAt"),updatedAt:read(f,"updatedAt"),createdByName:read(f,"createdByName")};}
  let p={};try{p=JSON.parse(row?.source_payload_json||"{}");}catch{}
  return {...p,id:row?.id||p.id||"",patientId:p.patientId??row?.patient_id??"",bookingId:p.bookingId??row?.booking_id??"",visitDate:p.visitDate??row?.visit_date??"",queueNumber:p.queueNumber??row?.queue_number??"",bloodPressure:p.bloodPressure??row?.blood_pressure??"",weight:p.weight??row?.weight??"",bloodSugar:p.bloodSugar??row?.blood_sugar??"",preVisitNotes:p.preVisitNotes??row?.pre_visit_notes??"",diagnosis:p.diagnosis??row?.diagnosis??"",clinicalNotes:p.clinicalNotes??row?.clinical_notes??"",treatment:p.treatment??row?.treatment??"",followUp:p.followUp??row?.follow_up??"",followUpNotes:p.followUpNotes??row?.follow_up_notes??"",followUpDays:p.followUpDays??row?.follow_up_days??"",followUpDate:p.followUpDate??row?.follow_up_date??"",createdAt:p.createdAt??row?.created_at??"",updatedAt:p.updatedAt??row?.updated_at??"",createdByName:p.createdByName??row?.created_by_name??""};
}

function decodeBookingRow(row) {
  let p={};try{p=JSON.parse(row?.source_payload_json||"{}");}catch{}
  const pick=(camel,snake,fallback="")=>p[camel]??row?.[snake]??fallback;
  return {...p,id:row?.id||p.id||"",patientName:pick("patientName","patient_name"),patientId:pick("patientId","patient_id"),patientPhone:pick("patientPhone","patient_phone"),appointmentDate:pick("appointmentDate","appointment_date"),service:pick("service","service"),servicePrice:pick("servicePrice","service_price","0"),paidAmount:pick("paidAmount","paid_amount","0"),completedFee:pick("completedFee","completed_fee"),completedAt:pick("completedAt","completed_at"),status:pick("status","status","pending"),queueNumber:pick("queueNumber","queue_number"),notes:pick("notes","notes"),bloodPressure:pick("bloodPressure","blood_pressure"),weight:pick("weight","weight"),bloodSugar:pick("bloodSugar","blood_sugar"),preVisitNotes:pick("preVisitNotes","pre_visit_notes"),createdAt:pick("createdAt","created_at"),updatedAt:pick("updatedAt","updated_at"),archivedAt:pick("archivedAt","archived_at"),archivedByName:pick("archivedByName","archived_by_name"),archivedRescheduleHistory:pick("archivedRescheduleHistory","archived_reschedule_history_json","[]"),isArchived:Number(row?.is_archived)===1||p.isArchived===true};
}
function norm(value){return String(value||"").normalize("NFKC").replace(/[\u064B-\u065F\u0670]/g,"").replace(/[أإآ]/g,"ا").replace(/ى/g,"ي").replace(/\s+/g," ").trim().toLocaleLowerCase("ar");}
function normPhone(value){return String(value||"").replace(/\D/g,"");}
function validId(value){return typeof value==="string"&&/^[A-Za-z0-9_-]{1,150}$/.test(value);}
function canSearch(access){return access.accountType==="doctor"||["view","edit"].some(v=>access.permissions.bookings===v||access.permissions.patients===v||access.permissions.medicalRecords===v);}
function canResolve(access){return access.accountType==="doctor"||access.permissions.bookings==="edit"||access.permissions.patients==="edit"||access.permissions.medicalRecords==="edit";}
function canViewRecords(access){return access.accountType==="doctor"||["view","edit"].includes(access.permissions.medicalRecords);}
function canEditRecords(access){return access.accountType==="doctor"||access.permissions.medicalRecords==="edit";}
async function verifyUser(request,env){
  if(!env.FIREBASE_API_KEY)return {ok:false,status:503,message:"خدمة التحقق غير مهيأة."};
  const match=(request.headers.get("Authorization")||"").match(/^Bearer\s+(\S+)$/i);
  if(!match||match[1].length>8192)return {ok:false,status:401,message:"يلزم تسجيل الدخول."};
  const response=await fetch(LOOKUP_URL+"?key="+encodeURIComponent(env.FIREBASE_API_KEY),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken:match[1]})});
  if(!response.ok)return {ok:false,status:401,message:"جلسة الدخول غير صالحة. سجّل الدخول مجددًا."};
  const result=await response.json(),user=result.users?.[0];
  return user?.localId?{ok:true,uid:user.localId,email:user.email||""}:{ok:false,status:401,message:"تعذر التحقق من الحساب."};
}
async function accessFor(user,env){
  if(user.uid===DOCTOR_ADMIN_UID)return {ok:true,accountType:"doctor",uid:user.uid,displayName:"الدكتور",permissions:{bookings:"edit",patients:"edit",medicalRecords:"edit"}};
  const database=getClinicDatabase(env);
  const row=await d1First(database,"SELECT role, active, display_name, permissions_json FROM staff WHERE uid = ? LIMIT 1",[user.uid]);
  if(!row||row.role!=="staff"||Number(row.active)!==1)return {ok:false,status:403,message:"حساب الموظف غير نشط أو غير معتمد."};
  let permissions={};try{permissions=JSON.parse(row.permissions_json||"{}");}catch{}
  const p={bookings:permissions.bookings||"none",patients:permissions.patients||"none",medicalRecords:permissions.medicalRecords||"none"};
  if(!["view","edit"].some(v=>p.bookings===v||p.patients===v||p.medicalRecords===v))return {ok:false,status:403,message:"لا تملك صلاحية الوصول إلى ملفات المرضى."};
  return {ok:true,accountType:"staff",uid:user.uid,displayName:row.display_name||"الموظف",permissions:p};
}
async function allPatients(env){return (await d1All(getClinicDatabase(env),"SELECT * FROM medical_patients ORDER BY created_at ASC")).map(decode);}
async function allBookings(env){
  return (await d1All(getClinicDatabase(env),"SELECT * FROM bookings ORDER BY created_at ASC")).map(row=>{
    const b=decodeBookingRow(row);
    return b;
  });
}
async function findPatient(env,id){if(!validId(id))return null;const row=await d1First(getClinicDatabase(env),"SELECT * FROM medical_patients WHERE id = ? LIMIT 1",[id]);return row?decode(row):null;}
async function savePatient(env,patient){
  const db=getClinicDatabase(env),now=new Date().toISOString(),id=crypto.randomUUID();
  const data={...patient,id,patientNumber:patient.patientNumber||"P-"+Math.random().toString(36).slice(2,8).toUpperCase(),createdAt:patient.createdAt||now,updatedAt:now};
  await d1Run(db,"INSERT INTO medical_patients (id,patient_number,display_name,phone,gender,birth_date,notes,created_at,updated_at,source_payload_json) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [id,data.patientNumber,data.displayName,data.phone,data.gender,data.birthDate,data.notes,data.createdAt,data.updatedAt,JSON.stringify(data)]);
  return data;
}
async function updateBookingPatient(env,booking,patientId){
  const db=getClinicDatabase(env),payload={...booking,patientId};
  await d1Run(db,"UPDATE bookings SET patient_id = ?, source_payload_json = ? WHERE id = ?",[patientId,JSON.stringify(payload),booking.id]);
}
async function resolvePatient(env,data){
  let patient=data.patientId?await findPatient(env,String(data.patientId)):null;
  if(data.patientId&&!patient)throw new Error("ملف المريض المحدد لم يعد موجودًا. ابحث عنه مرة أخرى.");
  let name=String(data.patientName||"").trim(),phone=String(data.patientPhone||"").trim();
  if(!patient){
    const legacyBookingId=String(data.legacyBookingId||"");
    if(validId(legacyBookingId)&&(name.length<2||phone.length<5)){
      const legacy=(await allBookings(env)).find(item=>item.id===legacyBookingId);
      if(name.length<2)name=String(legacy?.patientName||"").trim();
      if(phone.length<5)phone=String(legacy?.patientPhone||"").trim();
    }
    if(name.length<2||name.length>120||phone.length<5||phone.length>40)throw new Error("أدخل اسم المريض ورقم هاتف صحيحًا.");
    const docs=await allPatients(env),found=docs.find(item=>norm(item.displayName)===norm(name)&&normPhone(item.phone)===normPhone(phone));
    patient=found||await savePatient(env,{displayName:name,phone,gender:String(data.gender||""),birthDate:String(data.birthDate||""),notes:""});
  }
  const bookings=await allBookings(env);
  for(const booking of bookings){
    if(booking.status==="completed"||booking.patientId||norm(booking.patientName)!==norm(patient.displayName)||normPhone(booking.patientPhone)!==normPhone(patient.phone))continue;
    await updateBookingPatient(env,booking,patient.id);
  }
  return patient;
}
async function searchPatients(env,query){
  const q=norm(query);if(q.length<1)return [];
  const [patients,bookings]=await Promise.all([allPatients(env),allBookings(env)]);
  const result=new Map();
  for(const p of patients)if(norm(p.displayName).includes(q)||norm(p.phone).includes(q)||norm(p.patientNumber).includes(q))result.set(p.id,{...p,legacy:false});
  for(const booking of bookings){
    const name=booking.patientName||"",phone=booking.patientPhone||"",id=booking.patientId||"";
    if(!name||(!norm(name).includes(q)&&!norm(phone).includes(q)))continue;
    if(id){if(!result.has(id)){const p=await findPatient(env,id);if(p)result.set(id,{...p,legacy:false});}continue;}
    const exists=[...result.values()].some(p=>norm(p.displayName)===norm(name)&&normPhone(p.phone)===normPhone(phone));
    if(exists)continue;
    const key=norm(name)+"|"+normPhone(phone);
    if(!result.has(key))result.set(key,{id:"",legacyBookingId:booking.id,displayName:name,phone,patientNumber:"",legacy:true});
  }
  return [...result.values()].filter(p=>norm(p.displayName).includes(q)||norm(p.phone).includes(q)||norm(p.patientNumber).includes(q)).slice(0,20);
}
async function getPatientHistory(env,patientId){
  const patient=await findPatient(env,patientId);if(!patient)throw new Error("ملف المريض غير موجود.");
  const db=getClinicDatabase(env);
  const [visitRows,bookings]=await Promise.all([d1All(db,"SELECT * FROM medical_visits WHERE patient_id = ? ORDER BY visit_date DESC, created_at DESC",[patientId]),allBookings(env)]);
  const visits=visitRows.map(decodeVisit);
  const linked=bookings.filter(b=>b.patientId===patientId||(!b.patientId&&norm(b.patientName)===norm(patient.displayName)&&normPhone(b.patientPhone)===normPhone(patient.phone)));
  const historyBookings=linked.map(b=>({id:b.id,appointmentDate:b.appointmentDate,patientName:b.patientName,patientPhone:b.patientPhone,service:b.service,status:b.status,bloodPressure:b.bloodPressure,weight:b.weight,bloodSugar:b.bloodSugar,preVisitNotes:b.preVisitNotes,createdAt:b.createdAt}));
  return {patient,visits,bookings:historyBookings};
}
async function onRequestInternal({request,env}){
  if(request.method!=="POST")return jsonResponse({message:"طريقة الطلب غير مسموحة."},405);
  if(!(request.headers.get("Content-Type")||"").toLowerCase().includes("application/json"))return jsonResponse({message:"نوع محتوى الطلب غير مدعوم."},415);
  let data;try{const raw=await request.text();if(raw.length>20000)return jsonResponse({message:"حجم الطلب أكبر من المسموح."},413);data=JSON.parse(raw);}catch{return jsonResponse({message:"صيغة الطلب غير صحيحة."},400);}
  if(!data||typeof data!=="object"||Array.isArray(data)||!["search","resolve","history","saveVisit","bookingDetails"].includes(data.action))return jsonResponse({message:"الإجراء المطلوب غير معروف."},400);
  const user=await verifyUser(request,env);if(!user.ok)return jsonResponse({message:user.message},user.status);
  let access;try{access=await accessFor(user,env);}catch(error){console.error("Medical records authorization failed:",error);return jsonResponse({message:"تعذر التحقق من صلاحيات السجلات الطبية."},503);}
  if(!access.ok)return jsonResponse({message:access.message},access.status);
  if(data.action==="search"&&!canSearch(access))return jsonResponse({message:"لا تملك صلاحية البحث في ملفات المرضى."},403);
  if(data.action==="resolve"&&!canResolve(access)&&!(data.patientId&&canSearch(access)))return jsonResponse({message:"لا تملك صلاحية ربط الحجز بملف مريض."},403);
  if(data.action==="history"&&!canViewRecords(access))return jsonResponse({message:"لا تملك صلاحية عرض السجلات الطبية."},403);
  if(data.action==="bookingDetails"&&access.accountType!=="doctor"&&!["view","edit"].includes(access.permissions.bookings))return jsonResponse({message:"لا تملك صلاحية عرض تفاصيل الحجز."},403);
  if(data.action==="saveVisit"&&!canEditRecords(access))return jsonResponse({message:"تحتاج إلى صلاحية تعديل السجلات الطبية."},403);
  const db=getClinicDatabase(env);
  try{
    if(data.action==="search"){const query=String(data.query||"").trim();if(query.length>120)return jsonResponse({message:"نص البحث أطول من المسموح."},400);return jsonResponse({patients:await searchPatients(env,query)});}
    if(data.action==="resolve"){if(data.patientId&&!canResolve(access)){const patient=await findPatient(env,String(data.patientId));return patient?jsonResponse({patient:{id:patient.id,patientNumber:patient.patientNumber,displayName:patient.displayName,phone:patient.phone}}):jsonResponse({message:"ملف المريض غير موجود."},404);}const patient=await resolvePatient(env,data);return jsonResponse({patient});}
    if(data.action==="history"){if(!validId(data.patientId))return jsonResponse({message:"رقم ملف المريض غير صحيح."},400);return jsonResponse(await getPatientHistory(env,data.patientId));}
    if(data.action==="bookingDetails"){
      const bookingId=String(data.bookingId||""),occurrenceDate=String(data.occurrenceDate||"").slice(0,10);
      if(!validId(bookingId))return jsonResponse({message:"رقم الحجز غير صحيح."},400);
      const row=await d1First(db,"SELECT * FROM bookings WHERE id = ? LIMIT 1",[bookingId]);
      if(!row)return jsonResponse({message:"الحجز غير موجود."},404);
      const bf=decodeBookingRow(row),status=bf.status||"pending",isArchived=bf.isArchived===true||bf.isArchived==="true";
      let archivedOccurrence=false,rescheduleToDate="";
      if(!isArchived&&!["archived","cancelled"].includes(status)&&occurrenceDate){
        let archivedHistory=[];try{archivedHistory=JSON.parse(bf.archivedRescheduleHistory||"[]");}catch{}
        const entry=Array.isArray(archivedHistory)?archivedHistory.find(item=>item&&item.fromDate===occurrenceDate&&/^\d{4}-\d{2}-\d{2}$/.test(item.toDate||"")):null;
        if(!entry)return jsonResponse({message:"هذا الموعد غير موجود في الأرشيف."},404);
        archivedOccurrence=true;rescheduleToDate=entry.toDate;
      }else if(!isArchived&&!["archived","cancelled"].includes(status))return jsonResponse({message:"هذا الحجز غير مؤرشف."},404);
      const booking={id:bookingId,patientName:bf.patientName,patientPhone:bf.patientPhone,appointmentDate:archivedOccurrence?occurrenceDate:bf.appointmentDate,currentAppointmentDate:bf.appointmentDate,service:bf.service,servicePrice:bf.servicePrice,paidAmount:bf.paidAmount,completedFee:bf.completedFee,completedAt:bf.completedAt,status,queueNumber:bf.queueNumber,notes:bf.notes,bloodPressure:bf.bloodPressure,weight:bf.weight,bloodSugar:bf.bloodSugar,preVisitNotes:bf.preVisitNotes,createdAt:bf.createdAt,updatedAt:bf.updatedAt,archivedAt:bf.archivedAt,archivedByName:bf.archivedByName,isArchivedOccurrence:archivedOccurrence,rescheduleToDate};
      let visit=null,patient=null;
      if(canViewRecords(access)){
        const visitRow=await d1First(db,"SELECT * FROM medical_visits WHERE booking_id = ? LIMIT 1",[bookingId]);
        if(visitRow)visit=decodeVisit(visitRow);
        const patientId=visit?.patientId||bf.patientId;
        if(patientId&&validId(patientId))patient=await findPatient(env,patientId);
      }
      return jsonResponse({booking,visit,patient,medicalRecordsVisible:canViewRecords(access)});
    }
    const patientId=String(data.patientId||""),bookingId=String(data.bookingId||"");
    if(!validId(patientId)||!validId(bookingId))return jsonResponse({message:"حدد ملف المريض والحجز المرتبط بالكشف."},400);
    const patient=await findPatient(env,patientId);if(!patient)return jsonResponse({message:"ملف المريض غير موجود."},404);
    const bookingRow=await d1First(db,"SELECT * FROM bookings WHERE id = ? LIMIT 1",[bookingId]);if(!bookingRow)return jsonResponse({message:"الحجز المرتبط بالكشف غير موجود."},404);
    const booking=decodeBookingRow(bookingRow);
    if(booking.patientId&&booking.patientId!==patientId)return jsonResponse({message:"هذا الحجز مرتبط بملف مريض آخر."},409);
    if(booking.status==="completed")return jsonResponse({message:"تم اعتماد هذا الكشف نهائيًا؛ لا يمكن تعديل بياناته."},409);
    const visitDate=String(data.visitDate||booking.appointmentDate||"").slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(visitDate)||Number.isNaN(Date.parse(visitDate+"T12:00:00")))return jsonResponse({message:"تاريخ الكشف غير صحيح."},400);
    const keys=["bloodPressure","weight","bloodSugar","preVisitNotes","diagnosis","clinicalNotes","treatment","followUp","followUpNotes","followUpDays","followUpDate"];
    const visit={patientId,bookingId,visitDate,queueNumber:String(data.queueNumber||""),createdByName:access.displayName||"الدكتور"};
    for(const key of keys){visit[key]=String(data[key]||"").trim();if(visit[key].length>(key==="clinicalNotes"||key==="treatment"?4000:1000))return jsonResponse({message:"أحد حقول الكشف أطول من المسموح."},400);}
    if(visit.followUpDays&&(!/^\d{1,4}$/.test(visit.followUpDays)||Number(visit.followUpDays)>3650))return jsonResponse({message:"عدد أيام المتابعة غير صحيح."},400);
    if(visit.followUpDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(visit.followUpDate)||Number.isNaN(Date.parse(visit.followUpDate+"T12:00:00"))))return jsonResponse({message:"تاريخ المتابعة غير صحيح."},400);
    if(visit.weight&&(!/^\d{1,3}(\.\d{1,2})?$/.test(visit.weight)||Number(visit.weight)<0||Number(visit.weight)>500))return jsonResponse({message:"قيمة الوزن غير صحيحة."},400);
    const now=new Date().toISOString(),existingRow=await d1First(db,"SELECT * FROM medical_visits WHERE booking_id = ? LIMIT 1",[bookingId]),existing=existingRow?decodeVisit(existingRow):null;
    if(existing&&existing.patientId!==patientId)return jsonResponse({message:"هذا الكشف مرتبط بملف مريض آخر ولا يمكن نقله."},409);
    visit.updatedAt=now;visit.createdAt=existing?.createdAt||now;
    const id=existing?.id||crypto.randomUUID();
    const saved={...visit,id};
    await d1Run(db,"INSERT INTO medical_visits (id,patient_id,booking_id,visit_date,queue_number,blood_pressure,weight,blood_sugar,pre_visit_notes,diagnosis,clinical_notes,treatment,follow_up,follow_up_notes,follow_up_days,follow_up_date,created_at,updated_at,created_by_name,source_payload_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET patient_id=excluded.patient_id,booking_id=excluded.booking_id,visit_date=excluded.visit_date,queue_number=excluded.queue_number,blood_pressure=excluded.blood_pressure,weight=excluded.weight,blood_sugar=excluded.blood_sugar,pre_visit_notes=excluded.pre_visit_notes,diagnosis=excluded.diagnosis,clinical_notes=excluded.clinical_notes,treatment=excluded.treatment,follow_up=excluded.follow_up,follow_up_notes=excluded.follow_up_notes,follow_up_days=excluded.follow_up_days,follow_up_date=excluded.follow_up_date,updated_at=excluded.updated_at,source_payload_json=excluded.source_payload_json",
      [id,patientId,bookingId,visitDate,visit.queueNumber,visit.bloodPressure,visit.weight,visit.bloodSugar,visit.preVisitNotes,visit.diagnosis,visit.clinicalNotes,visit.treatment,visit.followUp,visit.followUpNotes,visit.followUpDays,visit.followUpDate,visit.createdAt,visit.updatedAt,visit.createdByName,JSON.stringify(saved)]);
    const updatedBooking={...booking,patientId,bloodPressure:visit.bloodPressure,weight:visit.weight,bloodSugar:visit.bloodSugar,preVisitNotes:visit.preVisitNotes};
    const payload={...updatedBooking};
    await d1Run(db,"UPDATE bookings SET patient_id=?,blood_pressure=?,weight=?,blood_sugar=?,pre_visit_notes=?,source_payload_json=? WHERE id=?",
      [patientId,visit.bloodPressure,visit.weight,visit.bloodSugar,visit.preVisitNotes,JSON.stringify(payload),bookingId]);
    return jsonResponse({visit:saved});
  }catch(error){console.error("Medical records request failed:",error);return jsonResponse({message:error.message||"تعذر تنفيذ العملية الطبية."},error.status===404?404:400);}
}


export async function onRequest(context) {
  let input = {};
  try { input = await context.request.clone().json(); } catch {}
  const result = await onRequestInternal(context);
  if (result.ok && input.action === "saveVisit") {
    const notification = publishClinicRealtime(context.env, "medical_record_changed");
    if (typeof context.waitUntil === "function") context.waitUntil(notification);
    else void notification;
  }
  return result;
}
