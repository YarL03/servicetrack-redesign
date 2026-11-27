/* Проверка макетов v2 через Chrome DevTools Protocol. */
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname, '..');
const browserPath = process.env.REDESIGN_BROWSER || '/home/yaroslav/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const chrome = spawn(browserPath, ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-pipe', `--user-data-dir=/tmp/service-track-v2-qa-${process.pid}`], {stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe']});
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
async function capture(file) {
  await settle();
  await new Promise(resolve => setTimeout(resolve, 100));
  const data = await c('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false});
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, Buffer.from(data.data, 'base64'));
}
const assert = require('node:assert/strict');
const pictures = process.argv.includes('--screenshots');
let checks = 0, layouts = 0;
const js = JSON.stringify;
async function check(description, expression) {
  assert(await evaluate(expression), description);
  checks++;
}
async function click(selector) {
  await evaluate(`document.querySelector(${js(selector)}).click()`);
  await settle();
}
async function go(id) {
  await evaluate(`new Promise(resolve => {
    const id = ${js(id)};
    if (document.body.dataset.screen === id && location.hash === '#' + id) return resolve();
    document.addEventListener('rd:render', resolve, {once:true});
    location.hash = id;
  })`);
  await settle();
  assert.equal(await evaluate('document.body.dataset.screen'), id);
}
async function input(selector, value) {
  await evaluate(`{const el = document.querySelector(${js(selector)}); el.value = ${js(value)}; el.dispatchEvent(new Event('input',{bubbles:true}));}`);
}
async function shot(name) {
  if (!pictures) return;
  if (name.startsWith('form-')) {
    await evaluate(`new Promise(resolve => {
      const toast = document.getElementById('toast');
      if (!toast.classList.contains('visible')) return resolve();
      const observer = new MutationObserver(() => { observer.disconnect(); resolve(); });
      observer.observe(toast, {attributes:true, attributeFilter:['class']});
    })`);
  }
  await capture(path.join(root, 'previews', name + '.png'));
}
const url = (page, hash, theme) => pathToFileURL(path.join(root, page)).href + '?theme=' + theme + '#' + hash;
async function checkBrand(page, theme, width) {
  const catalog = page === '../index.html' || page === 'catalog.html';
  await size(width);
  await navigate(url(page, catalog ? '' : 'login', theme));
  const asset = pathToFileURL(path.join(root, '../shared/logo.svg')).href;
  async function checkImage(selector) {
    await check(page + ' ' + theme + ' ' + width + ' ' + selector, `(async () => {
      const img = document.querySelector(${js(selector)});
      await img.decode();
      const box = img.getBoundingClientRect();
      return img.currentSrc === ${js(asset)} && img.alt === '' && box.width === box.height && box.width >= 32 &&
        box.left >= 0 && box.right <= innerWidth && getComputedStyle(img).visibility === 'visible' &&
        getComputedStyle(img).backgroundColor === 'rgba(0, 0, 0, 0)';
    })()`);
  }
  await check(page + ' · значок вкладки', `document.querySelector('link[rel=icon]').href === ${js(asset)}`);
  if (!catalog) {
    await checkImage('.admin-auth img');
    if (width < 900) await click('.menu-button');
  }
  await checkImage('.brand-mark');
}
async function run(theme, width) {
  const mobile = width < 720;
  await size(width);
  await navigate(url('index.html', 'request', theme).replace('#', '&viewport=' + width + '#'));
  await check('Вкладка карточки показывает два непрочитанных сообщения', `document.querySelector('.tabs [href="#chat-10428"]').textContent.includes('2')`);
  await click('.tabs [href="#chat-10428"]');
  await check('Чтение обновляет общий счётчик', `document.querySelector('.main-nav [href="#chats"] b').textContent === '1'`);
  await check('Отдельный список на телефоне', `(getComputedStyle(document.querySelector('.v2-list')).display === 'none') === ${mobile}`);
  if (mobile) await check('Редактор сообщения доступен над нижним меню', "document.querySelector('[data-send]').getBoundingClientRect().bottom <= document.querySelector('.mobile-nav').getBoundingClientRect().top");
  await shot('chat-' + width + '-' + theme);
  await click('.v2-log [data-preview]');
  await check('Исходное фото доступно', "document.querySelector('dialog[open] img').naturalWidth > 0");
  await click('dialog[open] [data-preview]');
  await check('Второе вложение сообщения открывает видео', "!!document.querySelector('dialog[open] video[controls]')");
  await click('[data-v2-close]');
  await input('[data-chat-text]', 'Проверю акт и фото.');
  await evaluate(`{const dt = new DataTransfer(); dt.items.add(new File(['проверка'], 'черновик.txt', {type:'text/plain'})); const el = document.querySelector('[data-chat-upload]'); el.files = dt.files; el.dispatchEvent(new Event('change',{bubbles:true}));}`);
  await go('chats');
  await click('[data-chat-scope=unread]');
  await check('В непрочитанных остался другой диалог', "document.querySelectorAll('.v2-chat-row').length === 1 && document.querySelector('.v2-chat-row').hash === '#chat-10425'");
  await click('.v2-chat-row');
  await check('Черновики разных заявок изолированы', "document.querySelector('[data-chat-text]').value === '' && !document.querySelector('.v2-draft-files > div')");
  await go('chats');
  await click('[data-chat-scope=archive]');
  await check('Архив содержит завершённые заявки', "document.querySelectorAll('.v2-chat-row').length === 2");
  await click('[data-chat-scope=active]');
  await input('[data-chat-search]', 'Лермонтова 42');
  await check('Поиск по частям адреса', "document.querySelectorAll('.v2-chat-row').length === 1");
  await input('[data-chat-search]', 'пустой-поиск');
  await check('Пустой результат', "document.querySelector('.v2-empty-list').textContent.includes('не найдены')");
  await input('[data-chat-search]', '');
  for (const key of ['street','house','city','type','none']) {
    await evaluate(`{const el=document.querySelector('[data-grouping]');el.value=${js(key)};el.dispatchEvent(new Event('change',{bubbles:true}));}`);
    await check('Группировка ' + key, `!!document.querySelector('.v2-group') === ${key !== 'none'}`);
  }
  await click('.v2-chat-row[href="#chat-10428"]');
  await check('Текст и файл черновика восстановлены', `document.querySelector('[data-chat-text]').value === 'Проверю акт и фото.' && document.querySelector('.v2-draft-files').textContent.includes('черновик.txt')`);
  await click('[data-send]');
  await check('Отправка сообщения с файлом', "document.querySelector('.v2-message:last-child').textContent.includes('черновик.txt') && document.querySelector('[data-send]').disabled");
  await check('Исходящие файлы не попадают в очередь', "document.querySelector('[data-chat-pending] b').textContent === '4'");
  await click('.v2-log [data-assign]');
  await check('Для фото доступны только подходящие поля', "[...document.querySelectorAll('dialog[open] [name=destination]')].map(e=>e.value).join() === 'photo,extra'");
  await shot('assignment-' + width + '-' + theme);
  await click('dialog [value=photo]');
  await click('[data-v2-close]');
  await check('Отмена оставляет все файлы в очереди', "document.querySelector('[data-chat-pending] b').textContent === '4'");
  await click('[data-chat-pending] a');
  await shot('files-' + width + '-' + theme);
  const pool = "document.querySelector('[data-pool]')";
  const summary = '[data-pool] > summary';
  await check('Очередь изначально раскрыта', `${pool}.open && ${pool}.querySelector('[data-preview]').checkVisibility()`);
  const point = await evaluate(`(() => {
    const el = document.querySelector(${js(summary)});
    el.scrollIntoView({block:'center'});
    const rect = el.getBoundingClientRect();
    return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
  })()`);
  await c('Input.dispatchMouseEvent', {type:'mousePressed', button:'left', clickCount:1, ...point});
  await c('Input.dispatchMouseEvent', {type:'mouseReleased', button:'left', clickCount:1, ...point});
  await settle();
  await check('Свёрнутый раздел скрывает файлы и показывает счётчик', `!${pool}.open && !${pool}.querySelector('[data-preview]').checkVisibility() && ${pool}.querySelector('.v2-count').checkVisibility() && ${pool}.querySelector('.v2-count').textContent === '4'`);
  await shot('files-collapsed-' + width + '-' + theme);
  await go('request-10426');
  await check('Другая заявка раскрыта независимо', pool + '.open');
  await go('request-object');
  await check('В рабочей форме сохранён выбор заявки', '!' + pool + '.open');
  await go('request-files');
  await evaluate(`document.querySelector(${js(summary)}).focus()`);
  await c('Input.dispatchKeyEvent', {type:'keyDown', key:'Enter', code:'Enter', text:'\r', windowsVirtualKeyCode:13});
  await c('Input.dispatchKeyEvent', {type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13});
  await settle();
  await check('Enter раскрывает список с клавиатуры', `${pool}.open && ${pool}.querySelector('[data-assign]').checkVisibility()`);
  await click('[data-pool] [data-assign]');
  await click('dialog [value=photo]');
  await click('[data-commit]');
  await check('Назначение обновляет очередь и список прикреплённых', "document.querySelectorAll('[data-pool] [data-assign]').length === 3 && document.querySelectorAll('[data-distributed] [data-assign]').length === 1");
  await click('[data-action="go:request-object"]');
  await check('Фото лежит у целевого поля', "document.querySelector('[data-field-slot=photo]').textContent.includes('Пломба после замены.jpg')");
  await click('[data-field-slot=photo] [data-assign]');
  await click('dialog [value=extra]');
  await click('[data-commit]');
  await check('Перенос в смешанное поле без дублирования', "!document.querySelector('[data-field-slot=photo] [data-preview]') && !!document.querySelector('[data-field-slot=extra] [data-preview]')");
  await click('[data-action="go:request-object-edit"]');
  await input('.work-stage input:not([type=file])', '00888');
  await click(summary);
  await click('[data-from-pool=video]');
  await click('dialog [name=source]');
  await click('[data-commit]');
  await check('Прикрепление из редактируемого поля сохраняет ввод', "document.querySelector('.work-stage input').value === '00888' && document.querySelector('[data-field-slot=video]').textContent.includes('Проверка подключения.mp4')");
  for (const id of ['audio','document']) {
    await click('[data-from-pool=' + id + ']');
    await click('dialog [name=source]');
    await click('[data-commit]');
  }
  await check('Пустое состояние очереди', "document.querySelector('[data-pool]').textContent.includes('Все файлы исполнителя распределены')");
  await check('После распределения очередь остаётся свёрнутой и показывает ноль', `!${pool}.open && ${pool}.querySelector('.v2-count').textContent === '0'`);
  await click(summary);
  await check('Пустую очередь можно раскрыть', `${pool}.open && ${pool}.querySelector('.panel-body p').checkVisibility()`);
  await click(summary);
  await click('[data-field-slot=video] [data-assign]');
  await click('[data-release]');
  await check('Возврат файла в очередь', "document.querySelectorAll('[data-pool] [data-assign]').length === 1 && !document.querySelector('[data-field-slot=video] [data-preview]')");
  await check('Возврат файла обновляет счётчик и переводит фокус на видимый заголовок', `!${pool}.open && ${pool}.querySelector('.v2-count').textContent === '1' && document.activeElement === ${pool}.querySelector('summary')`);
  await go('chat-10428');
  await check('Сообщение сохраняет оригинал и выбранное поле', "document.querySelector('.v2-log [data-assign]').textContent.includes('Дополнительные материалы') && document.querySelector('[data-chat-pending] b').textContent === '1'");
  await click('.v2-log [data-assign]');
  await click('[data-show-field]');
  await check('Из сообщения можно открыть файл в конкретном поле', "document.body.dataset.screen === 'request-object' && document.activeElement.closest('[data-field-slot]')?.dataset.fieldSlot === 'extra'");
  await shot('form-' + width + '-' + theme);
  await go('requests');
  await click('tbody [href="#request-10426"]');
  await check('Реестр, карточка и очередь другой заявки связаны', "document.body.dataset.screen === 'request-10426' && document.querySelector('[data-pool] .v2-count').textContent === '1'");
  await click('.tabs [href="#chat-10426"]');
  await check('Диалог второй заявки хранит свой файл', "document.querySelector('[data-thread]').dataset.thread === '10426' && document.querySelectorAll('.v2-log [data-preview]').length === 1");
}
(async () => {
  const target = await call('Target.createTarget', {url:'about:blank'});
  session = (await call('Target.attachToTarget', {targetId: target.targetId, flatten:true})).sessionId;
  await c('Page.enable');
  await c('Runtime.enable');
  await c('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  for (const theme of ['light','dark']) {
    for (const width of [1440,390]) await run(theme, width);
    for (const width of [320,390,719,720,768,900,1024,1440,1920]) {
      await size(width);
      for (const id of ['chats','chat-10428','request','request-files','request-object-edit','request-10426']) {
        await go(id);
        await check('Ширина ' + width + ' · ' + id, "document.documentElement.scrollWidth <= innerWidth + 1");
        layouts++;
      }
    }
  }
  const catalog = await evaluate('RD.screens.map(s => s.id)');
  for (const id of catalog) {
    await evaluate(`RD.render(${js(id)})`);
    await check('Зарегистрированный экран ' + id, `document.body.dataset.screen === ${js(id)} && !!document.querySelector('main h1') && !!document.querySelector('.page-content').children.length`);
  }
  await navigate(url('catalog.html','', 'light'));
  await click('[data-screen="chat-10428"]');
  await check('Каталог открывает версию v2', "document.querySelector('#preview-frame').src.includes('/v2/index.html?theme=light#chat-10428') && document.querySelector('#open-screen').href === document.querySelector('#preview-frame').src");
  await navigate(url('../v1/index.html', 'requests','light'));
  await check('Реестр v1 сохраняет исходные переходы и навигацию', "RD.screens.length === 142 && document.querySelectorAll('tbody [href=\"#request\"]').length === 6 && !document.querySelector('.main-nav [href=\"#chats\"]')");
  for (const page of ['../v1/index.html', 'index.html', '../index.html', 'catalog.html']) {
    for (const theme of ['light', 'dark']) {
      for (const width of [390, 1440]) await checkBrand(page, theme, width);
    }
  }
  assert.deepEqual(exceptions, []);
  console.log(JSON.stringify({checks, layouts, exceptions}));
})().catch(error => {console.error(error, exceptions); process.exitCode=1;}).finally(() => chrome.kill());
