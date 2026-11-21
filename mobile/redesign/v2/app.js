'use strict';
(() => {
  const K = Kontur,
    s = K.state,
    $ = (q) => document.querySelector(q);
  const params = new URLSearchParams(location.search);
  let toastTimer,
    returnFocus,
    filterDraft = null,
    localSaveAvailable = true;
  const draftKey = 'kontur-mobile-v2-drafts';
  const mineLists = ['queue', 'locations', 'statuses'];
  const allLists = ['all', 'all-locations', 'all-statuses'];
  const groupingKey = 'service-track-mobile-v2-address-grouping';
  const chatGroupingKey = 'service-track-mobile-v2-chat-grouping';
  const modeKey = 'service-track-mobile-v2-mode';
  s.mode = 'simple';
  try {
    if (localStorage.getItem(modeKey) === 'expanded') s.mode = 'expanded';
  } catch {}
  if (Object.hasOwn(K.modes, params.get('mode'))) s.mode = history.state?.mode || params.get('mode');
  let drafts = {};
  let readingEditor = '';
  s.attachmentDrafts = {};
  let pickerTarget;
  const scrollPositions = {};
  let renderedKey = '';
  try {
    drafts = JSON.parse(localStorage.getItem(draftKey) || '{}');
    s.theme = localStorage.getItem('kontur-mobile-v2-theme') || 'light';
  } catch {
    localSaveAvailable = false;
  }
  s.draft = K.mediaFiles.migrate({...K.initialDraft(), ...drafts[s.id]}, s.id);
  try {
    const saved = localStorage.getItem(chatGroupingKey);
    if (K.chatGroups.valid(saved)) s.chatGrouping = saved;
    const addressMode = localStorage.getItem(groupingKey);
    if (K.requestAddresses.valid(addressMode)) s.addressGrouping = addressMode;
  } catch {}
  if (K.requestAddresses.valid(params.get('grouping'))) s.addressGrouping = params.get('grouping');
  if (params.get('theme')) s.theme = params.get('theme') === 'dark' ? 'dark' : 'light';
  if (params.get('offline') === '1') s.offline = true;
  if (params.get('embed') === '1') document.body.classList.add('embed');

  function saveDraft() {
    drafts[s.id] = {...s.draft};
    try {
      localStorage.setItem(draftKey, JSON.stringify(drafts));
      localSaveAvailable = true;
    } catch {
      localSaveAvailable = false;
    }
    const status = $('#save-state');
    if (status)
      status.innerHTML =
        K.icon(localSaveAvailable ? 'check' : 'alert') +
        (localSaveAvailable ? 'Черновик сохранён на устройстве' : 'Черновик доступен до закрытия вкладки');
  }
  function selectRequest(id) {
    if (id && s.id !== id) {
      saveDraft();
      s.attachmentDrafts[s.id] = s.attachments;
      s.id = id;
      s.attachments = s.attachmentDrafts[id] || [];
      s.draft = K.mediaFiles.migrate({...K.initialDraft(id), ...drafts[id]}, id);
      s.reviewError = false;
      for (const [key, fallback] of Object.entries({
        delayComment: '',
        delayDate: '2026-11-19',
        delayTime: '09:41',
      })) {
        s[key] = s.draft[key] ?? fallback;
      }
    }
  }
  function toast(message) {
    clearTimeout(toastTimer);
    $('#toast').textContent = message;
    $('#toast').classList.add('show');
    toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3600);
  }
  function go(screen, id = s.id) {
    if (location.hash === K.href(screen, id)) {
      route();
    } else location.hash = K.href(screen, id);
  }
  function setTheme() {
    document.documentElement.dataset.theme = s.theme;
    $('#theme-toggle').textContent = s.theme === 'light' ? 'Тёмная тема' : 'Светлая тема';
    try {
      localStorage.setItem('kontur-mobile-v2-theme', s.theme);
    } catch {}
  }
  function catalog() {
    const simple = s.mode === 'simple';
    $('#studio-modes').innerHTML = K.modeChoices();
    const home = simple ? 'inbox' : s.listView;
    const checkpoint = K.requests.find((r) => r.status === 'IN_PROGRESS') || K.request();
    const links = [
      [home, 'list', simple ? 'Список диалогов' : 'Очередь заявок'],
      [simple ? 'chat' : 'work', 'meter', 'Работа по заявке', checkpoint.id],
      [simple ? 'attach' : 'chats', simple ? 'clip' : 'chat', simple ? 'Выбор вложения' : 'Переписка', checkpoint.id],
      ['profile', 'user', 'Профиль монтёра'],
    ];
    $('#studio-routes').innerHTML = links
      .map(([screen, icon, label, id]) =>
        screen === 'attach'
          ? `<button data-action="studio-attach">${K.icon(icon)}${label}</button>`
          : `<a href="${K.href(screen, id)}" ${s.screen === screen ? 'aria-current="page"' : ''}>${K.icon(icon)}${label}</a>`,
      )
      .join('');
    $('#live-title').textContent = K.modes[s.mode];
    $('#studio-network').textContent = s.offline ? 'Восстановить связь' : 'Показать без сети';
    const list = [...mineLists, ...allLists, 'inbox', 'chats'].includes(s.screen);
    const target = list ? (simple ? 'chat' : 'chats') : home;
    const img = simple ? (list ? 'thread' : 'inbox') : list ? 'chats' : 'queue';
    const caption = simple
      ? list
        ? 'Открыть чат заявки'
        : 'Открыть список диалогов'
      : list
        ? 'Открыть раздел чатов'
        : 'Открыть список заявок';
    $('#reference-image').src = 'previews/' + img + '.png';
    $('#reference-image').alt = '';
    $('#reference-caption').textContent = caption + ' ↗';
    $('#reference-link').onclick = () => go(target, list ? checkpoint.id : s.id);
  }
  function render() {
    const oldScroll = $('#app .scroll-content');
    if (renderedKey && oldScroll) scrollPositions[renderedKey] = oldScroll.scrollTop;
    if (!K.screens[s.screen]) s.screen = home();
    if (s.screen === 'complete' && !s.pendingIds?.includes(s.id) && K.request().status !== 'EXECUTED')
      s.screen = 'detail';
    if (
      s.screen === 'delay' &&
      (!K.request().mine || K.request().status === 'EXECUTED' || s.pendingIds?.includes(s.id))
    )
      s.screen = s.mode === 'simple' ? 'chat' : 'detail';
    if (['work', 'notification-in-work', 'stages', 'review'].includes(s.screen)) {
      if (s.pendingIds?.includes(s.id)) s.screen = 'complete';
      else if (K.request().status === 'EXECUTED' || !K.request().mine) s.screen = 'detail';
    }
    $('#app').innerHTML = K.screens[s.screen]();
    catalog();
    setTheme();
    if (['locations', 'all-locations'].includes(s.screen)) renderedKey = s.screen + '/' + s.addressGrouping;
    else if (s.screen === 'inbox' || s.screen === 'chats')
      renderedKey = [s.screen, s.chatGrouping, s.screen === 'inbox' ? s.inboxFilter : ''].join('/');
    else renderedKey = s.screen + '/' + s.id;
    const newScroll = $('#app .scroll-content');
    if (newScroll)
      newScroll.scrollTop = scrollPositions[renderedKey] ?? (s.screen === 'chat' ? newScroll.scrollHeight : 0);
    K.notifications.afterRender();
    document.body.dataset.mode = s.mode;
    document.body.dataset.screen = s.screen;
    document.title = `${$('#app h1')?.textContent || 'Заявки и чаты'} · Сервис Трек`;
    if (s.screen === 'filters') {
      filterDraft = {...s.filters};
      updateFilterCount();
    }
    if (['work', 'notification-in-work'].includes(s.screen) && !localSaveAvailable) {
      $('#save-state').innerHTML = K.icon('alert') + 'Черновик доступен до закрытия вкладки';
    }
  }
  function renderPreservingInput() {
    const active = document.activeElement;
    const selector = active?.id
      ? '#' + active.id
      : active?.dataset.preference
        ? `[data-preference="${active.dataset.preference}"]`
        : null;
    const selection = [active?.selectionStart, active?.selectionEnd];
    const previousTop = selector ? active.getBoundingClientRect().top : null;
    render();
    const replacement = selector && $(selector);
    if (replacement) {
      replacement.focus({preventScroll: true});
      if (typeof selection[0] === 'number') replacement.setSelectionRange(...selection);
      const scroll = $('#app .scroll-content');
      if (scroll?.contains(replacement)) scroll.scrollTop += replacement.getBoundingClientRect().top - previousTop;
    }
  }
  function home() {
    return s.mode === 'simple' ? 'inbox' : s.listView;
  }
  function route() {
    const [requested, id] = (location.hash.slice(1) || params.get('screen') || home()).split('/');
    let screen = K.screens[requested] ? requested : home();
    if (K.requests.some((r) => r.id === Number(id))) selectRequest(Number(id));
    if (s.mode === 'simple') {
      if (K.notificationState.origin?.target === screen && ['detail', 'work'].includes(screen) && K.request().mine)
        K.notificationState.origin.target = 'chat';
      if ([...mineLists, ...allLists, 'chats'].includes(screen)) screen = 'inbox';
      if (
        ['detail', 'work', 'stages', 'review', 'complete', 'notification-in-work'].includes(screen) &&
        K.request().mine
      )
        screen = 'chat';
    } else if (screen === 'inbox') screen = s.listView;
    if (screen !== requested) history.replaceState(history.state, '', K.href(screen, id));
    if (params.has('mode')) history.replaceState({...history.state, mode: s.mode}, '');
    s.screen = screen;
    if (mineLists.includes(screen)) {
      s.listOrigin = s.listView = screen;
      s.scope = 'mine';
    } else if (allLists.includes(screen)) {
      s.listOrigin = s.allView = screen;
      s.scope = 'all';
    }
    if (screen === 'inbox') s.scope = 'mine';
    if (screen === 'chat') K.request().unread = 0;
    K.notifications.onRoute(s.screen, id);
    if ($('#media-viewer').open) $('#media-viewer').close();
    if ($('#sheet').open) $('#sheet').close();
    render();
  }
  function sheet(title, content) {
    K.audioRecorder.cancel();
    if (!$('#sheet').open) returnFocus = document.activeElement;
    placeSheet();
    $('#sheet').innerHTML =
      `<div class="row"><h2 id="sheet-title">${title}</h2>${K.iconButton('close', 'Закрыть', 'close-sheet')}</div>${content}`;
    if (!$('#sheet').open) $('#sheet').showModal();
  }
  function placeSheet() {
    const rect = $('#device').getBoundingClientRect();
    for (const dialog of document.querySelectorAll('#device dialog')) {
      dialog.style.setProperty('--sheet-left', Math.max(0, rect.left) + 'px');
      dialog.style.setProperty('--sheet-width', Math.min(innerWidth, rect.width) + 'px');
      dialog.style.setProperty('--sheet-bottom', Math.max(0, innerHeight - rect.bottom) + 'px');
      dialog.style.setProperty('--sheet-height', Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top) + 'px');
    }
  }
  window.addEventListener('resize', placeSheet);
  window.addEventListener('scroll', () => {
    if ($('#device dialog[open]')) placeSheet();
  });
  function closeSheet() {
    $('#sheet').close();
    if (returnFocus?.isConnected) returnFocus.focus();
  }
  function updateFilterCount() {
    if (!filterDraft) return;
    const previous = s.filters;
    s.filters = filterDraft;
    const count = K.filteredRequests().length;
    s.filters = previous;
    const button = $('[data-action="apply-filters"]');
    if (button) button.textContent = `Показать заявки · ${count}`;
  }
  function validWork() {
    return K.progress() === 3;
  }
  const documentTypes = '.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv';
  const mediaTypes = 'image/*,video/*,audio/*';
  function chooseFile(kind, context) {
    const picker = $('#file-picker');
    s.attachmentContext = context;
    const photoOnly = ['work', 'delay', 'delay-act'].includes(context);
    const device = kind.startsWith('device-');
    if (device || kind.startsWith('gallery-')) picker.accept = kind.endsWith('video') ? 'video/*' : 'image/*';
    else if (photoOnly) picker.accept = 'image/*';
    else if (kind === 'mixed') picker.accept = mediaTypes + ',' + documentTypes;
    else if (kind === 'media') picker.accept = mediaTypes;
    else picker.accept = documentTypes;
    picker.multiple = !device;
    if (device) picker.setAttribute('capture', 'environment');
    else picker.removeAttribute('capture');
    pickerTarget = {id: s.id, screen: s.screen, context, panel: $('#sheet').firstElementChild};
    picker.value = '';
    picker.click();
  }
  function attachmentSheet(context) {
    s.attachmentContext = context;
    if (context === 'chat' && s.attachments.length >= 5) {
      toast('В сообщении уже 5 файлов. Удалите файл, чтобы добавить другой.');
      return;
    }
    const photoOnly = ['work', 'delay', 'delay-act'].includes(context);
    const target = K.mediaFiles.titles[context] || 'Сообщение менеджеру';
    const mixedField = context === 'work-extra';
    const sources = [
      ['camera', 'camera', 'Камера'],
      mixedField ? ['mixed', 'clip', 'Выбрать файлы'] : ['media', 'photo', photoOnly ? 'Галерея' : 'Медиа'],
    ];
    if (context === 'chat') sources.push(['document', 'file', 'Документ']);
    if (mixedField) sources.push(['audio', 'mic', 'Записать аудио']);
    const sourceButtons = sources
      .map(
        ([id, icon, label]) =>
          `<button type="button" data-action="pick-source" data-source="${id}" aria-label="${label}"><span>${K.icon(icon)}</span>${mixedField ? '' : label}</button>`,
      )
      .join('');
    sheet(
      'Прикрепить',
      `<p class="attachment-target">${target} · № ${s.id}</p><div class="source-grid">${sourceButtons}</div><p class="source-help">${photoOnly ? 'Снимок с камеры или фотография из галереи.' : 'Можно выбрать несколько фото, видео, аудиозаписей и документов. До 25 МБ на файл.'}</p><button class="demo-attachment" data-action="add-sample">${K.icon(photoOnly ? 'photo' : 'file')}<span>Добавить пример<small>${K.mediaFiles.samples[photoOnly ? 'photo' : 'file'].name}</small></span>${K.icon('plus')}</button>` +
        (mixedField
          ? '<div class="sample-choices">' +
            ['photo', 'video', 'audio']
              .map(
                (type, i) =>
                  `<button data-action="add-media-sample" data-type="${type}">${['Пример фото', 'Пример видео', 'Пример аудио'][i]}</button>`,
              )
              .join('') +
            '</div>'
          : ''),
    );
  }
  function previewFieldFiles(items, recordedDuration) {
    const {id, attachmentContext: field, draft} = s;
    K.attachmentPreview.open({
      items,
      recordedDuration,
      field,
      requestId: id,
      sheet,
      closeSheet,
      toast,
      async add(entry, comment) {
        const file =
          entry instanceof Blob
            ? await K.mediaFiles.localFile(entry, () => toast('Файл доступен до закрытия вкладки.'))
            : entry;
        file.comment = comment;
        if (recordedDuration) file.duration = recordedDuration;
        draft.fieldMedia[field].push(file);
        if (field === 'work') K.addEntry({role: 'event', text: 'К отчёту приложено фото · ' + file.name}, id);
        saveDraft();
        if (s.id === id) render();
      },
    });
  }
  function addSample(type) {
    const file = K.mediaFiles.sample(type);
    if (s.attachmentContext === 'chat') {
      if (s.attachments.length >= 5) return;
      s.attachments.push({...file, demo: true, size: 'Пример', url: K.mediaFiles.source(file)});
      saveAttachment();
    } else previewFieldFiles([file]);
  }
  function saveAttachment() {
    saveDraft();
    closeSheet();
    render();
    if (s.screen === 'chat') $('#messages').scrollTop = $('#messages').scrollHeight;
  }
  function startWork(request) {
    if (request.status !== 'IN_PROGRESS') K.addEntry({role: 'event', text: 'Работа начата'}, request.id);
    request.status = 'IN_PROGRESS';
    request.revision = false;
  }
  function cacheChatMedia(requestId, message) {
    if (message.files?.some((f) => f.kind === 'photo' || f.kind === 'video'))
      K.mediaFiles
        .saveChatMessage(requestId, message)
        .catch(() => toast('Медиа сообщения доступны до закрытия вкладки.'));
  }
  function sendMessage(resumeConfirmed = false) {
    const text = (s.chatText[s.id] || '').trim();
    if (!text && !s.attachments.length) {
      toast('Напишите сообщение или добавьте файл.');
      return;
    }
    const r = K.request();
    const ready = r.status === 'READY_TO_PROCESS' && !r.revision;
    const delayed = r.status === 'DELAYED';
    if (s.attachments.length && r.mine && !s.pendingIds?.includes(r.id) && (ready || delayed)) {
      if (delayed && !resumeConfirmed) {
        sheet(
          'Возобновить работу?',
          `<p>При отправке сообщения с вложением заявка № ${r.id} перейдёт из статуса «Недопуск» в статус «В работе».</p>` +
            K.button('Отправить и взять в работу', 'confirm-resume-send') +
            K.button('Отмена', 'close-sheet', 'secondary'),
        );
        return;
      }
      startWork(r);
    }
    const message = {
      text,
      files: s.attachments.map((f) => ({...f})),
      status: s.offline ? 'queued' : 'delivered',
      role: 'worker',
    };
    const sent = K.addEntry(message);
    cacheChatMedia(s.id, sent);
    s.attachments = [];
    s.chatText[s.id] = '';
    render();
    $('#messages').scrollTop = $('#messages').scrollHeight;
  }
  function goToMode(mode) {
    if (!Object.hasOwn(K.modes, mode)) return;
    const same = s.mode === mode;
    s.mode = mode;
    if (params.has('mode')) {
      // Explicit demo links choose the initial mode. A manual choice also survives reload.
      history.replaceState({...history.state, mode}, '');
    }
    try {
      localStorage.setItem(modeKey, mode);
    } catch {}
    if ($('#sheet').open) closeSheet();
    if (same) {
      render();
      return;
    }
    const working = ['chat', 'detail', 'work', 'stages', 'review', 'delay', 'complete'].includes(s.screen);
    const target = working ? (mode === 'simple' ? 'chat' : 'detail') : home();
    go(target);
  }
  function chatStep() {
    const step = K.workStep();
    if (step === 'photo') return attachmentSheet('work');
    if (step === 'review') {
      sheet(
        'Проверить результат',
        `<p>№ ${s.id} · ${K.address(K.request())}</p>${K.workForm.review()}${K.button(s.offline ? 'Завершить и отправить позже' : 'Завершить заявку', 'complete', 'primary', 'check')}`,
      );
      return;
    }
    editValue(step);
  }
  function editValue(field) {
    readingEditor = field;
    const reading = field === 'reading';
    sheet(
      reading ? 'Начальные показания' : 'Заводской номер',
      `<form id="step-form"><label class="field"><span>${reading ? 'Показания, кВт·ч' : 'Номер установленного прибора'}</span><input id="step-value" inputmode="${reading ? 'decimal' : 'text'}" placeholder="${reading ? 'Например, 12,5' : 'Номер с корпуса'}" value="${K.escape(s.draft[field])}" aria-describedby="step-error"></label><p id="step-error" role="status"></p><button class="btn primary full">Сохранить в отчёте</button></form>`,
    );
    $('#step-value').focus();
  }
  function deliverQueuedMessages() {
    for (const [id, messages] of Object.entries(s.messages)) {
      for (const message of messages)
        if (message.status === 'queued') {
          message.status = 'delivered';
          cacheChatMedia(Number(id), message);
        }
    }
  }
  function flushQueue() {
    K.notifications.sync();
    if (s.offline) return;
    deliverQueuedMessages();
    for (const id of s.pendingIds || []) {
      K.requests.find((r) => r.id === id).status = 'EXECUTED';
      K.addEntry({role: 'event', text: 'Результат доставлен · заявка выполнена'}, id);
    }
    for (const draft of Object.values(drafts)) K.mediaFiles.acknowledge(draft);
    K.mediaFiles.acknowledge(s.draft);
    saveDraft();
    s.pendingIds = [];
  }
  const actions = {
    'mode-menu': () => sheet('Режим приложения', '<div class="mode-options">' + K.modeChoices(true) + '</div>'),
    'set-mode': (button) => goToMode(button.dataset.mode),
    'chat-group-menu': () => sheet('Группировка чатов', K.chatGroups.choices()),
    'set-chat-group': (button) => {
      const value = button.dataset.chatGrouping;
      if (!K.chatGroups.valid(value)) return;
      s.chatGrouping = value;
      try {
        localStorage.setItem(chatGroupingKey, value);
      } catch {
        toast('Выбор сохранён до закрытия вкладки.');
      }
      closeSheet();
      render();
      ($('#app [data-action="chat-group-menu"]') || $('#app [data-action="app-settings"]'))?.focus({
        preventScroll: true,
      });
    },
    'filter-inbox': (button) => {
      s.inboxFilter = button.dataset.filter;
      render();
      $('#inbox-rows').scrollTop = 0;
    },
    'reset-inbox': () => {
      s.inboxFilter = 'active';
      s.inboxQuery = '';
      render();
    },
    'chat-step': chatStep,
    'edit-serial': () => editValue('serial'),
    'edit-reading': () => editValue('reading'),
    'chat-context': () => {
      if (s.mode === 'expanded') return go('detail');
      const r = K.request();
      sheet(
        'Заявка № ' + r.id,
        `<p>${K.address(r, true)}</p><div class="info-line"><span>Абонент</span><strong>${r.customer}</strong></div><div class="info-line"><span>Работы</span><strong>${r.type}</strong></div><div class="info-line"><span>Менеджер</span><strong>Елена Соколова</strong></div>${K.button('Режим приложения', 'mode-menu', 'secondary', 'layers')}`,
      );
    },
    'attach-chat': () => attachmentSheet('chat'),
    'confirm-resume-send': () => {
      if (!$('#sheet').open) return;
      closeSheet();
      sendMessage(true);
    },
    'attach-work': () => attachmentSheet('work-extra'),
    'pick-source': (button) => {
      const source = button.dataset.source;
      if (source === 'camera') return K.camera.open(s.attachmentContext);
      if (source === 'audio')
        return K.audioRecorder.open(sheet, s.id, (file, duration) => previewFieldFiles([file], duration));
      chooseFile(source, s.attachmentContext);
    },
    'add-media-sample': (button) => addSample(button.dataset.type),
    'add-sample': () => addSample(['chat', 'work-extra'].includes(s.attachmentContext) ? 'file' : 'photo'),
    'studio-attach': () => {
      history.pushState(null, '', K.href('chat', s.id));
      route();
      attachmentSheet('chat');
    },
    'set-address-grouping': (button) => {
      const grouping = button.dataset.grouping;
      if (!K.requestAddresses.valid(grouping) || grouping === s.addressGrouping) return;
      s.addressGrouping = grouping;
      try {
        localStorage.setItem(groupingKey, grouping);
      } catch {
        toast('Выбор сохранён до закрытия вкладки.');
      }
      render();
      $(`[data-grouping="${grouping}"]`).focus({preventScroll: true});
    },
    'toggle-offline': () => {
      s.offline = !s.offline;
      flushQueue();
      render();
    },
    'reset-demo': () => {
      sheet(
        'Сбросить демонстрацию?',
        `<p>Будут удалены черновики, сохранённые файлы и сообщения этого макета.</p>${K.button('Сбросить макет', 'confirm-reset', 'primary')}`,
      );
    },
    'confirm-reset': async () => {
      await K.mediaFiles.reset().catch(() => {});
      try {
        localStorage.removeItem(draftKey);
        localStorage.removeItem(groupingKey);
        localStorage.removeItem(chatGroupingKey);
        localStorage.removeItem(modeKey);
      } catch {}
      location.href = location.pathname + location.search;
      location.reload();
    },
    'close-sheet': closeSheet,
    'open-sync': () => go('sync'),
    'clear-search': () => {
      s.query = '';
      render();
      $('#search-input')?.focus();
    },
    'search-all': () => {
      s.scope = 'all';
      s.filters = {status: 'all', type: 'all'};
      render();
    },
    'search-reset': () => {
      s.query = '';
      s.filters = {status: 'all', type: 'all'};
      render();
      $('#search-input')?.focus();
    },
    'reset-filters': () => {
      filterDraft = {status: 'all', type: 'all'};
      document.querySelector('[name="filter-status"][value="all"]').checked = true;
      $('#filter-type').value = 'all';
      updateFilterCount();
    },
    'apply-filters': () => {
      s.filters = {...filterDraft};
      go('search');
    },
    'history-search': () => {
      s.scope = 'history';
    },
    stages: () => go('stages'),
    'start-work': () => {
      const r = K.request();
      if (r.status === 'EXECUTED' || !r.mine) return;
      if (s.pendingIds?.includes(r.id)) return go('complete');
      startWork(r);
      go(s.mode === 'simple' ? 'chat' : 'work');
    },
    review: () => {
      s.reviewError = !validWork();
      saveDraft();
      if (s.draft.reading && !/^\d+([.,]\d+)?$/.test(s.draft.reading.trim())) {
        toast('Показания должны быть числом, например 12,5.');
        $('#reading')?.focus();
        return;
      }
      go('review');
    },
    complete: () => {
      if (!validWork()) {
        toast('Сначала заполните обязательные поля.');
        go('work');
        return;
      }
      K.mediaFiles.submit(s.draft, ['work', 'work-extra'], s.offline);
      s.draft.finished = true;
      saveDraft();
      if (s.offline) (s.pendingIds ||= []).push(s.id);
      else K.request().status = 'EXECUTED';
      K.addEntry({
        role: 'event',
        text: s.offline ? 'Результат в очереди · ожидает сети' : 'Отчёт принят · заявка выполнена',
      });
      if ($('#sheet').open) closeSheet();
      go(s.mode === 'simple' ? 'chat' : 'complete');
    },
    'work-photo': () => attachmentSheet('work'),
    'delay-photo': () => attachmentSheet('delay'),
    scan: () =>
      sheet(
        'Сканирование номера',
        `<div class="sheet-file">${K.icon('scan')}<p class="mono">73280419</p></div><p>Проверьте распознанный номер перед применением.</p>${K.button('Использовать номер 73280419', 'apply-scan', 'primary')}`,
      ),
    'apply-scan': () => {
      s.draft.serial = '73280419';
      saveDraft();
      closeSheet();
      render();
    },
    delay: () => go('delay'),
    'delay-act': () => attachmentSheet('delay-act'),
    'save-delay': () => {
      if (!s.draft.fieldMedia.delay.length) {
        const field = $('[data-upload-field="delay"]');
        field.open = true;
        field.querySelector('button[data-action="delay-photo"]').focus();
        toast('Добавьте обязательное фото уведомления.');
        return;
      }
      if (!s.delayDate || !s.delayTime) {
        toast('Укажите дату и время недопуска.');
        return;
      }
      K.request().status = 'DELAYED';
      K.mediaFiles.submit(s.draft, ['delay', 'delay-act'], s.offline);
      s.draft.delayed = true;
      K.addEntry({role: 'event', text: 'Зафиксирован недопуск' + (s.delayComment ? ' · ' + s.delayComment : '')});
      saveDraft();
      go('detail');
      setTimeout(() => toast(s.offline ? 'Недопуск сохранён. Ожидает отправки.' : 'Недопуск сохранён в заявке.'), 40);
    },
    'open-chat': () => go('chat'),
    route: () =>
      sheet(
        'Маршрут к объекту',
        `<p>${K.address(K.request(), true)}</p><p>В приложении это действие откроет установленную карту с адресом объекта.</p>${K.button('Скопировать адрес', 'copy-address', 'primary', 'pin')}`,
      ),
    'copy-address': async () => {
      try {
        await navigator.clipboard.writeText(K.address(K.request(), true));
        closeSheet();
        toast('Адрес скопирован.');
      } catch {
        sheet(
          'Адрес объекта',
          `<label class="field"><span>Выделите и скопируйте</span><input readonly value="${K.address(K.request(), true)}"></label>`,
        );
      }
    },
    'call-customer': () =>
      sheet(
        'Связаться с абонентом',
        `<p>${K.request().customer}</p><p>В рабочем приложении откроется системный набор номера из карточки абонента. В демонстрации реальные номера не используются.</p>${K.button('Вернуться к заявке', 'close-sheet', 'secondary')}`,
      ),
    'list-settings': () =>
      sheet(
        'Вид списка',
        `<p>Выбранный вид сохраняется при переходах между разделами.</p>${[
          ['queue', 'Рабочая очередь'],
          ['locations', 'По адресам'],
          ['statuses', 'По статусам'],
        ]
          .map(([id, label]) => `<a class="btn secondary full" href="#${id}">${label}</a>`)
          .join('')}`,
      ),
    'request-menu': () =>
      sheet(
        'Действия заявки',
        `<a class="btn secondary full" href="#stages/${s.id}">Этапы работы</a><a class="btn secondary full" href="#chat/${s.id}">Чат с менеджером</a>${K.button('Режим приложения', 'mode-menu', 'secondary', 'layers')}${!s.pendingIds?.includes(s.id) && K.request().mine && K.request().status !== 'EXECUTED' ? `<a class="btn warning full" href="#delay/${s.id}">Сообщить о недопуске</a>` : ''}`,
      ),
    'stage-source': () =>
      sheet(
        'Осмотр и демонтаж',
        `<p>Этап сохранён. Исходные данные доступны для просмотра.</p>${K.workForm.inspection()}${K.button('Продолжить установку', 'continue-work', 'primary')}`,
      ),
    'continue-work': () => {
      closeSheet();
      go('work');
    },
    'view-result': () => {
      const result = s.id === 10433 ? {...s.draft, serial: '73150622', reading: '12,5'} : s.draft;
      sheet(
        'Результат работы',
        `<p>Заявка № ${s.id} · ${K.address(K.request())}</p>${K.workForm.review(result, false)}${K.button('Закрыть', 'close-sheet', 'secondary')}`,
      );
    },
    'retry-sync': () => {
      if (s.offline) {
        toast('Сейчас нет сети. Фото сохранено на устройстве.');
        return;
      }
      s.syncRetried = true;
      render();
      toast('Фото отправлено.');
    },
    conflict: () =>
      sheet(
        'Форма заявки обновилась',
        `<p>№ 10432 · Менеджер изменил поле «Модель прибора». Перед продолжением сравните данные.</p><div class="info-line"><span>Ваш черновик</span><strong>Меркурий 201.7</strong></div><div class="info-line"><span>На сервере</span><strong>Энергомера CE101</strong></div><p>Локальные файлы сохранятся. Принятие серверной формы потребует повторной проверки и завершения заявки.</p>${K.button('Принять и проверить форму', 'accept-conflict', 'primary')}${K.button('Вернуться без изменений', 'close-sheet', 'secondary')}`,
      ),
    'accept-conflict': () => {
      if (s.offline) {
        toast('Для сверки изменений нужна сеть.');
        return;
      }
      closeSheet();
      go('detail', 10432);
      setTimeout(() => toast('Обновлённая форма принята. Проверьте поля перед завершением.'), 40);
    },
    'chat-menu': () =>
      sheet(
        'Диалог заявки № ' + s.id,
        K.button('Данные заявки', 'chat-context', 'secondary', 'list') +
          (K.request().mine && K.request().status !== 'EXECUTED' && !s.pendingIds?.includes(s.id)
            ? K.button('Сообщить о недопуске', 'delay', 'secondary', 'clock')
            : '') +
          K.button('Режим приложения', 'mode-menu', 'secondary', 'layers'),
      ),
    'preview-file': (button) => {
      const id = button?.dataset.fileId;
      const file = [...s.attachments, ...(s.messages[s.id] || []).flatMap((m) => m.files || [])].find(
        (f) => String(f.id) === id,
      ) || {name: 'Схема подключения.pdf', size: '248 КБ', demo: true};
      const src = K.mediaFiles.source(file);
      sheet(
        'Предпросмотр файла',
        `<div class="sheet-file">${K.icon(file.kind || 'file')}<h3 class="mt16">${K.escape(file.name)}</h3><p>${K.escape(file.size)} · ${file.demo ? 'пример вложения' : 'локальный файл'}</p></div>${src ? `<a class="btn primary full" href="${K.escape(src)}" download="${K.escape(file.name)}">Сохранить выбранный файл</a>` : '<p>Демонстрационное вложение показывает вид документа в переписке. Рабочей электросхемы в макете нет.</p>'}${K.button('Закрыть просмотр', 'close-sheet', 'secondary')}`,
      );
    },
    'app-settings': () =>
      sheet(
        'Настройки',
        `${K.button('Режим приложения', 'mode-menu', 'secondary')}${K.chatGroups.control('Группировка чатов')}${K.button('Переключить светлую / тёмную тему', 'theme-sheet', 'secondary')}${K.button(s.offline ? 'Включить сеть в макете' : 'Показать работу без сети', 'network-sheet', 'secondary')}`,
      ),
    'theme-sheet': () => {
      s.theme = s.theme === 'light' ? 'dark' : 'light';
      setTheme();
    },
    'network-sheet': () => {
      s.offline = !s.offline;
      flushQueue();
      closeSheet();
      render();
    },
  };
  K.mediaUI.init(saveDraft, () => {
    render();
    K.mediaUI.refreshPanels($('#sheet'));
    const finish = $('#sheet [data-action="complete"]');
    if (finish) finish.disabled = !validWork();
  });
  K.camera.init({sheet, chooseFile, capture: addSample, toast});
  K.notifications.init({go, render: renderPreservingInput, sheet, closeSheet, toast});
  Object.assign(actions, K.notifications.actions);
  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]');
    if (action && actions[action.dataset.action]) {
      if (action.dataset.action !== 'history-search') event.preventDefault();
      actions[action.dataset.action](action);
      return;
    }
    const status = event.target.closest('[data-status]');
    if (status) {
      if (s.screen === 'all-statuses') s.allStatus = status.dataset.status;
      else s.status = status.dataset.status;
      render();
      return;
    }
    const scope = event.target.closest('[data-scope]');
    if (scope) {
      s.scope = scope.dataset.scope;
      render();
      return;
    }
    const query = event.target.closest('[data-query]');
    if (query) {
      s.query = query.dataset.query;
      render();
      return;
    }
    const field = event.target.closest('[data-field]');
    if (field) {
      const id = field.dataset.field;
      go('work');
      setTimeout(() => $('#' + id)?.focus(), 60);
      return;
    }
    const remove = event.target.closest('[data-remove-file]');
    if (remove) {
      const file = s.attachments.find((f) => String(f.id) === remove.dataset.removeFile);
      if (file?.url) URL.revokeObjectURL(file.url);
      s.attachments = s.attachments.filter((f) => String(f.id) !== remove.dataset.removeFile);
      render();
      return;
    }
  });
  document.addEventListener('input', (event) => {
    const t = event.target;
    if (t.id === 'search-input') {
      s.query = t.value;
      $('#search-results').innerHTML = K.searchResults();
    }
    if (t.id === 'serial') {
      s.draft.serial = t.value;
      saveDraft();
    }
    if (t.id === 'reading') {
      s.draft.reading = t.value;
      saveDraft();
      const hint = $('.actionbar>small');
      if (hint) hint.textContent = `${K.progress()} из 3 обязательных полей заполнено`;
    }
    if (t.id === 'work-comment') {
      s.draft.comment = t.value;
      saveDraft();
    }
    if (t.id === 'message-text') s.chatText[s.id] = t.value;
    if (t.id === 'delay-comment') {
      s.draft.delayComment = s.delayComment = t.value;
      saveDraft();
    }
    if (t.id === 'inbox-search') {
      s.inboxQuery = t.value;
      $('#inbox-rows').innerHTML = K.inboxRows();
    }
  });
  document.addEventListener('change', (event) => {
    const t = event.target;
    if (K.notifications.change(t)) return;
    if (['reading', 'serial'].includes(t.id) && s.screen === 'work' && t.value.trim()) {
      if (t.id === 'serial' || /^\d+([.,]\d+)?$/.test(t.value.trim())) {
        K.addEntry({
          role: 'event',
          text:
            t.id === 'serial'
              ? 'Номер прибора сохранён · ' + t.value.trim()
              : 'Показания сохранены · ' + t.value.trim() + ' кВт·ч',
        });
      }
    }
    if (t.name === 'filter-status') {
      filterDraft.status = t.value;
      updateFilterCount();
    }
    if (t.id === 'filter-type') {
      filterDraft.type = t.value;
      updateFilterCount();
    }
    if (t.id === 'delay-date') {
      s.draft.delayDate = s.delayDate = t.value;
      saveDraft();
    }
    if (t.id === 'delay-time') {
      s.draft.delayTime = s.delayTime = t.value;
      saveDraft();
    }
  });
  document.addEventListener(
    'toggle',
    (event) => {
      const group = event.target;
      if (group.matches?.('details[data-chat-group]')) K.chatGroups.remember(group);
      if (group.matches?.('details[data-address-group]')) K.requestAddresses.remember(group);
    },
    true,
  );
  $('#file-picker').addEventListener('change', (event) => {
    const target = pickerTarget;
    pickerTarget = null;
    if (
      !target ||
      !$('#sheet').open ||
      !target.panel?.isConnected ||
      s.id !== target.id ||
      s.screen !== target.screen ||
      s.attachmentContext !== target.context
    )
      return;
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const allowed = /\.(pdf|docx?|xlsx?|txt|csv|jpe?g|png|webp|heic|mp4|mov|webm|m4a|mp3|wav|ogg)$/i;
    const photoOnly = ['work', 'delay', 'delay-act'].includes(s.attachmentContext);
    const accepted = files.filter(
      (f) =>
        (!photoOnly || f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(f.name)) &&
        f.size <= 25 * 1024 * 1024 &&
        (allowed.test(f.name) || /^(image|video|audio)\//.test(f.type)),
    );
    if (accepted.length !== files.length) {
      const error = photoOnly
        ? 'Выберите фотографию размером до 25 МБ.'
        : 'Поддерживаются документы и медиа до 25 МБ на файл.';
      if ($('#sheet .source-help')) $('#sheet .source-help').textContent = error;
      toast(error);
    }
    if (!accepted.length) return;
    if (s.attachmentContext === 'chat') {
      const capacity = 5 - s.attachments.length;
      accepted.slice(0, capacity).forEach((f) =>
        s.attachments.push({
          id: K.mediaFiles.uniqueId(),
          name: f.name,
          size:
            f.size < 1024 * 1024
              ? `${Math.max(1, Math.round(f.size / 1024))} КБ`
              : `${(f.size / 1024 / 1024).toFixed(1)} МБ`,
          kind: K.mediaFiles.kind(f.name, f.type),
          blob: f,
          url: URL.createObjectURL(f),
        }),
      );
      if (accepted.length > capacity) toast('В одно сообщение можно добавить до 5 файлов.');
      saveAttachment();
    } else previewFieldFiles(accepted);
  });
  document.addEventListener('submit', (event) => {
    if (event.target.id === 'step-form') {
      event.preventDefault();
      const value = $('#step-value').value.trim();
      if (!value || (readingEditor === 'reading' && !/^\d+([.,]\d+)?$/.test(value))) {
        $('#step-error').textContent =
          readingEditor === 'reading' ? 'Введите число, например 12,5.' : 'Введите заводской номер.';
        $('#step-value').focus();
        return;
      }
      s.draft[readingEditor] = value;
      saveDraft();
      K.addEntry({
        role: 'event',
        text:
          readingEditor === 'reading'
            ? 'Показания сохранены · ' + value + ' кВт·ч'
            : 'Номер прибора сохранён · ' + value,
      });
      closeSheet();
      render();
      $('#messages').scrollTop = $('#messages').scrollHeight;
    }
    if (event.target.id === 'message-form') {
      event.preventDefault();
      sendMessage();
    }
  });
  $('#theme-toggle').addEventListener('click', () => {
    s.theme = s.theme === 'light' ? 'dark' : 'light';
    setTheme();
  });
  $('#sheet').addEventListener('click', (event) => {
    if (event.target === $('#sheet')) {
      const rect = $('#sheet').getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        closeSheet();
    }
  });
  window.addEventListener('hashchange', route);
  Promise.all([
    K.restoreChatMedia().catch(() => {}),
    ...Object.values(drafts)
      .filter((d) => d.fieldMedia)
      .map(K.mediaFiles.restore),
  ]).then(() => {
    if (!s.offline) deliverQueuedMessages();
    placeSheet();
    route();
  });
})();
