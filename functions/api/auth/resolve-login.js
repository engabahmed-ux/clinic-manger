const EXPECTED_PROJECT_ID = "clinics-manger";
const USERNAMES_COLLECTION = "clinicPatientUsernames";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
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
  if (account.project_id !== EXPECTED_PROJECT_ID || !account.client_email || !account.private_key) throw new Error("Invalid service account.");
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
  if (!response.ok) throw new Error("Unable to obtain access token.");
  const result = await response.json();
  if (!result.access_token) throw new Error("Access token missing.");
  return result.access_token;
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

  const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username) || password.length < 1 || password.length > 128) {
    return jsonResponse({ message: "اسم المستخدم أو كلمة المرور غير صحيحة." }, 401);
  }

  try {
    const account = parseServiceAccount(env);
    const accessToken = await googleAccessToken(account);
    const documentUrl = "https://firestore.googleapis.com/v1/projects/" +
      encodeURIComponent(account.project_id) +
      "/databases/(default)/documents/" + USERNAMES_COLLECTION + "/" + encodeURIComponent(username);
    const lookup = await fetch(documentUrl, {
      headers: { Authorization: "Bearer " + accessToken },
      cache: "no-store"
    });
    if (!lookup.ok) {
      return jsonResponse({ message: "اسم المستخدم أو كلمة المرور غير صحيحة." }, 401);
    }
    const document = await lookup.json();
    const fields = document.fields || {};
    const email = fields.email?.stringValue || "";
    const uid = fields.uid?.stringValue || "";
    const active = fields.active?.booleanValue === true;
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
