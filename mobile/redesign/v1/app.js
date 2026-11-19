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
  const draftKey = 'kontur-mobile-v1-drafts';
  const groupingKey = 'service-track-mobile-v1-address-grouping';
  let drafts = {};
  const attachmentsByRequest = {};
  const scrollPositions = {};
  let renderedKey = '';
  try {
    drafts = JSON.parse(localStorage.getItem(draftKey) || '{}');
    s.theme = localStorage.getItem('kontur-mobile-v1-theme') || 'light';
  } catch {
    localSaveAvailable = false;
  }
  s.draft = {...K.initialDraft(), ...drafts[s.id]};
  try {
    if (localStorage.getItem(groupingKey) === 'street') s.addressGrouping = 'street';
  } catch {}
  if (['street', 'street-house'].includes(params.get('grouping'))) s.addressGrouping = params.get('grouping');
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
      attachmentsByRequest[s.id] = s.attachments;
      s.id = id;
      s.attachments = attachmentsByRequest[id] || [];
      s.draft = {...K.initialDraft(), ...drafts[id]};
      s.reviewError = false;
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
      s.screen = screen;
      render();
    } else location.hash = K.href(screen, id);
  }
  function setTheme() {
    document.documentElement.dataset.theme = s.theme;
    $('#theme-toggle').textContent = s.theme === 'light' ? 'Тёмная тема' : 'Светлая тема';
    try {
      localStorage.setItem('kontur-mobile-v1-theme', s.theme);
    } catch {}
  }
  function catalog() {
    let group = '';
    $('#catalog-nav').innerHTML = K.screenInfo
      .map((info, index) => {
        const heading = info[1] !== group ? `<h2>${info[1]}</h2>` : '';
        group = info[1];
        return `${heading}<a href="#${info[0]}" class="${s.screen === info[0] ? 'active' : ''}" ${s.screen === info[0] ? 'aria-current="page"' : ''}><em>${String(index + 1).padStart(2, '0')}</em>${info[2]}</a>`;
      })
      .join('');
    $('#screen-picker').innerHTML = K.screenInfo
      .map((info) => `<option value="${info[0]}" ${s.screen === info[0] ? 'selected' : ''}>${info[2]}</option>`)
      .join('');
    const index = K.screenInfo.findIndex((info) => info[0] === s.screen),
      info = K.screenInfo[index];
    $('#screen-number').textContent =
      `${String(index + 1).padStart(2, '0')} / ${String(K.screenInfo.length).padStart(2, '0')} · ${info[2]}`;
    $('#design-notes').innerHTML =
      `<p class="eyebrow">СЕРВИС ТРЕК / ${info[4].toLocaleUpperCase('ru')}</p><h1>${info[3]}</h1><p>${info[5]}</p><div class="note-rule"></div><h2>Попробуйте сценарий</h2><div class="scenario">${info[6]}</div><div class="note-controls"><button data-action="toggle-offline" class="${s.offline ? 'toggle-on' : ''}">${s.offline ? '● Без сети' : '○ Соединение есть'} · переключить</button>${['chat', 'chats', 'attachments'].includes(s.screen) ? `<button data-action="toggle-role">Роль: ${s.role === 'worker' ? 'исполнитель' : 'менеджер'} · переключить</button><button data-action="simulate-failure">Показать ошибку отправки</button>` : ''}<a href="index.html?embed=1#${s.screen}/${s.id}" target="_blank">Открыть только экран ↗</a><button data-action="reset-demo">Сбросить демонстрацию</button></div>${K.notifications.notes()}<p class="footnote">Интерактивный макет. Данные вымышлены. Смена статусов и доставка сообщений имитируются локально; файлы не отправляются в сеть.</p><div class="swatches" aria-label="Палитра Контур"><i style="background:#2858d6"></i><i style="background:#1c2b43"></i><i style="background:#596980"></i><i style="background:#ebf1ff"></i><i style="background:#fff"></i></div>`;
  }
  function render() {
    const oldScroll = $('#app .scroll-content');
    if (renderedKey && oldScroll) scrollPositions[renderedKey] = oldScroll.scrollTop;
    if (!K.screens[s.screen]) s.screen = 'queue';
    if (['work', 'notification-in-work', 'stages', 'review'].includes(s.screen)) {
      if (s.pendingIds?.includes(s.id)) s.screen = 'complete';
      else if (K.request().status === 'EXECUTED' || !K.request().mine) s.screen = 'detail';
    }
    $('#app').innerHTML = K.screens[s.screen]();
    catalog();
    setTheme();
    renderedKey = s.screen === 'locations' ? 'locations/' + s.addressGrouping : s.screen + '/' + s.id;
    const newScroll = $('#app .scroll-content');
    if (newScroll) newScroll.scrollTop = scrollPositions[renderedKey] || 0;
    K.notifications.afterRender();
    document.title = `${K.screenInfo.find((i) => i[0] === s.screen)[2]} · Сервис Трек`;
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
  function route() {
    const [screen, id] = (location.hash.slice(1) || params.get('screen') || 'queue').split('/');
    if (K.requests.some((r) => r.id === Number(id))) selectRequest(Number(id));
    else if (!id) selectRequest(10428);
    s.screen = K.screens[screen] ? screen : 'queue';
    if (['queue', 'locations', 'statuses'].includes(s.screen)) s.listView = s.screen;
    if (s.screen === 'all') s.scope = 'all';
    if (s.screen === 'chat') K.request().unread = 0;
    if (['queue', 'locations', 'statuses'].includes(s.screen)) s.scope = 'mine';
    K.notifications.onRoute(s.screen, id);
    if ($('#sheet').open) $('#sheet').close();
    render();
  }
  function sheet(title, content) {
    returnFocus = document.activeElement;
    $('#sheet').innerHTML =
      `<div class="row"><h2 id="sheet-title">${title}</h2>${K.iconButton('close', 'Закрыть', 'close-sheet')}</div>${content}`;
    if (!$('#sheet').open) $('#sheet').showModal();
  }
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
    return s.draft.serial.trim() && /^\d+([.,]\d+)?$/.test(s.draft.reading.trim()) && s.draft.photo;
  }
  function chooseFile(kind, context = 'chat') {
    const picker = $('#file-picker');
    s.attachmentContext = context;
    picker.accept =
      kind === 'photo' || kind === 'camera'
        ? 'image/*'
        : kind === 'video'
          ? 'video/*'
          : kind === 'audio'
            ? 'audio/*'
            : '.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,image/*,video/*,audio/*';
    picker.multiple = context === 'chat';
    if (kind === 'camera') picker.setAttribute('capture', 'environment');
    else picker.removeAttribute('capture');
    picker.value = '';
    picker.click();
  }
  function photoSheet(context) {
    s.attachmentContext = context;
    sheet(
      context === 'delay' ? 'Фото уведомления' : 'Фото установленного прибора',
      `<p>Проверьте, что текст и номера читаются, а объект полностью в кадре.</p>${K.button('Открыть камеру или галерею', 'pick-context-photo', 'primary', 'camera')}${K.button('Добавить пример фото', 'demo-photo', 'secondary', 'photo')}`,
    );
  }
  function sendMessage() {
    const text = (s.chatText[s.id] || '').trim();
    if (!text && !s.attachments.length) {
      toast('Напишите сообщение или добавьте файл.');
      return;
    }
    const message = {
      id: Date.now(),
      text,
      files: s.attachments.map((f) => ({...f})),
      status: s.offline ? 'queued' : 'delivered',
      role: s.role,
    };
    (s.messages[s.id] ||= []).push(message);
    s.attachments = [];
    s.chatText[s.id] = '';
    render();
    $('#messages').scrollTop = $('#messages').scrollHeight;
  }
  const actions = {
    'set-address-grouping': (button) => {
      const grouping = button.dataset.grouping;
      if (!['street', 'street-house'].includes(grouping) || grouping === s.addressGrouping) return;
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
      K.notifications.sync();
      render();
    },
    'toggle-role': () => {
      s.role = s.role === 'worker' ? 'manager' : 'worker';
      render();
    },
    'reset-demo': () => {
      sheet(
        'Сбросить демонстрацию?',
        `<p>Будут удалены только черновики и сообщения этого локального макета.</p>${K.button('Сбросить макет', 'confirm-reset', 'primary')}`,
      );
    },
    'confirm-reset': () => {
      try {
        localStorage.removeItem(draftKey);
        localStorage.removeItem(groupingKey);
      } catch {}
      location.href = location.pathname + location.search + '#queue';
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
      if (r.id !== 10428 && K.requests[0].status === 'IN_PROGRESS') {
        sheet(
          'Уже есть заявка в работе',
          `<p>Сейчас выполняется № 10428, Лермонтова, 18 · кв. 42. Сначала завершите текущую работу.</p><a class="btn primary full" href="#work/10428">Продолжить текущую заявку</a>`,
        );
        return;
      }
      r.status = 'IN_PROGRESS';
      go('work');
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
      s.complete = true;
      s.draft.finished = true;
      saveDraft();
      if (s.offline) (s.pendingIds ||= []).push(s.id);
      else K.request().status = 'EXECUTED';
      go('complete');
    },
    'work-photo': () => photoSheet('work'),
    'delay-photo': () => photoSheet('delay'),
    'remove-photo': () => {
      s.draft.photo = false;
      saveDraft();
      render();
    },
    'pick-context-photo': () => chooseFile('photo', s.attachmentContext),
    'demo-photo': () => {
      if (s.attachmentContext === 'delay') s.delayPhoto = true;
      else if (s.attachmentContext === 'delay-act') s.delayAct = true;
      else s.draft.photo = true;
      saveDraft();
      closeSheet();
      render();
      toast('Пример фото добавлен.');
    },
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
    'work-audio': () =>
      sheet(
        'Аудиокомментарий',
        `<div class="sheet-file">${K.icon('mic')}<p>00:18 · Аудиозаметка к установке</p></div><p>Пример записи. Во время реальной записи переходы между этапами блокируются до её завершения.</p>${K.button('Добавить пример аудио', 'add-work-audio', 'primary')}`,
      ),
    'add-work-audio': () => {
      s.draft.audio = true;
      saveDraft();
      closeSheet();
      render();
      toast('Аудиозаметка добавлена к черновику.');
    },
    'work-video': () => chooseFile('video', 'work-extra'),
    'work-document': () => chooseFile('file', 'work-extra'),
    delay: () => go('delay'),
    'delay-act': () => {
      s.attachmentContext = 'delay-act';
      sheet(
        'Фото акта недопуска',
        `<p>Необязательный документ. Добавьте, если составили акт на месте.</p>${K.button('Выбрать фото', 'pick-context-photo', 'primary')}${K.button('Добавить пример фото', 'demo-photo', 'secondary')}`,
      );
    },
    'save-delay': () => {
      if (!s.delayPhoto) {
        toast('Добавьте обязательное фото уведомления.');
        return;
      }
      if (!s.delayDate || !s.delayTime) {
        toast('Укажите дату и время недопуска.');
        return;
      }
      K.request().status = 'DELAYED';
      s.draft.delayed = true;
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
        `<a class="btn secondary full" href="#stages/${s.id}">Этапы работы</a><a class="btn secondary full" href="#chat/${s.id}">Чат с менеджером</a>${K.request().mine && K.request().status !== 'EXECUTED' ? `<a class="btn warning full" href="#delay/${s.id}">Сообщить о недопуске</a>` : ''}`,
      ),
    'stage-source': () =>
      sheet(
        'Осмотр и демонтаж',
        `<p>Этап сохранён. Исходные данные доступны для просмотра.</p><div class="info-line"><span>Старый прибор</span><strong>Меркурий 201</strong></div><div class="info-line"><span>Номер</span><strong>59120318</strong></div><div class="info-line"><span>Фото до работ</span><strong>1 фото</strong></div>${K.button('Продолжить установку', 'continue-work', 'primary')}`,
      ),
    'continue-work': () => {
      closeSheet();
      go('work');
    },
    'view-result': () =>
      sheet(
        'Результат работы',
        `<p>Заявка № ${s.id} · выполнена 18 ноября.</p><div class="info-line"><span>Установленный прибор</span><strong>Меркурий 201.7</strong></div><div class="info-line"><span>Показания</span><strong>12,5 кВт·ч</strong></div><div class="info-line"><span>Материалы</span><strong>2 фото · 1 акт</strong></div>${K.button('Закрыть', 'close-sheet', 'secondary')}`,
      ),
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
    'chat-search': () =>
      sheet(
        'Найти диалог',
        `<label class="field"><span>Номер или адрес заявки</span><input id="chat-search" placeholder="Например, 10428" autocomplete="off"></label><div id="chat-search-results" class="mt16"><a class="menu-row" href="#chat/10428">№ 10428 · Лермонтова, 18</a></div>`,
      ),
    'chat-menu': () =>
      sheet(
        'Диалог заявки № ' + s.id,
        `<a class="btn secondary full" href="#detail/${s.id}">Открыть заявку</a>${K.button('Файлы диалога', 'chat-files', 'secondary', 'clip')}${K.button('Показать роль менеджера', 'role-sheet', 'secondary', 'user')}`,
      ),
    'role-sheet': () => {
      s.role = s.role === 'worker' ? 'manager' : 'worker';
      closeSheet();
      render();
    },
    'chat-files': () =>
      sheet(
        'Файлы диалога',
        `${K.fileCard({name: 'Схема подключения.pdf', size: '248 КБ', demo: true})}<p>Только файлы текущей заявки. Вложения формы доступны отдельно в её этапах.</p>`,
      ),
    'pick-camera': () => chooseFile('camera'),
    'pick-photo': () => chooseFile('photo'),
    'pick-file': () => chooseFile('file'),
    'pick-video': () => chooseFile('video'),
    'pick-audio': () => chooseFile('audio'),
    'demo-file': () => {
      if (s.attachments.length >= 5) {
        toast('Можно добавить до 5 файлов в одно сообщение.');
        return;
      }
      s.attachments.push({id: Date.now(), name: 'Акт замены.pdf', size: '248 КБ', kind: 'file', demo: true});
      render();
    },
    'preview-file': (button) => {
      const id = button?.dataset.fileId;
      const file = [...s.attachments, ...(s.messages[s.id] || []).flatMap((m) => m.files || [])].find(
        (f) => String(f.id) === id,
      ) || {name: 'Схема подключения.pdf', size: '248 КБ', demo: true};
      sheet(
        'Предпросмотр файла',
        `<div class="sheet-file">${K.icon(file.kind || 'file')}<h3 class="mt16">${K.escape(file.name)}</h3><p>${K.escape(file.size)} · ${file.demo ? 'пример вложения' : 'локальный файл'}</p></div>${file.url ? `<a class="btn primary full" href="${file.url}" download="${K.escape(file.name)}">Сохранить выбранный файл</a>` : '<p>Демонстрационное вложение показывает вид документа в переписке. Рабочей электросхемы в макете нет.</p>'}${K.button('Закрыть просмотр', 'close-sheet', 'secondary')}`,
      );
    },
    'simulate-failure': () => {
      (s.messages[s.id] ||= []).push({
        id: Date.now(),
        text: 'Фото пломбы после установки.',
        files: [{id: Date.now(), name: 'Пломба.jpg', size: '1,2 МБ', kind: 'photo', demo: true}],
        status: 'failed',
      });
      go('chat');
    },
    'app-settings': () =>
      sheet(
        'Настройки',
        `${K.button('Переключить светлую / тёмную тему', 'theme-sheet', 'secondary')}${K.button(s.offline ? 'Включить сеть в макете' : 'Показать работу без сети', 'network-sheet', 'secondary')}`,
      ),
    'theme-sheet': () => {
      s.theme = s.theme === 'light' ? 'dark' : 'light';
      setTheme();
    },
    'network-sheet': () => {
      s.offline = !s.offline;
      K.notifications.sync();
      closeSheet();
      render();
    },
  };
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
      s.status = status.dataset.status;
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
      if (id === 'photo' && s.draft.photo) {
        sheet(
          'Фото установленного прибора',
          `<div class="sheet-file">${K.icon('photo')}<p>Счётчик после установки · пример фото</p></div>${K.button('Заменить фото', 'work-photo', 'secondary')}`,
        );
        return;
      }
      go('work');
      setTimeout(() => {
        if (id === 'photo') photoSheet('work');
        else $('#' + id)?.focus();
      }, 60);
      return;
    }
    const remove = event.target.closest('[data-remove-file]');
    if (remove) {
      s.attachments = s.attachments.filter((f) => String(f.id) !== remove.dataset.removeFile);
      render();
      return;
    }
    const retry = event.target.closest('[data-retry-message]');
    if (retry) {
      const message = s.messages[s.id].find((m) => String(m.id) === retry.dataset.retryMessage);
      message.status = s.offline ? 'queued' : 'delivered';
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
    if (t.id === 'delay-comment') s.delayComment = t.value;
    if (t.id === 'chat-search') {
      const q = t.value.toLowerCase().trim();
      const rows = K.requests.filter(
        (r) => [10428, 10430, 10432].includes(r.id) && `${r.id} ${K.address(r)}`.toLowerCase().includes(q),
      );
      $('#chat-search-results').innerHTML = rows.length
        ? rows.map((r) => `<a class="menu-row" href="#chat/${r.id}">№ ${r.id} · ${r.street}, ${r.house}</a>`).join('')
        : '<p>Диалог не найден. Попробуйте номер заявки.</p>';
    }
  });
  document.addEventListener('change', (event) => {
    const t = event.target;
    if (K.notifications.change(t)) return;
    if (t.name === 'filter-status') {
      filterDraft.status = t.value;
      updateFilterCount();
    }
    if (t.id === 'filter-type') {
      filterDraft.type = t.value;
      updateFilterCount();
    }
    if (t.id === 'delay-date') s.delayDate = t.value;
    if (t.id === 'delay-time') s.delayTime = t.value;
    if (t.id === 'screen-picker') go(t.value);
  });
  document.addEventListener(
    'toggle',
    (event) => {
      const group = event.target;
      if (group.matches?.('details[data-address-group]')) {
        s.addressExpanded[group.dataset.groupingMode][group.dataset.addressGroup] = group.open;
      }
    },
    true,
  );
  $('#file-picker').addEventListener('change', (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const allowed = /\.(pdf|docx?|xlsx?|txt|csv|jpe?g|png|webp|heic|mp4|mov|webm|m4a|mp3|wav|ogg)$/i;
    const accepted = files.filter(
      (f) => f.size <= 25 * 1024 * 1024 && (allowed.test(f.name) || /^(image|video|audio)\//.test(f.type)),
    );
    if (accepted.length !== files.length) toast('Часть файлов не добавлена: допустимы документы и медиа до 25 МБ.');
    if (!accepted.length) return;
    if (s.attachmentContext === 'chat') {
      const capacity = 5 - s.attachments.length;
      accepted.slice(0, capacity).forEach((f, i) =>
        s.attachments.push({
          id: Date.now() + i,
          name: f.name,
          size:
            f.size < 1024 * 1024
              ? `${Math.max(1, Math.round(f.size / 1024))} КБ`
              : `${(f.size / 1024 / 1024).toFixed(1)} МБ`,
          kind: f.type.startsWith('image')
            ? 'photo'
            : f.type.startsWith('video')
              ? 'video'
              : f.type.startsWith('audio')
                ? 'audio'
                : 'file',
          url: URL.createObjectURL(f),
        }),
      );
      if (accepted.length > capacity) toast('В одно сообщение можно добавить до 5 файлов.');
    } else if (s.attachmentContext === 'delay') s.delayPhoto = true;
    else if (s.attachmentContext === 'delay-act') s.delayAct = true;
    else if (s.attachmentContext === 'work-extra') {
      s.draft.extraFiles = accepted.map((f) => f.name);
      saveDraft();
    } else {
      s.draft.photo = true;
      saveDraft();
    }
    closeSheet();
    render();
  });
  document.addEventListener('submit', (event) => {
    if (event.target.id === 'message-form') {
      event.preventDefault();
      sendMessage();
    }
  });
  $('#theme-toggle').addEventListener('click', () => {
    s.theme = s.theme === 'light' ? 'dark' : 'light';
    setTheme();
  });
  $('#mobile-theme').addEventListener('click', () => {
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
  route();
})();
