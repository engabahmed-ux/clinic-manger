import { getClinicDatabase, d1First } from "../../_shared/d1.js";
const DOCTOR_ADMIN_UID = "8fUdGutQHRau3RXQIrRtZUqQ9Nm1";
const FIREBASE_LOOKUP_URL =
  "https://identitytoolkit.googleapis.com/v1/accounts:lookup";


const PERMISSION_KEYS = [
  "bookings",
  "patients",
  "medicalRecords",
  "settings",
  "accounts"
];

const PERMISSION_VALUES = ["none", "view", "edit"];

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

async function verifyFirebaseToken(request, env) {
  if (!env.FIREBASE_API_KEY) {
    return {
      ok: false,
      status: 503,
      body: { message: "إعدادات التحقق غير مكتملة على الخادم." }
    };
  }

  const authorization =
    request.headers.get("Authorization") || "";

  const match = authorization.match(/^Bearer\s+(\S+)$/i);

  if (!match || match[1].length > 8192) {
    return {
      ok: false,
      status: 401,
      body: { message: "يلزم تسجيل الدخول." }
    };
  }

  try {
    const response = await fetch(
      `${FIREBASE_LOOKUP_URL}?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          idToken: match[1]
        })
      }
    );

    if (!response.ok) {
      return {
        ok: false,
        status: 401,
        body: { message: "جلسة الدخول غير صالحة." }
      };
    }

    const result = await response.json();
    const user = result.users?.[0];

    if (!user?.localId) {
      return {
        ok: false,
        status: 401,
        body: { message: "جلسة الدخول غير صالحة." }
      };
    }

    return {
      ok: true,
      uid: user.localId
    };
  } catch (error) {
    console.error("Firebase token lookup failed:", error);

    return {
      ok: false,
      status: 503,
      body: { message: "تعذر التحقق من الحساب حاليًا." }
    };
  }
}

async function getStaffRecord(uid, env) {
  const database = getClinicDatabase(env);
  const row = await d1First(
    database,
    "SELECT uid, role, active, display_name, permissions_json FROM staff WHERE uid = ? LIMIT 1",
    [uid]
  );
  if (!row || row.role !== "staff") return { exists: false };
  if (Number(row.active) !== 1) return { exists: true, active: false };
  let permissions = {};
  try { permissions = JSON.parse(row.permissions_json || "{}"); } catch {}
  const normalized = {};
  for (const key of PERMISSION_KEYS) {
    const value = permissions[key];
    normalized[key] = PERMISSION_VALUES.includes(value) ? value : "none";
  }
  return { exists: true, active: true, displayName: row.display_name || "", permissions: normalized };
}

async function getPatientRecord(uid, env) {
  const database = getClinicDatabase(env);
  const row = await d1First(
    database,
    "SELECT uid, role, active, display_name FROM patient_accounts WHERE uid = ? LIMIT 1",
    [uid]
  );
  if (!row || row.role !== "patient") return { exists: false };
  return { exists: true, active: Number(row.active) === 1, displayName: row.display_name || "" };
}

async function handlePost({ request, env }) {
  if (!env.FIREBASE_API_KEY) {
    return jsonResponse(
      { message: "إعدادات Firebase غير مكتملة على الخادم." },
      503
    );
  }

  const contentType = request.headers.get("Content-Type") || "";

  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonResponse(
      { message: "نوع محتوى الطلب غير مدعوم." },
      415
    );
  }

  const contentLength = Number(
    request.headers.get("Content-Length") || 0
  );

  if (contentLength > 20000) {
    return jsonResponse(
      { message: "حجم الطلب أكبر من المسموح." },
      413
    );
  }

  const verification = await verifyFirebaseToken(request, env);

  if (!verification.ok) {
    return jsonResponse(
      verification.body,
      verification.status
    );
  }

  let body;

  try {
    const rawBody = await request.text();

    if (rawBody.length > 20000) {
      return jsonResponse(
        { message: "حجم الطلب أكبر من المسموح." },
        413
      );
    }

    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse(
      { message: "بيانات الطلب غير صحيحة." },
      400
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return jsonResponse(
      { message: "صيغة الطلب غير صحيحة." },
      400
    );
  }

  const uid = verification.uid;

  if (uid === DOCTOR_ADMIN_UID) {
    return jsonResponse({
      accountType: "doctor"
    });
  }

  try {
    const staff = await getStaffRecord(uid, env);

    if (staff.exists) {
      if (!staff.active) {
        return jsonResponse(
          { message: "حساب الموظف غير نشط. تواصل مع الدكتور." },
          403
        );
      }

      return jsonResponse({
        accountType: "staff",
        displayName: staff.displayName,
        permissions: staff.permissions
      });
    }

    const patient = await getPatientRecord(uid, env);
    if (!patient.exists || !patient.active) {
      return jsonResponse(
        { message: "هذا الحساب غير مسجل كمريضة معتمدة في العيادة." },
        403
      );
    }

    return jsonResponse({
      accountType: "patient",
      displayName: patient.displayName
    });
  } catch (error) {
    console.error("Account type resolution failed:", error);

    return jsonResponse(
      { message: "تعذر التحقق من نوع الحساب حاليًا." },
      503
    );
  }
}

export async function onRequestPost(context) {
  return handlePost(context);
}

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return new Response(null, {
      status: 405,
      headers: {
        "Allow": "POST",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  }

  return handlePost(context);
}
