
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

const app =
  getApps().find((item) => item.name === "[DEFAULT]") ||
  initializeApp(FIREBASE_CONFIG);

const auth = getAuth(app);
const $ = (selector, parent = document) =>
  parent.querySelector(selector);

const loadingSection = $("#loadingSection");
const errorSection = $("#errorSection");
const appSection = $("#appSection");
const errorMessage = $("#errorMessage");
const retryButton = $("#retryButton");
const logoutButton = $("#logoutButton");

const editorPanel = $("#editorPanel");
const bookingForm = $("#bookingForm");
const bookingIdInput = $("#bookingId");
const patientNameInput = $("#patientName");
const patientPhoneInput = $("#patientPhone");
const appointmentDateInput = $("#appointmentDate");
const serviceInput = $("#service");
const notesInput = $("#notes");
const statusInput = $("#bookingStatus");
const statusField = $("#statusField");
const editorTitle = $("#editorTitle");
const saveButton = $("#saveBookingButton");
const formMessage = $("#formMessage");

const bookingsList = $("#bookingsList");
const listMessage = $("#listMessage");
const emptyState = $("#emptyState");
const searchInput = $("#searchInput");
const filterDate = $("#filterDate");
const filterStatus = $("#filterStatus");

const newBookingButton = $("#newBookingButton");
const closeEditorButton = $("#closeEditorButton");
const cancelEditorButton = $("#cancelEditorButton");
const refreshButton = $("#refreshButton");
const permissionLabel = $("#permissionLabel");

let currentUser = null;
let bookings = [];
let canEdit = false;
let accountVerified = false;
let loading = false;

const STATUS_LABELS = {
  pending: "طلب جديد",
  confirmed: "مؤكد",
  completed: "مكتمل",
  cancelled: "ملغي"
};

function showOnly(section) {
  loadingSection.hidden = section !== loadingSection;
  errorSection.hidden = section !== errorSection;
  appSection.hidden = section !== appSection;
}

function showError(message) {
  errorMessage.textContent = message;
  showOnly(errorSection);
}

function showMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
  element.hidden = !message;
}

async function apiRequest(action, extra = {}) {
  if (!currentUser) {
    throw new Error("انتهت جلسة الدخول. سجّل الدخول مجددًا.");
  }

  const token = await currentUser.getIdToken();

  const response = await fetch("/api/doctor/bookings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ action, ...extra })
  });

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error("تعذر قراءة استجابة الخادم.");
  }

  if (!response.ok) {
    throw new Error(
      result?.message || "تعذر تنفيذ العملية المطلوبة."
    );
  }

  return result;
}

function setEditControls(enabled) {
  canEdit = enabled;
  newBookingButton.hidden = !enabled;
  statusField.hidden = !enabled;
}

function formatDate(value) {
  if (!value) return "لم يُحدد الموعد";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;

  return element;
}

function renderStats() {
  $("#totalCount").textContent = String(bookings.length);
  $("#pendingCount").textContent = String(
    bookings.filter((item) => item.status === "pending").length
  );
  $("#confirmedCount").textContent = String(
    bookings.filter((item) => item.status === "confirmed").length
  );
  $("#cancelledCount").textContent = String(
    bookings.filter((item) => item.status === "cancelled").length
  );
}

function renderBookingCard(booking) {
  const card = createElement(
    "article",
    `booking-card${booking.status === "cancelled" ? " cancelled" : ""}`
  );

  const main = createElement("div", "booking-main");
  const titleRow = createElement("div", "booking-title-row");
  const title = createElement("h3", "", booking.patientName);

  const badge = createElement(
    "span",
    `status-badge status-${booking.status}`,
    STATUS_LABELS[booking.status] || "غير معروف"
  );

  titleRow.append(title, badge);

  const details = createElement("div", "booking-details");

  details.append(
    createElement("span", "", `الهاتف: ${booking.patientPhone}`),
    createElement("span", "", `الموعد: ${formatDate(booking.appointmentDate)}`)
  );

  if (booking.service) {
    details.append(
      createElement("span", "", `الخدمة: ${booking.service}`)
    );
  }

  main.append(titleRow, details);

  if (booking.notes) {
    main.append(
      createElement("p", "booking-notes", `ملاحظات: ${booking.notes}`)
    );
  }

  const actions = createElement("div", "booking-actions");

  if (canEdit) {
    const editButton = createElement("button", "", "تعديل");
    editButton.type = "button";
    editButton.addEventListener("click", () => openEditor(booking));

    actions.append(editButton);

    if (booking.status !== "cancelled" && booking.status !== "completed") {
      const cancelButton = createElement(
        "button",
        "danger-button",
        "إلغاء الحجز"
      );

      cancelButton.type = "button";
      cancelButton.addEventListener("click", () => cancelBooking(booking));

      actions.append(cancelButton);
    }
  }

  card.append(main);

  if (actions.childElementCount) {
    card.append(actions);
  }

  return card;
}

function renderBookings() {
  const query = searchInput.value.trim().toLocaleLowerCase("ar");
  const selectedDate = filterDate.value;
  const selectedStatus = filterStatus.value;

  const filtered = bookings.filter((booking) => {
    const searchable = [
      booking.patientName,
      booking.patientPhone,
      booking.service
    ].join(" ").toLocaleLowerCase("ar");

    const matchesQuery = !query || searchable.includes(query);
    const matchesDate =
      !selectedDate || booking.appointmentDate.slice(0, 10) === selectedDate;
    const matchesStatus =
      selectedStatus === "all" || booking.status === selectedStatus;

    return matchesQuery && matchesDate && matchesStatus;
  });

  bookingsList.replaceChildren();

  for (const booking of filtered) {
    bookingsList.append(renderBookingCard(booking));
  }

  emptyState.hidden = filtered.length > 0;
}

async function loadBookings() {
  if (loading) return;

  loading = true;
  refreshButton.disabled = true;
  showMessage(listMessage, "");

  try {
    const result = await apiRequest("list");

    bookings = Array.isArray(result.bookings) ? result.bookings : [];
    accountVerified = true;
    setEditControls(result.permission === "edit");

    permissionLabel.textContent = canEdit
      ? "لديك صلاحية مشاهدة الحجوزات وتعديلها."
      : "صلاحيتك الحالية: مشاهدة الحجوزات فقط.";

    renderStats();
    renderBookings();
  } catch (error) {
    console.error("Loading bookings failed:", error);

    showMessage(
      listMessage,
      error.message || "تعذر تحميل الحجوزات.",
      true
    );

    if (!accountVerified) {
      showError(error.message || "تعذر التحقق من صلاحيات الحساب.");
    }
  } finally {
    loading = false;
    refreshButton.disabled = false;
  }
}

function resetEditor() {
  bookingForm.reset();
  bookingIdInput.value = "";
  statusInput.value = "pending";
  showMessage(formMessage, "");
  editorTitle.textContent = "إضافة حجز جديد";
  saveButton.textContent = "حفظ الحجز";
}

function openEditor(booking = null) {
  if (!canEdit) return;

  resetEditor();

  if (booking) {
    bookingIdInput.value = booking.id;
    patientNameInput.value = booking.patientName;
    patientPhoneInput.value = booking.patientPhone;

    appointmentDateInput.value = booking.appointmentDate.slice(0, 16);
    serviceInput.value = booking.service || "";
    notesInput.value = booking.notes || "";
    statusInput.value = booking.status;

    editorTitle.textContent = "تعديل الحجز";
    saveButton.textContent = "حفظ التعديلات";
  }

  editorPanel.hidden = false;
  editorPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  patientNameInput.focus();
}

function closeEditor() {
  editorPanel.hidden = true;
  resetEditor();
}

function readBookingForm() {
  return {
    patientName: patientNameInput.value.trim(),
    patientPhone: patientPhoneInput.value.trim(),
    appointmentDate: appointmentDateInput.value,
    service: serviceInput.value.trim(),
    notes: notesInput.value.trim(),
    status: statusInput.value
  };
}

async function saveBooking(event) {
  event.preventDefault();

  if (!canEdit) {
    showMessage(formMessage, "لا تملك صلاحية تعديل الحجوزات.", true);
    return;
  }

  const data = readBookingForm();
  const id = bookingIdInput.value;

  if (
    !data.patientName ||
    !data.patientPhone ||
    !data.appointmentDate
  ) {
    showMessage(
      formMessage,
      "يرجى إدخال اسم المريضة والهاتف وموعد الحجز.",
      true
    );
    return;
  }

  saveButton.disabled = true;
  showMessage(formMessage, "");

  try {
    if (id) {
      await apiRequest("update", {
        booking: { id, ...data }
      });
    } else {
      await apiRequest("create", { booking: data });
    }

    closeEditor();
    await loadBookings();
    showMessage(listMessage, "تم حفظ الحجز بنجاح.");
  } catch (error) {
    console.error("Saving booking failed:", error);

    showMessage(
      formMessage,
      error.message || "تعذر حفظ الحجز.",
      true
    );
  } finally {
    saveButton.disabled = false;
  }
}

async function cancelBooking(booking) {
  if (!canEdit) return;

  const confirmed = window.confirm(
    `هل تريد إلغاء حجز ${booking.patientName}؟`
  );

  if (!confirmed) return;

  try {
    await apiRequest("cancel", { id: booking.id });
    await loadBookings();
    showMessage(listMessage, "تم إلغاء الحجز.");
  } catch (error) {
    showMessage(
      listMessage,
      error.message || "تعذر إلغاء الحجز.",
      true
    );
  }
}

async function verifyAndLoad(user) {
  currentUser = user;
  showOnly(loadingSection);

  try {
    await loadBookings();

    if (!accountVerified) {
      return;
    }

    showOnly(appSection);
  } catch (error) {
    showError(error.message || "تعذر التحقق من الحساب.");
  }
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;

  if (!user) {
    window.location.replace("./index.html#patient-portal");
    return;
  }

  verifyAndLoad(user);
});

bookingForm.addEventListener("submit", saveBooking);

newBookingButton.addEventListener("click", () => openEditor());
closeEditorButton.addEventListener("click", closeEditor);
cancelEditorButton.addEventListener("click", closeEditor);

refreshButton.addEventListener("click", loadBookings);
retryButton.addEventListener("click", () => {
  if (currentUser) verifyAndLoad(currentUser);
});

searchInput.addEventListener("input", renderBookings);
filterDate.addEventListener("change", renderBookings);
filterStatus.addEventListener("change", renderBookings);

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;

  try {
    await signOut(auth);
    window.location.replace("./index.html#patient-portal");
  } catch (error) {
    console.error("Logout failed:", error);
    logoutButton.disabled = false;
    showError("تعذر تسجيل الخروج. حاول مرة أخرى.");
  }
});
