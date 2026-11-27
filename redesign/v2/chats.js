(() => {
  const R = window.RD, K = window.KonturV2, E = R.esc;
  const groups = {none: 'Без группировки', street: 'По улице', house: 'По улице и дому', city: 'По населённому пункту', type: 'По типу работ'};
  let grouping = 'none', scope = 'active', query = '', order = 0;
  try {
    const saved = localStorage.getItem('kontur-web-chat-group');
    if (Object.hasOwn(groups, saved)) grouping = saved;
  } catch {}
  const collapsed = new Set();
  const scopes = {active: 'Активные', unread: 'Непрочитанные', archive: 'Архив'};
  const dialogs = K.requests.filter(r => r.hasWorker);
  const current = () => K.get(document.querySelector('[data-thread]')?.dataset.thread);
  const unreadCount = () => dialogs.filter(r => !r.archive && r.unread).length;
  function groupName(r) {
    if (grouping === 'city') return r.city;
    if (grouping === 'type') return r.type;
    return r.street + (grouping === 'house' ? ', ' + r.house : '') + ' · ' + r.city;
  }
  function snippet(r) {
    if (r.draft.text.trim() || r.draft.files.length) return 'Черновик · ' + (r.draft.text.trim() || r.draft.files[0].name);
    const m = r.messages.at(-1);
    if (!m) return 'Начать переписку';
    return (m.role === 'manager' ? 'Вы · ' : '') + (m.text || m.files[0].name);
  }
  const unreadBadge = n => n ? `<b class="v2-unread" aria-label="Непрочитанных сообщений: ${n}">${n}</b>` : '';
  function row(r, selected) {
    return `<a class="v2-chat-row" href="#chat-${r.id}" ${selected === r ? 'aria-current="page"' : ''}>
      <span class="v2-chat-address"><strong>${E(r.address.replace('ул. ', ''))}</strong><time>${r.messages.at(-1)?.time || ''}</time></span>
      <span class="v2-chat-type">№ ${r.id} · ${E(r.type)}</span>
      <span>${R.badge(r.status, r.tone)}</span>
      <span class="v2-snippet"><span data-snippet="${r.id}">${E(snippet(r))}</span>${unreadBadge(r.unread)}</span></a>`;
  }
  function listRows(selected) {
    const terms = query.toLocaleLowerCase('ru').trim().split(/[\s,№·]+/).filter(Boolean);
    const pool = dialogs.filter(r => (scope === 'archive' ? r.archive : !r.archive) && (scope !== 'unread' || r.unread) &&
      terms.every(t => [r.id, r.city, r.address, r.worker, r.type].join(' ').toLocaleLowerCase('ru').includes(t)))
      .sort((a, b) => {
        const left = a.messages.at(-1), right = b.messages.at(-1);
        return (right?.order || 0) - (left?.order || 0) || (right?.time || '').localeCompare(left?.time || '');
      });
    if (!pool.length) return `<div class="v2-empty-list"><strong>${query ? 'Чаты не найдены' : 'Всё прочитано'}</strong><p>${query ? 'Измените запрос или откройте другую вкладку.' : 'Новые сообщения появятся здесь.'}</p></div>`;
    if (grouping === 'none') return pool.map(r => row(r, selected)).join('');
    const grouped = new Map();
    for (const r of pool) {
      const key = groupName(r);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(r);
    }
    return [...grouped].map(([name, rows]) => `<details class="v2-group" data-chat-group="${E(name)}" ${!collapsed.has(name) || query ? 'open' : ''}><summary>${E(name)} <span>${rows.length}</span></summary>${rows.map(r => row(r, selected)).join('')}</details>`).join('');
  }
  function refreshList() {
    const list = document.getElementById('v2-rows');
    if (list) list.innerHTML = listRows(current());
    for (const tab of document.querySelectorAll('[data-chat-scope]')) tab.setAttribute('aria-pressed', String(scope === tab.dataset.chatScope));
    const count = document.querySelector('[data-unread-threads]');
    if (count) count.textContent = unreadCount() || '';
  }
  function sidebar(r) {
    return `<section class="v2-list" aria-label="Список чатов"><div class="v2-list-tools">
      <label class="v2-search">${R.icon('search')}<input type="search" data-chat-search value="${E(query)}" aria-label="Поиск чатов" placeholder="Адрес, заявка, исполнитель"></label>
      <div class="v2-scopes" role="group" aria-label="Подборка чатов">${Object.entries(scopes).map(([id, label]) => `<button data-chat-scope="${id}" aria-pressed="${scope === id}">${label}${id === 'unread' ? ` <span data-unread-threads>${unreadCount() || ''}</span>` : ''}</button>`).join('')}</div>
      <label class="v2-group-control"><span>${R.icon('filter')}Группировка</span><select data-grouping>${Object.entries(groups).map(([id, label]) => `<option value="${id}" ${grouping === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      </div><div id="v2-rows">${listRows(r)}</div></section>`;
  }
  function message(r, m) {
    if (m.role === 'event') return `<p class="v2-event">${R.icon('check')}${E(m.text)} · ${E(m.time)}</p>`;
    return `<article class="v2-message ${m.role === 'manager' ? 'v2-own' : ''}">
      <div class="v2-message-meta"><strong>${m.role === 'worker' ? E(r.worker) : 'Вы'}</strong><time>${E(m.time)}</time></div>
      ${m.text ? `<p>${E(m.text)}</p>` : ''}
      ${m.files.map(f => K.fileRow(r, f, m.role === 'worker')).join('')}</article>`;
  }
  function draftFiles(r) {
    return r.draft.files.map(f => `<div>${K.fileButton(r, f)}<button type="button" class="icon-button" data-drop="${f.id}" aria-label="Убрать ${E(f.name)}">${R.icon('close')}</button></div>`).join('');
  }
  function pendingBar(r) {
    const count = K.pending(r).length;
    if (!count) return '';
    const target = r.id === '10428' ? 'request-files' : K.cardId(r.id);
    return `<a href="#${target}" class="v2-incoming-link">${K.icon('inbox')}<span>Нераспределённые файлы</span><b>${count}</b>${R.icon('chevron')}</a>`;
  }
  function thread(r) {
    return `<section class="v2-thread" data-thread="${r.id}" aria-label="Переписка по заявке № ${r.id}">
      <header class="v2-thread-head"><div><a class="v2-back" href="#chats">‹ Все чаты</a>
        <h2>${E(r.address)}</h2><p>${E(r.worker)} · Исполнитель</p></div><a class="btn" href="#${K.cardId(r.id)}">Заявка № ${r.id} ${R.icon('arrow')}</a></header>
      <div data-chat-pending>${pendingBar(r)}</div>
      <div class="v2-log" role="log" aria-label="Сообщения"><div class="v2-log-date">3 ноября</div>${r.messages.map(m => message(r, m)).join('')}</div>
      <div class="v2-compose"><div class="v2-draft-files">${draftFiles(r)}</div><div class="v2-compose-row">
        <button class="icon-button" data-pick aria-label="Приложить файлы" title="Приложить файлы">${K.icon('clip')}</button><input type="file" data-chat-upload multiple hidden>
        <textarea rows="1" data-chat-text aria-label="Сообщение исполнителю" placeholder="Написать исполнителю…">${E(r.draft.text)}</textarea>
        <button class="btn primary" data-send aria-label="Отправить сообщение" title="Отправить сообщение" ${!r.draft.text.trim() && !r.draft.files.length ? 'disabled' : ''}>${K.icon('send')}<span>Отправить</span></button></div></div></section>`;
  }
  function workspace(r) {
    if (r) {
      r.unread = 0;
      if (r.archive) scope = 'archive';
      else if (scope === 'archive') scope = 'active';
    }
    return `<div class="v2-chats ${r ? 'v2-thread-open' : ''}">${sidebar(r)}${r ? thread(r) : `<section class="v2-pick-thread">${K.icon('chat')}<h2>Выберите чат</h2><p>Здесь появится переписка по заявке.</p></section>`}</div>`;
  }
  R.screen({id: 'chats', group: 'Чаты', title: 'Чаты заявок', subtitle: 'Переписка с исполнителями', render: () => workspace(null)});
  for (const r of dialogs) R.screen({id: 'chat-' + r.id, group: 'Чаты', title: 'Чат заявки № ' + r.id, subtitle: 'Переписка с исполнителями', render: () => workspace(r)});
  function refreshDraft(r) {
    document.querySelector('[data-send]').disabled = !r.draft.text.trim() && !r.draft.files.length;
    const label = document.querySelector(`[data-snippet="${r.id}"]`);
    if (label) label.textContent = snippet(r);
  }
  function send(r) {
    if (!r.draft.text.trim() && !r.draft.files.length) return;
    const m = { text: r.draft.text.trim(), files: r.draft.files, role: 'manager', order: ++order,
      time: new Date().toLocaleTimeString('ru', {hour: '2-digit', minute: '2-digit'}) };
    r.messages.push(m);
    r.draft = {text: '', files: []};
    const log = document.querySelector('.v2-log');
    log.insertAdjacentHTML('beforeend', message(r, m));
    log.scrollTop = log.scrollHeight;
    const editor = document.querySelector('[data-chat-text]');
    editor.value = '';
    document.querySelector('.v2-draft-files').replaceChildren();
    refreshList();
    refreshDraft(r);
    editor.focus();
  }
  document.addEventListener('input', event => {
    if (event.target.matches('[data-chat-search]')) { query = event.target.value; refreshList(); }
    if (event.target.matches('[data-chat-text]')) {
      const r = current();
      r.draft.text = event.target.value;
      refreshDraft(r);
    }
  });
  document.addEventListener('change', event => {
    if (event.target.matches('[data-grouping]')) {
      grouping = event.target.value;
      try { localStorage.setItem('kontur-web-chat-group', grouping); } catch {}
      refreshList();
    }
    if (event.target.matches('[data-chat-upload]')) {
      const r = current();
      r.draft.files.push(...Array.from(event.target.files, K.localFile));
      event.target.value = '';
      document.querySelector('.v2-draft-files').innerHTML = draftFiles(r);
      refreshDraft(r);
    }
  });
  document.addEventListener('toggle', event => {
    const key = event.target.dataset?.chatGroup;
    if (key && event.target.isConnected && !query) event.target.open ? collapsed.delete(key) : collapsed.add(key);
  }, true);
  document.addEventListener('click', event => {
    const tab = event.target.closest('[data-chat-scope]');
    if (tab) { scope = tab.dataset.chatScope; refreshList(); }
    const r = current();
    if (!r) return;
    if (event.target.closest('[data-pick]')) document.querySelector('[data-chat-upload]').click();
    if (event.target.closest('[data-send]')) send(r);
    const drop = event.target.closest('[data-drop]');
    if (drop) {
      const i = r.draft.files.findIndex(f => f.id === drop.dataset.drop);
      if (i < 0) return;
      URL.revokeObjectURL(r.draft.files.splice(i, 1)[0].url);
      document.querySelector('.v2-draft-files').innerHTML = draftFiles(r);
      refreshDraft(r);
      document.querySelector('[data-pick]').focus();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.target.matches('[data-chat-text]') && event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      send(current());
    }
  });
  document.addEventListener('v2:allocation', event => {
    const {record, file} = event.detail;
    if (current() !== record) return;
    const row = document.querySelector(`.v2-log [data-assign="${file.id}"]`).closest('.v2-file-row');
    row.outerHTML = K.fileRow(record, file);
    document.querySelector('[data-chat-pending]').innerHTML = pendingBar(record);
  });
  document.addEventListener('rd:render', () => {
    if (current()) {
      document.querySelector('.heading-copy h1').textContent = 'Чаты заявок';
      const log = document.querySelector('.v2-log');
      log.scrollTop = log.scrollHeight;
    }
  });
  K.unreadBadge = unreadBadge;
})();
