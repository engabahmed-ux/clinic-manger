import { getClinicDatabase, d1All, d1First, d1Run, d1Batch } from "../../_shared/d1.js";
import { publishClinicRealtime } from "../../_shared/realtime.js";

const DOCTOR_UID = "8fUdGutQHRau3RXQIrRtZUqQ9Nm1";
const LOOKUP = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
const LOCK_ID = "staff-custody-active-session";

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer"
  }});
}
function cairoDate(value){if(!value)return"";const d=new Date(value);if(Number.isNaN(d.getTime()))return String(value).slice(0,10);const p=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d),v=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${v.year}-${v.month}-${v.day}`;}
function validSameDayOwnHandover(history,uid,now){const amount=Number(history.nextOpeningAmount??history.totalHandedOverAmount??0),expected=Number(history.expectedAmount||0),dailyNet=Math.max(0,Number(history.baselineReceipts||0)-Number(history.baselineExpenses||0));return history.previousEmployeeUid===uid&&cairoDate(history.closedAt||"")===cairoDate(now)&&amount+0.009>=expected&&amount+0.009>=dailyNet;}
async function authenticate(request,env) {
  if(!env.FIREBASE_API_KEY)return {error:"إعدادات التحقق غير مكتملة.",status:503};
  const m=(request.headers.get("Authorization")||"").match(/^Bearer\s+(\S+)$/i);
  if(!m||m[1].length>8192)return {error:"يلزم تسجيل الدخول.",status:401};
  const r=await fetch(LOOKUP+"?key="+encodeURIComponent(env.FIREBASE_API_KEY),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken:m[1]})});
  if(!r.ok)return {error:"جلسة الدخول غير صالحة.",status:401};
  const user=(await r.json()).users?.[0];if(!user?.localId)return {error:"تعذر التحقق من الحساب.",status:401};
  if(user.localId===DOCTOR_UID)return {uid:user.localId,name:"الدكتور",role:"doctor",accountPermission:"edit"};
  const db=getClinicDatabase(env);
  const staff=await d1First(db,"SELECT role,active,display_name,permissions_json FROM staff WHERE uid = ? LIMIT 1",[user.localId]);
  if(!staff||staff.role!=="staff"||Number(staff.active)!==1)return {error:"حساب الموظف غير نشط أو غير معتمد.",status:403};
  let permissions={};try{permissions=JSON.parse(staff.permissions_json||"{}");}catch{}
  return {uid:user.localId,name:staff.display_name||"الموظف",role:"staff",accountPermission:permissions.accounts||"none"};
}
function decodeRecord(row) {
  if(!row)return {};
  let payload={};try{payload=JSON.parse(row.payload_json||"{}");}catch{}
  return {...payload,id:row.id,type:row.record_type||payload.type||"",name:row.name||payload.name||"",kind:row.kind||payload.kind||"",
    categoryId:row.category_id||payload.categoryId||"",personName:row.person_name||payload.personName||"",amount:row.amount||payload.amount||"",
    date:row.date||payload.date||"",notes:row.notes||payload.notes||"",createdAt:row.created_at||payload.createdAt||"",
    updatedAt:row.updated_at||payload.updatedAt||"",status:row.status||payload.status||"",enteredBy:row.entered_by||payload.enteredBy||"",
    enteredByName:row.entered_by_name||payload.enteredByName||"",employeeUid:row.employee_uid||payload.employeeUid||payload.previousEmployeeUid||"",
    employeeName:row.employee_name||payload.employeeName||"",closedAt:row.closed_at||payload.closedAt||"",
    totalReceipts:row.total_receipts||payload.totalReceipts||"",totalExpenses:row.total_expenses||payload.totalExpenses||"",
    netTotal:row.net_total||payload.netTotal||"",bookingCount:row.booking_count||payload.bookingCount||""};
}
function recordValues(id,record) {
  return [id,record.type||"",record.name||"",record.kind||"",record.categoryId||"",record.personName||"",record.amount||"",record.date||"",record.notes||"",
    record.createdAt||"",record.updatedAt||"",record.status||"",record.enteredBy||"",record.enteredByName||"",record.approvedBy||"",record.approvedByName||"",
    record.approvedAt||"",record.reviewedBy||"",record.reviewedByName||"",record.reviewedAt||"",record.rejectionReason||"",record.periodType||"",
    record.periodKey||"",record.employeeUid||record.previousEmployeeUid||"",record.employeeName||"",record.closedBy||"",record.closedByName||"",record.closedAt||"",
    record.totalReceipts||"",record.totalExpenses||"",record.netTotal||"",record.bookingCount||"",JSON.stringify(record)];
}
const RECORD_COLUMNS="id,record_type,name,kind,category_id,person_name,amount,date,notes,created_at,updated_at,status,entered_by,entered_by_name,approved_by,approved_by_name,approved_at,reviewed_by,reviewed_by_name,reviewed_at,rejection_reason,period_type,period_key,employee_uid,employee_name,closed_by,closed_by_name,closed_at,total_receipts,total_expenses,net_total,booking_count,payload_json";
async function readDoc(ctx,id) {
  const row=await d1First(getClinicDatabase(ctx.env),"SELECT * FROM account_records WHERE id = ? LIMIT 1",[id]);
  return decodeRecord(row);
}
async function createRecord(ctx,id,record) {
  try {
    await d1Run(getClinicDatabase(ctx.env),"INSERT INTO account_records ("+RECORD_COLUMNS+") VALUES ("+recordValues(id,record).map(()=>"?").join(",")+")",recordValues(id,record));
    return {id,...record};
  } catch(error) {
    const existing=await d1First(getClinicDatabase(ctx.env),"SELECT id FROM account_records WHERE id = ? LIMIT 1",[id]);
    if(existing)return {__conflict:true};
    throw error;
  }
}
async function updateRecord(ctx,id,record) {
  const values=recordValues(id,record);
  const columns=RECORD_COLUMNS.split(",");
  const updates=columns.filter(x=>x!=="id").map(x=>x+"=excluded."+x).join(",");
  await d1Run(getClinicDatabase(ctx.env),"INSERT INTO account_records ("+RECORD_COLUMNS+") VALUES ("+values.map(()=>"?").join(",")+") ON CONFLICT(id) DO UPDATE SET "+updates,values);
  return {id,...record};
}

/**
 * Start a staff session without deleting or overwriting its previous history.
 * The archive copy and conditional lock upsert run in one D1 transaction.
 * A competing request can only replace a non-active lock; an active lock
 * always wins, so two employees cannot start simultaneously.
 */
async function startSessionRecord(ctx,record) {
  const db=getClinicDatabase(ctx.env);
  const columns=RECORD_COLUMNS.split(",");
  const values=recordValues(LOCK_ID,record);
  const updates=columns.filter(column=>column!=="id").map(column=>column+"=excluded."+column).join(",");
  const archiveId=LOCK_ID+"-closed-"+Date.now()+"-"+crypto.randomUUID().replace(/-/g,"").slice(0,8);
  const archiveSelect=columns.map((column,index)=>index===0?"?":column).join(",");
  const archiveSql="INSERT INTO account_records ("+RECORD_COLUMNS+") SELECT "+archiveSelect+" FROM account_records WHERE id = ? AND status IS NOT 'active'";
  const upsertSql="INSERT INTO account_records ("+RECORD_COLUMNS+") VALUES ("+values.map(()=>"?").join(",")+") ON CONFLICT(id) DO UPDATE SET "+updates+" WHERE account_records.status IS NOT 'active'";
  const results=await d1Batch(db,[
    {sql:archiveSql,params:[archiveId,LOCK_ID]},
    {sql:upsertSql,params:values}
  ]);
  if(Number(results?.[1]?.meta?.changes)>0)return {id:LOCK_ID,...record};
  const current=await readDoc(ctx,LOCK_ID);
  if(current.status==="active"&&current.employeeUid===record.employeeUid)return {__alreadyActive:true,session:current};
  return {__conflict:true,current};
}
async function deleteRecord(ctx,id) {
  await d1Run(getClinicDatabase(ctx.env),"DELETE FROM account_records WHERE id = ?",[id]);
  return null;
}
async function listCustodyRecords(ctx,types=["custodyHandover","custodyDoctorSettlement"],employeeUid="",date="") {
  const db=getClinicDatabase(ctx.env),rows=[];
  if(!employeeUid){
    const placeholders=types.map(()=>"?").join(",");
    const all=await d1All(db,"SELECT * FROM account_records WHERE record_type IN ("+placeholders+") ORDER BY created_at DESC",types);
    return all.map(decodeRecord);
  }
  const custodyTypes=types.filter(type=>type!=="dailyExpense");
  if(custodyTypes.length){
    const placeholders=custodyTypes.map(()=>"?").join(",");
    const employeeRows=await d1All(db,"SELECT * FROM account_records WHERE record_type IN ("+placeholders+") AND employee_uid = ? ORDER BY created_at DESC",[...custodyTypes,employeeUid]);
    rows.push(...employeeRows);
  }
  if(types.includes("dailyExpense")){
    const expenseSql=date
      ? "SELECT * FROM account_records WHERE record_type = 'dailyExpense' AND entered_by = ? AND date = ? ORDER BY created_at DESC"
      : "SELECT * FROM account_records WHERE record_type = 'dailyExpense' AND entered_by = ? ORDER BY created_at DESC";
    const expenseRows=await d1All(db,expenseSql,date?[employeeUid,date]:[employeeUid]);
    rows.push(...expenseRows);
  }
  rows.sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
  return rows.map(decodeRecord);
}

async function onRequestPostInternal({request,env}) {
  let data;try{const raw=await request.text();if(raw.length>12000)return reply({message:"حجم الطلب أكبر من المسموح."},413);data=JSON.parse(raw);}catch{return reply({message:"صيغة الطلب غير صحيحة."},400);}
  let ctx;try{ctx=await authenticate(request,env);}catch(e){console.error("Custody auth error",e);return reply({message:"تعذر التحقق من الجلسة."},503);}
  if(ctx.error)return reply({message:ctx.error},ctx.status);
  ctx.env=env;
  const now=new Date().toISOString(),action=String(data.action||"");
  try {
    if(action==="status") {
      const lock=await readDoc(ctx,LOCK_ID);
      const history=await readDoc(ctx,"custody-last-closed");
      const selectedDate=String(data.date||"");
      const handoverDate=selectedDate||cairoDate(now);
      const records=ctx.role==="staff"?await listCustodyRecords(ctx,undefined,ctx.uid,handoverDate):[];
      const dayHandovers=records.filter(x=>x.type==="custodyHandover"&&x.previousEmployeeUid===ctx.uid&&(String(x.date||cairoDate(x.createdAt))===handoverDate));
      const daySettlements=records.filter(x=>x.type==="custodyDoctorSettlement"&&x.employeeUid===ctx.uid&&cairoDate(x.previousHandoverAt)===handoverDate).sort((a,b)=>String(b.previousHandoverAt||"").localeCompare(String(a.previousHandoverAt||"")));
      const latestSettlement=daySettlements[0]||null;
      const settlementBoundary=String(latestSettlement?.previousHandoverAt||"");
      const pendingHandovers=dayHandovers.filter(x=>!settlementBoundary||String(x.createdAt||"")>settlementBoundary);
      const latestHandover=pendingHandovers.slice().sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")))[0]||null;
      const handover=latestHandover?{actualAmount:String(latestHandover.actualAmount||"0.00"),totalHandedOverAmount:String(latestHandover.actualAmount||"0.00"),lastHandoverAmount:String(latestHandover.actualAmount||"0.00"),expectedAmount:String(latestHandover.expectedAmount||"0.00"),previousEmployeeName:latestHandover.previousEmployeeName||ctx.name,closedAt:latestHandover.createdAt||"",notes:latestHandover.notes||"",date:handoverDate,baselineReceipts:String(latestHandover.baselineReceipts||"0.00"),baselineExpenses:String(latestHandover.baselineExpenses||"0.00")}:null;
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
          const latestPending=pending.slice().sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")))[0];
          lastHandover.totalHandedOverAmount=String(latestPending.actualAmount||"0.00");
          lastHandover.totalExpectedAmount=String(latestPending.expectedAmount||"0.00");
          lastHandover.nextOpeningAmount=String(latestPending.actualAmount||"0.00");
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
      const custodyRecords=await listCustodyRecords(ctx,["dailyExpense","custodyDoctorSettlement","custodyHandover"],history.previousEmployeeUid,handoverDate);
      const pending=custodyRecords.filter(x=>x.type==="dailyExpense"&&x.enteredBy===history.previousEmployeeUid&&x.date===handoverDate&&(x.status||"approved")==="pending");
      if(pending.length)return reply({message:"لا يمكن تصفية العهدة قبل معالجة المصروفات المعلقة للموظف."},409);
      const settlements=custodyRecords.filter(x=>x.type==="custodyDoctorSettlement"&&x.employeeUid===history.previousEmployeeUid&&cairoDate(x.previousHandoverAt)===handoverDate&&String(x.previousHandoverAt||"")<String(history.closedAt||"")).sort((a,b)=>String(b.previousHandoverAt||"").localeCompare(String(a.previousHandoverAt||"")));
      const settlementBoundary=String(settlements[0]?.previousHandoverAt||"");
      const pendingHandovers=custodyRecords.filter(x=>x.type==="custodyHandover"&&x.previousEmployeeUid===history.previousEmployeeUid&&String(x.date||cairoDate(x.createdAt))===handoverDate&&(!settlementBoundary||String(x.createdAt||"")>settlementBoundary)&&String(x.createdAt||"")<=String(history.closedAt||""));
      const latestPendingHandover=pendingHandovers.slice().sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")))[0];
      const amount=latestPendingHandover?Number(latestPendingHandover.actualAmount)||0:Number(history.nextOpeningAmount??history.totalHandedOverAmount??0);
      const now=new Date().toISOString();
      const settlement={type:"custodyDoctorSettlement",employeeUid:history.previousEmployeeUid,employeeName:history.previousEmployeeName||"الموظف",amount:amount.toFixed(2),status:"settled",settledByUid:ctx.uid,settledByName:"الدكتور",settledAt:now,previousHandoverAt:history.closedAt,baselineReceipts:String(history.baselineReceipts||"0"),baselineExpenses:String(history.baselineExpenses||"0"),createdAt:now};
      const id="custody-doctor-settlement-"+Date.now()+"-"+crypto.randomUUID().replace(/-/g,"").slice(0,8);
      const made=await createRecord(ctx,id,settlement);
      if(made?.__conflict)return reply({message:"تعذر حفظ التصفية بسبب طلب متزامن. حدّث الصفحة وحاول مرة أخرى."},409);
      const updated={...history,settledAt:now,settledByUid:ctx.uid,settledByName:"الدكتور",settlementId:id};
      const masks=["settledAt","settledByUid","settledByName","settlementId"].map(k=>"updateMask.fieldPaths="+encodeURIComponent(k)).join("&");
      const saved=await updateRecord(ctx,"custody-last-closed",updated);
      if(saved?.__conflict)return reply({message:"تم تسجيل التصفية لكن تعذر تحديث حالتها. راجع سجل التصفيات قبل إعادة المحاولة."},503);
      return reply({settlement});
    }
    if(action==="start") {
      if(ctx.role!=="staff")return reply({message:"هذه العملية متاحة للموظف فقط."},403);
      const lock=await readDoc(ctx,LOCK_ID);
      if(lock.status==="active"&&lock.employeeUid!==ctx.uid)return reply({message:"يوجد موظف آخر مسجل الدخول. يجب أن ينهي جلسته ويسلّم العهدة أولًا.",activeSession:{employeeName:lock.employeeName,expectedAmount:lock.expectedAmount||"0",notes:lock.notes||""}},409);
      if(lock.status==="active"&&lock.employeeUid===ctx.uid){
        const history=await readDoc(ctx,"custody-last-closed");
        const staleBaseline=!lock.handoverAccepted&&!validSameDayOwnHandover(history,ctx.uid,now)&&(Number(lock.baselineReceipts||0)>0||Number(lock.baselineExpenses||0)>0);
        if(staleBaseline){
          const corrected={...lock,baselineReceipts:"0.00",baselineExpenses:"0.00",updatedAt:now};
          const patchFields=["baselineReceipts","baselineExpenses","updatedAt"].map(k=>"updateMask.fieldPaths="+encodeURIComponent(k)).join("&");
          const saved=await updateRecord(ctx,LOCK_ID,corrected);
          if(saved?.__conflict)return reply({message:"تغيرت بيانات العهدة بالتزامن. حدّث الصفحة وحاول مرة أخرى."},409);
          return reply({active:true,session:corrected,alreadyActive:true,baselineCorrected:true});
        }
        return reply({active:true,session:lock,alreadyActive:true});
      }
      const history=await readDoc(ctx,"custody-last-closed");
      if(!history.settledAt&&history.previousEmployeeUid&&history.closedAt&&!data.acceptHandover){
        return reply({message:"توجد عهدة مسلّمة من الموظف السابق وتحتاج تأكيد استلامك.",pendingHandover:{previousEmployeeName:history.previousEmployeeName||"الموظف السابق",actualAmount:String(history.nextOpeningAmount||"0.00"),expectedAmount:String(history.nextOpeningAmount||"0.00"),notes:history.notes||"",closedAt:history.closedAt||""}},409);
      }
      // Carry forward the outstanding cash until the doctor settles it.
      const sameDayHandover=Boolean(history.closedAt&&cairoDate(history.closedAt)===cairoDate(now));
      const opening=history.previousEmployeeUid&&history.closedAt&&!history.settledAt?Number(history.nextOpeningAmount??history.totalHandedOverAmount??0):0;
      // Carry forward today's receipt/expense baseline across employee switches and doctor settlement.
      // This excludes receipts already present before the new session from the next handover amount.
      const baselineReceipts=sameDayHandover?Number(history.baselineReceipts||0):0;
      const baselineExpenses=sameDayHandover?Number(history.baselineExpenses||0):0;
      const record={type:"custodySession",status:"active",employeeUid:ctx.uid,employeeName:ctx.name,openingAmount:opening.toFixed(2),expectedAmount:opening.toFixed(2),baselineReceipts:baselineReceipts.toFixed(2),baselineExpenses:baselineExpenses.toFixed(2),handoverAccepted:Boolean(data.acceptHandover),notes:"",startedAt:now,updatedAt:now};
      const made=await startSessionRecord(ctx,record);
      if(made?.__conflict){
        const active=made.current||{};
        if(active.status==="active"&&active.employeeUid!==ctx.uid)return reply({message:"يوجد موظف آخر مسجل الدخول. يجب أن ينهي جلسته ويسلّم العهدة أولًا.",activeSession:{employeeName:active.employeeName||"الموظف",expectedAmount:active.expectedAmount||"0",notes:active.notes||""}},409);
        return reply({message:"بدأت جلسة أخرى بالتزامن. حدّث الصفحة وحاول مرة أخرى."},409);
      }
      if(made?.__alreadyActive)return reply({active:true,session:made.session,alreadyActive:true});
      return reply({active:true,session:{id:LOCK_ID,...record}},201);
    }
    if(action==="handover") {
      if(ctx.role!=="staff")return reply({message:"هذه العملية متاحة للموظف فقط."},403);
      const lock=await readDoc(ctx,LOCK_ID);
      if(lock.status!=="active")return reply({message:"لا توجد عهدة نشطة لتسليمها."},409);
      if(lock.employeeUid!==ctx.uid)return reply({message:"هذه العهدة تخص موظفًا آخر."},403);
      const actual=Number(data.actualAmount),sessionExpected=Number(lock.expectedAmount||0),expected=Number(data.expectedAmount??sessionExpected),baselineReceipts=Number(data.baselineReceipts||0),baselineExpenses=Number(data.baselineExpenses||0),notes=String(data.notes||"").trim();
      if(!Number.isFinite(actual)||actual<0||actual>99999999||!Number.isFinite(expected)||expected<0||expected>99999999||!Number.isFinite(baselineReceipts)||baselineReceipts<0||!Number.isFinite(baselineExpenses)||baselineExpenses<0||notes.length>1000||(Math.abs(actual-expected)>0.009&&!notes))return reply({message:"أدخل المبلغ الفعلي، وأضف ملاحظة توضح أي فرق بين المتوقع والفعلي."},400);
      const sessionStamp=Date.parse(lock.startedAt||"");
      const id="custody-handover-"+ctx.uid+"-"+(Number.isFinite(sessionStamp)?sessionStamp:Date.now())+"-"+cairoDate(now).replace(/-/g,"");
      const record={type:"custodyHandover",previousEmployeeUid:ctx.uid,previousEmployeeName:ctx.name,sessionExpectedAmount:sessionExpected.toFixed(2),expectedAmount:expected.toFixed(2),actualAmount:actual.toFixed(2),baselineReceipts:baselineReceipts.toFixed(2),baselineExpenses:baselineExpenses.toFixed(2),difference:(actual-expected).toFixed(2),notes,date:cairoDate(now),createdAt:now};
      const made=await createRecord(ctx,id,record);if(made?.__conflict)return reply({message:"تعذر تسجيل التسليم. حاول مرة أخرى."},409);
      const closed={...lock,status:"closed",actualAmount:actual.toFixed(2),difference:(actual-expected).toFixed(2),notes,closedAt:now,updatedAt:now};
      const patchFields=Object.entries(closed).filter(([k])=>k!=="id").map(([k])=>"updateMask.fieldPaths="+encodeURIComponent(k)).join("&");
      const updated=await updateRecord(ctx,LOCK_ID,closed);
      if(updated?.__conflict)return reply({message:"تغيرت حالة العهدة بالتزامن. راجع الدكتور قبل إعادة المحاولة."},409);
      const archived=await createRecord(ctx,id+"-session-close",{...closed,type:"custodySessionClosed",closedByUid:ctx.uid,closedByName:ctx.name});
      if(archived?.__conflict)return reply({message:"تم إغلاق العهدة لكن تعذر حفظ نسخة الأرشيف. راجع الدكتور قبل بدء عهدة جديدة."},503);
      const removed=await deleteRecord(ctx,LOCK_ID);
      if(removed?.__conflict)return reply({message:"تم تسجيل التسليم لكن تعذر تحرير قفل الجلسة. راجع الدكتور."},409);
      const summary={type:"custodyHandoverSummary",nextOpeningAmount:actual.toFixed(2),totalHandedOverAmount:actual.toFixed(2),expectedAmount:expected.toFixed(2),baselineReceipts:baselineReceipts.toFixed(2),baselineExpenses:baselineExpenses.toFixed(2),previousEmployeeUid:ctx.uid,previousEmployeeName:ctx.name,notes,closedAt:now,date:cairoDate(now),settledAt:"",settledByUid:"",settledByName:"",settlementId:""};const summaryMask=Object.keys(summary).map(k=>"updateMask.fieldPaths="+encodeURIComponent(k)).join("&");await updateRecord(ctx,"custody-last-closed",summary);
      return reply({closed:true,expectedAmount:expected.toFixed(2),actualAmount:actual.toFixed(2),difference:(actual-expected).toFixed(2)});
    }
    if(action==="addCash") {
      if(ctx.role!=="staff"||ctx.accountPermission!=="edit")return reply({message:"تحتاج إلى صلاحية تعديل الحسابات لإضافة مبلغ للعهدة."},403);
      const amount=Number(data.amount),notes=String(data.notes||"").trim();if(!Number.isFinite(amount)||amount<=0||amount>99999999||notes.length>500)return reply({message:"راجع المبلغ والملاحظات."},400);
      const lock=await readDoc(ctx,LOCK_ID);if(lock.status!=="active"||lock.employeeUid!==ctx.uid)return reply({message:"لا توجد عهدة نشطة باسمك."},409);
      const expected=Number(lock.expectedAmount||0)+amount;
      const patch={...lock,expectedAmount:expected.toFixed(2),updatedAt:now};
      const masks=["expectedAmount","updatedAt"].map(k=>"updateMask.fieldPaths="+k).join("&");
      const updated=await updateRecord(ctx,LOCK_ID,patch);
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
  if (result.ok && input.action && !["status", "doctorStatus"].includes(input.action)) {
    const notification = publishClinicRealtime(context.env, "custody_changed");
    if (typeof context.waitUntil === "function") context.waitUntil(notification);
    else void notification;
  }
  return result;
}
