const DEFAULT_STATUS_CONFIG = {
  pending: { label: "قيد المراجعة", color: "#D9A441" },
  confirmed: { label: "مؤكد", color: "#6495ED" },
  waiting: { label: "في الانتظار", color: "#6495ED" },
  completed: { label: "تم الكشف", color: "#4C956C" },
  postponed: { label: "تم التأجيل", color: "#D97706" },
  no_show: { label: "لم يأتِ", color: "#B45353" },
  apologized: { label: "اعتذر", color: "#8B7BB5" },
  cancelled: { label: "ملغي", color: "#777A82" },
  archived: { label: "مؤرشف", color: "#777A82" }
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function merge(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) return override === undefined ? clone(base) : clone(override);
  const result = base && typeof base === "object" && !Array.isArray(base) ? clone(base) : {};
  for (const [key, value] of Object.entries(override)) {
    result[key] = value && typeof value === "object" && !Array.isArray(value) ? merge(result[key], value) : clone(value);
  }
  return result;
}
export async function loadRuntimeSettings(baseConfig) {
  let saved = null;
  try {
    const response = await fetch("/api/clinic-management", { cache: "no-store" });
    if (response.ok) {
      const result = await response.json();
      saved = result.settings;
    }
  } catch {}
  const settings = merge(baseConfig, saved || {});
  settings.statuses = { ...DEFAULT_STATUS_CONFIG, ...(settings.statuses || {}) };
  return settings;
}
export function statusLabel(settings, status, fallback = "غير محدد") {
  const normalized = status === "confirmed" ? "confirmed" : status;
  return settings?.statuses?.[normalized]?.label || fallback;
}
function paleColor(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex || "")) return "#f5f5f5";
  const parts = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  const mixed = parts.map((value) => Math.round(value * 0.16 + 255 * 0.84));
  return "#" + mixed.map((value) => value.toString(16).padStart(2, "0")).join("");
}
export function applyRuntimeStatusColor(element, settings, status) {
  if (!element) return;
  const color = settings?.statuses?.[status]?.color;
  if (!/^#[0-9a-fA-F]{6}$/.test(color || "")) return;
  element.style.borderColor = color;
  element.style.backgroundColor = paleColor(color);
  element.style.setProperty("--dynamic-status-color", color);
}


export async function recordRuntimeLog(user, log) {
  if (!user) return;
  try {
    await fetch("/api/clinic-management", {
      method: "POST",
      headers: { Authorization: "Bearer " + await user.getIdToken(), "Content-Type": "application/json" },
      body: JSON.stringify({ action: "recordLog", log }),
      cache: "no-store"
    });
  } catch {
    // Logging must never break the user's primary workflow.
  }
}

export function applyRuntimeBranding(settings) {
  const branding = settings?.branding || {};
  const root = document.documentElement;
  const background = branding.background || "#11141A";
  const surface = branding.surface || "#F9F5F1";
  const accent = branding.accent || "#FFF25C";
  const secondary = branding.secondary || "#BFD2AF";
  root.style.setProperty("--color-dark", background);
  root.style.setProperty("--color-light", surface);
  root.style.setProperty("--color-accent", accent);
  root.style.setProperty("--color-secondary", secondary);
  root.style.setProperty("--staff-background", surface);
  root.style.setProperty("--staff-surface", surface);
  root.style.setProperty("--staff-dark", background);
  root.style.setProperty("--staff-text", background);
  root.style.setProperty("--staff-green", secondary);
  root.style.setProperty("--staff-yellow", accent);
  root.style.setProperty("--font-heading", '"' + (branding.headingFont || "Cairo") + '", sans-serif');
  root.style.setProperty("--font-body", '"' + (branding.bodyFont || "Cairo") + '", sans-serif');
}
