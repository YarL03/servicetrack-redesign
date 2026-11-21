'use strict';
(() => {
  const K = Kontur,
    I = K.icon;
  let mode, flash, recording, context, hooks;
  const frame = () => document.querySelector('.camera-view');
  function paint() {
    const photo = mode === 'photo';
    const allowVideo = ['chat', 'work-extra'].includes(context);
    hooks.sheet(
      'Камера',
      `<section class="camera-view">
      <header class="cam-header"><button data-action="close-sheet" aria-label="Закрыть камеру">${I('close')}</button><span>Камера</span><button class="flash-toggle" data-camera="flash" aria-pressed="${flash}" aria-label="Вспышка" ${recording ? 'disabled' : ''}>${I('bolt')} ${flash ? 'Вкл.' : 'Выкл.'}</button></header>
      <div class="viewfinder ${flash ? 'lit' : ''}">${photo ? '<img src="assets/meter.jpg" alt="Счётчик в видоискателе">' : '<video src="assets/inspection.mp4" poster="assets/meter.jpg" muted playsinline></video>'}
       <div class="cam-guides"></div><div class="cam-target"><i></i><i></i><i></i><i></i></div><span class="camera-demo">Демокамера</span>${photo ? '' : '<span class="cam-time">00:00</span>'}</div>
      <footer><div class="camera-modes" aria-label="Режим съёмки"><button data-camera="photo" aria-pressed="${photo}" ${recording ? 'disabled' : ''}>Фото</button>${allowVideo ? `<button data-camera="video" aria-pressed="${!photo}" ${recording ? 'disabled' : ''}>Видео</button>` : ''}</div>
      <div class="camera-controls"><button data-camera="gallery" ${recording ? 'disabled' : ''}>${I('photo')}<small>Галерея</small></button><button class="shutter ${mode}" data-camera="shutter" aria-label="${photo ? 'Сделать фото' : recording ? 'Остановить запись' : 'Начать запись'}"><i></i></button><button data-camera="native" ${recording ? 'disabled' : ''}>${I('camera')}<small>Камера устройства</small></button></div></footer></section>`,
    );
  }
  function finish() {
    if (!recording || !frame() || !document.querySelector('#sheet').open) return;
    recording = false;
    hooks.capture(mode);
  }
  function init(h) {
    hooks = h;
    document.addEventListener('click', (e) => {
      const cmd = e.target.closest('[data-camera]')?.dataset.camera;
      if (!cmd || !frame()) return;
      if (cmd === 'flash') {
        flash = !flash;
        paint();
      } else if (cmd === 'photo' || cmd === 'video') {
        mode = cmd;
        paint();
      } else if (cmd === 'gallery' || cmd === 'native')
        hooks.chooseFile(cmd === 'native' ? 'device-' + mode : 'gallery-' + mode, context);
      else if (mode === 'photo') hooks.capture('photo');
      else if (recording) finish();
      else {
        recording = true;
        paint();
        const video = frame().querySelector('video');
        frame().classList.add('recording');
        video.ontimeupdate = () => {
          const time = frame()?.querySelector('.cam-time');
          if (time) time.textContent = '00:' + String(Math.floor(video.currentTime)).padStart(2, '0');
        };
        video.onended = finish;
        video.play().catch(() => {
          if (frame() && recording) {
            recording = false;
            paint();
            hooks.toast('Демовидео недоступно. Откройте камеру устройства.');
          }
        });
      }
    });
    document.querySelector('#sheet').addEventListener('close', () => {
      if (document.querySelector('#sheet').open) return;
      recording = false;
      const v = frame()?.querySelector('video');
      if (v) {
        v.onended = null;
        v.pause();
      }
    });
  }
  K.camera = {
    init,
    open(field) {
      context = field;
      mode = 'photo';
      flash = false;
      recording = false;
      paint();
    },
  };
})();
