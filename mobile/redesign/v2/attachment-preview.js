'use strict';
(() => {
  const K = Kontur;
  const sheet = document.querySelector('#sheet');
  let review;

  function release() {
    if (review?.url) URL.revokeObjectURL(review.url);
    if (review) review.url = '';
  }

  function originalLink(file) {
    return `<a class="text-link" href="${K.escape(K.mediaFiles.source(file))}" download="${K.escape(file.name)}">Сохранить оригинал</a>`;
  }

  function documentStage(file, blob) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'pdf' && navigator.pdfViewerEnabled) {
      return `<object data="${K.escape(K.mediaFiles.source(file))}" type="application/pdf" aria-label="${K.escape(file.name)}">${originalLink(file)}</object>`;
    }
    if (blob && ['docx', 'xlsx'].includes(ext))
      return '<div class="office-excerpt" data-office-preview>Загрузка…</div>';
    if (blob && ['txt', 'csv'].includes(ext)) return '<pre data-text-preview>Загрузка…</pre>';
    const size = blob ? ' · ' + Math.max(1, Math.ceil(blob.size / 1024)) + ' КБ' : '';
    return `<div class="file-fallback">${K.icon('file')}<strong>${K.escape(ext.toUpperCase())}${size}</strong><p>Откройте оригинал в приложении для этого формата.</p>${originalLink(file)}</div>`;
  }

  function paint() {
    const session = review;
    const {items, index, field, requestId} = session;
    const entry = items[index];
    const blob = entry instanceof Blob ? entry : null;
    const file = blob
      ? {name: blob.name, kind: K.mediaFiles.kind(blob.name, blob.type), duration: session.recordedDuration}
      : entry;
    if (blob) {
      const resource =
        file.kind === 'file' && /\.pdf$/i.test(file.name) ? blob.slice(0, blob.size, 'application/pdf') : blob;
      session.url = file.url = URL.createObjectURL(resource);
    }
    const content = file.kind === 'file' ? documentStage(file, blob) : K.mediaUI.previewContent(file);
    session.sheet(
      'Предпросмотр файла',
      `<section class="attachment-preview">
      <div class="intake-heading"><small>${K.escape(K.mediaFiles.titles[field])} · № ${requestId}</small>
      <h3 tabindex="-1" aria-describedby="intake-position">${K.escape(file.name)}</h3><span id="intake-position">Файл ${index + 1} из ${items.length}</span></div>
      <div class="intake-stage stage-${file.kind}">${content}</div>
      <label class="field intake-comment"><span>Комментарий <small>· необязательно</small></span>
      <textarea data-intake-comment rows="2" maxlength="500" placeholder="Комментарий к этому файлу"></textarea></label>
      <div class="intake-controls"><button type="button" class="btn secondary" data-intake-skip>${items.length === 1 ? 'Отмена' : 'Пропустить'}</button>
      <button type="button" class="btn primary" data-intake-add>Добавить в форму</button></div></section>`,
    );
    session.panel = sheet.querySelector('.attachment-preview');
    sheet.scrollTop = 0;
    sheet.querySelector('.intake-heading h3').focus({preventScroll: true});
    const text = sheet.querySelector('[data-text-preview]');
    if (text)
      blob
        .slice(0, 65536)
        .text()
        .then((value) => {
          text.textContent = value + (blob.size > 65536 ? '\n…' : '') || 'Пустой файл';
        })
        .catch(() => {
          text.textContent = 'Не удалось прочитать текст файла.';
        });
    const office = sheet.querySelector('[data-office-preview]');
    if (office)
      K.officeExcerpt(blob)
        .then((html) => {
          office.innerHTML = html;
        })
        .catch(() => {
          office.innerHTML = `<p>Не удалось показать содержимое документа.</p>${originalLink(file)}`;
        });
    const media = sheet.querySelector('.intake-stage img, .intake-stage video, .intake-stage audio');
    media?.addEventListener(
      'error',
      () => {
        if (media.isConnected)
          media.closest('.intake-stage').innerHTML =
            `<div class="file-fallback"><p>Браузер не смог показать этот файл.</p>${originalLink(file)}</div>`;
      },
      {once: true},
    );
  }

  function next() {
    release();
    review.index++;
    if (review.index < review.items.length) paint();
    else review.closeSheet();
  }

  sheet.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-intake-add], [data-intake-skip]');
    const session = review;
    if (!button || !session || session.busy) return;
    if (button.hasAttribute('data-intake-skip')) return next();
    session.busy = true;
    const comment = sheet.querySelector('[data-intake-comment]').value.trim();
    for (const control of sheet.querySelectorAll('.intake-controls button, [data-intake-comment]'))
      control.disabled = true;
    try {
      await session.add(session.items[session.index], comment);
      if (review === session && session.panel.isConnected && sheet.open) next();
    } catch {
      if (session.panel.isConnected) {
        session.toast('Не удалось добавить файл. Повторите попытку.');
        for (const control of session.panel.querySelectorAll('button, textarea')) control.disabled = false;
      }
    } finally {
      session.busy = false;
    }
  });

  sheet.addEventListener('close', () => {
    if (!review || (sheet.open && review.panel.isConnected)) return;
    release();
    sheet.querySelector('.attachment-preview')?.remove();
    review = null;
  });

  K.attachmentPreview = {
    open(options) {
      release();
      review = {...options, index: 0, busy: false};
      paint();
    },
  };
})();
