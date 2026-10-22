
import { FIREBASE_CONFIG } from "./config/firebase-config.js";
import { APP_CONFIG } from "./config/app-config.js";

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
  { key: "settings", label: "إعدادات العيادة" },
  { key: "accounts", label: "حسابات اليوم" }
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
const addBookingToggleButton = $("#addBookingToggleButton");
const bookingCreateCard = $(".booking-create-card");
const bookingSearchInput = $("#bookingSearchInput");
const bookingRequestsToggle = $("#openBookingRequestsButton");
const bookingRequestsPanel = $("#bookingRequestsPanel");
const bookingDateFilter = $("#bookingDateFilter");
const homeAppointmentsSection = $("#homeAppointmentsSection");
const doctorArchiveSection = $("#doctorArchiveSection");
const openArchiveTabButton = $("#openArchiveTabButton");
const doctorScheduleDateLabel = $("#doctorScheduleDateLabel");
const doctorScheduleFilterDialog = $("#doctorScheduleFilterDialog");
const doctorFilterMode = $("#doctorFilterMode");
const doctorFilterDate = $("#doctorFilterDate");
const doctorFilterQuery = $("#doctorFilterQuery");
const doctorHomeDateFilter = $("#doctorHomeDateFilter");
const doctorHomeSearch = $("#doctorHomeSearch");
const doctorArchiveDateFilter = $("#doctorArchiveDateFilter");
const doctorArchiveList = $("#doctorArchiveList");
const doctorArchiveSearch = $("#doctorArchiveSearch");
const homeAddBookingButton = $("#homeAddBookingButton");
const dailyAppointmentsList = $("#dailyAppointmentsList");
const dailyAppointmentsMessage = $("#dailyAppointmentsMessage");
const doctorAccountsSection=$("#doctorAccountsSection"),openAccountsTabButton=$("#openAccountsTabButton"),doctorAccountsContent=$("#doctorAccountsContent"),accountsDateLabel=$("#accountsDateLabel"),doctorStatusLegend=$("#doctorStatusLegend"),archiveSelectedAppointments=$("#archiveSelectedAppointments");let activeStatusFilter="all";
const accountsSubtabs=$("#doctorAccountsSubtabs"),patientDailyAccountsPanel=$("#patientDailyAccountsPanel"),salaryAccountsPanel=$("#salaryAccountsPanel"),customAccountsPanel=$("#customAccountsPanel"),salaryEntriesList=$("#salaryEntriesList"),customAccountEntriesList=$("#customAccountEntriesList"),salaryEntryForm=$("#salaryEntryForm"),customAccountEntryForm=$("#customAccountEntryForm"),accountsCategoryForm=$("#accountsCategoryForm"),doctorAccountsDate=$("#doctorAccountsDate"),doctorDailyExpenseForm=$("#doctorDailyExpenseForm"),doctorDailyExpensesList=$("#doctorDailyExpensesList"),doctorDailyExpenseMessage=$("#doctorDailyExpenseMessage"),doctorDailyNetTotal=$("#doctorDailyNetTotal");let doctorDailyExpenses=[],doctorAccountCategories=[],doctorAccountEntries=[],activeDoctorAccountSubtab="patients";
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
  const brandPanel = $(".brand-panel"); if (brandPanel) brandPanel.hidden = false;

  showEmployeeSection(false);
}

function showDashboard(user) {
  if (loginSection) loginSection.hidden = true;
  if (dashboardSection) dashboardSection.hidden = false;
  const brandPanel = $(".brand-panel"); if (brandPanel) brandPanel.hidden = true;

  if (doctorAccountLabel) {
    doctorAccountLabel.textContent = user.displayName || APP_CONFIG.clinic.doctorName || (user.email ? user.email.split("@")[0] : "الدكتور");
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
  if (doctorAccountsSection) doctorAccountsSection.hidden = true;
  if (doctorArchiveSection) doctorArchiveSection.hidden = true;
  if (homeAppointmentsSection) homeAppointmentsSection.hidden = false;
  if (employeeManagementSection) employeeManagementSection.hidden = true;
  if (bookingManagementSection) bookingManagementSection.hidden = true;
  if (patientManagementSection) patientManagementSection.hidden = true;
  setActiveTab(openHomeTabButton);
}
function showEmployeeSection(show) {
  if (doctorAccountsSection) doctorAccountsSection.hidden = true;
  if (doctorArchiveSection) doctorArchiveSection.hidden = true;
  if (employeeManagementSection) employeeManagementSection.hidden = !show;
  if (bookingManagementSection) bookingManagementSection.hidden = true;
  if (patientManagementSection) patientManagementSection.hidden = true;
  if (homeAppointmentsSection) homeAppointmentsSection.hidden = show;
  if (show) setActiveTab(openEmployeesButton); else showHomeSection();
}
function showBookingSection(show) {
  if (doctorAccountsSection) doctorAccountsSection.hidden = true;
  if (doctorArchiveSection) doctorArchiveSection.hidden = true;
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

  
$("#addAccountsCategoryButton")?.addEventListener("click",()=>{accountsCategoryForm.hidden=!accountsCategoryForm.hidden});
accountsCategoryForm?.addEventListener("submit",async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(accountsCategoryForm).entries()),button=accountsCategoryForm.querySelector('button[type="submit"]');button.disabled=true;try{await accountsApiRequest("createCategory",{name:String(data.name||"").trim(),kind:data.kind});accountsCategoryForm.reset();accountsCategoryForm.hidden=true;showMessage($("#dashboardMessage"),"تم إنشاء قسم الحسابات.","success");await loadDoctorAccountRecords()}catch(error){showMessage($("#accountsCategoryMessage"),error.message||"تعذر إنشاء القسم.")}finally{button.disabled=false}});
$("#addSalaryEntryButton")?.addEventListener("click",()=>{salaryEntryForm.hidden=!salaryEntryForm.hidden;const d=salaryEntryForm.querySelector('[name="date"]');if(d&&!d.value)d.value=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())});
salaryEntryForm?.addEventListener("submit",e=>{e.preventDefault();saveAccountEntry(salaryEntryForm,"employee-salaries","expense",$("#salaryEntryMessage"))});
$("#addAccountEntryButton")?.addEventListener("click",()=>{customAccountEntryForm.hidden=!customAccountEntryForm.hidden;const d=customAccountEntryForm.querySelector('[name="date"]');if(d&&!d.value)d.value=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())});
customAccountEntryForm?.addEventListener("submit",e=>{e.preventDefault();const category=doctorAccountCategories.find(x=>"custom:"+x.id===activeDoctorAccountSubtab);if(category)saveAccountEntry(customAccountEntryForm,category.id,category.kind,$("#customAccountEntryMessage"))});

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
  if (doctorAccountsSection) doctorAccountsSection.hidden = true;
  if (doctorArchiveSection) doctorArchiveSection.hidden = true;
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
async function accountsApiRequest(action,data={}){const user=auth.currentUser;if(!user)throw new Error("انتهت جلسة الدخول.");const response=await fetch("/api/doctor/accounts",{method:"POST",headers:{Authorization:`Bearer ${await user.getIdToken()}`,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({action,...data}),cache:"no-store"});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.message||"تعذر تنفيذ عملية الحسابات.");return result}
function renderAccountEntries(container,rows,kind){if(!container)return;container.replaceChildren();if(!rows.length){container.textContent="لا توجد حركات مسجلة في هذا القسم.";return}const table=document.createElement("table");table.className="accounts-table";const head=document.createElement("thead");head.innerHTML="<tr><th>التاريخ</th><th>البيان</th><th>القيمة</th><th>ملاحظات</th></tr>";table.append(head);const body=document.createElement("tbody");let total=0;for(const item of rows.slice().sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")))){const amount=Number(item.amount)||0;total+=amount;const tr=document.createElement("tr");for(const value of [formatRequestDate(item.date),item.personName||"—",doctorMoney(amount),item.notes||"—"]){const td=document.createElement("td");td.textContent=value;tr.append(td)}body.append(tr)}table.append(body);const totalBox=document.createElement("div");totalBox.className="accounts-total";const label=document.createElement("span");label.textContent=kind==="expense"?"إجمالي المصروفات المسجلة":"إجمالي الدخل المسجل";const amount=document.createElement("strong");amount.textContent=doctorMoney(total);totalBox.append(label,amount);container.append(table,totalBox)}
function setDoctorAccountsSubtab(key){activeDoctorAccountSubtab=key;for(const button of accountsSubtabs.querySelectorAll("[data-account-subtab]"))button.setAttribute("aria-selected",String(button.dataset.accountSubtab===key));patientDailyAccountsPanel.hidden=key!=="patients";salaryAccountsPanel.hidden=key!=="salaries";customAccountsPanel.hidden=!key.startsWith("custom:");if(key==="patients")renderDoctorAccounts();if(key==="salaries")renderAccountEntries(salaryEntriesList,doctorAccountEntries.filter(x=>x.type==="entry"&&x.categoryId==="employee-salaries"),"expense");if(key.startsWith("custom:")){const category=doctorAccountCategories.find(x=>x.id===key.slice(7));if(category){$("#customAccountTitle").textContent=category.name+" · "+(category.kind==="income"?"دخل":"مصروف");renderAccountEntries(customAccountEntriesList,doctorAccountEntries.filter(x=>x.type==="entry"&&x.categoryId===category.id),category.kind)}}}
function renderDoctorAccountsSubtabs(){if(!accountsSubtabs)return;accountsSubtabs.replaceChildren();const tabs=[{id:"patients",label:"حسابات المرضى"},{id:"salaries",label:"مرتبات الموظفين"},...doctorAccountCategories.map(x=>({id:"custom:"+x.id,label:x.name+" · "+(x.kind==="income"?"دخل":"مصروف")}))];for(const item of tabs){const b=document.createElement("button");b.type="button";b.className="accounts-subtab";b.dataset.accountSubtab=item.id;b.textContent=item.label;b.setAttribute("aria-selected",String(item.id===activeDoctorAccountSubtab));b.addEventListener("click",()=>{if(item.id.startsWith("custom:")){activeDoctorAccountSubtab="custom:"+item.id.slice(7);for(const x of accountsSubtabs.querySelectorAll("[data-account-subtab]"))x.setAttribute("aria-selected",String(x.dataset.accountSubtab===activeDoctorAccountSubtab));patientDailyAccountsPanel.hidden=true;salaryAccountsPanel.hidden=true;customAccountsPanel.hidden=false;const category=doctorAccountCategories.find(x=>x.id===item.id.slice(7));$("#customAccountTitle").textContent=category?category.name+" · "+(category.kind==="income"?"دخل":"مصروف"):"قسم الحسابات";renderAccountEntries(customAccountEntriesList,doctorAccountEntries.filter(x=>x.type==="entry"&&x.categoryId===item.id.slice(7)),category?.kind||"income")}else setDoctorAccountsSubtab(item.id)});accountsSubtabs.append(b)}if(!tabs.some(x=>x.id===activeDoctorAccountSubtab))activeDoctorAccountSubtab="patients";setDoctorAccountsSubtab(activeDoctorAccountSubtab)}
async function loadDoctorAccountRecords(){try{const result=await accountsApiRequest("list");doctorAccountCategories=Array.isArray(result.categories)?result.categories:[];doctorAccountEntries=Array.isArray(result.entries)?result.entries:[];renderDoctorAccountsSubtabs()}catch(error){showMessage($("#dashboardMessage"),error.message||"تعذر تحميل الحسابات.")}}
async function saveAccountEntry(form,categoryId,kind,messageElement){const data=Object.fromEntries(new FormData(form).entries());const entry={categoryId,personName:String(data.personName||"").trim(),amount:String(data.amount||"").trim(),date:String(data.date||"").trim(),notes:String(data.notes||"").trim()};const button=form.querySelector('button[type="submit"]');button.disabled=true;try{await accountsApiRequest("createEntry",{entry});form.reset();const dateInput=form.querySelector('[name="date"]');if(dateInput)dateInput.value=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());if(messageElement)showMessage(messageElement,"تم تسجيل الحركة بنجاح.","success");await loadDoctorAccountRecords();setDoctorAccountsSubtab(categoryId==="employee-salaries"?"salaries":"custom:"+categoryId)}catch(error){if(messageElement)showMessage(messageElement,error.message||"تعذر تسجيل الحركة.")}finally{button.disabled=false}}


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
      ["waiting", "في الانتظار"],
      ["confirmed", "في الانتظار"],
      ["completed", "تم الكشف"],
      ["postponed", "تم التأجيل"],
      ["no_show", "لم يأتِ"],
      ["apologized", "اعتذر"],
      ["cancelled", "ملغي"],
      ["archived", "في الأرشيف"]
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
    if (field === "servicePrice") { input.type="number"; input.min="0"; input.max="99999999"; input.step="0.01"; input.inputMode="decimal"; }
    if (field === "notes") input.maxLength = 2000;
    if (field === "appointmentDate") input.type = "date";
  }

  if (field === "status") input.value = normalizedStatus(value) || "pending";
  if(field==="servicePrice")input.value=value??"0";
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
  const meta = document.createElement("small"); meta.textContent = `الدور: ${queueNumberFor(booking)} · ${bookingStatusLabel(booking.status)} · تاريخ الطلب: ${formatSubmittedAt(booking.createdAt)} · الموعد: ${formatRequestDate(booking.appointmentDate)} · ${booking.patientPhone||"الهاتف غير مسجل"} · ${booking.service||"الخدمة غير محددة"}`;
  main.append(title,meta); const badge=document.createElement("span");badge.className="booking-request-badge";badge.textContent=bookingStatusLabel(booking.status);summary.append(main,badge);
  const details=document.createElement("div");details.className="booking-request-details";details.hidden=true;
  const fields=document.createElement("div");fields.className="booking-edit-grid";
  fields.append(createBookingInput("اسم المريضة",booking.patientName,"patientName"),createBookingInput("رقم الهاتف",booking.patientPhone,"patientPhone","tel"),createBookingInput("الموعد",String(booking.appointmentDate||"").slice(0,10),"appointmentDate","date"),createBookingInput("الخدمة",booking.service,"service"),createBookingInput("قيمة الخدمة (جنيه)",booking.servicePrice,"servicePrice","number"),createBookingInput("ملاحظات",booking.notes,"notes"),createBookingInput("حالة الحجز",normalizedStatus(booking.status),"status","select"));
  const actions=document.createElement("div");actions.className="booking-card-actions";
  const actionItems=[["save-booking","حفظ التعديلات","secondary-button"]];
  if(booking.status==="pending")actionItems.push(["confirm-booking","تأكيد الحجز","primary-button"],["archive-booking","نقل إلى الأرشيف","secondary-button"]);
  if(["pending","confirmed"].includes(booking.status))actionItems.push(["cancel-booking","إلغاء الحجز","secondary-button"]);
  for(const [action,label,cls] of actionItems){const button=document.createElement("button");button.type="button";button.className=cls;button.dataset.action=action;button.textContent=label;actions.append(button)}
  details.append(fields,actions);summary.addEventListener("click",()=>{details.hidden=!details.hidden});card.append(summary,details);return card;
}
function formatRequestDate(value){if(!value)return"التاريخ غير محدد";const date=new Date(`${String(value).slice(0,10)}T12:00:00`);return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat("ar-EG",{weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"}).format(date)}
function formatSubmittedAt(value){if(!value)return"وقت الطلب غير متاح";const date=new Date(value);return Number.isNaN(date.getTime())?"وقت الطلب غير متاح":new Intl.DateTimeFormat("ar-EG",{dateStyle:"medium",timeStyle:"short"}).format(date)}
function queueNumberFor(booking){const date=String(booking.appointmentDate||"").slice(0,10);if(!date)return"—";const rows=allBookings.filter(item=>String(item.appointmentDate||"").slice(0,10)===date).sort((x,y)=>(Date.parse(x.createdAt||"")||0)-(Date.parse(y.createdAt||"")||0));const index=rows.findIndex(item=>item.id===booking.id);return index<0?"—":index+1}
const BOOKING_STATUS_OPTIONS=[["waiting","في الانتظار"],["completed","تم الكشف"],["postponed","تم التأجيل"],["no_show","لم يأتِ"],["apologized","اعتذر"]];
const ARCHIVE_STATUSES=new Set(["archived","cancelled"]);
function normalizedStatus(status){return status==="confirmed"?"waiting":status}
function bookingStatusLabel(status){return({pending:"قيد المراجعة",confirmed:"في الانتظار",waiting:"في الانتظار",completed:"تم الكشف",postponed:"تم التأجيل",no_show:"لم يأتِ",apologized:"اعتذر",cancelled:"ملغي"})[status]||"غير محدد"}
async function changeBookingStatus(booking,status,control){if(!["waiting","completed","postponed","no_show","apologized"].includes(status))return;if(control)control.disabled=true;try{await bookingApiRequest("update",{booking:{id:booking.id,status}});showMessage(bookingListMessage,"تم تحديث حالة الحجز.","success");await loadBookings()}catch(error){showMessage(bookingListMessage,error.message||"تعذر تحديث حالة الحجز.");if(control)control.value=normalizedStatus(booking.status)}finally{if(control)control.disabled=false}}
function applyStatusColor(el,status){for(const name of ["waiting","completed","postponed","no_show","apologized","pending","archived","cancelled"])el.classList.remove(`status-${name}`);el.classList.add(`status-${status||"waiting"}`)}function makeStatusSelect(booking){const select=document.createElement("select");select.className="booking-status-select";select.setAttribute("aria-label",`حالة حجز ${booking.patientName||""}`);for(const[value,label]of BOOKING_STATUS_OPTIONS){const option=document.createElement("option");option.value=value;option.textContent=label;option.className=`status-option-${value}`;select.append(option)}select.value=normalizedStatus(booking.status)||"waiting";applyStatusColor(select,select.value);select.addEventListener("change",()=>{applyStatusColor(select,select.value);changeBookingStatus(booking,select.value,select)});return select}
function renderScheduleCard(booking,archived=false){const card=renderBookingCard(booking);card.classList.add("schedule-booking-card");applyStatusColor(card,normalizedStatus(booking.status));const meta=card.querySelector(".booking-request-main small");if(meta)meta.textContent=queueNumberFor(booking)+" · الموعد: "+formatRequestDate(booking.appointmentDate)+" · "+(booking.patientPhone||"الهاتف غير مسجل")+" · "+(booking.service||"الخدمة غير محددة");if(!archived){card.querySelector(".booking-request-badge")?.remove();const controls=document.createElement("div");controls.className="schedule-card-controls";controls.append(makeStatusSelect(booking));card.prepend(controls)}return card}

function renderDailyAppointments(){dailyAppointmentsList.replaceChildren();const day=doctorHomeDateFilter?.value||new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());const mode=doctorFilterMode?.value||"date",query=(doctorHomeSearch?.value||"").trim().toLocaleLowerCase("ar");if(doctorScheduleDateLabel)doctorScheduleDateLabel.textContent=mode==="search"?"نتائج البحث":formatRequestDate(day);const rows=allBookings.filter(b=>!["pending","archived","cancelled"].includes(b.status)&&((mode==="search"&&query)||String(b.appointmentDate||"").slice(0,10)===day)&&(!query||(String(b.patientName||"")+" "+String(b.patientPhone||"")+" "+String(b.service||"")).toLocaleLowerCase("ar").includes(query))&&(activeStatusFilter==="all"||normalizedStatus(b.status)===activeStatusFilter)).sort((a,b)=>String(a.appointmentDate||"").localeCompare(String(b.appointmentDate||""))||queueNumberFor(a)-queueNumberFor(b));if(!rows.length){const empty=document.createElement("div");empty.className="empty-employees";empty.textContent=mode==="search"?"لا توجد نتائج مطابقة للبحث.":`لا توجد مواعيد في ${formatRequestDate(day)}.`;dailyAppointmentsList.append(empty)}else for(const booking of rows)dailyAppointmentsList.append(renderScheduleCard(booking));renderDoctorAccounts();if(archiveSelectedAppointments)archiveSelectedAppointments.disabled=mode!=="date"||!allBookings.some(b=>String(b.appointmentDate||"").slice(0,10)===day&&!["pending","archived","cancelled"].includes(b.status))}
function renderDoctorArchive(){if(!doctorArchiveList)return;doctorArchiveList.replaceChildren();const day=doctorArchiveDateFilter?.value||"",query=(doctorArchiveSearch?.value||"").trim().toLocaleLowerCase("ar");const rows=allBookings.filter(b=>ARCHIVE_STATUSES.has(b.status)).filter(b=>(!day||String(b.appointmentDate||"").slice(0,10)===day)&&(!query||`${b.patientName||""} ${b.patientPhone||""} ${b.service||""}`.toLocaleLowerCase("ar").includes(query))).sort((a,b)=>(Date.parse(b.updatedAt||b.createdAt||"")||0)-(Date.parse(a.updatedAt||a.createdAt||"")||0));if(!rows.length){const empty=document.createElement("div");empty.className="empty-employees";empty.textContent="لا توجد حجوزات أو طلبات مؤرشفة حسب الفلتر الحالي.";doctorArchiveList.append(empty);return}for(const booking of rows)doctorArchiveList.append(renderScheduleCard(booking,true))}
function doctorMoney(v){return new Intl.NumberFormat("ar-EG",{style:"currency",currency:"EGP",maximumFractionDigits:2}).format(Number(v)||0)}
function renderDoctorAccounts(){if(!doctorAccountsContent)return;const day=doctorAccountsDate?.value||doctorHomeDateFilter?.value||new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());if(doctorAccountsDate&&!doctorAccountsDate.value)doctorAccountsDate.value=day;if(accountsDateLabel)accountsDateLabel.textContent=formatRequestDate(day);const rows=allBookings.filter(b=>String(b.appointmentDate||"").slice(0,10)===day&&!["pending","archived","cancelled"].includes(b.status)).sort((a,b)=>queueNumberFor(a)-queueNumberFor(b));doctorAccountsContent.replaceChildren();let total=0;const table=document.createElement("table");table.className="accounts-table";const head=document.createElement("thead");head.innerHTML="<tr><th>المريضة</th><th>الخدمة</th><th>سعر الخدمة</th><th>المدفوع</th><th>الحالة</th></tr>";table.append(head);const body=document.createElement("tbody");for(const b of rows){const tr=document.createElement("tr"),price=Number(b.servicePrice)||0,paid=Number(b.paidAmount)||0;total+=paid;const vals=[b.patientName||"—",b.service||"غير محددة",doctorMoney(price),doctorMoney(paid),bookingStatusLabel(b.status)];for(let i=0;i<vals.length;i++){const td=document.createElement("td");td.textContent=vals[i];if(i===4)td.className=b.status==="completed"?"accounts-status-completed":"accounts-status-other";tr.append(td)}body.append(tr)}if(!rows.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=5;td.textContent="لا توجد حجوزات في هذا اليوم.";tr.append(td);body.append(tr)}table.append(body);const box=document.createElement("div");box.className="accounts-total";const label=document.createElement("span");label.textContent="إجمالي المقبوضات لهذا اليوم";const amount=document.createElement("strong");amount.textContent=doctorMoney(total);box.append(label,amount);doctorAccountsContent.append(table,box);loadDoctorDailyExpenses(day,total)}
async function loadDoctorDailyExpenses(day,paidTotal=0){try{const result=await accountsApiRequest("listDailyExpenses",{date:day});doctorDailyExpenses=Array.isArray(result.expenses)?result.expenses:[];const expenseTotal=doctorDailyExpenses.reduce((sum,x)=>sum+(Number(x.amount)||0),0);if(doctorDailyExpensesList){doctorDailyExpensesList.replaceChildren();if(!doctorDailyExpenses.length){const p=document.createElement("p");p.className="muted-text";p.textContent="لا توجد مصروفات مسجلة لهذا اليوم.";doctorDailyExpensesList.append(p)}for(const item of doctorDailyExpenses){const row=document.createElement("div");row.className="doctor-daily-expense-row";const description=document.createElement("span");description.textContent=item.description+(item.notes?" · "+item.notes:"");const amount=document.createElement("strong");amount.textContent="− "+doctorMoney(Number(item.amount)||0);row.append(description,amount);doctorDailyExpensesList.append(row)}}if(doctorDailyNetTotal)doctorDailyNetTotal.textContent=doctorMoney(paidTotal-expenseTotal)}catch(error){showMessage(doctorDailyExpenseMessage,error.message||"تعذر تحميل مصروفات اليوم.")}}
async function archiveDoctorDay(){const day=doctorHomeDateFilter?.value||new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());if((doctorFilterMode?.value||"date")!=="date"){showMessage(dailyAppointmentsMessage,"اختر عرض مواعيد يوم محدد قبل الأرشفة.");return}if(!window.confirm("هل تريد نقل جميع مواعيد يوم "+formatRequestDate(day)+" إلى الأرشيف؟ لن تظهر هذه المواعيد في جدول اليوم بعد الأرشفة."))return;archiveSelectedAppointments.disabled=true;try{const result=await bookingApiRequest("archiveDay",{date:day});await loadBookings();showMessage(dailyAppointmentsMessage,"تم نقل "+(result.archivedCount||0)+" حجز إلى الأرشيف.","success")}catch(e){showMessage(dailyAppointmentsMessage,e.message||"تعذر أرشفة مواعيد اليوم.")}finally{archiveSelectedAppointments.disabled=false;}}
function showDoctorAccounts(){if(doctorAccountsSection)doctorAccountsSection.hidden=false;homeAppointmentsSection.hidden=true;doctorArchiveSection.hidden=true;bookingManagementSection.hidden=true;patientManagementSection.hidden=true;employeeManagementSection.hidden=true;setActiveTab(openAccountsTabButton);if(doctorAccountsDate)doctorAccountsDate.value=doctorHomeDateFilter?.value||doctorAccountsDate.value;renderDoctorAccounts();loadDoctorAccountRecords()}
function renderPendingBookings(){bookingList.replaceChildren();const query=(bookingSearchInput?.value||"").trim().toLocaleLowerCase("ar"),date=bookingDateFilter?.value||"";const rows=allBookings.filter(b=>b.status==="pending"&&(!date||String(b.appointmentDate||"").slice(0,10)===date)).filter(b=>(!query||`${b.patientName||""} ${b.patientPhone||""}`.toLocaleLowerCase("ar").includes(query)));if(!rows.length){const empty=document.createElement("div");empty.className="empty-employees";empty.textContent="لا توجد طلبات مراجعة مطابقة.";bookingList.append(empty);return}rows.forEach(b=>bookingList.append(renderBookingCard(b)))}
async function loadBookings() {
  if (isLoadingBookings || !bookingList) return;
  isLoadingBookings = true;
  hideMessage(bookingListMessage); hideMessage(dailyAppointmentsMessage);
  try {
    const result = await bookingApiRequest("list");
    allBookings = Array.isArray(result.bookings) ? result.bookings : [];
    renderPendingBookings(); renderDailyAppointments(); renderDoctorArchive(); renderDoctorAccounts();
  } catch (error) {
    console.error("تعذر تحميل الحجوزات:", error);
    showMessage(bookingListMessage,error.message||"تعذر تحميل الحجوزات.");
    showMessage(dailyAppointmentsMessage,error.message||"تعذر تحميل المواعيد.");
  } finally {
    isLoadingBookings = false;
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
if (addBookingToggleButton && bookingCreateCard) addBookingToggleButton.addEventListener("click", () => { bookingCreateCard.hidden = !bookingCreateCard.hidden; });
createBookingForm?.querySelector(".service-quick-select")?.addEventListener("change",e=>{const input=createBookingForm.querySelector('[name="service"]');if(input&&e.target.value)input.value=e.target.value});
if (bookingSearchInput) bookingSearchInput.addEventListener("input", renderPendingBookings);
doctorDailyExpenseForm?.addEventListener("submit",async e=>{e.preventDefault();const values=Object.fromEntries(new FormData(doctorDailyExpenseForm).entries());const date=doctorAccountsDate?.value||doctorHomeDateFilter?.value||new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());const entry={date,amount:String(values.amount||"").trim(),description:String(values.description||"").trim(),notes:String(values.notes||"").trim()};const button=doctorDailyExpenseForm.querySelector('button[type="submit"]');button.disabled=true;try{await accountsApiRequest("createDailyExpense",{entry});doctorDailyExpenseForm.reset();showMessage(doctorDailyExpenseMessage,"تم تسجيل المصروف.");renderDoctorAccounts()}catch(error){showMessage(doctorDailyExpenseMessage,error.message||"تعذر تسجيل المصروف.")}finally{button.disabled=false}});
if (bookingRequestsToggle && bookingRequestsPanel) bookingRequestsToggle.addEventListener("click",()=>{const open=bookingRequestsPanel.hidden;bookingRequestsPanel.hidden=!open;bookingRequestsToggle.setAttribute("aria-expanded",String(open));bookingRequestsToggle.classList.toggle("is-open",open)});
$("#cancelCreateBookingButton")?.addEventListener("click",()=>{createBookingForm?.reset();if(bookingCreateCard)bookingCreateCard.hidden=true;document.activeElement?.blur()});
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
      servicePrice: $("#newBookingServicePrice")?.value.trim() || "0",
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
      if (bookingCreateCard) bookingCreateCard.hidden = true;
      document.activeElement?.blur();
      showMessage(createBookingMessage, "تمت إضافة الحجز مباشرةً إلى قائمة الانتظار.", "success");
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
        const booking = { id, status: "waiting" };
        for (const field of ["patientName", "patientPhone", "appointmentDate", "service", "notes", "status"]) {
          const input = card.querySelector(`[data-booking-field="${field}"]`);
          booking[field] = input?.value ?? "";
        }
        booking.status = "waiting";
        await bookingApiRequest("update", { booking });
      } else if (action === "archive-booking") {
        await bookingApiRequest("update", { booking: { id, status: "archived" } });
      } else if (action === "save-booking") {
        const booking = { id };
        for (const field of ["patientName", "patientPhone", "appointmentDate", "service", "notes", "status"]) {
          const input = card.querySelector(`[data-booking-field="${field}"]`);
          booking[field] = input?.value ?? "";
        }
        await bookingApiRequest("update", { booking });
      } else return;
      showMessage(bookingListMessage,action==="cancel-booking"?"تم إلغاء طلب الحجز.":action==="confirm-booking"?"تم تأكيد الحجز ونقله إلى المواعيد.":action==="archive-booking"?"تم نقل الطلب إلى الأرشيف.":"تم حفظ تعديلات الحجز.","success");if(action==="archive-booking")showDoctorArchive();
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
if (doctorHomeDateFilter) { doctorHomeDateFilter.value = new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()); if(doctorFilterDate)doctorFilterDate.value=doctorHomeDateFilter.value; if(doctorAccountsDate)doctorAccountsDate.value=doctorHomeDateFilter.value; doctorHomeDateFilter.addEventListener("change",renderDailyAppointments); }doctorAccountsDate?.addEventListener("change",renderDoctorAccounts);doctorScheduleDateLabel?.addEventListener("click",()=>{if(doctorFilterMode)doctorFilterMode.value="date";if(doctorFilterDate)doctorFilterDate.value=doctorHomeDateFilter.value;if(doctorFilterQuery)doctorFilterQuery.value="";$("#doctorFilterDateLabel").hidden=false;$("#doctorFilterQueryLabel").hidden=true;doctorScheduleFilterDialog?.showModal()});
doctorHomeSearch?.addEventListener("input",renderDailyAppointments);doctorStatusLegend?.addEventListener("click",e=>{const b=e.target.closest("[data-status-filter]");if(!b)return;activeStatusFilter=b.dataset.statusFilter;for(const x of doctorStatusLegend.querySelectorAll("[data-status-filter]"))x.classList.toggle("is-active",x===b);renderDailyAppointments()});archiveSelectedAppointments?.addEventListener("click",archiveDoctorDay);openAccountsTabButton?.addEventListener("click",showDoctorAccounts);
doctorArchiveDateFilter?.addEventListener("change",renderDoctorArchive);doctorArchiveSearch?.addEventListener("input",renderDoctorArchive);
$("#openDoctorScheduleFilter")?.addEventListener("click",()=>{if(doctorFilterDate)doctorFilterDate.value=doctorHomeDateFilter.value;if(doctorFilterQuery)doctorFilterQuery.value=doctorHomeSearch.value;doctorScheduleFilterDialog?.showModal()});doctorFilterMode?.addEventListener("change",()=>{const search=doctorFilterMode.value==="search";$("#doctorFilterDateLabel").hidden=search;$("#doctorFilterQueryLabel").hidden=!search});$("#applyDoctorScheduleFilter")?.addEventListener("click",()=>{if(doctorFilterMode.value==="date"){doctorHomeDateFilter.value=doctorFilterDate.value||doctorHomeDateFilter.value;doctorHomeSearch.value=""}else{doctorHomeSearch.value=doctorFilterQuery.value.trim()}doctorScheduleFilterDialog.close();renderDailyAppointments()});homeAddBookingButton?.addEventListener("click",()=>{showBookingSection(true);if(bookingCreateCard)bookingCreateCard.hidden=false;const date=$("#newBookingDate");if(date)date.value=doctorHomeDateFilter.value;bookingCreateCard?.scrollIntoView({behavior:"smooth",block:"start"})});function showDoctorArchive(){if(doctorAccountsSection)doctorAccountsSection.hidden=true;homeAppointmentsSection.hidden=true;bookingManagementSection.hidden=true;patientManagementSection.hidden=true;employeeManagementSection.hidden=true;doctorArchiveSection.hidden=false;for(const b of document.querySelectorAll(".dashboard-tab"))b.setAttribute("aria-selected",String(b===openArchiveTabButton));renderDoctorArchive()}openArchiveTabButton?.addEventListener("click",showDoctorArchive);setInterval(()=>{const editing=!!document.querySelector("#bookingManagementSection .booking-request-details:not([hidden]),#bookingManagementSection .booking-create-card:not([hidden])")||document.activeElement?.matches("input,select,textarea");if(auth.currentUser&&!document.hidden&&!isLoadingBookings&&!editing)loadBookings()},20000);document.addEventListener("visibilitychange",()=>{const editing=!!document.querySelector("#bookingManagementSection .booking-request-details:not([hidden]),#bookingManagementSection .booking-create-card:not([hidden])")||document.activeElement?.matches("input,select,textarea");if(!document.hidden&&auth.currentUser&&!editing)loadBookings()});
showLogin();
