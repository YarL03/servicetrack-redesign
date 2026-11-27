(() => {
  const R = window.RD, K = window.KonturV2, E = R.esc;
  const kinds = { photo: 'Фото', video: 'Видео', audio: 'Аудио', document: 'Документ' };
  let dialog, opener;
  function fileButton(r, f) {
    const thumbnail = f.kind === 'photo' ? `<img src="${E(f.url)}" alt="">` : K.icon(f.kind);
    return `<button type="button" class="v2-file-open" data-preview="${f.id}" data-request="${r.id}">
      <span class="v2-file-icon">${thumbnail}</span><span><strong>${E(f.name)}</strong><small>${kinds[f.kind]} · ${E(f.size)}</small></span></button>`;
  }
  function assignment(r, f) {
    if (!r.fields.length) return '<small class="muted">В заявке нет файловых полей</small>';
    const label = f.field ? K.fields[f.field].label : 'Прикрепить к полю';
    return `<button type="button" class="v2-assign-link" data-assign="${f.id}" data-request="${r.id}" aria-label="${E((f.field ? 'Изменить поле' : label) + ' · ' + f.name)}">
      ${K.icon(f.field ? 'check' : 'clip')}${E(label)}</button>`;
  }
  function fileRow(r, f, assignable = true) {
    return `<div class="v2-file-row">${fileButton(r, f)}${assignable ? assignment(r, f) : ''}</div>`;
  }
  function queue(r) {
    const files = K.pending(r);
    return `<details class="v2-pool panel" data-pool="${r.id}" ${r.poolOpen ? 'open' : ''}>
      <summary class="panel-head"><h2 class="v2-pool-heading">${K.icon('inbox')}<span>Нераспределённые файлы</span><span class="v2-count">${files.length}</span>${K.icon('chevron')}</h2></summary>
      <div class="panel-body">${files.length ? `<p class="muted small">Из чата с исполнителем · ${E(r.worker)}</p>${files.map(f => fileRow(r, f)).join('')}` : '<p class="muted">Все файлы исполнителя распределены.</p>'}</div></details>`;
  }
  document.addEventListener('toggle', ({target}) => {
    if (target.dataset?.pool && target.isConnected) K.get(target.dataset.pool).poolOpen = target.open;
  }, true);
  const fieldRows = (r, id) => K.incoming(r).filter(f => f.field === id).map(f => fileRow(r, f)).join('');
  function fileGroup(r, id) {
    return [...r.messages.map(m => m.files), r.draft.files].find(group => group.some(f => f.id === id));
  }
  function open(title, html, trigger) {
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'v2-dialog';
      dialog.setAttribute('aria-labelledby', 'v2-dialog-title');
      document.body.append(dialog);
      dialog.addEventListener('close', () => {
        if (dialog.open) return;
        dialog.replaceChildren();
        if (opener?.isConnected) opener.focus({preventScroll: true});
      });
    }
    if (!dialog.open) opener = trigger;
    dialog.innerHTML = `<div class="modal-heading"><h2 id="v2-dialog-title">${E(title)}</h2>
      <button type="button" class="icon-button" data-v2-close aria-label="Закрыть">${R.icon('close')}</button></div><div class="modal-body">${html}</div>`;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('[data-v2-close]').focus();
  }
  function preview(r, f, trigger) {
    const src = E(f.url);
    let media;
    if (f.kind === 'photo') media = `<img src="${src}" alt="${E(f.name)}">`;
    else if (f.kind === 'video') media = `<video src="${src}" controls playsinline></video>`;
    else if (f.kind === 'audio') media = `<audio src="${src}" controls></audio>`;
    else if (f.mime === 'application/pdf') media = `<object type="application/pdf" data="${src}" aria-label="${E(f.name)}"><p>Для просмотра скачайте документ.</p></object>`;
    else media = `<div class="v2-document">${K.icon('file')}<p>Скачайте файл, чтобы открыть его на устройстве.</p></div>`;
    const group = fileGroup(r, f.id), index = group.indexOf(f);
    const step = (delta, label) => group[index + delta] ? `<button class="btn" data-preview="${group[index + delta].id}" data-request="${r.id}">${label}</button>` : `<button class="btn" disabled>${label}</button>`;
    open(f.name, `<p class="v2-dialog-meta">Заявка № ${r.id} · ${kinds[f.kind]} · ${E(f.size)}</p><div class="v2-media">${media}</div>
      <div class="v2-preview-footer">${group.length > 1 ? `<div>${step(-1, 'Назад')}<span>${index + 1} из ${group.length}</span>${step(1, 'Далее')}</div>` : ''}<a class="btn" href="${src}" download="${E(f.name)}">${R.icon('download')}Скачать</a></div>`, trigger);
  }
  function save(r, f, id) {
    if (id && !K.eligible(r, f, id)) return;
    f.field = id;
    dialog.close();
    document.dispatchEvent(new CustomEvent('v2:allocation', {detail: {record: r, file: f}}));
    R.toast(id ? 'Файл прикреплён · ' + K.fields[id].label : 'Файл возвращён в нераспределённые');
    if (!opener?.isConnected) {
      opener = document.querySelector(`[data-assign="${f.id}"]`) || document.querySelector('[data-pool] summary') || document.getElementById('main-content');
      opener = opener.closest('details:not([open])')?.querySelector('summary') || opener;
      opener.focus({preventScroll: true});
    }
  }
  function chooseField(r, f, trigger) {
    const options = r.fields.filter(id => K.eligible(r, f, id)).map(id => {
      const field = K.fields[id];
      return `<label class="v2-choice"><input type="radio" name="destination" value="${id}" ${f.field === id ? 'checked' : ''}><span><strong>${E(field.label)}</strong><small>${E(field.stage)}</small></span></label>`;
    });
    open('Прикрепить к полю формы', `<p class="v2-dialog-meta">Заявка № ${r.id} · ${E(r.address)}</p>
      <div class="v2-selection-file">${K.icon(f.kind)}<strong>${E(f.name)}</strong></div>
      ${f.field ? '<button type="button" class="v2-assign-link" data-show-field>Открыть поле «' + E(K.fields[f.field].label) + '» в форме</button>' : ''}
      <fieldset class="v2-choices"><legend>Поле рабочей формы</legend>${options.join('') || '<p class="muted">Нет свободных полей для этого типа файла.</p>'}</fieldset>
      <div class="actions">${f.field ? '<button class="btn subtle" data-release>Вернуть в нераспределённые</button>' : ''}<button class="btn" data-v2-close>Отмена</button><button class="btn primary" data-commit disabled>Прикрепить</button></div>`, trigger);
    const commit = dialog.querySelector('[data-commit]');
    dialog.querySelector('.v2-choices').onchange = event => { commit.disabled = f.field === event.target.value; };
    commit.onclick = () => save(r, f, dialog.querySelector('input:checked').value);
    const showField = dialog.querySelector('[data-show-field]');
    if (showField) showField.onclick = () => {
      const target = K.formId(r.id);
      opener = null;
      dialog.close();
      const focusField = () => {
        const slot = document.querySelector(`[data-field-slot="${f.field}"]`);
        const stage = slot.closest('details');
        if (stage) stage.open = true;
        slot.scrollIntoView({block: 'center'});
        slot.querySelector('[data-preview]').focus({preventScroll: true});
      };
      if (document.querySelector(`[data-field-slot="${f.field}"]`)) focusField();
      else {
        document.addEventListener('rd:render', focusField, {once: true});
        location.hash = target;
      }
    };
    const release = dialog.querySelector('[data-release]');
    if (release) release.onclick = () => save(r, f, null);
  }
  function chooseFile(r, field, trigger) {
    const files = K.pending(r).filter(f => K.eligible(r, f, field));
    const choices = files.map(f => `<label class="v2-choice"><input type="radio" name="source" value="${f.id}"><span><strong>${E(f.name)}</strong><small>${kinds[f.kind]} · ${E(f.size)}</small></span></label>`);
    open('Добавить из нераспределённых', `<p class="v2-dialog-meta">Заявка № ${r.id} · ${E(K.fields[field].label)}</p>
      <fieldset class="v2-choices"><legend>Файл исполнителя</legend>${choices.join('')}</fieldset>
      <div class="actions"><button class="btn" data-v2-close>Отмена</button><button class="btn primary" data-commit disabled>Прикрепить</button></div>`, trigger);
    const commit = dialog.querySelector('[data-commit]');
    dialog.querySelector('.v2-choices').onchange = () => { commit.disabled = false; };
    commit.onclick = () => {
      const file = files.find(f => f.id === dialog.querySelector('input:checked').value);
      if (file && !file.field) save(r, file, field);
    };
  }
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-preview], [data-assign], [data-from-pool], [data-v2-close]');
    if (!trigger) return;
    if (trigger.hasAttribute('data-v2-close')) { dialog.close(); return; }
    const r = K.get(trigger.dataset.request);
    if (trigger.dataset.fromPool) {
      chooseFile(r, trigger.dataset.fromPool, trigger);
    } else if (trigger.dataset.assign) {
      const f = K.incoming(r).find(item => item.id === trigger.dataset.assign);
      if (f) chooseField(r, f, trigger);
    } else {
      const f = fileGroup(r, trigger.dataset.preview)?.find(item => item.id === trigger.dataset.preview);
      if (f) preview(r, f, trigger);
    }
  });
  document.addEventListener('rd:render', () => { if (dialog?.open) dialog.close(); });
  Object.assign(K, {fileButton, fileRow, queue, fieldRows});
})();
