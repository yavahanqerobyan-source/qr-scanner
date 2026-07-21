(() => {
  'use strict';

  const readMeta = (name) => document.querySelector(`meta[name="${name}"]`)?.content.trim() || '';
  const ga4Id = readMeta('ga4-measurement-id');
  const metrikaId = readMeta('yandex-metrika-id');
  const validGa4Id = /^G-[A-Z0-9]+$/i.test(ga4Id) ? ga4Id : '';
  const validMetrikaId = /^\d+$/.test(metrikaId) ? Number(metrikaId) : 0;
  const consentKey = 'julia_rebrova_analytics_consent';

  window.dataLayer = window.dataLayer || [];

  const sanitizeProperties = (properties = {}) => Object.fromEntries(
    Object.entries(properties)
      .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
      .map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 120) : value]),
  );

  const track = (eventName, properties = {}) => {
    const safeProperties = sanitizeProperties(properties);
    window.dataLayer.push({ event: eventName, ...safeProperties });

    if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, safeProperties);
    }

    if (validMetrikaId && typeof window.ym === 'function') {
      window.ym(validMetrikaId, 'reachGoal', eventName, safeProperties);
    }
  };

  const loadGoogleAnalytics = () => {
    if (!validGa4Id || document.querySelector('script[data-analytics-provider="ga4"]')) return;

    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    });
    window.gtag('consent', 'update', { analytics_storage: 'granted' });
    window.gtag('js', new Date());
    window.gtag('config', validGa4Id, { anonymize_ip: true, send_page_view: true });

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(validGa4Id)}`;
    script.dataset.analyticsProvider = 'ga4';
    document.head.append(script);
  };

  const loadYandexMetrika = () => {
    if (!validMetrikaId || document.querySelector('script[data-analytics-provider="metrika"]')) return;

    window.ym = window.ym || function ym() { (window.ym.a = window.ym.a || []).push(arguments); };
    window.ym.l = Date.now();
    window.ym(validMetrikaId, 'init', {
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: false,
    });

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://mc.yandex.ru/metrika/tag.js';
    script.dataset.analyticsProvider = 'metrika';
    document.head.append(script);
  };

  const enableProviders = () => {
    loadGoogleAnalytics();
    loadYandexMetrika();
  };

  const setConsent = (granted) => {
    try {
      window.localStorage.setItem(consentKey, granted ? 'granted' : 'denied');
    } catch {
      // Tracking still works in-memory when storage is unavailable.
    }

    if (granted) enableProviders();
  };

  window.siteAnalytics = Object.freeze({
    track,
    grantConsent: () => setConsent(true),
    denyConsent: () => setConsent(false),
    configured: Boolean(validGa4Id || validMetrikaId),
  });

  try {
    if (window.localStorage.getItem(consentKey) === 'granted') enableProviders();
  } catch {
    // No external provider is loaded without an explicit stored consent signal.
  }

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const target = event.target.closest('a, button');
    if (!target) return;

    const text = target.textContent.trim().replace(/\s+/g, ' ').slice(0, 80);
    const href = target.getAttribute('href') || '';
    const location = target.closest('.hero') ? 'hero'
      : target.closest('.site-header') ? 'header'
        : target.closest('.mobile-contact-bar') ? 'mobile_sticky'
          : target.closest('#certificate-dialog') ? 'certificate_dialog'
            : target.closest('#contact') ? 'contact'
              : 'content';

    if (target.matches('[data-work-filter]')) {
      track('portfolio_filter_selected', { filter: target.dataset.workFilter || 'unknown' });
    } else if (target.matches('[data-certificate-open]')) {
      track('certificate_builder_opened', { location });
    } else if (href.startsWith('tel:')) {
      track('contact_clicked', { channel: 'phone', location });
    } else if (href.includes('t.me/')) {
      track('contact_clicked', { channel: 'telegram', location });
    } else if (target.matches('.button, .nav-cta, .mobile-contact-action')) {
      track('cta_clicked', { button_text: text, location, destination: href || 'action' });
    }
  });

  document.querySelector('#brief-form')?.addEventListener('submit', (event) => {
    const form = event.currentTarget;
    track('lead_form_submitted', {
      form_type: 'portrait_brief',
      messenger: form.elements.messenger?.value || 'telegram',
      format: form.elements.format?.value || 'not_selected',
    });
  });

  document.querySelector('#certificate-builder')?.addEventListener('submit', (event) => {
    const form = event.currentTarget;
    track('certificate_configuration_submitted', {
      mode: form.elements['certificate-mode']?.value || 'portrait',
      package: form.elements['certificate-package']?.value || 'gift',
      format: form.elements['certificate-format']?.value || '40x50',
      people: Number(form.elements['certificate-people']?.value || 1),
    });
  });

  const carouselNames = new Map([
    [document.querySelector('.works-grid'), 'works'],
    [document.querySelector('.review-grid'), 'reviews'],
    [document.querySelector('.package-grid'), 'packages'],
  ]);

  carouselNames.forEach((name, carousel) => {
    if (!carousel) return;
    const onFirstScroll = () => {
      if (carousel.scrollLeft < 24) return;
      track('carousel_engaged', { carousel: name });
      carousel.removeEventListener('scroll', onFirstScroll);
    };
    carousel.addEventListener('scroll', onFirstScroll, { passive: true });
  });

  const seenDepths = new Set();
  let scrollTicking = false;
  const measureScrollDepth = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const depth = scrollable > 0 ? Math.round((window.scrollY / scrollable) * 100) : 100;
    [25, 50, 75, 90].forEach((milestone) => {
      if (depth >= milestone && !seenDepths.has(milestone)) {
        seenDepths.add(milestone);
        track('scroll_depth_reached', { percent: milestone });
      }
    });
    scrollTicking = false;
  };

  window.addEventListener('scroll', () => {
    if (scrollTicking) return;
    scrollTicking = true;
    window.requestAnimationFrame(measureScrollDepth);
  }, { passive: true });
})();
