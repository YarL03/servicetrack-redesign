/* Local Chromium/CDP verification. No dependency install and no server required. */
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname, '..');
const chrome = spawn(
  process.env.REDESIGN_BROWSER || '/home/yaroslav/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
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
  if (!ready) throw new Error('Page not ready: ' + screen);
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
async function captureComparison() {
  await size(1440, 1240);
  await call('Page.navigate', {url: pathToFileURL(path.join(root, 'compare.html')).href});
  await new Promise((r) => setTimeout(r, 700));
  await settle();
  await shot('navigation-comparison-1440');
}
(async () => {
  fs.mkdirSync(path.join(root, 'previews'), {recursive: true});
  const target = await call('Target.createTarget', {url: 'about:blank'}, undefined);
  const attached = await call('Target.attachToTarget', {targetId: target.targetId, flatten: true}, undefined);
  session = attached.sessionId;
  await call('Runtime.enable');
  await call('Page.enable');
  if (process.argv.includes('--comparison-only')) {
    await captureComparison();
    console.log('Navigation comparison PNG updated.');
    return;
  }
  await goto('queue');
  await evaluate(
    'localStorage.removeItem("kontur-mobile-v1-drafts");localStorage.removeItem("service-track-mobile-v1-address-grouping")',
  );
  const screens = await evaluate('Kontur.screenInfo.map(i=>i[0])');
  for (const width of [320, 360, 390, 430]) {
    await size(width);
    for (const screen of screens) {
      await goto(screen);
      await checkLayout(screen, width);
      if (width === 390) await shot(screen + '-390');
    }
    await goto('locations', '?embed=1&theme=light&grouping=street');
    await checkLayout('locations', width, 'street');
    if (width === 390) await shot('locations-street-390');
  }
  await size(390);
  await goto('locations');
  await assert(
    'Address groups default to separate houses with all active requests',
    'Kontur.state.addressGrouping==="street-house" && document.querySelectorAll(".building-group").length===4 && document.querySelectorAll(".apartment-row").length===5',
  );
  await click('[data-grouping="street"]');
  await assert(
    'Street grouping combines different houses and keeps exact addresses',
    'document.querySelectorAll(".building-group").length===3 && document.querySelectorAll(".building-group:first-of-type .apartment-row").length===2 && document.querySelector(".building-group:first-of-type").textContent.includes("Дом 18 · кв. 42") && document.querySelector(".building-group:first-of-type").textContent.includes("Дом 20 · кв. 47")',
  );
  await click('.building-group:last-of-type summary');
  await evaluate('document.querySelector(".scroll-content").scrollTop=140');
  await click('.apartment-row[href="#detail/10429"]');
  await assert(
    'Address row opens the request in the chosen house',
    'Kontur.state.screen==="detail" && Kontur.state.id===10429 && document.querySelector(".request-hero").textContent.includes("Лермонтова, 20")',
  );
  await click('.header-back a');
  await assert(
    'Returning preserves grouping, expanded streets and scroll',
    'Kontur.state.screen==="locations" && Kontur.state.addressGrouping==="street" && document.querySelector(".building-group:last-of-type").open && document.querySelector(".scroll-content").scrollTop>=139',
  );
  await click('[data-grouping="street-house"]');
  await assert(
    'House grouping splits the same requests without loss or duplication',
    'document.querySelectorAll(".building-group").length===4 && document.querySelectorAll(".apartment-row").length===5 && document.querySelectorAll(".building-group:first-of-type .apartment-row").length===1',
  );
  await click('[data-grouping="street"]');
  await goto('locations');
  await assert(
    'Grouping preference survives reload',
    'Kontur.state.addressGrouping==="street" && document.querySelector("[data-grouping=street]").getAttribute("aria-pressed")==="true"',
  );
  await goto('locations', '?embed=1&theme=dark');
  await shot('locations-street-dark-390');
  await evaluate('Kontur.requests.find(r=>r.id===10432).status="EXECUTED"');
  await click('[data-grouping="street-house"]');
  await click('[data-grouping="street"]');
  await assert(
    'Groups and counts follow remaining active requests',
    'document.querySelectorAll(".building-group").length===2 && document.querySelectorAll(".apartment-row").length===4 && !document.querySelector(".scroll-content").textContent.includes("Гагарина")',
  );
  await evaluate('localStorage.removeItem("service-track-mobile-v1-address-grouping")');
  await goto('search');
  await input('#search-input', 'Лермонтова');
  await assert(
    'Search by street finds two assigned requests',
    'document.querySelectorAll("#search-results .request-card").length===2',
  );
  await shot('search-results-390');
  await input('#search-input', 'Смирнова');
  await assert('Search by customer', 'document.querySelectorAll("#search-results .request-card").length===1');
  await input('#search-input', 'ИРК-8241');
  await assert('Search by external number', 'document.querySelectorAll("#search-results .request-card").length===1');
  await input('#search-input', 'несуществующая улица');
  await assert('Empty search has recovery', 'Boolean(document.querySelector("[data-action=search-all]"))');
  await shot('search-empty-390');
  await click('[data-action=search-reset]');
  await input('#search-input', 'Лермонтова');
  await click('a[href="#filters"]');
  await click('[name="filter-status"][value="IN_PROGRESS"]');
  await evaluate(
    'document.querySelector("[name=filter-status][value=IN_PROGRESS]").dispatchEvent(new Event("change",{bubbles:true}))',
  );
  await click('[data-action=apply-filters]');
  await assert(
    'Filter and query combine',
    'document.querySelectorAll("#search-results .request-card").length===1 && Kontur.state.query==="Лермонтова"',
  );
  await goto('statuses');
  await click('[data-status="DELAYED"]');
  await assert(
    'Status navigation filters requests',
    'document.querySelectorAll(".request-card").length===1 && document.querySelector(".request-card").textContent.includes("10430")',
  );
  await goto('work/10428');
  await input('#reading', '12,5');
  await click('[data-action="work-photo"]');
  await click('[data-action="demo-photo"]');
  await assert(
    'Photo and input survive screen render',
    'document.querySelector("#reading").value==="12,5" && Kontur.state.draft.photo',
  );
  await shot('work-filled-390');
  await goto('work/10428');
  await assert(
    'Draft survives reload',
    'document.querySelector("#reading").value==="12,5" && Kontur.state.draft.photo',
  );
  await click('[data-action="review"]');
  await assert(
    'Review shows actual values',
    'document.querySelector("#app").textContent.includes("12,5") && Boolean(document.querySelector("[data-action=complete]"))',
  );
  await shot('review-filled-390');
  await evaluate('Kontur.state.offline=true');
  await click('[data-action="complete"]');
  await assert(
    'Offline completion does not become executed',
    'Kontur.request().status==="IN_PROGRESS" && document.querySelector("#app").textContent.includes("Ожидает отправки")',
  );
  await shot('complete-offline-390');
  await evaluate('location.hash="#work/10428"');
  await settle();
  await assert(
    'Pending completion locks editing',
    'Kontur.state.screen==="complete" && !document.querySelector("#reading")',
  );
  await goto('review/10428');
  await click('[data-action="complete"]');
  await assert('Online completion reaches confirmed outcome', 'Kontur.request().status==="EXECUTED"');
  await click('.bottom-nav a[href="#queue"]');
  await assert(
    'Completed request leaves active queue',
    'Kontur.activeRequests().length===4 && !document.querySelector(".focus-card")',
  );
  await click('a[href="#profile"]');
  await click('a[href="#history"]');
  await assert('Completed request appears in history', 'document.querySelectorAll(".request-card").length===2');
  await goto('delay/10430');
  await click('[data-action="save-delay"]');
  await assert('Delay requires notification photo', 'Kontur.state.screen==="delay"');
  await click('[data-action="delay-photo"]');
  await click('[data-action="demo-photo"]');
  await input('#delay-comment', 'Абонент не отвечает');
  await shot('delay-filled-390');
  await click('[data-action="save-delay"]');
  await assert(
    'Delay saves and returns to request',
    'Kontur.state.screen==="detail" && Kontur.request().status==="DELAYED"',
  );
  await goto('chat/10428');
  await input('#message-text', 'Проверил номер пломбы');
  await click('[type="submit"]');
  await assert(
    'Chat sends typed text',
    'document.querySelector("#messages").textContent.includes("Проверил номер пломбы")',
  );
  await click('a[href="#attachments/10428"]');
  await click('[data-action="demo-file"]');
  await shot('attachments-selected-390');
  await click('a.btn[href="#chat/10428"]');
  await click('[type="submit"]');
  await assert('Chat sends attachment', 'document.querySelector("#messages").textContent.includes("Акт замены.pdf")');
  await click('a[href="#attachments/10428"]');
  await click('[data-action="demo-file"]');
  await evaluate('location.hash="#chat/10430"');
  await settle();
  await assert('Attachments do not leak into another request', 'Kontur.state.attachments.length===0');
  await evaluate('location.hash="#chat/10428"');
  await settle();
  await assert('Attachment draft returns with its request', 'Kontur.state.attachments.length===1');
  await evaluate('Kontur.state.attachments=[]');
  await evaluate(
    `(()=>{const input=document.querySelector('#file-picker');const dt=new DataTransfer();dt.items.add(new File(['local test document'],'Локальный акт.txt',{type:'text/plain'}));input.files=dt.files;Kontur.state.attachmentContext='chat';input.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await settle();
  await assert(
    'Local file picker keeps filename and blob on device',
    'Kontur.state.attachments[0].name==="Локальный акт.txt" && Kontur.state.attachments[0].url.startsWith("blob:")',
  );
  await click('.composer [data-action="preview-file"][data-file-id]');
  await assert(
    'Preview uses actual selected filename',
    'document.querySelector("#sheet").textContent.includes("Локальный акт.txt")',
  );
  await click('[data-action="close-sheet"]');
  await click('[data-remove-file]');
  await assert('Attachment can be removed before sending', 'Kontur.state.attachments.length===0');
  await evaluate('Kontur.state.offline=true');
  await input('#message-text', 'Отправлю при появлении сети');
  await click('[type="submit"]');
  await assert('Offline chat remains queued', 'Kontur.state.messages[10428].at(-1).status==="queued"');
  await shot('chat-offline-390');
  await goto('sync', '?embed=1&theme=light&offline=1');
  await click('[data-action="retry-sync"]');
  await assert('Offline retry does not fake success', '!Kontur.state.syncRetried');
  await goto('queue');
  await click('a[href="#profile"]');
  await assert('Bottom nav opens profile', 'Kontur.state.screen==="profile"');
  await call('Page.navigateToHistoryEntry', {entryId: (await call('Page.getNavigationHistory')).entries.at(-2).id});
  await settle();
  await assert('Browser back restores screen', 'Kontur.state.screen==="queue"');
  await goto('work');
  await click('[data-action="scan"]');
  await assert(
    'Dialog opens with focus inside',
    'document.querySelector("#sheet").open && document.querySelector("#sheet").contains(document.activeElement)',
  );
  await call('Input.dispatchKeyEvent', {type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27});
  await call('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27});
  await assert('Escape closes dialog', '!document.querySelector("#sheet").open');
  await evaluate('document.querySelector(".scroll-content").scrollTop=200');
  await click('a[href="#chat/10428"]');
  await evaluate('location.hash="#work/10428"');
  await settle();
  await assert(
    'Returning from chat restores form scroll and data',
    'document.querySelector(".scroll-content").scrollTop>=190 && document.querySelector("#reading").value==="12,5"',
  );
  await goto('chat/10428', '?theme=light');
  await click('[data-action="simulate-failure"]');
  await assert('Failed message offers retry', 'Boolean(document.querySelector("[data-retry-message]"))');
  await click('[data-retry-message]');
  await assert('Retry changes only failed message', 'Kontur.state.messages[10428].at(-1).status==="delivered"');
  await size(390, 600);
  await goto('work');
  await assert(
    'Short viewport keeps primary action accessible',
    'document.querySelector(".actionbar").getBoundingClientRect().bottom<=innerHeight',
  );
  await shot('work-short-390');
  await size(390, 844);
  for (const screen of ['queue', 'work', 'chat', 'sync']) {
    await goto(screen, '?embed=1&theme=dark');
    await shot(screen + '-dark-390');
  }
  await require('./notifications.cjs')({goto, click, input, evaluate, assert, shot, settle});
  await size(1440, 1024);
  await goto('queue', '?theme=light');
  await shot('catalog-1440');
  await captureComparison();
  await size(1440, 2320);
  await call('Page.navigate', {url: pathToFileURL(path.join(root, 'notifications.html')).href});
  await new Promise((r) => setTimeout(r, 700));
  await settle();
  await shot('notifications-overview-1440');
  const report = {
    date: '2026-11-19',
    screens: screens.length,
    layoutChecks: layouts.length,
    layouts,
    checks,
    errors,
    passed:
      errors.length === 0 &&
      checks.every((c) => c.ok) &&
      layouts.every((l) => !l.document && !l.content && !l.overflowing.length),
  };
  fs.writeFileSync(path.join(__dirname, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {passed: report.passed, screens: screens.length, layouts: layouts.length, scenarios: checks.length, errors},
      null,
      2,
    ),
  );
  if (!report.passed) process.exitCode = 1;
})()
  .catch((e) => {
    console.error(e.stack);
    fs.writeFileSync(
      path.join(__dirname, 'report.json'),
      JSON.stringify({passed: false, checks, layouts, errors, error: e.message}, null, 2) + '\n',
    );
    process.exitCode = 1;
  })
  .finally(() => chrome.kill());
