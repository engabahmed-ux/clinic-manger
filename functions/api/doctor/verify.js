const DOCTOR_ADMIN_UID = "8fUdGutQHRau3RXQIrRtZUqQ9Nm1";
const FIREBASE_PROJECT_ID = "clinics-manger";
const STAFF_COLLECTION = "clinicStaff";
const FIREBASE_LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  }});
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
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error("Missing service account configuration.");
  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (account.project_id !== FIREBASE_PROJECT_ID || !account.client_email || !account.private_key) throw new Error("Invalid service account configuration.");
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
  if (!response.ok) throw new Error("Unable to obtain service access token.");
  const result = await response.json();
  if (!result.access_token) throw new Error("Service access token missing.");
  return result.access_token;
}
async function readStaffDocument(projectId, token, uid) {
  const url = "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(projectId) +
    "/databases/(default)/documents/" + STAFF_COLLECTION + "/" + encodeURIComponent(uid);
  const response = await fetch(url, { headers: { Authorization: "Bearer " + token } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Unable to verify staff permissions.");
  return response.json();
}
function readString(fields, key) { return fields?.[key]?.stringValue || ""; }

export async function onRequestPost({ request, env }) {
  if (!env.FIREBASE_API_KEY) return jsonResponse({ error: "server_configuration_error" }, 503);
  const match = (request.headers.get("Authorization") || "").match(/^Bearer\s+(\S+)$/i);
  if (!match || match[1].length > 8192) return jsonResponse({ error: "unauthorized" }, 401);

  try {
    const firebaseResponse = await fetch(FIREBASE_LOOKUP_URL + "?key=" + encodeURIComponent(env.FIREBASE_API_KEY), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: match[1] })
    });
    if (!firebaseResponse.ok) return jsonResponse({ error: "unauthorized" }, 401);
    const result = await firebaseResponse.json();
    const user = result.users?.[0];
    if (!user?.localId) return jsonResponse({ error: "unauthorized" }, 401);

    if (user.localId === DOCTOR_ADMIN_UID) {
      return jsonResponse({
        authorized: true, uid: user.localId, email: user.email || null,
        accountType: "doctor", displayName: user.displayName || "الدكتور",
        permissions: { bookings: "edit", patients: "edit", medicalRecords: "edit", settings: "edit", accounts: "edit" }
      });
    }

    const account = parseServiceAccount(env);
    const token = await googleAccessToken(account);
    const staffDocument = await readStaffDocument(account.project_id, token, user.localId);
    const fields = staffDocument?.fields || {};
    const permissions = fields.permissions?.mapValue?.fields || {};
    const staffPermissions = {
      bookings: readString(permissions, "bookings"),
      patients: readString(permissions, "patients"),
      medicalRecords: readString(permissions, "medicalRecords"),
      accounts: readString(permissions, "accounts")
    };

    if (readString(fields, "role") !== "staff" || fields.active?.booleanValue !== true) {
      return jsonResponse({ error: "forbidden", message: "حساب الموظف غير نشط أو غير معتمد." }, 403);
    }
    if (!Object.values(staffPermissions).some(value => value === "view" || value === "edit")) {
      return jsonResponse({ error: "forbidden", message: "لم تُمنح لهذا الحساب أي صلاحية دخول." }, 403);
    }

    return jsonResponse({
      authorized: true, uid: user.localId, email: user.email || null,
      accountType: "staff", displayName: readString(fields, "displayName") || "الموظف",
      permissions: staffPermissions
    });
  } catch (error) {
    console.error("Account verification failed:", error);
    return jsonResponse({ error: "verification_service_unavailable" }, 503);
  }
}

export async function onRequest(context) {
  if (context.request.method !== "POST") return new Response(null, {
    status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" }
  });
  return onRequestPost(context);
}
