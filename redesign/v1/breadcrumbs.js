/* Render accessible breadcrumb links only in the Kontur shell. */
(() => {
  document.addEventListener('rd:render', event => {
    const path = window.RD.konturBreadcrumbPath(event.detail.screen);
    const nav = document.createElement('nav');
    nav.className = 'breadcrumb';
    nav.setAttribute('aria-label', 'Хлебные крошки');
    const list = document.createElement('ol');
    path.forEach((item, index) => {
      const entry = document.createElement('li');
      if (index) {
        const separator = document.createElement('span');
        separator.className = 'breadcrumb-divider';
        separator.setAttribute('aria-hidden', 'true');
        separator.textContent = '/';
        entry.append(separator);
      }
      const current = index === path.length - 1;
      const label = document.createElement(current ? 'span' : 'a');
      label.textContent = item.label;
      if (current) label.setAttribute('aria-current', 'page');
      else label.href = `#${item.id}`;
      entry.append(label);
      list.append(entry);
    });
    nav.append(list);
    document.querySelector('.topbar .breadcrumb').replaceWith(nav);
  });
})();
