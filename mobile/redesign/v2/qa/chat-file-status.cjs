module.exports = async function checkChatFileStatus({action, assert, click, goto, input, scope, shot, size}) {
  async function attach() {
    await action('attach-chat');
    await click('#sheet [data-action=add-sample]');
  }
  const send = () => click('#message-form button[type=submit]');
  const badge = "document.querySelector('.thread-context .chip').textContent";
  const messages = 'Kontur.state.messages[Kontur.state.id]';
  const sentFiles = `${messages}.filter(m => m.role === 'worker' && m.files?.length)`;
  const starts = `${messages}.filter(m => m.role === 'event' && m.text === 'Работа начата').length`;
  const modal = "document.querySelector('#sheet').open";

  for (const mode of ['simple', 'expanded']) {
    for (const [id, status] of [
      [10429, 'Готова к исполнению'],
      [10430, 'Недопуск'],
    ]) {
      const delayed = status === 'Недопуск';
      const offline = delayed && mode === 'expanded';
      const context = `${mode} · ${status} · `;
      await size(offline ? 320 : 390);
      await goto(mode === 'simple' ? 'inbox' : 'chats', scope(mode) + (offline ? '&offline=1' : ''));
      await click(`#app a[href="#chat/${id}"]`);
      await input('#message-text', 'Я на объекте');
      await send();
      await assert(
        context + 'текст отправлен с прежним статусом',
        `${badge} === '${status}' && !${modal} && ${messages}.at(-1).text === 'Я на объекте'`,
      );
      await attach();
      await assert(
        context + 'выбор файла сохраняет его в черновике',
        `${badge} === '${status}' && !${modal} && Kontur.state.attachments.length === 1 && ${sentFiles}.length === 0`,
      );

      if (delayed) {
        await input('#message-text', 'Акт осмотра');
        await send();
        await assert(
          context + 'до подтверждения видны предупреждение и выбор',
          `${modal} && document.querySelector('#sheet p').textContent.includes('№ 10430 перейдёт из статуса «Недопуск» в статус «В работе»') &&
           document.querySelector('#sheet [data-action=confirm-resume-send]').textContent === 'Отправить и взять в работу' &&
           ${badge} === 'Недопуск' && ${sentFiles}.length === 0 && ${starts} === 0`,
        );
        if (mode === 'simple') await shot('confirm-resume-send');
        await assert(
          context + 'обе кнопки помещаются в окне',
          `[...document.querySelectorAll('#sheet .btn')].every(b => {
            const bounds = b.getBoundingClientRect();
            return bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight;
          })`,
        );
        await click('#sheet .btn[data-action=close-sheet]');
        await assert(
          context + 'отмена сохраняет статус, подпись и файл',
          `!${modal} && ${badge} === 'Недопуск' && ${sentFiles}.length === 0 && ${starts} === 0 &&
           document.querySelector('#message-text').value === 'Акт осмотра' && !!document.querySelector('.draft-attachments .file-card')`,
        );
        await send();
        await click('#sheet [data-action=confirm-resume-send]');
      } else {
        await send();
      }

      await assert(
        context + 'файл отправлен один раз, заявка в работе',
        `!${modal} && ${badge} === 'В работе' && ${starts} === 1 && ${sentFiles}.length === 1 &&
         ${sentFiles}[0].files[0].name === 'Акт замены.pdf' && ${sentFiles}[0].text === '${delayed ? 'Акт осмотра' : ''}' &&
         ${sentFiles}[0].status === '${offline ? 'queued' : 'delivered'}' && !Kontur.state.attachments.length &&
         document.querySelector('#message-text').value === ''`,
      );
      if (mode === 'simple') {
        await assert(
          context + 'после отправки вложения состав чата соответствует настройке заявки',
          `Boolean(document.querySelector('.work-prompt')) === ${id === 10429}`,
        );
      }
      if (offline) {
        await click('#studio-network');
        await assert(
          context + 'после восстановления сети отправка подтверждена один раз',
          `${sentFiles}.length === 1 && ${sentFiles}[0].status === 'delivered' && ${starts} === 1`,
        );
      }
      await attach();
      await send();
      await assert(
        context + 'следующий файл отправлен без повторного старта',
        `!${modal} && ${badge} === 'В работе' && ${sentFiles}.length === 2 && ${starts} === 1`,
      );
      await click('#app .header-back a');
      await assert(
        context + 'статус обновился в списке только у выбранной заявки',
        `document.querySelector('#app a[href="#chat/${id}"] .chip').textContent === 'В работе' &&
         document.querySelector('#app a[href="#chat/${delayed ? 10429 : 10430}"] .chip').textContent === '${delayed ? 'Готова к исполнению' : 'Недопуск'}'`,
      );
    }
  }

  for (const [id, status] of [
    [10432, 'Доработка'],
    [10433, 'Выполнена'],
    [10440, 'Готова к исполнению'],
  ]) {
    await goto('chat/' + id, scope('expanded'));
    await attach();
    await send();
    await assert(
      `№ ${id} · переписка сохраняет статус «${status}»`,
      `!${modal} && ${badge} === '${status}' && ${sentFiles}.length === 1 && ${starts} === 0`,
    );
  }
};
