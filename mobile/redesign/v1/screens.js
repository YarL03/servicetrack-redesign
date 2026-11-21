'use strict';
Kontur.screens = {
  queue() {
    const K = Kontur,
      active = K.activeRequests(),
      current = active.find((r) => r.status === 'IN_PROGRESS'),
      attention = active.filter((r) => r.revision || r.status === 'DELAYED'),
      ready = active.filter((r) => r.status === 'READY_TO_PROCESS' && !r.revision);
    const focus = current
      ? `<section class="focus-card"><div class="row between"><span class="focus-eyebrow">${K.icon('clock')}Текущая работа</span><span class="mono tiny muted">№ ${current.id}</span></div><h2>${current.street}, ${current.house} <span class="muted">· кв. ${current.apartment}</span></h2><p class="request-type">${current.type}</p><div class="progress-caption"><span>${K.state.pendingIds?.includes(current.id) ? 'Ожидает отправки' : 'Установка прибора'}</span><span class="muted">Этап 2 из 3</span></div><div class="progress-track" aria-label="Первый этап завершён, второй в работе"><i class="done"></i><i class="current"></i><i></i></div><a class="btn primary full" href="#${K.state.pendingIds?.includes(current.id) ? 'complete' : 'work'}/${current.id}">${K.state.pendingIds?.includes(current.id) ? 'Проверить отправку' : 'Продолжить работу'}${K.icon('arrow')}</a></section>`
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
        )}<div class="section-label"><span>Готовы к работе</span><small>Заявок: ${ready.length}</small></div>${ready.map((r) => K.requestCard(r, true)).join('')}<p class="search-hint">Данные обновлены в 09:38</p></div>` +
      K.bottom()
    );
  },
  locations() {
    const K = Kontur,
      s = K.state;
    const groups = K.addressGroups(),
      streetOnly = s.addressGrouping === 'street';
    return (
      K.header('Мои заявки', K.listSummary(), K.notifications.bell()) +
      K.listTools() +
      K.views() +
      K.network() +
      `<div class="scroll-content no-top"><div class="address-grouping"><p id="address-grouping-label">Группировка заявок</p><div class="address-grouping-options" role="group" aria-labelledby="address-grouping-label">${[
        ['street', 'По улице'],
        ['street-house', 'По улице и дому'],
      ]
        .map(
          ([value, label]) =>
            `<button data-action="set-address-grouping" data-grouping="${value}" aria-pressed="${s.addressGrouping === value}">${label}</button>`,
        )
        .join(
          '',
        )}</div></div><div class="section-label"><span>Иркутск</span><small>${streetOnly ? 'Улиц' : 'Домов'}: ${groups.length}</small></div>${groups
        .map(({key, street, house, rows}, i) => {
          const open = s.addressExpanded[s.addressGrouping][key] ?? i < 2;
          return `<details class="building-group" data-address-group="${K.escape(key)}" data-grouping-mode="${s.addressGrouping}" ${open ? 'open' : ''}><summary><span class="building-icon">${K.icon(streetOnly ? 'pin' : 'building')}</span><span class="grow"><h3>${K.escape(street)}${streetOnly ? '' : ', ' + K.escape(house)}</h3><p>Заявок: ${rows.length}${streetOnly ? ' · домов: ' + new Set(rows.map((r) => r.house)).size : ''}${rows.some((r) => r.status === 'IN_PROGRESS') ? ' · есть работа в процессе' : ''}</p></span>${K.icon('down')}</summary>${rows.map((r) => `<a class="apartment-row ${streetOnly ? 'street-request-row ' : ''}${r.status === 'IN_PROGRESS' ? 'current' : ''}" href="${K.href('detail', r.id)}">${streetOnly ? '' : `<span class="apartment-number">${K.escape(r.apartment)}<small>квартира</small></span>`}<span class="grow">${streetOnly ? `<strong class="street-request-address">Дом ${K.escape(r.house)} · кв. ${K.escape(r.apartment)}</strong>` : ''}<p>${K.escape(r.type)}</p>${K.badge(r)}</span>${K.icon('chevron')}</a>`).join('')}</details>`;
        })
        .join(
          '',
        )}${groups.length ? `` : K.notice('Активных заявок пока нет', 'Новые назначения появятся здесь.', 'info', 'list')}</div>` +
      K.bottom()
    );
  },
  statuses() {
    const K = Kontur,
      s = K.state;
    const groups = [
      ['IN_PROGRESS', 'В работе'],
      ['READY_TO_PROCESS', 'Готовы'],
      ['DELAYED', 'Недопуск'],
      ['revision', 'Доработка'],
    ].map(([id, label]) => [
      id,
      label,
      K.activeRequests().filter((r) => (id === 'revision' ? r.revision : r.status === id && !r.revision)).length,
    ]);
    const rows = K.activeRequests().filter((r) =>
      s.status === 'revision' ? r.revision : r.status === s.status && !r.revision,
    );
    return (
      K.header('Мои заявки', K.listSummary(), K.notifications.bell()) +
      K.listTools() +
      K.views() +
      K.network() +
      `<div class="scroll-content no-top"><div class="status-grid">${groups.map(([id, label, count]) => `<button class="status-tile ${s.status === id ? 'active' : ''}" data-status="${id}" aria-pressed="${s.status === id}"><span>${label}</span><b>${count}</b></button>`).join('')}</div><div class="section-label"><span>${groups.find((g) => g[0] === s.status)[1]}</span><small>${rows.length} ${rows.length === 1 ? 'заявка' : 'заявки'}</small></div>${rows.map((r) => K.requestCard(r)).join('')}${s.status === 'IN_PROGRESS' && rows.length ? `<div class="mt16"><a class="btn primary full" href="#work/${rows[0].id}">Продолжить работу${K.icon('arrow')}</a></div><p class="search-hint">Заявки переходят между группами после смены статуса. Доработки выделены отдельно.</p>` : ''}</div>` +
      K.bottom()
    );
  },
  search() {
    const K = Kontur,
      s = K.state;
    return (
      K.backHeader('Поиск заявок', '', s.listView) +
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
        ['READY_TO_PROCESS', 'Готова к работе'],
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
      K.header('Все заявки', '8 заявок в доступном реестре') +
      K.listTools() +
      K.network() +
      `<div class="scroll-content"><div class="section-label"><span>Ожидают исполнителя</span><small>2 заявки</small></div>${K.requests
        .filter((r) => !r.mine)
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
    const editable = r.mine && r.status !== 'EXECUTED';
    return (
      K.backHeader(
        'Заявка № ' + r.id,
        r.external,
        K.state.listView,
        K.iconButton('more', 'Действия заявки', 'request-menu'),
      ) +
      K.network() +
      `<div class="scroll-content"><section class="request-hero">${K.badge(r)}<h1>ул. ${r.street}, ${r.house}<br>квартира ${r.apartment}</h1><p>Иркутск · ${r.type}</p></section><div class="quick-actions"><button data-action="route">${K.icon('pin')}Маршрут</button><button data-action="call-customer">${K.icon('phone')}Абонент</button><a href="${K.href('chat', r.id)}">${K.icon('chat')}Чат ${r.unread ? '· ' + r.unread : ''}</a></div>${r.id === 10428 ? K.notice('Перед началом', 'Счётчик в квартире. Абонент просит позвонить перед визитом.', 'info', 'file') : r.revision ? K.notice('Вернули на доработку', 'На фото не читается номер пломбы. Сделайте новый снимок.', 'warning', 'camera') : ''}<div class="panel mt16"><div class="info-line"><span>Абонент</span><strong>${r.customer}</strong></div><div class="info-line"><span>Место установки</span><strong>В квартире</strong></div><div class="info-line"><span>Лицевой счёт</span><strong class="mono">008241093</strong></div></div><div class="section-label">Ответственный менеджер</div><div class="panel person-row"><span class="avatar sage">ЕС</span><span class="grow"><strong>Елена Соколова</strong><small>Менеджер заявки</small></span><a class="icon-button" href="${K.href('chat', r.id)}" aria-label="Написать менеджеру">${K.icon('chat')}</a></div><details class="disclosure mt16"><summary>Объект и исходные данные${K.icon('down')}</summary><div class="info-line"><span>Старый прибор</span><strong>Меркурий 201</strong></div><div class="info-line"><span>Заводской номер</span><strong class="mono">59120318</strong></div><div class="info-line"><span>Контракт</span><strong>Иркутск · 2026</strong></div></details>${editable ? `<button class="text-link" data-action="delay">${K.icon('alert')}Сообщить о недопуске</button>` : ''}</div>` +
      K.actionbar(
        editable
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
      s = K.state,
      d = s.draft,
      r = K.request();
    return (
      K.backHeader(
        'Установка прибора',
        '№ ' + r.id,
        'stages',
        `<a class="icon-button" href="${K.href('chat', r.id)}" aria-label="Чат заявки">${K.icon('chat')}${r.unread ? `<span class="badge-count">${r.unread}</span>` : ''}</a>`,
      ) +
      `<div class="context-line"><span>${K.address(r)}</span><button data-action="stages">Этапы</button></div><div class="save-state" id="save-state">${K.icon('check')}Черновик сохранён на устройстве</div>` +
      K.network() +
      `<div class="scroll-content"><div class="stepper"><b class="done">✓</b><i></i><b class="active">2</b><i></i><b>3</b><span>Этап 2 из 3</span></div><div class="form-intro"><h2>Новый счётчик</h2><p>Обязательные поля отмечены *</p></div><label class="field"><span>Заводской номер *</span><span class="field-input-row"><input id="serial" autocomplete="off" inputmode="numeric" value="${K.escape(d.serial)}">${K.iconButton('scan', 'Сканировать заводской номер', 'scan', 'bordered')}</span><small>Меркурий 201.7 · однофазный</small></label><label class="field ${s.reviewError && !d.reading ? 'error' : ''}"><span>Начальные показания, кВт·ч *</span><input id="reading" inputmode="decimal" placeholder="Например, 00012,5" value="${K.escape(d.reading)}" ${s.reviewError && !d.reading ? 'aria-invalid="true" aria-describedby="reading-error"' : ''}><small id="reading-error" class="${s.reviewError && !d.reading ? 'field-error' : ''}">${s.reviewError && !d.reading ? 'Укажите начальные показания.' : 'Введите показания с установленного прибора.'}</small></label><section class="field-panel"><h3>Фото установленного прибора *</h3><p>В кадре видны номер, показания и пломба.</p>${d.photo ? `<div class="photo-proof">${K.icon('photo')}<span>Счётчик после установки<br><small>1 фото · сохранено</small></span>${K.iconButton('close', 'Удалить фото', 'remove-photo')}</div>` : `<button class="photo-add" data-action="work-photo">${K.icon('camera')}Сделать или выбрать фото</button>`}</section><label class="field mt24"><span>Комментарий <span class="muted">· необязательно</span></span><textarea id="work-comment" placeholder="Что важно знать менеджеру" maxlength="400">${K.escape(d.comment)}</textarea></label><div class="tag-row mt16"><button class="tag-button" data-action="work-audio">${K.icon('mic')} Аудио</button><button class="tag-button" data-action="work-video">${K.icon('video')} Видео</button><button class="tag-button" data-action="work-document">${K.icon('clip')} Файл</button></div><p class="search-hint">Дополнительные материалы — если нужны для этой работы.</p>${d.audio ? '<div class="photo-proof">Аудиозаметка · 00:18 · сохранена</div>' : ''}${d.extraFiles?.length ? `<div class="photo-proof">${d.extraFiles.map(K.escape).join('<br>')}</div>` : ''}</div>` +
      K.actionbar(
        K.button('Проверить результат', 'review', 'primary', 'arrow'),
        `${K.progress()} из 3 обязательных полей заполнено`,
      )
    );
  },
  review() {
    const K = Kontur,
      s = K.state,
      d = s.draft,
      r = K.request();
    const missing = !d.serial.trim() || !/^\d+([.,]\d+)?$/.test(d.reading.trim()) || !d.photo;
    return (
      K.backHeader('Проверка результата', '№ ' + r.id, 'work') +
      K.network() +
      `<div class="scroll-content"><div class="form-intro"><h2>Всё готово к отправке?</h2><p>${K.address(r)}</p></div>${missing ? K.notice('Есть незаполненные поля', 'Заполните обязательные поля установки. Ссылки ниже вернут к нужному месту.', 'warning', 'alert') : K.notice('Обязательные поля заполнены', 'Проверьте показания и фото перед завершением.', 'success', 'check')}<div class="panel mt16"><div class="summary-row"><span><p>Заводской номер</p><strong class="mono">${K.escape(d.serial) || 'Не заполнен'}</strong></span><button class="text-link" data-field="serial">Изменить</button></div><div class="summary-row"><span><p>Начальные показания</p><strong class="mono">${K.escape(d.reading) || 'Не заполнены'}${d.reading ? ' кВт·ч' : ''}</strong></span><button class="text-link" data-field="reading">${d.reading ? 'Изменить' : 'Заполнить'}</button></div><div class="summary-row"><span><p>Фото установленного прибора</p><strong>${d.photo ? '1 фото сохранено' : 'Фото не добавлено'}</strong></span><button class="text-link" data-field="photo">${d.photo ? 'Посмотреть' : 'Добавить'}</button></div>${d.comment ? `<div class="summary-row"><span><p>Комментарий</p><strong>${K.escape(d.comment)}</strong></span></div>` : ''}</div><div class="mt24">${K.notice('После отправки', 'Редактирование приостановится на время передачи. Статус «Выполнена» появится после подтверждения.', 'info', 'cloud')}</div><a class="text-link" href="${K.href('chat', r.id)}">${K.icon('chat')}Обсудить с менеджером</a></div>` +
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
      pending = K.state.pendingIds?.includes(K.state.id) || (!K.state.complete && K.state.offline);
    return (
      K.backHeader(pending ? 'Ожидает отправки' : 'Работа завершена', '№ ' + K.state.id, 'queue') +
      `<div class="scroll-content"><div class="result-emblem ${pending ? 'pending' : ''}">${K.icon(pending ? 'cloud' : 'check')}</div><div class="result-copy"><h1>${pending ? 'Результат сохранён' : 'Заявка выполнена'}</h1><p>${pending ? 'Отправим, когда появится сеть.<br>Пока заявка остаётся в работе.' : 'Менеджер получил результат.<br>Заявка перенесена в историю.'}</p></div><div class="panel"><div class="row between"><span class="mono tiny muted">№ ${K.state.id}</span><span class="chip ${pending ? 'warning' : 'success'}">${pending ? 'Ожидает отправки' : 'Выполнена'}</span></div><h3 class="mt16">${K.address(K.request())}</h3><p class="muted tiny mt16">${pending ? 'Изменения сохранены на этом устройстве.' : 'Подтверждение получено · 09:41'}</p></div><div class="mt24">${K.notice(pending ? 'Можно продолжать работу' : 'Следующая заявка в этом доме', pending ? 'Форма временно закрыта для изменений. Проверить отправку можно из профиля.' : 'Лермонтова, 18 · кв. 47<br>Замена электросчётчика', pending ? 'warning' : 'info', pending ? 'lock' : 'building')}</div></div>` +
      K.actionbar(
        pending
          ? K.linkButton('Посмотреть отправку', 'sync', 'primary', 'cloud')
          : `<a class="btn primary full" href="#detail/10429">Открыть следующую заявку${K.icon('arrow')}</a>`,
      ) +
      K.bottom()
    );
  },
  delay() {
    const K = Kontur,
      s = K.state;
    return (
      K.backHeader('Сообщить о недопуске', '№ ' + s.id, 'detail') +
      `<div class="scroll-content"><div class="form-intro"><h2>Не удалось попасть внутрь</h2><p>${K.address(K.request())}</p></div><div class="row"><label class="field grow"><span>Дата *</span><input id="delay-date" type="date" value="${s.delayDate}"></label><label class="field grow" style="margin-top:0"><span>Время *</span><input id="delay-time" type="time" value="${s.delayTime}"></label></div><section class="field-panel"><h3>Фото уведомления *</h3><p>Сфотографируйте оставленное уведомление.</p>${s.delayPhoto ? `<div class="photo-proof">${K.icon('photo')}Уведомление · фото добавлено</div>` : `<button class="photo-add" data-action="delay-photo">${K.icon('camera')}Добавить фото</button>`}</section><button class="text-link" data-action="delay-act">${K.icon('plus')}${s.delayAct ? 'Фото акта добавлено ✓' : 'Фото акта недопуска · необязательно'}</button><label class="field mt16"><span>Комментарий</span><textarea id="delay-comment" maxlength="400" placeholder="Например: звонил в домофон и по телефону, ответа нет">${K.escape(s.delayComment)}</textarea><small>До 400 символов</small></label><div class="mt24">${K.notice('Менеджер увидит причину', 'Данные недопуска сохранятся в заявке. Можно дополнительно написать в чат.', 'info', 'chat')}</div></div>` +
      K.actionbar(
        K.button('Сохранить недопуск', 'save-delay', 'primary', 'check'),
        s.delayPhoto ? 'Фото уведомления добавлено' : 'Для сохранения нужно фото уведомления',
      )
    );
  },
  sync() {
    const K = Kontur,
      s = K.state;
    return (
      K.backHeader('Отправка данных', 'Всё сохранено на устройстве', 'profile') +
      `<div class="scroll-content">${K.notice(s.offline ? 'Сейчас нет сети' : 'Соединение восстановлено', s.offline ? 'Сохранённые заявки доступны. Новые изменения отправятся после подключения.' : 'Отправка продолжается. Ошибки можно повторить отдельно.', s.offline ? 'warning' : 'success', s.offline ? 'offline' : 'check')}<section class="sync-item"><div class="row between"><h3>№ 10428 · Результат работы</h3></div><div class="sync-timeline">${K.icon('check')}Сохранено <span>→</span> ${K.icon('cloud')}Ожидает отправки</div><p>3 поля и 1 фото. Статус заявки изменится после подтверждения сервера.</p><span class="chip warning">В очереди</span></section><section class="sync-item"><div class="row between"><h3>№ 10430 · Фото уведомления</h3><span class="chip ${s.syncRetried ? 'success' : 'danger'}">${s.syncRetried ? 'Отправлено' : 'Ошибка'}</span></div><p>${s.syncRetried ? 'Файл получен. Повторная отправка остальных данных не понадобилась.' : 'Не удалось загрузить файл. Фото сохранено, можно повторить отправку.'}</p>${!s.syncRetried ? K.button('Повторить отправку', 'retry-sync', 'secondary', 'cloud') : ''}</section><section class="sync-item"><div class="row between"><h3>№ 10432 · Данные изменились</h3></div><p>Менеджер обновил форму. Проверьте различия; ваши файлы сохранены.</p>${K.button('Проверить изменения', 'conflict', 'soft', 'arrow')}</section><p class="search-hint">Дата последнего обновления: сегодня, 09:38. Без сети доступны только заранее сохранённые формы и файлы.</p></div>` +
      K.bottom('profile')
    );
  },
  chats() {
    const K = Kontur;
    const rows = [
      [10428, 'ЕС', 'Елена Соколова', 'Пришлите фото новой пломбы.', '09:37', 2],
      [10430, 'ЕС', 'Елена Соколова', 'Хорошо, зафиксируйте недопуск.', '09:12', 1],
      [10432, 'ЕС', 'Елена Соколова', 'Номер на фото не читается.', 'Вчера', 0],
    ];
    return (
      K.header(
        'Чаты',
        'Обсуждения по вашим заявкам',
        `<div class="row">${K.iconButton('search', 'Найти диалог', 'chat-search')}${K.notifications.bell()}</div>`,
      ) +
      K.network() +
      `<div class="scroll-content flush">${rows
        .map(([id, initials, name, message, time, unread]) => {
          const r = K.requests.find((r) => r.id === id);
          return `<a class="chat-row" href="#chat/${id}"><span class="avatar ${id === 10430 ? 'sage' : ''}">${initials}</span><div class="grow"><div class="chat-title"><h3>Заявка № ${id}</h3><small>${time}</small></div><p class="chat-address">${K.address(r)}</p><div class="last-message"><span><strong>${name.split(' ')[0]}:</strong> ${message}</span>${r.unread ? `<span class="badge-count">${r.unread}</span>` : ''}</div></div></a>`;
        })
        .join(
          '',
        )}<div style="padding:20px"><p class="search-hint">Диалог можно открыть из любой вашей заявки. Уведомления системы находятся в профиле.</p></div></div>` +
      K.bottom('chats')
    );
  },
  chat() {
    const K = Kontur,
      s = K.state,
      r = K.request(),
      manager = s.role === 'manager';
    const own = s.messages[r.id] || [];
    return (
      K.backHeader(
        manager ? 'Иван Иванов' : 'Елена Соколова',
        manager ? 'Исполнитель заявки' : 'Менеджер заявки',
        'chats',
        K.iconButton('more', 'Действия чата', 'chat-menu'),
      ) +
      `<a class="chat-context" href="#detail/${r.id}">${K.icon('list')}<span class="grow"><p>№ ${r.id} · ${K.address(r)}</p><small>${r.type} · ${K.statuses[r.status][0]}</small></span>${K.icon('chevron')}</a>` +
      K.network() +
      `<div class="scroll-content" id="messages"><div class="message-day">Сегодня, 19 ноября</div><div class="message ${manager ? '' : 'own'}"><p>Доброе утро! Я на объекте, начинаю замену.</p><div class="message-meta">09:24 ${K.icon('checks')}</div></div><div id="message-manager-${r.id}" class="message ${manager ? 'own' : ''}"><div class="sender">Елена · менеджер</div><p>${r.id === 10430 ? 'Если абонент не отвечает, зафиксируйте недопуск и приложите уведомление.' : r.id === 10432 ? 'На фото не читается номер пломбы. Нужен новый снимок крупнее.' : 'Доброе утро! Пришлите фото новой пломбы, чтобы был виден номер.'}</p><div class="message-meta">09:37</div></div><div class="message ${manager ? 'own' : ''}"><div class="sender">Елена · менеджер</div>${K.fileCard({name: 'Схема подключения.pdf', size: '248 КБ', demo: true})}<div class="message-meta">09:37</div></div><div class="message-system">Сообщения и файлы относятся к заявке № ${r.id}</div>${own.map((m) => `<div class="message ${!m.role || m.role === s.role ? 'own' : ''}"><p>${K.escape(m.text)}</p>${(m.files || []).map((f) => K.fileCard(f)).join('')}<div class="message-meta">09:41 ${m.status === 'queued' ? '· В очереди' : m.status === 'failed' ? '· Не отправлено' : '· Доставлено'} ${K.icon(m.status === 'queued' ? 'clock' : m.status === 'failed' ? 'alert' : 'checks')}</div>${m.status === 'failed' ? `<div class="message-failure">Файл сохранён<button data-retry-message="${m.id}">Повторить</button></div>` : ''}</div>`).join('')}</div><div class="composer"><div class="draft-attachments">${s.attachments.map((f) => K.fileCard(f, true)).join('')}</div><form id="message-form" class="compose-row"><a class="icon-button" href="#attachments/${r.id}" aria-label="Прикрепить файл">${K.icon('plus')}</a><label class="grow"><span class="sr-only">Сообщение</span><textarea id="message-text" rows="1" placeholder="Сообщение…">${K.escape(s.chatText[r.id] || '')}</textarea></label><button class="icon-button send-button" type="submit" aria-label="Отправить сообщение">${K.icon('send')}</button></form></div>`
    );
  },
  attachments() {
    const K = Kontur,
      s = K.state;
    return (
      K.backHeader('Прикрепить к сообщению', 'Заявка № ' + s.id, 'chat') +
      `<div class="scroll-content"><h2>Что отправить?</h2><div class="attachment-options">${[
        ['camera', 'Камера', 'pick-camera'],
        ['photo', 'Галерея', 'pick-photo'],
        ['file', 'Документ', 'pick-file'],
        ['video', 'Видео', 'pick-video'],
        ['mic', 'Аудио', 'pick-audio'],
        ['plus', 'Пример PDF', 'demo-file'],
      ]
        .map(
          ([icon, label, action]) =>
            `<button class="attachment-option" data-action="${action}">${K.icon(icon)}${label}</button>`,
        )
        .join(
          '',
        )}</div><p class="search-hint">До 25 МБ на файл. Перед отправкой можно проверить или удалить вложение.</p><div class="section-label"><span>Готовы к отправке</span><small>Файлов: ${s.attachments.length}</small></div><div class="stack">${s.attachments.length ? s.attachments.map((f) => K.fileCard(f, true)).join('') : `<div class="panel muted" style="font-size:14px">Выберите файл или добавьте пример PDF для просмотра сценария.</div>`}</div><div class="mt24">${K.notice('Файлы остаются в этом диалоге', 'Вложения чата не заменяют обязательные фото и документы рабочей формы.', 'info', 'clip')}</div></div>` +
      K.actionbar(
        K.linkButton(s.attachments.length ? 'Добавить в сообщение' : 'Вернуться в чат', 'chat', 'primary', 'arrow'),
      )
    );
  },
  profile() {
    const K = Kontur;
    return (
      K.header('Профиль') +
      `<div class="scroll-content"><div class="profile-hero"><span class="avatar">ИИ</span><h2>Иван Иванов</h2><p>Исполнитель · Иркутск</p></div><div class="panel">${[
        ['history', 'История заявок', 'history'],
        ['cloud', 'Отправка данных', 'sync'],
      ]
        .map(
          ([icon, label, route]) =>
            `<a class="menu-row" href="#${route}">${K.icon(icon)}<span>${label}</span>${K.icon('chevron')}</a>`,
        )
        .join(
          '',
        )}<button class="menu-row" data-action="notifications">${K.icon('bell')}<span>Уведомления</span><span class="notification-menu-count">${K.notifications.count()}</span>${K.icon('chevron')}</button><button class="menu-row" data-action="app-settings">${K.icon('settings')}<span>Настройки</span>${K.icon('chevron')}</button></div><div class="mt24">${K.notice('Готово к работе без сети', '5 заявок и их формы сохранены. Состояние файлов можно проверить в разделе отправки.', 'success', 'check')}</div><p class="search-hint">Сервис Трек · мобильная команда<br>Рабочее пространство «Иркутск»</p></div>` +
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
