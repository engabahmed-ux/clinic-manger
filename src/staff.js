import { FIREBASE_CONFIG } from "./config/firebase-config.js";

import {
  initializeApp,
  getApps
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const DOCTOR_ADMIN_UID = "8fUdGutQHRau3RXQIrRtZUqQ9Nm1";

const firebaseApp =
  getApps().find((item) => item.name === "[DEFAULT]") ||
  initializeApp(FIREBASE_CONFIG);

const auth = getAuth(firebaseApp);

const $ = (selector, parent = document) =>
  parent.querySelector(selector);

const loadingSection = $("#staffLoading");
const errorSection = $("#staffError");
const dashboardSection = $("#staffDashboard");
const errorMessage = $("#staffErrorMessage");
const logoutButton = $("#staffLogoutButton");
const retryButton = $("#staffRetryButton");
const permissionsGrid = $("#staffPermissionsGrid");
const noPermissionsMessage = $("#staffNoPermissions");
const displayNameElement = $("#staffDisplayName");

let currentUser = null;
let checkingAccount = false;

const permissionSections = [
  {
    key: "bookings",
    title: "إدارة الحجوزات",
    description: "صلاحية الوصول إلى قسم الحجوزات."
  },
  {
    key: "patients",
    title: "إدارة المريضات",
    description: "صلاحية الوصول إلى قسم بيانات المريضات."
  },
  {
    key: "medicalRecords",
    title: "السجلات الطبية",
    description: "صلاحية الوصول إلى قسم السجلات الطبية."
  },
  {
    key: "settings",
    title: "الإعدادات",
    description: "صلاحية الوصول إلى قسم إعدادات العيادة."
  }
];

function showOnly(section) {
  loadingSection.hidden = section !== loadingSection;
  errorSection.hidden = section !== errorSection;
  dashboardSection.hidden = section !== dashboardSection;
}

function showError(message) {
  errorMessage.textContent = message;
  showOnly(errorSection);
  logoutButton.hidden = !auth.currentUser;
}

async function identifyAccount(user) {
  const idToken = await user.getIdToken();

  const response = await fetch("/api/auth/account-type", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${idToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  });

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error("تعذر قراءة استجابة التحقق من الحساب.");
  }

  if (!response.ok) {
    throw new Error(
      result?.message || "تعذر التحقق من نوع الحساب."
    );
  }

  return result;
}

function permissionLabel(value) {
  if (value === "edit") {
    return "مشاهدة وتعديل";
  }

  if (value === "view") {
    return "مشاهدة فقط";
  }

  return "لا توجد صلاحية";
}

async function staffBookingsRequest(action, data = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("انتهت جلسة الدخول. سجّل الدخول مجددًا.");
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
  if (!response.ok) {
    throw new Error(result.message || "تعذر تحميل الحجوزات.");
  }
  return result;
}

async function loadStaffBookings(container, permission, refreshButton, message) {
  if (refreshButton) {
    refreshButton.disabled = true;
    refreshButton.textContent = "جارٍ التحديث...";
  }
  if (message) {
    message.hidden = true;
    message.textContent = "";
  }
  try {
    const result = await staffBookingsRequest("list");
    container.replaceChildren();
    const bookings = Array.isArray(result.bookings) ? result.bookings : [];
    if (!bookings.length) {
      const empty = document.createElement("p");
      empty.className = "staff-empty";
      empty.textContent = "لا توجد طلبات حجز حتى الآن.";
      container.append(empty);
      return;
    }
    for (const booking of bookings) {
      if (!booking?.id) continue;
      const card = document.createElement("article");
      card.className = "staff-permission-card";

      const heading = document.createElement("div");
      heading.className = "staff-permission-heading";
      const title = document.createElement("h3");
      title.textContent = booking.patientName || "طلب حجز";
      const status = document.createElement("span");
      status.className = "staff-permission-status";
      status.textContent = ({
        pending: "قيد المراجعة",
        confirmed: "مؤكد",
        completed: "مكتمل",
        cancelled: "ملغي"
      })[booking.status] || "قيد المراجعة";
      heading.append(title, status);

      const details = document.createElement("p");
      details.textContent = `الهاتف: ${booking.patientPhone || "—"} | التاريخ: ${booking.appointmentDate || "—"} | الخدمة: ${booking.service || "—"}`;
      const notes = document.createElement("p");
      notes.textContent = booking.notes ? `ملاحظات: ${booking.notes}` : "لا توجد ملاحظات.";
      card.append(heading, details, notes);

      if (permission === "edit" && booking.status !== "cancelled") {
        const actions = document.createElement("div");
        actions.className = "staff-booking-actions";
        const confirmButton = document.createElement("button");
        confirmButton.type = "button";
        confirmButton.className = "staff-primary";
        confirmButton.textContent = booking.status === "confirmed" ? "تم تأكيد الموعد" : "تأكيد الحجز";
        confirmButton.disabled = booking.status === "confirmed";
        confirmButton.addEventListener("click", async () => {
          confirmButton.disabled = true;
          try {
            await staffBookingsRequest("update", {
              booking: { id: booking.id, status: "confirmed" }
            });
            await loadStaffBookings(container, permission, refreshButton, message);
          } catch (error) {
            if (message) {
              message.textContent = error.message || "تعذر تحديث الحجز.";
              message.hidden = false;
            }
            confirmButton.disabled = false;
          }
        });
        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.className = "staff-secondary";
        cancelButton.textContent = "إلغاء الحجز";
        cancelButton.addEventListener("click", async () => {
          if (!window.confirm("هل تريد إلغاء هذا الحجز؟")) return;
          cancelButton.disabled = true;
          try {
            await staffBookingsRequest("cancel", { id: booking.id });
            await loadStaffBookings(container, permission, refreshButton, message);
          } catch (error) {
            if (message) {
              message.textContent = error.message || "تعذر إلغاء الحجز.";
              message.hidden = false;
            }
            cancelButton.disabled = false;
          }
        });
        actions.append(confirmButton, cancelButton);
        card.append(actions);
      }
      container.append(card);
    }
  } catch (error) {
    console.error("Staff bookings load failed:", error);
    if (message) {
      message.textContent = error.message || "تعذر تحميل الحجوزات.";
      message.hidden = false;
    }
  } finally {
    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.textContent = "تحديث الحجوزات";
    }
  }
}

function createStaffPatientAccountForm(card) {
  const panel = document.createElement("div");
  panel.className = "staff-patient-create";
  const heading = document.createElement("h4");
  heading.textContent = "إنشاء حساب مريضة";
  panel.append(heading);

  const form = document.createElement("form");
  form.className = "staff-patient-form";
  const fields = [
    { key: "displayName", label: "اسم المريضة", type: "text", maxLength: 120 },
    { key: "email", label: "البريد الإلكتروني", type: "email", maxLength: 254 },
    { key: "phone", label: "رقم الهاتف", type: "tel", maxLength: 40 },
    { key: "username", label: "اسم المستخدم", type: "text", minLength: 3, maxLength: 30 }
  ];
  const inputs = {};
  for (const field of fields) {
    const label = document.createElement("label");
    label.textContent = field.label;
    const input = document.createElement("input");
    input.type = field.type;
    input.name = field.key;
    input.required = true;
    input.maxLength = field.maxLength;
    if (field.minLength) input.minLength = field.minLength;
    input.autocomplete = "off";
    inputs[field.key] = input;
    label.append(input);
    form.append(label);
  }

  const message = document.createElement("p");
  message.className = "staff-message";
  message.hidden = true;
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "staff-primary";
  submit.textContent = "إنشاء حساب المريضة";
  const credentials = document.createElement("div");
  credentials.className = "staff-patient-credentials";
  credentials.hidden = true;
  form.append(message, submit);
  panel.append(form, credentials);
  card.append(panel);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    submit.textContent = "جارٍ إنشاء الحساب...";
    message.hidden = true;
    credentials.hidden = true;
    try {
      const response = await fetch("/api/doctor/patients", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${await auth.currentUser.getIdToken()}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          action: "create",
          displayName: inputs.displayName.value.trim(),
          email: inputs.email.value.trim(),
          phone: inputs.phone.value.trim(),
          username: inputs.username.value.trim().toLowerCase()
        }),
        cache: "no-store"
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success !== true) {
        throw new Error(result.message || "تعذر إنشاء حساب المريضة.");
      }
      const values = [
        ["اسم المستخدم", result.credentials?.username],
        ["البريد الإلكتروني", result.credentials?.email],
        ["كلمة المرور المؤقتة", result.credentials?.temporaryPassword]
      ];
      credentials.replaceChildren();
      const title = document.createElement("strong");
      title.textContent = "بيانات الدخول — سلّميها للمريضة بشكل خاص";
      credentials.append(title);
      for (const [labelText, value] of values) {
        const row = document.createElement("p");
        row.textContent = `${labelText}: ${value || ""}`;
        credentials.append(row);
      }
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "staff-secondary";
      copy.textContent = "نسخ بيانات الدخول";
      copy.addEventListener("click", async () => {
        const text = values.map(([labelText, value]) => `${labelText}: ${value || ""}`).join("\n");
        try {
          await navigator.clipboard.writeText(text);
          copy.textContent = "تم النسخ";
        } catch {
          message.textContent = "تعذر النسخ التلقائي. انسخي البيانات يدويًا.";
          message.hidden = false;
        }
      });
      credentials.append(copy);
      credentials.hidden = false;
      form.reset();
      message.textContent = "تم إنشاء الحساب. كلمة المرور المؤقتة معروضة الآن فقط.";
      message.hidden = false;
    } catch (error) {
      message.textContent = error.message || "تعذر إنشاء حساب المريضة.";
      message.hidden = false;
    } finally {
      submit.disabled = false;
      submit.textContent = "إنشاء حساب المريضة";
    }
  });
}

function renderPermissions(permissions) {
  permissionsGrid.replaceChildren();

  const allowedSections = permissionSections.filter((section) => {
    return ["view", "edit"].includes(permissions?.[section.key]);
  });

  noPermissionsMessage.hidden = allowedSections.length > 0;

  allowedSections.forEach((section) => {
    const permission = permissions[section.key];

    const card = document.createElement("article");
    card.className = "staff-permission-card";

    const heading = document.createElement("div");
    heading.className = "staff-permission-heading";

    const title = document.createElement("h3");
    title.textContent = section.title;

    const status = document.createElement("span");
    status.className = `staff-permission-status ${
      permission === "edit" ? "can-edit" : "view-only"
    }`;

    status.textContent = permissionLabel(permission);

    heading.append(title, status);

    const description = document.createElement("p");
    description.textContent = section.description;

    card.append(heading, description);

    if (section.key === "patients" && permission === "edit") {
      createStaffPatientAccountForm(card);
    } else if (section.key === "bookings") {
      const controls = document.createElement("div");
      controls.className = "staff-bookings-controls";
      const refresh = document.createElement("button");
      refresh.type = "button";
      refresh.className = "staff-secondary";
      refresh.textContent = "تحديث الحجوزات";
      const message = document.createElement("p");
      message.className = "staff-message";
      message.hidden = true;
      const list = document.createElement("div");
      list.className = "staff-bookings-list";
      refresh.addEventListener("click", () => {
        loadStaffBookings(list, permission, refresh, message);
      });
      controls.append(refresh, message, list);
      card.append(controls);
      loadStaffBookings(list, permission, refresh, message);
    } else {
      const unavailable = document.createElement("p");
      unavailable.className = "staff-feature-unavailable";
      unavailable.textContent =
        "سيتم تفعيل عمليات هذا القسم بعد استكمال ربطه الآمن.";
      card.append(unavailable);
    }

    permissionsGrid.append(card);
  });
}

async function checkCurrentAccount() {
  if (checkingAccount) return;

  checkingAccount = true;
  showOnly(loadingSection);

  try {
    const user = currentUser || auth.currentUser;

    if (!user) {
      window.location.replace("./index.html#patient-portal");
      return;
    }

    const account = await identifyAccount(user);

    if (account.accountType === "doctor") {
      window.location.replace("./admin.html");
      return;
    }

    if (account.accountType === "patient") {
      window.location.replace("./index.html#patient-portal");
      return;
    }

    if (account.accountType !== "staff") {
      throw new Error("نوع الحساب غير معتمد لهذه اللوحة.");
    }

    displayNameElement.textContent =
      account.displayName || "في لوحة الموظف";

    renderPermissions(account.permissions || {});

    showOnly(dashboardSection);
    logoutButton.hidden = false;
  } catch (error) {
    console.error("Staff dashboard verification failed:", error);

    showError(
      error.message ||
      "تعذر التحقق من حساب الموظف. حاول مرة أخرى."
    );
  } finally {
    checkingAccount = false;
  }
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;

  if (!user) {
    window.location.replace("./index.html#patient-portal");
    return;
  }

  checkCurrentAccount();
});

retryButton.addEventListener("click", () => {
  checkCurrentAccount();
});

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;

  try {
    await signOut(auth);
    window.location.replace("./index.html#patient-portal");
  } catch (error) {
    console.error("Staff logout failed:", error);

    showError("تعذر تسجيل الخروج. حاول مرة أخرى.");
  } finally {
    logoutButton.disabled = false;
  }
});
