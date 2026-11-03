/* Set the palette before styles paint; changing it never rerenders a form. */
(() => {
  const key = 'service-track-redesign-theme';
  const valid = value => value === 'dark' || value === 'light';
  const requested = new URLSearchParams(location.search).get('theme');
  let saved;
  try { saved = localStorage.getItem(key); } catch { /* file:// or private storage may be unavailable */ }
  let current = valid(requested) ? requested : valid(saved) ? saved : 'light';
  const icons = {
    dark: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    light: '<path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/>'
  };
  function syncControls() {
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const target = current === 'dark' ? 'светлую' : 'тёмную';
      button.setAttribute('aria-pressed', String(current === 'dark'));
      button.setAttribute('aria-label', 'Тёмная тема');
      button.title = `Включить ${target} тему`;
      button.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[current]}</svg>${button.classList.contains('gallery-theme-toggle') ? `<span data-theme-label>${current === 'dark' ? 'Тёмная тема' : 'Светлая тема'}</span>` : ''}`;
    });
    document.querySelectorAll('[data-theme-link]').forEach(link => {
      const url = new URL(link.getAttribute('href'), location.href);
      url.searchParams.set('theme', current);
      link.href = url.href;
    });
  }
  function apply() {
    document.documentElement.dataset.theme = current;
    document.documentElement.style.colorScheme = current;
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', current);
    try { localStorage.setItem(key, current); } catch { /* theme still works for this document */ }
    syncControls();
  }
  function set(value, {notifyParent = true} = {}) {
    if (!valid(value)) return;
    const changed = current !== value;
    current = value;
    apply();
    const url = new URL(location.href);
    url.searchParams.set('theme', current);
    try { history.replaceState(history.state, '', url.href); } catch { /* retain in-memory preference */ }
    if (changed) window.dispatchEvent(new CustomEvent('rd:themechange', {detail: {theme: current}}));
    if (notifyParent && window.parent !== window) window.parent.postMessage({type: 'rd:theme', theme: current}, '*');
  }
  window.RDTheme = {get: () => current, set, toggle: () => set(current === 'dark' ? 'light' : 'dark'), syncControls};
  apply();
  document.addEventListener('DOMContentLoaded', syncControls);
  document.addEventListener('click', event => {
    if (event.target.closest('[data-theme-toggle]')) window.RDTheme.toggle();
  });
  window.addEventListener('message', event => {
    if (window.parent !== window && event.source === window.parent && event.data?.type === 'rd:set-theme' && valid(event.data.theme)) set(event.data.theme, {notifyParent: false});
  });
})();
