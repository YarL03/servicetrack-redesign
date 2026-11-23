module.exports = async function ({action, assert, click, evaluate, goto, input, on, scope, shot, size}) {
  const studio = (mode) => '#studio-modes [data-mode="' + mode + '"]';
  const back = '#app .header-back a';
  const chatOnly =
    "!!document.querySelector('#message-text') && !!document.querySelector('#message-form [data-action=attach-chat]') && !document.querySelector('.work-prompt, [data-action=view-result]')";
  await goto('chat/10428', scope('simple-no-forms'));
  await assert('Прямая ссылка открывает переписку № 10428 без формы', chatOnly);
  await shot('thread-simple-no-forms');

  await size(1440, 940);
  await goto('inbox', '?mode=simple&theme=light');
  await click(studio('simple-no-forms'));
  await evaluate("document.querySelector('#reference-image').decode()");
  await assert(
    'В левой панели выбран вариант без форм, справа показан соответствующий чат',
    `document.querySelector('${studio('simple-no-forms')}').getAttribute('aria-pressed') === 'true' &&
      document.querySelector('#live-title').textContent === 'Упрощённый с заявками без форм' &&
      !document.querySelector('#studio-routes').textContent.includes('Чат с формой') &&
      document.querySelector('#reference-image').src.endsWith('/thread-simple-no-forms.png')`,
  );
  await shot('overview-no-forms');
  await click('#reference-link');
  await assert('Связанный экран открывает тот же чат без шагов', on('chat', 10428) + ' && ' + chatOnly);
  await click(back);
  for (const id of [10428, 10429, 10430, 10431, 10432, 10433]) {
    if (id === 10433) await click('[data-filter=archive]');
    await click(`#inbox-rows a[href="#chat/${id}"]`);
    await assert('Из списка открывается чат без шагов № ' + id, on('chat', id) + ' && ' + chatOnly);
    if (id === 10429) {
      await action('attach-chat');
      await click('#sheet [data-action=add-sample]');
      await input('#message-text', 'Акт замены прибора');
      await click('#message-form button[type=submit]');
      await assert(
        'Отправка сообщения с файлом переводит заявку в работу и сохраняет чат без шагов',
        chatOnly +
          " && document.querySelector('.thread-context .chip').textContent === 'В работе' && document.querySelector('#messages .message.own:last-child').textContent.includes('Акт замены прибора') && Kontur.state.messages[10429].at(-1).files.length === 1",
      );
    }
    await click(back);
  }
  await goto('chat/10428');
  await assert('Выбранный вариант без форм запоминается', chatOnly);
  await action('chat-menu');
  await click('#sheet [data-action=mode-menu]');
  await assert(
    'На телефоне выбран упрощённый режим приложения',
    "document.querySelectorAll('#sheet [data-mode]').length === 2 && document.querySelector('#sheet [data-mode=simple]').getAttribute('aria-pressed') === 'true'",
  );
  await click('#sheet [data-mode=simple]');
  await input('#message-text', 'Сверяю номер пломбы');
  await click(studio('expanded'));
  await assert('Из чата без форм открывается расширенная карточка той же заявки', on('detail', 10428));
  await click(studio('simple-no-forms'));
  await assert(
    'Возврат из карточки сохраняет черновик переписки',
    chatOnly + " && document.querySelector('#message-text').value === 'Сверяю номер пломбы'",
  );
  await click(studio('simple'));
  await assert(
    'Обычный упрощённый вариант возвращает рабочий шаг',
    on('chat', 10428) + " && !!document.querySelector('.work-prompt')",
  );
  await size(390);
  await goto('inbox');
};
