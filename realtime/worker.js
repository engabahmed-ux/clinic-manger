import { DurableObject } from "cloudflare:workers";

const ALLOWED_EVENTS = new Set([
  "booking_created", "booking_updated", "booking_status_changed", "booking_cancelled",
  "accounts_changed", "custody_changed", "patient_changed", "medical_record_changed",
  "clinic_settings_changed"
]);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

export class ClinicRealtimeHub extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/broadcast" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || !ALLOWED_EVENTS.has(body.event)) return json({ error: "invalid_event" }, 400);
      const message = JSON.stringify({ type: "change", event: body.event, at: new Date().toISOString() });
      let sent = 0;
      for (const socket of this.ctx.getWebSockets()) {
        const attachment = socket.deserializeAttachment();
        if (!attachment?.authenticated) continue;
        try { socket.send(message); sent += 1; } catch {}
      }
      return json({ ok: true, sent });
    }

    if (url.pathname !== "/ws" || request.method !== "GET" ||
        request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "not_found" }, 404);
    }
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ authenticated: false });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket, message) {
    let input;
    try { input = JSON.parse(String(message)); } catch { socket.close(1008, "invalid_message"); return; }
    const attachment = socket.deserializeAttachment() || {};
    if (!attachment.authenticated) {
      if (input.type !== "auth" || typeof input.token !== "string" || input.token.length > 8192) {
        socket.close(1008, "authentication_required");
        return;
      }
      try {
        const verification = await fetch(this.env.VERIFY_URL, {
          method: "POST",
          headers: { Authorization: "Bearer " + input.token, "Content-Type": "application/json" },
          body: "{}"
        });
        const account = await verification.json().catch(() => ({}));
        if (!verification.ok || account.authorized !== true ||
            !["doctor", "staff"].includes(account.accountType)) {
          socket.close(1008, "unauthorized");
          return;
        }
        socket.serializeAttachment({
          authenticated: true,
          uid: String(account.uid || ""),
          accountType: account.accountType,
          permissions: account.permissions || {}
        });
        socket.send(JSON.stringify({ type: "ready" }));
      } catch {
        socket.close(1011, "verification_unavailable");
      }
      return;
    }
    socket.close(1008, "unsupported_message");
  }

  webSocketClose(socket) {
    try { socket.close(); } catch {}
  }

  webSocketError(socket) {
    try { socket.close(1011, "socket_error"); } catch {}
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "clinic-realtime" });
    }
    if (url.pathname === "/publish" && request.method === "POST") {
      const supplied = request.headers.get("Authorization") || "";
      if (!env.PUBLISH_SECRET || supplied !== "Bearer " + env.PUBLISH_SECRET) {
        return json({ error: "unauthorized" }, 401);
      }
      const body = await request.json().catch(() => null);
      if (!body || !ALLOWED_EVENTS.has(body.event)) return json({ error: "invalid_event" }, 400);
      const id = env.CLINIC_HUB.idFromName("reDa-elSherbiny-clinic");
      return env.CLINIC_HUB.get(id).fetch("https://clinic-realtime.internal/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: body.event })
      });
    }
    if (url.pathname === "/ws" && request.method === "GET" &&
        request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const id = env.CLINIC_HUB.idFromName("reDa-elSherbiny-clinic");
      return env.CLINIC_HUB.get(id).fetch(request);
    }
    return json({ error: "not_found" }, 404);
  }
};
