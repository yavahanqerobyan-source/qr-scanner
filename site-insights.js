(() => {
  'use strict';

  const readMeta = (name) => document.querySelector(`meta[name="${name}"]`)?.content.trim() || '';
  const ga4Id = readMeta('ga4-measurement-id');
  const metrikaId = readMeta('yandex-metrika-id');
  const validGa4Id = /^G-[A-Z0-9]+$/i.test(ga4Id) ? ga4Id : '';
  const validMetrikaId = /^\d+$/.test(metrikaId) ? Number(metrikaId) : 0;
  const consentKey = 'julia_rebrova_analytics_consent';
  const visitorKey = 'julia_rebrova_visitor_id';
  const sessionKey = 'julia_rebrova_session_id';
  const analyticsConsentVersion = 'analytics-2026-08-17';

  window.dataLayer = window.dataLayer || [];

  const sanitizeProperties = (properties = {}) => Object.fromEntries(
    Object.entries(properties)
      .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
      .map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 120) : value]),
  );

  const uuid = () => typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (character) => (character ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> character / 4).toString(16));

  const analyticsIdentity = () => {
    let visitorId = window.localStorage.getItem(visitorKey);
    let sessionId = window.sessionStorage.getItem(sessionKey);
    if (!visitorId) {
      visitorId = uuid();
      window.localStorage.setItem(visitorKey, visitorId);
    }
    if (!sessionId) {
      sessionId = uuid();
      window.sessionStorage.setItem(sessionKey, sessionId);
    }
    return { visitorId, sessionId };
  };

  const sendServerEvent = (eventName, properties) => {
    try {
      if (window.localStorage.getItem(consentKey) !== 'granted') return;
      const identity = analyticsIdentity();
      fetch('/api/events', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consent: true,
          consentVersion: analyticsConsentVersion,
          events: [{ ...identity, name: eventName, page: window.location.pathname, properties, occurredAt: new Date().toISOString() }],
        }),
      }).catch(() => {});
    } catch {
      // Аналитика не должна мешать основной работе сайта.
    }
  };

  const track = (eventName, properties = {}) => {
    const safeProperties = sanitizeProperties(properties);
    window.dataLayer.push({ event: eventName, ...safeProperties });
    window.JuliaCMS?.recordEvent(eventName, safeProperties);
    sendServerEvent(eventName, safeProperties);

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
      if (!granted) {
        window.localStorage.removeItem(visitorKey);
        window.sessionStorage.removeItem(sessionKey);
      }
    } catch {
      // Tracking remains available in-memory when storage is unavailable.
    }

    document.querySelector('[data-consent-banner]')?.remove();
    if (granted) {
      enableProviders();
      sendServerEvent('analytics_consent_granted', { page: window.location.pathname });
      sendServerEvent('page_view', { page: document.body.dataset.page || 'home', consent_activation: true });
    } else if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', { analytics_storage: 'denied' });
    }
  };

  const showConsentBanner = () => {
    const banner = document.createElement('aside');
    banner.className = 'consent-banner';
    banner.dataset.consentBanner = '';
    banner.setAttribute('aria-label', 'Настройки аналитики');
    banner.innerHTML = '<div><p class="consent-banner-kicker">Приватность</p><p>Я использую необязательную аналитику, чтобы понимать, какие работы интересны посетителям. Она включится только с вашего согласия. <a href="privacy.html#analytics">Подробнее</a></p></div><div class="consent-banner-actions"><button type="button" data-consent-deny>Только необходимые</button><button type="button" data-consent-accept>Разрешить аналитику</button></div>';
    document.body.append(banner);
    banner.querySelector('[data-consent-accept]').addEventListener('click', () => setConsent(true));
    banner.querySelector('[data-consent-deny]').addEventListener('click', () => setConsent(false));
  };

  window.siteAnalytics = Object.freeze({
    track,
    grantConsent: () => setConsent(true),
    denyConsent: () => setConsent(false),
    configured: Boolean(validGa4Id || validMetrikaId),
  });

  try {
    const storedConsent = window.localStorage.getItem(consentKey);
    if (storedConsent === 'granted') enableProviders();
    else if (!storedConsent) showConsentBanner();
  } catch {
    // No external provider is loaded without an explicit stored consent signal.
  }

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const target = event.target.closest('a, button');
    if (!target) return;

    if (target.matches('[data-revoke-analytics]')) {
      setConsent(false);
      target.textContent = 'Аналитика отключена';
      target.disabled = true;
      return;
    }

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
    [document.querySelector('.shop-grid'), 'shop'],
    [document.querySelector('.story-grid'), 'subjects'],
    [document.querySelector('.process-gallery'), 'process_gallery'],
    [document.querySelector('.process-list'), 'process_steps'],
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
