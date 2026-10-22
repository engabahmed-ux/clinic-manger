
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

const openEmployeesButton = $("#openEmployeesButton");
const backToDashboardButton = $("#backToDashboardButton");
const employeeManagementSection = $("#employeeManagementSection");
const openBookingsButton = $("#openBookingsButton");
const backFromBookingsButton = $("#backFromBookingsButton");
const bookingManagementSection = $("#bookingManagementSection");
const bookingList = $("#bookingList");
const bookingListMessage = $("#bookingListMessage");
const refreshBookingsButton = $("#refreshBookingsButton");
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
let verificationRequestNumber = 0;

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
}

function showEmployeeSection(show) {
  if (employeeManagementSection) {
    employeeManagementSection.hidden = !show;
  }

  if (bookingManagementSection) bookingManagementSection.hidden = true;

  const managementGrid = $(".management-grid");
  const welcomeCard = $(".welcome-card");
  const sectionHeading = $(".section-heading");

  if (managementGrid) managementGrid.hidden = show;
  if (welcomeCard) welcomeCard.hidden = show;
  if (sectionHeading) sectionHeading.hidden = show;
}

function showBookingSection(show) {
  if (bookingManagementSection) {
    bookingManagementSection.hidden = !show;
  }

  if (employeeManagementSection) employeeManagementSection.hidden = true;

  const managementGrid = $(".management-grid");
  const welcomeCard = $(".welcome-card");
  const sectionHeading = $(".section-heading");

  if (managementGrid) managementGrid.hidden = show;
  if (welcomeCard) welcomeCard.hidden = show;
  if (sectionHeading) sectionHeading.hidden = show;
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
    if (field === "service") input.maxLength = 120;
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

  const heading = document.createElement("div");
  heading.className = "employee-card-header";
  const identity = document.createElement("div");
  const title = document.createElement("h5");
  title.textContent = booking.patientName || "طلب حجز جديد";
  const created = document.createElement("p");
  created.className = "employee-email";
  created.textContent = `رقم الطلب: ${booking.id}`;
  identity.append(title, created);
  heading.append(identity);

  const fields = document.createElement("div");
  fields.className = "booking-edit-grid";
  fields.append(
    createBookingInput("اسم المريضة", booking.patientName, "patientName"),
    createBookingInput("رقم الهاتف", booking.patientPhone, "patientPhone", "tel"),
    createBookingInput("التاريخ المطلوب", booking.appointmentDate, "appointmentDate", "date"),
    createBookingInput("الخدمة", booking.service, "service"),
    createBookingInput("الحالة", booking.status, "status", "select"),
    createBookingInput("ملاحظات", booking.notes, "notes")
  );

  const actions = document.createElement("div");
  actions.className = "booking-card-actions";
  const save = document.createElement("button");
  save.type = "button";
  save.className = "primary-button";
  save.dataset.action = "save-booking";
  save.textContent = "حفظ التعديلات";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "secondary-button";
  cancel.dataset.action = "cancel-booking";
  cancel.textContent = "إلغاء الحجز";
  cancel.disabled = booking.status === "cancelled";

  actions.append(save, cancel);
  card.append(heading, fields, actions);
  return card;
}

async function loadBookings() {
  if (isLoadingBookings || !bookingList) return;
  isLoadingBookings = true;
  if (refreshBookingsButton) {
    refreshBookingsButton.disabled = true;
    refreshBookingsButton.textContent = "جارٍ التحديث...";
  }
  hideMessage(bookingListMessage);

  try {
    const result = await bookingApiRequest("list");
    bookingList.replaceChildren();
    const bookings = Array.isArray(result.bookings) ? result.bookings : [];
    if (!bookings.length) {
      const empty = document.createElement("div");
      empty.className = "empty-employees";
      empty.textContent = "لا توجد طلبات حجز حتى الآن.";
      bookingList.append(empty);
    } else {
      bookings.forEach((booking) => {
        if (booking?.id) bookingList.append(renderBookingCard(booking));
      });
    }
  } catch (error) {
    console.error("تعذر تحميل الحجوزات:", error);
    showMessage(bookingListMessage, error.message || "تعذر تحميل الحجوزات.");
  } finally {
    isLoadingBookings = false;
    if (refreshBookingsButton) {
      refreshBookingsButton.disabled = false;
      refreshBookingsButton.textContent = "تحديث الحجوزات";
    }
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

if (backFromBookingsButton) {
  backFromBookingsButton.addEventListener("click", () => {
    showBookingSection(false);
  });
}

if (refreshBookingsButton) {
  refreshBookingsButton.addEventListener("click", loadBookings);
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
      } else if (action === "save-booking") {
        const booking = { id };
        for (const field of ["patientName", "patientPhone", "appointmentDate", "service", "notes", "status"]) {
          const input = card.querySelector(`[data-booking-field="${field}"]`);
          booking[field] = input?.value ?? "";
        }
        await bookingApiRequest("update", { booking });
      } else {
        return;
      }

      showMessage(
        bookingListMessage,
        action === "cancel-booking" ? "تم إلغاء الحجز." : "تم حفظ تعديلات الحجز.",
        "success"
      );
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
