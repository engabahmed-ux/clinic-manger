const REALTIME_URL = "wss://clinic-realtime.engabahmed.workers.dev/ws";

export function createClinicRealtime(auth, onEvent, onStatus = () => {}) {
  let socket = null;
  let stopped = false;
  let connecting = false;
  let ready = false;
  let reconnectTimer = null;
  let reconnectDelayMs = 1000;

  function scheduleReconnect() {
    if (stopped || document.hidden || !navigator.onLine || !auth.currentUser || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectDelayMs);
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30000);
  }

  async function connect() {
    if (stopped || connecting || document.hidden || !navigator.onLine || !auth.currentUser) return;
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
          reconnectDelayMs = 1000;
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
        scheduleReconnect();
      });
      next.addEventListener("error", () => {
        if (socket === next) onStatus(false);
      });
    } catch {
      ready = false;
      onStatus(false);
      scheduleReconnect();
    } finally {
      connecting = false;
    }
  }

  function close() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    ready = false;
    if (socket) {
      const current = socket;
      socket = null;
      try { current.close(1000, "signed_out"); } catch {}
    }
    onStatus(false);
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      close();
      return;
    }
    resume();
  }

  function resume() {
    if (document.hidden || !navigator.onLine) return;
    if (socket && socket.readyState === WebSocket.CLOSED) socket = null;
    connect();
  }

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("online", resume);
  return {
    connect,
    resume,
    close,
    isConnected: () => ready,
    dispose: () => {
      stopped = true;
      close();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", resume);
    }
  };
}
