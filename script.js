const header = document.querySelector('[data-header]');
const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.site-nav');
const mainContent = document.querySelector('main');
const siteFooter = document.querySelector('.site-footer');
const brandLink = document.querySelector('.site-header .brand');
const skipLink = document.querySelector('.skip-link');

const setMenuState = (isOpen) => {
  menuButton.setAttribute('aria-expanded', String(isOpen));
  menuButton.setAttribute('aria-label', isOpen ? 'Закрыть меню' : 'Открыть меню');
  navigation.classList.toggle('is-open', isOpen);
  document.body.classList.toggle('menu-open', isOpen);
  mainContent.inert = isOpen;
  siteFooter.inert = isOpen;
  skipLink.inert = isOpen;
  if (isOpen) {
    brandLink.setAttribute('aria-hidden', 'true');
    brandLink.setAttribute('tabindex', '-1');
  } else {
    brandLink.removeAttribute('aria-hidden');
    brandLink.removeAttribute('tabindex');
  }
};

menuButton.addEventListener('click', () => {
  setMenuState(menuButton.getAttribute('aria-expanded') !== 'true');
});

navigation.addEventListener('click', (event) => {
  if (event.target.closest('a')) setMenuState(false);
});

const sectionCurtain = document.querySelector('.section-curtain');
const sectionLinks = document.querySelectorAll('a[href^="#"]:not(.skip-link)');
const waitForCurtain = () => new Promise((resolve) => window.setTimeout(resolve, 190));

const jumpToSection = (target, hash, shouldMoveFocus) => {
  const previousBehavior = document.documentElement.style.scrollBehavior;
  document.documentElement.style.scrollBehavior = 'auto';
  target.scrollIntoView({ block: 'start', behavior: 'auto' });
  document.documentElement.style.scrollBehavior = previousBehavior;
  window.history.pushState(null, '', hash);
  setActiveSection(target.id);

  if (shouldMoveFocus) {
    const focusTarget = target.querySelector('h1, h2') || target;
    focusTarget.setAttribute('tabindex', '-1');
    focusTarget.focus({ preventScroll: true });
    focusTarget.addEventListener('blur', () => focusTarget.removeAttribute('tabindex'), { once: true });
  }
};

sectionLinks.forEach((link) => {
  link.addEventListener('click', async (event) => {
    const hash = link.getAttribute('href');
    const target = hash === '#top' ? document.querySelector('#top') : document.querySelector(hash);
    if (!target) return;
    event.preventDefault();
    setMenuState(false);
    const shouldMoveFocus = event.detail === 0;

    if (reduceMotion) {
      jumpToSection(target, hash, shouldMoveFocus);
      return;
    }

    if (document.startViewTransition) {
      const transition = document.startViewTransition(() => jumpToSection(target, hash, shouldMoveFocus));
      await transition.finished;
      return;
    }

    sectionCurtain.classList.add('is-covering');
    await waitForCurtain();
    jumpToSection(target, hash, shouldMoveFocus);
    sectionCurtain.classList.remove('is-covering');
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
    setMenuState(false);
    menuButton.focus();
  }
});

const updateHeader = () => header.classList.toggle('is-scrolled', window.scrollY > 20);
updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

const chapterLinks = [...document.querySelectorAll('[data-chapter-link]')];
const chapterProgress = document.querySelector('.chapter-progress');
let progressTicking = false;

const updatePageProgress = () => {
  const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const progress = Math.min(1, Math.max(0, window.scrollY / scrollable));
  chapterProgress?.style.setProperty('--page-progress', progress.toFixed(4));
  progressTicking = false;
};

const requestProgressUpdate = () => {
  if (progressTicking) return;
  progressTicking = true;
  requestAnimationFrame(updatePageProgress);
};

updatePageProgress();
window.addEventListener('scroll', requestProgressUpdate, { passive: true });
window.addEventListener('resize', requestProgressUpdate);

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
document.querySelectorAll('.brand-logo').forEach((logo) => {
  logo.addEventListener('animationend', () => logo.classList.add('is-settled'), { once: true });
});
const revealElements = document.querySelectorAll('[data-reveal]');
const hero = document.querySelector('.hero');
const portraitPaths = hero.querySelectorAll('.portrait-line path');

portraitPaths.forEach((path) => {
  const length = path.getTotalLength();
  path.dataset.length = String(length);
  path.style.strokeDasharray = String(length);
  path.style.strokeDashoffset = String(length * 0.16);
});

if (!reduceMotion) {
  let heroTicking = false;
  const updateHeroScene = () => {
    const rect = hero.getBoundingClientRect();
    const travel = Math.max(1, rect.height - window.innerHeight);
    const progress = Math.min(1, Math.max(0, -rect.top / travel));
    hero.style.setProperty('--hero-progress', progress.toFixed(4));
    portraitPaths.forEach((path) => {
      const length = Number(path.dataset.length);
      path.style.strokeDashoffset = String(length * 0.16 * (1 - progress));
    });
    heroTicking = false;
  };
  const requestHeroUpdate = () => {
    if (heroTicking) return;
    heroTicking = true;
    requestAnimationFrame(updateHeroScene);
  };
  updateHeroScene();
  window.addEventListener('scroll', requestHeroUpdate, { passive: true });
  window.addEventListener('resize', requestHeroUpdate);
} else {
  portraitPaths.forEach((path) => { path.style.strokeDashoffset = '0'; });
}

if (reduceMotion || !('IntersectionObserver' in window)) {
  revealElements.forEach((element) => element.classList.add('is-visible'));
} else {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
  );
  revealElements.forEach((element) => revealObserver.observe(element));
}

const priceMatrix = {
  '30x40': { canvas: 22000, gift: 30000, legacy: 44000 },
  '40x50': { canvas: 32000, gift: 40000, legacy: 54000 },
  '50x60': { canvas: 42000, gift: 50000, legacy: 64000 },
  '50x70': { canvas: 48000, gift: 56000, legacy: 70000 },
  '60x80': { canvas: 65000, gift: 77000, legacy: 95000 },
  '80x100': { canvas: 95000, gift: 107000, legacy: 125000 },
};

const estimateForm = document.querySelector('#estimate-form');
const estimateValue = document.querySelector('#estimate-output strong');
const currency = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });

const updateEstimate = () => {
  const data = new FormData(estimateForm);
  const format = data.get('format');
  const packageName = data.get('package');
  const people = Number(data.get('people'));
  let multiplier = 1 + Math.max(0, people - 1) * 0.35;
  if (data.get('pet')) multiplier += 0.25;
  if (data.get('archive')) multiplier += 0.2;
  const price = Math.round((priceMatrix[format][packageName] * multiplier) / 1000) * 1000;
  estimateValue.textContent = currency.format(price);
};

estimateForm.addEventListener('change', updateEstimate);
updateEstimate();

const certificateDialog = document.querySelector('#certificate-dialog');
const certificateOpenButton = document.querySelector('[data-certificate-open]');
const certificateCloseButton = certificateDialog?.querySelector('[data-certificate-close]');
const certificateForm = document.querySelector('#certificate-builder');
const certificatePortraitFields = certificateForm?.querySelector('[data-certificate-portrait]');
const certificateAmountFields = certificateForm?.querySelector('[data-certificate-custom]');
const certificateAmountInput = certificateForm?.querySelector('input[name="certificate-amount"]');
const certificatePresetButtons = [...(certificateForm?.querySelectorAll('[data-certificate-preset]') || [])];
const certificateTotal = document.querySelector('#certificate-total');
const certificateSummaryCopy = document.querySelector('#certificate-summary-copy');
let certificateReturnFocus = null;
let certificateClosing = false;

const certificatePackageLabels = {
  canvas: 'Холст',
  gift: 'Подарок',
  legacy: 'Наследие',
};
const certificateFormatLabels = {
  '30x40': '30 × 40 см',
  '40x50': '40 × 50 см',
  '50x60': '50 × 60 см',
  '50x70': '50 × 70 см',
  '60x80': '60 × 80 см',
  '80x100': '80 × 100 см',
};
const certificatePeopleLabels = {
  1: 'один человек',
  2: 'два человека',
  3: 'три человека',
};

const updateCertificateBuilder = () => {
  if (!certificateForm) return;
  const data = new FormData(certificateForm);
  const mode = String(data.get('certificate-mode'));
  const isPortrait = mode === 'portrait';
  certificatePortraitFields.hidden = !isPortrait;
  certificateAmountFields.hidden = isPortrait;

  let total = 0;
  let summary = '';
  if (isPortrait) {
    const packageName = String(data.get('certificate-package'));
    const format = String(data.get('certificate-format'));
    const people = Number(data.get('certificate-people'));
    const multiplier = 1 + Math.max(0, people - 1) * 0.35;
    total = Math.round((priceMatrix[format][packageName] * multiplier) / 1000) * 1000;
    summary = `«${certificatePackageLabels[packageName]}» · ${certificateFormatLabels[format]} · ${certificatePeopleLabels[people]}`;
  } else {
    total = Math.max(1000, Number(data.get('certificate-amount')) || 0);
    summary = 'Свободный номинал · выбор сюжета останется получателю';
  }

  certificateTotal.textContent = currency.format(total);
  certificateSummaryCopy.textContent = summary;
  certificatePresetButtons.forEach((button) => {
    button.classList.toggle('is-active', Number(button.dataset.certificatePreset) === total);
  });
};

const closeCertificateDialog = () => {
  if (!certificateDialog?.open || certificateClosing) return;
  certificateClosing = true;
  certificateDialog.classList.add('is-closing');
  window.setTimeout(() => {
    certificateDialog.close();
    certificateDialog.classList.remove('is-closing');
    document.body.classList.remove('cert-modal-open');
    certificateClosing = false;
    certificateReturnFocus?.focus();
  }, reduceMotion ? 0 : 220);
};

certificateOpenButton?.addEventListener('click', () => {
  certificateReturnFocus = document.activeElement;
  certificateDialog.classList.remove('is-closing');
  certificateDialog.showModal();
  document.body.classList.add('cert-modal-open');
  updateCertificateBuilder();
  window.requestAnimationFrame(() => certificateForm.querySelector('input:checked')?.focus());
});

certificateCloseButton?.addEventListener('click', closeCertificateDialog);
certificateDialog?.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeCertificateDialog();
});
certificateDialog?.addEventListener('click', (event) => {
  if (event.target === certificateDialog) closeCertificateDialog();
});
certificateForm?.addEventListener('change', updateCertificateBuilder);
certificateForm?.addEventListener('input', updateCertificateBuilder);
certificatePresetButtons.forEach((button) => {
  button.addEventListener('click', () => {
    certificateAmountInput.value = button.dataset.certificatePreset;
    updateCertificateBuilder();
  });
});

certificateForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(certificateForm);
  const mode = String(data.get('certificate-mode'));
  const storyInput = document.querySelector('#brief-story');
  const formatSelect = document.querySelector('#brief-format');
  const contactTarget = document.querySelector('#contact');
  let requestText = '';

  if (mode === 'portrait') {
    const packageName = String(data.get('certificate-package'));
    const format = String(data.get('certificate-format'));
    const people = Number(data.get('certificate-people'));
    requestText = `Хочу оформить подарочный сертификат: вариант «${certificatePackageLabels[packageName]}», формат ${certificateFormatLabels[format]}, ${certificatePeopleLabels[people]}. Ориентир — ${certificateTotal.textContent}.`;
    formatSelect.value = certificateFormatLabels[format];
  } else {
    requestText = `Хочу оформить подарочный сертификат со свободным номиналом ${certificateTotal.textContent}.`;
    formatSelect.value = 'Помогите выбрать';
  }

  storyInput.value = requestText;
  formStatus.className = 'form-status is-success';
  formStatus.textContent = 'Выбор сертификата перенесён в заявку. Проверьте детали и выберите мессенджер.';
  closeCertificateDialog();
  window.setTimeout(() => {
    jumpToSection(contactTarget, '#contact', false);
    storyInput.focus({ preventScroll: true });
  }, reduceMotion ? 0 : 240);
});

document.querySelectorAll('.reveal').forEach((reveal) => {
  const range = reveal.querySelector('.reveal-range');
  const frame = reveal.querySelector('.reveal-frame');
  if (!range || !frame) return;

  const apply = (value) => {
    const clamped = Math.max(0, Math.min(100, value));
    reveal.style.setProperty('--reveal', `${clamped}%`);
    range.value = String(Math.round(clamped));
  };

  apply(Number(range.value));
  range.addEventListener('input', () => apply(Number(range.value)));

  let dragging = false;
  const trackPointer = (event) => {
    const rect = frame.getBoundingClientRect();
    apply(((event.clientX - rect.left) / rect.width) * 100);
  };
  const endDrag = () => { dragging = false; };

  frame.addEventListener('pointerdown', (event) => {
    dragging = true;
    frame.setPointerCapture(event.pointerId);
    trackPointer(event);
  });
  frame.addEventListener('pointermove', (event) => { if (dragging) trackPointer(event); });
  frame.addEventListener('pointerup', endDrag);
  frame.addEventListener('pointercancel', endDrag);
});

const workFilterButtons = [...document.querySelectorAll('[data-work-filter]')];
const workCards = [...document.querySelectorAll('[data-work-type]')];
const worksStatus = document.querySelector('#works-status');

workFilterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const selectedType = button.dataset.workFilter;
    let visibleCount = 0;

    workFilterButtons.forEach((filterButton) => {
      const isActive = filterButton === button;
      filterButton.classList.toggle('is-active', isActive);
      filterButton.setAttribute('aria-pressed', String(isActive));
    });

    workCards.forEach((card) => {
      const isVisible = selectedType === 'all' || card.dataset.workType === selectedType;
      card.hidden = !isVisible;
      if (isVisible) visibleCount += 1;
    });

    worksStatus.textContent = `Показано: ${visibleCount}`;
  });
});

const mobileContactBar = document.querySelector('.mobile-contact-bar');
const worksSection = document.querySelector('#works');
let mobileContactTicking = false;

const updateMobileContactBar = () => {
  if (!mobileContactBar || !worksSection) return;
  const shouldShow = window.scrollY + header.offsetHeight >= worksSection.offsetTop;
  mobileContactBar.classList.toggle('is-visible', shouldShow);
  mobileContactTicking = false;
};

const requestMobileContactUpdate = () => {
  if (mobileContactTicking) return;
  mobileContactTicking = true;
  window.requestAnimationFrame(updateMobileContactBar);
};

updateMobileContactBar();
window.addEventListener('scroll', requestMobileContactUpdate, { passive: true });
window.addEventListener('resize', requestMobileContactUpdate);

const briefForm = document.querySelector('#brief-form');
const formStatus = document.querySelector('#form-status');

briefForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(briefForm);
  const name = String(data.get('name') || '').trim();
  const story = String(data.get('story') || '').trim();
  const format = String(data.get('format') || 'Помогите выбрать');
  const messenger = String(data.get('messenger') || 'telegram');
  const message = [
    'Здравствуйте, Юлия! Хочу обсудить портрет.',
    name ? `Меня зовут ${name}.` : '',
    `Задача: ${story}`,
    `Формат: ${format}.`,
    'Подскажите, пожалуйста, какие фотографии лучше прислать для оценки?',
  ].filter(Boolean).join('\n');

  const button = briefForm.querySelector('button[type="submit"]');
  const messengerUrl = messenger === 'max'
    ? `https://max.ru/:share?text=${encodeURIComponent(message)}`
    : `https://t.me/artist_julia?text=${encodeURIComponent(message)}`;

  button.setAttribute('aria-busy', 'true');
  formStatus.className = 'form-status is-success';
  formStatus.textContent = messenger === 'max'
    ? 'Открываю MAX с готовым текстом…'
    : 'Открываю Telegram с готовым текстом…';

  const messengerLink = document.createElement('a');
  messengerLink.href = messengerUrl;
  messengerLink.target = '_blank';
  messengerLink.rel = 'noopener noreferrer';
  messengerLink.click();
  button.removeAttribute('aria-busy');
});

const observedSections = document.querySelectorAll('main section[id]');
const navLinks = [...navigation.querySelectorAll('a[href^="#"]'), ...chapterLinks];
let sectionTicking = false;

function setActiveSection(sectionId) {
  navLinks.forEach((link) => {
    const isCurrent = link.getAttribute('href') === `#${sectionId}`;
    if (isCurrent) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  });
  document.body.classList.toggle('is-dark-chapter', sectionId === 'prices');
}

const updateActiveSection = () => {
  const focusLine = window.innerHeight * 0.42;
  let activeSection = observedSections[0];

  observedSections.forEach((section) => {
    const rect = section.getBoundingClientRect();
    if (rect.top <= focusLine && rect.bottom > focusLine) activeSection = section;
  });

  if (activeSection) setActiveSection(activeSection.id);
  sectionTicking = false;
};

const requestSectionUpdate = () => {
  if (sectionTicking) return;
  sectionTicking = true;
  requestAnimationFrame(updateActiveSection);
};

updateActiveSection();
window.addEventListener('scroll', requestSectionUpdate, { passive: true });
window.addEventListener('resize', requestSectionUpdate);
