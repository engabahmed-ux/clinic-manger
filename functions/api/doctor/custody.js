import { publishClinicRealtime } from "../../_shared/realtime.js";

const DOCTOR_UID = "8fUdGutQHRau3RXQIrRtZUqQ9Nm1";
const PROJECT = "clinics-manger";
const LOOKUP = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const COLLECTION = "clinicAccountRecords";
const LOCK_ID = "staff-custody-active-session";

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer"
  }});
}
function b64(bytes) { let s=""; for (const b of bytes) s+=String.fromCharCode(b); return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,""); }
function b64t(v) { return b64(new TextEncoder().encode(v)); }
function keyBytes(pem) { const s=atob(pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"")); return Uint8Array.from(s,c=>c.charCodeAt(0)); }
async function googleToken(a) {
  const now=Math.floor(Date.now()/1000), unsigned=[b64t(JSON.stringify({alg:"RS256",typ:"JWT"})),b64t(JSON.stringify({iss:a.client_email,scope:SCOPE,aud:TOKEN_URL,iat:now,exp:now+3600}))].join(".");
  const key=await crypto.subtle.importKey("pkcs8",keyBytes(a.private_key),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,new TextEncoder().encode(unsigned));
  const r=await fetch(TOKEN_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:unsigned+"."+b64(new Uint8Array(sig))})});
  if(!r.ok) throw new Error("تعذر تهيئة خدمة العهدة.");
  const j=await r.json(); if(!j.access_token) throw new Error("تعذر تهيئة خدمة العهدة."); return j.access_token;
}
function url(project,path="") { return "https://firestore.googleapis.com/v1/projects/"+encodeURIComponent(project)+"/databases/(default)/documents"+path; }
async function fs(project,token,path,options={}) {
  const r=await fetch(url(project,path),{...options,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",...(options.headers||{})}});
  if(!r.ok) { const t=await r.text(); if(r.status===404) return null; if(r.status===409||r.status===412) return {__conflict:true}; console.error("Custody Firestore error",r.status,t.slice(0,300)); throw new Error("تعذر حفظ بيانات العهدة."); }
  if(r.status===204) return null; const t=await r.text(); return t?JSON.parse(t):null;
}
const sv=v=>({stringValue:String(v??"")});
function enc(o){const fields={};for(const [k,v] of Object.entries(o)) if(v!==undefined&&v!==null) fields[k]=typeof v==="number"?{integerValue:String(v)}:typeof v==="boolean"?{booleanValue:v}:sv(v);return {fields};}
function dec(d){const f=d?.fields||{},o={id:d?.name?.split("/").pop()};for(const[k,v]of Object.entries(f))o[k]=v.stringValue??v.integerValue??v.booleanValue??"";return o;}
function cairoDate(value){if(!value)return"";const d=new Date(value);if(Number.isNaN(d.getTime()))return String(value).slice(0,10);const p=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d),v=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${v.year}-${v.month}-${v.day}`;}
async function authenticate(request,env) {
  if(!env.FIREBASE_API_KEY||!env.FIREBASE_SERVICE_ACCOUNT_JSON) return {error:"إعدادات التحقق غير مكتملة.",status:503};
  const m=(request.headers.get("Authorization")||"").match(/^Bearer\s+(\S+)$/i);if(!m||m[1].length>8192)return {error:"يلزم تسجيل الدخول.",status:401};
  const r=await fetch(LOOKUP+"?key="+encodeURIComponent(env.FIREBASE_API_KEY),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken:m[1]})});
  if(!r.ok)return {error:"جلسة الدخول غير صالحة.",status:401};const user=(await r.json()).users?.[0];if(!user?.localId)return {error:"تعذر التحقق من الحساب.",status:401};
  const a=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);if(a.project_id!==PROJECT||!a.client_email||!a.private_key)return {error:"إعدادات الخدمة غير صحيحة.",status:503};
  const token=await googleToken(a);if(user.localId===DOCTOR_UID)return {uid:user.localId,name:"الدكتور",role:"doctor",token,project:PROJECT};
  const doc=await fs(PROJECT,token,"/clinicStaff/"+encodeURIComponent(user.localId));const f=doc?.fields||{};
  const read=k=>f[k]?.stringValue||"";
  if(f.active?.booleanValue!==true||read("role")!=="staff")return {error:"حساب الموظف غير نشط أو غير معتمد.",status:403};
  const accountPermission=f.permissions?.mapValue?.fields?.accounts?.stringValue||"none";
  return {uid:user.localId,name:read("displayName")||"الموظف",role:"staff",accountPermission,token,project:PROJECT};
}
async function readDoc(ctx,id){return dec(await fs(ctx.project,ctx.token,"/"+COLLECTION+"/"+encodeURIComponent(id)));}
async function createRecord(ctx,id,record){return fs(ctx.project,ctx.token,"/"+COLLECTION+"/"+encodeURIComponent(id)+"?currentDocument.exists=false",{method:"PATCH",body:JSON.stringify(enc(record))});}
async function listCustodyRecords(ctx){const result=await fs(ctx.project,ctx.token,":runQuery",{method:"POST",body:JSON.stringify({structuredQuery:{from:[{collectionId:COLLECTION}]}})});return (Array.isArray(result)?result:[]).filter(x=>x.document).map(x=>dec(x.document));}
async function onRequestPostInternal({request,env}) {
  let data;try{const raw=await request.text();if(raw.length>12000)return reply({message:"حجم الطلب أكبر من المسموح."},413);data=JSON.parse(raw);}catch{return reply({message:"صيغة الطلب غير صحيحة."},400);}
  let ctx;try{ctx=await authenticate(request,env);}catch(e){console.error("Custody auth error",e);return reply({message:"تعذر التحقق من الجلسة."},503);}
  if(ctx.error)return reply({message:ctx.error},ctx.status);
  const now=new Date().toISOString(),action=String(data.action||"");
  try {
    if(action==="status") {
      const lock=await readDoc(ctx,LOCK_ID);
      const history=await readDoc(ctx,"custody-last-closed");
      const selectedDate=String(data.date||"");
      const handoverDate=selectedDate||cairoDate(now);
      const records=ctx.role==="staff"?await listCustodyRecords(ctx):[];
      const dayHandovers=records.filter(x=>x.type==="custodyHandover"&&x.previousEmployeeUid===ctx.uid&&(String(x.date||cairoDate(x.createdAt))===handoverDate));
      const daySettlements=records.filter(x=>x.type==="custodyDoctorSettlement"&&x.employeeUid===ctx.uid&&cairoDate(x.previousHandoverAt)===handoverDate).sort((a,b)=>String(b.previousHandoverAt||"").localeCompare(String(a.previousHandoverAt||"")));
      const latestSettlement=daySettlements[0]||null;
      const settlementBoundary=String(latestSettlement?.previousHandoverAt||"");
      const pendingHandovers=dayHandovers.filter(x=>!settlementBoundary||String(x.createdAt||"")>settlementBoundary);
      const latestHandover=pendingHandovers.slice().sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")))[0]||null;
      const handover=latestHandover?{actualAmount:pendingHandovers.reduce((sum,x)=>sum+(Number(x.actualAmount)||0),0).toFixed(2),totalHandedOverAmount:pendingHandovers.reduce((sum,x)=>sum+(Number(x.actualAmount)||0),0).toFixed(2),lastHandoverAmount:String(latestHandover.actualAmount||"0.00"),expectedAmount:pendingHandovers.reduce((sum,x)=>sum+(Number(x.expectedAmount)||0),0).toFixed(2),previousEmployeeName:latestHandover.previousEmployeeName||ctx.name,closedAt:latestHandover.createdAt||"",notes:latestHandover.notes||"",date:handoverDate,baselineReceipts:String(latestHandover.baselineReceipts||"0.00"),baselineExpenses:String(latestHandover.baselineExpenses||"0.00")}:null;
      const settledHandover=latestSettlement?{amount:String(latestSettlement.amount||"0.00"),settledAt:latestSettlement.settledAt||"",date:handoverDate}:null;
      return reply({active:lock.status==="active",session:lock.status==="active"?lock:null,uid:ctx.uid,role:ctx.role,handover,settledHandover});
    }
    if(action==="doctorStatus") {
      if(ctx.role!=="doctor")return reply({message:"هذه الوظيفة متاحة للدكتور فقط."},403);
      const lock=await readDoc(ctx,LOCK_ID);
      const history=await readDoc(ctx,"custody-last-closed");
      const records=await listCustodyRecords(ctx);
      const handovers=records.filter(x=>x.type==="custodyHandover").sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
      let lastHandover=history.previousEmployeeUid&&!history.settledAt?{...history}:null;
      if(lastHandover){
        const date=String(lastHandover.date||cairoDate(lastHandover.closedAt));
        const settlements=records.filter(x=>x.type==="custodyDoctorSettlement"&&x.employeeUid===lastHandover.previousEmployeeUid&&cairoDate(x.previousHandoverAt)===date&&String(x.previousHandoverAt||"")<String(lastHandover.closedAt||"")).sort((a,b)=>String(b.previousHandoverAt||"").localeCompare(String(a.previousHandoverAt||"")));
        const boundary=String(settlements[0]?.previousHandoverAt||"");
        const pending=handovers.filter(x=>x.previousEmployeeUid===lastHandover.previousEmployeeUid&&String(x.date||cairoDate(x.createdAt))===date&&(!boundary||String(x.createdAt||"")>boundary)&&String(x.createdAt||"")<=String(lastHandover.closedAt||""));
        if(pending.length){
          lastHandover.totalHandedOverAmount=pending.reduce((sum,x)=>sum+(Number(x.actualAmount)||0),0).toFixed(2);
          lastHandover.totalExpectedAmount=pending.reduce((sum,x)=>sum+(Number(x.expectedAmount)||0),0).toFixed(2);
        }
      }
      return reply({active:lock.status==="active",session:lock.status==="active"?lock:null,lastHandover,previousSettlement:history.settledAt?{employeeUid:history.previousEmployeeUid,employeeName:history.previousEmployeeName||"الموظف",settledAt:history.settledAt,settledByName:history.settledByName||"الدكتور"}:null,handovers});
    }
    if(action==="doctorSettle") {
      if(ctx.role!=="doctor")return reply({message:"تصفية العهدة متاحة للدكتور فقط."},403);
      const lock=await readDoc(ctx,LOCK_ID);
      if(lock.status==="active")return reply({message:"يجب أن يسجل الموظف خروجًا ويسلّم العهدة أولًا قبل تصفيتها."},409);
      const history=await readDoc(ctx,"custody-last-closed");
      if(!history.previousEmployeeUid||!history.closedAt)return reply({message:"لا توجد عهدة مسلّمة تنتظر التصفية."},409);
      if(history.settledAt)return reply({message:"تمت تصفية هذه العهدة بالفعل.",settlement:history},409);
      const handoverDate=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(history.closedAt));
      const expenseQuery=await fs(ctx.project,ctx.token,":runQuery",{method:"POST",body:JSON.stringify({structuredQuery:{from:[{collectionId:COLLECTION}]}})});
      const custodyRecords=(Array.isArray(expenseQuery)?expenseQuery:[]).filter(x=>x.document).map(x=>dec(x.document));
      const pending=custodyRecords.filter(x=>x.type==="dailyExpense"&&x.enteredBy===history.previousEmployeeUid&&x.date===handoverDate&&(x.status||"approved")==="pending");
      if(pending.length)return reply({message:"لا يمكن تصفية العهدة قبل معالجة المصروفات المعلقة للموظف."},409);
      const settlements=custodyRecords.filter(x=>x.type==="custodyDoctorSettlement"&&x.employeeUid===history.previousEmployeeUid&&cairoDate(x.previousHandoverAt)===handoverDate&&String(x.previousHandoverAt||"")<String(history.closedAt||"")).sort((a,b)=>String(b.previousHandoverAt||"").localeCompare(String(a.previousHandoverAt||"")));
      const settlementBoundary=String(settlements[0]?.previousHandoverAt||"");
      const pendingHandovers=custodyRecords.filter(x=>x.type==="custodyHandover"&&x.previousEmployeeUid===history.previousEmployeeUid&&String(x.date||cairoDate(x.createdAt))===handoverDate&&(!settlementBoundary||String(x.createdAt||"")>settlementBoundary)&&String(x.createdAt||"")<=String(history.closedAt||""));
      const amount=pendingHandovers.length?pendingHandovers.reduce((sum,x)=>sum+(Number(x.actualAmount)||0),0):Number(history.totalHandedOverAmount??history.nextOpeningAmount??0);
      const now=new Date().toISOString();
      const settlement={type:"custodyDoctorSettlement",employeeUid:history.previousEmployeeUid,employeeName:history.previousEmployeeName||"الموظف",amount:amount.toFixed(2),status:"settled",settledByUid:ctx.uid,settledByName:"الدكتور",settledAt:now,previousHandoverAt:history.closedAt,baselineReceipts:String(history.baselineReceipts||"0"),baselineExpenses:String(history.baselineExpenses||"0"),createdAt:now};
      const id="custody-doctor-settlement-"+Date.now()+"-"+crypto.randomUUID().replace(/-/g,"").slice(0,8);
      const made=await createRecord(ctx,id,settlement);
      if(made?.__conflict)return reply({message:"تعذر حفظ التصفية بسبب طلب متزامن. حدّث الصفحة وحاول مرة أخرى."},409);
      const updated={...history,settledAt:now,settledByUid:ctx.uid,settledByName:"الدكتور",settlementId:id};
      const masks=["settledAt","settledByUid","settledByName","settlementId"].map(k=>"updateMask.fieldPaths="+encodeURIComponent(k)).join("&");
      const saved=await fs(ctx.project,ctx.token,"/"+COLLECTION+"/custody-last-closed?"+masks,{method:"PATCH",body:JSON.stringify(enc(updated))});
      if(saved?.__conflict)return reply({message:"تم تسجيل التصفية لكن تعذر تحديث حالتها. راجع سجل التصفيات قبل إعادة المحاولة."},503);
      return reply({settlement});
    }
    if(action==="start") {
      if(ctx.role!=="staff")return reply({message:"هذه العملية متاحة للموظف فقط."},403);
      const lock=await readDoc(ctx,LOCK_ID);
      if(lock.status==="active"&&lock.employeeUid!==ctx.uid)return reply({message:"يوجد موظف آخر مسجل الدخول. يجب أن ينهي جلسته ويسلّم العهدة أولًا.",activeSession:{employeeName:lock.employeeName,expectedAmount:lock.expectedAmount||"0",notes:lock.notes||""}},409);
      if(lock.status==="active"&&lock.employeeUid===ctx.uid){return reply({active:true,session:lock,alreadyActive:true});}
      const history=await readDoc(ctx,"custody-last-closed");
      if(!history.settledAt&&history.previousEmployeeUid&&history.previousEmployeeUid!==ctx.uid&&history.acceptedByUid!==ctx.uid&&!data.acceptHandover){
        return reply({message:"توجد عهدة مسلّمة من الموظف السابق وتحتاج تأكيد استلامك.",pendingHandover:{previousEmployeeName:history.previousEmployeeName||"الموظف السابق",actualAmount:String(history.nextOpeningAmount||"0.00"),expectedAmount:String(history.nextOpeningAmount||"0.00"),notes:history.notes||"",closedAt:history.closedAt||""}},409);
      }
      // Start at zero unless the employee explicitly accepts an incoming handover.
      const sameDayOwnHandover=history.previousEmployeeUid===ctx.uid&&cairoDate(history.closedAt||"")===cairoDate(now);
      const opening=data.acceptHandover?Number(history.nextOpeningAmount||0):0;
      const baselineReceipts=data.acceptHandover||sameDayOwnHandover?Number(history.baselineReceipts||0):0;
      const baselineExpenses=data.acceptHandover||sameDayOwnHandover?Number(history.baselineExpenses||0):0;
      const record={type:"custodySession",status:"active",employeeUid:ctx.uid,employeeName:ctx.name,openingAmount:opening.toFixed(2),expectedAmount:opening.toFixed(2),baselineReceipts:baselineReceipts.toFixed(2),baselineExpenses:baselineExpenses.toFixed(2),handoverAccepted:Boolean(data.acceptHandover),notes:"",startedAt:now,updatedAt:now};
      const made=await createRecord(ctx,LOCK_ID,record);
      if(made?.__conflict)return reply({message:"بدأ موظف آخر جلسة في نفس اللحظة. حدّث الصفحة وحاول مرة أخرى."},409);
      return reply({active:true,session:{id:LOCK_ID,...record}},201);
    }
    if(action==="handover") {
      if(ctx.role!=="staff")return reply({message:"هذه العملية متاحة للموظف فقط."},403);
      const lock=await readDoc(ctx,LOCK_ID);
      if(lock.status!=="active")return reply({message:"لا توجد عهدة نشطة لتسليمها."},409);
      if(lock.employeeUid!==ctx.uid)return reply({message:"هذه العهدة تخص موظفًا آخر."},403);
      const actual=Number(data.actualAmount),sessionExpected=Number(lock.expectedAmount||0),expected=Number(data.expectedAmount??sessionExpected),baselineReceipts=Number(data.baselineReceipts||0),baselineExpenses=Number(data.baselineExpenses||0),notes=String(data.notes||"").trim();
      if(!Number.isFinite(actual)||actual<0||actual>99999999||!Number.isFinite(expected)||expected<0||expected>99999999||!Number.isFinite(baselineReceipts)||baselineReceipts<0||!Number.isFinite(baselineExpenses)||baselineExpenses<0||notes.length>1000||(Math.abs(actual-expected)>0.009&&!notes))return reply({message:"أدخل المبلغ الفعلي، وأضف ملاحظة توضح أي فرق بين المتوقع والفعلي."},400);
      const existingRecords=await listCustodyRecords(ctx);
      const priorSettlements=existingRecords.filter(x=>x.type==="custodyDoctorSettlement"&&x.employeeUid===ctx.uid&&cairoDate(x.previousHandoverAt)===cairoDate(now)).sort((a,b)=>String(b.previousHandoverAt||"").localeCompare(String(a.previousHandoverAt||"")));
      const settlementBoundary=String(priorSettlements[0]?.previousHandoverAt||"");
      const priorHandovers=existingRecords.filter(x=>x.type==="custodyHandover"&&x.previousEmployeeUid===ctx.uid&&String(x.date||cairoDate(x.createdAt))===cairoDate(now)&&(!settlementBoundary||String(x.createdAt||"")>settlementBoundary));
      const totalHandedOver=priorHandovers.reduce((sum,x)=>sum+(Number(x.actualAmount)||0),0)+actual;
      const totalExpectedHandedOver=priorHandovers.reduce((sum,x)=>sum+(Number(x.expectedAmount)||0),0)+expected;
      const id="custody-handover-"+Date.now()+"-"+crypto.randomUUID().replace(/-/g,"").slice(0,8);
      const record={type:"custodyHandover",previousEmployeeUid:ctx.uid,previousEmployeeName:ctx.name,sessionExpectedAmount:sessionExpected.toFixed(2),expectedAmount:expected.toFixed(2),actualAmount:actual.toFixed(2),baselineReceipts:baselineReceipts.toFixed(2),baselineExpenses:baselineExpenses.toFixed(2),difference:(actual-expected).toFixed(2),notes,date:cairoDate(now),createdAt:now};
      const made=await createRecord(ctx,id,record);if(made?.__conflict)return reply({message:"تعذر تسجيل التسليم. حاول مرة أخرى."},409);
      const closed={...lock,status:"closed",actualAmount:actual.toFixed(2),difference:(actual-expected).toFixed(2),notes,closedAt:now,updatedAt:now};
      const patchFields=Object.entries(closed).filter(([k])=>k!=="id").map(([k])=>"updateMask.fieldPaths="+encodeURIComponent(k)).join("&");
      const updated=await fs(ctx.project,ctx.token,"/"+COLLECTION+"/"+LOCK_ID+"?"+patchFields,{method:"PATCH",body:JSON.stringify(enc(closed))});
      if(updated?.__conflict)return reply({message:"تغيرت حالة العهدة بالتزامن. راجع الدكتور قبل إعادة المحاولة."},409);
      const archived=await createRecord(ctx,id+"-session-close",{...closed,type:"custodySessionClosed",closedByUid:ctx.uid,closedByName:ctx.name});
      if(archived?.__conflict)return reply({message:"تم إغلاق العهدة لكن تعذر حفظ نسخة الأرشيف. راجع الدكتور قبل بدء عهدة جديدة."},503);
      const removed=await fs(ctx.project,ctx.token,"/"+COLLECTION+"/"+LOCK_ID,{method:"DELETE"});
      if(removed?.__conflict)return reply({message:"تم تسجيل التسليم لكن تعذر تحرير قفل الجلسة. راجع الدكتور."},409);
      const summary={type:"custodyHandoverSummary",nextOpeningAmount:actual.toFixed(2),totalHandedOverAmount:totalHandedOver.toFixed(2),expectedAmount:totalExpectedHandedOver.toFixed(2),baselineReceipts:baselineReceipts.toFixed(2),baselineExpenses:baselineExpenses.toFixed(2),previousEmployeeUid:ctx.uid,previousEmployeeName:ctx.name,notes,closedAt:now,date:cairoDate(now),settledAt:"",settledByUid:"",settledByName:"",settlementId:""};const summaryMask=Object.keys(summary).map(k=>"updateMask.fieldPaths="+encodeURIComponent(k)).join("&");await fs(ctx.project,ctx.token,"/"+COLLECTION+"/custody-last-closed?"+summaryMask,{method:"PATCH",body:JSON.stringify(enc(summary))});
      return reply({closed:true,expectedAmount:expected.toFixed(2),actualAmount:actual.toFixed(2),difference:(actual-expected).toFixed(2)});
    }
    if(action==="addCash") {
      if(ctx.role!=="staff"||ctx.accountPermission!=="edit")return reply({message:"تحتاج إلى صلاحية تعديل الحسابات لإضافة مبلغ للعهدة."},403);
      const amount=Number(data.amount),notes=String(data.notes||"").trim();if(!Number.isFinite(amount)||amount<=0||amount>99999999||notes.length>500)return reply({message:"راجع المبلغ والملاحظات."},400);
      const lock=await readDoc(ctx,LOCK_ID);if(lock.status!=="active"||lock.employeeUid!==ctx.uid)return reply({message:"لا توجد عهدة نشطة باسمك."},409);
      const expected=Number(lock.expectedAmount||0)+amount;
      const patch={...lock,expectedAmount:expected.toFixed(2),updatedAt:now};
      const masks=["expectedAmount","updatedAt"].map(k=>"updateMask.fieldPaths="+k).join("&");
      const updated=await fs(ctx.project,ctx.token,"/"+COLLECTION+"/"+LOCK_ID+"?"+masks,{method:"PATCH",body:JSON.stringify(enc(patch))});
      if(updated?.__conflict)return reply({message:"تغيرت العهدة بالتزامن. أعد تحميل الصفحة."},409);
      const id="custody-cash-"+Date.now()+"-"+crypto.randomUUID().replace(/-/g,"").slice(0,8);
      await createRecord(ctx,id,{type:"custodyAddition",employeeUid:ctx.uid,employeeName:ctx.name,amount:amount.toFixed(2),notes,createdAt:now});
      return reply({expectedAmount:expected.toFixed(2)},201);
    }
    return reply({message:"العملية غير معروفة."},400);
  } catch(e) { console.error("Custody API error",e);return reply({message:"تعذر تنفيذ عملية العهدة حاليًا."},503); }
}


export async function onRequestPost(context) {
  let input = {};
  try { input = await context.request.clone().json(); } catch {}
  const result = await onRequestPostInternal(context);
  if (result.ok && input.action && input.action !== "status") {
    const notification = publishClinicRealtime(context.env, "custody_changed");
    if (typeof context.waitUntil === "function") context.waitUntil(notification);
    else void notification;
  }
  return result;
}
