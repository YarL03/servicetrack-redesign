(() => {
 const screens=window.RD.screens;
 const params=new URLSearchParams(location.search);
 let variant=['v1','v2','v3'].includes(params.get('variant'))?params.get('variant'):'v1';
 let screen=screens.some(s=>s.id===params.get('screen'))?params.get('screen'):'dashboard';
 let width=[390,768,1024,1440,1920].includes(Number(params.get('width')))?Number(params.get('width')):1440;
 const frame=document.getElementById('preview-frame');
 const theme=()=>window.RDTheme.get();
 const screenUrl=()=>`${variant}/index.html?theme=${theme()}#${screen}`;
 function saveUrl(){try{history.replaceState(null,'',`?variant=${variant}&screen=${screen}&width=${width}&theme=${theme()}`);}catch{/* file URL history may be restricted */}}
 function list(){
  const search=document.getElementById('screen-search').value.toLocaleLowerCase('ru');
  const filtered=screens.filter(s=>`${s.title} ${s.group} ${s.id}`.toLocaleLowerCase('ru').includes(search));
  const groups=[...new Set(screens.map(s=>s.group))];
  document.getElementById('screen-list').innerHTML=groups.map(g=>{const rows=filtered.filter(s=>s.group===g);return rows.length?`<div class="screen-group"><h2>${g}</h2>${rows.map(s=>`<a href="?variant=${variant}&screen=${s.id}&width=${width}&theme=${theme()}" data-screen="${s.id}" class="${s.id===screen?'active':''}">${s.title}${s.kind==='dialog'?'<small>Диалог / боковая панель</small>':''}</a>`).join('')}</div>`:'';}).join('')||'<p>По этому запросу экранов нет.</p>';
  document.getElementById('screen-count').textContent=`${filtered.length} из ${screens.length} экранов и состояний`;
 }
 function resize(){const available=document.getElementById('preview-stage').clientWidth-(innerWidth<768?20:innerWidth>=1700?60:innerWidth<=1100?24:40);const scale=Math.min(1,available/width);const height=width<600?844:width<900?1024:960;frame.style.width=width+'px';frame.style.height=height+'px';frame.style.transform=`scale(${scale})`;const holder=document.getElementById('frame-holder');holder.style.width=width*scale+'px';holder.style.height=height*scale+'px';document.getElementById('preview-scale').textContent=`${width} × ${height} · ${Math.round(scale*100)}%`;}
 function syncTheme(){
  frame.dataset.theme=theme();
  frame.contentWindow?.postMessage({type:'rd:set-theme',theme:theme()},'*');
  document.getElementById('open-screen').href=screenUrl();
  window.RDTheme.syncControls();list();saveUrl();
 }
 function update(){frame.src=screenUrl();frame.dataset.theme=theme();document.getElementById('open-screen').href=screenUrl();document.getElementById('preview-title').textContent=screens.find(s=>s.id===screen)?.title||screen;document.querySelectorAll('[data-variant]').forEach(el=>el.classList.toggle('active',el.dataset.variant===variant));document.querySelectorAll('[data-width]').forEach(el=>el.classList.toggle('active',Number(el.dataset.width)===width));list();resize();window.RDTheme.syncControls();saveUrl();}
 document.addEventListener('click',e=>{const v=e.target.closest('[data-variant]'),s=e.target.closest('[data-screen]'),w=e.target.closest('[data-width]');if(v){variant=v.dataset.variant;update();}if(s){e.preventDefault();screen=s.dataset.screen;update();}if(w){width=Number(w.dataset.width);update();}});
 document.getElementById('screen-search').addEventListener('input',list);
 frame.addEventListener('load',syncTheme);
 window.addEventListener('rd:themechange',syncTheme);
 window.addEventListener('message',event=>{if(event.source===frame.contentWindow&&event.data?.type==='rd:theme'&&['dark','light'].includes(event.data.theme))window.RDTheme.set(event.data.theme,{notifyParent:false});});
 window.addEventListener('resize',resize);
 document.getElementById('coverage-count').textContent=`${screens.length} экранов × 3 варианта × 2 темы × 5 диапазонов ширины`;
 update();
})();
