import { APP_CONFIG } from "./config/app-config.js";
import { FIREBASE_CONFIG } from "./config/firebase-config.js";

import {
  initializeApp,
  getApps
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const config = APP_CONFIG;

const firebaseApp =
  getApps().find((item) => item.name === "[DEFAULT]") ||
  initializeApp(FIREBASE_CONFIG);

const auth = getAuth(firebaseApp);

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

function setText(selector, value) {
  $$(selector).forEach((element) => {
    element.textContent = value ?? "";
  });
}

function setAttribute(selector, attribute, value) {
  $$(selector).forEach((element) => {
    if (value) {
      element.setAttribute(attribute, value);
    } else {
      element.removeAttribute(attribute);
    }
  });
}

function setNestedText(prefix, values) {
  Object.entries(values ?? {}).forEach(([key, value]) => {
    if (typeof value === "string" || typeof value === "number") {
      setText(`[data-${prefix}="${key}"]`, value);
    }
  });
}

function applyBranding() {
  const root = document.documentElement;
  const branding = config.branding ?? {};

  root.style.setProperty(
    "--color-background",
    branding.background ?? "#11141A"
  );

  root.style.setProperty(
    "--color-surface",
    branding.surface ?? "#F9F5F1"
  );

  root.style.setProperty(
    "--color-accent",
    branding.accent ?? "#FFF25C"
  );

  root.style.setProperty(
    "--color-secondary",
    branding.secondary ?? "#BFD2AF"
  );

  root.style.setProperty(
    "--font-heading",
    `"${branding.headingFont ?? "Cairo"}", sans-serif`
  );

  root.style.setProperty(
    "--font-body",
    `"${branding.bodyFont ?? "Cairo"}", sans-serif`
  );

  document.documentElement.lang =
    config.localization?.language ?? "ar";

  document.documentElement.dir =
    config.localization?.direction ?? "rtl";

  document.title =
    `${config.clinic?.doctorName ?? config.appName} | ${config.clinic?.specialty ?? ""}`;

  const description = $("meta[name='description']");

  if (description) {
    description.content = config.clinic?.description ?? "";
  }
}

function renderNavigation() {
  setNestedText("nav", config.navigation);

  setAttribute(
    ".brand",
    "aria-label",
    config.navigation?.logoLabel
  );

  setAttribute(
    "#menuToggle",
    "aria-label",
    config.navigation?.menuLabel
  );
}

function renderHero() {
  setNestedText("hero", config.hero);

  const highlights = $("#heroHighlights");

  if (highlights) {
    highlights.replaceChildren();

    (config.highlights ?? []).slice(0, 3).forEach((item) => {
      const element = document.createElement("div");
      element.className = "hero-highlight";

      const marker = document.createElement("span");
      marker.className = "hero-highlight-marker";
      marker.textContent = item.number ?? "";

      const textWrap = document.createElement("div");

      const title = document.createElement("strong");
      title.textContent = item.title ?? "";

      const description = document.createElement("small");
      description.textContent = item.description ?? "";

      textWrap.append(title, description);
      element.append(marker, textWrap);
      highlights.append(element);
    });
  }

  const image = $("#doctorImage");
  const placeholder = $("#doctorImagePlaceholder");
  const imageUrl = config.clinic?.doctorImage?.trim();

  if (image && placeholder && imageUrl) {
    image.src = imageUrl;

    image.alt =
      `${config.clinic?.doctorName ?? ""} - ${config.clinic?.specialty ?? ""}`;

    image.hidden = false;
    placeholder.hidden = true;

    image.addEventListener(
      "error",
      () => {
        image.hidden = true;
        placeholder.hidden = false;
      },
      { once: true }
    );
  } else if (image && placeholder) {
    image.hidden = true;
    placeholder.hidden = false;
  }
}

function renderHighlights() {
  const container = $("#highlightsGrid");

  if (!container) return;

  container.replaceChildren();

  (config.highlights ?? []).forEach((item) => {
    const card = document.createElement("article");
    card.className = "strip-item";

    const number = document.createElement("span");
    number.className = "strip-number";
    number.textContent = item.number ?? "";

    const content = document.createElement("div");

    const title = document.createElement("h3");
    title.textContent = item.title ?? "";

    const description = document.createElement("p");
    description.textContent = item.description ?? "";

    content.append(title, description);
    card.append(number, content);
    container.append(card);
  });
}

function renderAbout() {
  setNestedText("about", config.about);

  const container = $("#aboutParagraphs");

  if (!container) return;

  container.replaceChildren();

  (config.about?.paragraphs ?? []).forEach((paragraphText) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = paragraphText;
    container.append(paragraph);
  });
}

function renderServices() {
  setNestedText("services", config.services);

  const container = $("#servicesGrid");

  if (!container) return;

  container.replaceChildren();

  (config.services?.items ?? [])
    .filter((service) => service.enabled !== false)
    .forEach((service, index) => {
      const card = document.createElement("article");
      card.className = "service-card";

      const top = document.createElement("div");
      top.className = "service-card-top";

      const icon = document.createElement("span");
      icon.className = "service-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = service.icon ?? "✳";

      const number = document.createElement("span");
      number.className = "service-number";
      number.textContent = String(index + 1).padStart(2, "0");

      top.append(icon, number);

      const title = document.createElement("h3");
      title.textContent = service.title ?? "";

      const description = document.createElement("p");
      description.textContent = service.description ?? "";

      const link = document.createElement("a");
      link.className = "service-link";
      link.href = "#booking";
      link.textContent =
        config.booking?.submitButton ?? "حجز موعد";

      link.setAttribute(
        "aria-label",
        `${link.textContent} - ${service.title ?? ""}`
      );

      card.append(top, title, description, link);
      container.append(card);
    });
}

function renderBooking() {
  setNestedText("booking", config.booking);
  setNestedText("contact", config.contact);

  const phone = config.clinic?.phone ?? "";

  const phoneLink = phone
    ? `tel:${phone.replace(/[^\d+]/g, "")}`
    : "#";

  const bookingPhone = $("#bookingPhone");
  const contactPhone = $("#contactPhone");

  if (bookingPhone) {
    bookingPhone.textContent = phone;
    bookingPhone.href = phoneLink;
  }

  if (contactPhone) {
    contactPhone.textContent = phone;
    contactPhone.href = phoneLink;
  }

  const form = $("#bookingForm");
  const bookingSection = $("#booking");

  if (config.booking?.enabled === false) {
    bookingSection?.setAttribute("hidden", "");
  } else {
    bookingSection?.removeAttribute("hidden");
  }

  const nameInput = $("#patientName");
  const phoneInput = $("#patientPhone");

  if (nameInput) {
    nameInput.placeholder =
      config.booking?.patientNamePlaceholder ?? "";
  }

  if (phoneInput) {
    phoneInput.placeholder =
      config.booking?.patientPhonePlaceholder ?? "";
  }

  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const message = $("#bookingMessage");

      if (!message) return;

      const formData = new FormData(form);

      const name = String(
        formData.get("patientName") ?? ""
      ).trim();

      const patientPhone = String(
        formData.get("patientPhone") ?? ""
      ).trim();

      const date = String(
        formData.get("appointmentDate") ?? ""
      ).trim();

      if (!name || !patientPhone || !date) {
        message.textContent =
          config.booking?.errorMessage ??
          "يرجى إدخال البيانات المطلوبة.";

        message.className = "form-message error";
        return;
      }

      message.textContent =
        "هذه واجهة تجريبية فقط. لم يتم إرسال أو حفظ طلب الحجز. يجب ربط النموذج بخدمة آمنة قبل استخدامه فعليًا.";

      message.className = "form-message";
    });
  }
}

function renderPatientPortal() {
  setNestedText("portal", config.patientPortal);

  const portal = $("#patient-portal");

  if (config.patientPortal?.enabled === false) {
    portal?.setAttribute("hidden", "");
  } else {
    portal?.removeAttribute("hidden");
  }

  const emailInput = $("#patientEmail");
  const passwordInput = $("#patientPassword");
  const loginForm = $("#patientLoginForm");
  const message = $("#loginMessage");

  const loginButton = loginForm?.querySelector(
    'button[type="submit"]'
  );

  if (emailInput) {
    emailInput.placeholder =
      config.patientPortal?.emailPlaceholder ?? "";
  }

  if (passwordInput) {
    passwordInput.placeholder =
      config.patientPortal?.passwordPlaceholder ?? "";
  }

  if (!loginForm || !message || !loginButton) return;

  let logoutButton = $("#patientLogoutButton");

  if (!logoutButton) {
    logoutButton = document.createElement("button");

    logoutButton.id = "patientLogoutButton";
    logoutButton.type = "button";
    logoutButton.className =
      "button button-dark form-submit";

    logoutButton.textContent = "تسجيل الخروج";
    logoutButton.hidden = true;

    loginForm.insertAdjacentElement(
      "afterend",
      logoutButton
    );
  }

  function showLoginMessage(text, isError = true) {
    message.textContent = text;

    message.className = isError
      ? "form-message error"
      : "form-message";
  }

  function setLoginBusy(busy) {
    loginButton.disabled = busy;

    loginButton.textContent = busy
      ? "جارٍ التحقق..."
      : config.patientPortal?.loginSubmitButton ??
        "تسجيل الدخول";

    if (emailInput) emailInput.disabled = busy;
    if (passwordInput) passwordInput.disabled = busy;
  }

  function getAuthErrorMessage(error) {
    switch (error?.code) {
      case "auth/invalid-email":
        return "البريد الإلكتروني غير صحيح.";

      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";

      case "auth/too-many-requests":
        return "محاولات كثيرة. يرجى الانتظار ثم المحاولة مرة أخرى.";

      case "auth/network-request-failed":
        return "تعذر الاتصال بالإنترنت. تحقق من اتصالك وحاول مرة أخرى.";

      case "auth/user-disabled":
        return "هذا الحساب معطّل. يرجى التواصل مع إدارة العيادة.";

      default:
        return "تعذر تسجيل الدخول. حاول مرة أخرى.";
    }
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
      throw new Error("تعذر قراءة استجابة التحقق.");
    }

    if (!response.ok) {
      throw new Error(
        result?.message || "تعذر التحقق من نوع الحساب."
      );
    }

    if (
      !["doctor", "staff", "patient"].includes(result?.accountType)
    ) {
      throw new Error("نوع الحساب الذي أعاده الخادم غير معروف.");
    }

    return result;
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (loginButton.disabled) return;

    const email = emailInput?.value.trim() ?? "";
    const password = passwordInput?.value ?? "";

    if (!email || !password) {
      showLoginMessage(
        "أدخل البريد الإلكتروني وكلمة المرور."
      );

      return;
    }

    showLoginMessage("", false);
    setLoginBusy(true);

    let user;

    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      user = credential.user;
      passwordInput.value = "";

    } catch (error) {
      console.error("Clinic login error:", error);

      showLoginMessage(getAuthErrorMessage(error));
      setLoginBusy(false);
      return;
    }

    let account;

    try {
      account = await identifyAccount(user);
    } catch (error) {
      console.error("Account type verification failed:", error);

      try {
        await signOut(auth);
      } catch (signOutError) {
        console.error(
          "Sign out after account verification failure:",
          signOutError
        );
      }

      showLoginMessage(
        "تم تسجيل الدخول إلى Firebase، لكن تعذر التحقق الآمن من نوع الحساب. لم يتم فتح أي لوحة. حاول لاحقًا."
      );

      setLoginBusy(false);
      return;
    }

    if (account.accountType === "doctor") {
      window.location.href = "./admin.html";
      return;
    }

    if (account.accountType === "staff") {
      window.location.href = "./staff.html";
      return;
    }

    showLoginMessage(
      "تم تسجيل الدخول بنجاح. بوابة المريضة ستظل كما هي، وسيتم تفعيل عرض المواعيد والبيانات عند اكتمال ربطها الآمن.",
      false
    );

    if (emailInput) emailInput.disabled = true;
    if (passwordInput) passwordInput.disabled = true;

    loginButton.hidden = true;
    logoutButton.hidden = false;
    setLoginBusy(false);
  });

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;

    try {
      await signOut(auth);

      if (emailInput) emailInput.disabled = false;
      if (passwordInput) passwordInput.disabled = false;

      loginButton.hidden = false;

      if (passwordInput) passwordInput.value = "";

      showLoginMessage(
        "تم تسجيل الخروج بنجاح.",
        false
      );

      logoutButton.hidden = true;
      emailInput?.focus();
    } catch (error) {
      console.error("Clinic logout error:", error);

      showLoginMessage(
        "تعذر تسجيل الخروج. حاول مرة أخرى."
      );
    } finally {
      logoutButton.disabled = false;
    }
  });
}

function renderContact() {
  const clinic = config.clinic ?? {};

  const address = $("#contactAddress");

  if (address) {
    address.textContent = clinic.address ?? "";
  }

  const whatsapp = String(
    clinic.whatsapp ?? ""
  ).replace(/\D/g, "");

  const whatsappLink = $("#contactWhatsapp");

  if (whatsappLink) {
    whatsappLink.textContent =
      config.contact?.whatsappButton ??
      clinic.whatsapp ??
      "";

    whatsappLink.href = whatsapp
      ? `https://wa.me/${whatsapp}`
      : "#";

    whatsappLink.setAttribute(
      "rel",
      "noopener noreferrer"
    );
  }

  const hours = $("#workingHours");

  if (hours) {
    hours.replaceChildren();

    (clinic.workingHours ?? []).forEach((item) => {
      const row = document.createElement("li");

      const day = document.createElement("span");
      const time = document.createElement("span");

      day.textContent = item.day ?? "";
      time.textContent = item.hours ?? "";

      row.append(day, time);
      hours.append(row);
    });
  }
}

function renderFooter() {
  setNestedText("footer", config.footer);

  const copyright = $("#copyrightText");

  if (copyright) {
    copyright.textContent =
      `${config.footer?.copyrightPrefix ?? "©"} ${new Date().getFullYear()} ${config.clinic?.doctorName ?? config.appName} — ${config.footer?.copyrightSuffix ?? ""}`;
  }
}

function renderDoctorInfo() {
  setText(
    "[data-doctor-name]",
    config.clinic?.doctorName
  );

  setText(
    "[data-specialty]",
    config.clinic?.specialty
  );

  const whatsapp = String(
    config.clinic?.whatsapp ?? ""
  ).replace(/\D/g, "");

  const whatsappLink = $("#contactWhatsapp");

  if (whatsappLink && !whatsapp) {
    whatsappLink.removeAttribute("href");
  }
}

function setupMobileMenu() {
  const toggle = $("#menuToggle");
  const nav = $("#mainNav");

  if (!toggle || !nav) return;

  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");

    toggle.setAttribute(
      "aria-expanded",
      String(isOpen)
    );
  });

  $$("a", nav).forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");

      toggle.setAttribute(
        "aria-expanded",
        "false"
      );
    });
  });

  document.addEventListener("click", (event) => {
    if (
      !nav.contains(event.target) &&
      !toggle.contains(event.target)
    ) {
      nav.classList.remove("is-open");

      toggle.setAttribute(
        "aria-expanded",
        "false"
      );
    }
  });
}

function setupDateInput() {
  const dateInput = $("#appointmentDate");

  if (!dateInput) return;

  const now = new Date();

  const localDate = new Date(
    now.getTime() - now.getTimezoneOffset() * 60000
  )
    .toISOString()
    .slice(0, 10);

  dateInput.min = localDate;
}

function init() {
  applyBranding();
  renderNavigation();
  renderDoctorInfo();
  renderHero();
  renderHighlights();
  renderAbout();
  renderServices();
  renderBooking();
  renderPatientPortal();
  renderContact();
  renderFooter();
  setupMobileMenu();
  setupDateInput();
}

init();
