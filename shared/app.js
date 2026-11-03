(() => {
 const R=window.RD, variant=document.body.dataset.variant || 'v1';
 const names={v1:'Контур',v2:'Пульт',v3:'Маршрут'};
 const nav=[['Обзор','dashboard','home'],['Заявки','requests','list'],['Контракты','contracts','file'],['Отчёты','reports','grid'],['Пользователи','users','users'],['Компании','companies','company'],['Справочники','dictionaries','grid'],['Настройки','settings','settings']];
 let current, previousFocus, previousScreen;
 const navHtml=()=>nav.map(([label,id,icon])=>`<a href="#${id}" class="nav-link ${current.group===label?'active':''}" ${current.group===label?'aria-current="page"':''}>${R.icon(icon)}<span>${label}</span>${id==='requests'?'<em>248</em>':''}</a>`).join('');
 function showToast(text) {const el=document.getElementById('toast');el.textContent=text;el.classList.add('visible');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>el.classList.remove('visible'),4000);}
 function render(screenId) {
   closeModal();
   const id=typeof screenId==='string'?screenId:decodeURIComponent(location.hash.slice(1)||'dashboard');
   if(current && current.id!==id) previousScreen=current.id;
   current=R.screens.find(s=>s.id===id)||R.screens.find(s=>s.id==='state-not-found');
   document.title=`${current.title} · ${names[variant]} · Сервис Трек`;
   document.body.classList.remove('menu-open');
   document.body.dataset.screen=current.id;
   const body=current.render();
   document.getElementById('app').innerHTML=`<a class="skip-link" href="#main-content">К содержимому</a>
   <div class="app-shell"><aside class="sidebar" id="navigation"><a href="#dashboard" class="brand"><span class="brand-mark">${R.icon('check')}</span><span>Сервис Трек<small>Управление работами</small></span></a><div class="workspace"><span class="workspace-avatar">Э</span><span>Энергосервис<small>Рабочее пространство</small></span>${R.icon('chevron')}</div><nav class="main-nav" aria-label="Основная навигация">${navHtml()}</nav><div class="sidebar-bottom"><div class="storage-label"><span>Хранилище</span><b>6,4 / 10 ГБ</b></div><div class="progress"><span style="width:64%"></span></div><a href="#tariffs" class="plan-link">Тариф «Команда» ${R.icon('arrow')}</a><a href="#profile" class="profile-link"><span class="avatar">АК</span><span>Алексей Кузнецов<small>Администратор</small></span>${R.icon('more')}</a></div></aside>
   <div class="menu-overlay" data-action="menu" aria-hidden="true"></div>
   <div class="workspace-main"><header class="topbar"><button class="icon-button menu-button" data-action="menu" aria-label="Открыть меню" aria-expanded="false">${R.icon('menu')}</button><div class="breadcrumb"><span class="breadcrumb-workspace">Рабочее пространство</span><span class="breadcrumb-separator">/</span> <b>${R.esc(current.group)}</b></div><div class="topbar-actions"><span class="today">3 ноября 2026</span><button type="button" class="icon-button theme-toggle" data-theme-toggle aria-label="Тёмная тема" aria-pressed="false"></button><button class="icon-button notification-button" data-action="modal:notifications" aria-label="Уведомления, 2 новых">${R.icon('bell')}<i></i></button><button class="avatar avatar-button" data-action="modal:profile" aria-label="Профиль компании">АК</button></div></header>
   <main id="main-content" tabindex="-1"><div class="page-heading"><div class="heading-copy"><p class="eyebrow">${R.esc(current.subtitle||'Энергосервис · Иркутск')}</p><h1>${R.esc(current.title)}</h1></div><div class="heading-actions">${current.primary?R.button(current.primary[0],current.primary[1],'primary'):''}</div></div>${current.tabs?`<nav class="tabs" aria-label="Разделы страницы">${current.tabs.map(([label,id])=>`<a href="#${id}" class="${id===current.id?'active':''}" ${id===current.id?'aria-current="page"':''}>${label}</a>`).join('')}</nav>`:''}<div class="page-content ${current.kind==='dialog'?'dialog-preview':current.kind==='auth'?'auth-preview':''}">${body}</div><footer class="page-footer"><span>Сервис Трек</span><span>Демонстрационные данные · ${names[variant]}</span></footer></main></div></div>
   <nav class="mobile-nav" aria-label="Быстрые переходы">${nav.slice(0,4).map(([label,id,icon])=>`<a href="#${id}" class="${current.group===label?'active':''}">${R.icon(icon)}<span>${label}</span></a>`).join('')}</nav>
   <div class="demo-bar"><a href="../index.html" data-theme-link>${R.icon('grid')}<span>Каталог макетов</span></a><span class="variant-label">${variant.toUpperCase()} · ${names[variant]}</span><label><span class="sr-only">Открыть экран</span><select id="screen-select">${R.screens.map(s=>`<option value="${s.id}" ${s.id===current.id?'selected':''}>${R.esc(s.group)} · ${R.esc(s.title)}</option>`).join('')}</select></label><span class="viewport-label" id="viewport-label"></span></div>`;
   window.RDTheme.syncControls();window.scrollTo(0,0);updateWidth();
   document.dispatchEvent(new CustomEvent('rd:render',{detail:{screen:current.id}}));
 }
 function updateWidth(){const el=document.getElementById('viewport-label'); if(el){let w=innerWidth;el.textContent=`${w}px · ${w<600?'xs':w<900?'sm':w<1200?'md':w<1536?'lg':'xl'}`;}}
 function openModal(id){
   const screen=R.screens.find(s=>s.id===id);if(!screen){showToast('Экран не найден: '+id);return;}
   closeModal();previousFocus=document.activeElement;
   const modal=document.getElementById('modal'); modal.innerHTML=`<div class="modal-heading"><div><span class="eyebrow">${R.esc(screen.group)}</span><h2 id="modal-title">${R.esc(screen.title)}</h2></div><button class="icon-button" data-action="close" aria-label="Закрыть диалог">${R.icon('close')}</button></div><div class="modal-body">${screen.render()}</div>`;
   modal.showModal();document.body.classList.add('dialog-open');
   modal.querySelector('input:not([type=file]), select, button')?.focus();
   document.dispatchEvent(new CustomEvent('rd:modal',{detail:{screen:id}}));
 }
 function closeModal(){const modal=document.getElementById('modal');if(modal?.open){modal.close();document.body.classList.remove('dialog-open');previousFocus?.focus();}}
 document.body.insertAdjacentHTML('beforeend','<dialog id="modal" aria-labelledby="modal-title"></dialog><div id="toast" role="status" aria-live="polite"></div>');
 document.getElementById('modal').addEventListener('click',e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
 document.getElementById('modal').addEventListener('close',()=>document.body.classList.remove('dialog-open'));
 document.addEventListener('click',e=>{
   if(e.target.closest('.skip-link')){e.preventDefault();document.getElementById('main-content').focus();return;}
   const button=e.target.closest('[data-action]');if(!button)return;
   const action=button.dataset.action;
   if(action.startsWith('go:'))location.hash=action.slice(3);
   else if(action.startsWith('modal:'))openModal(action.slice(6));
   else if(action.startsWith('toast:')){closeModal();showToast(action.slice(6));}
   else if(action==='close'){if(document.getElementById('modal').open)closeModal();else location.hash=current.group==='Система'?'dashboard':nav.find(n=>n[0]===current.group)?.[1]||'dashboard';}
   else if(action==='back'){if(document.getElementById('modal').open)closeModal();else location.hash=previousScreen||nav.find(n=>n[0]===current.group)?.[1]||'dashboard';}
   else if(action==='menu'){const open=document.body.classList.toggle('menu-open');document.querySelector('.menu-button')?.setAttribute('aria-expanded',String(open));}
 });
 document.addEventListener('change',e=>{if(e.target.id==='screen-select')location.hash=e.target.value;if(e.target.type==='file'&&e.target.files.length)showToast(`Выбран файл: ${e.target.files[0].name}. Данные остаются в макете.`);});
 document.addEventListener('submit',e=>{if(!e.target.matches('form'))return;e.preventDefault();if(!e.target.checkValidity())return;const target=e.target.dataset.next;const msg=e.target.dataset.success||'Изменения сохранены в макете';closeModal();if(target)location.hash=target;showToast(msg);});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.body.classList.remove('menu-open');document.querySelector('.menu-button')?.setAttribute('aria-expanded','false');}});
 window.addEventListener('hashchange',render);window.addEventListener('resize',updateWidth);
 R.openModal=openModal;R.closeModal=closeModal;R.toast=showToast;R.render=render;
 render();
})();
