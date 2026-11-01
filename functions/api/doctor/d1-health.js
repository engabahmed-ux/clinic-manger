import { getClinicDatabaseHealth } from "../../_shared/d1.js";

const DOCTOR_ADMIN_UID = "8fUdGutQHRau3RXQIrRtZUqQ9Nm1";
const FIREBASE_LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";

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

async function verifyDoctor(request, env) {
  if (!env.FIREBASE_API_KEY) {
    return { ok: false, status: 503, message: "خدمة التحقق غير مهيأة على الخادم." };
  }

  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  if (!match || match[1].length > 8192) {
    return { ok: false, status: 401, message: "يلزم تسجيل الدخول." };
  }

  const response = await fetch(
    FIREBASE_LOOKUP_URL + "?key=" + encodeURIComponent(env.FIREBASE_API_KEY),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: match[1] })
    }
  );

  if (!response.ok) {
    return { ok: false, status: 401, message: "جلسة الدخول غير صالحة." };
  }

  const result = await response.json();
  const user = result.users?.[0];
  if (!user?.localId) {
    return { ok: false, status: 401, message: "تعذر التحقق من الحساب." };
  }
  if (user.localId !== DOCTOR_ADMIN_UID) {
    return { ok: false, status: 403, message: "غير مصرح لك باستخدام هذا المسار." };
  }

  return { ok: true };
}

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return jsonResponse({ ok: false, message: "طريقة الطلب غير مدعومة." }, 405);
  }

  try {
    const auth = await verifyDoctor(context.request, context.env);
    if (!auth.ok) {
      return jsonResponse({ ok: false, message: auth.message }, auth.status);
    }

    const health = await getClinicDatabaseHealth(context.env);
    return jsonResponse({
      ok: true,
      database: "cloudflare-d1-preview",
      ...health
    });
  } catch {
    return jsonResponse({
      ok: false,
      message: "تعذر فحص قاعدة البيانات على بيئة الاختبار."
    }, 503);
  }
}
