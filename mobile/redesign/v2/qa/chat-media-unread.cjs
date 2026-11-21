const path = require('node:path');

module.exports = async function ({
  action,
  assert,
  click,
  evaluate,
  goto,
  input,
  navigate,
  scope,
  selectFiles,
  shot,
  size,
  checkLayout,
}) {
  const close = () => click('#media-viewer [data-viewer-close]');
  const incoming = '#messages .message:not(.own) .chat-thumbs';
  const sent = '#messages .message.own .chat-thumbs';
  const caption = 'Осмотр после установки';
  for (const theme of ['light', 'dark']) {
    const red = theme === 'light' ? 'rgb(185, 32, 55)' : 'rgb(255, 144, 154)';
    const opts = '?embed=1&theme=' + theme;
    await size(theme === 'light' ? 390 : 320);
    await goto('inbox', opts + '&mode=simple');
    await assert(
      theme + ' · красные счётчики у колокольчика, вкладки и обоих типов диалогов',
      `['.notification-bell .badge-count','.inbox-tabs .unread-total','.pinned-bottom b','.unread-dot'].every(sel=>getComputedStyle(document.querySelector(sel)).backgroundColor==='${red}')`,
    );
    await click('.thread-row[href="#chat/10430"]');
    await click('#app .header-back a');
    await assert(
      theme + ' · открытый диалог теряет индикатор',
      `!document.querySelector('a[href="#chat/10430"] .unread-dot') && document.querySelector('.inbox-tabs .unread-total').textContent==='1'`,
    );
    for (const filter of ['unread', 'archive']) {
      await click(`[data-filter="${filter}"]`);
      await assert(
        `${theme} · при выборе «${filter === 'unread' ? 'Непрочитанные' : 'Архив'}» счётчик непрочитанных остаётся красным`,
        `document.querySelector('[data-filter="${filter}"]').getAttribute('aria-pressed') === 'true' &&
          getComputedStyle(document.querySelector('[data-filter="unread"] span')).backgroundColor === '${red}'`,
      );
      if (theme === 'light' && filter === 'unread') await shot('inbox-unread');
    }
    await goto('chats', opts + '&mode=expanded');
    await assert(
      theme + ' · красные счётчики в расширенных чатах и навигации',
      `['.unread-dot','.bottom-nav .badge-count'].every(sel=>getComputedStyle(document.querySelector(sel)).backgroundColor==='${red}')`,
    );
    await action('notifications');
    await assert(
      theme + ' · красная точка и подпись у непрочитанного уведомления',
      `getComputedStyle(document.querySelector('.is-unread .notification-read i')).backgroundColor==='${red}' && getComputedStyle(document.querySelector('.is-unread .notification-read')).color==='${red}' && !document.querySelector('.notification-row:not(.is-unread) .notification-read i')`,
    );
    if (theme === 'light') await shot('unread-notifications');
    const beforeRead = await evaluate("document.querySelectorAll('.notification-row.is-unread').length");
    const notice = await evaluate("document.querySelector('.is-unread .notification-more').dataset.notice");
    await click('.is-unread .notification-more');
    await click('#sheet [data-action=notice-toggle-read]');
    await assert(
      theme + ' · отметка прочтения убирает выделение одного события',
      `document.querySelectorAll('.notification-row.is-unread').length===${beforeRead - 1} && document.querySelector('.notification-scopes .unread-total').textContent==='${beforeRead - 1}' && !document.querySelector('.is-unread [data-notice="${notice}"]')`,
    );
  }

  for (const mode of ['expanded', 'simple']) {
    await size(mode === 'expanded' ? 390 : 320);
    await goto('chat/10428', scope(mode));
    await assert(
      mode + ' · в самом входящем сообщении видны фото и кадр видео',
      `document.querySelector('${incoming} img').naturalWidth>0 && document.querySelector('${incoming} video').videoWidth>0`,
    );
    if (mode === 'expanded') await shot('chat-media');
    await click(incoming + ' button');
    await assert(
      mode + ' · просмотр ограничен сообщением',
      "document.querySelector('.viewer-nav').textContent.includes('1 из 2') && !document.querySelector('#media-viewer [data-delete-media], #media-viewer [data-comment-action]')",
    );
    await click('[data-media-nav="1"]');
    await evaluate("document.querySelector('.media-stage video').play()", true);
    await assert(
      mode + ' · видео воспроизводится в галерее сообщения',
      "document.querySelector('.media-stage video').controls && !document.querySelector('.media-stage video').paused && document.querySelector('[data-media-nav=\"1\"]').disabled",
    );
    if (mode === 'expanded') await shot('chat-video');
    await close();
    await checkLayout('chat/10428', mode === 'expanded' ? 390 : 320, 'Фото и видео в сообщении');
  }

  await goto('chat/10428', scope('simple') + '&offline=1');
  await action('attach-chat');
  await click('[data-source=media]');
  await selectFiles(['meter.jpg', 'inspection.mp4'].map((name) => path.resolve(__dirname, '../assets', name)));
  await input('#message-text', caption);
  await click('#message-form button[type=submit]');
  await assert(
    'У отправленного с устройства сообщения появились две миниатюры',
    `document.querySelectorAll('${sent} button').length===2 && !document.querySelector('.draft-attachments .file-card')`,
  );
  await goto('chat/10428', scope('expanded') + '&offline=1');
  await assert(
    'Локальные файлы и подпись сообщения доступны после перезагрузки без сети',
    `document.querySelector('#messages').textContent.includes('${caption}') && document.querySelector('${sent} img').naturalWidth>0 && document.querySelector('${sent} video').videoWidth>0`,
  );
  await click(sent + ' button:nth-child(2)');
  await assert(
    'Восстановленное видео открывается из локальных данных',
    "document.querySelector('.media-stage video').src.startsWith('blob:') && document.querySelector('.viewer-nav').textContent.includes('2 из 2')",
  );
  await click('[data-media-nav="-1"]');
  await assert(
    'У восстановленного фото верное имя и изображение',
    "document.querySelector('#media-title').textContent==='meter.jpg' && document.querySelector('.media-stage img').naturalWidth>0",
  );
  await close();
  await goto('chat/10428', scope('expanded'));
  await assert(
    'После открытия со связью сохранённое сообщение доставлено в одном экземпляре',
    `Kontur.state.messages[10428].filter(m=>m.text==='${caption}').length===1 && Kontur.state.messages[10428].find(m=>m.text==='${caption}').status==='delivered'`,
  );
  await navigate('chat/10429');
  await assert(
    'Медиа сообщения не попали в другую заявку',
    `!document.querySelector('${sent}') && !document.querySelector('#messages').textContent.includes('${caption}')`,
  );
};
