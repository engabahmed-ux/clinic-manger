
const DOCTOR_ADMIN_UID = "8fUdGutQHRau3RXQIrRtZUqQ9Nm1";
const EXPECTED_PROJECT_ID = "clinics-manger";
const FIRESTORE_COLLECTION = "clinicStaff";

const ALLOWED_PERMISSION_KEYS = [
  "bookings",
  "patients",
  "medicalRecords",
  "settings",
  "accounts"
];

const ALLOWED_PERMISSION_VALUES = [
  "none",
  "view",
  "edit"
];

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const FIREBASE_SIGNUP_URL =
  "https://identitytoolkit.googleapis.com/v1/accounts:signUp";
const FIREBASE_LOOKUP_URL =
  "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
const FIREBASE_DELETE_URL =
  "https://identitytoolkit.googleapis.com/v1/accounts:delete";

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
  const raw = env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!raw) {
    throw new Error("Missing service account secret.");
  }

  let account;

  try {
    account = JSON.parse(raw);
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
  const now = Math.floor(Date.now() / 1000);

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
      "Google OAuth token request failed:",
      response.status
    );

    throw new Error("Unable to obtain Google access token.");
  }

  const result = await response.json();

  if (
    typeof result.access_token !== "string" ||
    !result.access_token
  ) {
    throw new Error("Google access token missing.");
  }

  return result.access_token;
}

async function verifyDoctor(request, env) {
  if (!env.FIREBASE_API_KEY) {
    return {
      ok: false,
      status: 503,
      body: {
        message: "خدمة التحقق غير مهيأة على الخادم."
      }
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

    if (user.localId !== DOCTOR_ADMIN_UID) {
      return {
        ok: false,
        status: 403,
        body: { message: "غير مسموح بتنفيذ هذا الإجراء." }
      };
    }

    return {
      ok: true,
      uid: user.localId,
      email: user.email || null
    };
  } catch (error) {
    console.error("Doctor verification request failed:", error);

    return {
      ok: false,
      status: 503,
      body: {
        message: "تعذر التحقق من الحساب حاليًا. حاول لاحقًا."
      }
    };
  }
}

function normalizePermissions(input) {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw new Error("بيانات الصلاحيات غير صحيحة.");
  }

  const permissions = {};

  for (const key of ALLOWED_PERMISSION_KEYS) {
    const value = input[key] ?? "none";

    if (!ALLOWED_PERMISSION_VALUES.includes(value)) {
      throw new Error("إحدى قيم الصلاحيات غير صحيحة.");
    }

    permissions[key] = value;
  }

  for (const key of Object.keys(input)) {
    if (!ALLOWED_PERMISSION_KEYS.includes(key)) {
      throw new Error("تم إرسال قسم غير معتمد.");
    }
  }

  return permissions;
}

function encodeString(value) {
  return { stringValue: String(value) };
}

function encodePermissions(permissions) {
  const fields = {};

  for (const key of ALLOWED_PERMISSION_KEYS) {
    fields[key] = encodeString(permissions[key]);
  }

  return {
    mapValue: { fields }
  };
}

function decodeString(field) {
  if (!field) return "";

  if (typeof field.stringValue === "string") {
    return field.stringValue;
  }

  return "";
}

function decodePermissions(field) {
  const fields = field?.mapValue?.fields || {};
  const permissions = {};

  for (const key of ALLOWED_PERMISSION_KEYS) {
    const value = decodeString(fields[key]);

    permissions[key] = ALLOWED_PERMISSION_VALUES.includes(value)
      ? value
      : "none";
  }

  return permissions;
}

function decodeEmployeeDocument(document) {
  const fields = document.fields || {};
  const nameParts = (document.name || "").split("/");
  const uid = decodeString(fields.uid) || nameParts.at(-1) || "";

  return {
    uid,
    email: decodeString(fields.email),
    displayName: decodeString(fields.displayName),
    permissions: decodePermissions(fields.permissions),
    expenseMode: decodeString(fields.expenseMode) === "auto" ? "auto" : "approval",
    createdAt: fields.createdAt?.timestampValue || null
  };
}

function firestoreBaseUrl(projectId) {
  return (
    "https://firestore.googleapis.com/v1/projects/" +
    `${encodeURIComponent(projectId)}/databases/(default)/documents`
  );
}

async function firestoreRequest(
  projectId,
  accessToken,
  path,
  options = {}
) {
  const response = await fetch(
    `${firestoreBaseUrl(projectId)}${path}`,
    {
      ...options,
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    }
  );

  if (!response.ok) {
    const details = await response.text();

    console.error(
      "Firestore REST request failed:",
      response.status,
      details.slice(0, 1500)
    );

    throw new Error("تعذر الوصول إلى بيانات الموظفين.");
  }

  if (response.status === 204) {
    return null;
  }

  const responseText = await response.text();

  if (!responseText) return null;

  return JSON.parse(responseText);
}

async function listEmployees(projectId, accessToken) {
  const result = await firestoreRequest(
    projectId,
    accessToken,
    ":runQuery",
    {
      method: "POST",
      body: JSON.stringify({
        structuredQuery: {
          from: [
            {
              collectionId: FIRESTORE_COLLECTION
            }
          ],
          limit: 200
        }
      })
    }
  );

  const employees = (Array.isArray(result) ? result : [])
    .filter((item) => item.document)
    .map((item) => decodeEmployeeDocument(item.document))
    .filter((employee) => employee.uid)
    .sort((a, b) =>
      a.displayName.localeCompare(b.displayName, "ar")
    );

  return employees;
}

async function createEmployeeAccount(env, data) {
  const displayName = data.displayName.trim();
  const email = data.email.trim().toLowerCase();
  const password = data.password;

  if (
    !displayName ||
    displayName.length > 100 ||
    /[\u0000-\u001F\u007F]/.test(displayName)
  ) {
    return {
      status: 400,
      body: { message: "اسم الموظف مطلوب ويجب ألا يتجاوز 100 حرف." }
    };
  }

  if (
    !email ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return {
      status: 400,
      body: { message: "أدخل بريدًا إلكترونيًا صحيحًا." }
    };
  }

  if (
    typeof password !== "string" ||
    password.length < 6 ||
    password.length > 128
  ) {
    return {
      status: 400,
      body: { message: "كلمة المرور يجب أن تكون من 6 إلى 128 حرفًا." }
    };
  }

  const expenseMode = data.expenseMode === "approval" ? "approval" : data.expenseMode === "auto" ? "auto" : data.expenseMode == null ? "approval" : null;
  if (!expenseMode) return { status:400, body:{ message:"طريقة اعتماد المصروفات غير صحيحة." } };

  let permissions;

  try {
    permissions = normalizePermissions(data.permissions || {});
  } catch (error) {
    return {
      status: 400,
      body: { message: error.message }
    };
  }

  let signupResult;

  try {
    const response = await fetch(
      `${FIREBASE_SIGNUP_URL}?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password,
          displayName,
          returnSecureToken: true
        })
      }
    );

    signupResult = await response.json();

    if (!response.ok) {
      const code = signupResult.error?.message || "";

      if (code.includes("EMAIL_EXISTS")) {
        return {
          status: 409,
          body: {
            message: "هذا البريد الإلكتروني مسجل بالفعل في Firebase Authentication."
          }
        };
      }

      if (
        code.includes("WEAK_PASSWORD") ||
        code.includes("PASSWORD_DOES_NOT_MEET_REQUIREMENTS")
      ) {
        return {
          status: 400,
          body: {
            message: "كلمة المرور لا تستوفي متطلبات Firebase."
          }
        };
      }

      if (code.includes("INVALID_EMAIL")) {
        return {
          status: 400,
          body: { message: "صيغة البريد الإلكتروني غير صحيحة." }
        };
      }

      console.error(
        "Firebase employee account creation failed:",
        code || response.status
      );

      return {
        status: 502,
        body: { message: "تعذر إنشاء حساب الموظف في Firebase." }
      };
    }
  } catch (error) {
    console.error("Firebase signup request failed:", error);

    return {
      status: 503,
      body: { message: "تعذر الاتصال بخدمة إنشاء الحسابات." }
    };
  }

  const uid = signupResult.localId;
  const idToken = signupResult.idToken;

  if (!uid || !idToken) {
    return {
      status: 502,
      body: { message: "لم تُرجع Firebase بيانات الحساب المطلوبة." }
    };
  }

  try {
    const serviceAccount = parseServiceAccount(env);
    const accessToken = await createGoogleAccessToken(serviceAccount);

    const document = {
      fields: {
        uid: encodeString(uid),
        email: encodeString(email),
        displayName: encodeString(displayName),
        role: encodeString("staff"),
        active: { booleanValue: true },
        permissions: encodePermissions(permissions),
        expenseMode: encodeString(expenseMode),
        createdAt: {
          timestampValue: new Date().toISOString()
        }
      }
    };

    const path =
      `/${FIRESTORE_COLLECTION}/${encodeURIComponent(uid)}` +
      "?currentDocument.exists=false";

    await firestoreRequest(
      serviceAccount.project_id,
      accessToken,
      path,
      {
        method: "PATCH",
        body: JSON.stringify(document)
      }
    );

    return {
      status: 201,
      body: {
        employee: {
          uid,
          email,
          displayName,
          permissions,
          expenseMode
        }
      }
    };
  } catch (error) {
    console.error(
      "Failed to save employee record; attempting account rollback:",
      error
    );

    // إذا فشل حفظ سجل الموظف، نحاول حذف حساب Firebase الذي أنشأناه
    // حتى لا يبقى حساب جديد بلا سجل صلاحيات.
    try {
      await fetch(
        `${FIREBASE_DELETE_URL}?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ idToken })
        }
      );
    } catch (rollbackError) {
      console.error(
        "Employee account rollback failed:",
        rollbackError
      );
    }

    return {
      status: 503,
      body: {
        message:
          "تعذر حفظ بيانات الموظف وصلاحياته. حاول مرة أخرى، وتحقق من قائمة الحسابات قبل إعادة المحاولة."
      }
    };
  }
}

async function updateEmployeeExpenseMode(projectId, accessToken, data) {
  const uid = typeof data.uid === "string" ? data.uid.trim() : "";
  const expenseMode = data.expenseMode;
  if (!uid || uid.length > 128 || uid.includes("/") || !["auto","approval"].includes(expenseMode)) {
    return { status:400, body:{ message:"بيانات طريقة اعتماد المصروفات غير صحيحة." } };
  }
  try {
    await firestoreRequest(projectId, accessToken,
      `/${FIRESTORE_COLLECTION}/${encodeURIComponent(uid)}?updateMask.fieldPaths=expenseMode`,
      { method:"PATCH", body:JSON.stringify({fields:{expenseMode:encodeString(expenseMode)}}) });
    return { status:200, body:{uid, expenseMode} };
  } catch {
    return { status:404, body:{message:"تعذر تحديث إعدادات مصروفات الموظف."} };
  }
}

async function updateEmployeePermissions(
  projectId,
  accessToken,
  data
) {
  const uid = typeof data.uid === "string" ? data.uid.trim() : "";

  if (!uid || uid.length > 128 || uid.includes("/")) {
    return {
      status: 400,
      body: { message: "معرّف الموظف غير صحيح." }
    };
  }

  let permissions;

  try {
    permissions = normalizePermissions(data.permissions);
  } catch (error) {
    return {
      status: 400,
      body: { message: error.message }
    };
  }

  const fields = { permissions: encodePermissions(permissions) };
  let path = `/${FIRESTORE_COLLECTION}/${encodeURIComponent(uid)}?updateMask.fieldPaths=permissions`;
  let expenseMode;
  if (data.expenseMode !== undefined) {
    if (!["auto","approval"].includes(data.expenseMode)) return {status:400,body:{message:"طريقة اعتماد المصروفات غير صحيحة."}};
    expenseMode = data.expenseMode;
    fields.expenseMode = encodeString(expenseMode);
    path += "&updateMask.fieldPaths=expenseMode";
  }

  try {
    await firestoreRequest(projectId, accessToken, path, {
      method: "PATCH",
      body: JSON.stringify({ fields })
    });

    return {
      status: 200,
      body: { uid, permissions, ...(expenseMode ? {expenseMode} : {}) }
    };
  } catch (error) {
    return {
      status: 404,
      body: {
        message: "تعذر تحديث الصلاحيات. تأكد من وجود حساب الموظف."
      }
    };
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.FIREBASE_API_KEY) {
    return jsonResponse(
      { message: "إعدادات Firebase غير مكتملة على الخادم." },
      503
    );
  }

  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return jsonResponse(
      { message: "بيانات حساب الخدمة غير مهيأة على الخادم." },
      503
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

  const contentType = request.headers.get("Content-Type") || "";

  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonResponse(
      { message: "نوع محتوى الطلب غير مدعوم." },
      415
    );
  }

  const verification = await verifyDoctor(request, env);

  if (!verification.ok) {
    return jsonResponse(
      verification.body,
      verification.status
    );
  }

  let data;

  try {
    const rawBody = await request.text();

    if (rawBody.length > 20000) {
      return jsonResponse(
        { message: "حجم الطلب أكبر من المسموح." },
        413
      );
    }

    data = JSON.parse(rawBody);
  } catch {
    return jsonResponse(
      { message: "بيانات الطلب غير صحيحة." },
      400
    );
  }

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    return jsonResponse(
      { message: "صيغة الطلب غير صحيحة." },
      400
    );
  }

  let serviceAccount;

  try {
    serviceAccount = parseServiceAccount(env);
  } catch (error) {
    console.error("Service account configuration error:", error);

    return jsonResponse(
      { message: "إعدادات حساب الخدمة غير صحيحة." },
      503
    );
  }

  let accessToken;

  try {
    accessToken = await createGoogleAccessToken(serviceAccount);
  } catch (error) {
    console.error("Failed to obtain Google access token:", error);

    return jsonResponse(
      { message: "تعذر الاتصال بخدمة البيانات الآمنة." },
      503
    );
  }

  try {
    switch (data.action) {
      case "list": {
        const employees = await listEmployees(
          serviceAccount.project_id,
          accessToken
        );

        return jsonResponse({ employees });
      }

      case "create": {
        const result = await createEmployeeAccount(env, data);

        return jsonResponse(result.body, result.status);
      }

      case "updateExpenseMode": {
        const result = await updateEmployeeExpenseMode(serviceAccount.project_id, accessToken, data);
        return jsonResponse(result.body, result.status);
      }

      case "updatePermissions": {
        const result = await updateEmployeePermissions(
          serviceAccount.project_id,
          accessToken,
          data
        );

        return jsonResponse(result.body, result.status);
      }

      default:
        return jsonResponse(
          { message: "الإجراء المطلوب غير معروف." },
          400
        );
    }
  } catch (error) {
    console.error("Employee management request failed:", error);

    return jsonResponse(
      { message: "حدث خطأ أثناء معالجة طلب الموظفين." },
      500
    );
  }
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

  return onRequestPost(context);
}
