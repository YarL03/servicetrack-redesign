'use strict';
(() => {
  const K = Kontur;
  const options = {
    none: ['Без группировки', 'chat'],
    street: ['По улице', 'pin'],
    'street-house': ['По улице и дому', 'building'],
    city: ['По населённому пункту', 'grid'],
    type: ['По типу работ', 'meter'],
  };
  const opened = new Map();

  function describe(r, by) {
    if (by === 'type') return {parts: [r.type], title: r.type};
    if (by === 'city') return {parts: [r.city], title: r.city};
    if (by === 'street') return {parts: [r.city, r.street], title: r.street, city: r.city};
    return {parts: [r.city, r.street, r.house], title: `${r.street}, ${r.house}`, city: r.city};
  }

  K.chatGroups = {
    valid(value) {
      return Object.hasOwn(options, value);
    },
    control(label = 'Группировка') {
      return `<button class="chat-group-control" data-action="chat-group-menu" aria-haspopup="dialog">${K.icon('filter')}<span>${label}</span><strong>${options[K.state.chatGrouping][0]}</strong>${K.icon('down')}</button>`;
    },
    choices() {
      const choices = Object.entries(options).map(([key, [label, icon]]) => {
        const selected = K.state.chatGrouping === key;
        return `<button class="mode-choice" data-action="set-chat-group" data-chat-grouping="${key}" aria-pressed="${selected}">${K.icon(icon)}<span><strong>${label}</strong></span><i>${selected ? K.icon('check') : ''}</i></button>`;
      });
      return `<div class="mode-options">${choices.join('')}</div>`;
    },
    rows(rows, renderRow) {
      const s = K.state;
      const by = s.chatGrouping;
      if (by === 'none') return rows.map(renderRow).join('');
      const groups = new Map();
      const searching = s.screen === 'inbox' && !!s.inboxQuery.trim();
      const scope = s.screen === 'inbox' ? s.inboxFilter : 'chats';
      for (const r of rows) {
        const {parts, title, city} = describe(r, by);
        const key = JSON.stringify([scope, searching, by, ...parts]);
        if (!groups.has(key)) groups.set(key, {key, title, city, rows: []});
        groups.get(key).rows.push(r);
      }
      return [...groups.values()]
        .map((g, index) => {
          const open = opened.get(g.key) ?? (index === 0 || searching);
          return `<details class="chat-group" data-chat-group="${K.escape(g.key)}" ${open ? 'open' : ''}><summary><span class="group-symbol">${K.icon(options[by][1])}</span><span class="group-heading"><strong>${K.escape(g.title)}</strong>${g.city ? '<small>' + K.escape(g.city) + '</small>' : ''}</span><span class="group-count"><span class="sr-only">Чатов в группе: </span>${g.rows.length}</span>${K.icon('down')}</summary>${g.rows.map(renderRow).join('')}</details>`;
        })
        .join('');
    },
    remember(element) {
      opened.set(element.dataset.chatGroup, element.open);
    },
  };
})();
