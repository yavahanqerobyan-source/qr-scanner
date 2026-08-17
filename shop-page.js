(() => {
  'use strict';

  const header = document.querySelector('[data-shop-header]');
  const menuToggle = document.querySelector('.shop-menu-toggle');
  const navigation = document.querySelector('.shop-navigation');
  const productDialog = document.querySelector('#product-dialog');
  const statusLabels = { available: 'В наличии', reserved: 'Зарезервировано', sold: 'Продано', ask: 'Наличие уточняется' };
  const categoryLabels = { interior: 'Интерьерная работа', portrait: 'Портрет', other: 'Авторская работа' };

  const formatPrice = (value) => {
    const price = Number(value);
    return Number.isFinite(price) && price > 0 ? price.toLocaleString('ru-RU') + ' ₽' : 'Цена по запросу';
  };

  const openProduct = (id) => {
    const product = window.JuliaCMS?.getProducts().find((item) => item.id === id && item.published);
    if (!product || !productDialog) return;

    const image = document.querySelector('#product-dialog-image');
    const status = document.querySelector('#product-dialog-status');
    const buy = document.querySelector('#product-dialog-buy');
    image.src = product.image;
    image.alt = product.alt || product.title;
    status.textContent = statusLabels[product.status] || statusLabels.ask;
    status.className = 'shop-card-status is-' + product.status;
    document.querySelector('#product-dialog-category').textContent = categoryLabels[product.category] || categoryLabels.other;
    document.querySelector('#product-dialog-medium').textContent = product.medium || 'Авторская работа';
    document.querySelector('#product-dialog-title').textContent = product.title;
    document.querySelector('#product-dialog-description').textContent = product.description || 'Авторская работа в единственном экземпляре.';
    document.querySelector('#product-dialog-dimensions').textContent = product.dimensions || 'Размер уточняется';
    document.querySelector('#product-dialog-price').textContent = formatPrice(product.price);

    const message = product.status === 'sold'
      ? 'Здравствуйте, Юлия! Мне понравилась работа «' + product.title + '». Можно заказать похожую?'
      : 'Здравствуйте, Юлия! Хочу приобрести работу «' + product.title + '». Подскажите, пожалуйста, она ещё доступна?';
    buy.href = 'https://t.me/artist_julia?text=' + encodeURIComponent(message);
    buy.textContent = product.status === 'sold' ? 'Заказать похожую' : product.status === 'available' ? 'Купить работу' : 'Уточнить наличие';
    buy.dataset.productId = product.id;
    buy.dataset.productTitle = product.title;

    productDialog.showModal();
    document.body.classList.add('has-product-dialog');
    window.JuliaCMS?.recordEvent('product_detail_opened', { product_id: product.id });
  };

  const closeProduct = () => productDialog?.close();

  document.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-product-open]');
    if (opener) openProduct(opener.dataset.productOpen);
    if (event.target.closest('[data-product-close]')) closeProduct();
  });

  productDialog?.addEventListener('click', (event) => {
    if (event.target === productDialog) closeProduct();
  });
  productDialog?.addEventListener('close', () => document.body.classList.remove('has-product-dialog'));

  const closeMenu = () => {
    navigation?.classList.remove('is-open');
    menuToggle?.setAttribute('aria-expanded', 'false');
    document.body.style.removeProperty('overflow');
  };

  menuToggle?.addEventListener('click', () => {
    const open = menuToggle.getAttribute('aria-expanded') !== 'true';
    menuToggle.setAttribute('aria-expanded', String(open));
    navigation?.classList.toggle('is-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });

  navigation?.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  let scrollScheduled = false;
  const updateHeader = () => {
    header?.classList.toggle('is-scrolled', window.scrollY > 28);
    scrollScheduled = false;
  };
  window.addEventListener('scroll', () => {
    if (scrollScheduled) return;
    scrollScheduled = true;
    window.requestAnimationFrame(updateHeader);
  }, { passive: true });
  updateHeader();

  const revealItems = [...document.querySelectorAll('[data-reveal]')];
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -7% 0px', threshold: 0.08 });
    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('is-visible'));
  }
})();
