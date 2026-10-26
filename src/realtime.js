const REALTIME_URL = "wss://clinic-realtime.engabahmed.workers.dev/ws";

export function createClinicRealtime(auth, onEvent, onStatus = () => {}) {
  let socket = null;
  let stopped = false;
  let connecting = false;
  let ready = false;

  async function connect() {
    if (stopped || connecting || document.hidden || !auth.currentUser) return;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
    connecting = true;
    try {
      const user = auth.currentUser;
      const token = await user.getIdToken();
      if (stopped || document.hidden || auth.currentUser?.uid !== user.uid) return;
      const next = new WebSocket(REALTIME_URL);
      socket = next;
      next.addEventListener("open", () => {
        if (socket !== next || stopped) { next.close(); return; }
        next.send(JSON.stringify({ type: "auth", token }));
      });
      next.addEventListener("message", event => {
        if (socket !== next || stopped) return;
        let message;
        try { message = JSON.parse(String(event.data)); } catch { return; }
        if (message.type === "ready") {
          ready = true;
          onStatus(true);
        } else if (message.type === "change" && typeof message.event === "string") {
          onEvent(message.event);
        }
      });
      next.addEventListener("close", () => {
        if (socket !== next) return;
        socket = null;
        ready = false;
        onStatus(false);
      });
      next.addEventListener("error", () => {
        if (socket === next) onStatus(false);
      });
    } catch {
      ready = false;
      onStatus(false);
    } finally {
      connecting = false;
    }
  }

  function close() {
    ready = false;
    if (socket) {
      const current = socket;
      socket = null;
      try { current.close(1000, "signed_out"); } catch {}
    }
    onStatus(false);
  }

  function resume() {
    if (document.hidden) return;
    if (socket && socket.readyState === WebSocket.CLOSED) socket = null;
    connect();
  }

  document.addEventListener("visibilitychange", resume);
  window.addEventListener("online", resume);
  return {
    connect,
    resume,
    close,
    isConnected: () => ready,
    dispose: () => {
      stopped = true;
      close();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    }
  };
}
