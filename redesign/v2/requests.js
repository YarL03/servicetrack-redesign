(() => {
  const R = window.RD, K = window.KonturV2, E = R.esc;
  const primary = K.get('10428');
  const primaryPages = new Set(['request', 'request-object', 'request-object-edit', 'request-files', 'request-history', 'request-denials']);
  function cardTabs(r) {
    return r.hasWorker ? [['Общая информация', K.cardId(r.id)], ['Чат ' + K.unreadBadge(r.unread), 'chat-' + r.id]] : undefined;
  }
  function fieldSlot(r, id, editable) {
    const available = K.pending(r).filter(f => K.eligible(r, f, id)).length;
    return K.fieldRows(r, id) + (editable && available ? `<button type="button" class="v2-assign-link" data-request="${r.id}" data-from-pool="${id}">${K.icon('inbox')}Из нераспределённых · ${available}</button>` : '');
  }
  for (const r of K.requests.filter(record => record !== primary)) {
    const screen = {
      id: K.cardId(r.id), group: 'Заявки', title: 'Заявка № ' + r.id, subtitle: r.type,
      render() {
        const info = R.card('Общая информация', `<dl class="work-details two-col"><div><dt>Адрес</dt><dd>${r.city}, ${E(r.address)}</dd></div><div><dt>Статус</dt><dd>${R.badge(r.status, r.tone)}</dd></div>
          <div><dt>Исполнитель</dt><dd>${E(r.worker)}</dd></div><div><dt>Срок выполнения</dt><dd>${E(r.due)}</dd></div></dl>`);
        const form = r.fields.length ? R.card('Рабочая форма', r.fields.map(id => `<section class="v2-field"><h3>${E(K.fields[id].label)}</h3><div data-field-slot="${id}">${fieldSlot(r, id, true)}</div></section>`).join('')) : '';
        return info + (K.incoming(r).length ? K.queue(r) : '') + form;
      },
    };
    R.screen(screen);
  }
  const requestTabs = R.screens.find(s => s.id === 'request').tabs;
  for (const screen of R.screens) {
    if (screen.tabs === requestTabs || primaryPages.has(screen.id)) {
      Object.defineProperty(screen, 'tabs', {get: () => [requestTabs[0], ['Чат ' + K.unreadBadge(primary.unread), 'chat-10428'], ...requestTabs.slice(1)]});
    } else {
      const r = K.requests.find(record => record !== primary && K.cardId(record.id) === screen.id);
      if (r) Object.defineProperty(screen, 'tabs', {get: () => cardTabs(r)});
    }
  }
  function incomingSummary(r) {
    const n = K.pending(r).length;
    return `<a class="v2-incoming-link" data-summary href="#request-files">${K.icon('inbox')}<span>Нераспределённые файлы</span><b>${n}</b>${R.icon('chevron')}</a>`;
  }
  function assignedSection(r) {
    const files = K.incoming(r).filter(f => f.field);
    return `<section data-distributed>${files.length ? R.card('Прикреплено из чата', files.map(f => K.fileRow(r, f)).join('')) : ''}</section>`;
  }
  function enhancePrimary(id) {
    const main = document.querySelector('.request-main');
    const contextLink = document.querySelector('[data-action="go:request-files"]');
    if (contextLink) contextLink.textContent = 'Вложения заявки · ' + (4 + K.incoming(primary).length);
    if (id === 'request') {
      main.insertAdjacentHTML('afterbegin', incomingSummary(primary));
    } else if (id === 'request-files') {
      main.querySelector('.panel-head h2').textContent = 'Загружено напрямую в форму · 4';
      main.insertAdjacentHTML('afterbegin', K.queue(primary) + assignedSection(primary));
      document.querySelector('.heading-copy .eyebrow').textContent = '№ ' + primary.id + ' · ' + primary.type;
      for (const badge of document.querySelectorAll('.request-context-toggle > .badge, .request-summary .work-details .badge')) {
        badge.outerHTML = R.badge(primary.status, primary.tone);
      }
      document.querySelector('.heading-actions').innerHTML = R.button('Открыть рабочую форму', 'go:request-object');
    } else if (id === 'request-object' || id === 'request-object-edit') {
      main.insertAdjacentHTML('afterbegin', K.queue(primary));
      const editable = id === 'request-object-edit';
      for (const host of main.querySelectorAll('[data-work-field]')) {
        const field = host.dataset.workField;
        const slot = document.createElement('div');
        slot.dataset.fieldSlot = field;
        slot.innerHTML = fieldSlot(primary, field, editable);
        if (field === 'document') host.insertAdjacentHTML('afterbegin', '<h3 class="v2-field-title">Документ</h3>');
        if (field === 'extra' && !editable) {
          const section = document.createElement('section');
          section.className = 'v2-extra-field';
          section.innerHTML = '<h3>Дополнительные материалы</h3><p class="muted small">Фото, видео, аудио и документы · До 5 файлов</p>';
          host.replaceWith(section);
          section.append(slot);
        } else host.append(slot);
      }
    }
  }
  function enhanceNavigation(id) {
    const active = id === 'chats' || id.startsWith('chat-');
    const attrs = active ? 'aria-current="page"' : '';
    const badge = K.unreadBadge(K.totalUnread());
    document.querySelector('.main-nav [href="#requests"]').insertAdjacentHTML('afterend',
      `<a class="nav-link ${active ? 'active' : ''}" href="#chats" ${attrs}>${K.icon('chat')}<span>Чаты</span>${badge}</a>`);
    document.querySelector('.mobile-nav [href="#requests"]').insertAdjacentHTML('afterend',
      `<a class="v2-dock-chat ${active ? 'active' : ''}" href="#chats" ${attrs}>${K.icon('chat')}<span>Чаты</span>${badge}</a>`);
    const catalog = document.querySelector('.demo-bar a');
    catalog.href = 'catalog.html?screen=' + id + '&theme=' + window.RDTheme.get();
    document.querySelector('.variant-label').textContent = 'Контур · v2';
  }
  document.addEventListener('rd:render', event => {
    const id = event.detail.screen;
    enhanceNavigation(id);
    if (primaryPages.has(id)) enhancePrimary(id);
  });
  document.addEventListener('v2:allocation', event => {
    const r = event.detail.record;
    const pool = document.querySelector('[data-pool]');
    if (pool) pool.outerHTML = K.queue(r);
    const edit = document.body.dataset.screen === 'request-object-edit' || r !== primary;
    for (const slot of document.querySelectorAll('[data-field-slot]')) slot.innerHTML = fieldSlot(r, slot.dataset.fieldSlot, edit);
    const distributed = document.querySelector('[data-distributed]');
    if (distributed) distributed.outerHTML = assignedSection(r);
  });
  if (R.konturBreadcrumbPath) {
    const previousPath = R.konturBreadcrumbPath;
    R.konturBreadcrumbPath = id => {
      if (id.startsWith('chat-')) return [...previousPath('chats'), {id, label: 'Заявка № ' + id.slice(5)}];
      return previousPath(id);
    };
  }
  if (document.body.dataset.edition === 'v2' && !location.hash) {
    history.replaceState(null, '', matchMedia('(max-width: 719px)').matches ? '#chats' : '#chat-10428');
  }
})();
