const header = document.querySelector("[data-header]");
const nav = document.querySelector("[data-nav]");
const menuButton = document.querySelector("[data-menu]");
const progressBar = document.querySelector(".progress span");
const revealItems = document.querySelectorAll(".reveal");
const navLinks = document.querySelectorAll('.main-nav a[href^="#"]');
const parallaxTarget = document.querySelector("[data-parallax]");
const hero = document.querySelector(".hero");
const scrollDepthLayers = document.querySelectorAll("[data-scroll-depth]");
const tariffButtons = document.querySelectorAll("[data-select-tariff]");
const tariffCards = document.querySelectorAll("[data-tariff-card]");
const tariffSelect = document.querySelector("[data-tariff-select]");
const bookingForm = document.querySelector("[data-booking-form]");
const formStatus = document.querySelector("[data-form-status]");
const bookingDialog = document.querySelector("[data-booking-dialog]");
const bookingClose = document.querySelector("[data-close-booking]");
const popupForm = document.querySelector("[data-popup-form]");
const popupStatus = document.querySelector("[data-popup-status]");
const popupTariffSelect = document.querySelector("[data-popup-tariff-select]");
const fileInputs = document.querySelectorAll("[data-file-input]");
const phoneInputs = document.querySelectorAll("[data-phone-mask]");
const documentDialog = document.querySelector("[data-document-dialog]");
const documentFrame = document.querySelector("[data-document-frame]");
const documentTitle = document.querySelector("[data-document-heading]");
const documentDownload = document.querySelector("[data-document-download]");
const documentExternal = document.querySelector("[data-document-external]");
const documentClose = document.querySelector("[data-document-close]");
const documentOpeners = document.querySelectorAll("[data-document-src]");
const cookieConsent = document.querySelector("[data-cookie-consent]");
const cookieChoices = document.querySelectorAll("[data-cookie-choice]");
const cookieSettings = document.querySelectorAll("[data-cookie-settings]");
const magneticTargets = document.querySelectorAll("[data-magnetic], .header-cta");
const spotlightTargets = document.querySelectorAll(".problem, .format-step, .analysis-panel, .analysis-flow, .tariff-card, .booking-form, .booking-modal-form");
const motionCards = document.querySelectorAll(".problem, .format-step, .analysis-panel, .analysis-flow, .tariff-card");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = window.matchMedia("(pointer: fine)");
const leadEmail = "yarebrov@ya.ru";
const cookieConsentKey = "ag_cookie_consent_v1";
const cookieConsentChoices = new Set(["all", "necessary", "reject"]);
let documentReturnFocus = null;
let cookieReturnFocus = null;

revealItems.forEach((item, index) => {
  const section = item.closest("section, .booking-dialog");
  const sectionItems = section ? Array.from(section.querySelectorAll(".reveal")) : Array.from(revealItems);
  const sectionIndex = Math.max(sectionItems.indexOf(item), 0);

  item.style.setProperty("--reveal-delay", `${Math.min((sectionIndex % 6) * 70, 350)}ms`);

  if (item.matches(".problem, .format-step, .analysis-panel, .analysis-flow, .tariff-card, .booking-form")) {
    item.dataset.motion = item.dataset.motion || "card";
  } else if (item.matches(".result-item")) {
    item.dataset.motion = item.dataset.motion || "copy";
  } else if (item.matches(".hero-copy, .approach-copy, .section-heading, .tariffs-heading, .contact-copy")) {
    item.dataset.motion = item.dataset.motion || "copy";
  }
});

const navSections = Array.from(navLinks)
  .map((link) => {
    const target = link.hash ? document.querySelector(link.hash) : null;
    return target ? { link, target } : null;
  })
  .filter(Boolean)
  .sort((a, b) => a.target.offsetTop - b.target.offsetTop);

const tariffMap = new Map([
  ["Стандартный", "Стандартный - 25 000 руб."],
  ["Оптимальный", "Оптимальный - 40 000 руб."],
  ["Комплексное сопровождение", "Комплексное сопровождение - 85 000 руб."],
]);

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getMaxScroll() {
  return Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
}

function updateScrollState() {
  const scrollTop = window.scrollY;
  const maxScroll = getMaxScroll();
  const progress = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0;

  header?.classList.toggle("is-scrolled", scrollTop > 24);
  progressBar?.style.setProperty("--scroll-progress", `${progress}%`);

  if (hero && scrollDepthLayers.length > 0) {
    const heroRect = hero.getBoundingClientRect();
    const heroProgress = clamp(-heroRect.top / Math.max(heroRect.height, 1), 0, 1);

    scrollDepthLayers.forEach((layer) => {
      const depth = Number(layer.dataset.scrollDepth || 0);
      layer.style.setProperty("--scroll-y", `${heroProgress * depth}px`);
    });
  }

  updateActiveNav(scrollTop);
}

function updateActiveNav(scrollTop = window.scrollY) {
  if (navSections.length === 0) {
    return;
  }

  const offset = (header?.getBoundingClientRect().height ?? 0) + window.innerHeight * 0.24;
  let activeLink = null;

  navSections.forEach(({ link, target }) => {
    if (target.offsetTop - offset <= scrollTop) {
      activeLink = link;
    }
  });

  navLinks.forEach((link) => {
    const isActive = link === activeLink;
    link.classList.toggle("is-active", isActive);

    if (isActive) {
      link.setAttribute("aria-current", "true");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function closeMenu() {
  nav?.classList.remove("is-open");
  header?.classList.remove("menu-open");
  menuButton?.setAttribute("aria-expanded", "false");
  menuButton?.setAttribute("aria-label", "Открыть меню");
}

function syncTariff(selectedTariff) {
  const selectValue = tariffMap.get(selectedTariff ?? "") || selectedTariff;

  tariffCards.forEach((card) => card.classList.remove("is-selected"));

  if (selectedTariff) {
    document.querySelector(`[data-select-tariff="${selectedTariff}"]`)?.closest("[data-tariff-card]")?.classList.add("is-selected");
  }

  if (tariffSelect && selectValue) {
    tariffSelect.value = selectValue;
  }

  if (popupTariffSelect && selectValue) {
    popupTariffSelect.value = selectValue;
  }
}

function openBookingDialog(selectedTariff) {
  if (selectedTariff) {
    syncTariff(selectedTariff);
  } else if (popupTariffSelect && tariffSelect) {
    popupTariffSelect.value = tariffSelect.value;
  }

  if (popupStatus) {
    popupStatus.textContent = "";
  }

  document.body.classList.add("modal-open");
  bookingDialog?.classList.remove("is-closing");

  if (typeof bookingDialog?.showModal === "function" && !bookingDialog.open) {
    bookingDialog.showModal();
  } else {
    bookingDialog?.setAttribute("open", "");
  }

  window.setTimeout(() => {
    popupForm?.querySelector("input, select, textarea, button")?.focus();
  }, reducedMotion.matches ? 40 : 180);
}

function closeBookingDialog() {
  if (!bookingDialog) {
    return;
  }

  if (!reducedMotion.matches && bookingDialog.open) {
    bookingDialog.classList.add("is-closing");

    window.setTimeout(() => {
      if (bookingDialog.open && typeof bookingDialog.close === "function") {
        bookingDialog.close();
      } else {
        bookingDialog.removeAttribute("open");
        document.body.classList.remove("modal-open");
      }

      bookingDialog.classList.remove("is-closing");
    }, 220);

    return;
  }

  if (bookingDialog?.open && typeof bookingDialog.close === "function") {
    bookingDialog.close();
  } else {
    bookingDialog?.removeAttribute("open");
    document.body.classList.remove("modal-open");
  }
}

function getFormValue(data, name, fallback = "Не указано") {
  const value = String(data.get(name) || "").trim();
  return value || fallback;
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "размер не указан";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.ceil(bytes / 1024)} КБ`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function getSelectedFiles(data) {
  return data
    .getAll("analysisFiles")
    .filter((file) => file && typeof file === "object" && "name" in file && file.name);
}

function formatSelectedFiles(files) {
  if (files.length === 0) {
    return "Файлы не выбраны";
  }

  return files.map((file) => `${file.name} (${formatFileSize(file.size)})`).join("; ");
}

function updateFileSummary(input) {
  const summary = input.closest(".file-field")?.querySelector("[data-file-summary]");

  if (!summary) {
    return;
  }

  const files = Array.from(input.files || []);
  summary.textContent = files.length > 0
    ? `Выбрано: ${formatSelectedFiles(files)}`
    : "Можно выбрать PDF, фото или документы с анализами.";
}

function formatRussianPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");

  if (digits.startsWith("7") || digits.startsWith("8")) {
    digits = digits.slice(1);
  }

  digits = digits.slice(0, 10);

  if (digits.length === 0) {
    return "+7 ";
  }

  let formatted = `+7 (${digits.slice(0, 3)}`;

  if (digits.length < 3) {
    return formatted;
  }

  formatted += ")";

  if (digits.length > 3) {
    formatted += ` ${digits.slice(3, 6)}`;
  }

  if (digits.length > 6) {
    formatted += `-${digits.slice(6, 8)}`;
  }

  if (digits.length > 8) {
    formatted += `-${digits.slice(8, 10)}`;
  }

  return formatted;
}

function validatePhoneInput(input) {
  const nationalDigits = input.value.replace(/\D/g, "").replace(/^[78]/, "");
  const isComplete = nationalDigits.length === 10;

  input.setCustomValidity(input.value && !isComplete ? "Введите номер полностью: +7 (999) 000-00-00" : "");
}

function placeCaretAtEnd(input) {
  window.requestAnimationFrame(() => {
    const end = input.value.length;
    input.setSelectionRange?.(end, end);
  });
}

function parseCookieConsent(value) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return cookieConsentChoices.has(parsed?.choice) ? parsed : null;
  } catch {
    return cookieConsentChoices.has(value) ? { choice: value } : null;
  }
}

function readCookieConsent() {
  try {
    const stored = parseCookieConsent(window.localStorage.getItem(cookieConsentKey));

    if (stored) {
      return stored;
    }
  } catch {
    // Storage can be unavailable in privacy-restricted browser modes.
  }

  const cookieValue = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${cookieConsentKey}=`))
    ?.split("=")
    .slice(1)
    .join("=");

  return parseCookieConsent(cookieValue ? decodeURIComponent(cookieValue) : "");
}

function applyCookieConsent(consent) {
  const choice = cookieConsentChoices.has(consent?.choice) ? consent.choice : "reject";
  const detail = {
    choice,
    necessary: true,
    analytics: choice === "all",
    marketing: choice === "all",
  };

  document.documentElement.dataset.cookiePreference = choice;
  window.agCookieConsent = detail;
  window.dispatchEvent(new CustomEvent("ag:cookie-consent", { detail }));
}

function saveCookieConsent(choice) {
  if (!cookieConsentChoices.has(choice)) {
    return;
  }

  const consent = {
    choice,
    updatedAt: new Date().toISOString(),
  };
  const serialized = JSON.stringify(consent);

  try {
    window.localStorage.setItem(cookieConsentKey, serialized);
  } catch {
    // The essential preference cookie below remains as a fallback.
  }

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${cookieConsentKey}=${encodeURIComponent(serialized)}; Max-Age=15552000; Path=/; SameSite=Lax${secure}`;
  applyCookieConsent(consent);
}

function showCookieConsent(returnFocus = null) {
  if (!cookieConsent) {
    return;
  }

  cookieReturnFocus = returnFocus instanceof HTMLElement ? returnFocus : null;
  cookieConsent.hidden = false;
  document.body.classList.add("cookie-banner-visible");

  window.requestAnimationFrame(() => {
    cookieConsent.classList.add("is-visible");

    if (cookieReturnFocus) {
      cookieConsent.querySelector("[data-cookie-choice]")?.focus({ preventScroll: true });
    }
  });
}

function hideCookieConsent() {
  if (!cookieConsent) {
    return;
  }

  cookieConsent.classList.remove("is-visible");
  document.body.classList.remove("cookie-banner-visible");

  window.setTimeout(() => {
    cookieConsent.hidden = true;
    cookieReturnFocus?.focus({ preventScroll: true });
    cookieReturnFocus = null;
  }, reducedMotion.matches ? 0 : 300);
}

function buildEmailBody(data) {
  const createdAt = new Date().toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const selectedFiles = getSelectedFiles(data);
  const personalDataConsent = data.has("personalDataConsent") ? "ДАНО" : "НЕ ДАНО";
  const marketingConsent = data.has("marketingConsent") ? "ДАНО" : "НЕ ДАНО";

  return [
    "Новая заявка с сайта доктора Анны Владимировны Гладкой",
    "",
    "ДАННЫЕ КЛИЕНТА",
    `Имя: ${getFormValue(data, "name")}`,
    `Телефон: ${getFormValue(data, "contact")}`,
    `Email: ${getFormValue(data, "email")}`,
    "",
    "ВЫБРАННЫЙ ФОРМАТ",
    getFormValue(data, "tariff", "Оптимальный - 40 000 руб."),
    "",
    "УДОБНОЕ ВРЕМЯ",
    getFormValue(data, "time") ,
    "",
    "ЗАПРОС",
    getFormValue(data, "message"),
    "",
    "АНАЛИЗЫ И ДОКУМЕНТЫ",
    formatSelectedFiles(selectedFiles),
    selectedFiles.length > 0 ? "Важно: прикрепите выбранные файлы к этому письму перед отправкой." : "",
    "",
    "СОГЛАСИЯ КЛИЕНТА",
    `Обработка персональных данных: ${personalDataConsent}`,
    `Информационная и рекламная рассылка: ${marketingConsent}`,
    `Подтверждение: отметка чекбокса в форме сайта, ${createdAt}`,
    `Субъект согласия: ${getFormValue(data, "name")}; ${getFormValue(data, "contact")}; ${getFormValue(data, "email")}`,
    "Документы: согласие на обработку ПД, политика обработки ПД, согласие на рассылку размещены на сайте.",
    "",
    "СЛУЖЕБНО",
    `Источник: сайт-визитка`,
    `Дата заявки: ${createdAt}`,
  ].join("\n");
}

function submitLeadForm(form, statusElement) {
  if (!form.reportValidity()) {
    return;
  }

  const data = new FormData(form);
  const tariff = getFormValue(data, "tariff", "Оптимальный - 40 000 руб.");
  const subject = `Заявка на консультацию: ${tariff}`;
  const body = buildEmailBody(data);
  const mailtoUrl = `mailto:${leadEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const selectedFiles = getSelectedFiles(data);

  if (statusElement) {
    statusElement.textContent = selectedFiles.length > 0
      ? `Письмо подготовлено для ${leadEmail}. Прикрепите выбранные файлы в почтовом окне и отправьте заявку.`
      : `Письмо подготовлено для ${leadEmail}. Проверьте почтовое окно и отправьте заявку.`;
  }

  window.location.href = mailtoUrl;
}

function openDocumentDialog(source, title) {
  if (!documentDialog || !source) {
    return;
  }

  documentReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  if (documentTitle) {
    documentTitle.textContent = title || "Юридический документ";
  }

  if (documentFrame) {
    documentFrame.src = source;
    documentFrame.title = title || "Просмотр юридического документа";
  }

  [documentDownload, documentExternal].forEach((link) => {
    if (link) {
      link.href = source;
    }
  });

  document.body.classList.add("modal-open");

  if (typeof documentDialog.showModal === "function" && !documentDialog.open) {
    documentDialog.showModal();
  } else {
    documentDialog.setAttribute("open", "");
  }

  window.setTimeout(() => documentClose?.focus(), reducedMotion.matches ? 20 : 180);
}

function closeDocumentDialog() {
  if (!documentDialog) {
    return;
  }

  if (documentDialog.open && typeof documentDialog.close === "function") {
    documentDialog.close();
  } else {
    documentDialog.removeAttribute("open");
  }
}

function smoothScrollTo(targetY) {
  const startY = window.scrollY;
  const distance = clamp(targetY, 0, getMaxScroll()) - startY;
  const duration = clamp(Math.abs(distance) * 0.34, 380, 980);
  const startedAt = performance.now();

  if (reducedMotion.matches || Math.abs(distance) < 2) {
    window.scrollTo(0, startY + distance);
    return;
  }

  const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

  function tick(now) {
    const elapsed = clamp((now - startedAt) / duration, 0, 1);
    window.scrollTo(0, startY + distance * easeInOutSine(elapsed));

    if (elapsed < 1) {
      window.requestAnimationFrame(tick);
    }
  }

  window.requestAnimationFrame(tick);
}

menuButton?.addEventListener("click", () => {
  const isOpen = nav?.classList.toggle("is-open");
  menuButton.setAttribute("aria-expanded", String(Boolean(isOpen)));
  menuButton.setAttribute("aria-label", isOpen ? "Закрыть меню" : "Открыть меню");
  header?.classList.toggle("menu-open", Boolean(isOpen));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && nav?.classList.contains("is-open")) {
    closeMenu();
    menuButton?.focus();
  }
});

document.addEventListener("pointerdown", (event) => {
  if (
    nav?.classList.contains("is-open") &&
    event.target instanceof Node &&
    !header?.contains(event.target)
  ) {
    closeMenu();
  }
});

nav?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    closeMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenu();
  }
});

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    if (!(link instanceof HTMLAnchorElement) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const hash = link.getAttribute("href");
    const target = hash && hash.length > 1 ? document.querySelector(hash) : null;

    if (!target) {
      return;
    }

    event.preventDefault();
    closeMenu();
    const headerOffset = header?.getBoundingClientRect().height ?? 0;
    const targetTop = target.getBoundingClientRect().top + window.scrollY - Math.min(headerOffset, 92);
    smoothScrollTo(targetTop);
    history.pushState(null, "", hash);
  });
});

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.01, rootMargin: "0px 0px 18% 0px" },
  );

  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

window.addEventListener("scroll", updateScrollState, { passive: true });
window.addEventListener("resize", updateScrollState);
updateScrollState();

fileInputs.forEach((input) => {
  updateFileSummary(input);
  input.addEventListener("change", () => updateFileSummary(input));
});

phoneInputs.forEach((input) => {
  input.addEventListener("focus", () => {
    if (!input.value) {
      input.value = "+7 ";
    }

    placeCaretAtEnd(input);
  });

  input.addEventListener("input", () => {
    input.value = formatRussianPhone(input.value);
    validatePhoneInput(input);
    placeCaretAtEnd(input);
  });

  input.addEventListener("blur", () => {
    if (input.value.replace(/\D/g, "") === "7") {
      input.value = "";
    }

    validatePhoneInput(input);
  });
});

window.addEventListener(
  "pointermove",
  (event) => {
    if (!parallaxTarget || reducedMotion.matches) {
      return;
    }

    const x = (event.clientX / window.innerWidth - 0.5) * 12;
    const y = (event.clientY / window.innerHeight - 0.5) * 10;
    parallaxTarget.style.setProperty("--parallax-x", `${x}px`);
    parallaxTarget.style.setProperty("--parallax-y", `${y}px`);
  },
  { passive: true },
);

if (!reducedMotion.matches && finePointer.matches) {
  magneticTargets.forEach((target) => {
    target.addEventListener("pointermove", (event) => {
      const rect = target.getBoundingClientRect();
      const x = (event.clientX - rect.left - rect.width / 2) * 0.045;
      const y = (event.clientY - rect.top - rect.height / 2) * 0.06;

      target.style.setProperty("--magnet-x", `${x.toFixed(2)}px`);
      target.style.setProperty("--magnet-y", `${y.toFixed(2)}px`);
    });

    target.addEventListener("pointerleave", () => {
      target.style.setProperty("--magnet-x", "0px");
      target.style.setProperty("--magnet-y", "0px");
    });
  });

  spotlightTargets.forEach((target) => {
    target.addEventListener("pointermove", (event) => {
      const rect = target.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;

      target.style.setProperty("--spot-x", `${x.toFixed(1)}%`);
      target.style.setProperty("--spot-y", `${y.toFixed(1)}%`);
    });
  });

  motionCards.forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;

      card.style.setProperty("--tilt-x", `${(-y * 1.7).toFixed(2)}deg`);
      card.style.setProperty("--tilt-y", `${(x * 1.4).toFixed(2)}deg`);
    });

    card.addEventListener("pointerleave", () => {
      card.style.setProperty("--tilt-x", "0deg");
      card.style.setProperty("--tilt-y", "0deg");
    });
  });
}

bookingClose?.addEventListener("click", closeBookingDialog);

bookingDialog?.addEventListener("click", (event) => {
  if (event.target === bookingDialog) {
    closeBookingDialog();
  }
});

bookingDialog?.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeBookingDialog();
});

bookingDialog?.addEventListener("close", () => {
  document.body.classList.toggle("modal-open", Boolean(documentDialog?.open));
  bookingDialog.classList.remove("is-closing");
});

documentOpeners.forEach((button) => {
  button.addEventListener("click", () => {
    openDocumentDialog(button.dataset.documentSrc, button.dataset.documentTitle);
  });
});

documentClose?.addEventListener("click", closeDocumentDialog);

documentDialog?.addEventListener("click", (event) => {
  if (event.target === documentDialog) {
    closeDocumentDialog();
  }
});

documentDialog?.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDocumentDialog();
});

documentDialog?.addEventListener("close", () => {
  if (documentFrame) {
    documentFrame.removeAttribute("src");
  }

  document.body.classList.toggle("modal-open", Boolean(bookingDialog?.open));
  documentReturnFocus?.focus();
  documentReturnFocus = null;
});

tariffButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const selectedTariff = button.dataset.selectTariff;
    syncTariff(selectedTariff);
    openBookingDialog(selectedTariff);
  });
});

cookieChoices.forEach((button) => {
  button.addEventListener("click", () => {
    saveCookieConsent(button.dataset.cookieChoice);
    hideCookieConsent();
  });
});

cookieSettings.forEach((button) => {
  button.addEventListener("click", () => showCookieConsent(button));
});

const savedCookieConsent = readCookieConsent();

if (savedCookieConsent) {
  applyCookieConsent(savedCookieConsent);
} else {
  window.setTimeout(() => showCookieConsent(), reducedMotion.matches ? 0 : 550);
}

bookingForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  submitLeadForm(bookingForm, formStatus);
});

popupForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  submitLeadForm(popupForm, popupStatus);
});
