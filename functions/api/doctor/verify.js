import { getClinicDatabase, d1First } from "../../_shared/d1.js";
const DOCTOR_ADMIN_UID = "8fUdGutQHRau3RXQIrRtZUqQ9Nm1";
const FIREBASE_LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  }});
}
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

    const staffDocument = await readStaffDocument(env, user.localId);
    let permissions = {};
    try { permissions = JSON.parse(staffDocument?.permissions_json || "{}"); } catch {}
    const staffPermissions = {
      bookings: permissions.bookings || "none",
      patients: permissions.patients || "none",
      medicalRecords: permissions.medicalRecords || "none",
      accounts: permissions.accounts || "none"
    };

    if (staffDocument?.role !== "staff" || Number(staffDocument.active) !== 1) {
      return jsonResponse({ error: "forbidden", message: "حساب الموظف غير نشط أو غير معتمد." }, 403);
    }
    if (!Object.values(staffPermissions).some(value => value === "view" || value === "edit")) {
      return jsonResponse({ error: "forbidden", message: "لم تُمنح لهذا الحساب أي صلاحية دخول." }, 403);
    }

    return jsonResponse({
      authorized: true, uid: user.localId, email: user.email || null,
      accountType: "staff", displayName: staffDocument.display_name || "الموظف",
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
