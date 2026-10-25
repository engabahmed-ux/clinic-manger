/* واجهة القائمة الجانبية وأصوات تفاعل خفيفة؛ لا يتعامل هذا الملف مع بيانات العيادة. */
(() => {
  const audio = { context: null };
  function playTapSound() {
    try {
      if (localStorage.getItem("clinicUiSounds") === "off") return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audio.context ||= new AudioContextClass();
      const context = audio.context;
      if (context.state === "suspended") context.resume().catch(() => {});
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(720, context.currentTime);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.018, context.currentTime + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.045);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(context.currentTime);
      oscillator.stop(context.currentTime + 0.05);
    } catch (_) {}
  }
  function closeMenu(sidebar, backdrop, toggle) {
    if (!sidebar) return;
    sidebar.classList.remove("is-open");
    sidebar.setAttribute("aria-hidden", "true");
    if (backdrop) backdrop.hidden = true;
    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "فتح قائمة التبويبات");
    }
  }
  function openMenu(sidebar, backdrop, toggle) {
    if (!sidebar) return;
    sidebar.classList.add("is-open");
    sidebar.setAttribute("aria-hidden", "false");
    if (backdrop) backdrop.hidden = false;
    if (toggle) {
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "إغلاق قائمة التبويبات");
    }
    sidebar.querySelector("[data-clinic-menu-close]")?.focus({ preventScroll: true });
  }
  for (const prefix of ["admin", "staff"]) {
    const sidebar = document.getElementById(prefix + "Sidebar");
    const backdrop = document.getElementById(prefix + "MenuBackdrop");
    const toggle = document.getElementById(prefix + "MenuToggle");
    if (!sidebar || !toggle) continue;
    toggle.addEventListener("click", () => {
      if (sidebar.classList.contains("is-open")) {
        closeMenu(sidebar, backdrop, toggle);
        toggle.focus({ preventScroll: true });
      } else openMenu(sidebar, backdrop, toggle);
    });
    backdrop?.addEventListener("click", () => {
      closeMenu(sidebar, backdrop, toggle);
      toggle.focus({ preventScroll: true });
    });
    sidebar.querySelectorAll("[data-clinic-menu-close]").forEach(button => button.addEventListener("click", () => {
      closeMenu(sidebar, backdrop, toggle);
      toggle.focus({ preventScroll: true });
    }));
    sidebar.addEventListener("click", event => {
      const tab = event.target.closest(".dashboard-tab, .staff-tab");
      if (!tab || !sidebar.contains(tab)) return;
      playTapSound();
      closeMenu(sidebar, backdrop, toggle);
    });
    sidebar.querySelectorAll("a, button").forEach(element => {
      if (element.matches(".dashboard-tab, .staff-tab, [data-clinic-menu-close]")) return;
      element.addEventListener("click", () => {
        if (element.id === "logoutButton" || element.id === "staffLogoutButton") closeMenu(sidebar, backdrop, toggle);
      });
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && sidebar.classList.contains("is-open")) {
        closeMenu(sidebar, backdrop, toggle);
        toggle.focus({ preventScroll: true });
      }
    });
  }
})();
