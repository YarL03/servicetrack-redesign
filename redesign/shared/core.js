/* Shared, offline-only rendering primitives for the three redesign studies. */
(() => {
  let fieldId = 0;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const paths = {
    home:'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
    list:'M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01',
    file:'M14 2H5v20h14V7Zm0 0v5h5M8 12h8M8 16h6',
    users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    company:'M3 21h18M5 21V3h14v18M9 7h1m4 0h1M9 11h1m4 0h1M10 21v-5h4v5',
    grid:'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z',
    settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3l-1 3-3 1-2 3 2 3v4l3 1 2 3h4l2-3 3-1v-4l2-3-2-3-3-1-1-3Z',
    bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
    arrow:'M5 12h14m-5-5 5 5-5 5',plus:'M12 5v14M5 12h14',search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    filter:'M3 5h18l-7 8v6l-4 2v-8Z',check:'m5 12 4 4L19 6',close:'m6 6 12 12M6 18 18 6',more:'M5 12h.01M12 12h.01M19 12h.01',
    download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',upload:'M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5',
    map:'m9 18-6 3V6l6-3 6 3 6-3v15l-6 3ZM9 3v15m6-12v15',chevron:'m9 5 7 7-7 7',menu:'M3 6h18M3 12h18M3 18h18',
    clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',logout:'M9 4H3v16h6m6-12 4 4-4 4M8 12h13',
    edit:'m15 4 5 5M3 21l2-7L17 2l5 5-12 12Z',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',lock:'M6 10V7a6 6 0 0 1 12 0v3M4 10h16v12H4Z'
  };
  window.RD = {
    screens: [], esc,
    screen(screen) { if(this.screens.some(s=>s.id===screen.id)) throw new Error(`Duplicate screen ${screen.id}`); this.screens.push({kind:'page',...screen}); },
    icon(name) { return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name] || paths.file}"/></svg>`; },
    field(label,value='',type='text',opts={}) {
      const id=`field-${++fieldId}`, attrs=`id="${id}" name="${id}" ${opts.required?'required':''} ${opts.readonly?'readonly':''} ${opts.disabled?'disabled':''} placeholder="${esc(opts.placeholder || '')}"`;
      let input=type==='textarea'?`<textarea ${attrs} rows="3">${esc(value)}</textarea>`:`<input type="${esc(type)}" ${attrs} ${type==='file'?'':`value="${esc(value)}"`} ${type==='number'?'step="any"':''}>`;
      return `<label class="field ${opts.wide?'wide':''}" for="${id}"><span>${esc(label)}${opts.required?' <b class="required">*</b>':''}</span>${input}</label>`;
    },
    select(label,options,value,opts={}) { const id=`field-${++fieldId}`; return `<label class="field ${opts.wide?'wide':''}" for="${id}"><span>${esc(label)}${opts.required?' <b class="required">*</b>':''}</span><select id="${id}" ${opts.required?'required':''}>${options.map(o=>`<option ${o===value?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`; },
    check(label,checked=false) {return `<label class="checkbox"><input type="checkbox" ${checked?'checked':''}><span>${esc(label)}</span></label>`;},
    button(label,action='',style='') {return `<button type="${action==='submit'?'submit':'button'}" class="btn ${esc(style)}" ${action&&action!=='submit'?`data-action="${esc(action)}"`:''}>${label}</button>`;},
    link(label,id) {return `<a class="text-link" href="#${esc(id)}">${label}</a>`;},
    card(title,html,extra='') {return `<section class="panel">${title?`<header class="panel-head"><h2>${title}</h2>${extra}</header>`:''}<div class="panel-body">${html}</div></section>`;},
    table(headers,rows) {return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((cell,i)=>`<td data-label="${esc(headers[i]||'')}">${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;},
    badge(text,tone='neutral') {return `<span class="badge ${esc(tone)}"><i></i>${text}</span>`;},
    stats(items) {return `<div class="stats">${items.map(([label,value,detail])=>`<div class="stat"><span class="stat-label">${label}</span><strong>${value}</strong><span class="stat-detail">${detail||''}</span></div>`).join('')}</div>`;},
    note(text,tone='info') {return `<div class="note ${esc(tone)}">${this.icon(tone==='success'?'check':tone==='danger'?'lock':'file')}<div>${text}</div></div>`;},
    empty(title,text,action='') {return `<div class="empty"><div class="empty-icon">${this.icon('list')}</div><h2>${title}</h2><p>${text}</p>${action}</div>`;}
  };
})();
