(() => {
  const R = window.RD;
  const fields = {
    photo: { label: 'Фото установленного прибора', stage: 'Подтверждение работ', kinds: ['photo'] },
    video: { label: 'Проверка работы прибора', stage: 'Подтверждение работ', kinds: ['video'] },
    audio: { label: 'Аудиокомментарий', stage: 'Подтверждение работ', kinds: ['audio'] },
    document: { label: 'Документ', stage: 'Документы и дополнительные материалы', kinds: ['document'] },
    extra: { label: 'Дополнительные материалы', stage: 'Документы и дополнительные материалы', limit: 5 },
  };
  const samples = {
    photo: ['Пломба после замены.jpg', 'meter.jpg', '117 КБ', 'image/jpeg'],
    video: ['Проверка подключения.mp4', 'inspection.mp4', '68 КБ', 'video/mp4'],
    audio: ['Звук прибора.mp3', 'meter-signal.mp3', '40 КБ', 'audio/mpeg'],
    document: ['Подписанный акт.pdf', 'replacement-act.pdf', '49 КБ', 'application/pdf'],
  };
  let sequence = 0;
  const nextId = () => 'f' + ++sequence;
  function sample(kind) {
    const [name, path, size, mime] = samples[kind];
    return { id: nextId(), name, url: 'assets/' + path, size, mime, kind, field: null };
  }
  const conversations = {
    10428: [
      ['10:20', 'event', 'Исполнитель приступил к работе'],
      ['10:22', 'manager', 'Алексей, пришлите фото пломбы и материалы проверки.'],
      ['10:36', 'worker', 'Прибор установлен. Снял пломбу и проверку подключения.', ['photo', 'video']],
      ['10:42', 'worker', 'Абонент подписал акт. Прикладываю его и запись звука прибора.', ['document', 'audio']],
    ],
    10427: [['09:38', 'manager', 'Ирина, согласуйте время визита с абонентом.']],
    10426: [['09:50', 'worker', 'Проверку закончил, акт подписан.', ['document']]],
    10425: [['09:05', 'worker', 'Абонента нет дома. Передаю запись с объекта. Когда можно согласовать повторный визит?', ['audio']]],
    10423: [['08:30', 'event', 'Заявка завершена'], ['08:32', 'manager', 'Спасибо, результат принят.']],
  };
  const requests = R.workRequests.map(record => {
    const { id } = record;
    const [street, house] = record.address.replace('ул. ', '').split(' · ')[0].split(', ');
    return {
      ...record, street, house, city: 'Иркутск',
      archive: ['Выполнена', 'Завершена'].includes(record.status),
      hasWorker: record.worker !== 'Не назначен',
      fields: id === '10428' ? Object.keys(fields) : ['10427', '10426', '10423'].includes(id) ? ['document', 'extra'] : [],
      messages: (conversations[id] || []).map(([time, role, text, kinds = []]) => ({ time, role, text, files: kinds.map(sample) })),
      unread: ({10428: 2, 10425: 1})[id] || 0,
      poolOpen: true,
      draft: { text: '', files: [] },
    };
  });
  const get = id => requests.find(request => request.id === id);
  const cardId = id => id === '10428' ? 'request' : 'request-' + id;
  const formId = id => id === '10428' ? 'request-object' : cardId(id);
  const incoming = record => record.messages.filter(m => m.role === 'worker').flatMap(m => m.files);
  function eligible(record, file, id) {
    const field = fields[id];
    return record.fields.includes(id) && (!field.kinds || field.kinds.includes(file.kind)) &&
      (!field.limit || incoming(record).filter(other => other !== file && other.field === id).length < field.limit);
  }
  function localFile(file) {
    const kind = ({image: 'photo', video: 'video', audio: 'audio'})[file.type.split('/')[0]] || 'document';
    const size = file.size < 1024 ? file.size + ' Б' : Math.ceil(file.size / 1024) + ' КБ';
    return { id: nextId(), name: file.name, mime: file.type, size, kind, url: URL.createObjectURL(file) };
  }
  const paths = {
    chat: 'M21 11a8 8 0 0 1-8 8H8l-5 3v-6a8 8 0 0 1 6-13h4a8 8 0 0 1 8 8ZM7 9h10M7 13h6',
    clip: 'm8 13 7-7a3 3 0 0 1 4 4l-9 9a5 5 0 0 1-7-7l10-10m-6 12 8-8',
    inbox: 'M3 14 7 4h10l4 10v6H3Zm0 0h5l2 3h4l2-3h5',
    send: 'm3 3 19 9-19 9 4-9Zm4 9h15',
    photo: 'M3 4h18v16H3Zm0 12 5-5 4 4 3-3 6 5M15 8h.1',
    video: 'M3 6h12v12H3Zm12 4 6-4v12l-6-4Z',
    audio: 'M3 10v4m4-7v10m5-14v18m5-15v12m4-9v6',
  };
  function icon(name) {
    return paths[name] ? `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>` : R.icon(name);
  }
  R.requestPageId = cardId;
  window.KonturV2 = {
    requests, fields, get, cardId, formId, incoming, eligible, localFile, icon,
    pending: record => incoming(record).filter(f => !f.field),
    totalUnread: () => requests.reduce((n, r) => n + r.unread, 0),
  };
})();
