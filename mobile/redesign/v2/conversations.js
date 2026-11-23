'use strict';
(() => {
  const K = Kontur,
    s = K.state;
  K.paths.bolt = '<path d="m14 2-10 12h7l-1 8 10-13h-7z"/>';
  K.paths.layers = '<path d="m12 3 10 5-10 5L2 8zM3 12l9 5 9-5M3 16l9 5 9-5"/>';
  K.paths.meter =
    '<rect x="5" y="2.5" width="14" height="19" rx="3"/><path d="M8 6h8v4H8zM8 17h8m-6 0v2m4-2v2"/><circle cx="12" cy="13.5" r="1"/>';
  K.paths.up = '<path d="M12 20V4m-7 7 7-7 7 7"/>';
  const E = K.escape,
    I = K.icon;
  const events = {
    10428: [
      ['08:50', 'event', 'Заявка назначена'],
      ['09:24', 'worker', 'Я на объекте. Начинаю замену счётчика.'],
      ['09:35', 'manager', 'Схема подключения во вложении.'],
      ['09:37', 'manager', 'Пришлите фото новой пломбы, чтобы был виден номер. Прикладываю примеры.'],
    ],
    10430: [
      ['08:20', 'event', 'Заявка назначена'],
      ['09:05', 'worker', 'По телефону и в домофон никто не отвечает. Как оформить визит?'],
      ['09:12', 'manager', 'Зафиксируйте недопуск и приложите фото уведомления.'],
    ],
    10432: [
      ['08:35', 'event', 'Заявка возвращена на доработку'],
      ['08:46', 'manager', 'На фото не читается номер пломбы. Нужен снимок крупнее.'],
    ],
    10429: [
      ['08:30', 'event', 'Заявка назначена'],
      ['08:32', 'manager', 'Абонент ждёт звонка перед визитом.'],
    ],
    10431: [['08:15', 'event', 'Заявка назначена']],
    10433: [['08:05', 'event', 'Работа завершена']],
  };
  for (const [id, rows] of Object.entries(events)) {
    s.messages[id] = rows.map(([time, role, text], index) => ({id: id + '-' + index, time, role, text, files: []}));
  }
  s.messages[10428][2].files.push({
    id: 'scheme',
    name: 'Схема подключения.pdf',
    size: '248 КБ',
    kind: 'file',
    demo: true,
  });
  s.messages[10428][3].files = ['photo', 'video'].map((type) => K.mediaFiles.sample(type, 'sent'));
  s.inboxFilter = 'active';
  s.inboxQuery = '';
  let minute = 9 * 60 + 41;
  K.addEntry = (entry, requestId = s.id) => {
    const time = String(Math.floor(minute / 60) % 24).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
    const message = {...entry, time, id: K.mediaFiles.uniqueId(), order: ++minute};
    (s.messages[requestId] ||= []).push(message);
    return message;
  };
  K.restoreChatMedia = async () => {
    const saved = await K.mediaFiles.savedChatMessages();
    for (const {requestId, ...m} of saved.sort((a, b) => a.order - b.order)) {
      for (const f of m.files) if (f.blob) f.url = URL.createObjectURL(f.blob);
      (s.messages[requestId] ||= []).push(m);
      minute = Math.max(minute, m.order);
    }
  };
  K.modes = {simple: 'Упрощённый', expanded: 'Расширенный'};
  K.modeChoices = (description = false) =>
    Object.entries(K.modes)
      .map(
        ([key, title]) =>
          `<button class="mode-choice" data-action="set-mode" data-mode="${key}" aria-pressed="${s.mode === key}">${I(key === 'simple' ? 'chat' : 'layers')}<span><strong>${title}</strong>${description ? '<small>' + (key === 'simple' ? 'Заявка открывается как чат' : 'Заявки и чаты в разных разделах') + '</small>' : ''}</span><i>${s.mode === key ? I('check') : ''}</i></button>`,
      )
      .join('');
  K.modeButton = () => `<button class="mode-trigger" data-action="mode-menu">${I('layers')}Режим</button>`;
  const latest = (r) => s.messages[r.id]?.at(-1);
  const address = (r) => `${r.street}, ${r.house}`;
  function chatStatus(r) {
    const delivery = s.pendingIds?.includes(r.id)
      ? `<span class="chip warning chat-delivery">${I('cloud')}Ожидает отправки</span>`
      : '';
    return `<span class="chat-status">${K.badge(r)}${delivery}</span>`;
  }
  const chatFiles = (r) => (r.id === s.id ? s.attachments : s.attachmentDrafts[r.id]) || [];
  const preview = (r) => {
    const m = latest(r);
    if (s.chatText[r.id]?.trim()) return 'Черновик · ' + s.chatText[r.id];
    if (chatFiles(r).length) return 'Черновик · ' + chatFiles(r)[0].name;
    if (!m) return 'Начать переписку';
    const sender = m.role === 'worker' ? 'Вы · ' : m.role === 'manager' ? 'Елена · ' : '';
    return sender + (m.text || m.files?.[0]?.name || 'Вложение');
  };
  K.hasConversation = (r) =>
    (s.messages[r.id] || []).some((m) => m.role !== 'event') || s.chatText[r.id]?.trim() || chatFiles(r).length;
  function threadRow(r) {
    const streetGroup = ['street', 'street-house'].includes(s.chatGrouping);
    const heading = streetGroup ? `Дом ${r.house} · кв. ${r.apartment}` : address(r);
    const location = streetGroup ? '' : `${s.chatGrouping === 'city' ? '' : r.city + ' · '}кв. ${r.apartment} · `;
    return `<a class="thread-row" href="#chat/${r.id}"><span class="request-symbol">${I(r.type === 'Проверка подключения' ? 'bolt' : 'meter')}</span><span class="row-text"><span class="row-heading"><strong>${E(heading)}</strong><time>${latest(r)?.time || ''}</time></span><span class="request-type">${E(r.type)}</span><span class="thread-meta">${chatStatus(r)}<span class="unit-line">${E(location)}№ ${r.id}</span></span><span class="row-preview">${E(preview(r))}</span></span>${r.unread ? `<b class="unread-dot" aria-label="Непрочитанных: ${r.unread}">${r.unread}</b>` : ''}</a>`;
  }
  function sorted(rows) {
    return rows
      .slice()
      .sort(
        (a, b) =>
          (latest(b)?.order || 0) - (latest(a)?.order || 0) ||
          (latest(b)?.time || '').localeCompare(latest(a)?.time || ''),
      );
  }
  const filters = {active: 'Активные', unread: 'Непрочитанные', archive: 'Архив'};
  function pool(filter) {
    return K.requests.filter(
      (r) =>
        r.mine &&
        (filter === 'archive' ? r.status === 'EXECUTED' : r.status !== 'EXECUTED' && (filter !== 'unread' || r.unread)),
    );
  }
  K.inboxRows = () => {
    const terms = s.inboxQuery
      .trim()
      .toLocaleLowerCase('ru')
      .split(/[\s,№·]+/)
      .filter(Boolean);
    const rows = sorted(pool(s.inboxFilter)).filter((r) =>
      terms.every((term) => `${r.id} ${K.address(r, true)} ${r.customer}`.toLocaleLowerCase('ru').includes(term)),
    );
    if (!rows.length)
      return `<div class="empty">${I('chat')}<h2>${s.inboxFilter === 'unread' && !terms.length ? 'Всё прочитано' : 'Заявок не найдено'}</h2><p>Посмотрите активные заявки или измените поиск.</p><button class="btn soft" data-action="reset-inbox">К активным заявкам</button></div>`;
    if (s.inboxFilter === 'active' && !terms.length)
      rows.sort((a, b) => Number(b.status === 'IN_PROGRESS') - Number(a.status === 'IN_PROGRESS'));
    const caption = s.inboxFilter === 'archive' ? 'Завершённые диалоги' : 'Диалоги по заявкам';
    const heading =
      s.chatGrouping === 'none' ? `<div class="list-caption">${caption} <span>${rows.length}</span></div>` : '';
    return heading + K.chatGroups.rows(rows, threadRow);
  };
  K.screens.inbox = () =>
    `<header class="inbox-head"><div class="inbox-tools"><span>${I('pin')}Иркутская область</span>${K.modeButton()}</div><div class="inbox-title"><h1>Мои заявки</h1>${K.notifications.bell()}</div><label class="inbox-search">${I('search')}<input id="inbox-search" aria-label="Поиск по адресу, номеру или абоненту" placeholder="Адрес, номер или абонент" value="${E(s.inboxQuery)}"></label><div class="inbox-tabs" role="group" aria-label="Подборка заявок">${Object.entries(
      filters,
    )
      .map(
        ([id, label]) =>
          `<button data-action="filter-inbox" data-filter="${id}" aria-pressed="${s.inboxFilter === id}">${label}<span class="${id === 'unread' && pool(id).length ? 'unread-total' : ''}">${pool(id).length}</span></button>`,
      )
      .join('')}</div></header>` +
    K.network() +
    K.chatGroups.control() +
    `<div id="inbox-rows" class="scroll-content inbox-body">${K.inboxRows()}</div>` +
    K.bottom();
  K.screens.chats = () =>
    K.header('Чаты', 'Переписка по заявкам') +
    K.network() +
    K.chatGroups.control() +
    `<div class="scroll-content inbox-body">${K.chatGroups.rows(sorted(K.requests.filter(K.hasConversation)), threadRow)}</div>` +
    K.bottom('chats');
  function entry(m, r) {
    if (m.role === 'event')
      return `<div class="timeline-event">${I('check')}<span>${E(m.text)}</span><time>${m.time}</time></div>`;
    const own = m.role === 'worker';
    const anchor =
      !own && m === s.messages[r.id].filter((msg) => msg.role === 'manager').at(-1)
        ? ` id="message-manager-${r.id}"`
        : '';
    return `<article${anchor} class="message ${own ? 'own' : ''}">${own ? '' : '<div class="sender">Елена · менеджер</div>'}${m.text ? `<p>${E(m.text)}</p>` : ''}${K.mediaUI.messageFiles(m)}<div class="message-meta">${m.time} ${m.status === 'queued' ? '· В очереди' : m.status === 'failed' ? '· Не отправлено' : ''} ${own ? I(m.status === 'queued' ? 'clock' : 'checks') : ''}</div></article>`;
  }
  K.workStep = () =>
    !s.draft.serial.trim()
      ? 'serial'
      : !/^\d+([.,]\d+)?$/.test(s.draft.reading.trim())
        ? 'reading'
        : !s.draft.fieldMedia.work.length
          ? 'photo'
          : 'review';
  const steps = {
    serial: ['Заводской номер', 'Перенесите номер с корпуса установленного прибора.', 'Ввести номер'],
    reading: ['Начальные показания', 'Введите значение с дисплея счётчика в кВт·ч.', 'Внести показания'],
    photo: ['Фото установленного прибора', 'В кадре должны быть видны показания и номер пломбы.', 'Приложить фото'],
    review: ['Проверка результата', 'Сверьте данные всех шагов перед завершением заявки.', 'Проверить результат'],
  };
  function workMedia(nextPhoto) {
    const photos = nextPhoto || s.draft.fieldMedia.work.length ? K.mediaUI.panel('work', 'chat', nextPhoto) : '';
    return photos + K.mediaUI.panel('work-extra', 'chat');
  }
  function workCard(r) {
    if (r.status === 'EXECUTED') return K.button('Посмотреть отчёт', 'view-result', 'secondary', 'file');
    if (!r.hasChatFormSteps || !r.mine || s.pendingIds?.includes(r.id)) return '';
    const started = r.status === 'IN_PROGRESS';
    const nextPhoto = started && K.workStep() === 'photo';
    const [title, hint, cta] = started
      ? steps[K.workStep()]
      : [
          r.revision ? 'Исправление замечания' : r.type,
          r.revision ? 'Проверьте замечание менеджера перед началом.' : 'Начните работу, когда будете на объекте.',
          r.status === 'DELAYED' ? 'Возобновить работу' : 'Начать работу',
        ];
    return `<section class="work-prompt"><div class="prompt-kicker"><span>${I('meter')} Рабочий шаг</span><small>${started ? K.progress() + ' / 3' : '№ ' + r.id}</small></div>${nextPhoto ? '' : `<h2>${title}</h2><p>${hint}</p>`}${started ? '<div class="progress-bars" aria-label="Заполнено полей: ' + K.progress() + ' из 3">' + [1, 2, 3].map((i) => '<i class="' + (K.progress() >= i ? 'done' : '') + '"></i>').join('') + '</div>' : ''}${nextPhoto ? '' : K.button(cta, started ? 'chat-step' : 'start-work', 'primary', 'arrow')}${started ? workMedia(nextPhoto) : ''}</section>`;
  }
  K.screens.chat = () => {
    const r = K.request(),
      simple = s.mode === 'simple';
    return (
      K.backHeader(
        address(r),
        `${E(r.city)} · кв. ${r.apartment} · № ${r.id}`,
        simple ? 'inbox' : 'chats',
        K.iconButton('more', 'Действия диалога', 'chat-menu'),
      ) +
      `<button class="thread-context" data-action="chat-context"><span class="thread-type">${I('list')}${r.type}</span>${chatStatus(r)}${I('chevron')}</button>` +
      K.network() +
      `<div class="scroll-content dialogue" id="messages"><div class="message-day"><span>Сегодня, 19 ноября</span></div>${(s.messages[r.id] || []).map((m) => entry(m, r)).join('') || '<div class="timeline-event">Начните переписку по этой заявке</div>'}${simple ? workCard(r) : ''}</div><div class="composer"><div class="draft-attachments">${s.attachments.map((f) => K.fileCard(f, true)).join('')}</div><form id="message-form" class="compose-row">${K.iconButton('clip', 'Прикрепить к сообщению', 'attach-chat')}<label class="grow"><span class="sr-only">Сообщение менеджеру</span><textarea id="message-text" rows="1" placeholder="Сообщение…">${E(s.chatText[r.id] || '')}</textarea></label><button class="icon-button send-button" type="submit" aria-label="Отправить сообщение">${I('up')}</button></form></div>`
    );
  };
})();
