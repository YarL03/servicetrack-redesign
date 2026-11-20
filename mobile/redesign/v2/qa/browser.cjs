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
async function evaluate(expression) {
  const r = await call('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
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
      colors.add(style.color);
      const text = luminance(style.color), bg = luminance(style.backgroundColor);
      return (Math.max(text, bg) + 0.05) / (Math.min(text, bg) + 0.05) >= 4.5;
    });
  })()`,
  );
}
const activeStatusExamples = [
  ['#app a[href="#chat/10428"]', 'info', 'В работе'],
  ['#app a[href="#chat/10429"]', 'neutral', 'Готова к работе'],
  ['#app a[href="#chat/10430"]', 'warning', 'Недопуск'],
  ['#app a[href="#chat/10432"]', 'danger', 'Доработка'],
];
async function selectFiles(names) {
  const {root: doc} = await call('DOM.getDocument');
  const {nodeId} = await call('DOM.querySelector', {nodeId: doc.nodeId, selector: '#file-picker'});
  await call('DOM.setFileInputFiles', {nodeId, files: names});
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
    "Kontur.state.mode==='simple' && document.querySelectorAll('#inbox-rows a').length===5 && document.querySelectorAll('.bottom-nav a').length===2",
  );
  await checkStatusColors('Светлый список и закреплённая заявка · метки и контраст', activeStatusExamples);
  await shot('inbox');
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
  await click('.pinned-job');
  await assert(
    'Адрес открывает диалог с рабочим шагом',
    on('chat', 10428) + " && !!document.querySelector('.work-prompt') && !Kontur.request().unread",
  );
  await shot('thread');
  await action('attach-chat');
  await assert(
    'Скрепка открывает три источника в диалоге',
    "document.querySelector('#sheet').open && document.querySelectorAll('#sheet .source-grid button').length===3 && document.querySelector('.attachment-target').textContent.includes('Сообщение')",
  );
  await shot('attachments');
  await inSheet('add-sample');
  await assert(
    'Вложение ждёт отправки и не подменяет фото формы',
    "Kontur.state.attachments.length===1 && !Kontur.state.draft.photo && !!document.querySelector('.draft-attachments .file-card')",
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
    'Защита от двух одновременных работ',
    "document.querySelector('#sheet-title').textContent.includes('Уже есть') && document.querySelector('#sheet a').hash==='#chat/10428'",
  );
  await click('#sheet a');
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
  await assert(
    'Дополнительный файл попадает в рабочую форму',
    'Kontur.state.draft.extraFiles.length===1 && !Kontur.state.draft.photo',
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
  await goto('queue');
  await assert('Выбранный режим восстановился при новой загрузке', "Kontur.state.mode==='expanded'");
  await shot('queue');
  await click('.bottom-nav [href="#chats"]');
  await checkStatusColors('Расширенные чаты · палитра статусов', activeStatusExamples);
  await shot('chats');
  await click('.bottom-nav [href="#profile"]');
  await action('mode-menu');
  await shot('modes');
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
  await click('#studio-network');
  await assert(
    'После восстановления сети завершение переходит в историю',
    "!Kontur.state.pendingIds.length && Kontur.request().status==='EXECUTED' && document.querySelector('.thread-context .chip.success')?.textContent==='Выполнена' && !document.querySelector('.chat-delivery')",
  );
  await evaluate("localStorage.removeItem('kontur-mobile-v2-drafts')");
  for (const width of [320, 360, 390, 430]) {
    await size(width);
    for (const [style, screens] of Object.entries({
      simple: ['inbox', 'chat/10428', 'chat/10429', 'profile', 'delay', 'notifications'],
      expanded: ['queue', 'chats', 'chat/10428', 'detail', 'work', 'locations', 'statuses', 'profile'],
    })) {
      for (const screen of screens) {
        await goto(screen, scope(style));
        await checkLayout(screen, width, style);
      }
    }
    await goto('chat/10428', scope('simple'));
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
  await assert(
    'Камера запрашивает одиночное фото',
    "document.querySelector('#file-picker').accept==='image/*' && document.querySelector('#file-picker').hasAttribute('capture') && !document.querySelector('#file-picker').multiple",
  );
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
  await action('save-delay');
  await checkStatusColors('После недопуска метка обновляется у заявки с доработкой', [
    ['.thread-context', 'warning', 'Недопуск'],
  ]);
  await click('#app .header-back a');
  await checkStatusColors('Новый статус виден при возврате в список', [
    ['#app a[href="#chat/10432"]', 'warning', 'Недопуск'],
  ]);
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
  await size(1440, 940);
  await goto('inbox', '?mode=simple&theme=light');
  await evaluate("document.querySelector('#reference-image').decode()");
  await shot('overview');
  await assert(
    'Обзор на компьютере показывает оба экрана и переключатели',
    "document.querySelector('#reference-image').naturalWidth>0 && document.querySelector('#reference-image').getBoundingClientRect().width>0 && document.querySelector('#studio-modes').children.length===2",
  );
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
