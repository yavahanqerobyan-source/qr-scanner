(() => {
  'use strict';

  const cms = window.JuliaCMS;
  if (!cms) return;

  const escapeHTML = (value = '') => String(value).replace(/[&<>"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[character]));

  const portfolioGrid = document.querySelector('#works-carousel');
  const worksStatus = document.querySelector('#works-status');
  const workFilters = document.querySelector('.work-filters');
  const defaultWorkCategories = { personal: 'Личные', family: 'Семейные', archive: 'По архивным фото', pets: 'С питомцами', interior: 'Для интерьера' };

  const renderPortfolio = () => {
    if (!portfolioGrid) return;
    const works = cms.getPortfolio().filter((work) => work.published);
    const categories = new Map();
    works.forEach((work) => {
      if (work.type) categories.set(work.type, work.typeLabel || defaultWorkCategories[work.type] || work.type);
    });
    if (workFilters) {
      workFilters.innerHTML = '<button type="button" class="work-filter is-active" data-work-filter="all" aria-pressed="true">Все работы</button>'
        + [...categories].map(([type, label]) => '<button type="button" class="work-filter" data-work-filter="' + escapeHTML(type) + '" aria-pressed="false">' + escapeHTML(label) + '</button>').join('');
    }
    portfolioGrid.innerHTML = works.map((work, index) => {
      const layoutClass = work.layout === 'featured' ? ' work-card-featured'
        : work.layout === 'wide' ? ' work-card-wide'
          : work.layout === 'interior' ? ' work-card-interior'
            : '';
      const images = [...new Set([work.image, ...(Array.isArray(work.images) ? work.images : [])].filter(Boolean))];
      const mediaClass = images.length ? 'work-media-real ' + (work.mediaClass || '') : (work.mediaClass || 'work-tone-sand');
      const media = images.length
        ? '<div class="work-gallery" data-work-gallery>' + images.map((source, imageIndex) => '<img class="work-gallery-image' + (imageIndex === 0 ? ' is-active' : '') + '" src="' + escapeHTML(source) + '" alt="' + escapeHTML((work.alt || work.title) + (imageIndex ? ' — фотография ' + (imageIndex + 1) : '')) + '" loading="lazy" decoding="async" data-work-gallery-image />').join('')
          + (images.length > 1 ? '<div class="work-gallery-controls"><button type="button" data-work-gallery-prev aria-label="Предыдущая фотография">←</button><span><b data-work-gallery-current>1</b> / ' + images.length + '</span><button type="button" data-work-gallery-next aria-label="Следующая фотография">→</button></div>' : '') + '</div>'
        : '<span class="work-pending">Добавить реальную работу</span>';
      const badge = work.badge ? '<span class="work-original-mark">' + escapeHTML(work.badge) + '</span>' : '';

      return '<article class="work-card' + layoutClass + '" data-work-type="' + escapeHTML(work.type) + '" data-reveal>'
        + '<div class="work-media ' + escapeHTML(mediaClass.trim()) + '"' + (!images.length ? ' role="img" aria-label="' + escapeHTML(work.alt || work.title) + '"' : '') + '>'
        + media + '<span class="work-number">' + String(index + 1).padStart(2, '0') + '</span>' + badge + '</div>'
        + '<div class="work-caption"><h3>' + escapeHTML(work.title) + '</h3><dl>'
        + '<div><dt>Формат</dt><dd>' + escapeHTML(work.format || '—') + '</dd></div>'
        + '<div><dt>Срок</dt><dd>' + escapeHTML(work.timeline || '—') + '</dd></div>'
        + '<div><dt>Повод</dt><dd>' + escapeHTML(work.occasion || '—') + '</dd></div>'
        + '</dl></div></article>';
    }).join('');
    if (worksStatus) worksStatus.textContent = 'Показано ' + works.length + ' работ';
    document.dispatchEvent(new CustomEvent('julia-portfolio-rendered'));
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-work-gallery-prev], [data-work-gallery-next]');
    if (!button) return;
    const gallery = button.closest('[data-work-gallery]');
    const images = [...gallery.querySelectorAll('[data-work-gallery-image]')];
    if (images.length < 2) return;
    event.preventDefault();
    event.stopPropagation();
    const current = Math.max(0, images.findIndex((image) => image.classList.contains('is-active')));
    const direction = button.matches('[data-work-gallery-next]') ? 1 : -1;
    const next = (current + direction + images.length) % images.length;
    images[current].classList.remove('is-active');
    images[next].classList.add('is-active');
    const counter = gallery.querySelector('[data-work-gallery-current]');
    if (counter) counter.textContent = String(next + 1);
  });

  const shopGrid = document.querySelector('#shop-grid');
  const shopEmpty = document.querySelector('#shop-empty');
  const productStatus = {
    available: 'В наличии',
    reserved: 'Зарезервировано',
    sold: 'Продано',
    ask: 'Наличие уточняется',
  };

  const formatPrice = (value) => {
    const price = Number(value);
    return Number.isFinite(price) && price > 0 ? price.toLocaleString('ru-RU') + ' ₽' : 'Цена по запросу';
  };

  const workCountLabel = (count) => {
    const lastTwo = count % 100;
    const last = count % 10;
    const word = lastTwo >= 11 && lastTwo <= 14 ? 'работ'
      : last === 1 ? 'работа'
        : last >= 2 && last <= 4 ? 'работы' : 'работ';
    return count + ' ' + word;
  };

  const injectProductSchema = (products) => {
    if (document.body.dataset.page !== 'shop') return;
    document.querySelector('#shop-products-schema')?.remove();
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Готовые картины Юлии Ребровой',
      itemListElement: products.map((product, index) => {
        const price = Number(product.price);
        const item = {
          '@type': 'Product',
          name: product.title,
          image: product.image,
          description: product.description || product.medium || 'Авторская живопись Юлии Ребровой',
          category: productCategoriesForSchema[product.category] || 'Авторская живопись',
          brand: { '@type': 'Brand', name: 'Юлия Реброва' },
        };
        if (Number.isFinite(price) && price > 0) {
          item.offers = {
            '@type': 'Offer',
            price,
            priceCurrency: 'RUB',
            availability: product.status === 'sold' ? 'https://schema.org/OutOfStock'
              : product.status === 'reserved' ? 'https://schema.org/LimitedAvailability'
                : 'https://schema.org/InStock',
            url: '/shop.html',
          };
        }
        return { '@type': 'ListItem', position: index + 1, item };
      }),
    };
    const script = document.createElement('script');
    script.id = 'shop-products-schema';
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(schema);
    document.head.append(script);
  };

  const productCategoriesForSchema = {
    interior: 'Интерьерная живопись',
    portrait: 'Портрет',
    other: 'Авторская работа',
  };

  const renderProducts = () => {
    if (!shopGrid) return;
    const products = cms.getProducts().filter((product) => product.published);
    shopGrid.innerHTML = products.map((product) => {
      const action = '<span class="shop-card-action">Смотреть работу <span aria-hidden="true">↗</span></span>';

      return '<article class="shop-card" data-product-category="' + escapeHTML(product.category) + '" data-product-id="' + escapeHTML(product.id) + '" data-reveal>'
        + '<div class="shop-card-media"><img src="' + escapeHTML(product.image) + '" alt="' + escapeHTML(product.alt || product.title) + '" loading="lazy" decoding="async" />'
        + '<span class="shop-card-status is-' + escapeHTML(product.status) + '">' + escapeHTML(productStatus[product.status] || productStatus.ask) + '</span></div>'
        + '<div class="shop-card-body"><p class="shop-card-kicker">' + escapeHTML(product.medium || 'Авторская работа') + '</p>'
        + '<h3>' + escapeHTML(product.title) + '</h3>'
        + '<div class="shop-card-meta"><span>' + escapeHTML(product.dimensions || 'Размер уточняется') + '</span><strong>' + escapeHTML(formatPrice(product.price)) + '</strong></div>'
        + action + '</div><button class="shop-card-hit" type="button" data-product-open="' + escapeHTML(product.id) + '" aria-label="Открыть работу «' + escapeHTML(product.title) + '»"></button></article>';
    }).join('');
    if (shopEmpty) shopEmpty.hidden = products.length > 0;
    shopGrid.hidden = products.length === 0;
    const total = document.querySelector('#shop-product-count');
    const results = document.querySelector('#shop-results-count');
    if (total) total.textContent = String(products.length);
    if (results) results.textContent = workCountLabel(products.length);
    injectProductSchema(products);
  };

  const initShopFilters = () => {
    const filters = [...document.querySelectorAll('[data-shop-filter]')];
    filters.forEach((button) => {
      button.addEventListener('click', () => {
        const category = button.dataset.shopFilter;
        filters.forEach((filter) => {
          const active = filter === button;
          filter.classList.toggle('is-active', active);
          filter.setAttribute('aria-pressed', String(active));
        });
        [...document.querySelectorAll('[data-product-category]')].forEach((card) => {
          card.hidden = category !== 'all' && card.dataset.productCategory !== category;
        });
        const visibleCount = [...document.querySelectorAll('[data-product-category]')].filter((card) => !card.hidden).length;
        const results = document.querySelector('#shop-results-count');
        if (results) results.textContent = workCountLabel(visibleCount);
        if (shopEmpty) shopEmpty.hidden = visibleCount > 0;
        if (shopGrid) shopGrid.hidden = visibleCount === 0;
        cms.recordEvent('shop_filter_selected', { category });
      });
    });
  };

  const captureLeads = () => {
    document.querySelector('#brief-form')?.addEventListener('submit', (event) => {
      const data = new FormData(event.currentTarget);
      const name = String(data.get('name') || '').trim();
      const story = String(data.get('story') || '').trim();
      cms.addLead({
        type: 'portrait',
        name,
        channel: String(data.get('messenger') || 'telegram'),
        title: 'Заявка на портрет',
        detail: story || 'Клиент перешёл в мессенджер без описания.',
        consent: data.get('personal-data-consent') === 'yes',
        consentVersion: 'pd-2026-08-17',
        formId: 'portrait-brief',
      });
    });

    document.querySelector('#certificate-builder')?.addEventListener('submit', (event) => {
      const data = new FormData(event.currentTarget);
      cms.addLead({
        type: 'certificate',
        channel: 'telegram',
        title: 'Интерес к сертификату',
        detail: 'Вариант: ' + String(data.get('certificate-package') || 'подарок') + ', формат: ' + String(data.get('certificate-format') || 'не выбран'),
        consent: data.get('personal-data-consent') === 'yes',
        consentVersion: 'pd-2026-08-17',
        formId: 'certificate-builder',
      });
    });

    document.addEventListener('click', (event) => {
      const link = event.target.closest('[data-product-inquiry]');
      if (!link) return;
      cms.recordEvent('product_inquiry_started', { product_id: link.dataset.productId || '' });
    });
  };

  Promise.resolve(cms.ready).finally(() => {
    renderPortfolio();
    renderProducts();
    initShopFilters();
    captureLeads();
    cms.recordEvent('page_view', { page: document.body.dataset.page || 'home' });
  });
})();
