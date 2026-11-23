'use strict';
Kontur.screens = {
  queue() {
    const K = Kontur,
      active = K.activeRequests(),
      inProgress = active.filter((r) => r.status === 'IN_PROGRESS'),
      attention = active.filter((r) => r.revision || r.status === 'DELAYED'),
      ready = active.filter((r) => r.status === 'READY_TO_PROCESS' && !r.revision);
    const focus = inProgress.length
      ? inProgress.map((r) => K.inProgressCard(r)).join('')
      : K.notice('Можно начать следующую работу', 'Выберите заявку в списке ниже.', 'success', 'check');
    return (
      K.header('Мои заявки', K.listSummary(), K.notifications.bell()) +
      K.listTools() +
      K.views() +
      K.network() +
      `<div class="scroll-content no-top">${focus}<div class="section-label"><span>Требуют внимания</span><small>Заявок: ${attention.length}</small></div>${attention
        .sort((a, b) => Number(Boolean(b.revision)) - Number(Boolean(a.revision)))
        .map((r) => K.requestCard(r, true))
        .join(
          '',
        )}<div class="section-label"><span>Готовы к исполнению</span><small>Заявок: ${ready.length}</small></div>${ready.map((r) => K.requestCard(r, true)).join('')}<p class="search-hint">Данные обновлены в 09:38</p></div>` +
      K.bottom()
    );
  },
  locations(all = false) {
    const K = Kontur;
    return (
      K.header(all ? 'Все заявки' : 'Мои заявки', all ? 'Заявок в реестре: ' + K.requests.length : K.listSummary()) +
      K.listTools() +
      K.views(all) +
      K.network() +
      `<div class="scroll-content no-top">${K.requestAddresses.render(all ? K.requests : K.activeRequests(), all)}</div>` +
      K.bottom(all ? 'all' : 'mine')
    );
  },
  'all-locations'() {
    return this.locations(true);
  },
  'all-statuses'() {
    return this.statuses(true);
  },
  statuses(all = false) {
    const K = Kontur,
      s = K.state,
      requests = all ? K.requests : K.activeRequests(),
      status = all ? s.allStatus : s.status;
    const groups = [
      ['IN_PROGRESS', 'В работе'],
      ['READY_TO_PROCESS', 'Готовы'],
      ['DELAYED', 'Недопуск'],
      ['revision', 'Доработка'],
      ...(all ? [['EXECUTED', 'Выполнены']] : []),
    ].map(([id, label]) => [
      id,
      label,
      requests.filter((r) => (id === 'revision' ? r.revision : r.status === id && !r.revision)).length,
    ]);
    const rows = requests.filter((r) => (status === 'revision' ? r.revision : r.status === status && !r.revision));
    const onlyWork = status === 'IN_PROGRESS' && rows.length === 1 ? rows[0] : null;
    return (
      K.header(all ? 'Все заявки' : 'Мои заявки', all ? 'Заявок в реестре: ' + requests.length : K.listSummary()) +
      K.listTools() +
      K.views(all) +
      K.network() +
      `<div class="scroll-content no-top"><div class="status-grid">${groups.map(([id, label, count]) => `<button class="status-tile ${status === id ? 'active' : ''}" data-status="${id}" aria-pressed="${status === id}"><span class="chip request-status ${K.statuses[id][1]}">${label}</span><b>${count}</b></button>`).join('')}</div><div class="section-label"><span>${groups.find((g) => g[0] === status)[1]}</span><small>Заявок: ${rows.length}</small></div>${rows.map((r) => K.requestCard(r)).join('')}` +
      (onlyWork?.mine && !s.pendingIds?.includes(onlyWork.id)
        ? `<div class="mt16"><a class="btn primary full" href="#work/${onlyWork.id}">Продолжить работу${K.icon('arrow')}</a></div>`
        : '') +
      (status === 'IN_PROGRESS' && rows.length
        ? '<p class="search-hint">Заявки переходят между группами после смены статуса. Доработки выделены отдельно.</p>'
        : '') +
      '</div>' +
      K.bottom(all ? 'all' : 'mine')
    );
  },
  search() {
    const K = Kontur,
      s = K.state;
    return (
      K.backHeader('Поиск заявок', '', s.listOrigin) +
      `<div class="search-tools"><label class="search-field">${K.icon('search')}<span class="sr-only">Номер, адрес или абонент</span><input id="search-input" type="search" autocomplete="off" placeholder="Номер, адрес или абонент" value="${K.escape(s.query)}">${K.iconButton('close', 'Очистить запрос', 'clear-search')}</label><a class="icon-button bordered" href="#filters" aria-label="Фильтры">${K.icon('filter')}</a></div><div class="scope-tabs" role="group" aria-label="Область поиска">${[
        ['mine', 'Мои'],
        ['all', 'Все заявки'],
        ['history', 'История'],
      ]
        .map(
          ([id, label]) =>
            `<button data-scope="${id}" class="${s.scope === id ? 'active' : ''}" aria-pressed="${s.scope === id}">${label}</button>`,
        )
        .join('')}</div>` +
      K.network() +
      `<div class="scroll-content white" id="search-results">${K.searchResults()}</div>` +
      K.bottom()
    );
  },
  filters() {
    const K = Kontur,
      s = K.state;
    return (
      K.backHeader(
        'Фильтры',
        'Применятся к текущему поиску',
        'search',
        `<button class="text-link" data-action="reset-filters">Сбросить</button>`,
      ) +
      `<div class="scroll-content"><h2 class="mb16">Статус заявки</h2><div class="radio-list">${[
        ['all', 'Все статусы'],
        ['READY_TO_PROCESS', K.statuses.READY_TO_PROCESS[0]],
        ['IN_PROGRESS', 'В работе'],
        ['DELAYED', 'Недопуск'],
        ['EXECUTED', 'Выполнена'],
      ]
        .map(
          ([value, label]) =>
            `<label class="radio-option"><input type="radio" name="filter-status" value="${value}" ${s.filters.status === value ? 'checked' : ''}>${label}</label>`,
        )
        .join(
          '',
        )}</div><label class="field mt24"><span>Вид работ</span><select id="filter-type">${['all', 'Замена электросчётчика', 'Проверка подключения'].map((v) => `<option value="${v}" ${s.filters.type === v ? 'selected' : ''}>${v === 'all' ? 'Все виды работ' : v}</option>`).join('')}</select></label><div class="mt24">${K.notice('Текущая область: ' + {mine: 'мои заявки', all: 'все заявки', history: 'история'}[s.scope], 'Запрос сохранится после применения фильтров.', 'info', 'filter')}</div></div>` +
      K.actionbar(K.button('Показать заявки', 'apply-filters', 'primary', 'arrow'))
    );
  },
  all() {
    const K = Kontur;
    return (
      K.header('Все заявки', 'Заявок в реестре: ' + K.requests.length) +
      K.listTools() +
      K.views(true) +
      K.network() +
      `<div class="scroll-content"><div class="section-label"><span>Ожидают исполнителя</span><small>Заявок: ${K.requests.filter((r) => !r.mine && r.status !== 'EXECUTED').length}</small></div>${K.requests
        .filter((r) => !r.mine && r.status !== 'EXECUTED')
        .map((r) => K.requestCard(r, true))
        .join(
          '',
        )}<div class="section-label"><span>Назначены мне</span><small>Активных: ${K.activeRequests().length}</small></div>${K.activeRequests()
        .map((r) => K.requestCard(r, true))
        .join('')}<div class="section-label">Завершённые</div>${K.requests
        .filter((r) => r.status === 'EXECUTED')
        .map((r) => K.requestCard(r, true))
        .join('')}</div>` +
      K.bottom('all')
    );
  },
  detail() {
    const K = Kontur,
      r = K.request();
    const pending = K.state.pendingIds?.includes(r.id);
    const editable = r.mine && r.status !== 'EXECUTED' && !pending;
    return (
      K.backHeader(
        'Заявка № ' + r.id,
        r.external,
        K.state.listOrigin,
        K.iconButton('more', 'Действия заявки', 'request-menu'),
      ) +
      K.network() +
      `<div class="scroll-content"><section class="request-hero">${K.badge(r)}<h1>ул. ${r.street}, ${r.house}<br>квартира ${r.apartment}</h1><p>${K.escape(r.city)} · ${r.type}</p></section><div class="quick-actions"><button data-action="route">${K.actionIcon('pin')}Маршрут</button><button data-action="call-customer">${K.actionIcon('phone')}Абонент</button><a href="${K.href('chat', r.id)}">${K.actionIcon('chat', r.unread)}Чат</a></div>${r.id === 10428 ? K.notice('Перед началом', 'Счётчик в квартире. Абонент просит позвонить перед визитом.', 'info', 'file') : r.revision ? K.notice('Вернули на доработку', 'На фото не читается номер пломбы. Сделайте новый снимок.', 'warning', 'camera') : ''}<div class="panel mt16"><div class="info-line"><span>Абонент</span><strong>${r.customer}</strong></div><div class="info-line"><span>Место установки</span><strong>В квартире</strong></div><div class="info-line"><span>Лицевой счёт</span><strong class="mono">008241093</strong></div></div><div class="section-label">Ответственный менеджер</div><div class="panel person-row"><span class="avatar sage">ЕС</span><span class="grow"><strong>Елена Соколова</strong><small>Менеджер заявки</small></span><a class="icon-button" href="${K.href('chat', r.id)}" aria-label="Написать менеджеру">${K.icon('chat')}</a></div><details class="disclosure mt16"><summary>Объект и исходные данные${K.icon('down')}</summary><div class="info-line"><span>Старый прибор</span><strong>${K.escape(K.state.draft.oldModel)}</strong></div><div class="info-line"><span>Заводской номер</span><strong class="mono">${K.escape(K.state.draft.oldSerial)}</strong></div><div class="info-line"><span>Контракт</span><strong>Иркутск · 2026</strong></div></details>${editable ? `<button class="text-link" data-action="delay">${K.icon('alert')}Сообщить о недопуске</button>` : ''}</div>` +
      K.actionbar(
        pending
          ? K.linkButton('Проверить отправку', 'complete', 'secondary', 'cloud')
          : editable
            ? K.button(
                r.status === 'IN_PROGRESS' ? 'Продолжить работу' : 'Начать работу',
                'start-work',
                'primary',
                'arrow',
              )
            : r.status === 'EXECUTED'
              ? K.button('Посмотреть результат', 'view-result', 'secondary', 'file')
              : K.button('Обсудить с менеджером', 'open-chat', 'primary', 'chat'),
      )
    );
  },
  stages() {
    const K = Kontur,
      r = K.request();
    return (
      K.backHeader(
        'Этапы работы',
        '№ ' + r.id,
        'detail',
        `<a class="icon-button" href="${K.href('chat', r.id)}" aria-label="Чат заявки">${K.icon('chat')}</a>`,
      ) +
      `<div class="context-line">${K.address(r)}</div><div class="scroll-content"><div class="form-intro"><h2>Замена счётчика</h2><p>Один этап готов · продолжите установку</p></div><div class="panel"><button class="stage-row done" data-action="stage-source"><span class="stage-number">${K.icon('check')}</span><span class="grow"><h3>Осмотр и демонтаж</h3><p>Исходные данные проверены.<br>Фото старого прибора сохранено.</p></span>${K.icon('chevron')}</button><a class="stage-row active" href="${K.href('work', r.id)}"><span class="stage-number">2</span><span class="grow"><h3>Установка прибора</h3><p>Номер, показания и фото.<br>${K.progress()} из 3 обязательных полей.</p></span>${K.icon('chevron')}</a><a class="stage-row" href="${K.href('review', r.id)}"><span class="stage-number">3</span><span class="grow"><h3>Проверка результата</h3><p>Проверьте данные перед отправкой.</p></span>${K.icon('chevron')}</a></div><div class="mt24">${K.notice('Можно вернуться позже', 'Черновик сохраняется на устройстве. Продолжите с этого же этапа.', 'info', 'history')}</div></div>` +
      K.actionbar(K.linkButton('Продолжить установку', 'work', 'primary', 'arrow'))
    );
  },
  work() {
    const K = Kontur,
      r = K.request();
    return (
      K.backHeader(
        'Установка прибора',
        '№ ' + r.id,
        'stages',
        `<a class="icon-button" href="${K.href('chat', r.id)}" aria-label="Чат заявки">${K.icon('chat')}${r.unread ? `<span class="badge-count">${r.unread}</span>` : ''}</a>`,
      ) +
      `<div class="context-line"><span>${K.address(r)}</span>${K.modeButton()}<button data-action="stages">Этапы</button></div><div class="save-state" id="save-state">${K.icon('check')}Черновик сохранён на устройстве</div>` +
      K.network() +
      `<div class="scroll-content"><div class="stepper"><b class="done">✓</b><i></i><b class="active">2</b><i></i><b>3</b><span>Этап 2 из 3</span></div><div class="form-intro"><h2>Новый счётчик</h2><p>Обязательные поля отмечены *</p></div>${K.workForm.inputs()}</div>` +
      K.actionbar(
        K.button('Проверить результат', 'review', 'primary', 'arrow'),
        `${K.progress()} из 3 обязательных полей заполнено`,
      )
    );
  },
  review() {
    const K = Kontur,
      s = K.state,
      r = K.request();
    const missing = K.progress() < 3;
    return (
      K.backHeader('Проверка результата', '№ ' + r.id, 'work') +
      K.network() +
      `<div class="scroll-content"><div class="form-intro"><h2>Всё готово к отправке?</h2><p>${K.address(r)}</p></div>${missing ? K.notice('Есть незаполненные поля', 'Заполните обязательные поля установки. Ссылки ниже вернут к нужному месту.', 'warning', 'alert') : K.notice('Обязательные поля заполнены', 'Проверьте данные обоих шагов перед завершением.', 'success', 'check')}${K.workForm.review()}<div class="mt24">${K.notice('После отправки', 'Редактирование приостановится на время передачи. Статус «Выполнена» появится после подтверждения.', 'info', 'cloud')}</div><a class="text-link" href="${K.href('chat', r.id)}">${K.icon('chat')}Обсудить с менеджером</a></div>` +
      K.actionbar(
        missing
          ? K.linkButton('Заполнить обязательные поля', 'work', 'primary', 'arrow')
          : K.button(s.offline ? 'Завершить и отправить позже' : 'Завершить заявку', 'complete', 'primary', 'check'),
        s.offline ? 'Данные останутся на устройстве до появления сети' : 'Результат будет передан менеджеру',
      )
    );
  },
  complete() {
    const K = Kontur,
      pending = K.state.pendingIds?.includes(K.state.id);
    return (
      K.backHeader(pending ? 'Ожидает отправки' : 'Работа завершена', '№ ' + K.state.id, 'queue') +
      `<div class="scroll-content"><div class="result-emblem ${pending ? 'pending' : ''}">${K.icon(pending ? 'cloud' : 'check')}</div><div class="result-copy"><h1>${pending ? 'Результат сохранён' : 'Заявка выполнена'}</h1><p>${pending ? 'Отправим, когда появится сеть.<br>Пока заявка остаётся в работе.' : 'Менеджер получил результат.<br>Заявка перенесена в историю.'}</p></div><div class="panel"><div class="row between"><span class="mono tiny muted">№ ${K.state.id}</span>${pending ? '<span class="chip warning">Ожидает отправки</span>' : K.badge(K.request())}</div><h3 class="mt16">${K.address(K.request())}</h3><p class="muted tiny mt16">${pending ? 'Изменения сохранены на этом устройстве.' : 'Подтверждение получено · 09:41'}</p></div><div class="mt24">${K.notice(pending ? 'Можно продолжать работу' : 'Переписка по заявке', pending ? 'Форма временно закрыта для изменений. Проверить отправку можно из профиля.' : 'Отчёт и сообщения доступны в истории работ.', pending ? 'warning' : 'info', pending ? 'lock' : 'building')}</div></div>` +
      K.actionbar(
        pending
          ? K.linkButton('Посмотреть отправку', 'sync', 'primary', 'cloud')
          : `<a class="btn primary full" href="#${K.state.listView}">К моим заявкам${K.icon('arrow')}</a>`,
      ) +
      K.bottom()
    );
  },
  delay() {
    const K = Kontur,
      s = K.state;
    return (
      K.backHeader('Сообщить о недопуске', '№ ' + s.id, 'detail') +
      `<div class="scroll-content"><div class="form-intro"><h2>Не удалось попасть внутрь</h2><p>${K.address(K.request())}</p></div><div class="row"><label class="field grow"><span>Дата *</span><input id="delay-date" type="date" value="${s.delayDate}"></label><label class="field grow" style="margin-top:0"><span>Время *</span><input id="delay-time" type="time" value="${s.delayTime}"></label></div>${K.mediaUI.panel('delay')}${K.mediaUI.panel('delay-act')}<label class="field mt16"><span>Комментарий</span><textarea id="delay-comment" maxlength="400" placeholder="Например: звонил в домофон и по телефону, ответа нет">${K.escape(s.delayComment)}</textarea><small>До 400 символов</small></label><div class="mt24">${K.notice('Менеджер увидит причину', 'Данные недопуска сохранятся в заявке. Можно дополнительно написать в чат.', 'info', 'chat')}</div></div>` +
      K.actionbar(
        K.button('Сохранить недопуск', 'save-delay', 'primary', 'check'),
        s.draft.fieldMedia.delay.length ? 'Фото уведомления добавлено' : 'Для сохранения нужно фото уведомления',
      )
    );
  },
  sync() {
    const K = Kontur,
      s = K.state;
    return (
      K.backHeader('Отправка данных', 'Всё сохранено на устройстве', 'profile') +
      `<div class="scroll-content">${K.notice(s.offline ? 'Сейчас нет сети' : 'Соединение восстановлено', s.offline ? 'Сохранённые заявки доступны. Новые изменения отправятся после подключения.' : 'Отправка продолжается. Ошибки можно повторить отдельно.', s.offline ? 'warning' : 'success', s.offline ? 'offline' : 'check')}${(s.pendingIds || []).map((id) => `<section class="sync-item"><h3>№ ${id} · Результат работы</h3><p>Отчёт и фото ожидают подключения.</p><span class="chip warning">В очереди</span></section>`).join('')}<section class="sync-item"><div class="row between"><h3>№ 10430 · Фото уведомления</h3><span class="chip ${s.syncRetried ? 'success' : 'danger'}">${s.syncRetried ? 'Отправлено' : 'Ошибка'}</span></div><p>${s.syncRetried ? 'Файл получен. Повторная отправка остальных данных не понадобилась.' : 'Не удалось загрузить файл. Фото сохранено, можно повторить отправку.'}</p>${!s.syncRetried ? K.button('Повторить отправку', 'retry-sync', 'secondary', 'cloud') : ''}</section><section class="sync-item"><div class="row between"><h3>№ 10432 · Данные изменились</h3></div><p>Менеджер обновил форму. Проверьте различия; ваши файлы сохранены.</p>${K.button('Проверить изменения', 'conflict', 'soft', 'arrow')}</section><p class="search-hint">Дата последнего обновления: сегодня, 09:38. Без сети доступны только заранее сохранённые формы и файлы.</p></div>` +
      K.bottom('profile')
    );
  },
  profile() {
    const K = Kontur;
    return (
      K.header('Профиль') +
      `<div class="scroll-content"><div class="profile-hero"><span class="avatar">ИИ</span><h2>Иван Иванов</h2><p>Исполнитель · Иркутск</p></div><div class="panel"><button class="menu-row" data-action="mode-menu">${K.icon('layers')}<span>Режим приложения<small>${K.modes[K.state.mode]}</small></span>${K.icon('chevron')}</button>${[
        ['history', 'История заявок', 'history'],
        ['cloud', 'Отправка данных', 'sync'],
      ]
        .map(
          ([icon, label, route]) =>
            `<a class="menu-row" href="#${route}">${K.icon(icon)}<span>${label}</span>${K.icon('chevron')}</a>`,
        )
        .join(
          '',
        )}<button class="menu-row" data-action="notifications">${K.icon('bell')}<span>Уведомления</span>${K.notifications.count() ? `<span class="notification-menu-count">${K.notifications.count()}</span>` : ''}${K.icon('chevron')}</button><button class="menu-row" data-action="app-settings">${K.icon('settings')}<span>Настройки</span>${K.icon('chevron')}</button></div><div class="mt24">${K.notice('Готово к работе без сети', '5 заявок и их формы сохранены. Состояние файлов можно проверить в разделе отправки.', 'success', 'check')}</div><p class="search-hint">Сервис Трек · мобильная команда<br>Рабочее пространство «Иркутск»</p></div>` +
      K.bottom('profile')
    );
  },
  history() {
    const K = Kontur;
    return (
      K.backHeader('История заявок', 'Завершённые работы', 'profile') +
      `<div class="scroll-content"><div class="section-label"><span>Последние работы</span><small>Завершено: ${K.requests.filter((r) => r.mine && r.status === 'EXECUTED').length}</small></div>${K.requests
        .filter((r) => r.mine && r.status === 'EXECUTED')
        .map((r) => K.requestCard(r))
        .join(
          '',
        )}<p class="search-hint">Найдите более ранние работы через поиск с областью «История».</p><a class="btn secondary full mt16" href="#search" data-action="history-search">${K.icon('search')}Поиск в истории</a></div>` +
      K.bottom('profile')
    );
  },
};
