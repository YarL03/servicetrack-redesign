/* Local Chromium/CDP verification. No dependency install and no server required. */
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname, '..');
const executable =
  process.env.REDESIGN_BROWSER ||
  ['/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium-browser'].find((file) => fs.existsSync(file));
if (!executable) throw new Error('Укажите путь к Chromium в REDESIGN_BROWSER.');
const chrome = spawn(
  executable,
  [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--disable-background-networking',
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--remote-debugging-pipe',
    `--user-data-dir=/tmp/kontur-mobile-qa-${process.pid}`,
  ],
  {stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe']},
);
let sequence = 0,
  buffer = '',
  stderr = '',
  session,
  navigation = 0;
const pending = new Map(),
  errors = [],
  checks = [],
  layouts = [];
chrome.stderr.on('data', (b) => (stderr += b.toString()));
chrome.on('error', (e) => {
  console.error(e);
  process.exitCode = 1;
});
for (const pipe of [chrome.stdio[3], chrome.stdio[4]])
  pipe.on('error', (e) => {
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error(e.message + ' ' + stderr.slice(-1200)));
    }
    pending.clear();
  });
chrome.stdio[4].on('data', (chunk) => {
  buffer += chunk.toString();
  let n;
  while ((n = buffer.indexOf('\0')) >= 0) {
    const raw = buffer.slice(0, n);
    buffer = buffer.slice(n + 1);
    if (!raw) continue;
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) {
      const {resolve, reject, timer} = pending.get(m.id);
      clearTimeout(timer);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    } else if (m.method === 'Runtime.exceptionThrown')
      errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  }
});
function call(method, params = {}, sessionId = session) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Timeout ' + method + ' ' + stderr.slice(-1200)));
    }, 15000);
    pending.set(id, {resolve, reject, timer});
    chrome.stdio[3].write(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}) + '\0');
  });
}
async function evaluate(expression, userGesture = false) {
  const r = await call('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true, userGesture});
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function settle() {
  await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
}
async function goto(screen, query = '?embed=1&theme=light') {
  const url = pathToFileURL(path.join(root, 'index.html')).href + query + '&qa=' + ++navigation + '#' + screen;
  await call('Page.navigate', {url});
  let ready = false;
  for (let n = 0; n < 80; n++) {
    try {
      if (
        await evaluate(
          `location.href===${JSON.stringify(url)} && Boolean(window.Kontur && document.querySelector("#app")?.children.length) && Kontur.state.screen===${JSON.stringify(screen.split('/')[0])}`,
        )
      ) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!ready) throw new Error('Page not ready: ' + screen + ' ' + JSON.stringify(errors));
  await settle();
}
async function size(width, height = 844) {
  await call('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false});
  await settle();
}
async function shot(name) {
  await settle();
  const r = await call('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false});
  fs.writeFileSync(path.join(root, 'previews', name + '.png'), Buffer.from(r.data, 'base64'));
}
async function click(selector) {
  const exists = await evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;e.click();return true;})()`,
    true,
  );
  if (!exists) throw new Error('Missing click ' + selector);
  await settle();
}
async function input(selector, value) {
  await evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await settle();
}
async function assert(name, expression) {
  const ok = Boolean(await evaluate(expression));
  checks.push({name, ok});
  if (!ok) throw new Error('Failed: ' + name);
}
async function checkLayout(screen, width, variant) {
  const result = await evaluate(
    `(()=>{const app=document.querySelector('#app'),scroll=app.querySelector('.scroll-content');const overflowing=[...app.querySelectorAll('*')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left< -1);}).map(e=>e.className||e.tagName);return {document:document.documentElement.scrollWidth>innerWidth,content:scroll?scroll.scrollWidth>scroll.clientWidth+1:false,overflowing};})()`,
  );
  layouts.push({width, screen, ...(variant ? {variant} : {}), ...result});
  if (result.document || result.content || result.overflowing.length)
    console.log('Overflow', width, screen, variant || '', JSON.stringify(result));
}
const action = (name) => click('#app [data-action="' + name + '"]');
const inSheet = (name) => click('#sheet [data-action="' + name + '"]');
const mode = (name) => click('#sheet [data-mode="' + name + '"]');
const scope = (name) => '?embed=1&theme=light&mode=' + name;
const on = (screen, id) => `Kontur.state.screen==="${screen}" && Kontur.state.id===${id}`;
async function navigate(hash) {
  await evaluate('location.hash=' + JSON.stringify(hash));
  await settle();
}
// Verify the rendered labels and palette, including the CSS actually applied to each chip.
async function checkStatusColors(context, expected) {
  await assert(
    context,
    `(() => {
    const entries = ${JSON.stringify(expected)};
    const palette = Kontur.state.theme === 'dark'
      ? {info: ['#155774','#b3e5fc'], warning: ['#72531d','#ffe2a7'], delayed: ['#415665','#dee9f0'], danger: ['#8a3735','#ffdad5'], success: ['#286844','#cef5dc']}
      : {info: ['#b3e5fc','#01579b'], warning: ['#ffe0a3','#533600'], delayed: ['#d4dfe7','#455a64'], danger: ['#ffcdc9','#681710'], success: ['#b9e7ca','#123621']};
    const hex = rgb => '#' + rgb.match(/[0-9]+/g).map(n => Number(n).toString(16).padStart(2, '0')).join('');
    const colors = new Set();
    function luminance(rgb) {
      const [r, g, b] = rgb.match(/[\\d.]+/g).slice(0, 3).map(Number).map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return r * 0.2126 + g * 0.7152 + b * 0.0722;
    }
    return entries.every(([selector, tone, label]) => {
      const chip = document.querySelector(selector + ' .chat-status > .chip.' + tone);
      if (!chip || chip.textContent !== label || !chip.querySelector('svg')) return false;
      const style = getComputedStyle(chip);
      if (style.backgroundColor === 'rgba(0, 0, 0, 0)' || colors.has(style.color)) return false;
      if (!chip.classList.contains('chat-delivery')) {
        const [background, foreground] = palette[tone];
        if (hex(style.backgroundColor) !== background || hex(style.color) !== foreground) return false;
      }
      colors.add(style.color);
      const text = luminance(style.color), bg = luminance(style.backgroundColor);
      return (Math.max(text, bg) + 0.05) / (Math.min(text, bg) + 0.05) >= 4.5;
    });
  })()`,
  );
}
const activeStatusExamples = [
  ['#app a[href="#chat/10428"]', 'info', 'В работе'],
  ['#app a[href="#chat/10429"]', 'warning', 'Готова к исполнению'],
  ['#app a[href="#chat/10430"]', 'delayed', 'Недопуск'],
  ['#app a[href="#chat/10432"]', 'danger', 'Доработка'],
];
async function selectFiles(names) {
  const {root: doc} = await call('DOM.getDocument');
  const {nodeId} = await call('DOM.querySelector', {nodeId: doc.nodeId, selector: '#file-picker'});
  await call('DOM.setFileInputFiles', {nodeId, files: names});
  await settle();
}
async function confirmFile() {
  await evaluate(
    `new Promise((resolve, reject) => {
    const sheet = document.querySelector('#sheet'), panel = sheet.querySelector('.attachment-preview');
    if (!panel || !sheet.open) return reject(new Error('Не открыт предпросмотр файла'));
    const observer = new MutationObserver(() => {
      if (!sheet.open || !panel.isConnected) { observer.disconnect(); clearTimeout(timer); resolve(); }
    });
    const timer = setTimeout(() => { observer.disconnect(); reject(new Error('Файл не подтверждён')); }, 5000);
    observer.observe(sheet, {attributes:true, childList:true, subtree:true});
    panel.querySelector('[data-intake-add]').click();
  })`,
    true,
  );
  await settle();
}
(async () => {
  const target = await call('Target.createTarget', {url: 'about:blank'}, undefined);
  const attached = await call('Target.attachToTarget', {targetId: target.targetId, flatten: true}, undefined);
  session = attached.sessionId;
  await call('Runtime.enable');
  await call('Page.enable');
  await size(390);
  await goto('inbox');
  await assert(
    'По умолчанию все пять активных назначений представлены диалогами',
    "Kontur.state.mode==='simple' && document.querySelectorAll('#inbox-rows .thread-row').length===5 && document.querySelector('#inbox-rows .list-caption span').textContent==='5' && document.querySelectorAll('.bottom-nav a').length===2",
  );
  await checkStatusColors('Светлый список · палитра статусов приложения и контраст', activeStatusExamples);
  await shot('inbox');
  await require('./simple-no-forms.cjs')({action, assert, click, evaluate, goto, input, on, scope, shot, size});
  await input('#inbox-search', 'Лермонтова 20');
  await assert(
    'Поиск по улице и дому',
    "document.querySelectorAll('#inbox-rows a').length===1 && !!document.querySelector('#inbox-rows a[href=\"#chat/10429\"]')",
  );
  await input('#inbox-search', '000');
  await assert('Пустая подборка с возвратом', "!!document.querySelector('[data-action=reset-inbox]')");
  await action('reset-inbox');
  await click('[data-filter="unread"]');
  await assert('Два диалога с непрочитанными сообщениями', "document.querySelectorAll('#inbox-rows a').length===2");
  await click('[data-filter="active"]');
  await click('.thread-row[href="#chat/10428"]');
  await assert(
    'Адрес открывает диалог с рабочим шагом',
    on('chat', 10428) + " && !!document.querySelector('.work-prompt') && !Kontur.request().unread",
  );
  await shot('thread');
  const menuWithoutStepSetting =
    "document.querySelector('#sheet').open && !/шаги формы/i.test(document.querySelector('#sheet').textContent)";
  await action('chat-menu');
  await assert('В меню чата со шагами доступны только действия по заявке и диалогу', menuWithoutStepSetting);
  await inSheet('close-sheet');
  await action('attach-chat');
  await assert(
    'Скрепка открывает три источника в диалоге',
    "document.querySelector('#sheet').open && document.querySelectorAll('#sheet .source-grid button').length===3 && document.querySelector('.attachment-target').textContent.includes('Сообщение')",
  );
  await shot('attachments');
  await inSheet('add-sample');
  await assert(
    'Вложение ждёт отправки и не подменяет фото формы',
    "Kontur.state.attachments.length===1 && !Kontur.state.draft.fieldMedia.work.length && !!document.querySelector('.draft-attachments .file-card')",
  );
  await input('#message-text', 'Отправлю акт после осмотра.');
  await click('#app .header-back a');
  await click('#app [href="#chat/10429"]');
  await assert(
    'Чужой черновик и сообщения отсутствуют',
    on('chat', 10429) +
      " && !Kontur.state.attachments.length && document.querySelector('#message-text').value==='' && !document.querySelector('#messages').textContent.includes('пломбы')",
  );
  await action('start-work');
  await assert(
    'Вторая заявка начата из диалога при открытой первой',
    on('chat', 10429) +
      " && document.querySelector('.thread-context .chip').textContent==='В работе' && !!document.querySelector('[data-action=chat-step]') && !document.querySelector('#sheet').open",
  );
  await action('chat-step');
  await input('#step-value', '29001234');
  await click('#step-form button');
  await click('#app .header-back a');
  await assert(
    'Обе начатые заявки закреплены сверху обычными строками и встречаются по одному разу',
    `[...document.querySelectorAll('#inbox-rows .thread-row')].slice(0, 2).every(row => row.querySelector('.chip').textContent==='В работе') &&
      [10428,10429].every(id => document.querySelectorAll('#inbox-rows a[href="#chat/'+id+'"]').length===1 &&
      document.querySelector('.thread-row[href="#chat/'+id+'"] .chip').textContent==='В работе')`,
  );
  await checkLayout('inbox', 390, 'Две заявки в работе');
  await click('#inbox-rows [href="#chat/10428"]');
  await assert(
    'По возврате восстановлены текст и файл',
    "Kontur.state.attachments.length===1 && document.querySelector('#message-text').value.includes('Отправлю акт')",
  );
  await click('[data-remove-file]');
  await assert('Вложение можно снять до отправки', 'Kontur.state.attachments.length===0');
  await action('attach-chat');
  await call('Page.setInterceptFileChooserDialog', {enabled: true});
  await click('[data-source="document"]');
  const fixture = path.join(require('node:os').tmpdir(), 'service-track-v2-' + process.pid + '.txt');
  fs.writeFileSync(fixture, 'Демонстрационные показания');
  try {
    await selectFiles([fixture]);
  } finally {
    fs.unlinkSync(fixture);
  }
  await assert(
    'Настоящий локальный файл попал в нужный черновик',
    "Kontur.state.attachments.length===1 && Kontur.state.attachments[0].name.endsWith('.txt') && !document.querySelector('#sheet').open",
  );
  await click('#message-form button[type="submit"]');
  await assert(
    'Отправленный текст и файл видны в переписке',
    "Kontur.state.messages[10428].at(-1).text.includes('Отправлю акт') && Kontur.state.messages[10428].at(-1).files.length===1 && !Kontur.state.attachments.length",
  );
  await action('chat-step');
  await input('#step-value', 'не число');
  await click('#step-form button');
  await assert(
    'Проверка числовых показаний',
    "!!document.querySelector('#step-error').textContent && !Kontur.state.draft.reading",
  );
  await input('#step-value', '18,7');
  await click('#step-form button');
  await assert(
    'Сохранённое показание отражено в шаге и в ленте',
    "Kontur.state.draft.reading==='18,7' && document.querySelector('#messages').textContent.includes('18,7 кВт·ч') && document.querySelector('.work-prompt').textContent.includes('Приложить фото')",
  );
  await click('#app .header-back a');
  await click('#inbox-rows [href="#chat/10430"]');
  await assert(
    'Заявка без шагов открывается из списка с перепиской и строкой сообщения',
    on('chat', 10430) +
      " && !document.querySelector('.work-prompt') && !!document.querySelector('#messages .message') && !!document.querySelector('#message-text')",
  );
  await action('chat-menu');
  await assert('В меню чата без шагов доступны только действия по заявке и диалогу', menuWithoutStepSetting);
  await inSheet('close-sheet');
  await click('#app .header-back a');
  await click('#inbox-rows [href="#chat/10431"]');
  await assert(
    'Байкальская, 128, кв. 18 тоже открывается без шагов, со строкой сообщения и скрепкой',
    on('chat', 10431) +
      " && !document.querySelector('.work-prompt') && !!document.querySelector('#message-text') && !!document.querySelector('#message-form [data-action=attach-chat]')",
  );
  await click('#app .header-back a');
  await click('#inbox-rows [href="#chat/10428"]');
  await assert(
    'У заявки с формой после возврата сохранились показания и следующий шаг',
    "Kontur.state.draft.reading==='18,7' && document.querySelector('.work-prompt [data-action=chat-step]')?.textContent==='Приложить фото'",
  );
  await input('#message-text', 'Черновик о приборе');
  await action('attach-chat');
  await inSheet('add-sample');
  await action('chat-menu');
  await inSheet('mode-menu');
  await mode('expanded');
  await assert(
    'Смена режима в диалоге оставляет открытой ту же заявку',
    on('detail', 10428) + " && Kontur.state.mode==='expanded'",
  );
  await action('start-work');
  await assert(
    'Общая форма показывает те же показания и одну кнопку материалов',
    "document.querySelector('#reading').value==='18,7' && document.querySelectorAll('.extra-attach').length===1 && !document.querySelector('[data-action=work-video]')",
  );
  await action('attach-work');
  await inSheet('add-sample');
  await confirmFile();
  await assert(
    'Дополнительный файл попадает в рабочую форму',
    "Kontur.state.draft.fieldMedia['work-extra'].filter(f=>f.delivery==='local' && f.name==='Акт замены.pdf').length===1 && !Kontur.state.draft.fieldMedia.work.length",
  );
  await input('#reading', '19,2');
  await click('#app a[aria-label="Чат заявки"]');
  await assert(
    'В отдельном чате расширенного режима те же сообщения и черновик',
    "Kontur.state.messages[10428].at(-1).text.includes('18,7') && document.querySelector('#message-text').value==='Черновик о приборе' && !document.querySelector('.work-prompt')",
  );
  await assert(
    'Неотправленный файл переживает переключение в расширенный режим',
    "Kontur.state.attachments.length===1 && document.querySelector('.draft-attachments').textContent.includes('Акт замены')",
  );
  await action('chat-menu');
  await inSheet('mode-menu');
  await mode('simple');
  await assert(
    'Неотправленные текст и файл вернулись в упрощённый диалог',
    "Kontur.state.attachments.length===1 && document.querySelector('#message-text').value==='Черновик о приборе'",
  );
  await assert(
    'Обратное переключение возвращает к следующему шагу той же заявки',
    on('chat', 10428) +
      " && Kontur.state.draft.reading==='19,2' && document.querySelector('.work-prompt').textContent.includes('Приложить фото')",
  );
  await action('chat-step');
  await assert(
    'Обязательное фото имеет контекст формы и только подходящие источники',
    "document.querySelectorAll('#sheet .source-grid button').length===2 && document.querySelector('.attachment-target').textContent.includes('Фото установленного прибора')",
  );
  await inSheet('add-sample');
  await confirmFile();
  await action('chat-step');
  await assert(
    'Сверка показывает текущие значения перед завершением',
    "document.querySelector('#sheet').textContent.includes('19,2 кВт·ч') && document.querySelector('#sheet').textContent.includes('Счётчик.jpg')",
  );
  await shot('review');
  await inSheet('complete');
  await assert(
    'Завершение видно событием в диалоге',
    "Kontur.request().status==='EXECUTED' && !document.querySelector('.work-prompt') && document.querySelector('#messages').textContent.includes('Отчёт принят')",
  );
  await click('#app .header-back a');
  await assert(
    'Завершённая работа исчезла из активного списка',
    '!document.querySelector(\'#inbox-rows [href="#chat/10428"]\')',
  );
  await assert(
    'После завершения первой заявки вторая остаётся в работе',
    `document.querySelector('.thread-row[href="#chat/10429"] .chip').textContent==='В работе'`,
  );
  await click('[data-filter="archive"]');
  await assert(
    'Переписка выполненной заявки доступна в архиве',
    '!!document.querySelector(\'#inbox-rows [href="#chat/10428"]\')',
  );
  await click('#inbox-rows [href="#chat/10428"]');
  await action('view-result');
  await assert(
    'Архивный отчёт содержит фактические значения обеих версий',
    "document.querySelector('#sheet').textContent.includes('19,2 кВт·ч') && document.querySelector('#sheet').textContent.includes('Акт замены.pdf')",
  );
  await inSheet('close-sheet');
  await click('#app .header-back a');
  await action('mode-menu');
  await mode('expanded');
  await assert(
    'Расширенная навигация разделяет заявки и чаты',
    "Kontur.state.screen==='queue' && document.querySelectorAll('.bottom-nav a').length===4 && !!document.querySelector('.bottom-nav [href=\"#chats\"]')",
  );
  await click('#app [href="#detail/10431"]');
  await action('start-work');
  await assert(
    'В расширенном режиме новая заявка открывает свою форму при другой начатой заявке',
    on('work', 10431) + " && document.querySelector('#serial').value==='' && Kontur.request().status==='IN_PROGRESS'",
  );
  await navigate('queue');
  await assert(
    'Очередь позволяет продолжить обе начатые заявки',
    `[10429,10431].every(id => document.querySelector('.focus-card a[href="#work/'+id+'"]')) &&
      document.querySelectorAll('.focus-card').length===2`,
  );
  await checkLayout('queue', 390, 'Две заявки в работе');
  await shot('queue');
  await click('#app [href="#statuses"]');
  await assert(
    'В статусе «В работе» две карточки для выбора',
    `document.querySelector('[data-status=IN_PROGRESS] b').textContent==='2' &&
      [10429,10431].every(id => document.querySelector('.request-card[href="#detail/'+id+'"]'))`,
  );
  await click('#app [href="#detail/10429"]');
  await action('start-work');
  await assert(
    'Продолжение возвращает черновик второй заявки и сохраняет единственное событие старта',
    on('work', 10429) +
      " && document.querySelector('#serial').value==='29001234' && Kontur.state.messages[10429].filter(m=>m.text==='Работа начата').length===1",
  );
  await goto('queue');
  await assert('Выбранный режим восстановился при новой загрузке', "Kontur.state.mode==='expanded'");
  await click('.bottom-nav [href="#chats"]');
  await checkStatusColors('Расширенные чаты · палитра статусов', activeStatusExamples);
  await shot('chats');
  await click('.bottom-nav [href="#profile"]');
  await action('mode-menu');
  await mode('simple');
  await assert(
    'Переключатель из профиля возвращает упрощённую навигацию',
    "Kontur.state.screen==='inbox' && Kontur.state.mode==='simple'",
  );
  await evaluate("localStorage.removeItem('kontur-mobile-v2-drafts')");
  await goto('chat/10428', '?embed=1&offline=1');
  await action('chat-step');
  await input('#step-value', '15');
  await click('#step-form button');
  await action('chat-step');
  await inSheet('add-sample');
  await confirmFile();
  await action('chat-step');
  await inSheet('complete');
  await assert(
    'Без сети есть подтверждение очереди и блокировка повторного завершения',
    "Kontur.state.pendingIds.includes(10428) && Kontur.request().status==='IN_PROGRESS' && !document.querySelector('.work-prompt') && document.querySelector('.thread-context').textContent.includes('Ожидает отправки')",
  );
  await checkStatusColors('Без сети видны рабочий статус и отметка об отправке', [
    ['.thread-context', 'info', 'В работе'],
    ['.thread-context', 'warning', 'Ожидает отправки'],
  ]);
  await click('#app .header-back a');
  await click('#inbox-rows [href="#chat/10429"]');
  await action('start-work');
  await assert(
    'Пока отчёт первой заявки ожидает сети, можно начать вторую',
    on('chat', 10429) +
      " && !!document.querySelector('[data-action=chat-step]') && Kontur.state.pendingIds.join()==='10428'",
  );
  await click('#app .header-back a');
  await click('#inbox-rows [href="#chat/10428"]');
  await click('#studio-network');
  await assert(
    'После восстановления сети завершение переходит в историю',
    "!Kontur.state.pendingIds.length && Kontur.request().status==='EXECUTED' && document.querySelector('.thread-context .chip.success')?.textContent==='Выполнена' && !document.querySelector('.chat-delivery')",
  );
  await click('#app .header-back a');
  await assert(
    'После отправки первого отчёта вторая заявка всё ещё в работе',
    `document.querySelector('.thread-row[href="#chat/10429"] .chip').textContent==='В работе'`,
  );
  await evaluate("localStorage.removeItem('kontur-mobile-v2-drafts')");
  for (const width of [320, 360, 390, 430]) {
    await size(width);
    for (const [style, screens] of Object.entries({
      simple: ['inbox', 'chat/10428', 'chat/10429', 'profile', 'delay', 'notifications'],
      'simple-no-forms': ['inbox', 'chat/10428'],
      expanded: [
        'queue',
        'chats',
        'chat/10428',
        'detail',
        'work',
        'locations',
        'statuses',
        'all',
        'all-locations',
        'all-statuses',
        'profile',
      ],
    })) {
      for (const screen of screens) {
        await goto(screen, scope(style));
        await checkLayout(screen, width, style);
      }
    }
    await goto('chat/10430', scope('simple'));
    await assert(
      'Прямая ссылка на чат без шагов · ' + width,
      "!!document.querySelector('#message-form') && !document.querySelector('.work-prompt')",
    );
    await checkLayout('chat/10430', width, 'Без шагов формы');
    if (width === 390) await shot('thread-no-steps');
    await action('attach-chat');
    await assert(
      'Панель вложений в пределах экрана ' + width,
      "document.querySelector('#sheet').getBoundingClientRect().bottom<=innerHeight+1 && document.querySelector('#sheet').scrollWidth<=document.querySelector('#sheet').clientWidth+1",
    );
  }
  await goto('inbox', '?embed=1&mode=simple&theme=dark');
  await size(320);
  await checkStatusColors('Тёмный список · разные цвета и читаемые названия', activeStatusExamples);
  await action('chat-group-menu');
  await click('#sheet [data-chat-grouping=type]');
  await checkStatusColors('Внутри групп статус совпадает с обычным списком', activeStatusExamples);
  await click('[data-filter=archive]');
  await checkStatusColors('Зелёная метка архивного диалога', [['#inbox-rows a', 'success', 'Выполнена']]);
  await action('chat-group-menu');
  await click('#sheet [data-chat-grouping=none]');
  await goto('chat/10428', '?embed=1&mode=simple&theme=dark');
  await size(390);
  await shot('thread-dark');
  await goto('chat/10428', scope('simple'));
  await action('attach-chat');
  await click('[data-source="camera"]');
  await click('[data-camera=native]');
  await assert(
    'Камера устройства запрашивает одиночное фото',
    "document.querySelector('#file-picker').accept==='image/*' && document.querySelector('#file-picker').hasAttribute('capture') && !document.querySelector('#file-picker').multiple",
  );
  await click('.camera-view [data-action=close-sheet]');
  await action('attach-chat');
  await click('[data-source="media"]');
  await assert(
    'Один источник принимает фото, видео и аудио',
    "document.querySelector('#file-picker').accept==='image/*,video/*,audio/*' && !document.querySelector('#file-picker').hasAttribute('capture') && document.querySelector('#file-picker').multiple",
  );
  await call('Input.dispatchKeyEvent', {type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27});
  await call('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27});
  await settle();
  await assert(
    'Отмена выбора закрывает панель и сохраняет диалог',
    "!document.querySelector('#sheet').open && !Kontur.state.attachments.length && Kontur.state.screen==='chat'",
  );
  await goto('chat/10432', scope('simple'));
  await action('chat-menu');
  await inSheet('delay');
  await action('delay-photo');
  await inSheet('add-sample');
  await confirmFile();
  await action('save-delay');
  await checkStatusColors('После недопуска метка обновляется у заявки с доработкой', [
    ['.thread-context', 'delayed', 'Недопуск'],
  ]);
  await click('#app .header-back a');
  await checkStatusColors('Новый статус виден при возврате в список', [
    ['#app a[href="#chat/10432"]', 'delayed', 'Недопуск'],
  ]);
  await require('./chat-file-status.cjs')({action, assert, click, goto, input, scope, shot, size});
  await require('./field-media.cjs')({
    confirmFile,
    action,
    assert,
    click,
    evaluate,
    goto,
    inSheet,
    input,
    navigate,
    scope,
    selectFiles,
    shot,
    size,
    checkLayout,
  });
  await require('./chat-groups.cjs')({
    action,
    click,
    input,
    evaluate,
    assert,
    size,
    goto,
    scope,
    shot,
    checkLayout,
    on,
  });
  await require('./chat-media-unread.cjs')({
    action,
    assert,
    click,
    evaluate,
    goto,
    input,
    navigate,
    scope,
    selectFiles,
    shot,
    size,
    checkLayout,
  });
  await require('./request-addresses-fields.cjs')({
    confirmFile,
    action,
    assert,
    click,
    evaluate,
    goto,
    navigate,
    scope,
    shot,
    size,
    checkLayout,
  });
  await require('./review-and-badge.cjs')({
    confirmFile,
    action,
    assert,
    checkLayout,
    click,
    evaluate,
    goto,
    input,
    navigate,
    scope,
    shot,
    size,
  });
  await require('./attachment-preview.cjs')({
    action,
    assert,
    click,
    confirmFile,
    evaluate,
    goto,
    input,
    navigate,
    scope,
    selectFiles,
    shot,
    size,
  });
  await require('./audio-recorder.cjs')({
    action,
    assert,
    click,
    confirmFile,
    evaluate,
    goto,
    input,
    navigate,
    scope,
    shot,
    size,
  });
  await size(1440, 940);
  await goto('inbox', '?mode=simple&theme=light');
  await evaluate("document.querySelector('#reference-image').decode()");
  await shot('overview');
  await assert(
    'Обзор на компьютере показывает оба экрана и переключатели',
    "document.querySelector('#reference-image').naturalWidth>0 && document.querySelector('#reference-image').getBoundingClientRect().width>0 && document.querySelector('#studio-modes').children.length===3",
  );
  for (const [id, withSteps] of [
    [10430, false],
    [10428, true],
  ]) {
    const link = '#studio-routes a[href="#chat/' + id + '"]';
    await click(link);
    await assert(
      'Каталог открывает пример заявки № ' + id,
      on('chat', id) +
        ` && !!document.querySelector('.work-prompt') === ${withSteps} && document.querySelectorAll('#studio-routes [aria-current=page]').length === 1 && document.querySelector('${link}').hasAttribute('aria-current')`,
    );
  }
  const passed = !errors.length && layouts.every((x) => !x.document && !x.content && !x.overflowing.length);
  const report = {passed, checks, layouts, errors};
  fs.writeFileSync(path.join(__dirname, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({passed, checks: checks.length, layouts: layouts.length, errors}));
  if (!passed) process.exitCode = 1;
})()
  .catch((e) => {
    console.error(e.stack, errors);
    process.exitCode = 1;
  })
  .finally(() => chrome.kill());
