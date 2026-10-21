
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
 * تسجيل الدخول يتم عبر Firebase Authentication.
 * لا تظهر لوحة الدكتور إلا بعد نجاح التحقق من الخادم.
 * لا يتم تعديل Firestore أو قواعده هنا.
 */

const DOCTOR_ADMIN_UID = "8fUdGutQHRau3RXQIrRtZUqQ9Nm1";
const DOCTOR_VERIFY_URL = "/api/doctor/verify";

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
}

function showDashboard(user) {
  if (loginSection) loginSection.hidden = true;
  if (dashboardSection) dashboardSection.hidden = false;

  if (doctorAccountLabel) {
    doctorAccountLabel.textContent = user.email || "حساب الدكتور";
  }
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

    // تجاهل نتيجة طلب قديم إذا تغيّر المستخدم أثناء التحقق.
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

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isSubmitting) return;

    hideMessage(loginError);

    const email = emailInput.value.trim();
    const password = passwordInput.value;

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

      // onAuthStateChanged سيتولى التحقق من الخادم قبل فتح اللوحة.
      passwordInput.value = "";
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

onAuthStateChanged(auth, async (user) => {
  const requestNumber = ++verificationRequestNumber;

  if (!user) {
    showLogin();
    return;
  }

  // لا نعتمد على UID في المتصفح وحده لفتح لوحة الدكتور.
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
