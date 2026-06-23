const header = document.querySelector("[data-header]");
const nav = document.querySelector("[data-nav]");
const menuButton = document.querySelector("[data-menu]");
const progressBar = document.querySelector(".progress span");
const revealItems = document.querySelectorAll(".reveal");
const parallaxTarget = document.querySelector("[data-parallax]");
const hero = document.querySelector(".hero");
const scrollDepthLayers = document.querySelectorAll("[data-scroll-depth]");
const tariffButtons = document.querySelectorAll("[data-select-tariff]");
const tariffCards = document.querySelectorAll("[data-tariff-card]");
const tariffSelect = document.querySelector("[data-tariff-select]");
const bookingForm = document.querySelector("[data-booking-form]");
const formStatus = document.querySelector("[data-form-status]");
const bookingDialog = document.querySelector("[data-booking-dialog]");
const bookingOpeners = document.querySelectorAll("[data-open-booking]");
const bookingClose = document.querySelector("[data-close-booking]");
const popupForm = document.querySelector("[data-popup-form]");
const popupStatus = document.querySelector("[data-popup-status]");
const popupTariffSelect = document.querySelector("[data-popup-tariff-select]");
const magneticTargets = document.querySelectorAll("[data-magnetic], .header-cta");
const spotlightTargets = document.querySelectorAll(".problem, .tariff-card");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = window.matchMedia("(pointer: fine)");
const leadEmail = "yarebrov@ya.ru";

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
}

function closeMenu() {
  nav?.classList.remove("is-open");
  menuButton?.setAttribute("aria-expanded", "false");
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

  if (typeof bookingDialog?.showModal === "function" && !bookingDialog.open) {
    bookingDialog.showModal();
  } else {
    bookingDialog?.setAttribute("open", "");
  }

  window.setTimeout(() => {
    popupForm?.querySelector("input, select, textarea, button")?.focus();
  }, 80);
}

function closeBookingDialog() {
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

function buildEmailBody(data) {
  const createdAt = new Date().toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return [
    "Новая заявка с сайта доктора Анны Гладкой",
    "",
    "ДАННЫЕ ПАЦИЕНТА",
    `Имя: ${getFormValue(data, "name")}`,
    `Контакт: ${getFormValue(data, "contact")}`,
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
    "СЛУЖЕБНО",
    `Источник: сайт-визитка`,
    `Дата заявки: ${createdAt}`,
  ].join("\n");
}

function submitLeadForm(form, statusElement) {
  const data = new FormData(form);
  const tariff = getFormValue(data, "tariff", "Оптимальный - 40 000 руб.");
  const subject = `Заявка на консультацию: ${tariff}`;
  const body = buildEmailBody(data);
  const mailtoUrl = `mailto:${leadEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  if (statusElement) {
    statusElement.textContent = `Письмо подготовлено для ${leadEmail}. Проверьте почтовое окно и отправьте заявку.`;
  }

  window.location.href = mailtoUrl;
}

function smoothScrollTo(targetY) {
  const startY = window.scrollY;
  const distance = clamp(targetY, 0, getMaxScroll()) - startY;
  const duration = clamp(Math.abs(distance) * 0.42, 360, 760);
  const startedAt = performance.now();

  if (reducedMotion.matches || Math.abs(distance) < 2) {
    window.scrollTo(0, startY + distance);
    return;
  }

  const easeOutCubic = (t) => 1 - (1 - t) ** 3;

  function tick(now) {
    const elapsed = clamp((now - startedAt) / duration, 0, 1);
    window.scrollTo(0, startY + distance * easeOutCubic(elapsed));

    if (elapsed < 1) {
      window.requestAnimationFrame(tick);
    }
  }

  window.requestAnimationFrame(tick);
}

menuButton?.addEventListener("click", () => {
  const isOpen = nav?.classList.toggle("is-open");
  menuButton.setAttribute("aria-expanded", String(Boolean(isOpen)));
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
      const x = (event.clientX - rect.left - rect.width / 2) * 0.08;
      const y = (event.clientY - rect.top - rect.height / 2) * 0.12;

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
}

bookingOpeners.forEach((button) => {
  button.addEventListener("click", () => openBookingDialog());
});

bookingClose?.addEventListener("click", closeBookingDialog);

bookingDialog?.addEventListener("click", (event) => {
  if (event.target === bookingDialog) {
    closeBookingDialog();
  }
});

bookingDialog?.addEventListener("close", () => {
  document.body.classList.remove("modal-open");
});

tariffButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const selectedTariff = button.dataset.selectTariff;
    syncTariff(selectedTariff);
    openBookingDialog(selectedTariff);
  });
});

bookingForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  submitLeadForm(bookingForm, formStatus);
});

popupForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  submitLeadForm(popupForm, popupStatus);
});
