
const DOCTOR_ADMIN_UID = "8fUdGutQHRau3RXQIrRtZUqQ9Nm1";
const EXPECTED_PROJECT_ID = "clinics-manger";
const STAFF_COLLECTION = "clinicStaff";

const FIREBASE_LOOKUP_URL =
  "https://identitytoolkit.googleapis.com/v1/accounts:lookup";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

const PERMISSION_KEYS = [
  "bookings",
  "patients",
  "medicalRecords",
  "settings"
];

const PERMISSION_VALUES = ["none", "view", "edit"];

// كاش توكن Google على مستوى الـ isolate (صالح 55 دقيقة)
// بدل طلب توكن جديد مع كل طلب API.
let cachedAccessToken = null;
let cachedAccessTokenExpiry = 0;

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

function base64UrlEncodeBytes(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlEncodeText(value) {
  return base64UrlEncodeBytes(
    new TextEncoder().encode(value)
  );
}

function decodePrivateKey(pem) {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function parseServiceAccount(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new Error("Missing service account secret.");
  }

  let account;

  try {
    account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch {
    throw new Error("Invalid service account JSON.");
  }

  if (
    account.project_id !== EXPECTED_PROJECT_ID ||
    typeof account.client_email !== "string" ||
    typeof account.private_key !== "string"
  ) {
    throw new Error("Invalid service account configuration.");
  }

  return account;
}

async function createGoogleAccessToken(serviceAccount) {
  const nowMs = Date.now();

  if (cachedAccessToken && nowMs < cachedAccessTokenExpiry) {
    return cachedAccessToken;
  }

  const now = Math.floor(nowMs / 1000);

  const header = {
    alg: "RS256",
    typ: "JWT"
  };

  const claims = {
    iss: serviceAccount.client_email,
    scope: GOOGLE_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600
  };

  const unsignedToken = [
    base64UrlEncodeText(JSON.stringify(header)),
    base64UrlEncodeText(JSON.stringify(claims))
  ].join(".");

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    decodePrivateKey(serviceAccount.private_key),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(unsignedToken)
  );

  const assertion = [
    unsignedToken,
    base64UrlEncodeBytes(new Uint8Array(signature))
  ].join(".");

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type:
        "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  if (!response.ok) {
    console.error(
      "Account type Google OAuth error:",
      response.status
    );

    throw new Error("Unable to obtain Google access token.");
  }

  const result = await response.json();

  if (!result.access_token) {
    throw new Error("Google access token missing.");
  }

  cachedAccessToken = result.access_token;
  cachedAccessTokenExpiry = nowMs + 55 * 60 * 1000;

  return result.access_token;
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

function decodePermissions(fields) {
  const savedFields =
    fields?.permissions?.mapValue?.fields || {};

  const permissions = {};

  for (const key of PERMISSION_KEYS) {
    const value = savedFields[key]?.stringValue;

    permissions[key] =
      PERMISSION_VALUES.includes(value) ? value : "none";
  }

  return permissions;
}

async function getStaffRecord(uid, env) {
  const serviceAccount = parseServiceAccount(env);
  const accessToken = await createGoogleAccessToken(serviceAccount);

  const url =
    "https://firestore.googleapis.com/v1/projects/" +
    `${encodeURIComponent(serviceAccount.project_id)}/databases/(default)/documents/` +
    `${STAFF_COLLECTION}/${encodeURIComponent(uid)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${accessToken}`
    }
  });

  if (response.status === 404) {
    return { exists: false };
  }

  if (!response.ok) {
    const details = await response.text();

    console.error(
      "Staff document lookup failed:",
      response.status,
      details.slice(0, 1000)
    );

    throw new Error("Unable to verify staff record.");
  }

  const document = await response.json();
  const fields = document.fields || {};

  const storedUid = fields.uid?.stringValue || "";
  const role = fields.role?.stringValue || "";
  const active = fields.active?.booleanValue === true;

  if (storedUid !== uid || role !== "staff") {
    return { exists: false };
  }

  if (!active) {
    return { exists: true, active: false };
  }

  return {
    exists: true,
    active: true,
    displayName: fields.displayName?.stringValue || "",
    permissions: decodePermissions(fields)
  };
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

    if (!staff.exists) {
      return jsonResponse({
        accountType: "patient"
      });
    }

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
