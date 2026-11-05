import { getClinicDatabase, d1First } from "../../_shared/d1.js";
const FIREBASE_SIGNIN_URL = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword";

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

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return jsonResponse({ message: "طريقة الطلب غير مسموحة." }, 405);
  if (!env.FIREBASE_API_KEY) return jsonResponse({ message: "خدمة تسجيل الدخول غير مهيأة." }, 503);
  if (!(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) {
    return jsonResponse({ message: "نوع محتوى الطلب غير مدعوم." }, 415);
  }

  let body;
  try {
    const raw = await request.text();
    if (raw.length > 5000) return jsonResponse({ message: "حجم الطلب أكبر من المسموح." }, 413);
    body = JSON.parse(raw);
  } catch {
    return jsonResponse({ message: "اسم المستخدم أو كلمة المرور غير صحيحة." }, 401);
  }

  const username = normalizeUsername(body?.username);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!validUsername(username) || password.length < 1 || password.length > 128) {
    return jsonResponse({ message: "اسم المستخدم أو كلمة المرور غير صحيحة." }, 401);
  }

  try {
    const database = getClinicDatabase(env);
    const usernameRecord = await d1First(
      database,
      "SELECT email, uid, active FROM patient_usernames WHERE username_key = ? LIMIT 1",
      [username]
    );
    const email = usernameRecord?.email || "";
    const uid = usernameRecord?.uid || "";
    const active = Number(usernameRecord?.active) === 1;
    if (!email || !uid || !active) {
      return jsonResponse({ message: "اسم المستخدم أو كلمة المرور غير صحيحة." }, 401);
    }

    const signIn = await fetch(FIREBASE_SIGNIN_URL + "?key=" + encodeURIComponent(env.FIREBASE_API_KEY), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });
    const result = await signIn.json().catch(() => ({}));
    if (!signIn.ok || result.localId !== uid) {
      return jsonResponse({ message: "اسم المستخدم أو كلمة المرور غير صحيحة." }, 401);
    }

    return jsonResponse({ success: true, email });
  } catch (error) {
    console.error("Username sign-in resolution failed:", error);
    return jsonResponse({ message: "تعذر تسجيل الدخول حاليًا. حاولي مرة أخرى." }, 503);
  }
}
