const path = require('node:path');
module.exports = async function ({
  confirmFile,
  action,
  assert,
  click,
  evaluate,
  goto,
  inSheet,
  input,
  navigate,
  scope,
  selectFiles,
  shot,
  size,
  checkLayout,
}) {
  const extra = '#app [data-media-field="work-extra"]';
  const photo = '#app [data-media-field="work"]';
  const asset = (name) => path.resolve(__dirname, '../assets', name);
  const camera = () => click('#sheet [data-source=camera]');
  async function comment(value) {
    await click('[data-comment-action=edit]');
    await input('[data-file-comment]', value);
    await click('[data-comment-action=save]');
  }
  const close = () => click('#media-viewer [data-viewer-close]');
  const chose = (name) => click('#sheet [data-camera=' + name + ']');
  const player = extra + ' audio';
  const rows = "Kontur.state.draft.fieldMedia['work-extra']";
  await evaluate("localStorage.removeItem('kontur-mobile-v2-drafts')");
  await size(390);
  await goto('work/10428', scope('expanded'));
  await assert(
    'В одном поле по одному фото, видео, аудио и документу',
    `['photo','video','audio','file'].every(k=>${rows}.filter(f=>f.kind===k).length===1) && document.querySelectorAll('${extra} .media-group').length===4`,
  );
  await evaluate(
    "document.querySelector('#app .scroll-content').scrollTop=document.querySelector('#app .scroll-content').scrollHeight",
  );
  await shot('multiple-field');
  await click(extra + ' .group-file .file-opener');
  await assert(
    'В предзаполненном поле доступен PDF акта замены',
    "document.querySelector('#media-viewer a[download]').href.endsWith('/assets/replacement-act.pdf')",
  );
  await close();
  await action('attach-work');
  await shot('material-sources');
  await camera();
  await assert(
    'Оба режима камеры и галерея доступны для материалов',
    "!!document.querySelector('.camera-view [data-camera=video]') && !!document.querySelector('.camera-view [data-camera=gallery]')",
  );
  await chose('flash');
  await assert('Вспышка включена в видоискателе', "document.querySelector('[data-camera=flash]').ariaPressed==='true'");
  await shot('camera-photo');
  await chose('video');
  await chose('shutter');
  await assert(
    'Видео записывается, доступна остановка',
    '!!document.querySelector(\'.camera-view.recording [aria-label="Остановить запись"]\')',
  );
  await shot('camera-video');
  await chose('shutter');
  await confirmFile();
  await assert(
    'Запись добавлена в своё поле как локальное видео',
    rows + ".at(-1).kind==='video' && " + rows + ".at(-1).delivery==='local'",
  );
  await action('work-photo');
  await camera();
  await assert(
    'Обязательное поле фото открывает фоторежим',
    "!document.querySelector('.camera-view [data-camera=video]')",
  );
  await chose('shutter');
  await confirmFile();
  await action('work-photo');
  await camera();
  await chose('gallery');
  await assert(
    'Галерея из камеры выбирает изображения без capture',
    "document.querySelector('#file-picker').accept==='image/*' && !document.querySelector('#file-picker').hasAttribute('capture')",
  );
  await selectFiles([asset('meter.jpg')]);
  await confirmFile();
  await click(photo + ' .media-thumb');
  await assert(
    'Галерея ограничена двумя фотографиями поля',
    "document.querySelector('.viewer-nav').textContent.includes('1 из 2') && document.querySelector('.media-stage img').naturalWidth>0",
  );
  await click('[data-media-nav="1"]');
  await comment('Номер пломбы читается');
  await close();
  await goto('work/10428', scope('expanded'));
  await click(photo + ' .media-thumb:nth-child(2)');
  await assert(
    'Локальное фото и его комментарий переживают перезагрузку',
    "document.querySelector('.media-stage img').src.startsWith('blob:') && document.querySelector('.saved-file-comment').textContent==='Номер пломбы читается'",
  );
  await comment('Пломба проверена');
  await shot('field-gallery');
  await click('[data-delete-media]');
  await assert(
    'Удаление перемещает просмотр к оставшемуся фото',
    "document.querySelector('.viewer-nav').textContent.includes('1 из 1') && Kontur.state.draft.fieldMedia.work.length===1",
  );
  await close();
  await click(extra + ' .media-thumb');
  await assert(
    'У отправленного фото есть комментарий, удаление недоступно',
    "!!document.querySelector('[data-comment-action=edit]') && !document.querySelector('[data-delete-media]')",
  );
  await comment('Общий вид шкафа');
  await click('[data-media-nav="1"]');
  await assert(
    'Следующим в этом поле открывается видео с управлением',
    "!!document.querySelector('.media-stage video[controls]') && document.querySelector('.viewer-nav').textContent.includes('2 из 3')",
  );
  await click('[data-media-nav="-1"]');
  await close();
  await evaluate("const scroll=document.querySelector('#app .scroll-content'); scroll.scrollTop=scroll.scrollHeight");
  await click(extra + ' [data-audio-play]');

  await evaluate(
    `(()=>{const el=document.querySelector('${extra} select'); el.value='1.5'; el.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await input(extra + ' input[type=range]', '3');
  await assert(
    'Аудиодорожка проигрывается, перематывается и меняет скорость',
    `!document.querySelector('${player}').paused && document.querySelector('${player}').playbackRate===1.5 && document.querySelector('${player}').currentTime>=3`,
  );
  await shot('field-previews');
  await click(extra + ' [data-audio-play]');
  await assert('Аудиодорожка ставится на паузу', `document.querySelector('${player}').paused`);
  await input('#reading', '24');
  await action('review');
  await action('complete');
  await assert(
    'Подтверждение отправки защищает локальные файлы отчёта',
    "Kontur.state.draft.fieldMedia.work.every(f=>f.delivery==='sent') && " + rows + ".every(f=>f.delivery==='sent')",
  );
  await navigate('detail/10428');
  await action('view-result');
  await click('#sheet [data-media-field=work] .media-thumb');
  await assert(
    'Отправленный результат доступен с комментарием без удаления',
    "!document.querySelector('[data-delete-media]') && !!document.querySelector('[data-comment-action=edit]')",
  );
  await close();
  await inSheet('close-sheet');
  await size(320);
  await goto('chat/10428', scope('simple'));
  await click('.step-materials[data-upload-field="work-extra"] > summary');
  await click(extra + ' .media-thumb');
  await assert(
    'В упрощённом режиме доступны те же файлы и комментарии',
    "document.querySelector('.saved-file-comment').textContent==='Общий вид шкафа'",
  );
  await assert('Галерея помещается на 320 px', "document.querySelector('#media-viewer').scrollWidth<=320");
  await close();
  await checkLayout('chat/10428', 320, 'Поля с медиа');
  await action('attach-chat');
  await camera();
  await chose('video');
  await chose('gallery');
  await assert(
    'Галерея из видеорежима предлагает только видео',
    "document.querySelector('#file-picker').accept==='video/*'",
  );
  await selectFiles([asset('inspection.mp4')]);
  await assert(
    'Видео с камеры чата попадает в черновик сообщения',
    "Kontur.state.attachments.length===1 && Kontur.state.attachments[0].kind==='video'",
  );
  await goto('delay/10429', scope('expanded') + '&offline=1');
  await action('delay-photo');
  await inSheet('add-sample');
  await confirmFile();
  await action('delay-act');
  await inSheet('add-sample');
  await confirmFile();
  await action('save-delay');
  await assert(
    'Без сети файлы недопуска ждут отправки отдельно от рабочего отчёта',
    "Kontur.state.draft.fieldMedia.delay[0].delivery==='queued' && Kontur.state.draft.fieldMedia['delay-act'][0].delivery==='queued' && !Kontur.state.draft.fieldMedia.work.length",
  );
  await navigate('delay/10429');
  await click('[data-media-field="delay-act"] .media-thumb');
  await assert(
    'Акт открывает только своё поле, файл в очереди доступен для удаления',
    "document.querySelector('.viewer-nav').textContent.includes('1 из 1') && !!document.querySelector('[data-delete-media]')",
  );
  await click('[data-delete-media]');
  await click('#studio-network');
  await click('[data-media-field="delay"] .media-thumb');
  await assert(
    'После синхронизации фото уведомления защищено от удаления',
    "Kontur.state.draft.fieldMedia.delay[0].delivery==='sent' && !document.querySelector('[data-delete-media]') && !Kontur.state.draft.fieldMedia['delay-act'].length",
  );
  await close();
  await goto('work/10431', scope('expanded'));
  await action('attach-work');
  await click('[data-source=mixed]');
  await assert(
    'Один системный выбор принимает все четыре типа',
    "document.querySelector('#file-picker').multiple && ['image/*','video/*','audio/*','.pdf'].every(t=>document.querySelector('#file-picker').accept.includes(t))",
  );
  await selectFiles(['meter.jpg', 'inspection.mp4', 'meter-signal.mp3', 'replacement-act.pdf'].map(asset));
  for (let i = 0; i < 4; i++) await confirmFile();
  await goto('work/10431', scope('expanded'));
  await assert(
    'Вся смешанная подборка восстанавливается после перезагрузки',
    `document.querySelector('${extra} video').src.startsWith('blob:') && document.querySelector('${player}').src.startsWith('blob:') && ['photo','video','audio','file'].every(k=>${rows}.filter(f=>f.kind===k && f.stored).length===1)`,
  );
  await click(extra + ' .file-opener');
  await comment('Проверка сигнала');
  await click('[data-delete-media]');
  await assert(
    'Удаление аудиозаписи сохраняет соседнее видео',
    `${rows}.length===3 && ${rows}.some(f=>f.kind==='video') && !document.querySelector('${player}')`,
  );
  await evaluate(
    "localStorage.setItem('kontur-mobile-v2-drafts', JSON.stringify({10429:{photo:true,photoName:'Старый прибор.jpg',extraFiles:['Запись.wav']}}))",
  );
  await goto('work/10429', scope('expanded'));
  await click(photo + ' .media-thumb');
  await assert(
    'В старом черновике сохранено имя файла и указана доступность предпросмотра',
    "document.querySelector('#media-title').textContent==='Старый прибор.jpg' && !!document.querySelector('.media-stage .unavailable')",
  );
  await close();
  await evaluate(`const previous = Kontur.initialDraft();
    previous.fieldMedia = {work: [], delay: [], 'delay-act': [], 'work-extra': ['photo','video','audio'].map(k => Kontur.mediaFiles.sample(k,'sent'))};
    previous.fieldMedia['work-extra'][0].comment = 'Читаемый номер';
    localStorage.setItem('kontur-mobile-v2-drafts', JSON.stringify({10428:previous}))`);
  await goto('work/10428', scope('expanded'));
  await assert(
    'К трём сохранённым образцам добавлен документ один раз, комментарий к фото сохраняется',
    `${rows}.length===4 && ${rows}.filter(f=>f.kind==='file').length===1 && ${rows}.find(f=>f.kind==='photo').comment==='Читаемый номер'`,
  );
  await evaluate("localStorage.removeItem('kontur-mobile-v2-drafts')");
};
