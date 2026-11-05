import { getClinicDatabase, d1All, d1First, d1Run, d1Batch } from "../../_shared/d1.js";
import { publishClinicRealtime } from "../../_shared/realtime.js";
const DOCTOR_ADMIN_UID = "8fUdGutQHRau3RXQIrRtZUqQ9Nm1";
const EXPECTED_PROJECT_ID = "clinics-manger";
const FIREBASE_LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
const FIREBASE_SIGNUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:signUp";
const FIREBASE_ADMIN_UPDATE_URL = "https://identitytoolkit.googleapis.com/v1/projects/clinics-manger/accounts:update";
const FIREBASE_DELETE_URL = "https://identitytoolkit.googleapis.com/v1/accounts:delete";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const PERMISSION_KEYS = ["bookings", "patients", "medicalRecords", "settings"];

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

function b64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64text(value) { return b64url(new TextEncoder().encode(value)); }
function privateKeyBytes(pem) {
  const raw = atob(pem.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s/g, ""));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
function parseServiceAccount(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error("Missing service account secret.");
  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (account.project_id !== EXPECTED_PROJECT_ID || !account.client_email || !account.private_key) {
    throw new Error("Invalid service account configuration.");
  }
  return account;
}
async function googleAccessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = [
    b64text(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    b64text(JSON.stringify({ iss: account.client_email, scope: GOOGLE_SCOPE, aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3600 }))
  ].join(".");
  const key = await crypto.subtle.importKey("pkcs8", privateKeyBytes(account.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: unsigned + "." + b64url(new Uint8Array(signature)) })
  });
  if (!response.ok) throw new Error("Unable to obtain Google access token.");
  const result = await response.json();
  if (!result.access_token) throw new Error("Google access token missing.");
  return result.access_token;
}
function normalizeUsername(value) {
  return String(value || "").normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي")
    .replace(/\s+/g, " ").trim().toLocaleLowerCase("ar");
}
function validUsername(value) {
  return value.length >= 3 && value.length <= 40 &&
    /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(value);
}
async function internalEmailFor(usernameKey) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(usernameKey));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return "patient-" + hash + "@clinic-manger.invalid";
}

async function verifyUser(request, env) {
  if (!env.FIREBASE_API_KEY) return { ok: false, status: 503, message: "خدمة التحقق غير مهيأة." };
  const match = (request.headers.get("Authorization") || "").match(/^Bearer\s+(\S+)$/i);
  if (!match || match[1].length > 8192) return { ok: false, status: 401, message: "يلزم تسجيل الدخول." };
  const response = await fetch(FIREBASE_LOOKUP_URL + "?key=" + encodeURIComponent(env.FIREBASE_API_KEY), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: match[1] })
  });
  if (!response.ok) return { ok: false, status: 401, message: "جلسة الدخول غير صالحة." };
  const result = await response.json();
  const user = result.users?.[0];
  return user?.localId ? { ok: true, uid: user.localId, email: user.email || "" } : { ok: false, status: 401, message: "تعذر التحقق من الحساب." };
}

async function verifyPatientsEditor(user, env) {
  if (user.uid === DOCTOR_ADMIN_UID) return { ok: true };
  const database = getClinicDatabase(env);
  const staff = await d1First(database,
    "SELECT role, active, permissions_json FROM staff WHERE uid = ? LIMIT 1", [user.uid]);
  if (!staff || staff.role !== "staff" || Number(staff.active) !== 1) return {
    ok:false,status:403,message:"حساب الموظف غير نشط أو غير معتمد."
  };
  let permissions={};try{permissions=JSON.parse(staff.permissions_json||"{}");}catch{}
  if (permissions.patients !== "edit") return {
    ok:false,status:403,message:"تحتاج إلى صلاحية تعديل بيانات المرضى لإدارة الحسابات."
  };
  return {ok:true};
}

async function deleteAuthUser(apiKey, idToken) {
  if (!idToken) return;
  try {
    await fetch(FIREBASE_DELETE_URL + "?key=" + encodeURIComponent(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken })
    });
  } catch (error) {
    console.error("Could not roll back newly created Auth user:", error);
  }
}

async function onRequestInternal({ request, env }) {
  if (request.method !== "POST") return jsonResponse({ message: "طريقة الطلب غير مسموحة." }, 405);
  if (!(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) {
    return jsonResponse({ message: "نوع محتوى الطلب غير مدعوم." }, 415);
  }

  let body;
  try {
    const raw = await request.text();
    if (raw.length > 12000) return jsonResponse({ message: "حجم الطلب أكبر من المسموح." }, 413);
    body = JSON.parse(raw);
  } catch {
    return jsonResponse({ message: "بيانات الطلب غير صحيحة." }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body) || !["create", "list", "searchMedicalPatients", "accountStatus", "resetPassword"].includes(body.action)) {
    return jsonResponse({ message: "الإجراء المطلوب غير معروف." }, 400);
  }

  if (body.action === "list") {
    const user = await verifyUser(request, env);
    if (!user.ok) return jsonResponse({ message: user.message }, user.status);
    if (user.uid !== DOCTOR_ADMIN_UID) return jsonResponse({ message: "قائمة حسابات المريضات متاحة للدكتور فقط." }, 403);
    try {
      const database=getClinicDatabase(env);
      const rows=await d1All(database,"SELECT uid, role, active, display_name, email, phone, username, patient_id, created_at, updated_at FROM patient_accounts ORDER BY created_at DESC");
      const patients=rows.map(row=>({uid:row.uid,role:row.role,active:Number(row.active)===1,displayName:row.display_name||"",email:row.email||"",phone:row.phone||"",username:row.username||"",patientId:row.patient_id||"",createdAt:row.created_at||"",updatedAt:row.updated_at||""}));
      return jsonResponse({patients});
    } catch(error) {
      console.error("Patient list export failed:",error);
      return jsonResponse({message:"تعذر تحميل بيانات حسابات المريضات للتصدير."},503);
    }
  }

  if (body.action === "searchMedicalPatients") {
    const user=await verifyUser(request,env);
    if(!user.ok)return jsonResponse({message:user.message},user.status);
    try {
      const permission=await verifyPatientsEditor(user,env);
      if(!permission.ok)return jsonResponse({message:permission.message},permission.status);
      const query=String(body.query||"").trim().normalize("NFKC").replace(/\s+/g," ").toLocaleLowerCase("ar");
      if(query.length<1||query.length>120)return jsonResponse({patients:[]});
      const rows=await d1All(getClinicDatabase(env),"SELECT id, display_name, phone, patient_number FROM medical_patients ORDER BY display_name LIMIT 1000");
      const patients=rows.map(row=>({patientId:row.id,displayName:row.display_name||"",phone:row.phone||"",patientNumber:row.patient_number||""}))
        .filter(patient=>patient.patientId&&(patient.displayName.toLocaleLowerCase("ar").includes(query)||patient.phone.includes(query)||patient.patientNumber.toLocaleLowerCase("ar").includes(query))).slice(0,20);
      return jsonResponse({patients});
    }catch(error){console.error("Medical patient account search failed:",error);return jsonResponse({message:"تعذر البحث في ملفات المرضى."},503);}
  }

  const patientId = typeof body.patientId === "string" ? body.patientId.trim() : "";
  const username = normalizeUsername(body.username);
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(patientId)) return jsonResponse({ message: "اختَر ملف مريض مسجلًا من نتائج البحث." }, 400);

  if (["accountStatus", "resetPassword"].includes(body.action)) {
    if(body.action==="resetPassword"&&(password.length<8||password.length>128))return jsonResponse({message:"كلمة المرور الجديدة يجب أن تكون من 8 إلى 128 حرفًا."},400);
    const user=await verifyUser(request,env);
    if(!user.ok)return jsonResponse({message:user.message},user.status);
    try {
      const permission=await verifyPatientsEditor(user,env);
      if(!permission.ok)return jsonResponse({message:permission.message},permission.status);
      const database=getClinicDatabase(env);
      const medicalPatient=await d1First(database,"SELECT id, display_name, phone FROM medical_patients WHERE id = ? LIMIT 1",[patientId]);
      if(!medicalPatient)return jsonResponse({message:"ملف المريض المحدد غير موجود. ابحث عنه مرة أخرى."},404);
      const linked=await d1First(database,"SELECT uid, username, email, source_payload_json FROM patient_accounts WHERE patient_id = ? AND role = 'patient' AND active = 1 LIMIT 1",[patientId]);
      if(!linked)return jsonResponse({accountExists:false,message:"لا يوجد حساب نشط مرتبط بهذا الملف."});
      if(body.action==="accountStatus")return jsonResponse({accountExists:true,username:linked.username||""});
      const tokenAccount=parseServiceAccount(env),token=await googleAccessToken(tokenAccount);
      const updateResponse=await fetch(FIREBASE_ADMIN_UPDATE_URL,{
        method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
        body:JSON.stringify({localId:linked.uid,password})
      });
      if(!updateResponse.ok){const detail=await updateResponse.text();console.error("Patient password reset failed:",updateResponse.status,detail.slice(0,400));return jsonResponse({message:"تعذر إعادة تعيين كلمة المرور من خدمة Firebase. لم يتم حفظ أي كلمة مرور."},503);}
      const now=new Date().toISOString();
      let payload={};try{payload=JSON.parse(linked.source_payload_json||"{}");}catch{}
      payload.updatedAt=now;payload.passwordResetAt=now;payload.passwordResetBy=user.uid;
      await d1Run(database,"UPDATE patient_accounts SET updated_at = ?, source_payload_json = ? WHERE uid = ?",[now,JSON.stringify(payload),linked.uid]);
      return jsonResponse({success:true,patient:{patientId,username:linked.username},credentials:{username:linked.username,password},message:"تم تغيير كلمة المرور. سلّمها للمريض بشكل خاص؛ لن يتم حفظها كنص مكشوف."});
    }catch(error){console.error("Patient account status/reset failed:",error);return jsonResponse({message:error.message||"تعذر التحقق من حساب المريض أو إعادة تعيين كلمة المرور."},error.status===403?403:503);}
  }

  if (!validUsername(username)) return jsonResponse({ message: "اسم المستخدم يجب أن يكون من 3 إلى 40 حرفًا أو رقمًا، ويمكن أن يكون بالعربية أو رقم الهاتف." }, 400);
  if (password.length < 8 || password.length > 128) return jsonResponse({ message: "كلمة المرور يجب أن تكون من 8 إلى 128 حرفًا." }, 400);


  const user = await verifyUser(request, env);
  if (!user.ok) return jsonResponse({ message: user.message }, user.status);

  try {
    const permission = await verifyPatientsEditor(user, env);
    if (!permission.ok) return jsonResponse({ message: permission.message }, permission.status);

    const usernameKey=normalizeUsername(username),database=getClinicDatabase(env);
    const existingUsername=await d1First(database,"SELECT username_key FROM patient_usernames WHERE username_key = ? LIMIT 1",[usernameKey]);
    if(existingUsername)return jsonResponse({message:"اسم المستخدم مستخدم بالفعل. اختَر اسمًا آخر."},409);
    const medicalPatient=await d1First(database,"SELECT id, display_name, phone FROM medical_patients WHERE id = ? LIMIT 1",[patientId]);
    if(!medicalPatient)return jsonResponse({message:"ملف المريض المحدد غير موجود. ابحث عنه مرة أخرى."},404);
    const displayName=String(medicalPatient.display_name||"").trim(),phone=String(medicalPatient.phone||"").trim();
    if(displayName.length<2||!phone)return jsonResponse({message:"ملف المريض لا يحتوي على الاسم ورقم الهاتف اللازمين لإنشاء الحساب."},400);
    const alreadyLinked=await d1First(database,"SELECT uid FROM patient_accounts WHERE patient_id = ? AND role = 'patient' AND active = 1 LIMIT 1",[patientId]);
    if(alreadyLinked)return jsonResponse({message:"يوجد حساب نشط مرتبط بملف هذا المريض بالفعل."},409);

    const email = await internalEmailFor(usernameKey);
    const signup = await fetch(FIREBASE_SIGNUP_URL + "?key=" + encodeURIComponent(env.FIREBASE_API_KEY || ""), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName, returnSecureToken: true })
    });
    const signupResult = await signup.json().catch(() => ({}));
    if (!signup.ok || !signupResult.localId) {
      const code = signupResult.error?.message || "";
      const message = code.includes("EMAIL_EXISTS")
        ? "هذا البريد الإلكتروني مرتبط بحساب موجود بالفعل."
        : code.includes("OPERATION_NOT_ALLOWED")
          ? "إنشاء الحسابات بالبريد وكلمة المرور غير مفعّل في Firebase."
          : "تعذر إنشاء حساب المريضة. راجعي البيانات وحاولي مرة أخرى.";
      return jsonResponse({ message }, code.includes("EMAIL_EXISTS") ? 409 : 400);
    }

    const uid = signupResult.localId;
    const now = new Date().toISOString();
    try {
      const patientAccount={uid,role:"patient",active:true,patientId,displayName,email,phone,username,usernameKey,createdAt:now,updatedAt:now};
      const usernameRecord={usernameKey,uid,email,username,active:true,createdAt:now};
      await d1Batch(database,[
        {sql:"INSERT INTO patient_accounts (uid,role,active,patient_id,display_name,email,phone,username,username_key,created_at,updated_at,source_payload_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
          params:[uid,"patient",1,patientId,displayName,email,phone,username,usernameKey,now,now,JSON.stringify(patientAccount)]},
        {sql:"INSERT INTO patient_usernames (username_key,uid,email,username,active,created_at,source_payload_json) VALUES (?,?,?,?,?,?,?)",
          params:[usernameKey,uid,email,username,1,now,JSON.stringify(usernameRecord)]}
      ]);
    } catch(error) {
      await deleteAuthUser(env.FIREBASE_API_KEY,signupResult.idToken);
      throw error;
    }

    return jsonResponse({
      success: true,
      patient: { uid, patientId, displayName, phone, username },
      credentials: { username, password },
      message: "تم إنشاء حساب المريض وربطه بملفه الطبي. سلّم بيانات الدخول له بشكل خاص. كلمة المرور غير محفوظة في قاعدة البيانات."
    }, 201);
  } catch (error) {
    console.error("Patient account creation failed:", error);
    return jsonResponse({ message: error.message || "تعذر إنشاء حساب المريضة." }, error.status === 403 ? 403 : 503);
  }
}


export async function onRequest(context) {
  let input = {};
  try { input = await context.request.clone().json(); } catch {}
  const result = await onRequestInternal(context);
  if (result.ok && ["create", "accountStatus", "resetPassword"].includes(input.action)) {
    const notification = publishClinicRealtime(context.env, "patient_changed");
    if (typeof context.waitUntil === "function") context.waitUntil(notification);
    else void notification;
  }
  return result;
}
