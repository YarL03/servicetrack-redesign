'use strict';
(() => {
  const K = Kontur,
    n = K.notificationState;
  const kinds = {requests: 'Заявки', chats: 'Чаты', system: 'Система'};
  let ui;
  const current = () => n.items.find((item) => item.id === n.selected) || n.items[0];
  const records = () => (n.view === 'empty' ? [] : n.items.filter((item) => !item.deleted));
  const count = () => records().filter((item) => !item.read).length;
  const requestFor = (item) => (item.unavailable ? null : K.requests.find((r) => r.id === item.requestId));
  const getItem = (id) => n.items.find((item) => item.id === id);
  const action = (label, id, extra = '', kind = 'secondary') =>
    `<button class="btn ${kind} full" data-action="${id}" ${extra}>${label}</button>`;
  const mark = (item, read) => {
    if (n.failNextMark && !K.state.offline) {
      n.failNextMark = false;
      ui.toast('Не удалось изменить отметку. Повторите действие.');
      return false;
    }
    item.read = read;
    if (K.state.offline) n.pendingRead.add(item.id);
    else n.pendingRead.delete(item.id);
    return true;
  };
  const row = (item) => {
    const r = requestFor(item);
    return `<article class="notification-row ${item.read ? '' : 'is-unread'}"><button class="notification-open" data-action="notice-open" data-notice="${item.id}"><span class="notification-meta"><span class="notification-kind ${item.tone}">${K.icon(item.icon)}${kinds[item.kind]}</span><time>${item.time}</time></span><span class="notification-title">${K.escape(item.title)}</span><span class="notification-copy">${K.escape(item.body)}</span>${r ? `<span class="notification-context">№ ${r.id} · ${r.street}, ${r.house} · кв. ${r.apartment}</span>` : ''}<span class="notification-read">${!item.read ? '<i aria-hidden="true"></i>Непрочитано' : n.pendingRead.has(item.id) ? 'Прочитано на устройстве' : 'Прочитано'}</span></button><button class="icon-button notification-more" data-action="notice-menu" data-notice="${item.id}" aria-label="Действия: ${K.escape(item.title)}">${K.icon('more')}</button></article>`;
  };
  const switchRow = (id, title, description) =>
    `<label class="preference-row"><span><strong>${title}</strong><small>${description}</small></span><input type="checkbox" role="switch" data-preference="${id}" ${n.preferences[id] ? 'checked' : ''}><span class="switch-track" aria-hidden="true"></span></label>`;
  const pushPreview = () =>
    `<div class="push-preview"><div class="push-preview-app"><img src="assets/logo.png" alt="" width="22" height="22"><span>Сервис Трек</span><small>сейчас</small></div><strong>${n.preferences.preview ? 'Елена Соколова' : 'Новое сообщение по заявке'}</strong><p>${n.preferences.preview ? 'Пришлите фото новой пломбы.' : 'Откройте приложение, чтобы прочитать.'}</p></div>`;
  function listBody() {
    if (n.view === 'loading')
      return `<div class="notification-loading" role="status"><span class="sr-only">Загрузка уведомлений</span>${[1, 2, 3].map(() => '<div class="notification-skeleton"><i></i><b></b><span></span><span></span></div>').join('')}</div>`;
    const items = records().filter(
      (item) => (n.scope !== 'unread' || !item.read) && (n.category === 'all' || item.kind === n.category),
    );
    if (!items.length)
      return `<div class="empty notification-empty">${K.icon(count() ? 'filter' : 'bell')}<h2>${n.scope === 'unread' ? 'Непрочитанных нет' : n.category !== 'all' ? 'В этой категории пока пусто' : 'Уведомлений пока нет'}</h2><p>${n.scope === 'unread' ? 'Вы просмотрели все события в этой подборке. История остаётся в разделе «Все».' : 'Здесь появятся назначения, изменения заявок и сообщения менеджера.'}</p>${n.scope === 'unread' || n.category !== 'all' ? action('Показать все события', 'notice-reset-filters', '', 'soft') : action('К моим заявкам', 'notice-home', '', 'soft')}</div>`;
    return ['Сегодня', 'Вчера']
      .map((date) => {
        const rows = items.filter((item) => item.date === date);
        return rows.length
          ? `<div class="notification-day">${date}<span>${rows.length}</span></div>${rows.map(row).join('')}`
          : '';
      })
      .join('');
  }
  K.notifications = {
    init(context) {
      ui = context;
    },
    count,
    bell() {
      return `<button class="icon-button notification-bell" data-action="notifications" aria-label="Уведомления${count() ? `, непрочитанных: ${count()}` : ''}">${K.icon('bell')}${count() ? `<span class="badge-count" aria-hidden="true">${count()}</span>` : ''}</button>`;
    },
    backHref() {
      if (K.state.screen === 'notifications') return K.href(n.entry.screen, n.entry.id);
      const o = n.origin;
      return o && o.target === K.state.screen && o.requestId === K.state.id ? K.href(o.screen, o.id) : null;
    },
    onRoute(screen, id) {
      if (screen === 'notification-detail') {
        n.selected = getItem(id) ? id : n.selected;
        const item = current();
        if (!item.deleted && !item.read) mark(item, true);
      }
      if (screen === 'notification-in-work' && !n.origin) n.banner = true;
      if (screen === 'notification-unavailable' && getItem(id)) {
        n.selected = id;
      }
      if (screen === 'chat') {
        n.items
          .filter((item) => item.kind === 'chats' && item.requestId === K.state.id && !item.read)
          .forEach((item) => mark(item, true));
      }
      if (n.origin && screen !== n.origin.target) n.origin = null;
    },
    sync() {
      if (!K.state.offline) n.pendingRead.clear();
    },
    banner() {
      if (!n.banner) return '';
      return `<section class="incoming-notice" aria-label="Новое сообщение"><span class="incoming-icon">${K.icon('chat')}</span><div class="grow"><strong>Елена · по заявке № 10428</strong><p>Пришлите фото новой пломбы.</p><button data-action="notice-banner-open">Перейти к сообщению ${K.icon('arrow')}</button></div><button class="icon-button" data-action="notice-dismiss-banner" aria-label="Закрыть уведомление">${K.icon('close')}</button></section>`;
    },
    afterRender() {
      const app = document.querySelector('#app');
      if (n.banner && ['work', 'notification-in-work'].includes(K.state.screen)) {
        const anchor = app.querySelector('.save-state');
        if (anchor) anchor.insertAdjacentHTML('afterend', this.banner());
      }
      if (n.origin?.target === 'chat' && K.state.screen === 'chat' && K.state.id === n.origin.requestId) {
        const bubble = app.querySelector('#message-manager-' + K.state.id);
        if (bubble) {
          bubble.classList.add('message-highlight');
          bubble.scrollIntoView({block: 'nearest'});
        }
      }
    },
    actions: {
      notifications() {
        n.entry = {screen: K.state.screen, id: K.state.id};
        ui.go('notifications');
      },
      'notice-open'(button) {
        ui.go('notification-detail', button.dataset.notice);
      },
      'notice-return'() {
        ui.go(n.entry.screen, n.entry.id);
      },
      'notice-home'() {
        ui.go(K.state.listView);
      },
      'notice-reset-filters'() {
        n.scope = 'all';
        n.category = 'all';
        ui.render();
      },
      'notice-scope'(button) {
        n.scope = button.dataset.value;
        ui.render();
      },
      'notice-category'(button) {
        n.category = button.dataset.value;
        ui.render();
      },
      'notice-menu'(button) {
        n.selected = button.dataset.notice || n.selected;
        const item = current();
        ui.sheet(
          'Действия с уведомлением',
          `<p>${K.escape(item.title)}</p>${action(item.read ? 'Отметить непрочитанным' : 'Отметить прочитанным', 'notice-toggle-read')}${action('Удалить уведомление', 'notice-delete-confirm')}`,
        );
      },
      'notice-toggle-read'() {
        const item = current();
        if (!mark(item, !item.read)) return;
        ui.closeSheet();
        ui.go('notifications');
        ui.render();
      },
      'notice-delete-confirm'() {
        ui.sheet(
          'Удалить уведомление?',
          `<p>Событие исчезнет из ленты. Заявка, переписка и файлы останутся на месте.</p>${action('Удалить уведомление', 'notice-delete', '', 'primary')}${action('Оставить', 'close-sheet')}`,
        );
      },
      'notice-delete'() {
        if (K.state.offline) {
          ui.toast('Для удаления нужна сеть. Уведомление осталось в ленте.');
          return;
        }
        const item = current();
        n.undo = {id: item.id, read: item.read};
        item.deleted = true;
        n.pendingRead.delete(item.id);
        ui.closeSheet();
        ui.go('notifications');
        ui.render();
      },
      'notice-undo'() {
        if (!n.undo) return;
        const item = getItem(n.undo.id);
        item.deleted = false;
        item.read = n.undo.read;
        n.undo = null;
        ui.render();
      },
      'notice-list-menu'() {
        ui.sheet(
          'Уведомления',
          `${action('Отметить все прочитанными', 'notice-read-all')}${action('Обновить ленту', 'notice-refresh')}`,
        );
      },
      'notice-read-all'() {
        const unread = records().filter((item) => !item.read);
        if (n.failNextMark && !K.state.offline) {
          n.failNextMark = false;
          ui.toast('Не удалось изменить отметки. Попробуйте ещё раз.');
          return;
        }
        unread.forEach((item) => mark(item, true));
        ui.closeSheet();
        ui.render();
        ui.toast(
          K.state.offline
            ? 'Отметки сохранены здесь. Отправим при подключении.'
            : 'Все уведомления отмечены прочитанными.',
        );
      },
      'notice-refresh'() {
        ui.closeSheet();
        if (K.state.offline) {
          ui.toast('Нет сети. Показаны сохранённые события.');
          return;
        }
        n.view = 'ready';
        n.pendingRead.clear();
        ui.render();
        ui.toast('Уведомления обновлены.');
      },
      'notice-target'() {
        const item = current();
        if (item.unavailable || !requestFor(item)) {
          n.unavailableReason = 'access';
          ui.go('notification-unavailable', item.id);
          return;
        }
        if (K.state.offline && item.requestId === 10429) {
          n.unavailableReason = 'offline';
          ui.go('notification-unavailable', item.id);
          return;
        }
        n.origin = {screen: 'notifications', id: K.state.id, target: item.target, requestId: item.requestId};
        ui.go(item.target, item.requestId);
      },
      'notice-understood'() {
        ui.go('notifications');
      },
      'notice-check-access'() {
        if (n.unavailableReason === 'offline' && !K.state.offline) {
          K.notifications.actions['notice-target']();
          return;
        }
        ui.toast(K.state.offline ? 'Для проверки нужна сеть.' : 'Доступ к заявке пока не предоставлен.');
      },
      'notice-settings'() {
        ui.go('notification-settings');
      },
      'notice-permission'() {
        ui.go('notification-permission');
      },
      'notice-request-permission'() {
        ui.sheet(
          'Разрешить уведомления?',
          `<p class="native-demo-label">Пример системного диалога</p><div class="permission-app"><img src="assets/logo.png" alt="" width="52" height="52"><strong>Сервис Трек</strong></div><p>Приложение сможет показывать уведомления, воспроизводить звуки и обновлять значки.</p>${action('Разрешить', 'notice-permission-allow', '', 'primary')}${action('Не разрешать', 'notice-permission-deny')}`,
        );
      },
      'notice-permission-allow'() {
        n.permission = 'granted';
        ui.closeSheet();
        ui.go('notification-settings');
      },
      'notice-permission-deny'() {
        n.permission = 'denied';
        ui.closeSheet();
        ui.go('notification-settings');
      },
      'notice-system-settings'() {
        ui.sheet(
          'Уведомления «Сервис Трек»',
          `<p class="native-demo-label">Пример настроек устройства</p><p>Сейчас уведомления запрещены в настройках телефона. В приложении история событий по-прежнему доступна.</p>${action('Включить уведомления', 'notice-permission-allow', '', 'primary')}${action('Оставить выключенными', 'close-sheet')}`,
        );
      },
      'notice-later'() {
        ui.go('notifications');
      },
      'notice-settings-save'() {
        if (n.preferences.quiet && (!n.quietStart || !n.quietEnd || n.quietStart === n.quietEnd)) {
          n.quietError = 'Укажите разные время начала и окончания.';
          ui.render();
          document.querySelector('.quiet-error')?.scrollIntoView({block: 'nearest'});
          return;
        }
        n.quietError = '';
        ui.render();
        ui.toast('Настройки уведомлений сохранены.');
      },
      'notice-dismiss-banner'() {
        n.banner = false;
        ui.render();
      },
      'notice-banner-open'() {
        const item = getItem('live-message') || getItem('message');
        mark(item, true);
        n.origin = {screen: K.state.screen, id: K.state.id, target: 'chat', requestId: 10428};
        n.banner = false;
        ui.go('chat', 10428);
      },
      'notice-simulate'() {
        let item = getItem('live-message');
        const isNew = !item;
        if (!item) {
          item = {...getItem('message'), id: 'live-message', time: '09:41', read: false};
          n.items.unshift(item);
        }
        const openChat = K.state.screen === 'chat' && K.state.id === 10428;
        item.read = openChat;
        item.deleted = false;
        K.requests[0].unread = openChat ? 0 : Math.max(K.requests[0].unread, 1);
        n.view = 'ready';
        n.banner = !openChat;
        if (isNew)
          K.addEntry({role: 'manager', text: 'Пришлите фото новой пломбы.', files: [], status: 'delivered'}, 10428);
        ui.render();
        if (!['work', 'notification-in-work', 'chat'].includes(K.state.screen))
          ui.toast('Новое событие в уведомлениях.');
      },
      'notice-push-preview'() {
        ui.sheet(
          'Пример push',
          `${pushPreview()}<p>Уведомление на заблокированном экране телефона.</p>${action('Открыть сообщение', 'notice-push-open', '', 'primary')}`,
        );
      },
      'notice-push-open'() {
        n.entry = {screen: K.state.screen, id: K.state.id};
        n.selected = 'message';
        mark(current(), true);
        ui.closeSheet();
        K.notifications.actions['notice-target']();
      },
      'notice-demo-failure'() {
        n.failNextMark = true;
        ui.toast('Следующая отметка чтения покажет ошибку.');
      },
    },
    change(target) {
      if (target.id === 'notice-demo-state') {
        n.view = target.value;
        ui.render();
        return true;
      }
      if (target.dataset.preference) {
        n.preferences[target.dataset.preference] = target.checked;
        ui.render();
        return true;
      }
      if (target.id === 'quiet-start') {
        n.quietStart = target.value;
        return true;
      }
      if (target.id === 'quiet-end') {
        n.quietEnd = target.value;
        return true;
      }
      return false;
    },
  };
  const N = K.notifications;
  Object.assign(K.screens, {
    notifications() {
      const error = n.view === 'error';
      return (
        K.backHeader(
          'Уведомления',
          `Непрочитанных: ${count()}`,
          n.entry.screen,
          K.iconButton('settings', 'Настройки уведомлений', 'notice-settings'),
        ) +
        `<div class="notification-scopes" role="group" aria-label="Показать уведомления">${[
          ['all', 'Все', records().length],
          ['unread', 'Непрочитанные', count()],
        ]
          .map(
            ([value, label, total]) =>
              `<button data-action="notice-scope" data-value="${value}" aria-pressed="${n.scope === value}" class="${n.scope === value ? 'active' : ''}">${label}<span>${total}</span></button>`,
          )
          .join(
            '',
          )}</div><div class="notification-categories" role="group" aria-label="Категории событий">${[['all', 'Все события'], ...Object.entries(kinds)].map(([value, label]) => `<button data-action="notice-category" data-value="${value}" aria-pressed="${n.category === value}" class="${n.category === value ? 'active' : ''}">${label}</button>`).join('')}</div>` +
        `<div class="scroll-content flush notification-feed">${K.state.offline ? `<div class="notification-info">${K.icon('offline')}<span>Без сети · сохранённая лента<br><small>${n.pendingRead.size ? `Отметок к отправке: ${n.pendingRead.size}` : 'Обновлено сегодня в 09:38'}</small></span></div>` : error ? `<div class="notification-info error">${K.icon('alert')}<span>Не удалось обновить ленту<br><small>Показаны сохранённые события</small></span><button data-action="notice-refresh">Повторить</button></div>` : ''}${n.undo ? `<div class="notification-undo" role="status">Уведомление удалено<button data-action="notice-undo">Отменить</button></div>` : ''}<div class="notification-toolbar"><span>${n.scope === 'unread' ? 'Новые события' : 'История событий'}</span>${K.iconButton('more', 'Действия со всеми уведомлениями', 'notice-list-menu')}</div>${listBody()}${n.permission === 'default' && n.view === 'ready' ? `<div class="notification-push-hint"><span>${K.icon('bell')}Узнавайте об изменениях вовремя</span><button data-action="notice-permission">Включить push</button></div>` : ''}</div>` +
        K.bottom('')
      );
    },
    'notification-detail'() {
      const item = current(),
        r = requestFor(item);
      return (
        K.backHeader(
          'Уведомление',
          item.date + ' · ' + item.time,
          'notifications',
          `<button class="icon-button" data-action="notice-menu" data-notice="${item.id}" aria-label="Действия с уведомлением">${K.icon('more')}</button>`,
        ) +
        `<div class="scroll-content"><div class="notification-detail-kind ${item.tone}">${K.icon(item.icon)}${kinds[item.kind]}</div><h1 class="notification-detail-title">${K.escape(item.title)}</h1><p class="notification-author">${K.escape(item.sender)}</p><p class="notification-detail-body">${K.escape(item.body)}</p>${r ? `<section class="panel mt24"><div class="row between"><span class="mono tiny muted">№ ${r.id}</span>${K.badge(r)}</div><h3 class="mt16">${K.address(r)}</h3><p class="search-hint" style="margin-top:8px">${r.type}</p></section>` : ''}${item.id === 'revision' ? `<div class="mt24">${K.notice('Что нужно исправить', 'Переснимите пломбу так, чтобы читался её номер. Остальные данные заявки сохранены.', 'warning', 'camera')}</div>` : ''}<div class="notification-detail-state">${K.icon(item.read ? 'check' : 'bell')}${n.pendingRead.has(item.id) ? 'Прочитано на устройстве · ожидает подключения' : item.read ? 'Уведомление прочитано' : 'Не удалось сохранить отметку прочтения'}</div></div>` +
        K.actionbar(
          item.target
            ? action(item.action, 'notice-target', '', 'primary')
            : action('Понятно', 'notice-understood', '', 'primary'),
        )
      );
    },
    'notification-settings'() {
      const granted = n.permission === 'granted',
        denied = n.permission === 'denied';
      return (
        K.backHeader('Настройки уведомлений', 'Только нужные вам события', 'notifications') +
        `<div class="scroll-content"><section class="notification-delivery-card"><span class="notification-delivery-icon">${K.icon(granted ? 'check' : 'bell')}</span><h2>${granted ? 'Push включены' : denied ? 'Push запрещены на телефоне' : 'Будьте в курсе изменений'}</h2><p>${granted ? 'Новые события могут появляться на экране телефона.' : 'История событий доступна в приложении. Включите push, чтобы узнавать о важном вовремя.'}</p>${!granted ? action(denied ? 'Открыть настройки телефона' : 'Включить push', denied ? 'notice-system-settings' : 'notice-permission', '', 'soft') : '<span class="chip success">Разрешение получено</span>'}</section><div class="section-label">Какие push получать</div><div class="panel preferences-panel">${switchRow('requests', 'Изменения заявок', 'Назначения, доработки и завершение')}${switchRow('chats', 'Сообщения менеджера', 'Новые сообщения по вашим заявкам')}${switchRow('system', 'События сервиса', 'Изменения в работе приложения')}</div><p class="preference-hint">Категории влияют на push. Все события остаются в ленте.</p><div class="section-label">Когда и как получать</div><div class="panel preferences-panel">${switchRow('quiet', 'Тихие часы', 'Без звука и всплывающих push')}${n.preferences.quiet ? `<div class="quiet-time-fields"><label class="field"><span>С</span><input id="quiet-start" type="time" value="${n.quietStart}"></label><label class="field"><span>До</span><input id="quiet-end" type="time" value="${n.quietEnd}"></label></div><p class="preference-hint">По времени устройства${n.quietStart > n.quietEnd ? ' · через полночь' : ''}</p>${n.quietError ? `<p role="alert" class="quiet-error">${n.quietError}</p>` : ''}` : ''}${switchRow('sound', 'Звук', 'Если разрешён в настройках телефона')}</div><div class="section-label">Экран блокировки</div><div class="panel preferences-panel">${switchRow('preview', 'Показывать текст сообщения', 'По умолчанию содержание скрыто')}</div><div class="mt16">${pushPreview()}</div><p class="preference-hint">Настройки телефона и режим «Не беспокоить» имеют приоритет.</p></div>` +
        K.actionbar(action('Сохранить настройки', 'notice-settings-save', '', 'primary'))
      );
    },
    'notification-permission'() {
      return (
        K.backHeader('Уведомления на телефоне', '', 'notification-settings') +
        `<div class="scroll-content"><div class="permission-illustration"><img src="assets/logo.png" width="56" height="56" alt="Логотип Сервис Трек">${K.icon('bell')}</div><h1 class="permission-title">Не пропустите<br>важные изменения</h1><p class="permission-description">Узнавайте о новой заявке, доработке или ответе менеджера, даже когда приложение закрыто.</p><div class="permission-benefits"><div>${K.icon('list')}Новые назначения и изменения</div><div>${K.icon('chat')}Ответы по вашей заявке</div><div>${K.icon('settings')}Категории и тихие часы под вашим контролем</div></div>${pushPreview()}<p class="preference-hint mt24">Можно отказаться и продолжить работу. Все события останутся в приложении.</p></div>` +
        K.actionbar(
          action('Разрешить уведомления', 'notice-request-permission', '', 'primary') +
            action('Не сейчас', 'notice-later'),
        )
      );
    },
    'notification-in-work'() {
      return K.screens.work();
    },
    'notification-unavailable'() {
      const offline = n.unavailableReason === 'offline';
      return (
        K.backHeader('Переход из уведомления', '', 'notifications') +
        `<div class="scroll-content"><div class="result-emblem pending">${K.icon(offline ? 'offline' : 'lock')}</div><div class="result-copy"><h1>${offline ? 'Заявка не сохранена<br>на устройстве' : 'Доступ к заявке<br>изменился'}</h1><p>${offline ? 'Сейчас нет сети. Подключитесь, чтобы открыть актуальную карточку.' : 'Возможно, заявка передана другому исполнителю. Её данные сейчас недоступны.'}</p></div><div class="panel"><div class="row gap8 muted">${K.icon('bell')}Событие осталось в ленте</div><p class="search-hint">${offline ? 'После подключения повторите переход. Ваши остальные черновики сохранены.' : 'Уточните назначение у менеджера. Другие заявки и ваши черновики доступны.'}</p></div></div>` +
        K.actionbar(
          action(offline ? 'Повторить переход' : 'Проверить доступ', 'notice-check-access', '', 'primary') +
            K.linkButton('Вернуться к уведомлениям', 'notifications', 'secondary'),
        )
      );
    },
  });
})();
