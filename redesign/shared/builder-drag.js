(() => {
  document.addEventListener('pointerdown', event => {
    const handle = event.target.closest('.admin-drag');
    if (!handle || !event.isPrimary || event.button !== 0) return;
    const row = handle.closest('[data-builder-index]');
    const list = row.parentElement;
    const rows = [...list.querySelectorAll(':scope > [data-builder-index]')];
    if (rows.length < 2) return;

    // Захват сохраняет жест при выходе указателя за пределы узкой ручки.
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const listeners = new AbortController();
    const options = {signal: listeners.signal};
    const from = Number(row.dataset.builderIndex);
    let x = event.clientX;
    let y = event.clientY;
    let target;
    let preview;
    let frame;

    function updateTarget() {
      const hit = document.elementFromPoint(x, y);
      const card = hit?.closest('[data-builder-index]');
      let next = card?.parentElement === list ? card : null;
      if (hit === list) {
        // В промежутке выбираем позицию вставки и отмечаем ближайший к ней край карточки.
        let slot = rows.findIndex(item => {
          const bounds = item.getBoundingClientRect();
          return y < bounds.top || (y < bounds.bottom && x < bounds.left);
        });
        if (slot < 0) slot = rows.length;
        next = rows[slot > from ? slot - 1 : slot];
      }
      if (next === row) next = null;
      if (next === target) return;
      target?.removeAttribute('data-drop');
      target = next;
      if (target) target.dataset.drop = Number(target.dataset.builderIndex) > from ? 'after' : 'before';
    }

    function scrollAtEdge() {
      if (!row.isConnected) return finish();
      const bounds = list.getBoundingClientRect();
      if (x >= bounds.left && x <= bounds.right) {
        const margin = Math.min(120, innerHeight / 5);
        const speed = y < margin ? y - margin : Math.max(0, y - innerHeight + margin);
        if (speed) {
          window.scrollBy(0, Math.sign(speed) * Math.ceil(Math.min(16, Math.abs(speed) / 5)));
          updateTarget();
        }
      }
      frame = requestAnimationFrame(scrollAtEdge);
    }

    function move(pointer) {
      if (pointer.pointerId !== event.pointerId) return;
      x = pointer.clientX;
      y = pointer.clientY;
      if (!preview) {
        if (Math.hypot(x - event.clientX, y - event.clientY) < 5) return;
        preview = document.createElement('div');
        preview.className = 'builder-drag-preview';
        preview.textContent = row.querySelector('strong, .admin-step-number + span').textContent;
        preview.setAttribute('aria-hidden', 'true');
        document.body.append(preview);
        row.classList.add('dragging');
        frame = requestAnimationFrame(scrollAtEdge);
      }
      const left = Math.min(x + 12, document.documentElement.clientWidth - preview.offsetWidth);
      const top = Math.min(y + 10, innerHeight - preview.offsetHeight);
      preview.style.transform = `translate(${left}px, ${top}px)`;
      updateTarget();
    }

    function finish() {
      listeners.abort();
      cancelAnimationFrame(frame);
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      target?.removeAttribute('data-drop');
      row.classList.remove('dragging');
      preview?.remove();
    }

    document.addEventListener('pointermove', move, options);
    document.addEventListener('pointerup', pointer => {
      if (pointer.pointerId !== event.pointerId) return;
      x = pointer.clientX;
      y = pointer.clientY;
      updateTarget();
      const to = target ? Number(target.dataset.builderIndex) : from;
      finish();
      if (preview && row.isConnected && to !== from) {
        list.dispatchEvent(new CustomEvent('rd:builder-reorder', {bubbles: true, detail: {from, to}}));
      }
    }, options);
    for (const type of ['lostpointercapture', 'pointercancel']) {
      document.addEventListener(type, pointer => {
        if (pointer.pointerId === event.pointerId) finish();
      }, options);
    }
    document.addEventListener('keydown', key => { if (key.key === 'Escape') finish(); }, options);
    window.addEventListener('blur', finish, options);
    document.addEventListener('rd:render', finish, options);
  });
})();
