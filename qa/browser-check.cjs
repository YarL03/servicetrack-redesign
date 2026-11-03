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
const themeArg = process.argv.find(arg => arg.startsWith('--theme='));
const theme = themeArg ? themeArg.slice('--theme='.length) : 'light';
if (!['light', 'dark'].includes(theme)) throw new Error('Use --theme=light or --theme=dark');
const otherTheme = theme === 'dark' ? 'light' : 'dark';
const reportPrefix = theme === 'dark' ? 'dark-' : '';
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
    const preview = frameTree.childFrames?.find(item => item.frame.url.includes('/v3/index.html'));
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
  const report = {theme, modalChecks: 0, modalFailures: [], colorChecks: 0, colorFailures: [], date: '2026-11-03', browser: await call('Browser.getVersion'), mode: captureOnly ? 'capture' : full ? 'full' : 'quick', checks: 0, widths: full ? [320, 390, 599, 600, 768, 899, 900, 1024, 1199, 1200, 1440, 1535, 1536, 1920] : [390, 1440], screens: [], failures: [], interactions: [], screenshots: []};
  const allSizes = captureOnly ? [390, 768, 1024, 1440, 1920] : report.widths;
  const interaction = async (variant, check, expression) => report.interactions.push({...(variant ? {variant} : {}), check, pass: Boolean(await evaluate(expression))});
  for (const variant of ['v1', 'v2', 'v3']) {
    await size(1440);
    await navigate(localUrl(`${variant}/index.html`));
    await interaction(variant, 'explicit theme query applies on load', `document.documentElement.dataset.theme===${JSON.stringify(theme)}&&RDTheme.get()===${JSON.stringify(theme)}`);
    const all = await evaluate('RD.screens.map(({id,title,group,kind})=>({id,title,group,kind}))');
    if (!report.screens.length) report.screens = all;
    const ids = captureOnly ? ['dashboard', 'requests', 'request-object', 'work-builder'] : full ? all.map(item => item.id) : ['dashboard', 'requests', 'request-object', 'work-builder', 'users', 'profile', 'tariffs', 'registration'];
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
          return {theme:document.documentElement.dataset.theme,overflow:document.documentElement.scrollWidth>innerWidth+2,documentWidth:document.documentElement.scrollWidth,missing:[...new Set(missing)],bad,heading:document.querySelector('h1')?.textContent,body:document.querySelector('.page-content')?.innerText.length};
        })()`);
        report.checks++;
        if (state.theme !== theme || state.overflow || state.missing.length || state.bad.length || !state.heading || !state.body || exceptions.length > errorsBefore) report.failures.push({variant, width, id, ...state, exceptions: exceptions.slice(errorsBefore)});
        if (theme === 'dark') {
          const colors = await evaluate(darkColorCheck);
          report.colorChecks++;
          if (colors.length) report.colorFailures.push({variant, width, id, colors});
        }
        if (pictures && [390, 768, 1024, 1440, 1920].includes(width) && ['dashboard', 'requests', 'request-object', 'work-builder'].includes(id)) {
          const file = `${variant}/${screenshotDirectory}/${id}-${width}.png`;
          await capture(path.join(root, file));
          report.screenshots.push(file);
        }
      }
      console.log(`${variant} · ${theme} · ${width}px · ${ids.length} screens checked`);
    }
    await size(390);
    await screen('requests');
    await evaluate(`document.querySelector('[data-action="menu"]').click()`);
    await settle();
    await interaction(variant, 'mobile drawer', `document.body.classList.contains('menu-open')&&document.querySelector('.sidebar').getBoundingClientRect().left>=-1`);
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
  await evaluate(`document.querySelector('[data-variant="v3"]').click();document.querySelector('[data-width="390"]').click();document.querySelector('[data-screen="request-object"]').click()`);
  await settle();
  await interaction(null, 'gallery selects variant, screen, width and theme', `document.getElementById('preview-frame').getAttribute('src')===${JSON.stringify(`v3/index.html?theme=${theme}#request-object`)}&&document.getElementById('preview-frame').style.width==='390px'`);
  await evaluate(`const s=document.getElementById('screen-search');s.value='тариф';s.dispatchEvent(new Event('input'))`);
  await interaction(null, 'gallery search', `document.querySelectorAll('[data-screen]').length>0&&document.querySelectorAll('[data-screen]').length<RD.screens.length`);
  // Use a CDP isolated world to inspect the real child DOM even under file:// SOP.
  const previewContext = await previewExecutionContext();
  await evaluate(`document.querySelector('[data-action="go:request-object-edit"]').click()`, previewContext);
  if (!await waitForCondition(`document.body.dataset.screen==='request-object-edit'`, previewContext)) throw new Error('Preview form did not open');
  await evaluate(`window.__qaThemeField=document.querySelector('main input[type="text"]:not([readonly])');window.__qaThemeField.value='QA iframe draft';window.__qaThemePage=document.querySelector('.page-content');window.__qaThemeField.dataset.qaThemeMarker='retained'`, previewContext);
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
  await evaluate(`document.querySelector('.preview-toolbar').scrollIntoView({block:'start'})`);
  await settle();
  await interaction(null, 'gallery theme controls fit 320px viewport', `document.documentElement.scrollWidth<=innerWidth+2&&[document.querySelector('[data-theme-toggle]'),document.getElementById('open-screen')].every(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1})`);
  await size(1440);
  await evaluate('window.scrollTo(0,0)');
  await settle();
  if (pictures) {
    await evaluate(`document.getElementById('screen-search').value='';document.getElementById('screen-search').dispatchEvent(new Event('input'));document.querySelector('[data-variant="v1"]').click();document.querySelector('[data-width="1440"]').click();document.querySelector('[data-screen="dashboard"]').click()`);
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
