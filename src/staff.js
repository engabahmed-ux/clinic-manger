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

    const unavailable = document.createElement("p");
    unavailable.className = "staff-feature-unavailable";
    unavailable.textContent =
      "سيتم تفعيل عمليات هذا القسم بعد استكمال ربطه الآمن.";

    card.append(heading, description, unavailable);
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
