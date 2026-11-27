/* Dependency-free Chrome DevTools Protocol validation of the local mockups. */
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname, '..');
const browserPath = process.env.REDESIGN_BROWSER || '/home/yaroslav/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const full = process.argv.includes('--full');
const pictures = process.argv.includes('--screenshots');
const captureOnly = process.argv.includes('--capture-only');
const variantArg = process.argv.find(arg => arg.startsWith('--variant='))?.slice('--variant='.length);
if (variantArg && variantArg !== 'v1') throw new Error('Use --variant=v1');
const variants = ['v1'];
const captureScreens = ['dashboard', 'requests', 'request-object', 'work-builder'];
const themeArg = process.argv.find(arg => arg.startsWith('--theme='));
const theme = themeArg ? themeArg.slice('--theme='.length) : 'light';
if (!['light', 'dark'].includes(theme)) throw new Error('Use --theme=light or --theme=dark');
const otherTheme = theme === 'dark' ? 'light' : 'dark';
const reportPrefix = 'v1-' + (theme === 'dark' ? 'dark-' : '');
const screenshotDirectory = theme === 'dark' ? 'previews/dark' : 'previews';
const chrome = spawn(browserPath, ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-pipe', `--user-data-dir=/tmp/service-track-redesign-qa-${process.pid}`], {stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe']});
let sequence = 0, buffer = '', stderr = '';
const pending = new Map();
const exceptions = [];
chrome.stderr.on('data', b => stderr += b.toString());
chrome.on('error', e => { console.error(e); process.exitCode = 1; });
for (const pipe of [chrome.stdio[3], chrome.stdio[4]]) pipe.on('error', e => {
  for (const item of pending.values()) {
    clearTimeout(item.timer);
    item.reject(new Error('Chromium pipe failed: ' + e.message + ' ' + stderr.slice(-1500)));
  }
  pending.clear();
});
chrome.stdio[4].on('data', chunk => {
  buffer += chunk.toString();
  let n;
  while ((n = buffer.indexOf('\0')) >= 0) {
    const s = buffer.slice(0, n);
    buffer = buffer.slice(n + 1);
    if (!s) continue;
    const m = JSON.parse(s);
    if (m.id && pending.has(m.id)) {
      const {resolve, reject, timer} = pending.get(m.id);
      clearTimeout(timer);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  }
});
function call(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout ${method}\n${stderr.slice(-2000)}`)); }, 15000);
    pending.set(id, {resolve, reject, timer});
    chrome.stdio[3].write(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}) + '\0');
  });
}
let session;
const c = (method, params) => call(method, params, session);
async function evaluate(expression, contextId) {
  const result = await c('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true, ...(contextId ? {contextId} : {})});
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function settle() { await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'); }
async function waitForCondition(expression, contextId) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if (await evaluate(expression, contextId)) return true; }
    catch { return false; } // A destroyed frame context also proves an unwanted reload.
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  return false;
}
async function previewExecutionContext() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const {frameTree} = await c('Page.getFrameTree');
    const preview = frameTree.childFrames?.find(item => item.frame.url.includes('/v1/index.html'));
    if (preview) {
      const {executionContextId} = await c('Page.createIsolatedWorld', {frameId: preview.frame.id, worldName: 'redesign-theme-qa'});
      if (await waitForCondition(`document.readyState==='complete'&&document.body?.dataset.screen==='request-object'`, executionContextId)) return executionContextId;
    }
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error('Preview iframe did not finish loading');
}

async function navigate(url) {
  await c('Page.navigate', {url});
  for (let i = 0; i < 100; i++) {
    await new Promise(resolve => setTimeout(resolve, 30));
    if (await evaluate('document.readyState === "complete" && Boolean(window.RD) && Boolean(window.RDTheme)')) {
      await settle();
      return;
    }
  }
  throw new Error('Page not ready ' + url);
}
async function size(width) {
  await c('Emulation.setDeviceMetricsOverride', {width, height: width < 600 ? 844 : 960, deviceScaleFactor: 1, mobile: false});
  await settle();
}
async function screen(id) {
  await evaluate(`RD.render(${JSON.stringify(id)})`);
  const actual = await evaluate('document.body.dataset.screen');
  if (actual !== id) throw new Error(`Expected ${id}, got ${actual}`);
}
async function dragBuilderRow(kind, from, to, {touch = false, cancel = false, gap = false} = {}) {
  const [start, end] = await evaluate(`(() => {
    const rows = document.querySelectorAll('[data-builder-list="${kind}"] > [data-builder-index]');
    rows[${from}].scrollIntoView({block:'center'});
    const points = [rows[${from}].querySelector('.admin-drag'), rows[${to}]].map(node => {
      const r = node.getBoundingClientRect();
      return {x:r.left + r.width / 2, y:r.top + r.height / 2};
    });
    if (${gap}) {
      const before = rows[${to} - 1].getBoundingClientRect();
      points[1].y = (before.bottom + rows[${to}].getBoundingClientRect().top) / 2;
    }
    return points;
  })()`);
  if (touch) {
    await c('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[start]});
    await c('Input.dispatchTouchEvent', {type:'touchMove', touchPoints:[end]});
    await c('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]});
  } else {
    await c('Input.dispatchMouseEvent', {type:'mousePressed', button:'left', buttons:1, clickCount:1, ...start});
    await c('Input.dispatchMouseEvent', {type:'mouseMoved', button:'left', buttons:1, ...end});
    if (cancel) await c('Input.dispatchKeyEvent', {type:'keyDown', key:'Escape', code:'Escape', windowsVirtualKeyCode:27});
    await c('Input.dispatchMouseEvent', {type:'mouseReleased', button:'left', clickCount:1, ...end});
  }
  await settle();
}
async function capture(file) {
  await settle();
  await new Promise(resolve => setTimeout(resolve, 100));
  const data = await c('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false});
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, Buffer.from(data.data, 'base64'));
}
function localUrl(file, selectedTheme = theme, hash = '') {
  const url = pathToFileURL(path.join(root, file));
  if (selectedTheme) url.searchParams.set('theme', selectedTheme);
  if (hash) url.hash = hash;
  return url.href;
}
// Сравниваем центр самого поля с центром соседнего действия только в общей строке.
function measureControlAlignment(scope) {
  let pairs = 0;
  const failures = [];
  for (const field of scope.querySelectorAll('.field')) {
    const control = field.querySelector('input,select');
    if (!control?.checkVisibility()) continue;
    const bounds = field.getBoundingClientRect();
    const input = control.getBoundingClientRect();
    const neighbors = field.parentElement.querySelectorAll(
      ':scope > .btn, :scope > .actions > .btn, :scope > .admin-field-action > .btn, :scope > .admin-search input, :scope > .checkbox input'
    );
    for (const neighbor of neighbors) {
      if (!neighbor.checkVisibility()) continue;
      const other = neighbor.getBoundingClientRect();
      if (other.bottom <= bounds.top || other.top >= bounds.bottom) continue;
      if (other.left < input.right && other.right > input.left) continue;
      pairs++;
      const delta = (other.top + other.bottom - input.top - input.bottom) / 2;
      if (Math.abs(delta) > 0.5) failures.push({field: field.textContent.trim(), action: neighbor.textContent.trim() || neighbor.type, delta});
    }
  }
  return {pairs, failures};
}

// Broad color regression guard: deliberately not a WCAG/alpha-compositing scanner.
// It catches forgotten white panels/native fields without classifying media colors.
const darkColorCheck = `(() => {
  const brightness = value => {
    const parts = value.match(/[\\d.]+/g)?.map(Number);
    if (!parts || parts.length < 3 || (parts.length > 3 && parts[3] < .8)) return null;
    return (parts[0] * .2126 + parts[1] * .7152 + parts[2] * .0722) / 255;
  };
  const background = node => {
    for (let current = node; current; current = current.parentElement) {
      const value = brightness(getComputedStyle(current).backgroundColor);
      if (value !== null) return value;
    }
    return 1;
  };
  const visible = node => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const failures = [];
  const bodyStyle = getComputedStyle(document.body);
  if (background(document.body) > .45) failures.push({element:'body',problem:'light background',color:bodyStyle.backgroundColor});
  if (brightness(bodyStyle.color) < .55) failures.push({element:'body',problem:'dark text',color:bodyStyle.color});
  const scope = document.getElementById('modal')?.open ? document.getElementById('modal') : document.querySelector('main');
  for (const node of [...scope.querySelectorAll('.panel, input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]), select, textarea')].filter(visible)) {
    const style = getComputedStyle(node);
    if (background(node) > .5) failures.push({element:node.tagName.toLowerCase()+'.'+node.className,problem:'light surface',color:style.backgroundColor});
    if (brightness(style.color) !== null && brightness(style.color) < .45) failures.push({element:node.tagName.toLowerCase()+'.'+node.className,problem:'dark foreground',color:style.color});
  }
  return failures;
})()`;

(async () => {
  const target = await call('Target.createTarget', {url: 'about:blank'});
  session = (await call('Target.attachToTarget', {targetId: target.targetId, flatten: true})).sessionId;
  await c('Page.enable');
  await c('Runtime.enable');
  await c('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: 'reduce'}]});
  const report = {theme, variants, alignmentPairs: 0, modalChecks: 0, modalFailures: [], colorChecks: 0, colorFailures: [], date: new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Irkutsk'}).format(new Date()), browser: await call('Browser.getVersion'), mode: captureOnly ? 'capture' : full ? 'full' : 'quick', checks: 0, widths: captureOnly ? [390, 768, 1024, 1440, 1920] : full ? [320, 390, 599, 600, 768, 899, 900, 1024, 1199, 1200, 1440, 1535, 1536, 1920] : [390, 1440], screens: [], failures: [], interactions: [], screenshots: []};
  const allSizes = captureOnly ? [390, 768, 1024, 1440, 1920] : report.widths;
  const interaction = async (variant, check, expression) => report.interactions.push({...(variant ? {variant} : {}), check, pass: Boolean(await evaluate(expression))});
  for (const variant of variants) {
    await size(1440);
    await navigate(localUrl(`${variant}/index.html`));
    await interaction(variant, 'explicit theme query applies on load', `document.documentElement.dataset.theme===${JSON.stringify(theme)}&&RDTheme.get()===${JSON.stringify(theme)}`);
    const all = await evaluate('RD.screens.map(({id,title,group,kind})=>({id,title,group,kind}))');
    if (!report.screens.length) report.screens = all;
    const variantCaptures = variant === 'v1' ? [...captureScreens, 'request'] : captureScreens;
    const ids = captureOnly ? variantCaptures : full ? all.map(item => item.id) : [...variantCaptures, 'users', 'profile', 'tariffs', 'registration'];
    for (const width of allSizes) {
      await size(width);
      for (const id of ids) {
        const errorsBefore = exceptions.length;
        await screen(id);
        const state = await evaluate(`(() => {
          const missing = [...document.querySelectorAll('a[href^="#"],[data-action]')].flatMap(el => {
            const a = el.getAttribute('href')?.slice(1) || el.dataset.action?.match(/^(?:go|modal):(.+)$/)?.[1];
            return a && a !== 'main-content' && !RD.screens.some(s => s.id === a) ? [a] : [];
          });
          const bad = [...document.querySelectorAll('main button,main input,main select,main textarea')].filter(el => {
            const r = el.getBoundingClientRect();
            return r.width && r.right > innerWidth + 2 && !el.closest('.table-wrap,.tabs');
          }).map(el => el.outerHTML.slice(0, 180));
          const breadcrumb = [];
          if (document.body.dataset.variant === 'v1') {
            const nav = document.querySelector('nav.breadcrumb[aria-label]');
            const items = nav?.querySelectorAll('ol > li') || [];
            const current = nav?.querySelectorAll('[aria-current="page"]') || [];
            if (!items.length || current.length !== 1 || !current[0]?.matches('span') || !items[items.length - 1]?.contains(current[0])) breadcrumb.push('current page must be the last, non-interactive item');
            if (nav?.querySelectorAll('a[href]').length !== items.length - 1) breadcrumb.push('every ancestor must be a link');
            const links = [...(nav?.querySelectorAll('a') || [])].map(a => a.hash.slice(1));
            if (links.includes(document.body.dataset.screen) || new Set(links).size !== links.length) breadcrumb.push('duplicate or self link');
            for (const node of nav?.querySelectorAll('a, [aria-current]') || []) {
              const rect = node.getBoundingClientRect();
              const header = nav.closest('.topbar').getBoundingClientRect();
              if (!rect.width || !rect.height || rect.left < -1 || rect.right > innerWidth + 1 || rect.top < header.top || rect.bottom > header.bottom + 1 || node.scrollWidth > node.clientWidth + 1) breadcrumb.push('hidden or clipped label: ' + node.textContent);
            }
          }
          return {alignment: (${measureControlAlignment})(document.querySelector('main')),theme:document.documentElement.dataset.theme,overflow:document.documentElement.scrollWidth>innerWidth+2,documentWidth:document.documentElement.scrollWidth,missing:[...new Set(missing)],bad,breadcrumb,heading:document.querySelector('h1')?.textContent,body:document.querySelector('.page-content')?.innerText.length};
        })()`);
        report.checks++;
        report.alignmentPairs += state.alignment.pairs;
        if (state.alignment.failures.length || state.theme !== theme || state.overflow || state.missing.length || state.bad.length || state.breadcrumb.length || !state.heading || !state.body || exceptions.length > errorsBefore) report.failures.push({variant, width, id, ...state, exceptions: exceptions.slice(errorsBefore)});
        if (theme === 'dark') {
          const colors = await evaluate(darkColorCheck);
          report.colorChecks++;
          if (colors.length) report.colorFailures.push({variant, width, id, colors});
        }
        if (pictures && [390, 768, 1024, 1440, 1920].includes(width) && variantCaptures.includes(id)) {
          const file = `${variant}/${screenshotDirectory}/${id}-${width}.png`;
          await capture(path.join(root, file));
          report.screenshots.push(file);
        }
      }
      console.log(`${variant} · ${theme} · ${width}px · ${ids.length} screens checked`);
    }
    if (variant === 'v1') {
      const breadcrumbCases = [
        ['settings', ['Рабочее пространство', 'Настройки']],
        ['user-edit', ['Рабочее пространство', 'Пользователи', 'Смирнов Александр Андреевич']],
        ['user-create', ['Рабочее пространство', 'Пользователи', 'Добавление пользователя']],
        ['user-address', ['Рабочее пространство', 'Пользователи', 'Смирнов Александр Андреевич', 'Домашний адрес']],
        ['request', ['Рабочее пространство', 'Заявки', 'Заявка № 10428']],
        ['request-object-edit', ['Рабочее пространство', 'Заявки', 'Заявка № 10428', 'Информация об объекте', 'Рабочие данные']],
        ['company', ['Рабочее пространство', 'Заказчики', 'АО «Городские сети»']],
        ['contact-edit', ['Рабочее пространство', 'Заказчики', 'АО «Городские сети»', 'Морозова Елена Сергеевна']],
        ['contract-documents', ['Рабочее пространство', 'Контракты', 'Контракт ЭС-2026/048', 'Документы контракта']],
        ['work-builder', ['Рабочее пространство', 'Справочники', 'Виды работ', 'Замена прибора учёта', 'Конструктор рабочих форм']],
        ['import-result', ['Рабочее пространство', 'Настройки', 'Импорт устройств', 'Результаты: devices_november.xlsx']]
      ];
      for (const [id, labels] of breadcrumbCases) {
        await screen(id);
        await interaction(variant, 'breadcrumb identifies ' + id, `JSON.stringify([...document.querySelectorAll('.breadcrumb li > a, .breadcrumb li > [aria-current]')].map(node=>node.textContent))===${JSON.stringify(JSON.stringify(labels))}`);
      }
      await size(390);
      await navigate(localUrl('v1/index.html', theme, 'user-edit'));
      await interaction(variant, 'direct user URL includes full name', `document.querySelector('.breadcrumb [aria-current]').textContent==='Смирнов Александр Андреевич'`);
      await evaluate(`document.querySelector('.breadcrumb a[href="#users"]').focus()`);
      await c('Input.dispatchKeyEvent', {type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13});
      await c('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13});
      await waitForCondition(`document.body.dataset.screen==='users'`);
      await interaction(variant, 'breadcrumb keyboard link returns to users', `location.hash==='#users'&&document.body.dataset.screen==='users'&&document.querySelector('.breadcrumb [aria-current]').textContent==='Пользователи'`);
      await evaluate('history.back()');
      await waitForCondition(`document.body.dataset.screen==='user-edit'`);
      await interaction(variant, 'browser back restores user breadcrumb', `document.body.dataset.screen==='user-edit'&&document.querySelector('.breadcrumb [aria-current]').textContent==='Смирнов Александр Андреевич'`);
      await navigate(localUrl('v1/index.html', theme, 'request-object-edit'));
      const requestLink = await evaluate(`(() => {const r=document.querySelector('.breadcrumb a[href="#request"]').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
      await c('Input.dispatchMouseEvent', {type: 'mousePressed', button: 'left', clickCount: 1, ...requestLink});
      await c('Input.dispatchMouseEvent', {type: 'mouseReleased', button: 'left', clickCount: 1, ...requestLink});
      await waitForCondition(`document.body.dataset.screen==='request'`);
      await interaction(variant, 'breadcrumb click returns to request and retains theme', `location.hash==='#request'&&document.body.dataset.screen==='request'&&document.querySelector('.breadcrumb [aria-current]').textContent==='Заявка № 10428'&&RDTheme.get()===${JSON.stringify(theme)}`);
      await evaluate(`document.querySelector('.breadcrumb a[href="#dashboard"]').click()`);
      await waitForCondition(`document.body.dataset.screen==='dashboard'`);
      await interaction(variant, 'workspace breadcrumb opens overview without a self link', `location.hash==='#dashboard'&&document.body.dataset.screen==='dashboard'&&document.querySelector('.breadcrumb [aria-current]').textContent==='Рабочее пространство'&&!document.querySelector('.breadcrumb a')`);
      await size(390);
      await screen('request-object-edit');
      await interaction(variant, 'compact context follows reading order above working data', `!document.querySelector('.request-context').open&&document.querySelector('.request-layout').firstElementChild.matches('.request-context')&&document.querySelector('.request-context').getBoundingClientRect().top<document.querySelector('.request-main').getBoundingClientRect().top`);
      await evaluate(`document.querySelector('.request-context-toggle').focus();window.__qaDraft=document.querySelector('.request-main input:not([readonly])');window.__qaDraft.value='0123456789'`);
      await settle();
      await interaction(variant, 'context summary receives keyboard focus', `document.activeElement.matches('.request-context-toggle')`);
      await c('Input.dispatchKeyEvent', {type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});
      await c('Input.dispatchKeyEvent', {type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      await settle();
      await interaction(variant, 'context opens from keyboard', `document.querySelector('.request-context').open`);
      await evaluate(`const action=document.querySelector('.request-context [data-action="modal:request-status"]');action.focus();action.click()`);
      await interaction(variant, 'context action opens status dialog', `document.getElementById('modal').open&&document.getElementById('modal').contains(document.activeElement)`);
      await evaluate('RD.closeModal()');
      await interaction(variant, 'context dialog returns keyboard focus', `document.activeElement.dataset.action==='modal:request-status'`);
      await size(1440);
      await interaction(variant, 'desktop exposes context and retains draft', `document.querySelector('.request-context').open&&window.__qaDraft.isConnected&&window.__qaDraft.value==='0123456789'`);
      await size(390);
      await interaction(variant, 'compact resize returns focus to visible summary', `!document.querySelector('.request-context').open&&document.activeElement.matches('.request-context-toggle')&&window.__qaDraft.value==='0123456789'`);
      await evaluate(`window.dispatchEvent(new Event('beforeprint'))`);
      await interaction(variant, 'print includes collapsed context', `document.querySelector('.request-context').open`);
      await evaluate(`window.dispatchEvent(new Event('afterprint'))`);
      await interaction(variant, 'print restores disclosure state', `!document.querySelector('.request-context').open`);
      await screen('request');
      await interaction(variant, 'timeline preserves five steps and current state', `document.querySelectorAll('.work-stage-rail li').length===5&&document.querySelector('.work-stage-rail [aria-current="step"]').textContent.includes('Выполняется')`);
      await screen('requests');
      await interaction(variant, 'registry preserves records and filter controls', `document.querySelectorAll('.kontur-register tbody tr').length===6&&document.querySelector('.kontur-register-count').textContent==='6'&&document.querySelectorAll('.kontur-register [data-action="modal:request-filter"]').length===2`);
      await evaluate(`document.querySelector('.work-search-mobile [data-action="modal:request-filter"]').click()`);
      await interaction(variant, 'registry filter opens from its new location', `document.getElementById('modal').open`);
      await evaluate('RD.closeModal()');
    }
    await size(1440);
    await screen('report-dynamic');
    const periodRow = "document.querySelector('main .toolbar')";
    await interaction(variant, 'report action centers on all three controls', `(() => {
      const row = ${periodRow};
      const result = (${measureControlAlignment})(row);
      return result.pairs === 3 && result.failures.length === 0;
    })()`);
    if (pictures) {
      const file = `v1/${screenshotDirectory}/report-dynamic-1440.png`;
      await capture(path.join(root, file));
      report.screenshots.push(file);
    }
    await evaluate(`${periodRow}.querySelector('.field > span').style.maxWidth='4ch'; ${periodRow}.querySelector('button').click()`);
    await interaction(variant, 'wrapped label keeps report action aligned and clickable', `(() => {
      const row = ${periodRow};
      const label = row.querySelector('.field > span');
      const result = (${measureControlAlignment})(row);
      return label.offsetHeight > parseFloat(getComputedStyle(label).lineHeight) && result.pairs === 3 &&
        !result.failures.length && document.getElementById('toast').textContent.includes('Сводная таблица обновлена');
    })()`);
    await size(390);
    await screen('dashboard');
    await interaction(variant, 'mobile filters summarize the selection', `!document.querySelector('.dashboard-filter-panel').open && document.querySelector('.filter-selection').textContent.includes('Неделя')`);
    await evaluate(`document.querySelector('.dashboard-filter-panel summary').click();const period=document.querySelectorAll('.dashboard-filters select')[1];period.value='Месяц';period.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.dashboard-filter-panel summary').click()`);
    await size(1440);
    await interaction(variant, 'desktop exposes selected filters after resize', `document.querySelector('.dashboard-filter-panel').open && document.querySelectorAll('.dashboard-filters select')[1].value==='Месяц' && document.querySelector('.filter-selection').textContent.includes('Месяц')`);
    await evaluate(`document.querySelector('.movement-values summary').click()`);
    await interaction(variant, 'daily values available as a table', `document.querySelector('.movement-values').open && document.querySelectorAll('.movement-values tbody tr').length===7`);
    await size(390);
    await screen('requests');
    await evaluate(`document.querySelector('.menu-button').click()`);
    await settle();
    await interaction(variant, 'mobile drawer', `document.body.classList.contains('menu-open')&&document.querySelector('.sidebar').getBoundingClientRect().left>=-1&&document.activeElement.matches('.menu-close')&&document.querySelector('.workspace-main').inert`);
    await evaluate(`document.querySelector('.main-nav a[href="#users"]').click()`);
    await settle();
    await interaction(variant, 'navigation closes drawer', `location.hash==='#users'&&!document.body.classList.contains('menu-open')`);
    await evaluate(`RD.openModal('user-create')`);
    await interaction(variant, 'modal opens and focuses', `document.getElementById('modal').open&&document.getElementById('modal').contains(document.activeElement)`);
    await c('Input.dispatchKeyEvent', {type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27});
    await c('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27});
    await settle();
    await interaction(variant, 'Escape closes dialog', `!document.getElementById('modal').open`);
    await screen('requests');
    await evaluate(`document.querySelector('.skip-link').click()`);
    await interaction(variant, 'skip link focuses main content', `document.activeElement.id==='main-content'&&document.body.dataset.screen==='requests'`);
    await screen('work-builder');
    await size(1440);
    await evaluate(`document.querySelector('[data-admin="builder-select:1"]').click();
      const value = document.querySelector('[data-builder-extra="defaultValue"]');
      value.value='42'; value.dispatchEvent(new Event('input',{bubbles:true}));`);
    const groupTitles = `[...document.querySelectorAll('.builder-field-select strong')].map(el=>el.textContent).join('|')`;
    const stepTitles = `[...document.querySelectorAll('.admin-step-number + span')].map(el=>el.textContent).join('|')`;
    const retained = `document.querySelector('[data-builder-title]').value==='Выполнение работ' &&
      document.querySelector('[data-builder-field-title]').value==='Показания прибора' &&
      document.querySelector('[data-builder-extra="defaultValue"]').value==='42'`;
    await dragBuilderRow('group', 2, 0);
    await interaction(variant, 'group grip inserts across two positions and keeps edited group', `${groupTitles}==='Комментарий|Показания прибора|Фото установки' && ${retained} && !document.querySelector('.admin-builder-fields svg')`);
    await dragBuilderRow('step', 2, 0);
    await interaction(variant, 'stage grip reorders entire stages and keeps selected group', `${stepTitles}==='Документы|Исходные данные|Выполнение работ' && ${retained}`);
    await dragBuilderRow('step', 0, 2, {cancel:true});
    await interaction(variant, 'Escape cancels drag and clears drop marker', `${stepTitles}==='Документы|Исходные данные|Выполнение работ' && !document.querySelector('[data-drop], .builder-drag-preview, .dragging')`);
    await size(390);
    await c('Emulation.setTouchEmulationEnabled', {enabled:true, maxTouchPoints:1});
    await dragBuilderRow('step', 0, 2, {touch:true});
    await dragBuilderRow('group', 0, 2, {touch:true});
    await c('Emulation.setTouchEmulationEnabled', {enabled:false});
    await interaction(variant, 'touch grips reorder stages and groups on phone', `${stepTitles}==='Исходные данные|Выполнение работ|Документы' && ${groupTitles}==='Показания прибора|Фото установки|Комментарий' && ${retained}`);
    await evaluate(`document.querySelector('[data-admin="builder-field-move:1"]').focus()`);
    await c('Input.dispatchKeyEvent', {type:'keyDown', key:'Enter', code:'Enter', text:'\r', windowsVirtualKeyCode:13});
    await c('Input.dispatchKeyEvent', {type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13});
    await interaction(variant, 'keyboard move keeps focus and group properties', `${groupTitles}==='Фото установки|Показания прибора|Комментарий' && document.activeElement.dataset.admin==='builder-field-move:1' && ${retained}`);
    await size(768);
    await dragBuilderRow('step', 2, 0);
    await interaction(variant, 'tablet stage grip works across columns', `${stepTitles}==='Документы|Исходные данные|Выполнение работ' && ${retained}`);
    await size(1440);
    await dragBuilderRow('group', 0, 2, {gap:true});
    await interaction(variant, 'drop in gap inserts between groups', `${groupTitles}==='Показания прибора|Фото установки|Комментарий' && ${retained}`);
    await interaction(variant, 'stage titles fit beside grip', `[...document.querySelectorAll('.admin-step-number + span')].every(label => label.scrollWidth <= label.clientWidth + 1 && label.getBoundingClientRect().right <= label.closest('.admin-builder-step').getBoundingClientRect().right)`);
    const before = await evaluate(`document.querySelectorAll('.admin-builder-step').length`);
    await evaluate(`document.querySelector('[data-admin="builder-add-step"]').click()`);
    await interaction(variant, 'builder adds stage', `document.querySelectorAll('.admin-builder-step').length===${before + 1}`);
    await evaluate(`document.querySelector('[data-admin="builder-add-field"]').click()`);
    await interaction(variant, 'builder adds field group', `document.querySelectorAll('.admin-builder-field').length===1`);
    await evaluate(`document.querySelector('[data-admin="builder-remove-step"]').click()`);
    if (full) {
      for (const width of [320, 1440]) {
        await size(width);
        for (const item of all.filter(screen => screen.kind === 'dialog')) {
          await evaluate(`RD.openModal(${JSON.stringify(item.id)})`);
          const bad = await evaluate(`(() => {const d=document.getElementById('modal'),r=d.getBoundingClientRect();return [...d.querySelectorAll('button,input,select,textarea')].filter(e=>{const x=e.getBoundingClientRect();return x.width&&(x.right>r.right+2||x.left<r.left-2)&&!e.closest('.table-wrap,.tabs')}).map(e=>e.outerHTML.slice(0,180));})()`);
          report.modalChecks++;
          if (bad.length) report.modalFailures.push({variant, width, id: item.id, bad});
          if (theme === 'dark') {
            const colors = await evaluate(darkColorCheck);
            report.colorChecks++;
            if (colors.length) report.colorFailures.push({variant, width, id: item.id, modal: true, colors});
          }
          await evaluate('RD.closeModal()');
        }
      }
    }
    await screen('user-create');
    await interaction(variant, 'required fields reject empty form', `document.querySelector('main form')?.checkValidity()===false`);
    await evaluate(`window.__qaThemeField=document.querySelector('.page-content input[type="text"]');window.__qaThemePage=document.querySelector('.page-content');window.__qaThemeField.value='QA theme draft';document.querySelector('[data-theme-toggle]').click()`);
    await interaction(variant, 'theme toggle preserves form and DOM', `RDTheme.get()===${JSON.stringify(otherTheme)}&&window.__qaThemeField.isConnected&&window.__qaThemeField.value==='QA theme draft'&&window.__qaThemePage===document.querySelector('.page-content')`);
    await interaction(variant, 'theme toggle exposes pressed state', `document.querySelector('[data-theme-toggle]').getAttribute('aria-pressed')===${JSON.stringify(String(otherTheme === 'dark'))}`);
    await evaluate(`RD.openModal('user-edit');window.__qaModalField=document.querySelector('#modal input[type="text"]');window.__qaModalField.value='QA modal draft';window.__qaThemeHash=location.hash;RDTheme.set(${JSON.stringify(theme)})`);
    await interaction(variant, 'theme change preserves open modal and draft', `document.getElementById('modal').open&&window.__qaModalField.isConnected&&window.__qaModalField.value==='QA modal draft'&&RDTheme.get()===${JSON.stringify(theme)}`);
    await interaction(variant, 'theme change preserves hash and updates query', `location.hash===window.__qaThemeHash&&new URLSearchParams(location.search).get('theme')===${JSON.stringify(theme)}`);
    await evaluate('RD.closeModal()');
    await interaction(variant, 'theme selection is stored locally', `localStorage.getItem('service-track-redesign-theme')===${JSON.stringify(theme)}`);
    await navigate(localUrl(`${variant}/index.html`, null, 'requests'));
    await interaction(variant, 'theme preference survives page reload without query', `document.documentElement.dataset.theme===${JSON.stringify(theme)}&&document.body.dataset.screen==='requests'`);
    await navigate(localUrl(`${variant}/index.html`, otherTheme, 'requests'));
    await interaction(variant, 'explicit query overrides saved preference', `document.documentElement.dataset.theme===${JSON.stringify(otherTheme)}&&RDTheme.get()===${JSON.stringify(otherTheme)}`);
    await evaluate(`RDTheme.set(${JSON.stringify(theme)})`);
  }
  await size(1440);
  await navigate(localUrl('index.html'));
  await evaluate(`document.querySelector('[data-width="390"]').click();document.querySelector('[data-screen="request-object"]').click()`);
  await settle();
  await interaction(null, 'gallery selects screen, width and theme', `document.getElementById('preview-frame').getAttribute('src')===${JSON.stringify(`v1/index.html?theme=${theme}#request-object`)}&&document.getElementById('preview-frame').style.width==='390px'`);
  await evaluate(`const s=document.getElementById('screen-search');s.value='тариф';s.dispatchEvent(new Event('input'))`);
  await interaction(null, 'gallery search', `document.querySelectorAll('[data-screen]:not([hidden])').length>0&&document.querySelectorAll('[data-screen]:not([hidden])').length<RD.screens.length`);
  // Use a CDP isolated world to inspect the real child DOM even under file:// SOP.
  const previewContext = await previewExecutionContext();
  await evaluate(`document.querySelector('[data-action="go:request-object-edit"]').click()`, previewContext);
  if (!await waitForCondition(`document.body.dataset.screen==='request-object-edit'`, previewContext)) throw new Error('Preview form did not open');
  await evaluate(`window.__qaThemeField=document.querySelector('main input[type="text"]:not([readonly])');window.__qaThemeField.value='QA iframe draft';window.__qaThemePage=document.querySelector('.page-content');window.__qaThemeField.dataset.qaThemeMarker='retained'`, previewContext);
  await waitForCondition("document.getElementById('open-screen').hash==='#request-object-edit'");
  await interaction(null, 'full-size link follows navigation inside preview', "document.getElementById('open-screen').hash==='#request-object-edit' && document.querySelector('[aria-current=page]').dataset.screen==='request-object-edit'");
  await evaluate(`document.querySelector('[data-width="768"]').click()`);
  report.interactions.push({check: 'changing preview width preserves the form and draft', pass: await waitForCondition("innerWidth===768 && window.__qaThemeField?.isConnected && window.__qaThemeField.value==='QA iframe draft'", previewContext)});
  await evaluate(`window.__qaFrame=document.getElementById('preview-frame');window.__qaFrameSrc=window.__qaFrame.getAttribute('src');document.querySelector('[data-theme-toggle]').click()`);
  await settle();
  await interaction(null, 'gallery theme toggle preserves iframe', `window.__qaFrame===document.getElementById('preview-frame')&&window.__qaFrame.getAttribute('src')===window.__qaFrameSrc&&RDTheme.get()===${JSON.stringify(otherTheme)}`);
  await interaction(null, 'gallery theme propagates to preview and full-size URL', `document.getElementById('preview-frame').dataset.theme===${JSON.stringify(otherTheme)}&&new URL(document.getElementById('open-screen').href).searchParams.get('theme')===${JSON.stringify(otherTheme)}&&new URLSearchParams(location.search).get('theme')===${JSON.stringify(otherTheme)}`);
  report.interactions.push({check:'gallery toggle changes actual iframe theme without losing input or DOM', pass:await waitForCondition(`document.documentElement.dataset.theme===${JSON.stringify(otherTheme)}&&window.__qaThemeField?.isConnected&&window.__qaThemeField.value==='QA iframe draft'&&window.__qaThemeField.dataset.qaThemeMarker==='retained'&&window.__qaThemePage===document.querySelector('.page-content')&&document.body.dataset.screen==='request-object-edit'`, previewContext)});
  await evaluate(`document.querySelector('[data-theme-toggle]').click()`, previewContext);
  const childSynced = await waitForCondition(`document.documentElement.dataset.theme===${JSON.stringify(theme)}&&window.__qaThemeField?.isConnected&&window.__qaThemeField.value==='QA iframe draft'`, previewContext);
  const parentSynced = await waitForCondition(`RDTheme.get()===${JSON.stringify(theme)}&&document.getElementById('preview-frame').dataset.theme===${JSON.stringify(theme)}&&new URL(document.getElementById('open-screen').href).searchParams.get('theme')===${JSON.stringify(theme)}&&new URLSearchParams(location.search).get('theme')===${JSON.stringify(theme)}`);
  report.interactions.push({check:'theme toggled inside iframe synchronizes actual parent and full-size URL',pass:childSynced&&parentSynced});
  await evaluate(`RDTheme.set(${JSON.stringify(theme)})`);
  await size(320);
  await evaluate(`document.querySelector('.preview-heading').scrollIntoView({block:'start'})`);
  await settle();
  await interaction(null, 'gallery theme controls fit 320px viewport', `document.documentElement.scrollWidth<=innerWidth+2&&[document.querySelector('[data-theme-toggle]'),document.getElementById('open-screen')].every(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1})`);
  await navigate(localUrl('index.html'));
  await interaction(null, 'phone opens a mobile preview with screen picker collapsed', `document.querySelector('[data-width="390"]').getAttribute('aria-pressed')==='true' && !document.getElementById('screen-list').getClientRects().length`);
  await evaluate(`document.getElementById('browse-toggle').click();const search=document.getElementById('screen-search');search.value='тариф';search.dispatchEvent(new Event('input'));document.querySelector('#screen-list a:not([hidden])').click()`);
  await interaction(null, 'mobile picker restores focus after choosing a result', `document.activeElement.id==='browse-toggle' && !document.getElementById('screen-list').getClientRects().length && document.getElementById('open-screen').hash!=='#dashboard'`);
  await size(1440);
  await evaluate('window.scrollTo(0,0)');
  await settle();
  if (pictures) {
    await evaluate(`document.getElementById('screen-search').value='';document.getElementById('screen-search').dispatchEvent(new Event('input'));document.querySelector('[data-width="1440"]').click();document.querySelector('[data-screen="dashboard"]').click()`);
    await settle();
    const file = `previews/catalog${theme === 'dark' ? '-dark' : ''}.png`;
    await capture(path.join(root, file));
    report.screenshots.push(file);
  }
  report.exceptions = [...new Set(exceptions)];
  report.passed = !report.failures.length && !report.modalFailures.length && !report.colorFailures.length && !report.exceptions.length && report.interactions.every(item => item.pass);
  const reportFile = reportPrefix + (captureOnly ? 'capture-report.json' : full ? 'browser-report.json' : 'quick-report.json');
  fs.writeFileSync(path.join(root, 'qa', reportFile), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({theme, checks: report.checks, screens: report.screens.length, failures: report.failures.length, modalChecks: report.modalChecks, modalFailures: report.modalFailures.length, colorChecks: report.colorChecks, colorFailures: report.colorFailures.length, exceptions: report.exceptions, interactions: report.interactions, passed: report.passed}, null, 2));
  if (!report.passed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { try { await call('Browser.close'); } catch {} chrome.kill(); });
