'use strict';
(() => {
  const K = Kontur;
  const titles = {
    inspection: 'Фото до работ',
    work: 'Фото установленного прибора',
    'work-extra': 'Материалы осмотра',
    delay: 'Фото уведомления',
    'delay-act': 'Фото акта недопуска',
  };
  const samples = {
    photo: {name: 'Счётчик.jpg', src: 'assets/meter.jpg'},
    video: {name: 'Осмотр корпуса.mp4', src: 'assets/inspection.mp4'},
    audio: {name: 'Сигнал прибора.mp3', src: 'assets/meter-signal.mp3'},
    file: {name: 'Акт замены.pdf', src: 'assets/replacement-act.pdf'},
  };
  const urls = new Map();
  let database;
  function db() {
    if (!database)
      database = new Promise((resolve, reject) => {
        const open = indexedDB.open('service-track-v2-field-files', 2);
        open.onupgradeneeded = () => {
          if (!open.result.objectStoreNames.contains('files')) open.result.createObjectStore('files');
          open.result.createObjectStore('chatMedia', {keyPath: ['requestId', 'id']});
        };
        open.onblocked = () => reject(new Error('Хранилище открыто в другой вкладке.'));
        open.onsuccess = () => {
          const connection = open.result;
          database = Promise.resolve(connection);
          connection.onversionchange = () => {
            connection.close();
            database = null;
          };
          resolve(connection);
        };
        open.onerror = () => {
          database = null;
          reject(open.error);
        };
      });
    return database;
  }
  async function write(id, blob) {
    const connection = await db();
    await new Promise((resolve, reject) => {
      const tx = connection.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      if (blob) store.put(blob, id);
      else store.delete(id);
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
  }
  function uniqueId() {
    return Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(16).padStart(8, '0')).join('');
  }
  function kind(name, mime = '') {
    if (mime.startsWith('image/')) return 'photo';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (/\.(jpe?g|png|gif|webp|heic)$/i.test(name)) return 'photo';
    if (/\.(mp4|mov|webm)$/i.test(name)) return 'video';
    if (/\.(mp3|m4a|wav|ogg)$/i.test(name)) return 'audio';
    return 'file';
  }
  function sample(type, delivery = 'local') {
    return {id: uniqueId(), name: samples[type].name, kind: type, sample: type, delivery, comment: ''};
  }
  function fillSamples(extra) {
    for (const type of Object.keys(samples))
      if (!extra.some((f) => f.sample === type && f.delivery === 'sent')) extra.push(sample(type, 'sent'));
  }
  function migrate(draft, id) {
    const showSamples = id === 10428 && !draft.finished;
    const inspection = () => [{...sample('photo', 'sent'), name: 'Старый счётчик.jpg'}];
    if (draft.fieldMedia) {
      draft.fieldMedia.inspection ??= inspection();
      if (showSamples) fillSamples(draft.fieldMedia['work-extra']);
      return draft;
    }
    const oldFile = (name, submitted) => ({
      id: uniqueId(),
      name,
      kind: kind(name),
      delivery: submitted ? 'unknown' : 'local',
      comment: '',
    });
    const extra = (draft.extraFiles || []).map((name) => oldFile(name, draft.finished));
    if (showSamples || (id === 10433 && !draft.extraFiles)) fillSamples(extra);
    const photos = draft.photo ? [oldFile(draft.photoName || 'Счётчик.jpg', draft.finished)] : [];
    if (id === 10433 && !photos.length) photos.push(sample('photo', 'sent'));
    draft.fieldMedia = {
      inspection: inspection(),
      work: photos,
      'work-extra': extra,
      delay: draft.delayPhoto ? [oldFile('Уведомление.jpg', draft.delayed)] : [],
      'delay-act': draft.delayAct ? [oldFile('Акт.jpg', draft.delayed)] : [],
    };
    for (const key of ['extraFiles', 'photo', 'photoName', 'delayPhoto', 'delayAct']) delete draft[key];
    return draft;
  }
  function source(file) {
    return file.url || samples[file.sample]?.src || urls.get(file.id) || '';
  }
  async function saveChatMessage(requestId, message) {
    const connection = await db();
    // Blob URLs expire when the tab closes. IndexedDB keeps the original files with their message.
    const files = message.files.map(({url, ...file}) => file);
    await new Promise((resolve, reject) => {
      const tx = connection.transaction('chatMedia', 'readwrite');
      tx.objectStore('chatMedia').put({...message, requestId, files});
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
  }
  async function savedChatMessages() {
    const connection = await db();
    return new Promise((resolve, reject) => {
      const read = connection.transaction('chatMedia').objectStore('chatMedia').getAll();
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
    });
  }
  async function localFile(blob, onStorageError) {
    const item = {
      id: uniqueId(),
      name: blob.name,
      kind: kind(blob.name, blob.type),
      stored: true,
      delivery: 'local',
      comment: '',
    };
    urls.set(item.id, URL.createObjectURL(blob));
    try {
      await write(item.id, blob);
    } catch {
      item.stored = false;
      onStorageError();
    }
    return item;
  }
  async function restore(draft) {
    const missing = Object.values(draft.fieldMedia)
      .flat()
      .filter((f) => f.stored && !urls.has(f.id));
    if (!missing.length) return;
    try {
      const connection = await db();
      await Promise.all(
        missing.map(
          (f) =>
            new Promise((resolve) => {
              const read = connection.transaction('files').objectStore('files').get(f.id);
              read.onsuccess = () => {
                if (read.result && !urls.has(f.id)) urls.set(f.id, URL.createObjectURL(read.result));
                resolve();
              };
              read.onerror = resolve;
            }),
        ),
      );
    } catch {
      /* Names and comments are still available in the draft. */
    }
  }
  function remove(field, item) {
    if (!canDelete(item)) return;
    const files = K.state.draft.fieldMedia[field];
    const index = files.indexOf(item);
    if (index < 0) return;
    files.splice(index, 1);
    if (urls.has(item.id)) URL.revokeObjectURL(urls.get(item.id));
    urls.delete(item.id);
    if (item.stored) write(item.id, null).catch(() => {});
  }
  function submit(draft, fields, offline) {
    for (const field of fields)
      for (const file of draft.fieldMedia[field])
        if (file.delivery !== 'sent') file.delivery = offline ? 'queued' : 'sent';
  }
  function acknowledge(draft) {
    for (const file of Object.values(draft.fieldMedia || {}).flat())
      if (file.delivery === 'queued') file.delivery = 'sent';
  }
  function canDelete(file) {
    return file.delivery === 'local' || file.delivery === 'queued';
  }
  async function reset() {
    const connection = await db();
    await new Promise((resolve, reject) => {
      const tx = connection.transaction(['files', 'chatMedia'], 'readwrite');
      tx.objectStore('files').clear();
      tx.objectStore('chatMedia').clear();
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
  }
  K.mediaFiles = {
    uniqueId,
    saveChatMessage,
    savedChatMessages,
    reset,
    canDelete,
    titles,
    samples,
    kind,
    sample,
    migrate,
    source,
    localFile,
    restore,
    remove,
    submit,
    acknowledge,
  };
})();
