(() => {
  'use strict';

  const cms = window.JuliaCMS;
  if (!cms) return;

  const escapeHTML = (value = '') => String(value).replace(/[&<>"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[character]));

  const portfolioGrid = document.querySelector('#works-carousel');
  const worksStatus = document.querySelector('#works-status');

  const renderPortfolio = () => {
    if (!portfolioGrid) return;
    const works = cms.getPortfolio().filter((work) => work.published);
    portfolioGrid.innerHTML = works.map((work, index) => {
      const layoutClass = work.layout === 'featured' ? ' work-card-featured'
        : work.layout === 'wide' ? ' work-card-wide'
          : work.layout === 'interior' ? ' work-card-interior'
            : '';
      const mediaClass = work.image ? 'work-media-real ' + (work.mediaClass || '') : (work.mediaClass || 'work-tone-sand');
      const media = work.image
        ? '<img src="' + escapeHTML(work.image) + '" alt="' + escapeHTML(work.alt || work.title) + '" loading="lazy" decoding="async" />'
        : '<span class="work-pending">Добавить реальную работу</span>';
      const badge = work.badge ? '<span class="work-original-mark">' + escapeHTML(work.badge) + '</span>' : '';

      return '<article class="work-card' + layoutClass + '" data-work-type="' + escapeHTML(work.type) + '" data-reveal>'
        + '<div class="work-media ' + escapeHTML(mediaClass.trim()) + '"' + (!work.image ? ' role="img" aria-label="' + escapeHTML(work.alt || work.title) + '"' : '') + '>'
        + media + '<span class="work-number">' + String(index + 1).padStart(2, '0') + '</span>' + badge + '</div>'
        + '<div class="work-caption"><h3>' + escapeHTML(work.title) + '</h3><dl>'
        + '<div><dt>Формат</dt><dd>' + escapeHTML(work.format || '—') + '</dd></div>'
        + '<div><dt>Срок</dt><dd>' + escapeHTML(work.timeline || '—') + '</dd></div>'
        + '<div><dt>Повод</dt><dd>' + escapeHTML(work.occasion || '—') + '</dd></div>'
        + '</dl></div></article>';
    }).join('');
    if (worksStatus) worksStatus.textContent = 'Показано ' + works.length + ' работ';
  };

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
        title: name ? 'Заявка от ' + name : 'Заявка на портрет',
        detail: story || 'Клиент перешёл в мессенджер без описания.',
      });
    });

    document.querySelector('#certificate-builder')?.addEventListener('submit', (event) => {
      const data = new FormData(event.currentTarget);
      cms.addLead({
        type: 'certificate',
        channel: 'telegram',
        title: 'Интерес к сертификату',
        detail: 'Вариант: ' + String(data.get('certificate-package') || 'подарок') + ', формат: ' + String(data.get('certificate-format') || 'не выбран'),
      });
    });

    document.addEventListener('click', (event) => {
      const link = event.target.closest('[data-product-inquiry]');
      if (!link) return;
      cms.addLead({
        type: 'product',
        channel: 'telegram',
        title: 'Интерес к готовой работе',
        detail: link.dataset.productTitle || 'Товар из магазина',
        productId: link.dataset.productId || '',
      });
      cms.recordEvent('product_inquiry_started', { product_id: link.dataset.productId || '' });
    });
  };

  renderPortfolio();
  renderProducts();
  initShopFilters();
  captureLeads();
  cms.recordEvent('page_view', { page: document.body.dataset.page || 'home' });
})();
