'use strict';
(() => {
  const K = Kontur;
  const modes = {city: 'По населённому пункту', street: 'По улице', 'street-house': 'По улице и дому'};
  const levels = {city: ['city'], street: ['city', 'street'], 'street-house': ['city', 'street', 'house']};
  const opened = new Map();
  const compare = new Intl.Collator('ru', {numeric: true}).compare;

  function requestRow(r, mode, all) {
    const address =
      mode === 'city'
        ? K.address(r)
        : mode === 'street'
          ? `Дом ${r.house} · кв. ${r.apartment}`
          : `Квартира ${r.apartment}`;
    return `<a class="apartment-row ${r.status === 'IN_PROGRESS' ? 'current' : ''}" href="${K.href('detail', r.id)}"><span class="grow"><strong class="street-request-address">${K.escape(address)}</strong><p>${K.escape(r.type)} · № ${r.id}</p>${K.badge(r)}${all && !r.mine ? '<small class="registry-owner">Ожидает исполнителя</small>' : ''}</span>${K.icon('chevron')}</a>`;
  }

  function branches(rows, mode, all, path = []) {
    const level = levels[mode][path.length];
    if (!level) return rows.map((r) => requestRow(r, mode, all)).join('');
    const groups = new Map();
    for (const r of rows) {
      const name = r[level];
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(r);
    }
    return Array.from(groups, ([name, members], i) => {
      const parts = [...path, name];
      const key = JSON.stringify([all, mode, ...parts]);
      const open = opened.get(key) ?? i === 0;
      const title = level === 'house' ? 'Дом ' + name : name;
      const icon = {city: 'pin', street: 'list', house: 'building'}[level];
      return `<details class="address-branch address-${level}" data-address-group="${K.escape(key)}" ${open ? 'open' : ''}><summary><span class="address-symbol">${K.icon(icon)}</span><strong>${K.escape(title)}</strong><span class="address-count"><span class="sr-only">Заявок: </span>${members.length}</span>${K.icon('down')}</summary><div class="address-children">${branches(members, mode, all, parts)}</div></details>`;
    }).join('');
  }

  K.requestAddresses = {
    valid: (value) => Object.hasOwn(modes, value),
    remember: (element) => opened.set(element.dataset.addressGroup, element.open),
    render(rows, all) {
      const mode = K.state.addressGrouping;
      const sorted = [...rows].sort(
        (a, b) =>
          compare(a.city, b.city) ||
          compare(a.street, b.street) ||
          compare(a.house, b.house) ||
          compare(a.apartment, b.apartment) ||
          a.id - b.id,
      );
      const options = Object.entries(modes)
        .map(
          ([key, label]) =>
            `<button data-action="set-address-grouping" data-grouping="${key}" aria-pressed="${mode === key}">${label}</button>`,
        )
        .join('');
      return (
        `<div class="address-grouping"><p id="address-grouping-label">Группировка заявок</p><div class="address-grouping-options" role="group" aria-labelledby="address-grouping-label">${options}</div></div><div class="section-label"><span>Населённые пункты</span><small>Заявок: ${rows.length}</small></div>` +
        (rows.length
          ? branches(sorted, mode, all)
          : K.notice('Заявок пока нет', 'Здесь появятся адреса заявок.', 'info', 'list'))
      );
    },
  };
})();
