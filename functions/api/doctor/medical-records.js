import { publishClinicRealtime } from "../../_shared/realtime.js";
const DOCTOR_ADMIN_UID = "8fUdGutQHRau3RXQIrRtZUqQ9Nm1";
const EXPECTED_PROJECT_ID = "clinics-manger";
const STAFF_COLLECTION = "clinicStaff";
const BOOKINGS_COLLECTION = "clinicBookings";
const PATIENTS_COLLECTION = "clinicMedicalPatients";
const VISITS_COLLECTION = "clinicMedicalVisits";
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
function encodeBytes(bytes) { let binary=""; for (const byte of bytes) binary+=String.fromCharCode(byte); return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,""); }
function encodeText(value) { return encodeBytes(new TextEncoder().encode(value)); }
function privateKeyBytes(pem) { const raw=atob(pem.replace(/-----BEGIN PRIVATE KEY-----/g,"").replace(/-----END PRIVATE KEY-----/g,"").replace(/\s/g,"")); const bytes=new Uint8Array(raw.length); for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i); return bytes; }
function parseServiceAccount(env) {
  if(!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error("Missing service account configuration.");
  const account=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if(account.project_id!==EXPECTED_PROJECT_ID||!account.client_email||!account.private_key) throw new Error("Invalid service account configuration.");
  return account;
}
async function accessToken(account) {
  const now=Math.floor(Date.now()/1000);
  const unsigned=[encodeText(JSON.stringify({alg:"RS256",typ:"JWT"})),encodeText(JSON.stringify({iss:account.client_email,scope:SCOPE,aud:TOKEN_URL,iat:now,exp:now+3600}))].join(".");
  const key=await crypto.subtle.importKey("pkcs8",privateKeyBytes(account.private_key),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const signature=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,new TextEncoder().encode(unsigned));
  const response=await fetch(TOKEN_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:unsigned+"."+encodeBytes(new Uint8Array(signature))})});
  if(!response.ok)throw new Error("تعذر تهيئة خدمة السجلات الطبية.");
  const result=await response.json(); if(!result.access_token)throw new Error("تعذر تهيئة خدمة السجلات الطبية."); return result.access_token;
}
function docsUrl(projectId,path=""){return "https://firestore.googleapis.com/v1/projects/"+encodeURIComponent(projectId)+"/databases/(default)/documents"+path;}
async function firestore(projectId,token,path,options={}) {
  const response=await fetch(docsUrl(projectId,path),{...options,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",...(options.headers||{})}});
  if(response.status===404)return null;
  if(!response.ok){const details=await response.text();console.error("Medical records Firestore error:",response.status,details.slice(0,400));const error=new Error("تعذر الوصول إلى السجلات الطبية.");error.status=response.status;throw error;}
  const raw=await response.text();return raw?JSON.parse(raw):null;
}
function str(value){return {stringValue:String(value??"")};}
function read(fields,key){return fields?.[key]?.stringValue||"";}
function norm(value){return String(value||"").normalize("NFKC").replace(/[\u064B-\u065F\u0670]/g,"").replace(/[أإآ]/g,"ا").replace(/ى/g,"ي").replace(/\s+/g," ").trim().toLocaleLowerCase("ar");}
function normPhone(value){return String(value||"").replace(/\D/g,"");}
function decode(document){const fields=document?.fields||{};return {id:(document?.name||"").split("/").pop(),patientNumber:read(fields,"patientNumber"),displayName:read(fields,"displayName"),phone:read(fields,"phone"),gender:read(fields,"gender"),birthDate:read(fields,"birthDate"),notes:read(fields,"notes"),createdAt:read(fields,"createdAt"),updatedAt:read(fields,"updatedAt")};}
function decodeVisit(document){const f=document?.fields||{};return {id:(document?.name||"").split("/").pop(),patientId:read(f,"patientId"),bookingId:read(f,"bookingId"),visitDate:read(f,"visitDate"),queueNumber:read(f,"queueNumber"),bloodPressure:read(f,"bloodPressure"),weight:read(f,"weight"),bloodSugar:read(f,"bloodSugar"),preVisitNotes:read(f,"preVisitNotes"),diagnosis:read(f,"diagnosis"),clinicalNotes:read(f,"clinicalNotes"),treatment:read(f,"treatment"),followUp:read(f,"followUp"),followUpNotes:read(f,"followUpNotes"),followUpDays:read(f,"followUpDays"),followUpDate:read(f,"followUpDate"),createdAt:read(f,"createdAt"),updatedAt:read(f,"updatedAt"),createdByName:read(f,"createdByName")};}
function fieldsFrom(value,keys){const fields={};for(const key of keys)fields[key]=str(value[key]);return {fields};}
async function collection(projectId,token,name){const result=await firestore(projectId,token,":runQuery",{method:"POST",body:JSON.stringify({structuredQuery:{from:[{collectionId:name}]}})});return (Array.isArray(result)?result:[]).filter(x=>x.document).map(x=>x.document);}
async function queryCollectionByStringField(projectId,token,name,fieldPath,value,limit=1){const result=await firestore(projectId,token,":runQuery",{method:"POST",body:JSON.stringify({structuredQuery:{from:[{collectionId:name}],where:{fieldFilter:{field:{fieldPath},op:"EQUAL",value:str(value)}},limit}})});return (Array.isArray(result)?result:[]).filter(x=>x.document).map(x=>x.document);}
async function verifyUser(request,env){
  if(!env.FIREBASE_API_KEY)return {ok:false,status:503,message:"خدمة التحقق غير مهيأة."};
  const match=(request.headers.get("Authorization")||"").match(/^Bearer\s+(\S+)$/i);
  if(!match||match[1].length>8192)return {ok:false,status:401,message:"يلزم تسجيل الدخول."};
  const response=await fetch(LOOKUP_URL+"?key="+encodeURIComponent(env.FIREBASE_API_KEY),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken:match[1]})});
  if(!response.ok)return {ok:false,status:401,message:"جلسة الدخول غير صالحة. سجّل الدخول مجددًا."};
  const result=await response.json(),user=result.users?.[0];return user?.localId?{ok:true,uid:user.localId,email:user.email||""}:{ok:false,status:401,message:"تعذر التحقق من الحساب."};
}
async function accessFor(user,projectId,token){
  if(user.uid===DOCTOR_ADMIN_UID)return {ok:true,accountType:"doctor",uid:user.uid,displayName:"الدكتور",permissions:{bookings:"edit",patients:"edit",medicalRecords:"edit"}};
  const doc=await firestore(projectId,token,"/"+STAFF_COLLECTION+"/"+encodeURIComponent(user.uid));
  const f=doc?.fields||{},permissions=f.permissions?.mapValue?.fields||{};
  if(read(f,"role")!=="staff"||f.active?.booleanValue!==true)return {ok:false,status:403,message:"حساب الموظف غير نشط أو غير معتمد."};
  const p={bookings:read(permissions,"bookings"),patients:read(permissions,"patients"),medicalRecords:read(permissions,"medicalRecords")};
  if(!["view","edit"].some(v=>p.bookings===v||p.patients===v||p.medicalRecords===v))return {ok:false,status:403,message:"لا تملك صلاحية الوصول إلى ملفات المرضى."};
  return {ok:true,accountType:"staff",uid:user.uid,displayName:read(f,"displayName")||"الموظف",permissions:p};
}
function canSearch(access){return access.accountType==="doctor"||["view","edit"].some(v=>access.permissions.bookings===v||access.permissions.patients===v||access.permissions.medicalRecords===v);}
function canResolve(access){return access.accountType==="doctor"||access.permissions.bookings==="edit"||access.permissions.patients==="edit"||access.permissions.medicalRecords==="edit";}
function canViewRecords(access){return access.accountType==="doctor"||["view","edit"].includes(access.permissions.medicalRecords);}
function canEditRecords(access){return access.accountType==="doctor"||access.permissions.medicalRecords==="edit";}
function validId(value){return typeof value==="string"&&/^[A-Za-z0-9_-]{1,150}$/.test(value);}
async function findPatient(projectId,token,id){if(!validId(id))return null;const doc=await firestore(projectId,token,"/"+PATIENTS_COLLECTION+"/"+encodeURIComponent(id));return doc?decode(doc):null;}
async function savePatient(projectId,token,patient){
  const now=new Date().toISOString(),patientNumber=patient.patientNumber||"P-"+Math.random().toString(36).slice(2,8).toUpperCase();
  const data={...patient,patientNumber,createdAt:patient.createdAt||now,updatedAt:now};
  const result=await firestore(projectId,token,"/"+PATIENTS_COLLECTION,{method:"POST",body:JSON.stringify(fieldsFrom(data,["patientNumber","displayName","phone","gender","birthDate","notes","createdAt","updatedAt"]))});
  return decode(result);
}
async function updateBookingPatient(projectId,token,doc,patientId){
  const id=(doc.name||"").split("/").pop();if(!validId(id))return;
  await firestore(projectId,token,"/"+BOOKINGS_COLLECTION+"/"+encodeURIComponent(id)+"?updateMask.fieldPaths=patientId",{method:"PATCH",body:JSON.stringify({fields:{patientId:str(patientId)}})});
}
async function resolvePatient(projectId,token,data,access){
  let patient=data.patientId?await findPatient(projectId,token,String(data.patientId)):null;
  if(data.patientId&&!patient)throw new Error("ملف المريض المحدد لم يعد موجودًا. ابحث عنه مرة أخرى.");
  let name=String(data.patientName||"").trim(),phone=String(data.patientPhone||"").trim();
  if(!patient){
    // نتائج "ملف سابق" لا تملك patientId؛ استعد الاسم والهاتف من الحجز الأصلي إذا كانا ناقصين في النموذج.
    const legacyBookingId=String(data.legacyBookingId||"");
    if(validId(legacyBookingId)&&(name.length<2||phone.length<5)){
      const legacyBooking=await firestore(projectId,token,"/"+BOOKINGS_COLLECTION+"/"+encodeURIComponent(legacyBookingId));
      const legacyFields=legacyBooking?.fields||{};
      if(name.length<2)name=read(legacyFields,"patientName").trim();
      if(phone.length<5)phone=read(legacyFields,"patientPhone").trim();
    }
    if(name.length<2||name.length>120||phone.length<5||phone.length>40)throw new Error("أدخل اسم المريض ورقم هاتف صحيحًا.");
    const docs=await collection(projectId,token,PATIENTS_COLLECTION);
    const found=docs.map(decode).find(p=>norm(p.displayName)===norm(name)&&normPhone(p.phone)===normPhone(phone));
    patient=found||await savePatient(projectId,token,{displayName:name,phone,gender:String(data.gender||""),birthDate:String(data.birthDate||""),notes:""});
  }
  // ربط الحجوزات القديمة فقط عند تطابق الاسم والهاتف معًا، وليس اعتمادًا على الاسم وحده.
  const bookings=await collection(projectId,token,BOOKINGS_COLLECTION);
  for(const doc of bookings){
    const f=doc.fields||{};
    if(read(f,"status")==="completed"||read(f,"patientId")||norm(read(f,"patientName"))!==norm(patient.displayName)||normPhone(read(f,"patientPhone"))!==normPhone(patient.phone))continue;
    await updateBookingPatient(projectId,token,doc,patient.id);
  }
  return patient;
}
async function searchPatients(projectId,token,query){
  const q=norm(query);if(q.length<1)return [];
  const [patientDocs,bookingDocs]=await Promise.all([collection(projectId,token,PATIENTS_COLLECTION),collection(projectId,token,BOOKINGS_COLLECTION)]);
  const result=new Map();
  for(const doc of patientDocs){const p=decode(doc);if(norm(p.displayName).includes(q)||norm(p.phone).includes(q)||norm(p.patientNumber).includes(q))result.set(p.id,{...p,legacy:false});}
  for(const doc of bookingDocs){
    const f=doc.fields||{},name=read(f,"patientName"),phone=read(f,"patientPhone"),id=read(f,"patientId");
    if(!name||(!norm(name).includes(q)&&!norm(phone).includes(q)))continue;
    if(id){if(!result.has(id)){const p=await findPatient(projectId,token,id);if(p)result.set(id,{...p,legacy:false});}continue;}
    const alreadyHasProfile=[...result.values()].some(p=>norm(p.displayName)===norm(name)&&normPhone(p.phone)===normPhone(phone));
    if(alreadyHasProfile)continue;
    const key=norm(name)+"|"+normPhone(phone);
    if(!result.has(key))result.set(key,{id:"",legacyBookingId:(doc.name||"").split("/").pop(),displayName:name,phone,patientNumber:"",legacy:true});
  }
  return [...result.values()].filter(p=>norm(p.displayName).includes(q)||norm(p.phone).includes(q)||norm(p.patientNumber).includes(q)).slice(0,20);
}
async function getPatientHistory(projectId,token,patientId){
  const patient=await findPatient(projectId,token,patientId);if(!patient)throw new Error("ملف المريض غير موجود.");
  const [visitDocs,bookingDocs]=await Promise.all([collection(projectId,token,VISITS_COLLECTION),collection(projectId,token,BOOKINGS_COLLECTION)]);
  const visits=visitDocs.map(decodeVisit).filter(v=>v.patientId===patientId).sort((a,b)=>String(b.visitDate).localeCompare(String(a.visitDate))||String(b.createdAt).localeCompare(String(a.createdAt)));
  const bookings=bookingDocs.map(doc=>({doc,fields:doc.fields||{}})).filter(x=>read(x.fields,"patientId")===patientId||(!read(x.fields,"patientId")&&norm(read(x.fields,"patientName"))===norm(patient.displayName)&&normPhone(read(x.fields,"patientPhone"))===normPhone(patient.phone))).map(x=>({id:(x.doc.name||"").split("/").pop(),appointmentDate:read(x.fields,"appointmentDate"),patientName:read(x.fields,"patientName"),patientPhone:read(x.fields,"patientPhone"),service:read(x.fields,"service"),status:read(x.fields,"status"),bloodPressure:read(x.fields,"bloodPressure"),weight:read(x.fields,"weight"),bloodSugar:read(x.fields,"bloodSugar"),preVisitNotes:read(x.fields,"preVisitNotes"),createdAt:read(x.fields,"createdAt")}));
  return {patient,visits,bookings};
}
async function onRequestInternal({request,env}){
  if(request.method!=="POST")return jsonResponse({message:"طريقة الطلب غير مسموحة."},405);
  if(!(request.headers.get("Content-Type")||"").toLowerCase().includes("application/json"))return jsonResponse({message:"نوع محتوى الطلب غير مدعوم."},415);
  let data;try{const raw=await request.text();if(raw.length>20000)return jsonResponse({message:"حجم الطلب أكبر من المسموح."},413);data=JSON.parse(raw);}catch{return jsonResponse({message:"صيغة الطلب غير صحيحة."},400);}
  if(!data||typeof data!=="object"||Array.isArray(data)||!["search","resolve","history","saveVisit","bookingDetails"].includes(data.action))return jsonResponse({message:"الإجراء المطلوب غير معروف."},400);
  const user=await verifyUser(request,env);if(!user.ok)return jsonResponse({message:user.message},user.status);
  let account,token,access;try{account=parseServiceAccount(env);token=await accessToken(account);access=await accessFor(user,account.project_id,token);}catch(error){console.error("Medical records authorization failed:",error);return jsonResponse({message:"تعذر التحقق من صلاحيات السجلات الطبية."},503);}
  if(!access.ok)return jsonResponse({message:access.message},access.status);
  if(data.action==="search"&&!canSearch(access))return jsonResponse({message:"لا تملك صلاحية البحث في ملفات المرضى."},403);
  if(data.action==="resolve"&&!canResolve(access)&&!(data.patientId&&canSearch(access)))return jsonResponse({message:"لا تملك صلاحية ربط الحجز بملف مريض."},403);
  if(data.action==="history"&&!canViewRecords(access))return jsonResponse({message:"لا تملك صلاحية عرض السجلات الطبية."},403);
  if(data.action==="bookingDetails"&&access.accountType!=="doctor"&&!["view","edit"].includes(access.permissions.bookings))return jsonResponse({message:"لا تملك صلاحية عرض تفاصيل الحجز."},403);
  if(data.action==="saveVisit"&&!canEditRecords(access))return jsonResponse({message:"تحتاج إلى صلاحية تعديل السجلات الطبية."},403);
  try{
    if(data.action==="search"){const query=String(data.query||"").trim();if(query.length>120)return jsonResponse({message:"نص البحث أطول من المسموح."},400);return jsonResponse({patients:await searchPatients(account.project_id,token,query)});}
    if(data.action==="resolve"){if(data.patientId&&!canResolve(access)){const patient=await findPatient(account.project_id,token,String(data.patientId));return patient?jsonResponse({patient:{id:patient.id,patientNumber:patient.patientNumber,displayName:patient.displayName,phone:patient.phone}}):jsonResponse({message:"ملف المريض غير موجود."},404);}const patient=await resolvePatient(account.project_id,token,data,access);return jsonResponse({patient});}
    if(data.action==="history"){if(!validId(data.patientId))return jsonResponse({message:"رقم ملف المريض غير صحيح."},400);return jsonResponse(await getPatientHistory(account.project_id,token,data.patientId));}
    if(data.action==="bookingDetails"){
      const bookingId=String(data.bookingId||""), occurrenceDate=String(data.occurrenceDate||"").slice(0,10);
      if(!validId(bookingId))return jsonResponse({message:"رقم الحجز غير صحيح."},400);
      const bookingDoc=await firestore(account.project_id,token,"/"+BOOKINGS_COLLECTION+"/"+encodeURIComponent(bookingId));
      if(!bookingDoc)return jsonResponse({message:"الحجز غير موجود."},404);
      const bf=bookingDoc.fields||{}, status=read(bf,"status")||"pending", isArchived=bf.isArchived?.booleanValue===true||read(bf,"isArchived")==="true";
      let archivedOccurrence=false, rescheduleToDate="";
      if(!isArchived&&!["archived","cancelled"].includes(status)&&occurrenceDate){
        let archivedHistory=[];try{archivedHistory=JSON.parse(read(bf,"archivedRescheduleHistory")||"[]");}catch{}
        const entry=Array.isArray(archivedHistory)?archivedHistory.find(item=>item&&item.fromDate===occurrenceDate&&/^\d{4}-\d{2}-\d{2}$/.test(item.toDate||"")):null;
        if(!entry)return jsonResponse({message:"هذا الموعد غير موجود في الأرشيف."},404);
        archivedOccurrence=true;rescheduleToDate=entry.toDate;
      }else if(!isArchived&&!["archived","cancelled"].includes(status)){
        return jsonResponse({message:"هذا الحجز غير مؤرشف."},404);
      }
      const booking={
        id:bookingId,patientName:read(bf,"patientName"),patientPhone:read(bf,"patientPhone"),
        appointmentDate:archivedOccurrence?occurrenceDate:read(bf,"appointmentDate"),
        currentAppointmentDate:read(bf,"appointmentDate"),service:read(bf,"service"),
        servicePrice:read(bf,"servicePrice"),paidAmount:read(bf,"paidAmount"),
        completedFee:read(bf,"completedFee"),completedAt:read(bf,"completedAt"),
        status,queueNumber:read(bf,"queueNumber"),notes:read(bf,"notes"),
        bloodPressure:read(bf,"bloodPressure"),weight:read(bf,"weight"),bloodSugar:read(bf,"bloodSugar"),
        preVisitNotes:read(bf,"preVisitNotes"),createdAt:read(bf,"createdAt"),updatedAt:read(bf,"updatedAt"),
        archivedAt:read(bf,"archivedAt"),archivedByName:read(bf,"archivedByName"),
        isArchivedOccurrence:archivedOccurrence,rescheduleToDate
      };
      let visit=null,patient=null;
      if(canViewRecords(access)){
        const visitResult=await firestore(account.project_id,token,":runQuery",{method:"POST",body:JSON.stringify({structuredQuery:{
          from:[{collectionId:VISITS_COLLECTION}],
          where:{fieldFilter:{field:{fieldPath:"bookingId"},op:"EQUAL",value:str(bookingId)}},
          limit:1
        }})});
        const visitDoc=Array.isArray(visitResult)?visitResult.find(item=>item.document)?.document:null;
        if(visitDoc) visit=decodeVisit(visitDoc);
        const patientId=visit?.patientId||read(bf,"patientId");
        if(patientId&&validId(patientId))patient=await findPatient(account.project_id,token,patientId);
      }
      return jsonResponse({booking,visit,patient,medicalRecordsVisible:canViewRecords(access)});
    }

    const patientId=String(data.patientId||""),bookingId=String(data.bookingId||"");
    if(!validId(patientId)||!validId(bookingId))return jsonResponse({message:"حدد ملف المريض والحجز المرتبط بالكشف."},400);
    const patient=await findPatient(account.project_id,token,patientId);if(!patient)return jsonResponse({message:"ملف المريض غير موجود."},404);
    const bookingDoc=await firestore(account.project_id,token,"/"+BOOKINGS_COLLECTION+"/"+encodeURIComponent(bookingId));if(!bookingDoc)return jsonResponse({message:"الحجز المرتبط بالكشف غير موجود."},404);
    const bf=bookingDoc.fields||{};if(read(bf,"patientId")&&read(bf,"patientId")!==patientId)return jsonResponse({message:"هذا الحجز مرتبط بملف مريض آخر."},409);
    if(read(bf,"status")==="completed")return jsonResponse({message:"تم اعتماد هذا الكشف نهائيًا؛ لا يمكن تعديل بياناته."},409);
    const visitDate=String(data.visitDate||read(bf,"appointmentDate")||"").slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(visitDate)||Number.isNaN(Date.parse(visitDate+"T12:00:00")))return jsonResponse({message:"تاريخ الكشف غير صحيح."},400);
    const keys=["bloodPressure","weight","bloodSugar","preVisitNotes","diagnosis","clinicalNotes","treatment","followUp","followUpNotes","followUpDays","followUpDate"];
    const visit={patientId,bookingId,visitDate,queueNumber:String(data.queueNumber||""),createdByName:access.displayName||"الدكتور"};
    for(const key of keys){visit[key]=String(data[key]||"").trim();if(visit[key].length>(key==="clinicalNotes"||key==="treatment"?4000:1000))return jsonResponse({message:"أحد حقول الكشف أطول من المسموح."},400);}
    if(visit.followUpDays && (!/^\d{1,4}$/.test(visit.followUpDays)||Number(visit.followUpDays)>3650))return jsonResponse({message:"عدد أيام المتابعة غير صحيح."},400);
    if(visit.followUpDate && (!/^\d{4}-\d{2}-\d{2}$/.test(visit.followUpDate)||Number.isNaN(Date.parse(visit.followUpDate+"T12:00:00"))))return jsonResponse({message:"تاريخ المتابعة غير صحيح."},400);
    if(visit.weight && (!/^\d{1,3}(\.\d{1,2})?$/.test(visit.weight)||Number(visit.weight)<0||Number(visit.weight)>500))return jsonResponse({message:"قيمة الوزن غير صحيحة."},400);
    const now=new Date().toISOString(),existing=(await queryCollectionByStringField(account.project_id,token,VISITS_COLLECTION,"bookingId",bookingId,1)).map(decodeVisit)[0]||null;
    if(existing&&existing.patientId!==patientId)return jsonResponse({message:"هذا الكشف مرتبط بملف مريض آخر ولا يمكن نقله."},409);
    visit.updatedAt=now;visit.createdAt=existing?.createdAt||now;
    let saved;
    if(existing){const patch=fieldsFrom(visit,["patientId","bookingId","visitDate","queueNumber",...keys,"createdByName","createdAt","updatedAt"]);saved=await firestore(account.project_id,token,"/"+VISITS_COLLECTION+"/"+encodeURIComponent(existing.id)+"?"+Object.keys(patch.fields).map(k=>"updateMask.fieldPaths="+encodeURIComponent(k)).join("&"),{method:"PATCH",body:JSON.stringify(patch)});}
    else saved=await firestore(account.project_id,token,"/"+VISITS_COLLECTION,{method:"POST",body:JSON.stringify(fieldsFrom(visit,["patientId","bookingId","visitDate","queueNumber",...keys,"createdByName","createdAt","updatedAt"]))});
    await firestore(account.project_id,token,"/"+BOOKINGS_COLLECTION+"/"+encodeURIComponent(bookingId)+"?"+["patientId","bloodPressure","weight","bloodSugar","preVisitNotes"].map(k=>"updateMask.fieldPaths="+k).join("&"),{method:"PATCH",body:JSON.stringify({fields:{patientId:str(patientId),bloodPressure:str(visit.bloodPressure),weight:str(visit.weight),bloodSugar:str(visit.bloodSugar),preVisitNotes:str(visit.preVisitNotes)}})});
    return jsonResponse({visit:decodeVisit(saved)});
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
