module.exports = async function ({
  confirmFile,
  action,
  assert,
  checkLayout,
  click,
  evaluate,
  goto,
  input,
  navigate,
  scope,
  shot,
  size,
}) {
  const expanded = scope('expanded');
  const geometry = (selector) => `(() => {
    const icon = document.querySelector('${selector}'), mark = icon.querySelector('.badge-count').getBoundingClientRect();
    const svg = icon.querySelector('svg').getBoundingClientRect();
    return [mark.top-svg.top,mark.right-svg.right,mark.height,mark.width];
  })()`;
  for (const width of [320, 390]) {
    await size(width);
    await goto('queue', expanded);
    const reference = await evaluate(geometry('.bottom-nav [href="#chats"]'));
    await navigate('detail/10428');
    await assert(
      'Счётчик закреплён у иконки чата как в нижнем меню на ' + width,
      `JSON.stringify(${geometry('.quick-actions a')})==='${JSON.stringify(reference)}' && document.querySelector('.quick-actions .badge-count').textContent==='2'`,
    );
    await assert(
      'Все подписи быстрых действий на одной высоте при ширине ' + width,
      "[...document.querySelectorAll('.quick-actions .action-icon')].every(el=>el.getBoundingClientRect().top===document.querySelector('.quick-actions .action-icon').getBoundingClientRect().top)",
    );
    if (width === 390) await shot('detail-chat-badge');
    await click('.quick-actions a');
    await navigate('detail/10428');
    await assert(
      'Прочтение снимает бейдж карточки на ' + width,
      "!document.querySelector('.quick-actions .badge-count')",
    );
  }
  await evaluate("localStorage.removeItem('kontur-mobile-v2-drafts')");
  await goto('work/10429', expanded);
  await action('review');
  const keys = (root) =>
    `[...document.querySelectorAll('${root} .review-step')].map(step=>[...step.querySelector('.review-fields').children].map(el=>el.dataset.reviewField || el.dataset.uploadField))`;
  const allFields = JSON.stringify([
    ['oldModel', 'oldSerial', 'inspection'],
    ['serial', 'reading', 'work', 'comment', 'work-extra'],
  ]);
  await assert(
    'На неполной заявке видны все поля обоих шагов в порядке формы',
    `JSON.stringify(${keys('#app')})==='${allFields}'`,
  );
  await assert(
    'Пустые комментарий и вложения обозначены, незаполненные обязательные блокируют завершение',
    "document.querySelector('[data-review-field=comment] strong').textContent==='Не заполнено' && document.querySelector('[data-media-field=work-extra]').textContent.includes('Файлы не добавлены') && !document.querySelector('#app [data-action=complete]')",
  );
  await click('[data-field=serial]');
  await input('#serial', '987654321');
  await input('#reading', '0');
  await action('work-photo');
  await click('#sheet [data-action=add-sample]');
  await confirmFile();
  await action('review');
  await assert(
    'Ноль отображается со своей единицей, пустые необязательные поля допускают завершение',
    "document.querySelector('[data-review-field=reading] strong').textContent==='0 кВт·ч' && !!document.querySelector('#app [data-action=complete]')",
  );
  await click('[data-field=work-comment]');
  await input('#work-comment', 'Пломба № 731 проверена.');
  await action('attach-work');
  await click('#sheet [data-action=add-sample]');
  await confirmFile();
  await action('review');
  await click('#app [data-media-field=inspection] button');
  await assert(
    'Фото предыдущего шага открывается из проверки',
    "document.querySelector('#media-title').textContent==='Старый счётчик.jpg' && document.querySelector('.media-stage img').naturalWidth>0",
  );
  await click('[data-viewer-close]');
  await click('#app [data-media-field=work-extra] button');
  await click('[data-comment-action=edit]');
  await input('[data-file-comment]', 'Акт подписан');
  await click('[data-comment-action=save]');
  await click('[data-viewer-close]');
  await assert(
    'На проверке видны комментарий формы, документ и актуальная подпись вложения',
    "document.querySelector('[data-review-field=comment] strong').textContent==='Пломба № 731 проверена.' && document.querySelector('[data-media-field=work-extra]').textContent.includes('Акт замены.pdf') && document.querySelector('[data-media-field=work-extra] small').textContent==='Акт подписан'",
  );
  await evaluate(
    "const scroller=document.querySelector('#app .scroll-content'); scroller.scrollTop+=document.querySelector('#app .review-step:last-of-type').getBoundingClientRect().top-scroller.getBoundingClientRect().top-8",
  );
  await shot('review-installation');
  await size(320);
  await checkLayout('review/10429', 320, 'Оба шага и вложения');
  await goto('chat/10429', scope('simple'));
  await action('start-work');
  await action('chat-step');
  await assert(
    'В чате тот же набор полей, включая комментарии и вложения той же заявки',
    `JSON.stringify(${keys('#sheet')})==='${allFields}' && document.querySelector('#sheet').textContent.includes('Пломба № 731 проверена.') && document.querySelector('#sheet').textContent.includes('Акт подписан') &&
    document.querySelector('#sheet').scrollWidth<=document.querySelector('#sheet').clientWidth`,
  );
  await click('#sheet [data-media-field=work] button');
  await click('[data-delete-media]');
  await assert(
    'Удаление обязательного фото из проверки в чате обновляет поле и блокирует завершение',
    "document.querySelector('#sheet [data-action=complete]').disabled && document.querySelector('#sheet [data-media-field=work]').textContent==='Файлы не добавлены'",
  );
};
