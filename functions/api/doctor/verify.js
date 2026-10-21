
const DOCTOR_ADMIN_UID = "8fUdGutQHRau3RXQIrRtZUqQ9Nm1";
const FIREBASE_PROJECT_ID = "clinics-manger";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.FIREBASE_API_KEY) {
    return jsonResponse(
      { error: "server_configuration_error" },
      503
    );
  }

  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(\S+)$/i);

  if (!match || match[1].length > 8192) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const idToken = match[1];

  try {
    const firebaseResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ idToken })
      }
    );

    if (!firebaseResponse.ok) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    const result = await firebaseResponse.json();
    const user = result.users?.[0];

    if (!user?.localId) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    if (user.localId !== DOCTOR_ADMIN_UID) {
      return jsonResponse({ error: "forbidden" }, 403);
    }

    return jsonResponse({
      authorized: true,
      uid: user.localId,
      email: user.email || null
    });
  } catch {
    return jsonResponse(
      { error: "verification_service_unavailable" },
      503
    );
  }
}

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return new Response(null, {
      status: 405,
      headers: {
        "Allow": "POST",
        "Cache-Control": "no-store"
      }
    });
  }

  return onRequestPost(context);
}
