
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
const pendingBookingBadge = $("#pendingBookingBadge");
const doctorQueueDialog = $("#doctorQueueDialog");
const doctorQueueNumber = $("#doctorQueueNumber");
const doctorQueueDialogDone = $("#doctorQueueDialogDone");
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
const doctorArchiveToDateFilter = $("#doctorArchiveToDateFilter");
const exportClinicExcelButton = $("#exportClinicExcelButton");
const archiveExportMessage = $("#archiveExportMessage");
const doctorArchiveList = $("#doctorArchiveList");
const doctorArchiveSearch = $("#doctorArchiveSearch");
const homeAddBookingButton = $("#homeAddBookingButton");
const dailyAppointmentsList = $("#dailyAppointmentsList");
const dailyAppointmentsMessage = $("#dailyAppointmentsMessage");
const doctorAccountsSection=$("#doctorAccountsSection"),openAccountsTabButton=$("#openAccountsTabButton"),doctorAccountsContent=$("#doctorAccountsContent"),accountsDateLabel=$("#accountsDateLabel"),doctorStatusLegend=$("#doctorStatusLegend"),archiveSelectedAppointments=$("#archiveSelectedAppointments");let activeStatusFilter="all";
const accountsSubtabs=$("#doctorAccountsSubtabs"),patientDailyAccountsPanel=$("#patientDailyAccountsPanel"),salaryAccountsPanel=$("#salaryAccountsPanel"),customAccountsPanel=$("#customAccountsPanel"),salaryEntriesList=$("#salaryEntriesList"),customAccountEntriesList=$("#customAccountEntriesList"),salaryEntryForm=$("#salaryEntryForm"),customAccountEntryForm=$("#customAccountEntryForm"),accountsCategoryForm=$("#accountsCategoryForm"),doctorAccountsDate=$("#doctorAccountsDate"),doctorDailyExpenseForm=$("#doctorDailyExpenseForm"),doctorDailyExpensesList=$("#doctorDailyExpensesList"),doctorDailyExpenseMessage=$("#doctorDailyExpenseMessage"),doctorDailyNetTotal=$("#doctorDailyNetTotal"),doctorAccountsMonth=$("#doctorAccountsMonth"),doctorSettlementEmployee=$("#doctorSettlementEmployee"),finalizeDailySettlementButton=$("#finalizeDailySettlement"),finalizeMonthlySettlementButton=$("#finalizeMonthlySettlement"),doctorSettlementMessage=$("#doctorSettlementMessage"),doctorMonthlyExpensesList=$("#doctorMonthlyExpensesList"),doctorSettlementsList=$("#doctorSettlementsList");let doctorDailyExpenses=[],doctorAccountCategories=[],doctorAccountEntries=[],doctorAccountRecords=[],activeDoctorAccountSubtab="patients";
const createBookingForm = $("#createBookingForm");
const createBookingButton = $("#createBookingButton");
const createBookingMessage = $("#createBookingMessage");
const openPatientsButton = $("#openPatientsButton");
const backFromPatientsButton = $("#backFromPatientsButton");
const patientManagementSection = $("#patientManagementSection");
const medicalRecordsSection = $("#medicalRecordsSection");
const openMedicalRecordsButton = $("#openMedicalRecordsButton");
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
const employeeExpenseModeInput = $("#employeeExpenseMode");
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
  if (medicalRecordsSection && button !== openMedicalRecordsButton) medicalRecordsSection.hidden = true;
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
async function medicalRecordsApiRequest(action,data={}){const user=auth.currentUser;if(!user)throw new Error("انتهت جلسة الدخول.");const response=await fetch("/api/doctor/medical-records",{method:"POST",headers:{Authorization:`Bearer ${await user.getIdToken()}`,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({action,...data}),cache:"no-store"});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.message||"تعذر الوصول إلى السجل الطبي.");return result}
async function accountsApiRequest(action,data={}){const user=auth.currentUser;if(!user)throw new Error("انتهت جلسة الدخول.");const response=await fetch("/api/doctor/accounts",{method:"POST",headers:{Authorization:`Bearer ${await user.getIdToken()}`,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({action,...data}),cache:"no-store"});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.message||"تعذر تنفيذ عملية الحسابات.");return result}
function renderAccountEntries(container,rows,kind){if(!container)return;container.replaceChildren();if(!rows.length){container.textContent="لا توجد حركات مسجلة في هذا القسم.";return}const table=document.createElement("table");table.className="accounts-table";const head=document.createElement("thead");head.innerHTML="<tr><th>التاريخ</th><th>البيان</th><th>القيمة</th><th>ملاحظات</th></tr>";table.append(head);const body=document.createElement("tbody");let total=0;for(const item of rows.slice().sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")))){const amount=Number(item.amount)||0;total+=amount;const tr=document.createElement("tr");for(const value of [formatRequestDate(item.date),item.personName||"—",doctorMoney(amount),item.notes||"—"]){const td=document.createElement("td");td.textContent=value;tr.append(td)}body.append(tr)}table.append(body);const totalBox=document.createElement("div");totalBox.className="accounts-total";const label=document.createElement("span");label.textContent=kind==="expense"?"إجمالي المصروفات المسجلة":"إجمالي الدخل المسجل";const amount=document.createElement("strong");amount.textContent=doctorMoney(total);totalBox.append(label,amount);container.append(table,totalBox)}
function setDoctorAccountsSubtab(key){activeDoctorAccountSubtab=key;for(const button of accountsSubtabs.querySelectorAll("[data-account-subtab]"))button.setAttribute("aria-selected",String(button.dataset.accountSubtab===key));patientDailyAccountsPanel.hidden=key!=="patients";salaryAccountsPanel.hidden=key!=="salaries";customAccountsPanel.hidden=!key.startsWith("custom:");if(key==="patients")renderDoctorAccounts();if(key==="salaries")renderAccountEntries(salaryEntriesList,doctorAccountEntries.filter(x=>x.type==="entry"&&x.categoryId==="employee-salaries"),"expense");if(key.startsWith("custom:")){const category=doctorAccountCategories.find(x=>x.id===key.slice(7));if(category){$("#customAccountTitle").textContent=category.name+" · "+(category.kind==="income"?"دخل":"مصروف");renderAccountEntries(customAccountEntriesList,doctorAccountEntries.filter(x=>x.type==="entry"&&x.categoryId===category.id),category.kind)}}}
function renderDoctorAccountsSubtabs(){if(!accountsSubtabs)return;accountsSubtabs.replaceChildren();const tabs=[{id:"patients",label:"حسابات المرضى"},{id:"salaries",label:"مرتبات الموظفين"},...doctorAccountCategories.map(x=>({id:"custom:"+x.id,label:x.name+" · "+(x.kind==="income"?"دخل":"مصروف")}))];for(const item of tabs){const b=document.createElement("button");b.type="button";b.className="accounts-subtab";b.dataset.accountSubtab=item.id;b.textContent=item.label;b.setAttribute("aria-selected",String(item.id===activeDoctorAccountSubtab));b.addEventListener("click",()=>{if(item.id.startsWith("custom:")){activeDoctorAccountSubtab="custom:"+item.id.slice(7);for(const x of accountsSubtabs.querySelectorAll("[data-account-subtab]"))x.setAttribute("aria-selected",String(x.dataset.accountSubtab===activeDoctorAccountSubtab));patientDailyAccountsPanel.hidden=true;salaryAccountsPanel.hidden=true;customAccountsPanel.hidden=false;const category=doctorAccountCategories.find(x=>x.id===item.id.slice(7));$("#customAccountTitle").textContent=category?category.name+" · "+(category.kind==="income"?"دخل":"مصروف"):"قسم الحسابات";renderAccountEntries(customAccountEntriesList,doctorAccountEntries.filter(x=>x.type==="entry"&&x.categoryId===item.id.slice(7)),category?.kind||"income")}else setDoctorAccountsSubtab(item.id)});accountsSubtabs.append(b)}if(!tabs.some(x=>x.id===activeDoctorAccountSubtab))activeDoctorAccountSubtab="patients";setDoctorAccountsSubtab(activeDoctorAccountSubtab)}
async function loadDoctorAccountRecords(){try{const result=await accountsApiRequest("list");doctorAccountCategories=Array.isArray(result.categories)?result.categories:[];doctorAccountEntries=Array.isArray(result.entries)?result.entries:[];doctorAccountRecords=Array.isArray(result.records)?result.records:[];renderDoctorAccountsSubtabs()}catch(error){showMessage($("#dashboardMessage"),error.message||"تعذر تحميل الحسابات.")}}
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
    if (field === "weight") { input.type="number"; input.min="0"; input.max="500"; input.step="0.1"; input.inputMode="decimal"; }
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
  fields.append(createBookingInput("اسم المريضة",booking.patientName,"patientName"),createBookingInput("رقم الهاتف",booking.patientPhone,"patientPhone","tel"),createBookingInput("الموعد",String(booking.appointmentDate||"").slice(0,10),"appointmentDate","date"),createBookingInput("الخدمة",booking.service,"service"),createBookingInput("قيمة الخدمة (جنيه)",booking.servicePrice,"servicePrice","number"),createBookingInput("ضغط الدم",booking.bloodPressure,"bloodPressure"),createBookingInput("الوزن (كجم)",booking.weight,"weight","number"),createBookingInput("قياس السكر",booking.bloodSugar,"bloodSugar"),createBookingInput("ملاحظات الموظف قبل الكشف",booking.preVisitNotes,"preVisitNotes"),createBookingInput("ملاحظات الحجز",booking.notes,"notes"),createBookingInput("حالة الحجز",normalizedStatus(booking.status),"status","select"));
  const actions=document.createElement("div");actions.className="booking-card-actions";
  const actionItems=[["save-booking","حفظ التعديلات","secondary-button"]];
  if(booking.status==="pending")actionItems.push(["confirm-booking","تأكيد الحجز","primary-button"],["archive-booking","نقل إلى الأرشيف","secondary-button"]);
  if(["pending","confirmed"].includes(booking.status))actionItems.push(["cancel-booking","إلغاء الحجز","secondary-button"]);
  for(const [action,label,cls] of actionItems){const button=document.createElement("button");button.type="button";button.className=cls;button.dataset.action=action;button.textContent=label;actions.append(button)}
  details.append(fields,actions);summary.addEventListener("click",()=>{details.hidden=!details.hidden});card.append(summary,details);return card;
}
function formatRequestDate(value){if(!value)return"التاريخ غير محدد";const date=new Date(`${String(value).slice(0,10)}T12:00:00`);return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat("ar-EG",{weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"}).format(date)}
function formatSubmittedAt(value){if(!value)return"وقت الطلب غير متاح";const date=new Date(value);return Number.isNaN(date.getTime())?"وقت الطلب غير متاح":new Intl.DateTimeFormat("ar-EG",{dateStyle:"medium",timeStyle:"short"}).format(date)}
function parseRescheduleHistory(booking){try{const value=JSON.parse(booking.rescheduleHistory||"[]");return Array.isArray(value)?value.filter(item=>item&&/^\d{4}-\d{2}-\d{2}$/.test(item.fromDate||"")&&/^\d{4}-\d{2}-\d{2}$/.test(item.toDate||"")):[]}catch{return[]}}
function queueNumberForDate(booking,date){if(!date)return"—";const rows=allBookings.filter(item=>String(item.appointmentDate||"").slice(0,10)===date||parseRescheduleHistory(item).some(entry=>entry.fromDate===date)).sort((x,y)=>(Date.parse(x.createdAt||"")||0)-(Date.parse(y.createdAt||"")||0));const index=rows.findIndex(item=>item.id===booking.id);return index<0?"—":index+1}
function queueNumberFor(booking){const date=String(booking.appointmentDate||"").slice(0,10);if(!date)return"—";const rows=allBookings.filter(item=>String(item.appointmentDate||"").slice(0,10)===date).sort((x,y)=>(Date.parse(x.createdAt||"")||0)-(Date.parse(y.createdAt||"")||0));const index=rows.findIndex(item=>item.id===booking.id);return index<0?"—":index+1}
function renderRescheduleNotice(booking,entry){const card=document.createElement("article");card.className="employee-card schedule-booking-card reschedule-notice-card";const title=document.createElement("strong");title.textContent=queueNumberForDate(booking,entry.fromDate)+" · "+(booking.patientName||"المريضة");const note=document.createElement("p");note.className="reschedule-notice-text";note.textContent=`تم نقل موعد كشف المريضة إلى ${formatRequestDate(entry.toDate)} · رقم الدور ${queueNumberForDate(booking,entry.fromDate)}`;const meta=document.createElement("small");meta.textContent=`${booking.patientPhone||"الهاتف غير مسجل"} · ${booking.service||"الخدمة غير محددة"}`;card.append(title,note,meta);return card}
const BOOKING_STATUS_OPTIONS=[["waiting","في الانتظار"],["completed","تم الكشف"],["postponed","تم التأجيل"],["no_show","لم يأتِ"],["apologized","اعتذر"]];
const ARCHIVE_STATUSES=new Set(["archived","cancelled"]);
function normalizedStatus(status){return status==="confirmed"?"waiting":status}
function bookingStatusLabel(status){return({pending:"قيد المراجعة",confirmed:"في الانتظار",waiting:"في الانتظار",completed:"تم الكشف",postponed:"تم التأجيل",no_show:"لم يأتِ",apologized:"اعتذر",cancelled:"ملغي"})[status]||"غير محدد"}
async function changeBookingStatus(booking,status,control){if(!["waiting","completed","postponed","no_show","apologized"].includes(status))return;if(control)control.disabled=true;try{await bookingApiRequest("update",{booking:{id:booking.id,status}});showMessage(bookingListMessage,"تم تحديث حالة الحجز.","success");await loadBookings()}catch(error){showMessage(bookingListMessage,error.message||"تعذر تحديث حالة الحجز.");if(control)control.value=normalizedStatus(booking.status)}finally{if(control)control.disabled=false}}
function applyStatusColor(el,status){for(const name of ["waiting","completed","postponed","no_show","apologized","pending","archived","cancelled"])el.classList.remove(`status-${name}`);el.classList.add(`status-${status||"waiting"}`)}function makeStatusSelect(booking){const select=document.createElement("select");select.className="booking-status-select";select.setAttribute("aria-label",`حالة حجز ${booking.patientName||""}`);for(const[value,label]of BOOKING_STATUS_OPTIONS){const option=document.createElement("option");option.value=value;option.textContent=label;option.className=`status-option-${value}`;select.append(option)}select.value=normalizedStatus(booking.status)||"waiting";applyStatusColor(select,select.value);select.addEventListener("change",()=>{applyStatusColor(select,select.value);changeBookingStatus(booking,select.value,select)});return select}
function renderScheduleCard(booking,archived=false){const card=renderBookingCard(booking);card.classList.add("schedule-booking-card");applyStatusColor(card,normalizedStatus(booking.status));const meta=card.querySelector(".booking-request-main small");if(meta)meta.textContent=queueNumberFor(booking)+" · الموعد: "+formatRequestDate(booking.appointmentDate)+" · "+(booking.patientPhone||"الهاتف غير مسجل")+" · "+(booking.service||"الخدمة غير محددة")+" · الضغط: "+(booking.bloodPressure||"—")+" · الوزن: "+(booking.weight?booking.weight+" كجم":"—")+" · السكر: "+(booking.bloodSugar||"—")+(booking.preVisitNotes?" · ملاحظة قبل الكشف: "+booking.preVisitNotes:"");if(!archived){card.querySelector(".booking-request-badge")?.remove();const controls=document.createElement("div");controls.className="schedule-card-controls";const edit=document.createElement("button");edit.type="button";edit.className="edit-booking-button";edit.textContent="✎";edit.title="تعديل بيانات الحجز";edit.setAttribute("aria-label","تعديل حجز "+(booking.patientName||"المريضة"));edit.addEventListener("click",()=>{const details=card.querySelector(".booking-request-details");if(details){details.hidden=false;details.querySelector("input,select,textarea")?.focus()}});controls.append(edit,makeStatusSelect(booking));card.prepend(controls)}return card}

function renderDailyAppointments(){dailyAppointmentsList.replaceChildren();const day=doctorHomeDateFilter?.value||new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());const mode=doctorFilterMode?.value||"date",query=(doctorHomeSearch?.value||"").trim().toLocaleLowerCase("ar");if(doctorScheduleDateLabel)doctorScheduleDateLabel.textContent=mode==="search"?"نتائج البحث":formatRequestDate(day);const rows=allBookings.filter(b=>!["pending","archived","cancelled"].includes(b.status)&&((mode==="search"&&query)||String(b.appointmentDate||"").slice(0,10)===day)&&(!query||(String(b.patientName||"")+" "+String(b.patientPhone||"")+" "+String(b.service||"")).toLocaleLowerCase("ar").includes(query))&&(activeStatusFilter==="all"||normalizedStatus(b.status)===activeStatusFilter)).sort((a,b)=>String(a.appointmentDate||"").localeCompare(String(b.appointmentDate||""))||queueNumberFor(a)-queueNumberFor(b));const notices=mode==="date"?allBookings.flatMap(b=>parseRescheduleHistory(b).filter(h=>h.fromDate===day).map(entry=>({booking:b,entry}))):[];if(!rows.length&&!notices.length){const empty=document.createElement("div");empty.className="empty-employees";empty.textContent=mode==="search"?"لا توجد نتائج مطابقة للبحث.":`لا توجد مواعيد في ${formatRequestDate(day)}.`;dailyAppointmentsList.append(empty)}else{for(const booking of rows)dailyAppointmentsList.append(renderScheduleCard(booking));for(const item of notices)dailyAppointmentsList.append(renderRescheduleNotice(item.booking,item.entry))}renderDoctorAccounts();if(archiveSelectedAppointments)archiveSelectedAppointments.disabled=mode!=="date"||!allBookings.some(b=>String(b.appointmentDate||"").slice(0,10)===day&& !["pending","archived","cancelled"].includes(b.status))}
function renderDoctorArchive(){if(!doctorArchiveList)return;doctorArchiveList.replaceChildren();const from=doctorArchiveDateFilter?.value||"",to=doctorArchiveToDateFilter?.value||"",query=(doctorArchiveSearch?.value||"").trim().toLocaleLowerCase("ar");const rows=allBookings.filter(b=>ARCHIVE_STATUSES.has(b.status)).filter(b=>{const date=String(b.appointmentDate||"").slice(0,10);return(!from||date>=from)&&(!to||date<=to)&&(!query||`${b.patientName||""} ${b.patientPhone||""} ${b.service||""}`.toLocaleLowerCase("ar").includes(query))}).sort((a,b)=>(Date.parse(b.updatedAt||b.createdAt||"")||0)-(Date.parse(a.updatedAt||a.createdAt||"")||0));if(!rows.length){const empty=document.createElement("div");empty.className="empty-employees";empty.textContent="لا توجد حجوزات أو طلبات مؤرشفة حسب الفلتر الحالي.";doctorArchiveList.append(empty);return}for(const booking of rows)doctorArchiveList.append(renderScheduleCard(booking,true))}
function excelXmlEscape(value){return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;")}
function excelCell(value,header=false){const raw=String(value??"");const style=header?' ss:StyleID="Header"':"";if(!header&&raw.trim()!==""&&/^-?\d+(?:\.\d+)?$/.test(raw.trim()))return `<Cell${style}><Data ss:Type="Number">${Number(raw.trim())}</Data></Cell>`;return `<Cell${style}><Data ss:Type="String">${excelXmlEscape(raw)}</Data></Cell>`}
function excelSheet(name,headers,rows){const all=[headers,...rows];return `<Worksheet ss:Name="${excelXmlEscape(name)}"><Table>${all.map((row,index)=>`<Row>${row.map(value=>excelCell(value,index===0)).join("")}</Row>`).join("")}</Table></Worksheet>`}
async function exportClinicExcel(){if(!exportClinicExcelButton)return;const from=doctorArchiveDateFilter?.value||"",to=doctorArchiveToDateFilter?.value||"";if(from&&to&&from>to){showMessage(archiveExportMessage,"تاريخ البداية يجب أن يكون قبل تاريخ النهاية أو مساويًا له.");return}exportClinicExcelButton.disabled=true;hideMessage(archiveExportMessage);try{const [accountResult,patientResult]=await Promise.all([accountsApiRequest("list"),patientApiRequest("list")]);doctorAccountRecords=Array.isArray(accountResult.records)?accountResult.records:[];const patientProfiles=Array.isArray(patientResult.patients)?patientResult.patients:[];const inPeriod=date=>{const value=String(date||"").slice(0,10);return(!from||value>=from)&&(!to||value<=to)};const patientBookings=allBookings.filter(b=>inPeriod(b.appointmentDate)).sort((a,b)=>String(a.appointmentDate||"").localeCompare(String(b.appointmentDate||"")));const accountRows=[...doctorAccountRecords.filter(r=>{if(r.type==="category")return true;if(r.periodType==="month"&&r.periodKey){const month=String(r.periodKey).slice(0,7);return(!from||month>=from.slice(0,7))&&(!to||month<=to.slice(0,7))}return inPeriod(r.date||r.periodKey)}),...patientBookings.filter(b=>Number(b.paidAmount)>0).map(b=>({id:"booking-receipt-"+b.id,type:"bookingReceipt",date:String(b.appointmentDate||"").slice(0,10),personName:b.patientName||"",amount:b.paidAmount,notes:[b.service?"الخدمة: "+b.service:"",b.notes||""].filter(Boolean).join(" | "),status:b.status||"",employeeUid:b.paymentEnteredByUid||"",employeeName:b.paymentEnteredByName||"",bookingId:b.id,servicePrice:b.servicePrice||"",paymentUpdatedAt:b.paymentUpdatedAt||""}))];const patientHeaders=["معرّف حساب المريضة","نوع الحساب","اسم المريضة في الحساب","هاتف الحساب","البريد الإلكتروني","اسم المستخدم","حالة الحساب","تاريخ إنشاء الحساب","آخر تحديث للحساب","معرّف الحجز","اسم المريضة في الحجز","هاتف الحجز","تاريخ الموعد","الخدمة","قيمة الكشف","المبلغ المسجل بالحسابات","حالة الحجز","ملاحظات الحجز","تاريخ إنشاء الطلب","آخر تحديث للحجز","معرّف الموظف المسجل للمبلغ","اسم الموظف المسجل للمبلغ","تاريخ تسجيل المبلغ","سجل نقل المواعيد"];const normalizePhoneForExport=value=>{let digits=String(value||"").replace(/\D/g,"");if(digits.startsWith("0020")&&digits.length===14)digits="0"+digits.slice(4);else if(digits.startsWith("20")&&digits.length===12)digits="0"+digits.slice(2);return digits};const profileByPhone=new Map();for(const profile of patientProfiles){const key=normalizePhoneForExport(profile.phone);if(key)profileByPhone.set(key,profile)}const profileValues=profile=>[profile.uid||"",profile.role||"",profile.displayName||"",profile.phone||"",profile.email||"",profile.username||"",profile.uid?(profile.active===true?"نشط":"غير نشط"):"لا يوجد حساب بوابة",profile.createdAt||"",profile.updatedAt||""];const bookingValues=b=>[b.id||"",b.patientName||"",b.patientPhone||"",b.appointmentDate||"",b.service||"",b.servicePrice||"",b.paidAmount||"",b.status||"",b.notes||"",b.createdAt||"",b.updatedAt||"",b.paymentEnteredByUid||"",b.paymentEnteredByName||"",b.paymentUpdatedAt||"",b.rescheduleHistory||""];const patientRows=patientBookings.map(b=>{const profile=profileByPhone.get(normalizePhoneForExport(b.patientPhone))||{};return[...profileValues(profile),...bookingValues(b)]});if(!from&&!to){for(const profile of patientProfiles){const phone=normalizePhoneForExport(profile.phone);if(!phone||!allBookings.some(b=>normalizePhoneForExport(b.patientPhone)===phone))patientRows.push([...profileValues(profile),...Array(15).fill("")])}}const accountKeys=[...new Set(["id","type","name","kind","date","personName","amount","notes","status","bookingId","servicePrice","paymentUpdatedAt","enteredBy","enteredByName","approvedBy","approvedByName","approvedAt","createdAt","updatedAt","categoryId","periodType","periodKey","employeeUid","employeeName","closedBy","closedByName","closedAt","totalReceipts","totalExpenses","netTotal","bookingCount",...accountRows.flatMap(r=>Object.keys(r))])];const accountLabels={id:"معرّف السجل",type:"نوع السجل",bookingReceipt:"مقبوضات الحجوزات",bookingId:"معرّف الحجز",servicePrice:"قيمة الكشف",paymentUpdatedAt:"تاريخ تسجيل المبلغ",name:"اسم القسم",kind:"نوع الحساب",date:"التاريخ",personName:"البيان",amount:"المبلغ",notes:"ملاحظات",status:"الحالة",enteredBy:"معرّف من سجل",enteredByName:"اسم من سجل",approvedBy:"معرّف المعتمد",approvedByName:"اسم المعتمد",approvedAt:"تاريخ الاعتماد",createdAt:"تاريخ الإنشاء",updatedAt:"آخر تحديث",categoryId:"معرّف القسم",periodType:"نوع الفترة",periodKey:"الفترة",employeeUid:"معرّف الموظف",employeeName:"اسم الموظف",closedBy:"معرّف من أقفل الفترة",closedByName:"اسم من أقفل الفترة",closedAt:"تاريخ الإقفال",totalReceipts:"إجمالي المقبوضات",totalExpenses:"إجمالي المصروفات",netTotal:"الصافي",bookingCount:"عدد الحجوزات"};const accountHeaders=accountKeys.map(key=>accountLabels[key]||key);const accountData=accountRows.map(r=>accountKeys.map(key=>r[key]??""));const filename="تقرير_العيادة_"+(from||"كل_الفترة")+"_"+(to||"حتى_الآن");if(window.XLSX){const workbook=window.XLSX.utils.book_new();const accountSheet=window.XLSX.utils.aoa_to_sheet([accountHeaders,...accountData]);const patientSheet=window.XLSX.utils.aoa_to_sheet([patientHeaders,...patientRows]);window.XLSX.utils.book_append_sheet(workbook,accountSheet,"الحسابات");window.XLSX.utils.book_append_sheet(workbook,patientSheet,"المرضى");window.XLSX.writeFile(workbook,filename+".xlsx",{compression:true})}else{const workbookXml='<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Header"><Font ss:Bold="1"/></Style></Styles>'+excelSheet("الحسابات",accountHeaders,accountData)+excelSheet("المرضى",patientHeaders,patientRows)+"</Workbook>";const blob=new Blob(["\ufeff",workbookXml],{type:"application/vnd.ms-excel;charset=utf-8"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=filename+".xls";document.body.append(link);link.click();link.remove();}showMessage(archiveExportMessage,`تم تجهيز ملف Excel: ${patientRows.length} سجل مريضة وحجز و${accountRows.length} سجل حسابات.`,"success")}catch(error){console.error("Excel export failed:",error);showMessage(archiveExportMessage,error.message||"تعذر استخراج ملف Excel.")}finally{exportClinicExcelButton.disabled=false}}function doctorMoney(v){return new Intl.NumberFormat("ar-EG",{style:"currency",currency:"EGP",maximumFractionDigits:2}).format(Number(v)||0)}
function renderDoctorAccounts(){if(!doctorAccountsContent)return;const day=doctorAccountsDate?.value||doctorHomeDateFilter?.value||new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());if(doctorAccountsDate&&!doctorAccountsDate.value)doctorAccountsDate.value=day;if(accountsDateLabel)accountsDateLabel.textContent=formatRequestDate(day);const rows=allBookings.filter(b=>String(b.appointmentDate||"").slice(0,10)===day&&(b.status!=="pending"||Number(b.paidAmount)>0)).sort((a,b)=>queueNumberFor(a)-queueNumberFor(b));doctorAccountsContent.replaceChildren();let total=0;const table=document.createElement("table");table.className="accounts-table";const head=document.createElement("thead");head.innerHTML="<tr><th>المريضة</th><th>الخدمة</th><th>سعر الخدمة</th><th>المدفوع الفعلي</th><th>استلمه</th><th>الحالة</th></tr>";table.append(head);const body=document.createElement("tbody");for(const b of rows){const tr=document.createElement("tr"),price=Number(b.servicePrice)||0,paid=Number(b.paidAmount)||0;total+=paid;const vals=[b.patientName||"—",b.service||"غير محددة",doctorMoney(price),doctorMoney(paid),b.paymentEnteredByName||"غير منسوب لموظف",bookingStatusLabel(b.status)];for(let i=0;i<vals.length;i++){const td=document.createElement("td");td.textContent=vals[i];if(i===4)td.className=b.status==="completed"?"accounts-status-completed":"accounts-status-other";tr.append(td)}body.append(tr)}if(!rows.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=6;td.textContent="لا توجد حجوزات في هذا اليوم.";tr.append(td);body.append(tr)}table.append(body);const box=document.createElement("div");box.className="accounts-total";const label=document.createElement("span");label.textContent="إجمالي المقبوضات لهذا اليوم";const amount=document.createElement("strong");amount.textContent=doctorMoney(total);box.append(label,amount);doctorAccountsContent.append(table,box);loadDoctorDailyExpenses(day,total)}
async function loadDoctorDailyExpenses(day,paidTotal=0){
  try {
    const result=await accountsApiRequest("listDailyExpenses",{date:day});
    doctorDailyExpenses=Array.isArray(result.expenses)?result.expenses:[];
    const approvedTotal=doctorDailyExpenses.filter(x=>(x.status||"approved")==="approved").reduce((sum,x)=>sum+(Number(x.amount)||0),0);
    if(doctorDailyExpensesList){
      doctorDailyExpensesList.replaceChildren();
      if(!doctorDailyExpenses.length){const p=document.createElement("p");p.className="muted-text";p.textContent="لا توجد مصروفات مسجلة لهذا اليوم.";doctorDailyExpensesList.append(p)}
      for(const item of doctorDailyExpenses){
        const row=document.createElement("div");row.className="doctor-daily-expense-row";
        const details=document.createElement("div");
        const description=document.createElement("strong");description.textContent=item.description+(item.notes?" · "+item.notes:"");
        const meta=document.createElement("p");meta.className="muted-text";meta.textContent="سجله: "+(item.enteredByName||"غير محدد")+" · "+({pending:"بانتظار اعتماد الدكتور",approved:"معتمد ومحتسب",rejected:"مرفوض وغير محتسب"}[item.status||"approved"]||"غير محدد")+(item.approvedByName?" · اعتمده: "+item.approvedByName:"")+(item.reviewedByName?" · راجعه: "+item.reviewedByName:"")+(item.reviewedAt?" · "+formatSubmittedAt(item.reviewedAt):"")+(item.rejectionReason?" · سبب الرفض: "+item.rejectionReason:"");
        details.append(description,meta);
        const amount=document.createElement("strong");amount.textContent=(item.status==="rejected"?"": "− ")+doctorMoney(Number(item.amount)||0);
        row.append(details,amount);
        if(item.status==="pending"){
          const actions=document.createElement("div");actions.className="booking-card-actions";
          for(const [action,label,cls] of [["approveDailyExpense","اعتماد وخصم","primary-button"],["rejectDailyExpense","رفض","secondary-button"]]){
            const button=document.createElement("button");button.type="button";button.className=cls;button.textContent=label;
            button.addEventListener("click",async()=>{
              let reason="";
              if(action==="rejectDailyExpense"){reason=window.prompt("سبب رفض المصروف (اختياري):","")||"";if(reason.length>300){showMessage(doctorSettlementMessage,"سبب الرفض يجب ألا يتجاوز 300 حرف.");return}}
              button.disabled=true;
              try{await accountsApiRequest(action,{id:item.id,reason});showMessage(doctorSettlementMessage,action==="approveDailyExpense"?"تم اعتماد المصروف واحتسابه.":"تم رفض المصروف ولن يُخصم.","success");await renderDoctorAccounts();await loadDoctorSettlements()}
              catch(error){showMessage(doctorSettlementMessage,error.message||"تعذر معالجة المصروف.")}
              finally{button.disabled=false}
            });
            actions.append(button);
          }
          row.append(actions);
        }
        doctorDailyExpensesList.append(row);
      }
    }
    if(doctorDailyNetTotal)doctorDailyNetTotal.textContent=doctorMoney(paidTotal-approvedTotal);
    await loadDoctorSettlements();
  } catch(error){showMessage(doctorDailyExpenseMessage,error.message||"تعذر تحميل مصروفات اليوم.")}
}
let settlementPreviewPeriodType = "day";
async function previewDoctorSettlement(periodType = settlementPreviewPeriodType) {
  settlementPreviewPeriodType = periodType;
  const preview = $("#doctorSettlementPreview");
  const employeeUid = doctorSettlementEmployee?.value || "";
  if (periodType === "month" && doctorAccountsMonth && !doctorAccountsMonth.value) doctorAccountsMonth.value = (doctorAccountsDate?.value || doctorHomeDateFilter?.value || "").slice(0, 7);
  const periodKey = periodType === "month" ? (doctorAccountsMonth?.value || "") : (doctorAccountsDate?.value || doctorHomeDateFilter?.value || "");
  const settleButton = periodType === "month" ? finalizeMonthlySettlementButton : finalizeDailySettlementButton;
  if (settleButton) settleButton.disabled = !employeeUid || !periodKey;
  if (!preview) return;
  if (!employeeUid || !periodKey) {
    preview.textContent = "اختر الموظف والفترة لعرض قيمة العهدة المتوقعة.";
    return;
  }
  preview.textContent = "جارٍ حساب عهدة الموظف...";
  try {
    const result = await accountsApiRequest("previewSettlement", { periodType, periodKey, employeeUid });
    const receipts = doctorMoney(result.totalReceipts), expenses = doctorMoney(result.totalExpenses), net = doctorMoney(result.netTotal);
    if (result.alreadySettled) {
      preview.textContent = "تمت تصفية هذه الفترة بالفعل. الرصيد الحالي للعهدة: 0 ج.م. صافي التصفية السابقة: " + doctorMoney(result.settlement?.netTotal);
      if (settleButton) settleButton.disabled = true;
    } else {
      preview.textContent = "العهدة المتوقعة للموظف: المقبوضات " + receipts + " − المصروفات المعتمدة " + expenses + " = صافي العهدة " + net + (Number(result.netTotal) < 0 ? " (مستحق للموظف من العيادة)." : " (مستحق للعيادة من الموظف).") + (result.previouslySettledDays ? " تم استبعاد " + result.previouslySettledDays + " يوم تمت تصفيته مسبقًا." : "") + (result.pendingExpenses ? " يوجد " + result.pendingExpenses + " مصروف معلق يجب اعتماده أو رفضه قبل التصفية." : "");
      if (settleButton) settleButton.disabled = Number(result.pendingExpenses) > 0;
    }
  } catch (error) {
    preview.textContent = error.message || "تعذر حساب عهدة الموظف.";
  }
}
async function loadSettlementEmployees(){
  if(!doctorSettlementEmployee)return;
  const selected=doctorSettlementEmployee.value;
  try{
    const result=await employeeApiRequest("list");
    const employees=(Array.isArray(result.employees)?result.employees:[]).filter(x=>x.uid);
    doctorSettlementEmployee.replaceChildren();
    const placeholder=document.createElement("option");placeholder.value="";placeholder.textContent="اختر الموظف";doctorSettlementEmployee.append(placeholder);
    for(const employee of employees){const option=document.createElement("option");option.value=employee.uid;option.textContent=employee.displayName||employee.email||employee.uid;doctorSettlementEmployee.append(option)}
    if(employees.some(x=>x.uid===selected))doctorSettlementEmployee.value=selected;
    if(!employees.length)showMessage(doctorSettlementMessage,"أنشئ حساب موظف أولًا حتى تتمكن من تصفية عهدته.");
    else await previewDoctorSettlement(settlementPreviewPeriodType);
  }catch(error){showMessage(doctorSettlementMessage,error.message||"تعذر تحميل الموظفين لتصفية العهدة.")}
}
async function loadDoctorSettlements(){
  try{
    const result=await accountsApiRequest("listSettlements");
    const expenses=Array.isArray(result.expenses)?result.expenses:[];
    const month=doctorAccountsMonth?.value||((doctorAccountsDate?.value||"").slice(0,7));
    if(doctorAccountsMonth&&!doctorAccountsMonth.value)doctorAccountsMonth.value=month;
    if(doctorMonthlyExpensesList){
      doctorMonthlyExpensesList.replaceChildren();
      const rows=expenses.filter(x=>String(x.date||"").startsWith(month)).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
      if(!rows.length){const p=document.createElement("p");p.className="muted-text";p.textContent="لا توجد مصروفات مسجلة لهذا الشهر.";doctorMonthlyExpensesList.append(p)}
      for(const x of rows){const row=document.createElement("div");row.className="doctor-daily-expense-row";const label=document.createElement("span");label.textContent=x.date+" · "+x.personName+" · "+({pending:"معلق",approved:"معتمد",rejected:"مرفوض"}[x.status||"approved"]||"غير محدد")+" · سجله: "+(x.enteredByName||"غير محدد")+(x.approvedByName?" · اعتمده: "+x.approvedByName:"")+(x.reviewedByName?" · راجعه: "+x.reviewedByName:"")+(x.reviewedAt?" · "+formatSubmittedAt(x.reviewedAt):"")+(x.rejectionReason?" · سبب الرفض: "+x.rejectionReason:"");const amount=document.createElement("strong");amount.textContent=doctorMoney(x.amount);row.append(label,amount);doctorMonthlyExpensesList.append(row)}
    }
    if(doctorSettlementsList){
      doctorSettlementsList.replaceChildren();
      const settlements=Array.isArray(result.settlements)?result.settlements:[];
      if(!settlements.length){const p=document.createElement("p");p.className="muted-text";p.textContent="لا توجد تصفيات سابقة.";doctorSettlementsList.append(p)}
      for(const x of settlements){const row=document.createElement("div");row.className="doctor-daily-expense-row";const label=document.createElement("span");label.textContent=(x.periodType==="month"?"تصفية شهرية":"تصفية يومية")+" · "+x.periodKey+" · الموظف: "+(x.employeeName||"غير محدد")+" · نفذها: "+(x.closedByName||"الدكتور")+" · "+(x.closedAt?formatSubmittedAt(x.closedAt):"وقت التصفية غير مسجل");const amount=document.createElement("strong");amount.textContent="المقبوضات "+doctorMoney(x.totalReceipts)+" / المصروفات "+doctorMoney(x.totalExpenses)+" / الصافي "+doctorMoney(x.netTotal);row.append(label,amount);doctorSettlementsList.append(row)}
    }
  }catch(error){showMessage(doctorSettlementMessage,error.message||"تعذر تحميل سجل التصفيات.")}
}
async function archiveDoctorDay(){const day=doctorHomeDateFilter?.value||new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());if((doctorFilterMode?.value||"date")!=="date"){showMessage(dailyAppointmentsMessage,"اختر عرض مواعيد يوم محدد قبل الأرشفة.");return}if(!window.confirm("هل تريد نقل جميع مواعيد يوم "+formatRequestDate(day)+" إلى الأرشيف؟ لن تظهر هذه المواعيد في جدول اليوم بعد الأرشفة."))return;archiveSelectedAppointments.disabled=true;try{const result=await bookingApiRequest("archiveDay",{date:day});await loadBookings();showMessage(dailyAppointmentsMessage,"تم نقل "+(result.archivedCount||0)+" حجز إلى الأرشيف.","success")}catch(e){showMessage(dailyAppointmentsMessage,e.message||"تعذر أرشفة مواعيد اليوم.")}finally{archiveSelectedAppointments.disabled=false;}}
function showDoctorAccounts(){if(doctorAccountsSection)doctorAccountsSection.hidden=false;homeAppointmentsSection.hidden=true;doctorArchiveSection.hidden=true;bookingManagementSection.hidden=true;patientManagementSection.hidden=true;employeeManagementSection.hidden=true;setActiveTab(openAccountsTabButton);if(doctorAccountsDate)doctorAccountsDate.value=doctorHomeDateFilter?.value||doctorAccountsDate.value;renderDoctorAccounts();loadDoctorAccountRecords();loadSettlementEmployees()}
function renderPendingBookings(){bookingList.replaceChildren();const query=(bookingSearchInput?.value||"").trim().toLocaleLowerCase("ar"),date=bookingDateFilter?.value||"";const rows=allBookings.filter(b=>b.status==="pending"&&(!date||String(b.appointmentDate||"").slice(0,10)===date)).filter(b=>(!query||`${b.patientName||""} ${b.patientPhone||""}`.toLocaleLowerCase("ar").includes(query)));if(!rows.length){const empty=document.createElement("div");empty.className="empty-employees";empty.textContent="لا توجد طلبات مراجعة مطابقة.";bookingList.append(empty);return}rows.forEach(b=>bookingList.append(renderBookingCard(b)))}
function updatePendingBookingBadge(){const count=allBookings.filter(b=>b.status==="pending").length;if(pendingBookingBadge){pendingBookingBadge.textContent=count>99?"99+":String(count);pendingBookingBadge.hidden=count===0;pendingBookingBadge.setAttribute("aria-label",count?`${count} طلب حجز جديد`:"لا توجد طلبات حجز جديدة");}if(openBookingsButton){openBookingsButton.classList.toggle("has-pending-bookings",count>0);openBookingsButton.setAttribute("aria-label",count?`إدارة الحجوزات، ${count} طلب حجز جديد`:"إدارة الحجوزات");openBookingsButton.title=count?`${count} طلب حجز جديد`: "إدارة الحجوزات";}}
async function loadBookings() {
  if (isLoadingBookings || !bookingList) return;
  isLoadingBookings = true;
  hideMessage(bookingListMessage); hideMessage(dailyAppointmentsMessage);
  try {
    const result = await bookingApiRequest("list");
    allBookings = Array.isArray(result.bookings) ? result.bookings : [];
    updatePendingBookingBadge();
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

  const expenseModeRow = document.createElement("div");
  expenseModeRow.className = "employee-permission-row";
  const expenseModeLabel = document.createElement("label");
  expenseModeLabel.textContent = "طريقة خصم المصروفات";
  const expenseModeSelect = document.createElement("select");
  expenseModeSelect.className = "expense-mode-select";
  expenseModeSelect.setAttribute("aria-label", "طريقة خصم مصروفات " + (employee.displayName || "الموظف"));
  for (const [value, labelText] of [["auto", "خصم تلقائي بعد التسجيل"], ["approval", "اعتماد الدكتور قبل الخصم"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labelText;
    option.selected = (employee.expenseMode === "approval" ? "approval" : "auto") === value;
    expenseModeSelect.append(option);
  }
  expenseModeRow.append(expenseModeLabel, expenseModeSelect);
  permissionsContainer.appendChild(expenseModeRow);

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "primary-button save-permissions-button";
  saveButton.dataset.action = "save-permissions";
  saveButton.textContent = "حفظ الصلاحيات والإعدادات";

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
if (openMedicalRecordsButton) openMedicalRecordsButton.addEventListener("click", async () => { if(doctorAccountsSection)doctorAccountsSection.hidden=true;if(doctorArchiveSection)doctorArchiveSection.hidden=true;if(homeAppointmentsSection)homeAppointmentsSection.hidden=true;if(employeeManagementSection)employeeManagementSection.hidden=true;if(bookingManagementSection)bookingManagementSection.hidden=true;if(patientManagementSection)patientManagementSection.hidden=true;if(medicalRecordsSection)medicalRecordsSection.hidden=false;setActiveTab(openMedicalRecordsButton); });
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


if (addBookingToggleButton && bookingCreateCard) addBookingToggleButton.addEventListener("click", () => { bookingCreateCard.hidden = !bookingCreateCard.hidden; });
createBookingForm?.querySelector(".service-quick-select")?.addEventListener("change",e=>{const input=createBookingForm.querySelector('[name="service"]');if(input&&e.target.value)input.value=e.target.value});
if (bookingSearchInput) bookingSearchInput.addEventListener("input", renderPendingBookings);
doctorDailyExpenseForm?.addEventListener("submit",async e=>{e.preventDefault();const values=Object.fromEntries(new FormData(doctorDailyExpenseForm).entries());const date=doctorAccountsDate?.value||doctorHomeDateFilter?.value||new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());const entry={date,amount:String(values.amount||"").trim(),description:String(values.description||"").trim(),notes:String(values.notes||"").trim()};const button=doctorDailyExpenseForm.querySelector('button[type="submit"]');button.disabled=true;try{const result=await accountsApiRequest("createDailyExpense",{entry});doctorDailyExpenseForm.reset();showMessage(doctorDailyExpenseMessage,result.expense?.status==="pending"?"تم تسجيل المصروف وهو بانتظار اعتماد الدكتور.":"تم تسجيل المصروف واحتسابه ضمن المصروفات المعتمدة.","success");renderDoctorAccounts()}catch(error){showMessage(doctorDailyExpenseMessage,error.message||"تعذر تسجيل المصروف.")}finally{button.disabled=false}});
if (bookingRequestsToggle && bookingRequestsPanel) bookingRequestsToggle.addEventListener("click",()=>{const open=bookingRequestsPanel.hidden;bookingRequestsPanel.hidden=!open;bookingRequestsToggle.setAttribute("aria-expanded",String(open));bookingRequestsToggle.classList.toggle("is-open",open)});
doctorQueueDialogDone?.addEventListener("click",()=>doctorQueueDialog?.close());
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
      bloodPressure: $("#newBookingBloodPressure")?.value.trim() || "",
      weight: $("#newBookingWeight")?.value.trim() || "",
      bloodSugar: $("#newBookingBloodSugar")?.value.trim() || "",
      preVisitNotes: $("#newBookingPreVisitNotes")?.value.trim() || "",
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
      const medicalPatient = await medicalRecordsApiRequest("resolve", { patientId: $("#newBookingPatientId")?.value || "", patientName: booking.patientName, patientPhone: booking.patientPhone });
      booking.patientId = medicalPatient.patient.id;
      const result = await bookingApiRequest("create", { booking });
      createBookingForm.reset();
      if (bookingCreateCard) bookingCreateCard.hidden = true;
      document.activeElement?.blur();
      await loadBookings();
      if (doctorQueueNumber) doctorQueueNumber.textContent = queueNumberFor(result.booking);
      const queueTitle = $("#doctorQueueDialogTitle");
      if (queueTitle) queueTitle.textContent = "تمت إضافة الحجز";
      if (doctorQueueDialog?.showModal) doctorQueueDialog.showModal();
      else showMessage(createBookingMessage, "تمت إضافة الحجز. رقم الدور: " + queueNumberFor(result.booking), "success");
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

async function handleBookingCardAction(event, container) {
  const button = event.target.closest('button[data-action]');
  if (!button || !container.contains(button)) return;

  const card = button.closest("[data-booking-id]");
  const id = card?.dataset.bookingId;
  if (!id) return;

  const action = button.dataset.action;
  const busyText = button.textContent;
  const previousDate = String(allBookings.find(item => item.id === id)?.appointmentDate || "").slice(0, 10);
  button.disabled = true;
  button.textContent = action === "cancel-booking" ? "جارٍ الإلغاء..." : "جارٍ الحفظ...";
  hideMessage(bookingListMessage);
  hideMessage(dailyAppointmentsMessage);

  try {
    if (action === "cancel-booking") {
      if (!window.confirm("هل تريد إلغاء طلب الحجز؟")) return;
      await bookingApiRequest("cancel", { id });
    } else if (action === "confirm-booking") {
      const booking = { id, status: "waiting" };
      for (const field of ["patientName", "patientPhone", "appointmentDate", "service", "servicePrice", "bloodPressure", "weight", "bloodSugar", "preVisitNotes", "notes", "status"]) {
        const input = card.querySelector(`[data-booking-field="${field}"]`);
        if (input) booking[field] = input.value;
      }
      booking.status = "waiting";
      const resolvedPatient = await medicalRecordsApiRequest("resolve", { patientName: booking.patientName, patientPhone: booking.patientPhone });
      booking.patientId = resolvedPatient.patient.id;
      await bookingApiRequest("update", { booking });
    } else if (action === "archive-booking") {
      await bookingApiRequest("update", { booking: { id, status: "archived" } });
    } else if (action === "save-booking") {
      const booking = { id };
      for (const field of ["patientName", "patientPhone", "appointmentDate", "service", "servicePrice", "bloodPressure", "weight", "bloodSugar", "preVisitNotes", "notes", "status"]) {
        const input = card.querySelector(`[data-booking-field="${field}"]`);
        if (input) booking[field] = input.value;
      }
      const originalBooking = allBookings.find(item => item.id === id);
      if (originalBooking && (booking.patientName !== originalBooking.patientName || booking.patientPhone !== originalBooking.patientPhone || !originalBooking.patientId)) {
        const resolvedPatient = await medicalRecordsApiRequest("resolve", { patientName: booking.patientName || originalBooking.patientName, patientPhone: booking.patientPhone || originalBooking.patientPhone });
        booking.patientId = resolvedPatient.patient.id;
      }
      await bookingApiRequest("update", { booking });
      const nextDate = String(booking.appointmentDate || "").slice(0, 10);
      if (container === dailyAppointmentsList && nextDate && nextDate !== previousDate) {
        if (doctorFilterMode) doctorFilterMode.value = "date";
        if (doctorHomeSearch) doctorHomeSearch.value = "";
      }
    } else return;

    if (action === "archive-booking") showDoctorArchive();
    await loadBookings();
    if (action === "confirm-booking") {
      const acceptedBooking = allBookings.find(item => item.id === id);
      const queueTitle = $("#doctorQueueDialogTitle");
      if (queueTitle) queueTitle.textContent = "تم تأكيد الحجز";
      const acceptedQueueNumber = queueNumberFor(acceptedBooking || { id, appointmentDate: previousDate });
      if (doctorQueueNumber) doctorQueueNumber.textContent = acceptedQueueNumber;
      if (doctorQueueDialog?.showModal) {
        try { doctorQueueDialog.showModal(); }
        catch { showMessage(container === dailyAppointmentsList ? dailyAppointmentsMessage : bookingListMessage, "تم تأكيد الحجز. رقم الدور: " + acceptedQueueNumber, "success"); }
      } else {
        showMessage(container === dailyAppointmentsList ? dailyAppointmentsMessage : bookingListMessage, "تم تأكيد الحجز. رقم الدور: " + acceptedQueueNumber, "success");
      }
    }
    showMessage(
      container === dailyAppointmentsList ? dailyAppointmentsMessage : bookingListMessage,
      action === "cancel-booking" ? "تم إلغاء طلب الحجز."
        : action === "confirm-booking" ? "تم تأكيد الحجز ونقله إلى المواعيد."
        : action === "archive-booking" ? "تم نقل الطلب إلى الأرشيف."
        : "تم حفظ تعديلات الحجز.",
      "success"
    );
  } catch (error) {
    console.error("تعذر تعديل الحجز:", error);
    showMessage(
      container === dailyAppointmentsList ? dailyAppointmentsMessage : bookingListMessage,
      error.message || "تعذر تعديل الحجز."
    );
  } finally {
    button.disabled = false;
    button.textContent = busyText;
  }
}

if (bookingList) {
  bookingList.addEventListener("click", event => handleBookingCardAction(event, bookingList));
}
if (dailyAppointmentsList) {
  dailyAppointmentsList.addEventListener("click", event => handleBookingCardAction(event, dailyAppointmentsList));
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
        permissions,
        expenseMode: employeeExpenseModeInput?.value === "approval" ? "approval" : "auto"
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
        permissions,
        expenseMode: card.querySelector(".expense-mode-select")?.value === "approval" ? "approval" : "auto"
      });

      showMessage(
        employeeListMessage,
        "تم حفظ صلاحيات الموظف وإعدادات المصروفات.",
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
      button.textContent = "حفظ الصلاحيات والإعدادات";
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
doctorAccountsMonth?.addEventListener("change",()=>{loadDoctorSettlements();previewDoctorSettlement("month")});doctorAccountsDate?.addEventListener("change",()=>previewDoctorSettlement("day"));doctorSettlementEmployee?.addEventListener("change",()=>previewDoctorSettlement(settlementPreviewPeriodType));
finalizeDailySettlementButton?.addEventListener("click",async()=>{
  const periodKey=doctorAccountsDate?.value||doctorHomeDateFilter?.value,employeeUid=doctorSettlementEmployee?.value;
  if(!employeeUid){showMessage(doctorSettlementMessage,"اختر الموظف أولًا.");return}
  const employeeName=doctorSettlementEmployee.selectedOptions[0]?.textContent||"الموظف";
  if(!periodKey){showMessage(doctorSettlementMessage,"اختر تاريخ اليوم المراد تصفيته.");return}
  if(!window.confirm("هل تريد تصفية عهدة "+employeeName+" ليوم "+formatRequestDate(periodKey)+"؟ لن يمكن إضافة مصروفات أو تعديل مقبوضات هذه العهدة بعد الإقفال."))return;
  finalizeDailySettlementButton.disabled=true;
  try{const result=await accountsApiRequest("finalizeSettlement",{periodType:"day",periodKey,employeeUid});showMessage(doctorSettlementMessage,"تمت تصفية عهدة "+employeeName+". الصافي: "+doctorMoney(result.settlement?.netTotal),"success");await loadDoctorSettlements();renderDoctorAccounts();await previewDoctorSettlement("day")}
  catch(error){showMessage(doctorSettlementMessage,error.message||"تعذر تصفية اليوم.")}
  finally{await previewDoctorSettlement("day")}
});
finalizeMonthlySettlementButton?.addEventListener("click",async()=>{
  const periodKey=doctorAccountsMonth?.value,employeeUid=doctorSettlementEmployee?.value;
  if(!employeeUid){showMessage(doctorSettlementMessage,"اختر الموظف أولًا.");return}
  const employeeName=doctorSettlementEmployee.selectedOptions[0]?.textContent||"الموظف";
  if(!periodKey){showMessage(doctorSettlementMessage,"اختر الشهر المراد تصفيته.");return}
  if(!window.confirm("هل تريد تصفية عهدة "+employeeName+" لشهر "+periodKey+"؟ لن يمكن إضافة مصروفات أو تعديل مقبوضات هذه العهدة بعد الإقفال."))return;
  finalizeMonthlySettlementButton.disabled=true;
  try{const result=await accountsApiRequest("finalizeSettlement",{periodType:"month",periodKey,employeeUid});showMessage(doctorSettlementMessage,"تمت تصفية عهدة "+employeeName+" للشهر. الصافي: "+doctorMoney(result.settlement?.netTotal),"success");await loadDoctorSettlements();renderDoctorAccounts();await previewDoctorSettlement("month")}
  catch(error){showMessage(doctorSettlementMessage,error.message||"تعذر تصفية الشهر.")}
  finally{await previewDoctorSettlement("month")}
});
doctorArchiveDateFilter?.addEventListener("change",renderDoctorArchive);doctorArchiveToDateFilter?.addEventListener("change",renderDoctorArchive);doctorArchiveSearch?.addEventListener("input",renderDoctorArchive);exportClinicExcelButton?.addEventListener("click",exportClinicExcel);
$("#openDoctorScheduleFilter")?.addEventListener("click",()=>{if(doctorFilterDate)doctorFilterDate.value=doctorHomeDateFilter.value;if(doctorFilterQuery)doctorFilterQuery.value=doctorHomeSearch.value;doctorScheduleFilterDialog?.showModal()});doctorFilterMode?.addEventListener("change",()=>{const search=doctorFilterMode.value==="search";$("#doctorFilterDateLabel").hidden=search;$("#doctorFilterQueryLabel").hidden=!search});$("#applyDoctorScheduleFilter")?.addEventListener("click",()=>{if(doctorFilterMode.value==="date"){doctorHomeDateFilter.value=doctorFilterDate.value||doctorHomeDateFilter.value;doctorHomeSearch.value=""}else{doctorHomeSearch.value=doctorFilterQuery.value.trim()}doctorScheduleFilterDialog.close();renderDailyAppointments()});homeAddBookingButton?.addEventListener("click",()=>{showBookingSection(true);if(bookingCreateCard)bookingCreateCard.hidden=false;const date=$("#newBookingDate");if(date)date.value=doctorHomeDateFilter.value;bookingCreateCard?.scrollIntoView({behavior:"smooth",block:"start"})});function showDoctorArchive(){if(medicalRecordsSection)medicalRecordsSection.hidden=true;if(doctorAccountsSection)doctorAccountsSection.hidden=true;homeAppointmentsSection.hidden=true;bookingManagementSection.hidden=true;patientManagementSection.hidden=true;employeeManagementSection.hidden=true;doctorArchiveSection.hidden=false;for(const b of document.querySelectorAll(".dashboard-tab"))b.setAttribute("aria-selected",String(b===openArchiveTabButton));renderDoctorArchive()}openArchiveTabButton?.addEventListener("click",showDoctorArchive);setInterval(()=>{const editing=!!document.querySelector("#bookingManagementSection .booking-request-details:not([hidden]),#bookingManagementSection .booking-create-card:not([hidden])")||document.activeElement?.matches("input,select,textarea");if(auth.currentUser&&!document.hidden&&!isLoadingBookings&&!editing)loadBookings()},20000);document.addEventListener("visibilitychange",()=>{const editing=!!document.querySelector("#bookingManagementSection .booking-request-details:not([hidden]),#bookingManagementSection .booking-create-card:not([hidden])")||document.activeElement?.matches("input,select,textarea");if(!document.hidden&&auth.currentUser&&!editing)loadBookings()});
showLogin();


// Patient identity lookup and longitudinal medical records.
function setupMedicalPatientAutocomplete(inputId,phoneId,patientIdInputId,suggestionsId){
 const input=$(inputId),phone=$(phoneId),hidden=$(patientIdInputId),box=$(suggestionsId);if(!input||!phone||!hidden||!box)return;let seq=0;
 input.addEventListener("input",async()=>{hidden.value="";const q=input.value.trim(),id=++seq;box.replaceChildren();box.hidden=true;if(!q)return;try{const result=await medicalRecordsApiRequest("search",{query:q});if(id!==seq)return;for(const p of result.patients||[]){const button=document.createElement("button");button.type="button";const n=document.createElement("strong"),m=document.createElement("span");n.textContent=p.displayName||"مريض";m.textContent=[p.patientNumber||"ملف سابق",p.phone||"الهاتف غير مسجل"].join(" · ");button.append(n,m);button.addEventListener("click",()=>{input.value=p.displayName||"";phone.value=p.phone||"";hidden.value=p.id||"";input.dispatchEvent(new Event("change",{bubbles:true}));phone.dispatchEvent(new Event("input",{bubbles:true}));phone.dispatchEvent(new Event("change",{bubbles:true}));box.hidden=true;box.replaceChildren();});box.append(button)}box.hidden=!box.childElementCount;}catch(e){console.warn("Patient suggestions unavailable:",e.message);}});
}
setupMedicalPatientAutocomplete("#newBookingPatientName","#newBookingPatientPhone","#newBookingPatientId","#newBookingPatientSuggestions");
let activeMedicalPatient=null,activeMedicalHistory=null;
const medicalPatientSearch=$("#medicalPatientSearch"),medicalPatientResults=$("#medicalPatientResults"),medicalPatientProfile=$("#medicalPatientProfile"),medicalPatientSummary=$("#medicalPatientSummary"),medicalVisitHistory=$("#medicalVisitHistory"),medicalVisitForm=$("#medicalVisitForm"),medicalVisitBooking=$("#medicalVisitBooking"),medicalVisitMessage=$("#medicalVisitMessage");
function fillMedicalVisitForm(visit={},booking={}){if(!medicalVisitForm)return;$("#medicalVisitDate").value=visit.visitDate||String(booking.appointmentDate||"").slice(0,10)||"";$("#medicalVisitBloodPressure").value=visit.bloodPressure??booking.bloodPressure??"";$("#medicalVisitWeight").value=visit.weight??booking.weight??"";$("#medicalVisitBloodSugar").value=visit.bloodSugar??booking.bloodSugar??"";$("#medicalVisitPreNotes").value=visit.preVisitNotes??booking.preVisitNotes??"";$("#medicalVisitDiagnosis").value=visit.diagnosis||"";$("#medicalVisitClinicalNotes").value=visit.clinicalNotes||"";$("#medicalVisitTreatment").value=visit.treatment||"";$("#medicalVisitFollowUp").value=visit.followUp||"";}
function renderMedicalVisitHistory(history){medicalVisitHistory.replaceChildren();const visits=history.visits||[],bookings=history.bookings||[];if(!visits.length&&!bookings.length){const p=document.createElement("p");p.className="muted-text";p.textContent="لا توجد زيارات مسجلة لهذا المريض حتى الآن.";medicalVisitHistory.append(p);return;}for(const v of visits){const card=document.createElement("article");card.className="medical-visit-card";const h=document.createElement("h4");h.textContent="كشف "+(v.visitDate||"غير مؤرخ")+(v.queueNumber?" · الدور "+v.queueNumber:"");card.append(h);for(const[label,value]of [["ضغط الدم",v.bloodPressure],["الوزن",v.weight?v.weight+" كجم":""],["السكر",v.bloodSugar],["ملاحظات ما قبل الكشف",v.preVisitNotes],["التشخيص",v.diagnosis],["ملاحظات الدكتور",v.clinicalNotes],["العلاج والتوصيات",v.treatment],["المتابعة",v.followUp]])if(value){const p=document.createElement("p");p.textContent=label+": "+value;card.append(p)}medicalVisitHistory.append(card);}if(!visits.length&&bookings.length){const p=document.createElement("p");p.className="muted-text";p.textContent="توجد حجوزات سابقة مرتبطة بالملف؛ اختر الحجز لتسجيل تفاصيل الكشف.";medicalVisitHistory.append(p);}}
async function loadMedicalPatient(patient){activeMedicalPatient=patient;const result=await medicalRecordsApiRequest("history",{patientId:patient.id});activeMedicalHistory=result;medicalPatientProfile.hidden=false;medicalPatientSummary.replaceChildren();medicalPatientSummary.className="medical-patient-summary";const title=document.createElement("h3"),details=document.createElement("p");title.textContent=result.patient.displayName;details.textContent="رقم الملف: "+(result.patient.patientNumber||result.patient.id)+" · الهاتف: "+(result.patient.phone||"غير مسجل");medicalPatientSummary.append(title,details);medicalVisitBooking.replaceChildren();const ph=document.createElement("option");ph.value="";ph.textContent="اختر حجزًا للمريض";medicalVisitBooking.append(ph);const bookings=(result.bookings||[]).slice().sort((x,y)=>String(y.appointmentDate).localeCompare(String(x.appointmentDate)));for(const b of bookings){const o=document.createElement("option");o.value=b.id;o.textContent=(b.appointmentDate||"تاريخ غير محدد")+" · "+(b.service||"كشف")+" · "+(b.status||"");medicalVisitBooking.append(o)}renderMedicalVisitHistory(result);if(bookings.length){medicalVisitBooking.value=bookings[0].id;medicalVisitBooking.dispatchEvent(new Event("change"));}else fillMedicalVisitForm();}
let medicalSearchSequence=0;
medicalPatientSearch?.addEventListener("input",async()=>{const q=medicalPatientSearch.value.trim(),seq=++medicalSearchSequence;medicalPatientResults.replaceChildren();if(!q)return;try{const result=await medicalRecordsApiRequest("search",{query:q});if(seq!==medicalSearchSequence)return;for(const p of result.patients||[]){const button=document.createElement("button");button.type="button";button.className="medical-patient-result";const n=document.createElement("strong"),m=document.createElement("span");n.textContent=p.displayName;m.textContent=[p.patientNumber||"ملف سابق",p.phone||"الهاتف غير مسجل"].join(" · ");button.append(n,m);button.addEventListener("click",async()=>{button.disabled=true;try{if(p.id)await loadMedicalPatient(p);else{const r=await medicalRecordsApiRequest("resolve",{patientName:p.displayName,patientPhone:p.phone});await loadMedicalPatient(r.patient)}}catch(e){showMessage(medicalVisitMessage,e.message||"تعذر فتح ملف المريض.");}finally{button.disabled=false;}});medicalPatientResults.append(button)}if(!medicalPatientResults.childElementCount){const p=document.createElement("p");p.className="muted-text";p.textContent="لا توجد نتائج مطابقة.";medicalPatientResults.append(p)}}catch(e){showMessage(medicalVisitMessage,e.message||"تعذر البحث في ملفات المرضى.");}});
medicalVisitBooking?.addEventListener("change",()=>{const id=medicalVisitBooking.value,b=(activeMedicalHistory?.bookings||[]).find(x=>x.id===id)||{},v=(activeMedicalHistory?.visits||[]).find(x=>x.bookingId===id)||{};fillMedicalVisitForm(v,b);});
medicalVisitForm?.addEventListener("submit",async e=>{e.preventDefault();if(!activeMedicalPatient||!medicalVisitBooking.value){showMessage(medicalVisitMessage,"اختر ملف المريض والحجز المرتبط بالكشف.");return;}const button=$("#medicalVisitSave");button.disabled=true;try{const b=(activeMedicalHistory?.bookings||[]).find(x=>x.id===medicalVisitBooking.value)||{},booking=allBookings.find(x=>x.id===b.id)||b;await medicalRecordsApiRequest("saveVisit",{patientId:activeMedicalPatient.id,bookingId:b.id,visitDate:$("#medicalVisitDate").value,queueNumber:queueNumberFor(booking),bloodPressure:$("#medicalVisitBloodPressure").value,weight:$("#medicalVisitWeight").value,bloodSugar:$("#medicalVisitBloodSugar").value,preVisitNotes:$("#medicalVisitPreNotes").value,diagnosis:$("#medicalVisitDiagnosis").value,clinicalNotes:$("#medicalVisitClinicalNotes").value,treatment:$("#medicalVisitTreatment").value,followUp:$("#medicalVisitFollowUp").value});showMessage(medicalVisitMessage,"تم حفظ بيانات الكشف وربطها بالحجز وملف المريض.","success");await loadMedicalPatient(activeMedicalPatient);medicalVisitBooking.value=b.id;medicalVisitBooking.dispatchEvent(new Event("change"));await loadBookings();}catch(e){showMessage(medicalVisitMessage,e.message||"تعذر حفظ الكشف.");}finally{button.disabled=false;}});
