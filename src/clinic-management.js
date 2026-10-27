import { APP_CONFIG } from "./config/app-config.js";
import { FIREBASE_CONFIG } from "./config/firebase-config.js";
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const DOCTOR_ADMIN_UID = "8fUdGutQHRau3RXQIrRtZUqQ9Nm1";
const API_URL = "/api/clinic-management";
const app = getApps().find((item) => item.name === "[DEFAULT]") || initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const $ = (selector, parent = document) => parent.querySelector(selector);

const tabButton = $("#openClinicManagementButton");
const section = $("#clinicManagementSection");
const form = $("#clinicSettingsForm");
const message = $("#clinicSettingsMessage");
const servicesEditor = $("#clinicServicesEditor");
const statusesEditor = $("#clinicStatusesEditor");
const advancedInput = $("#clinicAdvancedSettings");
const saveButton = $("#saveClinicSettingsButton");
const logsButton = $("#openClinicLogsButton");
const logsPanel = $("#clinicLogsPanel");
const logsList = $("#clinicLogsList");
const logsMessage = $("#clinicLogsMessage");
const logsLevelFilter = $("#clinicLogsLevelFilter");

const STATUS_DEFAULTS = {
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
const STATUS_LABELS = {
  pending: "طلب جديد",
  confirmed: "مؤكد",
  waiting: "في الانتظار",
  completed: "تم الكشف",
  postponed: "تم التأجيل",
  no_show: "لم يأتِ",
  apologized: "اعتذر",
  cancelled: "ملغي",
  archived: "مؤرشف"
};
let currentSettings = null;
let cachedLogs = [];
let currentUser = null;

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function mergeDeep(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) return override === undefined ? clone(base) : clone(override);
  const result = base && typeof base === "object" && !Array.isArray(base) ? clone(base) : {};
  for (const [key, value] of Object.entries(override)) {
    result[key] = value && typeof value === "object" && !Array.isArray(value)
      ? mergeDeep(result[key], value)
      : clone(value);
  }
  return result;
}
function showMessage(element, text, kind = "info") {
  if (!element) return;
  element.textContent = text || "";
  element.hidden = !text;
  element.dataset.kind = kind;
}
async function apiRequest(action, extra = {}) {
  if (!auth.currentUser) throw new Error("انتهت جلسة الدخول. سجّل الدخول مرة أخرى.");
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + await auth.currentUser.getIdToken(), "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "تعذر تنفيذ الطلب.");
  return result;
}
function getAdvancedSettings(settings) {
  const advanced = clone(settings);
  for (const key of ["doctorName", "specialty", "description", "phone", "whatsapp", "address", "logo", "doctorImage"]) delete advanced.clinic[key];
  delete advanced.branding;
  delete advanced.services;
  delete advanced.statuses;
  return advanced;
}
function fillClinicFields(settings) {
  const values = {
    doctorName: settings.clinic?.doctorName,
    specialty: settings.clinic?.specialty,
    description: settings.clinic?.description,
    phone: settings.clinic?.phone,
    whatsapp: settings.clinic?.whatsapp,
    address: settings.clinic?.address,
    logo: settings.clinic?.logo,
    doctorImage: settings.clinic?.doctorImage,
    background: settings.branding?.background || "#11141A",
    surface: settings.branding?.surface || "#F9F5F1",
    accent: settings.branding?.accent || "#FFF25C",
    secondary: settings.branding?.secondary || "#BFD2AF"
  };
  for (const [name, value] of Object.entries(values)) {
    const input = form.elements.namedItem(name);
    if (input) input.value = value || (input.type === "color" ? "#000000" : "");
  }
  advancedInput.value = JSON.stringify(getAdvancedSettings(settings), null, 2);
}
function makeField(labelText, value, field, type = "text", maxLength = 500) {
  const label = document.createElement("label");
  label.className = "clinic-dynamic-field";
  label.append(document.createTextNode(labelText));
  const input = document.createElement("input");
  input.type = type;
  input.value = value ?? "";
  input.dataset.field = field;
  if (type === "text") input.maxLength = maxLength;
  label.append(input);
  return label;
}
function renderServices() {
  servicesEditor.replaceChildren();
  const services = currentSettings.services?.items || [];
  if (!services.length) {
    const empty = document.createElement("p");
    empty.className = "muted-text";
    empty.textContent = "لا توجد خدمات مضافة حاليًا.";
    servicesEditor.append(empty);
  }
  for (const service of services) {
    const row = document.createElement("article");
    row.className = "clinic-dynamic-row clinic-service-row";
    row.dataset.serviceId = service.id;
    row.append(
      makeField("اسم الخدمة", service.title, "title", "text", 120),
      makeField("الوصف", service.description, "description", "text", 500),
      makeField("الرمز", service.icon || "✳", "icon", "text", 12)
    );
    const enabledLabel = document.createElement("label");
    enabledLabel.className = "clinic-service-enabled";
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.dataset.field = "enabled";
    enabled.checked = service.enabled !== false;
    enabledLabel.append(enabled, document.createTextNode("مفعلة"));
    row.append(enabledLabel);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary-button clinic-remove-button";
    remove.textContent = "حذف الخدمة";
    remove.addEventListener("click", () => {
      row.remove();
      if (!servicesEditor.querySelector(".clinic-service-row")) renderServicesEmpty();
    });
    row.append(remove);
    servicesEditor.append(row);
  }
}
function renderServicesEmpty() {
  if (servicesEditor.querySelector(".clinic-service-row")) return;
  const empty = document.createElement("p");
  empty.className = "muted-text";
  empty.textContent = "لا توجد خدمات مضافة حاليًا.";
  servicesEditor.append(empty);
}
function renderStatuses() {
  statusesEditor.replaceChildren();
  const statuses = { ...STATUS_DEFAULTS, ...(currentSettings.statuses || {}) };
  for (const [key, defaults] of Object.entries(STATUS_DEFAULTS)) {
    const value = statuses[key] || defaults;
    const row = document.createElement("article");
    row.className = "clinic-dynamic-row clinic-status-row";
    row.dataset.statusId = key;
    const label = document.createElement("strong");
    label.textContent = STATUS_LABELS[key] || key;
    row.append(label, makeField("الاسم الظاهر", value.label || defaults.label, "label", "text", 60));
    const colorLabel = document.createElement("label");
    colorLabel.className = "clinic-dynamic-field clinic-status-color";
    colorLabel.append(document.createTextNode("لون الحالة"));
    const color = document.createElement("input");
    color.type = "color";
    color.dataset.field = "color";
    color.value = /^#[0-9a-fA-F]{6}$/.test(value.color || "") ? value.color : defaults.color;
    colorLabel.append(color);
    row.append(colorLabel);
    statusesEditor.append(row);
  }
}
function readServices() {
  return [...servicesEditor.querySelectorAll(".clinic-service-row")].map((row, index) => {
    const get = (key) => row.querySelector('[data-field="' + key + '"]');
    const existingId = row.dataset.serviceId;
    const title = get("title").value.trim();
    return {
      id: existingId || ("service-" + (globalThis.crypto?.randomUUID?.().slice(0, 8) || (Date.now().toString(36) + index))),
      title,
      description: get("description").value.trim(),
      icon: get("icon").value.trim() || "✳",
      enabled: get("enabled").checked
    };
  });
}
function readStatuses() {
  const result = {};
  for (const row of statusesEditor.querySelectorAll(".clinic-status-row")) {
    const key = row.dataset.statusId;
    result[key] = {
      label: row.querySelector('[data-field="label"]').value.trim(),
      color: row.querySelector('[data-field="color"]').value
    };
  }
  return result;
}
function renderLogs() {
  const level = logsLevelFilter.value;
  logsList.replaceChildren();
  const rows = cachedLogs.filter((item) => level === "all" || item.level === level);
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "muted-text";
    empty.textContent = "لا توجد سجلات مطابقة خلال آخر 30 يومًا.";
    logsList.append(empty);
    return;
  }
  for (const item of rows) {
    const card = document.createElement("article");
    card.className = "clinic-log-entry clinic-log-" + (["info", "warning", "error", "security"].includes(item.level) ? item.level : "info");
    const heading = document.createElement("div");
    heading.className = "clinic-log-heading";
    const title = document.createElement("strong");
    title.textContent = item.message || item.action || "حدث";
    const date = document.createElement("time");
    const parsed = item.createdAt ? new Date(item.createdAt) : null;
    date.textContent = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString("ar-EG") : "وقت غير معروف";
    heading.append(title, date);
    const meta = document.createElement("p");
    meta.textContent = "النوع: " + (item.level || "info") + " · الحدث: " + (item.action || "غير محدد") + " · القسم: " + (item.area || "غير محدد") + " · المستخدم: " + (item.actorName || "غير معروف");
    card.append(heading, meta);
    if (item.targetType || item.targetId) {
      const target = document.createElement("p");
      target.textContent = "العنصر المرتبط: " + [item.targetType, item.targetId].filter(Boolean).join(" / ");
      card.append(target);
    }
    logsList.append(card);
  }
}
async function loadLogs() {
  if (currentUser?.uid !== DOCTOR_ADMIN_UID) {
    showMessage(logsMessage, "سجل الأحداث متاح للدكتور فقط.", "error");
    return;
  }
  logsButton.disabled = true;
  $("#refreshClinicLogsButton").disabled = true;
  showMessage(logsMessage, "جارٍ تحميل السجل...");
  try {
    const result = await apiRequest("listLogs", { limit: 1000 });
    cachedLogs = Array.isArray(result.logs) ? result.logs : [];
    renderLogs();
    showMessage(logsMessage, "تم تحميل " + cachedLogs.length + " سجلًا. مدة الاحتفاظ: " + (result.retentionDays || 30) + " يومًا. " + (result.ttlEnabled ? "الحذف التلقائي من Firestore مفعّل." : "تنبيه: لم يتأكد تفعيل الحذف التلقائي من Firestore؛ يتم تنظيف المنتهي عند فتح السجل أو تسجيل أحداث جديدة، وقد تحتاج لتفعيل TTL يدويًا."), result.ttlEnabled ? "success" : "info");
  } catch (error) {
    showMessage(logsMessage, error.message || "تعذر تحميل السجل.", "error");
  } finally {
    logsButton.disabled = false;
    $("#refreshClinicLogsButton").disabled = false;
  }
}
async function loadSettings() {
  saveButton.disabled = true;
  try {
    const response = await fetch(API_URL, { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "تعذر تحميل الإعدادات.");
    currentSettings = mergeDeep(APP_CONFIG, result.settings || {});
  } catch (error) {
    currentSettings = clone(APP_CONFIG);
    showMessage(message, "تعذر تحميل الإعدادات المحفوظة من الخادم؛ المعروض هو الإعداد الافتراضي فقط. " + (error.message || ""), "error");
  }
  currentSettings.statuses = { ...STATUS_DEFAULTS, ...(currentSettings.statuses || {}) };
  fillClinicFields(currentSettings);
  renderServices();
  renderStatuses();
  saveButton.disabled = false;
}
tabButton?.addEventListener("click", () => {
  if (currentUser?.uid !== DOCTOR_ADMIN_UID) return;
  for (const selector of ["#homeAppointmentsSection", "#doctorArchiveSection", "#doctorAccountsSection", "#bookingManagementSection", "#patientManagementSection", "#medicalRecordsSection", "#employeeManagementSection"]) {
    const element = $(selector);
    if (element) element.hidden = true;
  }
  section.hidden = false;
  document.querySelectorAll(".dashboard-tab").forEach((button) => button.setAttribute("aria-selected", String(button === tabButton)));
  if (!currentSettings) loadSettings();
});
document.addEventListener("click", (event) => {
  const otherTab = event.target.closest(".dashboard-tab");
  if (otherTab && otherTab !== tabButton && section) section.hidden = true;
});
$("#addClinicServiceButton")?.addEventListener("click", () => {
  const rows = [...servicesEditor.querySelectorAll(".clinic-service-row")];
  const id = "service-" + (globalThis.crypto?.randomUUID?.().slice(0, 8) || Date.now().toString(36));
  const row = document.createElement("article");
  row.className = "clinic-dynamic-row clinic-service-row";
  row.dataset.serviceId = id;
  row.append(makeField("اسم الخدمة", "", "title", "text", 120), makeField("الوصف", "", "description", "text", 500), makeField("الرمز", "✳", "icon", "text", 12));
  const enabledLabel = document.createElement("label");
  enabledLabel.className = "clinic-service-enabled";
  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  enabled.dataset.field = "enabled";
  enabled.checked = true;
  enabledLabel.append(enabled, document.createTextNode("مفعلة"));
  row.append(enabledLabel);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "secondary-button clinic-remove-button";
  remove.textContent = "حذف الخدمة";
  remove.addEventListener("click", () => { row.remove(); renderServicesEmpty(); });
  row.append(remove);
  servicesEditor.querySelector("p.muted-text")?.remove();
  servicesEditor.append(row);
});
form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (currentUser?.uid !== DOCTOR_ADMIN_UID) {
    showMessage(message, "حفظ إعدادات العيادة متاح للدكتور فقط.", "error");
    return;
  }
  let advanced;
  try {
    advanced = JSON.parse(advancedInput.value);
    if (!advanced || typeof advanced !== "object" || Array.isArray(advanced)) throw new Error();
  } catch {
    showMessage(message, "صيغة JSON في باقي متغيرات الموقع غير صحيحة؛ صححها قبل الحفظ.", "error");
    return;
  }
  const data = new FormData(form);
  const next = mergeDeep(currentSettings, advanced);
  next.clinic = { ...(next.clinic || {}), id: APP_CONFIG.clinic.id };
  for (const key of ["doctorName", "specialty", "description", "phone", "whatsapp", "address", "logo", "doctorImage"]) next.clinic[key] = String(data.get(key) || "").trim();
  next.branding = { ...(next.branding || {}), background: data.get("background"), surface: data.get("surface"), accent: data.get("accent"), secondary: data.get("secondary") };
  const services = readServices();
  if (services.length > 100 || services.some((item) => !item.title || item.description.length > 500)) {
    showMessage(message, "كل خدمة تحتاج اسمًا، ويجب ألا يزيد الوصف عن 500 حرف.", "error");
    return;
  }
  next.services = { ...(next.services || {}), items: services };
  next.statuses = readStatuses();
  if (Object.values(next.statuses).some((item) => !item.label || !/^#[0-9a-fA-F]{6}$/.test(item.color))) {
    showMessage(message, "تأكد من كتابة اسم ولون صحيح لكل حالة.", "error");
    return;
  }
  saveButton.disabled = true;
  showMessage(message, "جارٍ حفظ إعدادات العيادة...");
  try {
    const result = await apiRequest("saveSettings", { settings: next });
    currentSettings = result.settings;
    applyRuntimeBranding(currentSettings);
    window.dispatchEvent(new CustomEvent("clinic-settings-updated", { detail: currentSettings }));
    fillClinicFields(currentSettings);
    renderServices();
    renderStatuses();
    showMessage(message, "تم حفظ الإعدادات. ستظهر التغييرات في الصفحات التي تقرأ الإعدادات المشتركة.", "success");
  } catch (error) {
    showMessage(message, error.message || "تعذر حفظ الإعدادات.", "error");
  } finally {
    saveButton.disabled = false;
  }
});
logsButton?.addEventListener("click", async () => {
  if (currentUser?.uid !== DOCTOR_ADMIN_UID) return;
  logsPanel.hidden = false;
  await loadLogs();
});
$("#refreshClinicLogsButton")?.addEventListener("click", loadLogs);
logsLevelFilter?.addEventListener("change", renderLogs);
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user || user.uid !== DOCTOR_ADMIN_UID) {
    if (tabButton) tabButton.hidden = true;
    if (section) section.hidden = true;
    return;
  }
  if (tabButton) tabButton.hidden = false;
  await loadSettings();
});
