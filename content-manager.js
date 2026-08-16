(() => {
  'use strict';

  const keys = {
    portfolio: 'julia_cms_portfolio_v1',
    products: 'julia_cms_products_v1',
    leads: 'julia_cms_leads_v1',
    events: 'julia_cms_events_v1',
  };

  const defaultPortfolio = [
    { id: 'work-personal-man', title: 'Личный портрет', type: 'personal', format: 'Уточняется', timeline: 'Уточняется', occasion: 'Личная история', image: 'assets/works/personal-portrait-man.webp', alt: 'Личный мужской портрет маслом в багетной раме, работа Юлии Ребровой', badge: 'Оригинальная работа', mediaClass: 'work-media-personal', layout: 'featured', published: true },
    { id: 'work-don-parents', title: 'Родители в донском стиле', type: 'family', format: 'Уточняется', timeline: 'Уточняется', occasion: 'Семейная история', image: 'assets/works/parents-don-style.png', alt: 'Портрет родителей в донском стиле: семейная пара в традиционных костюмах на фоне донского пейзажа', badge: 'Оригинальная работа', mediaClass: 'work-media-don', layout: 'standard', published: true },
    { id: 'work-archive', title: 'По архивному снимку', type: 'archive', format: 'Уточняется', timeline: 'Уточняется', occasion: 'Память семьи', image: 'assets/works/archive-portrait.png', alt: 'Портрет маслом, восстановленный Юлией Ребровой по архивной чёрно-белой фотографии', badge: 'Оригинальная работа', mediaClass: '', layout: 'standard', published: true },
    { id: 'work-couple-placeholder', title: 'Портрет двоих', type: 'family', format: '—', timeline: '—', occasion: '—', image: '', alt: 'Место для фотографии парного портрета', badge: '', mediaClass: 'work-tone-lilac', layout: 'wide', published: true },
    { id: 'work-cat', title: 'С любимым питомцем', type: 'pets', format: 'Уточняется', timeline: 'Уточняется', occasion: 'Для себя', image: 'assets/works/portrait-with-cat.webp', alt: 'Женский портрет маслом с любимым котом, работа Юлии Ребровой', badge: 'Оригинальная работа', mediaClass: 'work-media-pet', layout: 'standard', published: true },
    { id: 'work-chamber-placeholder', title: 'Камерный портрет', type: 'personal', format: '—', timeline: '—', occasion: '—', image: '', alt: 'Место для фотографии камерного портрета', badge: '', mediaClass: 'work-tone-ochre', layout: 'standard', published: true },
    { id: 'work-restored-placeholder', title: 'Восстановленный образ', type: 'archive', format: '—', timeline: '—', occasion: '—', image: '', alt: 'Место для реконструированного портрета', badge: '', mediaClass: 'work-tone-smoke', layout: 'wide', published: true },
    { id: 'work-formal-red', title: 'Парадный портрет', type: 'personal', format: 'Уточняется', timeline: 'Уточняется', occasion: 'Личный портрет', image: 'assets/works/formal-portrait-red.webp', alt: 'Парадный женский портрет маслом в золотом багете, работа Юлии Ребровой', badge: 'Оригинальная работа', mediaClass: 'work-media-formal', layout: 'standard', published: true },
    { id: 'work-dog', title: 'Портрет питомца', type: 'pets', format: 'Уточняется', timeline: 'Уточняется', occasion: 'Память о любимце', image: 'assets/works/pet-portrait-dog.webp', alt: 'Портрет собаки маслом в глубоких синих оттенках, работа Юлии Ребровой', badge: 'Оригинальная работа', mediaClass: 'work-media-pet-only', layout: 'standard', published: true },
    { id: 'work-generations-placeholder', title: 'Портрет поколений', type: 'family', format: '—', timeline: '—', occasion: '—', image: '', alt: 'Место для портрета поколений', badge: '', mediaClass: 'work-tone-sand', layout: 'standard', published: true },
    { id: 'work-ginkgo', title: 'Листья гинкго билоба', type: 'interior', format: 'Уточняется', timeline: 'Уточняется', occasion: 'Для интерьера', image: 'assets/works/ginkgo-biloba.webp', alt: 'Интерьерная картина Юлии Ребровой с листьями гинкго билоба в бирюзовых и зелёных оттенках', badge: 'Интерьерная работа', mediaClass: 'work-media-interior', layout: 'interior', published: true },
  ];

  const defaultProducts = [
    {
      id: 'product-ginkgo',
      title: 'Листья гинкго билоба',
      category: 'interior',
      price: '',
      dimensions: 'Размер уточняется',
      medium: 'Масло, холст',
      status: 'ask',
      description: 'Интерьерная живопись в спокойной бирюзово-зелёной гамме. Наличие и оформление можно уточнить у Юлии.',
      image: 'assets/works/ginkgo-biloba.webp',
      alt: 'Интерьерная картина с листьями гинкго билоба',
      published: true,
    },
  ];

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const uid = (prefix) => prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);

  const read = (key, fallback) => {
    try {
      const value = window.localStorage.getItem(key);
      return value ? JSON.parse(value) : clone(fallback);
    } catch {
      return clone(fallback);
    }
  };

  const write = (key, value) => {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('julia-cms-change', { detail: { key } }));
  };

  const ensure = () => {
    try {
      if (!window.localStorage.getItem(keys.portfolio)) write(keys.portfolio, defaultPortfolio);
      if (!window.localStorage.getItem(keys.products)) write(keys.products, defaultProducts);
      if (!window.localStorage.getItem(keys.leads)) write(keys.leads, []);
      if (!window.localStorage.getItem(keys.events)) write(keys.events, []);
    } catch {
      // Public content still uses the in-memory defaults when storage is unavailable.
    }
  };

  const getPortfolio = () => read(keys.portfolio, defaultPortfolio);
  const getProducts = () => read(keys.products, defaultProducts);
  const getLeads = () => read(keys.leads, []);
  const getEvents = () => read(keys.events, []);

  const savePortfolio = (items) => write(keys.portfolio, items);
  const saveProducts = (items) => write(keys.products, items);
  const saveLeads = (items) => write(keys.leads, items);

  const addLead = (lead) => {
    const leads = getLeads();
    const record = {
      id: uid('lead'),
      createdAt: new Date().toISOString(),
      status: 'new',
      type: 'portrait',
      name: '',
      channel: '',
      title: 'Новое обращение',
      detail: '',
      ...lead,
    };
    leads.unshift(record);
    saveLeads(leads.slice(0, 300));
    return record;
  };

  const recordEvent = (name, properties = {}) => {
    const events = getEvents();
    const safeProperties = Object.fromEntries(
      Object.entries(properties)
        .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
        .map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 120) : value]),
    );
    events.push({ id: uid('event'), name, at: new Date().toISOString(), properties: safeProperties });
    write(keys.events, events.slice(-500));
  };

  const exportData = () => ({
    version: 1,
    exportedAt: new Date().toISOString(),
    portfolio: getPortfolio(),
    products: getProducts(),
    leads: getLeads(),
    events: getEvents(),
  });

  const importData = (payload) => {
    if (!payload || payload.version !== 1) throw new Error('Неподдерживаемый формат резервной копии.');
    if (!Array.isArray(payload.portfolio) || !Array.isArray(payload.products)) throw new Error('В файле нет данных каталога.');
    write(keys.portfolio, payload.portfolio);
    write(keys.products, payload.products);
    write(keys.leads, Array.isArray(payload.leads) ? payload.leads : []);
    write(keys.events, Array.isArray(payload.events) ? payload.events : []);
  };

  const resetContent = () => {
    write(keys.portfolio, defaultPortfolio);
    write(keys.products, defaultProducts);
  };

  ensure();

  window.JuliaCMS = Object.freeze({
    keys,
    uid,
    getPortfolio,
    getProducts,
    getLeads,
    getEvents,
    savePortfolio,
    saveProducts,
    saveLeads,
    addLead,
    recordEvent,
    exportData,
    importData,
    resetContent,
    defaults: Object.freeze({ portfolio: clone(defaultPortfolio), products: clone(defaultProducts) }),
  });
})();
