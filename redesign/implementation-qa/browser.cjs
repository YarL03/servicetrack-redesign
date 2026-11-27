/* Dependency-free Chrome DevTools Protocol validation of the local mockups. */
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname, '..');
const browserPath = process.env.REDESIGN_BROWSER || '/home/yaroslav/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
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
    } else if (m.method === 'Fetch.requestPaused') { handleRequest(m.params).catch(e => exceptions.push(String(e))); } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') { exceptions.push(m.params.args.map(x => x.description || x.value).join(' ')); } else if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
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
const output = path.resolve(__dirname, 'screenshots');
fs.mkdirSync(output, {recursive: true});
const requests = [];
const user = {id: 1, uid: 'qa', firstName: 'Алексей', lastName: 'Кузнецов', patronymic: '', userLogin: 'qa', email: 'qa@example.test', roles: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_PROJECT_MANAGER', 'ROLE_VIEWER'], companyId: 'qa-company', isActive: true, needToChangePasswd: false};
const company = {id: 'qa-company', fullCompanyName: 'Энергосервис', shortCompanyName: 'Энергосервис', inn: '3800000000', partyType: 'COMPANY', tariff: {status: 'ACTIVE', name: 'Команда', maxUserCount: 50, currentUserCount: 3}};
const serviceType = {id: 1, code: 'ELECTRICITY_METER', name: 'Замена прибора учёта', forServiceRequest: true, iconName: 'default', higherCode: null};
const contract = {id: 48, contractNumber: 'ЭС-2026/048', companyId: company.id, companyName: company.fullCompanyName, statusCode: 'PROCESSING', serviceType, counter: 48, deviceType: serviceType};
const request = {id: 10428, statusCode: 'IN_PROGRESS', fullAddress: 'Иркутск, ул. Лермонтова, 78, кв. 42', address: {id: 'address', fullAddress: 'Иркутск, ул. Лермонтова, 78, кв. 42', latitude: '52.2571', longitude: '104.2578'}, companyId: company.id, customer: 'Николай Петров', customerPhone: '+7 (395) 200-14-28', extNumber: '3800128421', serviceType, deviceType: serviceType, contract, contractId: 48, manager: user, workers: [user], startDate: '2026-11-02T09:14:00', plannedDate: '2026-11-20T18:00:00', createdDate: '2026-11-02T09:14:00', description: '', sourceContent: {number: {description: 'Заводской номер', value: '00928174'}, model: {description: 'Модель прибора', value: 'Меркурий 201'}}, workData: {}, taskLocation: {code: 'FLAT', name: 'Квартира'}};
const rows = Array.from({length: 6}, (_, i) => ({id: 10428 + i, statusCode: ['IN_PROGRESS','READY_TO_PROCESS','EXECUTED','DELAYED','CREATED','DONE'][i], fullAddress: `Иркутск, ул. Лермонтова, ${78+i}, кв. ${42+i}`, companyName: company.fullCompanyName, serviceType: serviceType.name, contractNumber: contract.contractNumber, workers: 'Алексей Морозов', manager: 'Алексей Кузнецов', plannedDate: '2026-11-20T18:00:00', createdDate: '2026-11-02T09:14:00'}));
const page = (content) => ({content, totalElements: content.length, totalPages: 1, size: 20, number: 0, numberOfElements: content.length, empty: !content.length});
const history = ['CREATED','READY_TO_PROCESS','IN_PROGRESS'].map((statusCode, i) => ({id: 10428, rev: i, statusCode, author: user, date: `2026-11-0${i+2}T09:14:00`}));
const tree = [{id: 'stage-1', name: 'Данные прибора', availableForEdit: ['ROLE_ADMIN','ROLE_MANAGER'], availableForRoles:['ROLE_ADMIN','ROLE_MANAGER'],availableForStatuses:['IN_PROGRESS'], workContents: [{id: 1, name: 'Серийный номер', type: 'WORK_DATA', inputType: 'STRING', modelName: 'serial', mandatory: false, item: {text: ''}, field:{id:1,name:'Серийный номер',modelName:'serial',metadataType:'WORK_DATA'}}]}];
function fixture(url, method) {
  const p = url.pathname;
  if (p.endsWith('/healthcheck')) return {};
  if (p.endsWith('/logged_in')) return {loggedIn: true, user: [user]};
  if (p.includes('notifications')) return [];
  if (p.includes('/companies/findByIDs')) return [company];
  if (p.endsWith('/companies')) return page([company]);
  if (p.includes('/serviceRequests/findByIds')) return page([request]);
  if (p.endsWith('/statuses') && p.includes('/serviceRequests/')) return history;
  if (p.endsWith('/contentTree')) return tree;
  if (p.includes('/delayReasons')) return page([]);
  if (p.includes('/serviceRequests/list')) return page(rows);
  if (p.endsWith('/serviceRequests')) return page([request]);
  if (p.includes('/filtersSets')) return page([]);
  if (p.includes('/service/types') || p.includes('/serviceTypes') || p.includes('/deviceTypes')) {
    if (p.includes('/statuses')) return history.map((s, i) => ({statusCode: s.statusCode, statusName: ['Создана','Назначена','Выполняется'][i], sortOrder: i}));
    if (p.endsWith('/my')) return [serviceType];
    if (p.endsWith('/ELECTRICITY_METER')) return serviceType;
    return page([serviceType]);
  }
  if (p.includes('/dashboard')) return {contracts: [], totals: {lastStatuses: [{status:'IN_PROGRESS',count:26},{status:'DONE',count:38}], statuses: [{status: 'IN_PROGRESS', count: 26}, {status:'DONE', count:38}], total:64}};
  if (p.includes('/contracts')) return page([contract]);
  if (p.includes('/accounts')) return page([user]);
  if (p.includes('/workStages') || p.includes('/servicePath')) return {'1': [{id: 1,stageId: 1,stage:{name:'Данные прибора',needToPreSave:false},name:'Серийный номер',inputType:'STRING',modelName:'serial',mandatory:false,editable:true}]};
  if (p.includes('/dicts/')) return page([]);
  if (p.includes('/tariff')) return [];
  return page([]);
}
async function handleRequest({requestId, request: req, resourceType}) {
  const u = new URL(req.url);
  if (u.origin === 'http://127.0.0.1:4173' && !u.pathname.startsWith('/api/') && ['Document','Script','Stylesheet','Image','Font','Other'].includes(resourceType)) return c('Fetch.continueRequest', {requestId});
  requests.push({path: u.pathname, method: req.method, query:u.search});
  if(req.method === 'OPTIONS') return c('Fetch.fulfillRequest',{requestId,responseCode:204,responseHeaders:[{name:'Access-Control-Allow-Origin',value:'http://127.0.0.1:4173'},{name:'Access-Control-Allow-Credentials',value:'true'},{name:'Access-Control-Allow-Methods',value:'GET,POST,PUT,DELETE,OPTIONS'},{name:'Access-Control-Allow-Headers',value:req.headers['Access-Control-Request-Headers']||req.headers['access-control-request-headers']||'content-type,authorization'}]});
  const body = fixture(u, req.method);
  await c('Fetch.fulfillRequest', {requestId, responseCode: 200, responseHeaders: [{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'http://127.0.0.1:4173'},{name:'Access-Control-Allow-Credentials',value:'true'}], body: Buffer.from(JSON.stringify(body)).toString('base64')});
}
async function navigate(route) {
  if (!await evaluate("!!document.querySelector('main')")) {
    await c('Page.navigate', {url: 'http://127.0.0.1:4173/'});
    for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,100));if(await evaluate("!!document.querySelector('main')"))break;}
  }
  await evaluate(`history.pushState({}, '', ${JSON.stringify(route)});dispatchEvent(new PopStateEvent('popstate'));`);
  for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,100));if(await evaluate("document.querySelector('main') && !document.querySelector('main [role=progressbar]')"))break;}
  await new Promise(r=>setTimeout(r,700));
}
(async()=>{
  const {targetId}=await call('Target.createTarget',{url:'about:blank'});
  ({sessionId:session}=await call('Target.attachToTarget',{targetId,flatten:true}));
  await c('Page.enable'); await c('Runtime.enable'); await c('Fetch.enable',{patterns:[{urlPattern:'*'}]});
  const report=[];
  for(const route of (process.argv.includes('--interactions') ? [] : process.argv.includes('--dashboard') ? ['/'] : process.argv.includes('--focused') ? ['/serviceRequests','/contracts'] : process.argv.includes('--debug') ? ['/serviceRequests/10428'] : ['/serviceRequests','/serviceRequests/10428','/serviceRequests/new','/users','/customers','/customers/addCompany','/contracts','/contracts/addContract','/reports','/reports/executed','/reports/universal','/dictionaries','/dictionaries/deviceTypes','/dictionaries/taskLocations','/dictionaries/reasonRejections','/dictionaries/deviceModels','/dictionaries/devices','/dictionaries/deviceTypes/ELECTRICITY_METER','/settings','/settings/importDevices','/'])) {
    await c('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await navigate(route);
    if(process.argv.includes('--dark')) {await evaluate(`document.querySelector('button[aria-label="Включить тёмную тему"]')?.click()`);await settle();}
    for(const width of (process.argv.includes('--debug') ? [1440] : [1440,1024,768,390,320])) {
      await c('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false}); await settle();
      const state=await evaluate(`({pathname:location.pathname,title:document.title,text:document.body.innerText.slice(0,4000),errors:[...document.querySelectorAll('.toast-container .Toastify__toast')].map(e=>e.innerText),overflow:document.documentElement.scrollWidth>innerWidth+1,scrollWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme})`);
      report.push({route,width,...state});
      const shot=await c('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,route.replaceAll('/','_')+'-'+width+(process.argv.includes('--dark')?'-dark':'')+'.png'),Buffer.from(shot.data,'base64'));
    }
  }
  const interactions = [];
  if (process.argv.includes('--interactions')) {
    const check = async (name, expression) => { const passed = !!await evaluate(expression); interactions.push({name,passed}); if (!passed) throw new Error('Failed: '+name); };
    const resize=async(width)=>{await c('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await settle();};
    const clickText=async(text)=>{await evaluate(`[...document.querySelectorAll('button,[role=menuitem]')].find(e=>e.innerText.trim()===${JSON.stringify(text)})?.click()`);await new Promise(r=>setTimeout(r,150));};
    await resize(1440);await navigate('/serviceRequests/10428');
    await check('Request content loaded',`document.querySelector('main').innerText.includes('Заявка № 10428') && !document.querySelector('.Toastify__toast')`);
    await evaluate(`window.qaInput=document.querySelector('main textarea:not([aria-hidden])');window.qaInput.focus()`);await c('Input.insertText',{text:'Проверка сохранения комментария'});
    await evaluate(`document.querySelector('button[aria-label="Включить тёмную тему"]').click()`);await settle();
    await check('Theme preserves comment DOM and value',`document.documentElement.dataset.theme==='dark' && document.querySelector('main textarea:not([aria-hidden])')===window.qaInput && window.qaInput.value==='Проверка сохранения комментария'`);
    await resize(390);
    await check('Resize preserves comment',`document.querySelector('main textarea:not([aria-hidden])')===window.qaInput && window.qaInput.value==='Проверка сохранения комментария'`);
    await check('Context collapses on mobile',`!document.querySelector('main details').open`);
    await evaluate(`document.querySelector('main details summary').click()`);await check('Context opens without replacing input',`document.querySelector('main details').open && window.qaInput.isConnected`);
    await resize(1024);await evaluate(`document.querySelector('button[aria-label="Открыть меню"]').click()`);await new Promise(r=>setTimeout(r,350));
    await check('Tablet Drawer has visible navigation labels',`[...document.querySelectorAll('.MuiDrawer-paper nav a')].some(e=>e.innerText.includes('Заявки') && getComputedStyle(e.querySelector('span')).display!=='none')`);
    await evaluate(`document.querySelector('button[aria-label="Закрыть меню"]').click()`);await resize(320);await settle();
    await check('No request overflow at 320',`document.documentElement.scrollWidth<=innerWidth+1`);
    await evaluate(`document.querySelector('button[aria-label="Меню пользователя"]').click()`);await new Promise(r=>setTimeout(r,200));await clickText('Выйти');
    await check('Logout confirmation opens',`!!document.querySelector('[role=dialog]')`);
    await evaluate(`window.qaDialog=document.querySelector('[role=dialog]');document.querySelector('button[aria-label="Включить светлую тему"]').click()`);await settle();
    await check('Theme preserves open dialog',`document.querySelector('[role=dialog]')===window.qaDialog && document.documentElement.dataset.theme==='light'`);
    await check('Dialog fits 320',`(()=>{const r=window.qaDialog.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1})()`);
    await clickText('Отменить'); await clickText('Отмена');
    await c('Page.reload');await new Promise(r=>setTimeout(r,1200));await navigate('/serviceRequests');await resize(390);
    await check('Mobile request cards are links',`!!document.querySelector('article a[href="/serviceRequests/10428"]') && !document.querySelector('[role=grid]')`);
    await check('Mobile filters initially collapsed',`document.querySelector('main .MuiAccordionSummary-root').getAttribute('aria-expanded')==='false'`);
    await evaluate(`window.qaFilterContent=document.querySelector('main .MuiAccordionDetails-root');document.querySelector('main .MuiAccordionSummary-root').click()`);await new Promise(r=>setTimeout(r,350));
    await check('Filters open with existing DOM',`document.querySelector('main .MuiAccordionSummary-root').getAttribute('aria-expanded')==='true' && document.querySelector('main .MuiAccordionDetails-root')===window.qaFilterContent`);
    await evaluate(`document.querySelector('main .MuiAccordionSummary-root').click()`);await new Promise(r=>setTimeout(r,350));
    await evaluate(`document.querySelector('[aria-labelledby="request-sort-label"]').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}))`);await settle();
    await evaluate(`[...document.querySelectorAll('[role=option]')].find(e=>e.getAttribute('data-value')==='plannedDate:asc').click()`);await new Promise(r=>setTimeout(r,700));
    interactions.push({name:'Mobile sort requests server',passed:requests.some(r=>r.path.endsWith('/serviceRequests/list')&&r.query.includes('plannedDate'))});
    await resize(1440);await check('Desktop grid restored',`!!document.querySelector('[role=grid]') && !document.querySelector('article a[href="/serviceRequests/10428"]')`);
    await evaluate(`document.querySelector('[role=row][data-id="10428"] [role=gridcell]').focus()`);await c('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await c('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await new Promise(r=>setTimeout(r,800));
    await check('Grid keyboard opens request',`location.pathname==='/serviceRequests/10428'`);
    await clickText('Информация об объекте');await settle();await clickText('Данные прибора  (0 файлов)');
    await check('Working data tab available',`document.querySelector('main').innerText.includes('Рабочие данные')`);
  }
  fs.writeFileSync(path.join(__dirname,process.argv.includes('--interactions')?'interactions.json':process.argv.includes('--dashboard')?(process.argv.includes('--dark')?'dashboard-dark.json':'dashboard-light.json'):process.argv.includes('--focused')?(process.argv.includes('--dark')?'focused-dark.json':'focused-light.json'):process.argv.includes('--dark')?'report-dark.json':'report.json'),JSON.stringify({report,exceptions,requests,interactions},null,2));
  if(exceptions.length || report.some(x=>x.overflow||x.errors.length||x.pathname!==x.route||x.theme!==(process.argv.includes('--dark')?'dark':'light')) || interactions.some(x=>!x.passed)) process.exitCode=1;
  console.log(JSON.stringify({screens:report.length,overflow:report.filter(x=>x.overflow).map(({route,width})=>({route,width})),errors:report.filter(x=>x.errors.length||x.pathname!==x.route).map(x=>({route:x.route,width:x.width,errors:x.errors,pathname:x.pathname})),interactions,exceptions,requests:[...new Set(requests.map(r=>r.path))]},null,2));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>chrome.kill());
