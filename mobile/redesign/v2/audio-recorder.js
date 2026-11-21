'use strict';
(() => {
  const K = Kontur;
  const dialog = document.querySelector('#sheet');
  let active;

  function cancel() {
    if (!active) return;
    const {recorder, stream, timer} = active;
    active = null;
    clearInterval(timer);
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    stream?.getTracks().forEach((track) => track.stop());
  }

  async function open(sheet, requestId, preview) {
    sheet(
      'Запись аудио',
      `<section class="audio-recorder">
      <p class="attachment-target">${K.mediaFiles.titles['work-extra']} · № ${requestId}</p>
      <div class="recorder-display">${K.icon('mic')}<strong role="timer" aria-label="Длительность записи">0:00</strong>
      <span role="status">Ожидаем доступ к микрофону…</span></div>
      <div class="recorder-actions">${K.button('Отмена', 'close-sheet', 'secondary')}
      <button type="button" class="btn primary" data-stop-recording disabled>Остановить запись</button></div></section>`,
    );
    const panel = dialog.querySelector('.audio-recorder');
    const status = panel.querySelector('[role=status]');
    const clock = panel.querySelector('[role=timer]');
    const stop = panel.querySelector('[data-stop-recording]');
    const session = {panel};
    active = session;
    const current = () => active === session && dialog.open && panel.isConnected;

    function fail(message, retry = true) {
      if (!current()) return;
      cancel();
      panel.classList.remove('is-recording');
      status.textContent = message;
      stop.hidden = !retry;
      stop.disabled = false;
      stop.textContent = 'Повторить';
      stop.onclick = () => open(sheet, requestId, preview);
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      fail('Запись в этом браузере недоступна. Можно приложить готовый аудиофайл.', false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      if (!current()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      session.stream = stream;
      const recorder = new MediaRecorder(stream);
      session.recorder = recorder;
      const chunks = [];
      let bytes = 0;
      let duration = 0;
      recorder.ondataavailable = ({data}) => {
        if (!current() || !data.size) return;
        bytes += data.size;
        if (bytes > 25 * 1024 * 1024) return fail('Запись превысила 25 МБ. Запишите более короткий фрагмент.');
        chunks.push(data);
      };
      recorder.onerror = () => fail('Не удалось записать звук. Проверьте микрофон.');
      recorder.onstop = () => {
        if (!current()) return;
        if (!duration || !chunks.length) return fail('Запись прервалась. Попробуйте ещё раз.');
        const type = chunks[0].type || recorder.mimeType;
        const ext = type.includes('mp4') ? 'm4a' : type.split(';')[0].split('/')[1];
        const stamp = new Date().toLocaleTimeString('ru-RU').replace(/:/g, '-');
        const file = new File(chunks, `Аудиозапись ${stamp}.${ext}`, {type});
        cancel();
        preview(file, duration);
      };
      recorder.start(500);
      const started = performance.now();
      session.timer = setInterval(() => {
        const seconds = Math.floor((performance.now() - started) / 1000);
        clock.textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
      }, 250);
      panel.classList.add('is-recording');
      status.textContent = 'Идёт запись';
      stop.disabled = false;
      stop.onclick = () => {
        if (recorder.state !== 'recording') return;
        duration = (performance.now() - started) / 1000;
        stop.disabled = true;
        recorder.stop();
      };
    } catch (error) {
      const messages = {
        NotAllowedError: 'Разрешите доступ к микрофону в настройках браузера и повторите запись.',
        NotFoundError: 'Микрофон не найден. Подключите его и повторите запись.',
      };
      fail(messages[error.name] || 'Не удалось включить микрофон. Проверьте его и повторите запись.');
    }
  }

  dialog.addEventListener('close', () => {
    if (!dialog.open || !active?.panel.isConnected) cancel();
  });
  window.addEventListener('pagehide', () => {
    if (active) {
      cancel();
      dialog.close();
    }
  });
  K.audioRecorder = {open, cancel};
})();
