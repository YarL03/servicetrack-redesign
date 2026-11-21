'use strict';
(() => {
  const K = Kontur,
    files = K.mediaFiles,
    E = K.escape,
    I = K.icon;
  const viewer = () => document.querySelector('#media-viewer');
  const visual = (f) => ['photo', 'video'].includes(f.kind);
  const delivery = {
    local: 'На устройстве',
    queued: 'В очереди',
    sent: 'Отправлен',
    unknown: 'Отправка не подтверждена',
  };
  let selected, commit, redraw, opener;
  function time(seconds) {
    seconds = Math.floor(Number.isFinite(seconds) ? seconds : 0);
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }
  function picture(f) {
    const src = E(files.source(f));
    if (!src) return I(f.kind);
    if (f.kind === 'video')
      return `<video src="${src}#t=0.01" preload="metadata" muted playsinline aria-hidden="true"></video><i>${I('play')}</i>`;
    return `<img src="${src}" alt="">`;
  }
  function openAttrs(field, f) {
    return `data-media-field-key="${E(field)}" data-media-open="${E(f.id)}"`;
  }
  function audioPlayer(f) {
    const src = files.source(f);
    if (!src) return '<small>Аудиозапись недоступна</small>';
    return `<div class="audio-track"><audio src="${E(src)}" preload="metadata" data-duration="${Number(f.duration) || 0}"></audio>
      <button type="button" data-audio-play aria-label="Воспроизвести ${E(f.name)}">${I('play')}</button>
      <div class="audio-timeline"><input type="range" min="0" max="0" value="0" step="0.01" aria-label="Позиция воспроизведения"><small><span>0:00</span> / <span>0:00</span></small></div>
      <label><span class="sr-only">Скорость воспроизведения</span><select data-audio-speed>${[0.5, 1, 1.5, 2].map((n) => `<option value="${n}" ${n === 1 ? 'selected' : ''}>${String(n).replace('.', ',')}×</option>`).join('')}</select></label></div>`;
  }
  function thumb(f, attrs) {
    return `<button type="button" class="media-thumb" ${attrs} aria-label="Открыть ${E(f.name)}">${picture(f)}</button>`;
  }
  function fieldItem(key, f) {
    const attrs = openAttrs(key, f);
    if (visual(f)) return thumb(f, attrs);
    return `<div class="field-file"><button type="button" class="file-opener" ${attrs}>${I(f.kind === 'audio' ? 'mic' : 'file')}<span>${E(f.name)}</span>${I('chevron')}</button>${f.kind === 'audio' ? audioPlayer(f) : ''}</div>`;
  }
  function field(key) {
    const rows = K.state.draft.fieldMedia[key];
    let content = '';
    if (key === 'work-extra') {
      const labels = {photo: 'Фото', video: 'Видео', audio: 'Аудио', file: 'Документы'};
      for (const [kind, label] of Object.entries(labels)) {
        const group = rows.filter((f) => f.kind === kind);
        if (group.length)
          content += `<section class="media-group group-${kind}"><h4>${label} <span>${group.length}</span></h4><div class="${visual(group[0]) ? 'media-thumbs' : 'media-rows'}">${group.map((f) => fieldItem(key, f)).join('')}</div></section>`;
      }
    } else if (rows.length) content = `<div class="media-thumbs">${rows.map((f) => fieldItem(key, f)).join('')}</div>`;
    return `<div class="field-media" data-media-field="${key}">${content}</div>`;
  }
  function reviewFiles(key) {
    const rows = K.state.draft.fieldMedia[key].map((f) => {
      const preview = visual(f) ? picture(f) : I(f.kind === 'audio' ? 'mic' : 'file');
      return `<button type="button" class="review-file" ${openAttrs(key, f)}>
        <span class="${visual(f) ? 'media-thumb' : 'file-symbol'}">${preview}</span>
        <span class="review-file-label">${E(f.name)}<small data-review-comment="${E(f.id)}">${E(f.comment)}</small></span>${I('chevron')}</button>`;
    });
    return `<div class="review-files" data-media-field="${key}">${rows.join('') || '<p>Файлы не добавлены</p>'}</div>`;
  }
  const uploadControls = {
    work: ['work-photo', 'camera', 'Сделать или выбрать фото', 'photo-add', 'В кадре видны номер, показания и пломба.'],
    'work-extra': ['attach-work', 'clip', 'Приложить материалы', 'extra-attach'],
    delay: ['delay-photo', 'camera', 'Добавить фото', 'photo-add', 'Сфотографируйте оставленное уведомление.'],
    'delay-act': ['delay-act', 'plus', 'Добавить фото акта', 'text-link'],
  };
  const fieldExpansion = new Map();
  function panel(key, place = 'form', nextPhoto = false) {
    const id = JSON.stringify([K.state.id, place, key]);
    const open = fieldExpansion.get(id) ?? (place !== 'chat' || key === 'work');
    const count = K.state.draft.fieldMedia[key].length;
    const [action, icon, label, style, hint] = uploadControls[key] || [];
    const summary = place === 'report' || place === 'check';
    const required = place !== 'report' && ['delay', 'work'].includes(key);
    let control = '';
    if (place === 'form') control = `<button class="${style}" data-action="${action}">${I(icon)}${label}</button>`;
    else if (nextPhoto) control = K.button('Приложить фото', 'chat-step', 'primary', 'camera');
    else if (place !== 'report' && action)
      control = K.button(key === 'work' ? 'Добавить фото' : label, action, 'secondary', icon);
    return `<details class="upload-field ${place === 'chat' ? 'step-materials' : 'field-panel'}" data-upload-field="${key}" ${summary ? 'data-review-files' : ''} data-expansion-key="${E(id)}" ${open ? 'open' : ''}>
      <summary><strong>${E(files.titles[key])}${required ? ' *' : ''}</strong><span class="file-count"><span class="sr-only">Файлов: </span><span data-file-count>${count}</span></span>${I('down')}</summary>
      <div class="upload-body">${hint && !summary ? '<p>' + hint + '</p>' : ''}${summary ? reviewFiles(key) : field(key)}${control}</div></details>`;
  }
  function refreshPanels(root) {
    for (const panel of root.querySelectorAll('[data-upload-field]')) {
      const key = panel.dataset.uploadField;
      panel.querySelector('[data-media-field]').outerHTML = panel.hasAttribute('data-review-files')
        ? reviewFiles(key)
        : field(key);
      panel.querySelector('[data-file-count]').textContent = K.state.draft.fieldMedia[key].length;
    }
  }
  function messageFiles(message) {
    const items = message.files || [];
    const pictures = items
      .filter(visual)
      .map((f) => thumb(f, `data-media-message="${E(message.id)}" data-media-open="${E(f.id)}"`));
    return (
      (pictures.length ? `<div class="media-thumbs chat-thumbs">${pictures.join('')}</div>` : '') +
      items
        .filter((f) => !visual(f))
        .map((f) => K.fileCard(f))
        .join('')
    );
  }
  function selectedFiles() {
    if (!selected || selected.requestId !== K.state.id) return [];
    if (selected.messageId)
      return K.state.messages[selected.requestId]?.find((m) => m.id === selected.messageId)?.files || [];
    return K.state.draft.fieldMedia[selected.field] || [];
  }
  function current() {
    return selectedFiles().find((f) => f.id === selected.id);
  }
  function siblings(f) {
    return visual(f) ? selectedFiles().filter(visual) : [f];
  }
  function commentView(f) {
    return `${f.comment ? '<p class="saved-file-comment">' + E(f.comment) + '</p>' : ''}<button type="button" class="text-link" data-comment-action="edit">${I('chat')}${f.comment ? 'Редактировать комментарий' : 'Добавить комментарий'}</button>`;
  }
  function editComment(action) {
    const f = current(),
      panel = viewer().querySelector('.media-comment');
    if (!f || !panel || selected.messageId) return;
    if (action === 'edit') {
      panel.innerHTML = `<label class="field"><span>Комментарий к файлу</span><textarea data-file-comment maxlength="500" rows="2">${E(f.comment)}</textarea></label><div class="comment-actions"><button class="btn primary" data-comment-action="save">Сохранить</button><button class="btn secondary" data-comment-action="cancel">Отмена</button></div>`;
      panel.querySelector('textarea').focus();
    } else {
      if (action === 'save') {
        f.comment = panel.querySelector('textarea').value.trim();
        for (const note of document.querySelectorAll(`[data-review-comment="${CSS.escape(f.id)}"]`))
          note.textContent = f.comment;
        commit();
      }
      panel.innerHTML = commentView(f);
      panel.querySelector('button').focus({preventScroll: true});
    }
  }
  function previewContent(f) {
    const src = E(files.source(f));
    if (!src) return '<p class="unavailable">Предпросмотр файла недоступен</p>';
    if (f.kind === 'photo') return `<img src="${src}" alt="${E(f.name)}">`;
    if (f.kind === 'video') return `<video src="${src}" controls playsinline preload="metadata"></video>`;
    if (f.kind === 'audio') return audioPlayer(f);
    return `<a class="btn secondary" href="${src}" download="${E(f.name)}">Сохранить файл</a>`;
  }
  function paint() {
    const f = current();
    if (!f) return viewer().close();
    const all = siblings(f),
      index = all.indexOf(f),
      src = E(files.source(f));
    const stage = previewContent(f);
    const chat = Boolean(selected.messageId);
    const title = chat ? 'Вложения сообщения · № ' + selected.requestId : files.titles[selected.field];
    viewer().innerHTML = `<header class="viewer-head"><div><small>${E(title)}</small><h2 id="media-title">${E(f.name)}</h2></div><button type="button" data-viewer-close aria-label="Закрыть просмотр">${I('close')}</button></header>
      <div class="media-stage ${visual(f) ? 'visual' : ''}">${stage}</div>
      <div class="viewer-nav"><span class="delivery-tag">${I(chat ? 'file' : f.delivery === 'sent' ? 'checks' : 'clock')}${chat ? 'На устройстве' : delivery[f.delivery]}</span>${visual(f) ? `<div><button data-media-nav="-1" aria-label="Предыдущий файл" ${index === 0 ? 'disabled' : ''}>${I('back')}</button><span>${index + 1} из ${all.length}</span><button data-media-nav="1" aria-label="Следующий файл" ${index === all.length - 1 ? 'disabled' : ''}>${I('chevron')}</button></div>` : ''}</div>
      ${chat ? `<a class="text-link chat-save-file" href="${src}" download="${E(f.name)}">Сохранить файл</a>` : `<div class="media-comment">${commentView(f)}</div>`}
      ${!chat && files.canDelete(f) ? `<button class="delete-media" data-delete-media>${I('trash')}Удалить файл</button>` : ''}`;
  }
  function advance(delta) {
    const f = current();
    if (!f) return;
    const all = siblings(f),
      next = all[all.indexOf(f) + delta];
    if (next) {
      selected.id = next.id;
      paint();
    }
  }
  function syncAudio(a) {
    const row = a.closest('.audio-track');
    const range = row.querySelector('input'),
      labels = row.querySelectorAll('small span');
    const duration = Number.isFinite(a.duration) ? a.duration : Number(a.dataset.duration);
    range.max = duration;
    range.value = a.currentTime;
    labels[0].textContent = time(a.currentTime);
    labels[1].textContent = time(duration);
    const play = row.querySelector('[data-audio-play]');
    play.innerHTML = I(a.paused ? 'play' : 'pause');
    play.setAttribute('aria-label', a.paused ? 'Воспроизвести' : 'Пауза');
  }
  function init(save, render) {
    commit = save;
    redraw = render;
    document.addEventListener(
      'toggle',
      (e) => {
        const panel = e.target;
        if (!panel.matches?.('details[data-upload-field]')) return;
        fieldExpansion.set(panel.dataset.expansionKey, panel.open);
        if (!panel.open) panel.querySelectorAll('audio,video').forEach((media) => media.pause());
      },
      true,
    );
    document.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-media-open')) {
        opener = b;
        selected = {
          requestId: K.state.id,
          field: b.dataset.mediaFieldKey,
          messageId: b.dataset.mediaMessage,
          id: b.dataset.mediaOpen,
        };
        document.querySelectorAll('.audio-track audio').forEach((a) => a.pause());
        paint();
        viewer().showModal();
      } else if (b.hasAttribute('data-viewer-close')) viewer().close();
      else if (b.hasAttribute('data-media-nav')) advance(Number(b.dataset.mediaNav));
      else if (b.dataset.commentAction) editComment(b.dataset.commentAction);
      else if (b.hasAttribute('data-delete-media')) {
        const f = current();
        if (!f || selected.messageId || !files.canDelete(f)) return;
        const all = siblings(f),
          i = all.indexOf(f),
          next = all[i + 1] || all[i - 1];
        files.remove(selected.field, f);
        commit();
        redraw();
        if (next) {
          selected.id = next.id;
          paint();
        } else viewer().close();
      } else if (b.hasAttribute('data-audio-play')) {
        const a = b.closest('.audio-track').querySelector('audio');
        if (a.paused)
          a.play().catch(() => {
            b.setAttribute('aria-label', 'Запись недоступна');
          });
        else a.pause();
      }
    });
    document.addEventListener('input', (e) => {
      const t = e.target;
      if (t.matches('.audio-track input'))
        t.closest('.audio-track').querySelector('audio').currentTime = Number(t.value);
    });
    document.addEventListener('change', (e) => {
      if (e.target.matches('[data-audio-speed]'))
        e.target.closest('.audio-track').querySelector('audio').playbackRate = Number(e.target.value);
    });
    for (const type of ['loadedmetadata', 'timeupdate', 'play', 'pause', 'ended'])
      document.addEventListener(
        type,
        (e) => {
          if (!e.target.matches?.('.audio-track audio')) return;
          if (type === 'play')
            document.querySelectorAll('.audio-track audio').forEach((a) => {
              if (a !== e.target) a.pause();
            });
          syncAudio(e.target);
        },
        true,
      );
    viewer().addEventListener('close', () => {
      if (viewer().open) return;
      viewer().replaceChildren();
      selected = null;
      if (opener?.isConnected) opener.focus({preventScroll: true});
    });
    let touch;
    viewer().addEventListener(
      'touchstart',
      (e) => {
        touch = e.target.closest('.media-stage img') && e.touches.length === 1 ? e.touches[0] : null;
      },
      {passive: true},
    );
    viewer().addEventListener(
      'touchend',
      (e) => {
        if (!touch) return;
        const dx = e.changedTouches[0].clientX - touch.clientX,
          dy = e.changedTouches[0].clientY - touch.clientY;
        touch = null;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) advance(dx < 0 ? 1 : -1);
      },
      {passive: true},
    );
    viewer().addEventListener('keydown', (e) => {
      if (e.target.matches('textarea,input,select,video,audio')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        advance(e.key === 'ArrowRight' ? 1 : -1);
      }
    });
  }
  K.mediaUI = {panel, refreshPanels, messageFiles, previewContent, init};
})();
