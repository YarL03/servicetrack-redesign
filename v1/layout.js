/* Presentation enhancements for Kontur. Shared screens own the content. */
(() => {
  const compact = window.matchMedia('(max-width: 1199px)');
  let context;

  function groupNavigation() {
    const nav = document.querySelector('.main-nav');
    for (const [target, label] of [['dashboard', 'Работа'], ['users', 'Управление']]) {
      const heading = document.createElement('p');
      heading.className = 'nav-section';
      heading.textContent = label;
      nav.querySelector(`[href="#${target}"]`).before(heading);
    }
  }

  function composeRegistry() {
    if (document.body.dataset.screen !== 'requests') return;
    const page = document.querySelector('.page-content');
    const panel = page.querySelector(':scope > .panel');
    const head = panel.querySelector('.panel-head');
    const title = document.createElement('div');
    title.className = 'kontur-register-title';
    title.append(head.querySelector('h2'));
    const count = document.createElement('span');
    count.className = 'kontur-register-count';
    count.textContent = panel.querySelectorAll('tbody tr').length;
    count.setAttribute('aria-label', `${count.textContent} демонстрационных записей`);
    title.append(count);
    head.prepend(title);

    const actions = page.querySelector(':scope > .toolbar');
    actions.className = 'kontur-register-actions';
    actions.querySelector('.muted').remove();
    head.append(actions);
    const tools = document.createElement('div');
    tools.className = 'kontur-register-tools';
    tools.append(page.querySelector('.work-search-desktop'), page.querySelector('.work-search-mobile'));
    head.after(tools);
    panel.classList.add('kontur-register');
  }

  function composeContext() {
    context = null;
    const summary = document.querySelector('.request-summary');
    if (!summary) return;
    context = document.createElement('details');
    context.className = 'request-context';
    context.open = !compact.matches;
    const toggle = document.createElement('summary');
    toggle.className = 'request-context-toggle';
    const title = document.createElement('strong');
    title.textContent = 'Контекст заявки';
    const hint = document.createElement('span');
    hint.className = 'context-hint';
    hint.textContent = 'Срок, участники и действия';
    toggle.append(title, summary.querySelector('.badge').cloneNode(true), hint);
    summary.closest('.request-layout').prepend(context);
    context.append(toggle, summary);

    const rail = document.querySelector('.request-main > .work-stage-rail');
    if (rail) {
      rail.querySelector('.current')?.setAttribute('aria-current', 'step');
      const panel = document.createElement('section');
      panel.className = 'panel kontur-timeline';
      const head = document.createElement('div');
      head.className = 'panel-head';
      const heading = document.createElement('h2');
      heading.textContent = 'Этапы заявки';
      head.append(heading);
      panel.append(head, rail);
      const action = summary.querySelector('[data-action="modal:request-status"]');
      const footer = document.createElement('div');
      footer.className = 'kontur-timeline-action';
      footer.append(action);
      panel.append(footer);
      summary.prepend(panel);
    }
  }

  function updateLayout() {
    groupNavigation();
    composeRegistry();
    composeContext();
    document.querySelector('.mobile-nav .active')?.setAttribute('aria-current', 'page');
  }

  // Resize and theme changes keep draft values and existing DOM nodes intact.
  compact.addEventListener('change', () => {
    if (!context) return;
    const active = document.activeElement;
    context.open = !compact.matches;
    if (!context.open && context.contains(active)) context.querySelector('summary').focus();
  });
  window.addEventListener('beforeprint', () => {
    if (!context) return;
    context.dataset.openBeforePrint = String(context.open);
    context.open = true;
  });
  window.addEventListener('afterprint', () => {
    if (context) context.open = context.dataset.openBeforePrint === 'true';
  });
  document.addEventListener('rd:render', updateLayout);
})();
