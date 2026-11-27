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
const user = {id: 1, uid: 'qa', firstName: 'Алексей', lastName: 'Кузнецов', patronymic: '', userLogin: 'qa', email: 'qa@example.test', roles: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_PROJECT_MANAGER', 'ROLE_VIEWER'], companyId: 'qa-company', active: true, phoneNumber: '+7 (999) 123-45-67', isActive: true, needToChangePasswd: false};
const company = {id: 'qa-company', fullCompanyName: 'Энергосервис', shortCompanyName: 'Энергосервис', inn: '7707083893', ogrn: '1027700132195', kpp: '773601001', email: 'qa@example.test', phone: '+7 (999) 123-45-67', partyType: 'COMPANY', balance: 12450, innerContracts:[{id:'inner-1',innerNumber:'48',startDate:'2026-01-01',endDate:'2026-12-31'}], tariff: {status: 'ACTIVE', title: 'Команда', usedDiskSpace: 6871947673, diskSpace: 10737418240, tariffEndDate: '2026-11-30', maxUserCount: 50, currentUserCount: 3}};
const serviceType = {id: 1, code: 'ELECTRICITY_METER', name: 'Замена прибора учёта', forServiceRequest: true, iconName: 'default', higherCode: null};
const contract = {id: 48, contractNumber: 'ЭС-2026/048', companyId: company.id, companyName: company.fullCompanyName, statusCode: 'PROCESSING', startDate:'2026-10-01',dueDate:'2026-12-31',description:'Работы по обслуживанию приборов учёта',serviceType, counter: 48, deviceType: serviceType};
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
  if (p.includes('/contracts/findByIDs') || p.includes('/contracts/findByIds')) return [contract];
  if (p.endsWith('/documents') || p.endsWith('/imports')) return page([]);
  if (p.includes('/contracts')) return page([contract]);
  if (p.endsWith('/accounts/findByUids')) return [user];
  if (p.endsWith('/accounts/qa')) return user;
  if (p.includes('/accounts')) return page([user]);
  if (p.endsWith('/persons')) return [];
  if (p.includes('/workStages') || p.includes('/servicePath')) return {'1': [{id: 1,stageId: 1,stage:{name:'Данные прибора',needToPreSave:false},name:'Серийный номер',inputType:'STRING',modelName:'serial',mandatory:false,editable:true}]};
  if (p.includes('/contract/locations') || p.includes('/sr/rejections')) { const item = {id: 1, code: p.includes('/locations') ? 'FLAT' : 'NO_ACCESS', name: p.includes('/locations') ? 'Квартира' : 'Нет доступа к объекту', description: 'Описание записи'}; return url.searchParams.has('code') ? item : page([item]); }
  if (p.endsWith('/models')) return page([{id:1,model:'Меркурий 201',fazesCount:1,tariffsCount:1,years:16,deviceType:1}]);
  if (p.endsWith('/devices')) return page([{id:1,serial:'00928174',createdYear:2024,model:{id:1,model:'Меркурий 201',fazesCount:1,tariffsCount:1,years:16},deviceStatus:{id:1,status:'FREE',moderationNeeds:false},t1:0,t2:0,t3:0}]);
  if (p.includes('/dicts/')) return page([]);
  if (p.includes('/tariff')) return ['Старт', 'Команда', 'Компания'].map((title, i) => ({id: i+1, title, sortOrder: i, diskSpace: (i+1)*5*1024**3, description:'Работа с заявками\nРабочие формы', durations: [{id:1, period:'1M',price:1000*(i+1)},{id:2,period:'6M',price:900*(i+1)},{id:3,period:'1Y',price:800*(i+1)}]}));
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
  for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,100));if(await evaluate("document.querySelector('main') && !document.querySelector('main .MuiCircularProgress-root')"))break;}
  await new Promise(r=>setTimeout(r,700));
}
async function runInteractions() {
  const results=[];
  const assert=async(name, expression)=>{const ok=await waitForCondition(expression);results.push({name,passed:ok});if(!ok){console.log(await evaluate(`({pathname:location.pathname, text:document.querySelector('main')?.innerText, buttons:[...document.querySelectorAll('button')].map(e=>({text:e.textContent,disabled:e.disabled,expanded:e.getAttribute('aria-expanded')})),chips:[...document.querySelectorAll('.MuiChip-root')].map(e=>e.textContent),options:[...document.querySelectorAll('[role="option"]')].map(e=>e.textContent)})`));throw new Error('Проверка не пройдена: '+name);}};
  const click=async text=>{await evaluate(`(()=>{const e=[...document.querySelectorAll('button,a')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw Error('Нет действия: '+${JSON.stringify(text)});e.click();})()`);await settle();};
  const change=async(selector,value)=>{await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Нет поля');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await settle();};
  await c('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await navigate('/profile');
  await change('input[name="fullCompanyName"]','Черновик профиля');
  await assert('Изменение профиля доступно для сохранения', `[...document.querySelectorAll('button')].some(e=>e.textContent==='Сохранить'&&!e.disabled)`);
  await evaluate(`document.querySelector('button[aria-label="Включить тёмную тему"]').click()`);
  await c('Emulation.setDeviceMetricsOverride',{width:390,height:1100,deviceScaleFactor:1,mobile:false}); await settle();
  await assert('Тема и ширина сохраняют черновик', `document.querySelector('input[name="fullCompanyName"]').value==='Черновик профиля'`);
  await click('Отмена');
  await assert('Отмена восстанавливает реквизиты', `document.querySelector('input[name="fullCompanyName"]').value==='Энергосервис'`);
  await c('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});await settle();
  await click('Тариф «Команда»');
  await assert('Тариф в боковой панели открывает страницу', `location.pathname==='/profile/tariffs'`);
  await evaluate(`document.querySelector('nav[aria-label="Хлебные крошки"] a[href="/profile"]').click()`);
  await assert('Хлебные крошки возвращают профиль', `location.pathname==='/profile'`);
  await navigate('/contracts/48?tab=DOCUMENTS');
  await assert('Вкладка документа видна в полном пути', `document.querySelector('nav[aria-label="Хлебные крошки"]').textContent.includes('Документы контракта')`);
  await evaluate(`document.querySelector('nav[aria-label="Хлебные крошки"] a[href="/contracts/48"]').click()`);
  await assert('Ссылка контракта возвращает обзор', `location.pathname==='/contracts/48'&&!location.search&&document.querySelector('main').textContent.includes('Связанные данные')`);
  await click('Сменить заказчика');
  await assert('Из обзора открывается форма смены заказчика', `location.search.includes('EDIT')&&!!document.querySelector('[role="dialog"]')`);
  await c('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await c('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await navigate('/users');
  await click('Добавить пользователя');
  await assert('Добавление пользователя открывает страницу', `location.pathname==='/users/new'&&!!document.querySelector('input[name="firstName"]')`);
  await change('input[name="firstName"]','Тестовый');
  await click('Отмена');
  await assert('Отмена создания возвращает список', `location.pathname==='/users'`);
  await navigate('/serviceRequests');
  await click('Фильтры');
  await assert('Компактный фильтр открывается', `!!document.querySelector('#filterBy-select')&&[...document.querySelectorAll('button')].some(e=>e.textContent==='Фильтры'&&e.getAttribute('aria-expanded')==='true')`);
  await evaluate(`document.querySelector('#filterBy-select').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}))`);
  await assert('Список критериев открыт', `!!document.querySelector('[role="option"]')`);
  await evaluate(`document.querySelector('[role="option"][data-value="status"]').click()`);
  await assert('Доступен выбор статуса', `!!document.querySelector('#predefined-filter-value')`);
  await evaluate(`document.querySelector('#predefined-filter-value').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}))`);
  await assert('Статусы загружены', `!!document.querySelector('[role="option"][data-value="CREATED"]')`);
  await evaluate(`document.querySelector('[role="option"][data-value="CREATED"]').click()`);
  await click('Применить');
  await assert('Применённый фильтр отображается и поповер закрыт', `[...document.querySelectorAll('main .MuiChip-root')].some(e=>e.textContent.includes('Статус'))&&[...document.querySelectorAll('button')].some(e=>e.textContent==='Фильтры'&&e.getAttribute('aria-expanded')==='false')`);
  await click('Сбросить фильтры');
  await assert('Сброс очищает выбранный фильтр', `![...document.querySelectorAll('main .MuiChip-root')].some(e=>e.textContent.includes('Статус'))`);
  await navigate('/serviceRequests/10428');
  await click('Все вложения');
  await assert('Контекст открывает вкладку файлов', `location.search.includes('files')&&document.querySelector('main').textContent.includes('Все вложения · 0')`);
  await evaluate('history.back()');
  await assert('История браузера возвращает рабочую вкладку', `!location.search`);
  await navigate('/dictionaries/deviceModels');
  await click('Добавить модель');
  await assert('Модель создаётся в диалоге', `!!document.querySelector('[role=\"dialog\"]')`);
  await c('Emulation.setDeviceMetricsOverride',{width:390,height:1100,deviceScaleFactor:1,mobile:false});await settle();
  await assert('Диалог модели помещается на телефоне', `document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('[role=\"dialog\"]').scrollWidth<=document.querySelector('[role=\"dialog\"]').clientWidth+1`);
  await evaluate(`document.querySelector('button[aria-label=\"Закрыть\"]').click()`);
  await navigate('/settings');
  await assert('Посадочная настроек содержит импорт без блока приложения', `document.querySelector('main').textContent.includes('Импорт')&&!document.querySelector('main').textContent.includes('Мобильное приложение')`);
  fs.writeFileSync(path.join(__dirname,'interactions.json'),JSON.stringify({results,exceptions},null,2));
  console.log(JSON.stringify({results,exceptions},null,2));
  if(exceptions.length)process.exitCode=1;
}

(async()=>{
  const {targetId}=await call('Target.createTarget',{url:'about:blank'});
  ({sessionId:session}=await call('Target.attachToTarget',{targetId,flatten:true}));
  await c('Page.enable'); await c('Runtime.enable'); await c('Fetch.enable',{patterns:[{urlPattern:'*'}]});
  if (process.argv.includes('--interactions')) return runInteractions();
  const routes = ['/profile','/profile/tariffs','/profile/balance','/profile/balance?tab=documents','/profile/balance?tab=history','/users','/users/new','/users/qa','/serviceRequests','/serviceRequests/new','/serviceRequests/assign','/serviceRequests/10428','/serviceRequests/10428?tab=object','/serviceRequests/10428?tab=files','/serviceRequests/10428?tab=history','/contracts','/contracts/addContract','/contracts/48','/contracts/48?tab=EDIT','/contracts/48?tab=DOCUMENTS','/contracts/48?tab=DATA_IMPORT','/contracts/48?tab=APPLICATIONS','/dictionaries','/dictionaries/deviceTypes','/dictionaries/deviceTypes/ELECTRICITY_METER','/dictionaries/deviceTypes/ELECTRICITY_METER?tab=builder','/dictionaries/taskLocations','/dictionaries/taskLocations/FLAT','/dictionaries/reasonRejections','/dictionaries/reasonRejections/NO_ACCESS','/dictionaries/deviceModels','/dictionaries/devices','/settings','/settings/importDevices'];
  const report=[];
  for(const route of (process.argv.includes('--quick') ? ['/profile','/users/qa','/contracts/48','/dictionaries/deviceTypes/ELECTRICITY_METER','/serviceRequests'] : routes)) {
    await c('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
    await navigate(route);
    const dark = process.argv.includes('--dark');
    await evaluate(`document.querySelector('button[aria-label="${dark?'Включить тёмную тему':'Включить светлую тему'}"]')?.click()`);
    for(const width of (process.argv.includes('--quick') ? [1440,390] : [1440,1024,768,390,320])) {
      await c('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false}); await settle();
      const state=await evaluate(`({pathname:location.pathname+location.search,text:document.querySelector('main')?.innerText.slice(0,6000),breadcrumbs:document.querySelector('nav[aria-label="Хлебные крошки"]')?.innerText,errors:[...document.querySelectorAll('.Toastify__toast--error')].map(e=>e.innerText),overflow:document.documentElement.scrollWidth>innerWidth+1,scrollWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme})`);
      report.push({route,width,...state});
      const shot=await c('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,route.replaceAll('/','_').replaceAll('?','_').replaceAll('=','_')+'-'+width+(dark?'-dark':'')+'.png'),Buffer.from(shot.data,'base64'));
    }
  }
  fs.writeFileSync(path.join(__dirname,process.argv.includes('--quick') ? (process.argv.includes('--dark') ? 'report-quick-dark.json' : 'report-quick.json') : (process.argv.includes('--dark') ? 'report-dark.json' : 'report.json')),JSON.stringify({report,exceptions,requests},null,2));
  console.log(JSON.stringify({screens:report.length,issues:report.filter(x=>x.overflow||x.errors.length||!x.text||x.pathname!==x.route),exceptions,requests:[...new Set(requests.map(r=>r.path))]},null,2));
  if(exceptions.length || report.some(x=>x.overflow||x.errors.length||!x.text||x.pathname!==x.route)) process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>chrome.kill());
