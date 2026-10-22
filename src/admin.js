
import { FIREBASE_CONFIG } from "./config/firebase-config.js";

import {
  initializeApp,
  getApps
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/*
 * Doctor Admin Page
 *
 * - تسجيل الدخول عبر Firebase Authentication.
 * - التحقق من حساب الدكتور على الخادم.
 * - إدارة حسابات الموظفين وصلاحياتهم عبر Cloudflare Pages Functions.
 * - لا يتم الوصول إلى Firestore مباشرة من المتصفح.
 * - لا يتم تعديل قواعد Firestore من هذا الملف.
 */

const DOCTOR_ADMIN_UID = "8fUdGutQHRau3RXQIrRtZUqQ9Nm1";
const DOCTOR_VERIFY_URL = "/api/doctor/verify";
const EMPLOYEES_API_URL = "/api/doctor/employees";

const PERMISSION_SECTIONS = [
  { key: "bookings", label: "الحجوزات" },
  { key: "patients", label: "بيانات المرضى" },
  { key: "medicalRecords", label: "السجلات الطبية" },
  { key: "settings", label: "إعدادات العيادة" }
];

const PERMISSION_OPTIONS = [
  { value: "none", label: "بدون وصول" },
  { value: "view", label: "مشاهدة فقط" },
  { value: "edit", label: "مشاهدة وتعديل" }
];

const app =
  getApps().find((item) => item.name === "[DEFAULT]") ||
  initializeApp(FIREBASE_CONFIG);

const auth = getAuth(app);

const $ = (selector, parent = document) =>
  parent.querySelector(selector);

const loginSection = $("#loginSection");
const dashboardSection = $("#dashboardSection");
const loginForm = $("#doctorLoginForm");
const emailInput = $("#doctorEmail");
const passwordInput = $("#doctorPassword");
const loginButton = $("#loginButton");
const loginError = $("#loginError");
const logoutButton = $("#logoutButton");
const doctorAccountLabel = $("#doctorAccountLabel");

const openHomeTabButton = $("#openHomeTabButton");
const openEmployeesButton = $("#openEmployeesButton");
const backToDashboardButton = $("#backToDashboardButton");
const employeeManagementSection = $("#employeeManagementSection");
const openBookingsButton = $("#openBookingsButton");
const bookingManagementSection = $("#bookingManagementSection");
const bookingList = $("#bookingList");
const bookingListMessage = $("#bookingListMessage");
const refreshBookingsButton = $("#refreshBookingsButton");
const addBookingToggleButton = $("#addBookingToggleButton");
const bookingCreateCard = $(".booking-create-card");
const bookingSearchInput = $("#bookingSearchInput");
const bookingDateFilter = $("#bookingDateFilter");
const homeAppointmentsSection = $("#homeAppointmentsSection");
const dailyAppointmentsList = $("#dailyAppointmentsList");
const dailyAppointmentsMessage = $("#dailyAppointmentsMessage");
const refreshDailyAppointmentsButton = $("#refreshDailyAppointmentsButton");
const createBookingForm = $("#createBookingForm");
const createBookingButton = $("#createBookingButton");
const createBookingMessage = $("#createBookingMessage");
const openPatientsButton = $("#openPatientsButton");
const backFromPatientsButton = $("#backFromPatientsButton");
const patientManagementSection = $("#patientManagementSection");
const createPatientForm = $("#createPatientForm");
const createPatientButton = $("#createPatientButton");
const createPatientMessage = $("#createPatientMessage");
const patientCredentialsPanel = $("#patientCredentialsPanel");
const patientCredentialsMessage = $("#patientCredentialsMessage");
const createdPatientUsername = $("#createdPatientUsername");
const createdPatientEmail = $("#createdPatientEmail");
const createdPatientPassword = $("#createdPatientPassword");
const copyPatientCredentialsButton = $("#copyPatientCredentialsButton");
const createEmployeeForm = $("#createEmployeeForm");
const createEmployeeButton = $("#createEmployeeButton");
const createEmployeeMessage = $("#createEmployeeMessage");
const employeeList = $("#employeeList");
const employeeListMessage = $("#employeeListMessage");
const refreshEmployeesButton = $("#refreshEmployeesButton");

let isSubmitting = false;
let isCreatingEmployee = false;
let isLoadingEmployees = false;
let isLoadingBookings = false;
let isCreatingBooking = false;
let isCreatingPatient = false;
let verificationRequestNumber = 0;
let allBookings = [];

function showMessage(element, message, type = "error") {
  if (!element) return;

  element.textContent = message;
  element.className = `message ${type}-message`;
  element.hidden = false;
}

function hideMessage(element) {
  if (!element) return;

  element.textContent = "";
  element.hidden = true;
}

function showLogin() {
  if (loginSection) loginSection.hidden = false;
  if (dashboardSection) dashboardSection.hidden = true;

  showEmployeeSection(false);
}

function showDashboard(user) {
  if (loginSection) loginSection.hidden = true;
  if (dashboardSection) dashboardSection.hidden = false;

  if (doctorAccountLabel) {
    doctorAccountLabel.textContent = user.email || "حساب الدكتور";
  }

  showEmployeeSection(false);
  loadBookings();
}

function setActiveTab(button) {
  for (const tab of document.querySelectorAll(".dashboard-tab")) {
    tab.setAttribute("aria-selected", String(tab === button));
  }
}
function showHomeSection() {
  if (homeAppointmentsSection) homeAppointmentsSection.hidden = false;
  if (employeeManagementSection) employeeManagementSection.hidden = true;
  if (bookingManagementSection) bookingManagementSection.hidden = true;
  if (patientManagementSection) patientManagementSection.hidden = true;
  setActiveTab(openHomeTabButton);
}
function showEmployeeSection(show) {
  if (employeeManagementSection) employeeManagementSection.hidden = !show;
  if (bookingManagementSection) bookingManagementSection.hidden = true;
  if (patientManagementSection) patientManagementSection.hidden = true;
  if (homeAppointmentsSection) homeAppointmentsSection.hidden = show;
  if (show) setActiveTab(openEmployeesButton); else showHomeSection();
}
function showBookingSection(show) {
  if (bookingManagementSection) bookingManagementSection.hidden = !show;
  if (employeeManagementSection) employeeManagementSection.hidden = true;
  if (patientManagementSection) patientManagementSection.hidden = true;
  if (homeAppointmentsSection) homeAppointmentsSection.hidden = show;
  if (show) setActiveTab(openBookingsButton); else showHomeSection();
}

function setLoginBusy(busy) {
  isSubmitting = busy;

  if (loginButton) {
    loginButton.disabled = busy;
    loginButton.textContent = busy
      ? "جارٍ التحقق..."
      : "تسجيل الدخول";
  }
}

function getFriendlyAuthError(error) {
  const code = error?.code || "";

  switch (code) {
    case "auth/invalid-email":
      return "صيغة البريد الإلكتروني غير صحيحة.";

    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";

    case "auth/too-many-requests":
      return "تم إجراء محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.";

    case "auth/network-request-failed":
      return "تعذر الاتصال. تحقق من الإنترنت وحاول مرة أخرى.";

    case "auth/operation-not-allowed":
      return "تسجيل الدخول بالبريد وكلمة المرور غير مفعّل في Firebase Authentication.";

    default:
      return "تعذر تسجيل الدخول. راجع إعدادات Firebase وحاول مرة أخرى.";
  }
}

async function rejectUnauthorizedUser(user) {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("تعذر إنهاء الجلسة غير المصرح بها:", error);
  }

  showLogin();

  showMessage(
    loginError,
    "هذا الحساب غير معتمد للدخول إلى لوحة الدكتور."
  );

  console.warn(
    "تم رفض حساب لا يطابق حساب الدكتور المعتمد.",
    user?.uid
  );
}

async function verifyDoctorOnServer(user, requestNumber) {
  try {
    const idToken = await user.getIdToken();

    const response = await fetch(DOCTOR_VERIFY_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${idToken}`,
        "Accept": "application/json"
      },
      cache: "no-store"
    });

    let result = {};

    try {
      result = await response.json();
    } catch {
      result = {};
    }

    if (
      requestNumber !== verificationRequestNumber ||
      auth.currentUser?.uid !== user.uid
    ) {
      return;
    }

    if (response.status === 401 || response.status === 403) {
      await rejectUnauthorizedUser(user);
      return;
    }

    if (!response.ok) {
      showLogin();

      showMessage(
        loginError,
        response.status === 503
          ? "خدمة التحقق غير متاحة حاليًا. حاول مرة أخرى بعد قليل."
          : "تعذر التحقق من صلاحيات الدكتور. حاول مرة أخرى."
      );

      console.error(
        "فشل التحقق من الخادم:",
        response.status,
        result
      );

      return;
    }

    if (
      result.authorized !== true ||
      result.uid !== DOCTOR_ADMIN_UID ||
      result.uid !== user.uid
    ) {
      await rejectUnauthorizedUser(user);
      return;
    }

    hideMessage(loginError);
    showDashboard(user);
  } catch (error) {
    if (
      requestNumber !== verificationRequestNumber ||
      auth.currentUser?.uid !== user.uid
    ) {
      return;
    }

    console.error("تعذر الاتصال بخدمة التحقق:", error);

    showLogin();

    showMessage(
      loginError,
      "تعذر الاتصال بخدمة التحقق. تحقق من الإنترنت وحاول مرة أخرى."
    );
  }
}

function showPatientSection(show) {
  if (patientManagementSection) patientManagementSection.hidden = !show;
  if (employeeManagementSection) employeeManagementSection.hidden = true;
  if (bookingManagementSection) bookingManagementSection.hidden = true;
  if (homeAppointmentsSection) homeAppointmentsSection.hidden = show;
  if (show) setActiveTab(openPatientsButton); else showHomeSection();
}

async function patientApiRequest(action, data = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("انتهت جلسة الدخول. سجّل الدخول مرة أخرى.");
  const idToken = await user.getIdToken();
  const response = await fetch("/api/doctor/patients", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${idToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({ action, ...data }),
    cache: "no-store"
  });
  let result = {};
  try { result = await response.json(); } catch {}
  if (!response.ok) throw new Error(result.message || "تعذر إنشاء حساب المريضة.");
  return result;
}

async function bookingApiRequest(action, data = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("انتهت جلسة الدخول. سجّل الدخول مرة أخرى.");

  const idToken = await user.getIdToken();
  const response = await fetch("/api/doctor/bookings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${idToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({ action, ...data }),
    cache: "no-store"
  });

  let result = {};
  try { result = await response.json(); } catch {}

  if (response.status === 401) {
    throw new Error("انتهت جلسة الدخول. سجّل الدخول مجددًا.");
  }
  if (response.status === 403) {
    throw new Error(result.message || "ليس لديك صلاحية إدارة الحجوزات.");
  }
  if (!response.ok) {
    throw new Error(result.message || "تعذر تنفيذ طلب الحجوزات.");
  }
  return result;
}

function createBookingInput(labelText, value, field, type = "text") {
  const wrapper = document.createElement("label");
  wrapper.className = "booking-edit-field";
  wrapper.textContent = labelText;

  const input = document.createElement(type === "select" ? "select" : "input");
  input.dataset.bookingField = field;
  if (type !== "select") input.type = type;

  if (field === "status") {
    for (const [value, label] of [
      ["pending", "قيد المراجعة"],
      ["confirmed", "مؤكد"],
      ["completed", "مكتمل"],
      ["cancelled", "ملغي"]
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      input.append(option);
    }
  } else {
    input.value = value || "";
    if (field === "patientName") input.maxLength = 120;
    if (field === "patientPhone") input.maxLength = 40;
    if (field === "service") { input.maxLength = 120; input.setAttribute("list", "clinicServiceOptions"); }
    if (field === "notes") input.maxLength = 2000;
    if (field === "appointmentDate") input.type = "date";
  }

  if (field === "status") input.value = value || "pending";
  wrapper.append(input);
  return wrapper;
}

function renderBookingCard(booking) {
  const card = document.createElement("article");
  card.className = "employee-card booking-card";
  card.dataset.bookingId = booking.id;
  const summary = document.createElement("button");
  summary.type = "button"; summary.className = "booking-request-summary";
  const main = document.createElement("span"); main.className = "booking-request-main";
  const title = document.createElement("strong"); title.textContent = booking.patientName || "طلب حجز جديد";
  const meta = document.createElement("small"); meta.textContent = `الدور: ${queueNumberFor(booking)} · تاريخ الطلب: ${formatSubmittedAt(booking.createdAt)} · الموعد: ${formatRequestDate(booking.appointmentDate)} · ${booking.patientPhone||"الهاتف غير مسجل"} · ${booking.service||"الخدمة غير محددة"}`;
  main.append(title,meta); const badge=document.createElement("span");badge.className="booking-request-badge";badge.textContent=bookingStatusLabel(booking.status);summary.append(main,badge);
  const details=document.createElement("div");details.className="booking-request-details";details.hidden=true;
  const fields=document.createElement("div");fields.className="booking-edit-grid";
  fields.append(createBookingInput("اسم المريضة",booking.patientName,"patientName"),createBookingInput("رقم الهاتف",booking.patientPhone,"patientPhone","tel"),createBookingInput("الموعد",String(booking.appointmentDate||"").slice(0,10),"appointmentDate","date"),createBookingInput("الخدمة",booking.service,"service"),createBookingInput("ملاحظات",booking.notes,"notes"));
  const actions=document.createElement("div");actions.className="booking-card-actions";
  const actionItems=[["save-booking","حفظ التعديلات","secondary-button"]];
  if(booking.status==="pending")actionItems.push(["confirm-booking","تأكيد الحجز","primary-button"]);
  if(["pending","confirmed"].includes(booking.status))actionItems.push(["cancel-booking","إلغاء الحجز","secondary-button"]);
  for(const [action,label,cls] of actionItems){const button=document.createElement("button");button.type="button";button.className=cls;button.dataset.action=action;button.textContent=label;actions.append(button)}
  details.append(fields,actions);summary.addEventListener("click",()=>{details.hidden=!details.hidden});card.append(summary,details);return card;
}
function formatRequestDate(value){if(!value)return"التاريخ غير محدد";const date=new Date(`${String(value).slice(0,10)}T12:00:00`);return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat("ar-EG",{dateStyle:"medium"}).format(date)}
function formatSubmittedAt(value){if(!value)return"وقت الطلب غير متاح";const date=new Date(value);return Number.isNaN(date.getTime())?"وقت الطلب غير متاح":new Intl.DateTimeFormat("ar-EG",{dateStyle:"medium",timeStyle:"short"}).format(date)}
function queueNumberFor(booking){
  const date=String(booking.appointmentDate||"").slice(0,10);
  if(!date)return "—";
  const rows=allBookings.filter(item=>String(item.appointmentDate||"").slice(0,10)===date)
    .sort((x,y)=>(Date.parse(x.createdAt||"")||0)-(Date.parse(y.createdAt||"")||0));
  const index=rows.findIndex(item=>item.id===booking.id);
  return index<0?"—":index+1;
}
function bookingStatusLabel(status){
  return ({pending:"قيد المراجعة",confirmed:"مؤكد",completed:"مكتمل",cancelled:"ملغي"})[status]||"غير محدد";
}
function renderDailyAppointments(){
  dailyAppointmentsList.replaceChildren();
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const rows=allBookings.filter(b=>b.status==="confirmed"&&String(b.appointmentDate||"").slice(0,10)===today)
    .sort((a,b)=>queueNumberFor(a)-queueNumberFor(b));
  if(!rows.length){const empty=document.createElement("div");empty.className="empty-employees";empty.textContent="لا توجد مواعيد مؤكدة اليوم.";dailyAppointmentsList.append(empty);return}
  for(const b of rows){const card=document.createElement("article");card.className="employee-card daily-appointment-card";const h=document.createElement("h4");h.textContent=`الدور ${queueNumberFor(b)} · ${b.patientName||"مريضة"}`;const p=document.createElement("p");p.textContent=[b.patientPhone,b.service].filter(Boolean).join(" · ");card.append(h,p);dailyAppointmentsList.append(card)}
}
function renderPendingBookings(){
  bookingList.replaceChildren();const query=(bookingSearchInput?.value||"").trim().toLocaleLowerCase("ar"),date=bookingDateFilter?.value||"";
  const rows=allBookings.filter(b=>(date?(b.status!=="cancelled"&&String(b.appointmentDate||"").slice(0,10)===date):b.status==="pending"))
    .filter(b=>(!query||`${b.patientName||""} ${b.patientPhone||""}`.toLocaleLowerCase("ar").includes(query)));
  if(!rows.length){const empty=document.createElement("div");empty.className="empty-employees";empty.textContent=date?"لا توجد حجوزات في هذا اليوم.":"لا توجد طلبات حجز معلقة.";bookingList.append(empty);return}
  rows.forEach(b=>bookingList.append(renderBookingCard(b)));
}
async function loadBookings() {
  if (isLoadingBookings || !bookingList) return;
  isLoadingBookings = true;
  if (refreshBookingsButton) { refreshBookingsButton.disabled = true; refreshBookingsButton.textContent = "جارٍ التحديث..."; }
  if (refreshDailyAppointmentsButton) refreshDailyAppointmentsButton.disabled = true;
  hideMessage(bookingListMessage); hideMessage(dailyAppointmentsMessage);
  try {
    const result = await bookingApiRequest("list");
    allBookings = Array.isArray(result.bookings) ? result.bookings : [];
    renderPendingBookings(); renderDailyAppointments();
  } catch (error) {
    console.error("تعذر تحميل الحجوزات:", error);
    showMessage(bookingListMessage,error.message||"تعذر تحميل الحجوزات.");
    showMessage(dailyAppointmentsMessage,error.message||"تعذر تحميل المواعيد.");
  } finally {
    isLoadingBookings = false;
    if (refreshBookingsButton) { refreshBookingsButton.disabled = false; refreshBookingsButton.textContent = "تحديث الطلبات"; }
    if (refreshDailyAppointmentsButton) refreshDailyAppointmentsButton.disabled = false;
  }
}
async function employeeApiRequest(action, data = {}) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("انتهت جلسة الدخول. سجّل الدخول مرة أخرى.");
  }

  const idToken = await user.getIdToken();

  const response = await fetch(EMPLOYEES_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${idToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      action,
      ...data
    }),
    cache: "no-store"
  });

  let result = {};

  try {
    result = await response.json();
  } catch {
    result = {};
  }

  if (response.status === 401) {
    throw new Error("انتهت جلسة الدخول أو تعذر التحقق منها. سجّل الدخول مجددًا.");
  }

  if (response.status === 403) {
    throw new Error("غير مسموح بتنفيذ هذا الإجراء.");
  }

  if (!response.ok) {
    throw new Error(
      result.message ||
      "تعذر تنفيذ الطلب. حاول مرة أخرى."
    );
  }

  return result;
}

function readPermissionsFromForm() {
  const permissions = {};

  for (const section of PERMISSION_SECTIONS) {
    const select = $(`#permission${section.key[0].toUpperCase()}${section.key.slice(1)}`);

    permissions[section.key] = select?.value || "none";
  }

  return permissions;
}

function setCreateEmployeeBusy(busy) {
  isCreatingEmployee = busy;

  if (createEmployeeButton) {
    createEmployeeButton.disabled = busy;
    createEmployeeButton.textContent = busy
      ? "جارٍ إنشاء الحساب..."
      : "إنشاء حساب الموظف";
  }
}

function createPermissionSelect(section, currentValue) {
  const select = document.createElement("select");

  select.className = "permission-select";
  select.dataset.permission = section.key;
  select.setAttribute(
    "aria-label",
    `صلاحية ${section.label}`
  );

  for (const optionData of PERMISSION_OPTIONS) {
    const option = document.createElement("option");

    option.value = optionData.value;
    option.textContent = optionData.label;
    option.selected = optionData.value === currentValue;

    select.appendChild(option);
  }

  return select;
}

function renderEmployeeCard(employee) {
  const card = document.createElement("article");
  card.className = "employee-card";
  card.dataset.uid = employee.uid;

  const header = document.createElement("div");
  header.className = "employee-card-header";

  const identity = document.createElement("div");

  const name = document.createElement("h5");
  name.textContent = employee.displayName || "موظف بدون اسم";

  const email = document.createElement("p");
  email.className = "employee-email";
  email.textContent = employee.email || "لا يوجد بريد إلكتروني";

  const uid = document.createElement("p");
  uid.className = "employee-uid";
  uid.textContent = `معرّف الحساب: ${employee.uid}`;

  identity.append(name, email, uid);
  header.appendChild(identity);

  const permissionsContainer = document.createElement("div");
  permissionsContainer.className = "employee-permissions";

  const currentPermissions = employee.permissions || {};

  for (const section of PERMISSION_SECTIONS) {
    const row = document.createElement("div");
    row.className = "employee-permission-row";

    const label = document.createElement("label");
    label.textContent = section.label;

    const select = createPermissionSelect(
      section,
      PERMISSION_OPTIONS.some(
        (option) => option.value === currentPermissions[section.key]
      )
        ? currentPermissions[section.key]
        : "none"
    );

    row.append(label, select);
    permissionsContainer.appendChild(row);
  }

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "primary-button save-permissions-button";
  saveButton.dataset.action = "save-permissions";
  saveButton.textContent = "حفظ الصلاحيات";

  card.append(header, permissionsContainer, saveButton);

  return card;
}

function renderEmployeeList(employees) {
  if (!employeeList) return;

  employeeList.replaceChildren();

  if (!Array.isArray(employees) || employees.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-employees";
    empty.textContent = "لا يوجد موظفون مسجلون حتى الآن.";
    employeeList.appendChild(empty);
    return;
  }

  for (const employee of employees) {
    if (!employee?.uid) continue;
    employeeList.appendChild(renderEmployeeCard(employee));
  }
}

async function loadEmployees() {
  if (isLoadingEmployees || !employeeList) return;

  isLoadingEmployees = true;

  if (refreshEmployeesButton) {
    refreshEmployeesButton.disabled = true;
    refreshEmployeesButton.textContent = "جارٍ التحديث...";
  }

  hideMessage(employeeListMessage);

  try {
    const result = await employeeApiRequest("list");
    renderEmployeeList(result.employees || []);
  } catch (error) {
    console.error("تعذر تحميل قائمة الموظفين:", error);

    showMessage(
      employeeListMessage,
      error.message || "تعذر تحميل قائمة الموظفين."
    );
  } finally {
    isLoadingEmployees = false;

    if (refreshEmployeesButton) {
      refreshEmployeesButton.disabled = false;
      refreshEmployeesButton.textContent = "تحديث القائمة";
    }
  }
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isSubmitting) return;

    hideMessage(loginError);

    const email = emailInput?.value.trim() || "";
    const password = passwordInput?.value || "";

    if (!email || !password) {
      showMessage(
        loginError,
        "أدخل البريد الإلكتروني وكلمة المرور."
      );
      return;
    }

    setLoginBusy(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);

      if (passwordInput) passwordInput.value = "";
    } catch (error) {
      console.error("خطأ تسجيل دخول الدكتور:", error);

      showLogin();
      showMessage(loginError, getFriendlyAuthError(error));
    } finally {
      setLoginBusy(false);
    }
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;

    try {
      await signOut(auth);
      showLogin();
      hideMessage(loginError);
      hideMessage(createEmployeeMessage);
      hideMessage(employeeListMessage);

      if (emailInput) emailInput.focus();
    } catch (error) {
      console.error("خطأ تسجيل الخروج:", error);

      showMessage(
        $("#dashboardMessage"),
        "تعذر تسجيل الخروج. حاول مرة أخرى."
      );
    } finally {
      logoutButton.disabled = false;
    }
  });
}

if (openHomeTabButton) openHomeTabButton.addEventListener("click", showHomeSection);
if (openEmployeesButton) {
  openEmployeesButton.addEventListener("click", async () => {
    showEmployeeSection(true);
    await loadEmployees();
  });
}

if (backToDashboardButton) {
  backToDashboardButton.addEventListener("click", () => {
    showEmployeeSection(false);
  });
}

if (refreshEmployeesButton) {
  refreshEmployeesButton.addEventListener("click", loadEmployees);
}

if (openBookingsButton) {
  openBookingsButton.addEventListener("click", async () => {
    showBookingSection(true);
    await loadBookings();
  });
}


if (refreshBookingsButton) refreshBookingsButton.addEventListener("click", loadBookings);
if (refreshDailyAppointmentsButton) refreshDailyAppointmentsButton.addEventListener("click", loadBookings);
if (addBookingToggleButton && bookingCreateCard) addBookingToggleButton.addEventListener("click", () => { bookingCreateCard.hidden = !bookingCreateCard.hidden; });
if (bookingSearchInput) bookingSearchInput.addEventListener("input", renderPendingBookings);
if (bookingDateFilter) bookingDateFilter.addEventListener("change", renderPendingBookings);

function clearPatientCredentials() {
  if (patientCredentialsPanel) patientCredentialsPanel.hidden = true;
  if (createdPatientUsername) createdPatientUsername.textContent = "";
  if (createdPatientEmail) createdPatientEmail.textContent = "";
  if (createdPatientPassword) createdPatientPassword.textContent = "";
  if (patientCredentialsMessage) patientCredentialsMessage.textContent = "";
  if (copyPatientCredentialsButton) copyPatientCredentialsButton.textContent = "نسخ بيانات الدخول";
}

if (createBookingForm) {
  createBookingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isCreatingBooking) return;
    hideMessage(createBookingMessage);

    const booking = {
      patientName: $("#newBookingPatientName")?.value.trim() || "",
      patientPhone: $("#newBookingPatientPhone")?.value.trim() || "",
      appointmentDate: $("#newBookingDate")?.value || "",
      service: $("#newBookingService")?.value.trim() || "",
      notes: $("#newBookingNotes")?.value.trim() || ""
    };
    if (!booking.patientName || !booking.patientPhone || !booking.appointmentDate) {
      showMessage(createBookingMessage, "أدخل اسم المريضة ورقم الهاتف والتاريخ.");
      return;
    }

    isCreatingBooking = true;
    if (createBookingButton) {
      createBookingButton.disabled = true;
      createBookingButton.textContent = "جارٍ إضافة الحجز...";
    }
    try {
      await bookingApiRequest("create", { booking });
      createBookingForm.reset();
      showMessage(createBookingMessage, "تمت إضافة الحجز بحالة قيد المراجعة.", "success");
      await loadBookings();
    } catch (error) {
      console.error("Manual booking creation failed:", error);
      showMessage(createBookingMessage, error.message || "تعذر إضافة الحجز.");
    } finally {
      isCreatingBooking = false;
      if (createBookingButton) {
        createBookingButton.disabled = false;
        createBookingButton.textContent = "إضافة الحجز";
      }
    }
  });
}

if (openPatientsButton) {
  openPatientsButton.addEventListener("click", () => {
    clearPatientCredentials();
    showPatientSection(true);
    hideMessage(createPatientMessage);
  });
}

if (backFromPatientsButton) {
  backFromPatientsButton.addEventListener("click", () => {
    clearPatientCredentials();
    showPatientSection(false);
  });
}

if (createPatientForm) {
  createPatientForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isCreatingPatient) return;
    hideMessage(createPatientMessage);
    if (patientCredentialsPanel) patientCredentialsPanel.hidden = true;

    const displayName = $("#patientAccountName")?.value.trim() || "";
    const email = $("#patientAccountEmail")?.value.trim() || "";
    const phone = $("#patientAccountPhone")?.value.trim() || "";
    const username = $("#patientAccountUsername")?.value.trim().toLowerCase() || "";

    if (!displayName || !email || !username) {
      showMessage(createPatientMessage, "أدخل اسم المريضة والبريد الإلكتروني واسم المستخدم.");
      return;
    }

    isCreatingPatient = true;
    if (createPatientButton) {
      createPatientButton.disabled = true;
      createPatientButton.textContent = "جارٍ إنشاء الحساب...";
    }

    try {
      const result = await patientApiRequest("create", { displayName, email, phone, username });
      const credentials = result.credentials || {};
      if (createdPatientUsername) createdPatientUsername.textContent = credentials.username || "";
      if (createdPatientEmail) createdPatientEmail.textContent = credentials.email || "";
      if (createdPatientPassword) createdPatientPassword.textContent = credentials.temporaryPassword || "";
      if (patientCredentialsMessage) patientCredentialsMessage.textContent = result.message || "تم إنشاء الحساب.";
      if (patientCredentialsPanel) patientCredentialsPanel.hidden = false;
      createPatientForm.reset();
      showMessage(createPatientMessage, "تم إنشاء الحساب بنجاح. انسخي بيانات الدخول وسلّميها للمريضة بشكل خاص.", "success");
    } catch (error) {
      console.error("Patient account creation failed:", error);
      showMessage(createPatientMessage, error.message || "تعذر إنشاء حساب المريضة.");
    } finally {
      isCreatingPatient = false;
      if (createPatientButton) {
        createPatientButton.disabled = false;
        createPatientButton.textContent = "إنشاء حساب المريضة";
      }
    }
  });
}

if (copyPatientCredentialsButton) {
  copyPatientCredentialsButton.addEventListener("click", async () => {
    const text = [
      "اسم المستخدم: " + (createdPatientUsername?.textContent || ""),
      "البريد الإلكتروني: " + (createdPatientEmail?.textContent || ""),
      "كلمة المرور المؤقتة: " + (createdPatientPassword?.textContent || "")
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      copyPatientCredentialsButton.textContent = "تم النسخ";
    } catch {
      showMessage(createPatientMessage, "تعذر النسخ تلقائيًا. انسخي البيانات يدويًا.");
    }
  });
}

if (bookingList) {
  bookingList.addEventListener("click", async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button || !bookingList.contains(button)) return;

    const card = button.closest("[data-booking-id]");
    const id = card?.dataset.bookingId;
    if (!id) return;

    const action = button.dataset.action;
    const busyText = button.textContent;
    button.disabled = true;
    button.textContent = action === "cancel-booking" ? "جارٍ الإلغاء..." : "جارٍ الحفظ...";
    hideMessage(bookingListMessage);

    try {
      if (action === "cancel-booking") {
        if (!window.confirm("هل تريد إلغاء طلب الحجز؟")) return;
        await bookingApiRequest("cancel", { id });
      } else if (action === "confirm-booking") {
        const booking = { id, status: "confirmed" };
        for (const field of ["patientName", "patientPhone", "appointmentDate", "service", "notes"]) {
          const input = card.querySelector(`[data-booking-field="${field}"]`);
          booking[field] = input?.value ?? "";
        }
        await bookingApiRequest("update", { booking });
      } else if (action === "save-booking") {
        const booking = { id };
        for (const field of ["patientName", "patientPhone", "appointmentDate", "service", "notes"]) {
          const input = card.querySelector(`[data-booking-field="${field}"]`);
          booking[field] = input?.value ?? "";
        }
        await bookingApiRequest("update", { booking });
      } else return;
      showMessage(bookingListMessage,action==="cancel-booking"?"تم إلغاء طلب الحجز.":action==="confirm-booking"?"تم تأكيد الحجز ونقله إلى المواعيد.":"تم حفظ تعديلات الحجز.","success");
      await loadBookings();
    } catch (error) {
      console.error("تعذر تعديل الحجز:", error);
      showMessage(bookingListMessage, error.message || "تعذر تعديل الحجز.");
    } finally {
      button.disabled = false;
      button.textContent = busyText;
    }
  });
}

if (createEmployeeForm) {
  createEmployeeForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isCreatingEmployee) return;

    hideMessage(createEmployeeMessage);

    const displayName = $("#employeeName")?.value.trim() || "";
    const email = $("#employeeEmail")?.value.trim() || "";
    const password = $("#employeePassword")?.value || "";
    const permissions = readPermissionsFromForm();

    if (!displayName || !email || !password) {
      showMessage(
        createEmployeeMessage,
        "أدخل اسم الموظف والبريد الإلكتروني وكلمة المرور."
      );
      return;
    }

    if (password.length < 6) {
      showMessage(
        createEmployeeMessage,
        "كلمة المرور يجب أن تتكون من 6 أحرف على الأقل."
      );
      return;
    }

    setCreateEmployeeBusy(true);

    try {
      await employeeApiRequest("create", {
        displayName,
        email,
        password,
        permissions
      });

      createEmployeeForm.reset();

      showMessage(
        createEmployeeMessage,
        "تم إنشاء حساب الموظف وحفظ صلاحياته.",
        "success"
      );

      await loadEmployees();
    } catch (error) {
      console.error("تعذر إنشاء حساب الموظف:", error);

      showMessage(
        createEmployeeMessage,
        error.message || "تعذر إنشاء حساب الموظف."
      );
    } finally {
      setCreateEmployeeBusy(false);
    }
  });
}

if (employeeList) {
  employeeList.addEventListener("click", async (event) => {
    const button = event.target.closest(
      'button[data-action="save-permissions"]'
    );

    if (!button || !employeeList.contains(button)) return;

    const card = button.closest(".employee-card");
    const uid = card?.dataset.uid;

    if (!uid) {
      showMessage(
        employeeListMessage,
        "تعذر تحديد حساب الموظف المطلوب."
      );
      return;
    }

    const permissions = {};

    for (const section of PERMISSION_SECTIONS) {
      const select = $(
        `.permission-select[data-permission="${section.key}"]`,
        card
      );

      permissions[section.key] = select?.value || "none";
    }

    button.disabled = true;
    button.textContent = "جارٍ الحفظ...";
    hideMessage(employeeListMessage);

    try {
      await employeeApiRequest("updatePermissions", {
        uid,
        permissions
      });

      showMessage(
        employeeListMessage,
        "تم حفظ صلاحيات الموظف.",
        "success"
      );
    } catch (error) {
      console.error("تعذر حفظ صلاحيات الموظف:", error);

      showMessage(
        employeeListMessage,
        error.message || "تعذر حفظ صلاحيات الموظف."
      );
    } finally {
      button.disabled = false;
      button.textContent = "حفظ الصلاحيات";
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  const requestNumber = ++verificationRequestNumber;

  if (!user) {
    showLogin();
    setLoginBusy(false);
    return;
  }

  showLogin();
  setLoginBusy(true);

  try {
    await verifyDoctorOnServer(user, requestNumber);
  } finally {
    if (requestNumber === verificationRequestNumber) {
      setLoginBusy(false);
    }
  }
});

// لا تُعرض لوحة الدكتور قبل اكتمال التحقق من الخادم.
showLogin();
