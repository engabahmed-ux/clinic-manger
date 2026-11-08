import { getClinicDatabase, d1All, d1First, d1Run } from "../../_shared/d1.js";
import { publishClinicRealtime } from "../../_shared/realtime.js";

const DOCTOR_ADMIN_UID = "8fUdGutQHRau3RXQIrRtZUqQ9Nm1";
const LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  }});
}
async function verifyDoctor(request,env) {
  if(!env.FIREBASE_API_KEY)return {error:"إعدادات الحسابات غير مكتملة.",status:503};
  const match=(request.headers.get("Authorization")||"").match(/^Bearer\s+(\S+)$/i);
  if(!match||match[1].length>8192)return {error:"يلزم تسجيل الدخول.",status:401};
  const response=await fetch(LOOKUP_URL+"?key="+encodeURIComponent(env.FIREBASE_API_KEY),{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken:match[1]})
  });
  if(!response.ok)return {error:"جلسة الدخول غير صالحة.",status:401};
  const user=(await response.json()).users?.[0];
  if(!user?.localId)return {error:"تعذر التحقق من الحساب.",status:401};
  if(user.localId===DOCTOR_ADMIN_UID)return {accountType:"doctor",permission:"edit",uid:user.localId,displayName:"الدكتور"};
  const staff=await d1First(getClinicDatabase(env),"SELECT role,active,display_name,permissions_json,expense_mode FROM staff WHERE uid = ? LIMIT 1",[user.localId]);
  if(!staff||staff.role!=="staff"||Number(staff.active)!==1)return {error:"الحساب غير مصرح له بحسابات اليوم.",status:403};
  let permissions={};try{permissions=JSON.parse(staff.permissions_json||"{}");}catch{}
  const permission=permissions.accounts||"none";
  if(!["view","edit"].includes(permission))return {error:"لم يمنحك الدكتور صلاحية الوصول إلى حسابات اليوم.",status:403};
  return {accountType:"staff",permission,uid:user.localId,displayName:staff.display_name||"",expenseMode:staff.expense_mode==="auto"?"auto":"approval"};
}
function decode(row) {
  let payload={};try{payload=JSON.parse(row?.payload_json||"{}");}catch{}
  const pick=(camel,snake)=>payload[camel]??row?.[snake]??"";
  return {...payload,id:row?.id||payload.id||"",type:row?.record_type||payload.type||"",name:pick("name","name"),kind:pick("kind","kind"),
    categoryId:pick("categoryId","category_id"),personName:pick("personName","person_name"),amount:pick("amount","amount"),
    date:pick("date","date"),notes:pick("notes","notes"),createdAt:pick("createdAt","created_at"),updatedAt:pick("updatedAt","updated_at"),
    status:pick("status","status"),enteredBy:pick("enteredBy","entered_by"),enteredByName:pick("enteredByName","entered_by_name"),
    approvedBy:pick("approvedBy","approved_by"),approvedByName:pick("approvedByName","approved_by_name"),approvedAt:pick("approvedAt","approved_at"),
    reviewedBy:pick("reviewedBy","reviewed_by"),reviewedByName:pick("reviewedByName","reviewed_by_name"),reviewedAt:pick("reviewedAt","reviewed_at"),
    rejectionReason:pick("rejectionReason","rejection_reason"),periodType:pick("periodType","period_type"),periodKey:pick("periodKey","period_key"),
    employeeUid:pick("employeeUid","employee_uid"),employeeName:pick("employeeName","employee_name"),
    closedBy:pick("closedBy","closed_by"),closedByName:pick("closedByName","closed_by_name"),closedAt:pick("closedAt","closed_at"),
    totalReceipts:pick("totalReceipts","total_receipts"),totalExpenses:pick("totalExpenses","total_expenses"),netTotal:pick("netTotal","net_total"),bookingCount:pick("bookingCount","booking_count")};
}
async function saveRecord(env,record,id=crypto.randomUUID(),allowUpdate=true) {
  const db=getClinicDatabase(env),payload={...record};
  const columns=["id","record_type","name","kind","category_id","person_name","amount","date","notes","created_at","updated_at","status","entered_by","entered_by_name","approved_by","approved_by_name","approved_at","reviewed_by","reviewed_by_name","reviewed_at","rejection_reason","period_type","period_key","employee_uid","employee_name","closed_by","closed_by_name","closed_at","total_receipts","total_expenses","net_total","booking_count","payload_json"];
  const values=[id,record.type||"",record.name||"",record.kind||"",record.categoryId||"",record.personName||"",record.amount||"",record.date||"",record.notes||"",record.createdAt||"",record.updatedAt||"",record.status||"",record.enteredBy||"",record.enteredByName||"",record.approvedBy||"",record.approvedByName||"",record.approvedAt||"",record.reviewedBy||"",record.reviewedByName||"",record.reviewedAt||"",record.rejectionReason||"",record.periodType||"",record.periodKey||"",record.employeeUid||"",record.employeeName||"",record.closedBy||"",record.closedByName||"",record.closedAt||"",record.totalReceipts||"",record.totalExpenses||"",record.netTotal||"",record.bookingCount||"",JSON.stringify(payload)];
  const insertSql="INSERT INTO account_records ("+columns.join(",")+") VALUES ("+columns.map(()=>"?").join(",")+")";
  if(allowUpdate){
    const updates=columns.filter(x=>x!=="id").map(x=>x+"=excluded."+x).join(",");
    await d1Run(db,insertSql+" ON CONFLICT(id) DO UPDATE SET "+updates,values);
  } else {
    await d1Run(db,insertSql,values);
  }
  return decode({id,record_type:record.type,payload_json:JSON.stringify(payload)});
}
async function listRecords(env,type="") {
  const db=getClinicDatabase(env);
  const rows=type
    ? await d1All(db,"SELECT * FROM account_records WHERE record_type = ? ORDER BY created_at DESC",[type])
    : await d1All(db,"SELECT * FROM account_records ORDER BY created_at DESC");
  return rows.map(decode);
}
async function listRecordsByDateRange(env,type,startDate,endDate,enteredBy="") {
  const db=getClinicDatabase(env);
  const conditions=["record_type = ?","date >= ?","date < ?"];
  const params=[type,startDate,endDate];
  if(enteredBy){conditions.push("entered_by = ?");params.push(enteredBy);}
  const rows=await d1All(db,"SELECT * FROM account_records WHERE "+conditions.join(" AND ")+" ORDER BY created_at DESC",params);
  return rows.map(decode);
}
async function listEmployeeSettlements(env,employeeUid,startDate,endDate) {
  const rows=await d1All(getClinicDatabase(env),
    "SELECT * FROM account_records WHERE record_type = 'settlement' AND employee_uid = ? AND date >= ? AND date < ? ORDER BY created_at DESC",
    [employeeUid,startDate,endDate]);
  return rows.map(decode);
}
function periodDateRange(periodType,periodKey) {
  if(periodType==="day") {
    const [year,month,day]=periodKey.split("-").map(Number);
    const next=new Date(Date.UTC(year,month-1,day+1));
    return {start:periodKey,end:next.toISOString().slice(0,10)};
  }
  const [year,month]=periodKey.split("-").map(Number);
  const next=new Date(Date.UTC(year,month,1));
  return {start:periodKey+"-01",end:next.toISOString().slice(0,10)};
}
async function listEmployeeBookings(env,employeeUid,startDate,endDate) {
  const rows=await d1All(getClinicDatabase(env),
    "SELECT appointment_date, payment_entered_by_uid, paid_amount FROM bookings WHERE payment_entered_by_uid = ? AND appointment_date >= ? AND appointment_date < ?",
    [employeeUid,startDate,endDate]);
  return rows.map(row=>({date:String(row.appointment_date||"").slice(0,10),paymentEnteredByUid:row.payment_entered_by_uid,paid:Number(row.paid_amount)||0}));
}

function cleanString(value, max) { return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max; }
export async function onRequestPost({ request, env }) {
  let data;
  try {
    const raw = await request.text();
    if (raw.length > 12000) return jsonResponse({ message: "حجم الطلب أكبر من المسموح." }, 413);
    data = JSON.parse(raw);
  } catch { return jsonResponse({ message: "صيغة الطلب غير صحيحة." }, 400); }
  let verified;
  try { verified = await verifyDoctor(request, env); }
  catch (error) { console.error("Accounts authorization error:", error); return jsonResponse({ message: "تعذر التحقق من صلاحية الدكتور." }, 503); }
  if (verified.error) return jsonResponse({ message: verified.error }, verified.status);

  if (["list","createCategory","createEntry","approveDailyExpense","rejectDailyExpense","finalizeSettlement","listSettlements","previewSettlement"].includes(data.action) && verified.accountType !== "doctor") return jsonResponse({ message:"هذه الوظيفة متاحة للدكتور فقط." },403);
  if (data.action === "createDailyExpense" && verified.accountType === "staff" && verified.permission !== "edit") return jsonResponse({ message:"لا تملك صلاحية تسجيل المصروفات." },403);
  try {
    if (data.action === "listDailyExpenses") {
      const date = String(data.date || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T12:00:00"))) return jsonResponse({ message:"التاريخ غير صحيح." },400);
      const dailyRange=periodDateRange("day",date);
      const dailyExpenseRecords = await listRecordsByDateRange(env,"dailyExpense",dailyRange.start,dailyRange.end);
      const custodyTotalExpenses = dailyExpenseRecords
        .filter(x => (x.status || "approved") === "approved")
        .reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
      const expenses = dailyExpenseRecords
        .filter(x => verified.accountType === "doctor" || !x.enteredBy || x.enteredBy === verified.uid)
        .map(x => ({ id:x.id, description:x.personName, amount:x.amount, date:x.date, notes:x.notes, createdAt:x.createdAt,
          status:x.status || "approved", enteredBy:x.enteredBy, enteredByName:x.enteredByName,
          approvedByName:x.approvedByName, approvedAt:x.approvedAt, reviewedByName:x.reviewedByName, reviewedAt:x.reviewedAt, rejectionReason:x.rejectionReason }));
      return jsonResponse({ expenses, date, custodyTotalExpenses:custodyTotalExpenses.toFixed(2), accountType:verified.accountType, expenseMode:verified.expenseMode || "auto" });
    }
    if (data.action === "listMonthlyExpenses") {
      const month = String(data.month || "");
      if (!/^\d{4}-\d{2}$/.test(month)) return jsonResponse({message:"الشهر المحدد غير صحيح."},400);
      const monthlyRange=periodDateRange("month",month);
      const expensesRecords = await listRecordsByDateRange(env,"dailyExpense",monthlyRange.start,monthlyRange.end);
      const expenses = expensesRecords
        .filter(x=>verified.accountType==="doctor" || !x.enteredBy || x.enteredBy===verified.uid)
        .sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")))
        .map(x=>({id:x.id,description:x.personName,amount:x.amount,date:x.date,notes:x.notes,status:x.status||"approved",enteredByName:x.enteredByName,approvedByName:x.approvedByName,reviewedByName:x.reviewedByName,reviewedAt:x.reviewedAt,rejectionReason:x.rejectionReason}));
      return jsonResponse({expenses,month});
    }
    if (data.action === "createDailyExpense") {
      const entry = data.entry || {}, description = String(entry.description || "").trim(), date = String(entry.date || ""), notes = String(entry.notes || "").trim(), amount = String(entry.amount ?? "");
      if (!cleanString(description,160) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T12:00:00")) || !/^\d{1,8}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || notes.length > 500) return jsonResponse({ message:"راجع وصف المصروف والمبلغ والتاريخ." },400);
      const now = new Date().toISOString();
      const records = verified.accountType === "staff" ? await listRecords(env, "settlement") : [];
       if (verified.accountType === "staff" && records.some(x => x.type === "settlement" && x.employeeUid === verified.uid && ((x.periodType === "day" && x.periodKey === date) || (x.periodType === "month" && x.periodKey === date.slice(0,7))))) {
        return jsonResponse({ message:"هذه الفترة تمت تصفيتها بالفعل. لا يمكن إضافة مصروف إليها بعد الإقفال." },409);
      }
      const isDoctor = verified.accountType === "doctor";
      const status = isDoctor || verified.expenseMode === "auto" ? "approved" : "pending";
      const record = { type:"dailyExpense", personName:description, amount, date, notes, status,
        enteredBy:verified.uid || DOCTOR_ADMIN_UID, enteredByName:verified.displayName || "الدكتور",
        approvedBy:isDoctor ? DOCTOR_ADMIN_UID : status === "approved" ? "automatic" : "",
        approvedByName:isDoctor ? "الدكتور" : status === "approved" ? "خصم تلقائي" : "",
        approvedAt:status === "approved" ? now : "", createdAt:now, updatedAt:now };
      const expense = await saveRecord(env, record);
      return jsonResponse({ expense },201);
    }
    if (data.action === "approveDailyExpense" || data.action === "rejectDailyExpense") {
      const id = String(data.id || "");
      if (!/^[A-Za-z0-9_-]{1,150}$/.test(id)) return jsonResponse({message:"معرّف المصروف غير صحيح."},400);
      const records = await listRecords(env, "dailyExpense");
       const expense = records.find(x => x.id === id);
      if (!expense) return jsonResponse({message:"المصروف غير موجود."},404);
      if ((expense.status || "approved") !== "pending") return jsonResponse({message:"تمت معالجة هذا المصروف بالفعل."},409);
      const now = new Date().toISOString();
      const status = data.action === "approveDailyExpense" ? "approved" : "rejected";
      const rejectionReason = String(data.reason || "").trim();
      if (status === "rejected" && rejectionReason.length > 300) return jsonResponse({message:"سبب الرفض طويل جدًا."},400);
      await saveRecord(env,{...expense,status,approvedBy:status==="approved"?DOCTOR_ADMIN_UID:"",approvedByName:status==="approved"?"الدكتور":"",approvedAt:status==="approved"?now:"",reviewedBy:DOCTOR_ADMIN_UID,reviewedByName:"الدكتور",reviewedAt:now,updatedAt:now,rejectionReason:status==="rejected"?(rejectionReason||"لم يُذكر سبب"):""},id);
      return jsonResponse({id,status,approvedAt:status === "approved" ? now : "",rejectionReason:status === "rejected" ? (rejectionReason || "لم يُذكر سبب") : ""});
    }
    if (data.action === "listSettlements") {
      const month=String(data.month||"");
      const monthlyRange=/^\d{4}-\d{2}$/.test(month)?periodDateRange("month",month):null;
      const expensesPromise=monthlyRange
        ? listRecordsByDateRange(env,"dailyExpense",monthlyRange.start,monthlyRange.end)
        : listRecords(env,"dailyExpense");
      const [settlements, expenses] = await Promise.all([
         listRecords(env, "settlement"),
         expensesPromise
       ]);
       settlements.sort((a,b)=>String(b.periodKey).localeCompare(String(a.periodKey)));
      return jsonResponse({settlements, expenses, pendingExpenses:expenses.filter(x=>(x.status || "approved")==="pending").length});
    }
    if (data.action === "previewSettlement") {
      const periodType = data.periodType === "month" ? "month" : data.periodType === "day" ? "day" : "";
      const periodKey = String(data.periodKey || "");
      const employeeUid = String(data.employeeUid || "");
      if (!periodType || !(periodType === "day" ? /^\d{4}-\d{2}-\d{2}$/.test(periodKey) : /^\d{4}-\d{2}$/.test(periodKey)) ||
          !/^[A-Za-z0-9_-]{1,128}$/.test(employeeUid)) return jsonResponse({message:"حدد الموظف والفترة بصورة صحيحة."},400);
      const monthKey=periodKey.slice(0,7);
      const monthRange=periodDateRange("month",monthKey);
      const range=periodDateRange(periodType,periodKey);
      const [settlements, periodExpenses] = await Promise.all([
         listEmployeeSettlements(env,employeeUid,monthRange.start,monthRange.end),
         listRecordsByDateRange(env,"dailyExpense",range.start,range.end,employeeUid)
       ]);
       const prior = settlements.find(x=>x.periodType===periodType && x.periodKey===periodKey);
       const closedDays = new Set(settlements.filter(x=>x.periodType==="day").map(x=>x.periodKey));
       const inPeriod = date => periodType === "day" ? date === periodKey : String(date || "") >= range.start && String(date || "") < range.end && !closedDays.has(String(date || "").slice(0,10));
       const expenses = periodExpenses.filter(x=>inPeriod(x.date));
      const pendingExpenses = expenses.filter(x=>(x.status || "approved")==="pending").length;
      const approvedExpenses = expenses.filter(x=>(x.status || "approved")==="approved").reduce((sum,x)=>sum+(Number(x.amount)||0),0);
      const bookings = (await listEmployeeBookings(env, employeeUid, range.start, range.end))
        .filter(x=>inPeriod(x.date) && x.paid>0);
      const receipts = bookings.reduce((sum,x)=>sum+x.paid,0);
      return jsonResponse({periodType,periodKey,employeeUid,totalReceipts:receipts.toFixed(2),totalExpenses:approvedExpenses.toFixed(2),
        netTotal:(receipts-approvedExpenses).toFixed(2),bookingCount:bookings.length,pendingExpenses,previouslySettledDays:closedDays.size,
        alreadySettled:!!prior,settlement:prior||null,currentBalance:prior?"0.00":(receipts-approvedExpenses).toFixed(2)});
    }
    if (data.action === "finalizeSettlement") {
      const periodType = data.periodType === "month" ? "month" : data.periodType === "day" ? "day" : "";
      const periodKey = String(data.periodKey || "");
      const employeeUid = String(data.employeeUid || "");
      if (!periodType || !(periodType === "day" ? /^\d{4}-\d{2}-\d{2}$/.test(periodKey) : /^\d{4}-\d{2}$/.test(periodKey)) ||
          !/^[A-Za-z0-9_-]{1,128}$/.test(employeeUid)) return jsonResponse({message:"حدد الموظف والفترة بصورة صحيحة."},400);
      const employeeDoc=await d1First(getClinicDatabase(env),"SELECT role,active,display_name FROM staff WHERE uid = ? LIMIT 1",[employeeUid]);
      if(!employeeDoc||employeeDoc.role!=="staff"||Number(employeeDoc.active)!==1)return jsonResponse({message:"حساب الموظف غير نشط أو غير صالح للتصفية."},400);
      const employeeName=employeeDoc.display_name||"الموظف";
      const monthKey=periodKey.slice(0,7);
      const monthRange=periodDateRange("month",monthKey);
      const range=periodDateRange(periodType,periodKey);
      const [settlements, periodExpenses] = await Promise.all([
         listEmployeeSettlements(env,employeeUid,monthRange.start,monthRange.end),
         listRecordsByDateRange(env,"dailyExpense",range.start,range.end,employeeUid)
       ]);
       if (settlements.some(x=>x.periodType===periodType && x.periodKey===periodKey)) return jsonResponse({message:"تمت تصفية عهدة هذا الموظف لهذه الفترة من قبل."},409);
       if (periodType === "day" && settlements.some(x=>x.periodType==="month" && x.periodKey===monthKey)) return jsonResponse({message:"تمت تصفية عهدة هذا الموظف للشهر بالفعل."},409);
       const closedDays = new Set(settlements.filter(x=>x.periodType==="day").map(x=>x.periodKey));
       const inPeriod = date => periodType === "day" ? date === periodKey : String(date || "") >= range.start && String(date || "") < range.end && !closedDays.has(String(date || "").slice(0,10));
       const expenses = periodExpenses.filter(x=>inPeriod(x.date));
      const pending = expenses.filter(x=>(x.status || "approved")==="pending");
      if (pending.length) return jsonResponse({message:"لا يمكن تصفية عهدة الموظف قبل اعتماد أو رفض كل مصروفاته المعلقة."},409);
      const approvedExpenses = expenses.filter(x=>(x.status || "approved")==="approved").reduce((sum,x)=>sum+(Number(x.amount)||0),0);
      const bookings = (await listEmployeeBookings(env, employeeUid, range.start, range.end))
        .filter(x=>inPeriod(x.date) && x.paid>0);
      const receipts = bookings.reduce((sum,x)=>sum+x.paid,0);
      const now = new Date().toISOString();
      const settlement = {type:"settlement",periodType,periodKey,date:periodKey,employeeUid,employeeName,status:"closed",
        closedBy:DOCTOR_ADMIN_UID,closedByName:"الدكتور",closedAt:now,
        totalReceipts:receipts.toFixed(2),totalExpenses:approvedExpenses.toFixed(2),netTotal:(receipts-approvedExpenses).toFixed(2),
        bookingCount:String(bookings.length),createdAt:now,updatedAt:now};
      const settlementId = "settlement-" + periodType + "-" + periodKey + "-" + employeeUid;
      let saved;
      try { saved=await saveRecord(env,settlement,settlementId,false); }
      catch(error) {
        const existing=await d1First(getClinicDatabase(env),"SELECT id FROM account_records WHERE id = ? LIMIT 1",[settlementId]);
        if(existing)return jsonResponse({message:"تمت تصفية عهدة هذا الموظف لهذه الفترة من قبل."},409);
        throw error;
      }
      return jsonResponse({settlement:saved},201);
    }
    if (data.action === "list") {
      const records = await listRecords(env);
      return jsonResponse({ categories: records.filter(x => x.type === "category"), entries: records.filter(x => x.type === "entry"), records });
    }
    if (data.action === "createCategory") {
      const name = String(data.name || "").trim(), kind = data.kind;
      if (!cleanString(name, 80) || !["income","expense"].includes(kind)) return jsonResponse({ message: "أدخل اسم القسم وحدد إن كان دخلًا أو مصروفًا." }, 400);
      const now = new Date().toISOString();
      const category=await saveRecord(env,{type:"category",name,kind,createdAt:now,updatedAt:now});
      return jsonResponse({category},201);
    }
    if (data.action === "createEntry") {
      const entry = data.entry || {}, categoryId = String(entry.categoryId || "");
      const personName = String(entry.personName || "").trim(), date = String(entry.date || ""), notes = String(entry.notes || "").trim();
      const amount = String(entry.amount ?? "");
      if (!/^[A-Za-z0-9_-]{1,150}$/.test(categoryId) || !cleanString(personName,120) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T12:00:00")) ||
          !/^\d{1,8}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || notes.length > 1000) {
        return jsonResponse({ message: "راجع البيان والقيمة والتاريخ والملاحظات." }, 400);
      }
      const builtIn = categoryId === "employee-salaries";
      const categories = builtIn ? [] : (await listRecords(env, "category")).filter(x => x.id === categoryId);
      if (!builtIn && !categories.length) return jsonResponse({ message: "قسم الحسابات المحدد غير موجود." }, 404);
      const kind = builtIn ? "expense" : categories[0].kind;
      const now = new Date().toISOString();
      const saved=await saveRecord(env,{type:"entry",categoryId,kind,personName,amount,date,notes,createdAt:now,updatedAt:now});
      return jsonResponse({entry:saved},201);
    }
    return jsonResponse({ message: "الإجراء المطلوب غير معروف." }, 400);
  } catch (error) {
    console.error("Accounts request failed:", error);
    return jsonResponse({ message: error.message || "تعذر تنفيذ العملية." }, 500);
  }
}
export async function onRequest(context) {
  if (context.request.method !== "POST") return new Response(null, { status:405, headers:{ Allow:"POST", "Cache-Control":"no-store" } });
  let input = {};
  try { input = await context.request.clone().json(); } catch {}
  const result = await onRequestPost(context);
  const readOnly = new Set(["list", "listDailyExpenses", "listMonthlyExpenses", "listSettlements", "previewSettlement"]);
  if (result.ok && input.action && !readOnly.has(input.action)) {
    const notification = publishClinicRealtime(context.env, "accounts_changed");
    if (typeof context.waitUntil === "function") context.waitUntil(notification);
    else void notification;
  }
  return result;
}
