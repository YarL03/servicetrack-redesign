'use strict';
Object.assign(Kontur, {
  escape(value) {
    return String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c],
    );
  },
  request() {
    return this.requests.find((r) => r.id === this.state.id) || this.requests[0];
  },
  activeRequests() {
    return this.requests.filter((r) => r.mine && r.status !== 'EXECUTED');
  },
  addressGroups() {
    const groups = new Map();
    const streetOnly = this.state.addressGrouping === 'street';
    for (const request of this.activeRequests()) {
      const key = JSON.stringify([request.city, request.street, streetOnly ? null : request.house]);
      if (!groups.has(key))
        groups.set(key, {key, city: request.city, street: request.street, house: request.house, rows: []});
      groups.get(key).rows.push(request);
    }
    return [...groups.values()].map((group) => ({
      ...group,
      rows: group.rows.sort(
        (a, b) =>
          String(a.house).localeCompare(String(b.house), 'ru', {numeric: true}) ||
          String(a.apartment).localeCompare(String(b.apartment), 'ru', {numeric: true}),
      ),
    }));
  },
  listSummary() {
    const rows = this.activeRequests();
    return `${rows.length} активных · адресов: ${new Set(rows.map((r) => JSON.stringify([r.city, r.street, r.house]))).size}`;
  },
  unreadCount() {
    return this.requests.reduce((count, r) => count + r.unread, 0);
  },
  address(r, full = false) {
    return `${full ? r.city + ', ' : ''}ул. ${r.street}, ${r.house}${r.apartment ? ` · кв. ${r.apartment}` : ''}`;
  },
  href(screen, id) {
    return `#${screen}${id ? '/' + id : ''}`;
  },
  badge(r) {
    const awaitingRevision = r.revision && r.status === 'READY_TO_PROCESS';
    const [label, tone] = awaitingRevision ? ['Доработка', 'danger'] : this.statuses[r.status];
    return `<span class="chip ${tone}">${this.icon(awaitingRevision ? 'alert' : r.status === 'EXECUTED' ? 'check' : r.status === 'DELAYED' ? 'clock' : 'list')}${label}</span>`;
  },
  button(label, action, kind = 'primary', icon = '') {
    return `<button class="btn ${kind} full" data-action="${action}">${label}${icon ? this.icon(icon) : ''}</button>`;
  },
  linkButton(label, screen, kind = 'primary', icon = '') {
    return `<a class="btn ${kind} full" href="${this.href(screen, this.state.id)}">${label}${icon ? this.icon(icon) : ''}</a>`;
  },
  iconButton(name, label, action, extra = '') {
    return `<button class="icon-button ${extra}" data-action="${action}" aria-label="${label}">${this.icon(name)}</button>`;
  },
  header(title, subtitle = '', action = '') {
    action ||= this.notifications.bell();
    action = '<div class="row gap8">' + this.modeButton() + action + '</div>';
    return `<header class="app-header"><div class="row between"><div><p class="kicker">${['queue', 'locations', 'statuses'].includes(this.state.screen) ? 'Четверг, 19 ноября' : 'Сервис Трек · мобильная команда'}</p><h1>${title}</h1></div>${action}</div>${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}</header>`;
  },
  backHeader(title, subtitle = '', back = 'queue', action = '') {
    return `<header class="header-back"><a class="icon-button" href="${this.notifications.backHref() || this.href(back, this.state.id)}" aria-label="Назад">${this.icon('back')}</a><div class="grow"><h1>${title}</h1>${subtitle ? `<small>${subtitle}</small>` : ''}</div>${action}</header>`;
  },
  network() {
    return this.state.offline
      ? `<div class="network-strip">${this.icon('offline')}<span>Без сети · данные на устройстве</span><button data-action="open-sync">Подробнее</button></div>`
      : '';
  },
  bottom(active = 'mine') {
    const simple = this.state.mode === 'simple';
    const tabs = simple
      ? [
          ['mine', 'chat', 'Заявки', 'inbox'],
          ['profile', 'user', 'Профиль', 'profile'],
        ]
      : [
          ['mine', 'list', 'Мои', this.state.listView],
          ['all', 'grid', 'Все', 'all'],
          ['chats', 'chat', 'Чаты', 'chats'],
          ['profile', 'user', 'Профиль', 'profile'],
        ];
    return `<nav class="bottom-nav ${simple ? 'simple-nav' : ''}" aria-label="Основная навигация">${tabs
      .map(
        ([id, icon, label, route]) =>
          `<a href="#${route}" class="${active === id ? 'active' : ''}" ${active === id ? 'aria-current="page"' : ''}><span>${this.icon(icon)}${id === 'chats' && this.unreadCount() ? `<i class="badge-count">${this.unreadCount()}</i>` : ''}</span>${label}</a>`,
      )
      .join('')}</nav>`;
  },
  listTools() {
    return `<div class="search-tools"><a class="search-entry" href="#search">${this.icon('search')}Номер, адрес или абонент</a><a class="icon-button bordered" href="#filters" aria-label="Фильтры заявок">${this.icon('filter')}</a></div>`;
  },
  views() {
    return `<nav class="view-switch" aria-label="Вид списка">${[
      ['queue', 'Очередь'],
      ['locations', 'Адреса'],
      ['statuses', 'Статусы'],
    ]
      .map(
        ([route, label]) =>
          `<a href="#${route}" class="${this.state.screen === route ? 'active' : ''}" ${this.state.screen === route ? 'aria-current="page"' : ''}>${label}</a>`,
      )
      .join('')}</nav>`;
  },
  requestCard(r, compact = false) {
    return `<a class="request-card ${r.revision || r.status === 'DELAYED' ? 'attention' : ''}" href="${this.href('detail', r.id)}"><div class="request-meta"><span class="mono">№ ${r.id}</span>${this.badge(r)}</div><h3>${this.address(r)}</h3><p class="request-type">${r.type}</p>${r.revision ? '<p class="compact-msg">Нужно переснять фото пломбы</p>' : r.status === 'DELAYED' ? '<p class="compact-msg">Абонента не было дома</p>' : !compact ? `<div class="request-footer"><span>${r.customer}</span><span>${r.unread ? this.icon('chat') + ` ${r.unread}` : this.icon('chevron')}</span></div>` : ''}</a>`;
  },
  notice(title, text, tone = 'info', icon = 'alert') {
    return `<div class="notice ${tone}">${this.icon(icon)}<div>${title ? `<strong>${title}</strong>` : ''}${text}</div></div>`;
  },
  actionbar(content, hint = '') {
    return `<footer class="actionbar">${hint ? `<small>${hint}</small>` : ''}${content}</footer>`;
  },
  progress() {
    const d = this.state.draft;
    return Number(Boolean(d.serial.trim())) + Number(/^\d+([.,]\d+)?$/.test(d.reading.trim())) + Number(d.photo);
  },
  filteredRequests() {
    const s = this.state;
    const q = s.query.toLocaleLowerCase('ru').trim().replace(/[№,·]/g, ' ').replace(/\s+/g, ' ');
    return this.requests.filter(
      (r) =>
        (s.scope === 'all' ||
          (s.scope === 'history' ? r.status === 'EXECUTED' && r.mine : r.mine && r.status !== 'EXECUTED')) &&
        (s.filters.status === 'all' || r.status === s.filters.status) &&
        (s.filters.type === 'all' || r.type === s.filters.type) &&
        (!q ||
          q
            .split(' ')
            .every((term) =>
              `${r.id} ${r.external} ${this.address(r, true)} ${r.customer}`.toLocaleLowerCase('ru').includes(term),
            )),
    );
  },
  searchResults() {
    const list = this.filteredRequests();
    if (!this.state.query && this.state.filters.status === 'all' && this.state.filters.type === 'all')
      return `<div class="section-label">Недавние запросы</div>${['Лермонтова, 18', '10428', 'Байкальская'].map((q) => `<button class="recent" data-query="${q}">${this.icon('history')}<span>${q}</span>${this.icon('arrow')}</button>`).join('')}<p class="search-hint">Найдите заявку по номеру, внешнему номеру, адресу или имени абонента.</p>${this.state.offline ? this.notice('Поиск на устройстве', 'Показаны только сохранённые заявки. Для полного реестра потребуется связь.', 'warning', 'offline') : ''}`;
    return `<p class="result-label" role="status">${this.state.offline ? 'На устройстве' : 'Найдено'}: <strong>${list.length}</strong>${this.state.filters.status !== 'all' || this.state.filters.type !== 'all' ? ' · фильтры включены' : ''}</p>${list.length ? list.map((r) => this.requestCard(r, true)).join('') : `<div class="empty">${this.icon('search')}<h2>Заявки не найдены</h2><p>Проверьте номер или напишите только улицу. Можно расширить область поиска.</p>${this.button('Искать во всех заявках', 'search-all', 'soft')}${this.button('Сбросить запрос и фильтры', 'search-reset', 'secondary')}</div>`}`;
  },
  fileCard(file, remove = false) {
    return `<div class="file-card"><span class="file-icon">${this.icon(file.kind === 'photo' ? 'photo' : file.kind === 'video' ? 'video' : file.kind === 'audio' ? 'mic' : 'file')}</span><button class="grow file-name" data-action="preview-file" data-file-id="${file.id || 'scheme'}"><strong>${this.escape(file.name)}</strong><small>${this.escape(file.size || '248 КБ')} · ${file.demo ? 'пример' : 'локальный файл'}</small></button>${remove ? `<button class="icon-button" data-remove-file="${file.id}" aria-label="Удалить ${this.escape(file.name)}">${this.icon('close')}</button>` : `<button class="icon-button" data-action="preview-file" data-file-id="${file.id || 'scheme'}" aria-label="Посмотреть файл">${this.icon('chevron')}</button>`}</div>`;
  },
});
