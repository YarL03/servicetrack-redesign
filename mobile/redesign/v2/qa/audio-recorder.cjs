module.exports = async function ({
  action,
  assert,
  click,
  confirmFile,
  evaluate,
  goto,
  input,
  navigate,
  scope,
  shot,
  size,
}) {
  const field = "Kontur.state.draft.fieldMedia['work-extra']";
  const recording = "document.querySelector('.audio-recorder.is-recording')";
  const ended = "window.testMic.getTracks().every(t => t.readyState === 'ended')";
  const audio = "document.querySelector('.intake-stage audio')";
  async function waitFor(expression) {
    await evaluate(`new Promise((resolve, reject) => {
      const until = Date.now() + 6000;
      function poll() {
        if (${expression}) resolve();
        else if (Date.now() > until) reject(new Error(${JSON.stringify('Не дождались ' + expression)}));
        else setTimeout(poll, 30);
      }
      poll();
    })`);
  }
  const watchMic = () =>
    evaluate(`window.captureMic = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (...args) => window.testMic = await window.captureMic(...args)`);
  const tapMic = () => click('#sheet [data-source=audio]');
  await evaluate("localStorage.removeItem('kontur-mobile-v2-drafts')");
  for (const mode of ['expanded', 'simple']) {
    const expanded = mode === 'expanded';
    const screen = expanded ? 'work/10431' : 'chat/10428';
    await size(expanded ? 390 : 320);
    await goto(screen, scope(mode) + '&offline=1');
    const count = await evaluate(field + '.length');
    if (!expanded) await click('[data-upload-field="work-extra"] summary');
    await assert(
      mode + ' · В поле материалов одно действие для добавления вложений',
      `(() => {
        const buttons = document.querySelectorAll('#app [data-upload-field="work-extra"] button[data-action]');
        return buttons.length === 1 && buttons[0].textContent.trim() === 'Приложить материалы' && buttons[0].getBoundingClientRect().height > 0;
      })()`,
    );
    await watchMic();
    await evaluate("document.querySelector('[data-action=attach-work]').scrollIntoView({block:'center'})");
    await action('attach-work');
    await assert(
      mode + ' · Три кнопки меню показаны значками и имеют доступные названия',
      `(() => {
        const buttons = [...document.querySelectorAll('#sheet .source-grid button')];
        const names = {camera: 'Камера', mixed: 'Выбрать файлы', audio: 'Записать аудио'};
        return buttons.map(b => b.dataset.source).join() === 'camera,mixed,audio' && buttons.every(b => {
          const rect = b.getBoundingClientRect();
          return b.getAttribute('aria-label') === names[b.dataset.source] && !b.innerText.trim()
            && b.querySelector('svg') && rect.width >= 44 && rect.height >= 44;
        });
      })()`,
    );
    await tapMic();
    await waitFor(recording + ' && ' + recording + ".querySelector('[role=timer]').textContent!=='0:00'");
    await assert(mode + ' · Микрофон пишет, файл ещё не добавлен', `${field}.length===${count} && !${ended}`);
    if (expanded) await shot('audio-recorder');
    await click('[data-stop-recording]');
    await waitFor(audio + '?.readyState >= 1');
    await assert(
      mode + ' · После остановки открывается предпросмотр и микрофон освобождён',
      `${ended} && ${field}.length===${count}`,
    );
    await click('.intake-stage [data-audio-play]');
    await waitFor(audio + '.currentTime > 0');
    await click('.intake-stage [data-audio-play]');
    await input('.intake-stage input[type=range]', '0.6');
    await evaluate(`const speed = document.querySelector('.intake-stage [data-audio-speed]');
      speed.value = '1.5'; speed.dispatchEvent(new Event('change', {bubbles:true}))`);
    await waitFor('!' + audio + '.seeking');
    await assert(
      mode + ' · Запись воспроизводится, перематывается и меняет скорость',
      `${audio}.paused && Math.abs(${audio}.currentTime-0.6)<0.1 && ${audio}.playbackRate===1.5`,
    );
    await input('[data-intake-comment]', 'Звук прибора');
    await confirmFile();
    await goto(screen, scope(mode) + '&offline=1');
    await waitFor(`Kontur.mediaFiles.source(${field}.at(-1))`);
    await assert(
      mode + ' · Запись и комментарий восстановлены в материалах осмотра',
      `${field}.length===${count + 1} && ${field}.at(-1).kind==='audio' && ${field}.at(-1).stored && ${field}.at(-1).comment==='Звук прибора' && !Kontur.state.attachments.length`,
    );
  }
  await goto('work/10431', scope('expanded'));
  const count = await evaluate(field + '.length');
  await watchMic();
  await evaluate(
    "navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); }",
  );
  await action('attach-work');
  await tapMic();
  await assert(
    'Отказ в доступе объяснён, можно повторить',
    "document.querySelector('.audio-recorder [role=status]').textContent.includes('Разрешите доступ') && document.querySelector('[data-stop-recording]').textContent==='Повторить'",
  );
  await evaluate(
    'navigator.mediaDevices.getUserMedia = async (...args) => window.testMic = await window.captureMic(...args)',
  );
  await click('[data-stop-recording]');
  await waitFor(recording);
  await click('#sheet .recorder-actions [data-action=close-sheet]');
  await waitFor(ended);
  await assert(
    'Отмена записи сохраняет состав поля',
    `${field}.length===${count} && !document.querySelector('#sheet').open`,
  );

  await evaluate(`navigator.mediaDevices.getUserMedia = () => new Promise(resolve => {
    window.grantMic = async () => resolve(window.testMic = await window.captureMic({audio:true}));
  })`);
  await action('attach-work');
  await tapMic();
  await navigate('work/10428');
  await evaluate('window.grantMic()');
  await waitFor(ended);
  await assert(
    'Позднее разрешение после перехода в другую заявку освобождает микрофон',
    "!document.querySelector('#sheet').open && Kontur.state.id===10428",
  );
  await navigate('work/10431');
  await assert('В исходной заявке нет вложения от отменённой записи', `${field}.length===${count}`);
};
