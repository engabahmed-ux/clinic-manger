
export const APP_CONFIG = {
  appName: "موقع العيادة",

  clinic: {
    id: "reDa-elSherbiny-clinic",
    doctorName: "د. رضا الشربيني",
    specialty: "أخصائي النساء والتوليد",
    description:
      "رعاية طبية متخصصة ومتابعة دقيقة لصحة المرأة والأم والجنين.",
    phone: "01000000000",
    whatsapp: "201000000000",
    address: "اكتب عنوان العيادة هنا",
    logo: "",
doctorImage: "./doctor.jpg",
    workingHours: [
      { day: "السبت", hours: "5:00 مساءً - 9:00 مساءً" },
      { day: "الأحد", hours: "5:00 مساءً - 9:00 مساءً" },
      { day: "الاثنين", hours: "5:00 مساءً - 9:00 مساءً" },
      { day: "الثلاثاء", hours: "5:00 مساءً - 9:00 مساءً" },
      { day: "الأربعاء", hours: "5:00 مساءً - 9:00 مساءً" },
      { day: "الخميس", hours: "5:00 مساءً - 9:00 مساءً" },
      { day: "الجمعة", hours: "إجازة" }
    ]
  },

  branding: {
    background: "#11141A",
    surface: "#F9F5F1",
    accent: "#FFF25C",
    secondary: "#BFD2AF",
    headingFont: "Stack Sans Headline",
    bodyFont: "Cairo"
  },

  navigation: {
    home: "الرئيسية",
    about: "عن الطبيب",
    services: "الخدمات",
    booking: "حجز موعد",
    patientPortal: "بوابة المريض",
    menuLabel: "فتح القائمة",
    logoLabel: "العودة إلى الرئيسية"
  },

  hero: {
    eyebrow: "رعاية طبية تثق بها",
    titleLine1: "صحتك أولويتنا",
    highlightedTitle: "في كل مرحلة",
    titleLine2: "من حياتك",
    description:
      "رعاية ومتابعة طبية لصحة المرأة، مع اهتمام بالتفاصيل وحرص على راحتك في كل زيارة.",
    primaryButton: "احجزي موعدك",
    secondaryButton: "تعرّفي على الخدمات",
    note: "للحجز والاستفسار تواصلي مع العيادة",
    cardLabel: "رعاية ومتابعة",
    cardFooter: "اهتمام يبدأ من أول زيارة",
    floatingTitle: "رعايتك تهمنا",
    floatingDescription: "متابعة منظمة ومواعيد واضحة",
    visualLabel: "رعاية طبية متخصصة"
  },

  highlights: [
    {
      number: "1",
      title: "متابعة دقيقة",
      description: "اهتمام بالتفاصيل في كل زيارة."
    },
    {
      number: "2",
      title: "مواعيد منظمة",
      description: "إمكانية طلب موعد بسهولة."
    },
    {
      number: "3",
      title: "خصوصية المريضة",
      description: "الخصوصية جزء أساسي من الرعاية."
    }
  ],

  about: {
    sectionLabel: "عن الطبيب",
    title: "رعاية طبية",
    highlightedTitle: "بثقة واهتمام",
    titleEnd: "",
    paragraphs: [
      "يهدف الموقع إلى تسهيل التواصل مع العيادة وتنظيم المواعيد.",
      "يمكنك الاطلاع على الخدمات المتاحة وإرسال طلب حجز، ثم متابعة المواعيد من بوابة المريض بعد تفعيل حسابك."
    ],
    button: "احجزي موعدًا"
  },

  services: {
    sectionLabel: "خدمات العيادة",
    title: "خدمات تهتم",
    highlightedTitle: "بصحتك",
    description:
      "يمكن تخصيص أسماء الخدمات ووصفها بما يناسب تخصص كل طبيب.",
    items: [
      {
        id: "pregnancy-followup",
        title: "متابعة الحمل",
        description: "متابعة دورية للحمل وفق الخطة الطبية التي يحددها الطبيب.",
        icon: "⛨",
        enabled: true
      },
      {
        id: "women-health",
        title: "صحة المرأة",
        description: "استشارات ومتابعة للحالات المتعلقة بصحة المرأة.",
        icon: "⛨",
        enabled: true
      },
      {
        id: "consultation",
        title: "استشارات طبية",
        description: "مراجعة الحالة ومناقشة الاستفسارات الطبية مع الطبيب.",
        icon: "⛨",
        enabled: true
      }
    ]
  },

  booking: {
    enabled: true,
    sectionLabel: "حجز موعد",
    title: "ابدئي",
    highlightedTitle: "بحجز موعدك",
    description:
      "أدخلي بيانات التواصل الأساسية لإرسال طلب حجز إلى العيادة.",
    panelTitle: "طلب حجز جديد",
    panelDescription: "املئي البيانات التالية لإرسال طلبك.",
    patientNameLabel: "الاسم بالكامل",
    patientNamePlaceholder: "اكتبي الاسم بالكامل",
    patientPhoneLabel: "رقم الهاتف",
    patientPhonePlaceholder: "01xxxxxxxxx",
    appointmentDateLabel: "التاريخ المفضل",
    submitButton: "إرسال طلب الحجز",
    disclaimer:
      "إرسال الطلب لا يعني تأكيد الموعد. يجب تأكيده من العيادة.",
    successMessage: "تم تجهيز طلبك في هذه الواجهة التجريبية.",
    errorMessage: "يرجى التأكد من إدخال البيانات المطلوبة.",
    allowGuestBooking: true,
    requireDoctorApproval: true
  },

  patientPortal: {
    enabled: true,
    sectionLabel: "بوابة المريض",
    title: "مواعيدك",
    highlightedTitle: "في مكان واحد",
    description:
      "بعد إنشاء حسابك وتفعيله من العيادة، يمكنك تسجيل الدخول لمتابعة مواعيدك.",
    loginButton: "الدخول إلى بوابة المريض",
    loginTitle: "تسجيل دخول المريضة",
    emailLabel: "البريد الإلكتروني",
    emailPlaceholder: "name@example.com",
    passwordLabel: "كلمة المرور",
    passwordPlaceholder: "أدخلي كلمة المرور",
    loginSubmitButton: "تسجيل الدخول",
    forgotPasswordText: "نسيتِ كلمة المرور؟",
    logoutButton: "تسجيل الخروج",
    demoMessage:
      "بوابة المريض في هذه النسخة واجهة فقط، ولم يتم ربط تسجيل الدخول بـ Firebase بعد."
  },

  contact: {
    title: "تواصلي مع العيادة",
    description: "للاستفسارات ومعلومات الحجز، استخدمي بيانات التواصل التالية.",
    phoneLabel: "الهاتف",
    whatsappLabel: "واتساب",
    addressLabel: "العنوان",
    hoursLabel: "مواعيد العمل",
    whatsappButton: "التواصل عبر واتساب"
  },

  footer: {
    disclaimer:
      "المعلومات المنشورة بالموقع لا تغني عن استشارة الطبيب المختص.",
    copyrightPrefix: "©",
    copyrightSuffix: "جميع الحقوق محفوظة.",
    madeFor: "موقع العيادة"
  },

  localization: {
    language: "ar",
    direction: "rtl",
    locale: "ar-EG"
  }
};
