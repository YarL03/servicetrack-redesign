(() => {
  const screens = window.RD.screens;
  const params = new URLSearchParams(location.search);
  const mobile = matchMedia('(max-width: 767px)');
  const widths = [390, 768, 1024, 1440, 1920];
  const defaultWidth = mobile.matches ? 390 : innerWidth < 1200 ? 768 : 1440;
  const requestedWidth = Number(params.get('width'));
  let width = widths.includes(requestedWidth) ? requestedWidth : defaultWidth;
  let screen = screens.find(item => item.id === params.get('screen')) || screens.find(item => item.id === 'dashboard');

  const frame = document.getElementById('preview-frame');
  const stage = document.getElementById('preview-stage');
  const holder = document.getElementById('frame-holder');
  const nav = document.getElementById('screen-list');
  const search = document.getElementById('screen-search');
  const browseToggle = document.getElementById('browse-toggle');
  const widthButtons = document.querySelectorAll('[data-width]');
  const theme = () => window.RDTheme.get();
  const previewPage = document.getElementById('open-screen').getAttribute('href').split('#')[0];
  const screenUrl = () => `${previewPage}?theme=${theme()}#${screen.id}`;
  const catalogUrl = id => `?screen=${id}&width=${width}&theme=${theme()}`;

  const groups = [...new Set(screens.map(item => item.group))];
  nav.innerHTML = groups.map(group => {
    const links = screens.filter(item => item.group === group).map(item =>
      `<a data-screen="${item.id}">${RD.esc(item.title)}${item.kind === 'dialog' ? '<small>Диалог</small>' : ''}</a>`
    );
    return `<section class="screen-group"><h2>${RD.esc(group)}</h2>${links.join('')}</section>`;
  }).join('');
  const links = nav.querySelectorAll('[data-screen]');
  const sections = nav.querySelectorAll('.screen-group');

  function filterScreens() {
    const query = search.value.trim().toLocaleLowerCase('ru');
    let found = 0;
    for (const section of sections) {
      const group = section.querySelector('h2').textContent;
      let count = 0;
      for (const link of section.querySelectorAll('a')) {
        link.hidden = !`${group} ${link.textContent} ${link.dataset.screen}`.toLocaleLowerCase('ru').includes(query);
        if (!link.hidden) count++;
      }
      section.hidden = count === 0;
      found += count;
    }
    document.getElementById('screen-count').textContent = found === 0 ? 'Ничего не найдено. Измените запрос.' :
      query ? `Найдено ${found} из ${screens.length}` : `Экраны и состояния · ${screens.length}`;
  }

  function resize() {
    const scale = Math.min(1, stage.clientWidth / width);
    const height = width < 600 ? 844 : width < 900 ? 1024 : 960;
    frame.style.width = width + 'px';
    frame.style.height = height + 'px';
    frame.style.transform = `scale(${scale})`;
    holder.style.width = width * scale + 'px';
    holder.style.height = height * scale + 'px';
    document.getElementById('preview-scale').textContent = `${width} × ${height} · ${Math.round(scale * 100)}%`;
  }

  function syncSelection() {
    document.getElementById('preview-title').textContent = screen.title;
    document.getElementById('preview-group').textContent = screen.group;
    document.getElementById('open-screen').href = screenUrl();
    for (const link of links) {
      link.href = catalogUrl(link.dataset.screen);
      if (link.dataset.screen === screen.id) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    for (const button of widthButtons) button.setAttribute('aria-pressed', String(Number(button.dataset.width) === width));
    try { history.replaceState(null, '', catalogUrl(screen.id)); } catch { /* Браузер может ограничить изменение локального URL. */ }
  }

  function syncTheme() {
    frame.dataset.theme = theme();
    frame.contentWindow?.postMessage({type: 'rd:set-theme', theme: theme()}, '*');
    syncSelection();
  }

  function setBrowserOpen(open) {
    browseToggle.setAttribute('aria-expanded', String(open));
    browseToggle.textContent = open ? 'Закрыть список' : 'Выбрать экран';
  }
  browseToggle.addEventListener('click', () => {
    const open = browseToggle.getAttribute('aria-expanded') !== 'true';
    setBrowserOpen(open);
    if (open) search.focus();
  });
  search.addEventListener('input', filterScreens);
  nav.addEventListener('click', event => {
    const link = event.target.closest('[data-screen]');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const next = screens.find(item => item.id === link.dataset.screen);
    if (next !== screen) {
      screen = next;
      frame.src = screenUrl();
      syncSelection();
    }
    if (mobile.matches) {
      setBrowserOpen(false);
      browseToggle.focus();
    }
  });
  for (const button of widthButtons) button.addEventListener('click', () => {
    width = Number(button.dataset.width);
    resize();
    syncSelection();
  });
  frame.addEventListener('load', syncTheme);
  window.addEventListener('rd:themechange', syncTheme);
  window.addEventListener('message', event => {
    if (event.source !== frame.contentWindow) return;
    if (event.data?.type === 'rd:theme') window.RDTheme.set(event.data.theme, {notifyParent: false});
    if (event.data?.type === 'rd:screen') {
      const current = screens.find(item => item.id === event.data.screen);
      if (current && current !== screen) {
        screen = current;
        syncSelection();
      }
    }
  });
  new ResizeObserver(resize).observe(stage);
  filterScreens();
  syncSelection();
  frame.src = screenUrl();
})();
