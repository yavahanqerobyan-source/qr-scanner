(() => {
  'use strict';

  const cms = window.JuliaCMS;
  if (!cms) return;

  const viewTitles = { dashboard: 'Обзор', portfolio: 'Портфолио', shop: 'Магазин', clients: 'Обращения', analytics: 'Аналитика' };
  const workTypes = { personal: 'Личные', family: 'Семейные', archive: 'Архивные', pets: 'С питомцами', interior: 'Для интерьера' };
  const productCategories = { interior: 'Интерьерная работа', portrait: 'Портрет', other: 'Другое' };
  const productStatuses = { available: 'В наличии', reserved: 'Зарезервировано', sold: 'Продано', ask: 'Уточняется' };
  const leadTypes = { portrait: 'Портрет', certificate: 'Сертификат', product: 'Готовая работа' };
  const leadStatuses = { new: 'Новое', contacted: 'Связались', in_progress: 'В работе', completed: 'Завершено', archived: 'Архив' };
  const eventLabels = {
    contact_clicked: 'Переходы к связи',
    lead_form_submitted: 'Заявки на портрет',
    product_inquiry_started: 'Интерес к товарам',
    product_detail_opened: 'Открыли карточку товара',
    certificate_configuration_submitted: 'Заявки на сертификат',
    portfolio_filter_selected: 'Фильтры портфолио',
    carousel_engaged: 'Просмотры подборок',
  };

  const escapeHTML = (value = '') => String(value).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
  const iconEdit = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m4 16-1 5 5-1L19 9l-4-4L4 16Z"/><path d="m13 7 4 4"/></svg>';
  const iconDelete = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>';
  const dateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const shortDateFormatter = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });

  const toast = document.querySelector('#admin-toast');
  let toastTimer;
  const showToast = (message) => {
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2800);
  };

  const switchView = (name, updateHash = true) => {
    const next = viewTitles[name] ? name : 'dashboard';
    document.querySelectorAll('[data-admin-view]').forEach((view) => {
      const active = view.dataset.adminView === next;
      view.hidden = !active;
      view.classList.toggle('is-active', active);
    });
    document.querySelectorAll('[data-admin-nav]').forEach((button) => button.classList.toggle('is-active', button.dataset.adminNav === next));
    document.querySelector('#admin-view-title').textContent = viewTitles[next];
    if (updateHash) history.replaceState(null, '', '#' + next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const metric = (label, value, note) => '<article class="admin-metric"><span>' + escapeHTML(label) + '</span><strong>' + escapeHTML(value) + '</strong><small>' + escapeHTML(note) + '</small></article>';
  const formatPrice = (value) => Number(value) > 0 ? Number(value).toLocaleString('ru-RU') + ' ₽' : 'По запросу';

  const recentEvents = (days = 30) => {
    const from = Date.now() - days * 86400000;
    return cms.getEvents().filter((event) => new Date(event.at).getTime() >= from);
  };

  const renderDashboard = () => {
    const works = cms.getPortfolio();
    const products = cms.getProducts();
    const leads = cms.getLeads();
    const events = recentEvents();
    const publishedWorks = works.filter((item) => item.published).length;
    const publishedProducts = products.filter((item) => item.published).length;
    const newLeads = leads.filter((lead) => lead.status === 'new').length;
    const pageViews = events.filter((event) => event.name === 'page_view').length;

    document.querySelector('#dashboard-metrics').innerHTML = [
      metric('Работы на сайте', publishedWorks, 'из ' + works.length + ' в панели'),
      metric('Товары в витрине', publishedProducts, products.filter((item) => item.status === 'available').length + ' в наличии'),
      metric('Новые обращения', newLeads, leads.length ? 'всего ' + leads.length : 'пока нет'),
      metric('Просмотры · 30 дней', pageViews, 'в этом браузере'),
    ].join('');

    const recent = leads.slice(0, 5);
    document.querySelector('#dashboard-leads').innerHTML = recent.length ? recent.map(renderLead).join('') : emptyState('Пока тихо', 'Новые заявки появятся здесь.');

    const withImages = works.filter((item) => item.published && item.image).length;
    const portfolioCompleteness = publishedWorks ? Math.round((withImages / publishedWorks) * 100) : 0;
    const productCompleteness = products.length ? Math.round((products.filter((item) => item.image && item.title).length / products.length) * 100) : 0;
    document.querySelector('#dashboard-health').innerHTML = healthRow('Портфолио с фотографиями', portfolioCompleteness + '%', portfolioCompleteness)
      + healthRow('Карточки магазина', productCompleteness + '%', productCompleteness)
      + healthRow('Обращения обработаны', leads.length ? Math.round((leads.filter((lead) => !['new'].includes(lead.status)).length / leads.length) * 100) + '%' : '—', leads.length ? Math.round((leads.filter((lead) => lead.status !== 'new').length / leads.length) * 100) : 0);

    const navCount = document.querySelector('#nav-leads-count');
    navCount.textContent = String(newLeads);
    navCount.hidden = newLeads === 0;
  };

  const healthRow = (label, value, percent) => '<div class="admin-health-row"><span>' + escapeHTML(label) + '</span><strong>' + escapeHTML(value) + '</strong><div class="admin-progress"><i style="width:' + Math.max(0, Math.min(100, percent)) + '%"></i></div></div>';
  const emptyState = (title, text) => '<div class="admin-empty"><strong>' + escapeHTML(title) + '</strong>' + escapeHTML(text) + '</div>';

  const renderPortfolio = () => {
    const items = cms.getPortfolio();
    document.querySelector('#portfolio-list').innerHTML = items.length ? items.map((work) => {
      const thumbnail = work.image ? '<img src="' + escapeHTML(work.image) + '" alt="" />' : '';
      return '<article class="admin-content-item"><div class="admin-content-thumb">' + thumbnail + '</div>'
        + '<div class="admin-content-copy"><h3>' + escapeHTML(work.title) + '</h3><p>' + escapeHTML(workTypes[work.type] || work.type) + ' · ' + escapeHTML(work.format || 'Формат не указан') + '</p><span class="admin-status ' + (work.published ? 'is-published' : 'is-draft') + '">' + (work.published ? 'Опубликовано' : 'Черновик') + '</span></div>'
        + '<div class="admin-content-meta"><strong>' + escapeHTML(work.occasion || 'Без подписи') + '</strong><span>' + escapeHTML(work.timeline || 'Срок не указан') + '</span></div>'
        + '<div class="admin-item-actions"><button type="button" data-edit-work="' + escapeHTML(work.id) + '" aria-label="Редактировать ' + escapeHTML(work.title) + '">' + iconEdit + '</button><button type="button" data-delete-work="' + escapeHTML(work.id) + '" aria-label="Удалить ' + escapeHTML(work.title) + '">' + iconDelete + '</button></div></article>';
    }).join('') : emptyState('Нет работ', 'Добавьте первую работу в портфолио.');
  };

  const renderProducts = () => {
    const items = cms.getProducts();
    document.querySelector('#products-list').innerHTML = items.length ? items.map((product) => {
      const thumbnail = product.image ? '<img src="' + escapeHTML(product.image) + '" alt="" />' : '';
      return '<article class="admin-content-item"><div class="admin-content-thumb">' + thumbnail + '</div>'
        + '<div class="admin-content-copy"><h3>' + escapeHTML(product.title) + '</h3><p>' + escapeHTML(productCategories[product.category] || product.category) + ' · ' + escapeHTML(product.dimensions || 'Размер не указан') + '</p><span class="admin-status is-' + escapeHTML(product.status) + '">' + escapeHTML(productStatuses[product.status] || productStatuses.ask) + '</span></div>'
        + '<div class="admin-content-meta"><strong>' + escapeHTML(formatPrice(product.price)) + '</strong><span>' + (product.published ? 'В витрине' : 'Черновик') + '</span></div>'
        + '<div class="admin-item-actions"><button type="button" data-edit-product="' + escapeHTML(product.id) + '" aria-label="Редактировать ' + escapeHTML(product.title) + '">' + iconEdit + '</button><button type="button" data-delete-product="' + escapeHTML(product.id) + '" aria-label="Удалить ' + escapeHTML(product.title) + '">' + iconDelete + '</button></div></article>';
    }).join('') : emptyState('Витрина пуста', 'Добавьте первую готовую работу.');
  };

  const renderLead = (lead) => '<article class="admin-lead"><time class="admin-lead-date" datetime="' + escapeHTML(lead.createdAt) + '">' + escapeHTML(dateFormatter.format(new Date(lead.createdAt))) + '</time><div class="admin-lead-copy"><h4>' + escapeHTML(lead.title || leadTypes[lead.type] || 'Обращение') + '</h4><p>' + escapeHTML((leadTypes[lead.type] || lead.type) + (lead.name ? ' · ' + lead.name : '') + ' — ' + (lead.detail || 'Без описания')) + '</p></div><select data-lead-status="' + escapeHTML(lead.id) + '" aria-label="Статус обращения"><option value="new"' + selected(lead.status, 'new') + '>Новое</option><option value="contacted"' + selected(lead.status, 'contacted') + '>Связались</option><option value="in_progress"' + selected(lead.status, 'in_progress') + '>В работе</option><option value="completed"' + selected(lead.status, 'completed') + '>Завершено</option><option value="archived"' + selected(lead.status, 'archived') + '>Архив</option></select></article>';
  const selected = (value, expected) => value === expected ? ' selected' : '';

  const renderLeads = () => {
    const leads = cms.getLeads();
    document.querySelector('#leads-list').innerHTML = leads.length ? leads.map(renderLead).join('') : emptyState('Обращений пока нет', 'Когда клиент отправит форму или перейдёт к покупке, запись появится здесь.');
  };

  const renderAnalytics = () => {
    const events = recentEvents();
    const leads = cms.getLeads().filter((lead) => new Date(lead.createdAt).getTime() >= Date.now() - 30 * 86400000);
    const pageViews = events.filter((event) => event.name === 'page_view').length;
    const contacts = events.filter((event) => ['contact_clicked', 'lead_form_submitted', 'product_inquiry_started', 'certificate_configuration_submitted'].includes(event.name)).length;
    const conversion = pageViews ? ((leads.length / pageViews) * 100).toFixed(1).replace('.', ',') + '%' : '—';
    const shopInterest = events.filter((event) => event.name === 'product_inquiry_started').length;
    document.querySelector('#analytics-metrics').innerHTML = [metric('Просмотры', pageViews, 'за 30 дней'), metric('Целевые действия', contacts, 'переходы и заявки'), metric('Конверсия в обращение', conversion, 'обращения / просмотры'), metric('Интерес к магазину', shopInterest, 'начали диалог о товаре')].join('');

    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      const next = new Date(date.getTime() + 86400000);
      const count = events.filter((event) => {
        const timestamp = new Date(event.at).getTime();
        return timestamp >= date.getTime() && timestamp < next.getTime();
      }).length;
      return { date, count };
    });
    const maxDay = Math.max(1, ...days.map((day) => day.count));
    document.querySelector('#week-chart').innerHTML = days.map((day) => '<div class="admin-day"><i class="admin-day-bar" style="height:' + Math.max(4, Math.round((day.count / maxDay) * 150)) + 'px"></i><strong>' + day.count + '</strong><span>' + escapeHTML(shortDateFormatter.format(day.date)) + '</span></div>').join('');

    const counts = Object.keys(eventLabels).map((name) => ({ name, count: events.filter((event) => event.name === name).length })).sort((a, b) => b.count - a.count).slice(0, 6);
    const maxEvent = Math.max(1, ...counts.map((item) => item.count));
    document.querySelector('#event-bars').innerHTML = counts.some((item) => item.count > 0) ? counts.map((item) => '<div class="admin-event-row"><span>' + escapeHTML(eventLabels[item.name]) + '</span><strong>' + item.count + '</strong><div class="admin-event-track"><i style="width:' + Math.round((item.count / maxEvent) * 100) + '%"></i></div></div>').join('') : emptyState('Данных пока мало', 'Действия посетителей появятся после использования сайта.');
  };

  const renderAll = () => {
    renderDashboard();
    renderPortfolio();
    renderProducts();
    renderLeads();
    renderAnalytics();
  };

  const workDialog = document.querySelector('#work-dialog');
  const workForm = document.querySelector('#work-form');
  const productDialog = document.querySelector('#product-dialog');
  const productForm = document.querySelector('#product-form');

  const setImagePreview = (form, source) => {
    const preview = form.querySelector('.admin-image-preview');
    const image = preview.querySelector('img');
    image.src = source || '';
    preview.classList.toggle('has-image', Boolean(source));
  };

  const openWorkEditor = (id = '') => {
    workForm.reset();
    const work = cms.getPortfolio().find((item) => item.id === id);
    workForm.elements.id.value = work?.id || '';
    workForm.elements.image.value = work?.image || '';
    workForm.elements.title.value = work?.title || '';
    workForm.elements.type.value = work?.type || 'personal';
    workForm.elements.format.value = work?.format || '';
    workForm.elements.timeline.value = work?.timeline || '';
    workForm.elements.occasion.value = work?.occasion || '';
    workForm.elements.alt.value = work?.alt || '';
    workForm.elements.published.checked = work ? Boolean(work.published) : true;
    document.querySelector('#work-dialog-title').textContent = work ? 'Редактировать работу' : 'Новая работа';
    setImagePreview(workForm, work?.image || '');
    workDialog.showModal();
  };

  const openProductEditor = (id = '') => {
    productForm.reset();
    const product = cms.getProducts().find((item) => item.id === id);
    productForm.elements.id.value = product?.id || '';
    productForm.elements.image.value = product?.image || '';
    productForm.elements.title.value = product?.title || '';
    productForm.elements.category.value = product?.category || 'interior';
    productForm.elements.status.value = product?.status || 'available';
    productForm.elements.price.value = product?.price || '';
    productForm.elements.dimensions.value = product?.dimensions || '';
    productForm.elements.medium.value = product?.medium || '';
    productForm.elements.description.value = product?.description || '';
    productForm.elements.alt.value = product?.alt || '';
    productForm.elements.published.checked = product ? Boolean(product.published) : true;
    document.querySelector('#product-dialog-title').textContent = product ? 'Редактировать товар' : 'Новый товар';
    setImagePreview(productForm, product?.image || '');
    productDialog.showModal();
  };

  const fileToWebp = async (file) => {
    if (!file) return '';
    if (file.size > 15 * 1024 * 1024) throw new Error('Файл больше 15 МБ. Выберите изображение меньшего размера.');
    const bitmap = typeof createImageBitmap === 'function'
      ? await createImageBitmap(file)
      : await new Promise((resolve, reject) => {
        const image = new Image();
        const source = URL.createObjectURL(file);
        image.onload = () => {
          URL.revokeObjectURL(source);
          resolve(image);
        };
        image.onerror = () => {
          URL.revokeObjectURL(source);
          reject(new Error('Не удалось прочитать изображение. Попробуйте другой файл.'));
        };
        image.src = source;
      });
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (typeof bitmap.close === 'function') bitmap.close();
    return canvas.toDataURL('image/webp', 0.82);
  };

  const saveWork = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const existing = cms.getPortfolio();
      const current = existing.find((item) => item.id === form.elements.id.value);
      const uploaded = await fileToWebp(form.elements.imageFile.files[0]);
      const record = {
        id: current?.id || cms.uid('work'),
        title: form.elements.title.value.trim(),
        type: form.elements.type.value,
        format: form.elements.format.value.trim() || '—',
        timeline: form.elements.timeline.value.trim() || '—',
        occasion: form.elements.occasion.value.trim() || '—',
        image: uploaded || form.elements.image.value,
        alt: form.elements.alt.value.trim() || form.elements.title.value.trim(),
        badge: current?.badge || 'Оригинальная работа',
        mediaClass: uploaded ? '' : (current?.mediaClass || ''),
        layout: current?.layout || 'standard',
        published: form.elements.published.checked,
      };
      const next = current ? existing.map((item) => item.id === current.id ? record : item) : [record, ...existing];
      cms.savePortfolio(next);
      workDialog.close();
      renderAll();
      showToast('Работа сохранена и готова к публикации.');
    } catch (error) {
      showToast(error.name === 'QuotaExceededError' ? 'Не хватает места в браузере. Скачайте резервную копию и уменьшите изображение.' : error.message);
    }
  };

  const saveProduct = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const existing = cms.getProducts();
      const current = existing.find((item) => item.id === form.elements.id.value);
      const uploaded = await fileToWebp(form.elements.imageFile.files[0]);
      const image = uploaded || form.elements.image.value;
      if (!image) throw new Error('Добавьте фотографию товара.');
      const record = {
        id: current?.id || cms.uid('product'),
        title: form.elements.title.value.trim(),
        category: form.elements.category.value,
        price: form.elements.price.value,
        dimensions: form.elements.dimensions.value.trim() || 'Размер уточняется',
        medium: form.elements.medium.value.trim() || 'Авторская работа',
        status: form.elements.status.value,
        description: form.elements.description.value.trim(),
        image,
        alt: form.elements.alt.value.trim() || form.elements.title.value.trim(),
        published: form.elements.published.checked,
      };
      const next = current ? existing.map((item) => item.id === current.id ? record : item) : [record, ...existing];
      cms.saveProducts(next);
      productDialog.close();
      renderAll();
      showToast('Товар сохранён. Витрина обновлена.');
    } catch (error) {
      showToast(error.name === 'QuotaExceededError' ? 'Не хватает места в браузере. Уменьшите изображение.' : error.message);
    }
  };

  const previewFile = (form) => {
    const file = form.elements.imageFile.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImagePreview(form, url);
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  const downloadBackup = () => {
    const blob = new Blob([JSON.stringify(cms.exportData(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'julia-rebrova-site-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    link.click();
    URL.revokeObjectURL(url);
    showToast('Резервная копия сохранена.');
  };

  document.addEventListener('click', (event) => {
    const nav = event.target.closest('[data-admin-nav]');
    if (nav) switchView(nav.dataset.adminNav);
    const go = event.target.closest('[data-go-view]');
    if (go) switchView(go.dataset.goView);
    if (event.target.closest('[data-add-work]')) openWorkEditor();
    if (event.target.closest('[data-add-product]')) openProductEditor();

    const editWork = event.target.closest('[data-edit-work]');
    if (editWork) openWorkEditor(editWork.dataset.editWork);
    const editProduct = event.target.closest('[data-edit-product]');
    if (editProduct) openProductEditor(editProduct.dataset.editProduct);

    const deleteWork = event.target.closest('[data-delete-work]');
    if (deleteWork && window.confirm('Удалить эту работу из панели и с сайта?')) {
      cms.savePortfolio(cms.getPortfolio().filter((item) => item.id !== deleteWork.dataset.deleteWork));
      renderAll();
      showToast('Работа удалена.');
    }
    const deleteProduct = event.target.closest('[data-delete-product]');
    if (deleteProduct && window.confirm('Удалить этот товар из магазина?')) {
      cms.saveProducts(cms.getProducts().filter((item) => item.id !== deleteProduct.dataset.deleteProduct));
      renderAll();
      showToast('Товар удалён.');
    }

    if (event.target.closest('[data-close-dialog]')) event.target.closest('dialog')?.close();
  });

  document.addEventListener('change', (event) => {
    const status = event.target.closest('[data-lead-status]');
    if (status) {
      cms.saveLeads(cms.getLeads().map((lead) => lead.id === status.dataset.leadStatus ? { ...lead, status: status.value } : lead));
      renderAll();
      showToast('Статус обращения обновлён.');
    }
  });

  workForm.addEventListener('submit', saveWork);
  productForm.addEventListener('submit', saveProduct);
  workForm.elements.imageFile.addEventListener('change', () => previewFile(workForm));
  productForm.elements.imageFile.addEventListener('change', () => previewFile(productForm));
  document.querySelector('#backup-button').addEventListener('click', downloadBackup);
  document.querySelector('#import-button').addEventListener('click', () => document.querySelector('#import-input').click());
  document.querySelector('#logout-button').addEventListener('click', async () => {
    const button = document.querySelector('#logout-button');
    button.disabled = true;
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      window.location.replace('/admin-login.html');
    }
  });
  document.querySelector('#import-input').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      cms.importData(JSON.parse(await file.text()));
      renderAll();
      showToast('Резервная копия восстановлена.');
    } catch (error) {
      showToast(error.message || 'Не удалось прочитать резервную копию.');
    } finally {
      event.target.value = '';
    }
  });

  window.addEventListener('hashchange', () => {
    renderAll();
    switchView(location.hash.slice(1) || 'dashboard', false);
  });
  window.addEventListener('storage', renderAll);

  renderAll();
  switchView(location.hash.slice(1) || 'dashboard', false);
})();
