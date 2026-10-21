import { APP_CONFIG } from "./config/app-config.js";

const $ = (selector) => document.querySelector(selector);

function initializeBranding() {
  const { clinic, branding } = APP_CONFIG;

  document.documentElement.style.setProperty(
    "--color-dark",
    branding.background
  );

  document.documentElement.style.setProperty(
    "--color-light",
    branding.surface
  );

  document.documentElement.style.setProperty(
    "--color-accent",
    branding.accent
  );

  document.documentElement.style.setProperty(
    "--color-secondary",
    branding.secondary
  );

  document.title = `${clinic.doctorName} | ${clinic.specialty}`;

  document.querySelectorAll("[data-doctor-name]").forEach((element) => {
    element.textContent = clinic.doctorName;
  });

  document.querySelectorAll("[data-specialty]").forEach((element) => {
    element.textContent = clinic.specialty;
  });

  const description = document.querySelector('meta[name="description"]');

  if (description) {
    description.content =
      `الموقع الرسمي لـ ${clinic.doctorName}، تخصص ${clinic.specialty}.`;
  }

  $("#currentYear").textContent = new Date().getFullYear();
}

function initializeMobileMenu() {
  const menuToggle = $("#menuToggle");
  const mainNav = $("#mainNav");

  if (!menuToggle || !mainNav) return;

  function closeMenu() {
    mainNav.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "فتح القائمة");
  }

  menuToggle.addEventListener("click", () => {
    const isOpen = mainNav.classList.toggle("is-open");

    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute(
      "aria-label",
      isOpen ? "إغلاق القائمة" : "فتح القائمة"
    );
  });

  mainNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
      menuToggle.focus();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 720) {
      closeMenu();
    }
  });
}

function initializeBookingForm() {
  const form = $("#bookingForm");
  const message = $("#bookingMessage");
  const dateInput = $("#appointmentDate");

  if (!form || !message || !dateInput) return;

  const now = new Date();

  const localDate = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");

  dateInput.min = localDate;

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    if (!APP_CONFIG.booking.enabled) {
      message.textContent = "الحجز غير متاح حاليًا.";
      message.hidden = false;
      return;
    }

    /*
     * لا يتم حفظ بيانات المريض في هذه المرحلة.
     * سيتم ربط النموذج بخدمة حجز آمنة بعد تجهيز
     * Firebase Authentication وFirestore Security Rules.
     */

    message.textContent =
      "واجهة الحجز جاهزة، لكن إرسال الطلب لم يتم تفعيله بعد. " +
      "لن يتم إرسال بياناتك أو حفظها حاليًا.";

    message.hidden = false;
  });
}

function initializePatientPortal() {
  const loginLink = $("#patientLoginLink");

  if (!loginLink) return;

  loginLink.addEventListener("click", (event) => {
    event.preventDefault();

    /*
     * لا نسمح بعرض بوابة وهمية أو تسجيل دخول غير محمي.
     * سيتم ربط الرابط بشاشة تسجيل الدخول بعد بناء
     * Firebase Authentication وقواعد الصلاحيات.
     */

    const bookingSection = $("#booking");

    if (bookingSection) {
      bookingSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  });
}

function initializeApp() {
  initializeBranding();
  initializeMobileMenu();
  initializeBookingForm();
  initializePatientPortal();
}

initializeApp();
