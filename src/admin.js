
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
 * هذه الصفحة لا تنشئ حسابًا جديدًا.
 * تستخدم حساب الدكتور الموجود في Firebase Authentication.
 *
 * ملاحظة أمنية:
 * فحص UID في المتصفح هو بوابة واجهة فقط، وليس بديلًا عن
 * قواعد Firebase أو التحقق الموثوق على الخادم.
 */

const DOCTOR_ADMIN_UID = "8fUdGutQHRau3RXQIrRtZUqQ9Nm1";

const app =
  getApps().find((item) => item.name === "[DEFAULT]") ||
  initializeApp(FIREBASE_CONFIG);

const auth = getAuth(app);

const $ = (selector) => document.querySelector(selector);

const loginSection = $("#loginSection");
const dashboardSection = $("#dashboardSection");
const loginForm = $("#doctorLoginForm");
const emailInput = $("#doctorEmail");
const passwordInput = $("#doctorPassword");
const loginButton = $("#loginButton");
const loginError = $("#loginError");
const logoutButton = $("#logoutButton");
const doctorAccountLabel = $("#doctorAccountLabel");

let isSubmitting = false;
let authStateReady = false;

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
  loginSection.hidden = false;
  dashboardSection.hidden = true;
}

function showDashboard(user) {
  loginSection.hidden = true;
  dashboardSection.hidden = false;

  doctorAccountLabel.textContent = user.email || "حساب الدكتور";
}

function setLoginBusy(busy) {
  isSubmitting = busy;
  loginButton.disabled = busy;
  loginButton.textContent = busy
    ? "جارٍ التحقق..."
    : "تسجيل الدخول";
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

  console.warn("تم رفض حساب لا يطابق حساب الدكتور المعتمد.", user.uid);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isSubmitting) return;

  hideMessage(loginError);

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showMessage(loginError, "أدخل البريد الإلكتروني وكلمة المرور.");
    return;
  }

  setLoginBusy(true);

  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    if (credential.user.uid !== DOCTOR_ADMIN_UID) {
      await rejectUnauthorizedUser(credential.user);
      return;
    }

    showDashboard(credential.user);
    passwordInput.value = "";
  } catch (error) {
    console.error("خطأ تسجيل دخول الدكتور:", error);

    showLogin();
    showMessage(loginError, getFriendlyAuthError(error));
  } finally {
    setLoginBusy(false);
  }
});

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;

  try {
    await signOut(auth);
    showLogin();
    hideMessage(loginError);
    emailInput.focus();
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

onAuthStateChanged(auth, async (user) => {
  authStateReady = true;

  if (!user) {
    showLogin();
    return;
  }

  if (user.uid !== DOCTOR_ADMIN_UID) {
    await rejectUnauthorizedUser(user);
    return;
  }

  showDashboard(user);
});

/*
 * لا يتم فتح بيانات Firestore أو تعديلها في هذه المرحلة.
 * قواعد Firestore الحالية تظل كما هي.
 */
if (!authStateReady) {
  showLogin();
}
