'use strict';
(() => {
  const K = Kontur;
  const inspection = {
    title: 'Осмотр и демонтаж',
    fields: [
      {key: 'oldModel', label: 'Старый прибор'},
      {key: 'oldSerial', label: 'Заводской номер'},
      {key: 'inspection', files: true},
    ],
  };
  const installation = {
    title: 'Установка прибора',
    fields: [
      {key: 'serial', label: 'Заводской номер'},
      {key: 'reading', label: 'Начальные показания', unit: 'кВт·ч'},
      {key: 'work', files: true},
      {key: 'comment', label: 'Комментарий'},
      {key: 'work-extra', files: true},
    ],
  };

  function input(field) {
    const {key, label, unit} = field;
    if (field.files) return K.mediaUI.panel(key);
    const value = K.escape(K.state.draft[key]);
    if (key === 'serial')
      return `<label class="field"><span>${label} *</span><span class="field-input-row"><input id="serial" autocomplete="off" inputmode="numeric" value="${value}">${K.iconButton('scan', 'Сканировать заводской номер', 'scan', 'bordered')}</span><small>Меркурий 201.7 · однофазный</small></label>`;
    if (key === 'reading') {
      const invalid = K.state.reviewError && !value;
      return `<label class="field ${invalid ? 'error' : ''}"><span>${label}, ${unit} *</span><input id="reading" inputmode="decimal" placeholder="Например, 00012,5" value="${value}" ${invalid ? 'aria-invalid="true" aria-describedby="reading-error"' : ''}><small id="reading-error" class="${invalid ? 'field-error' : ''}">${invalid ? 'Укажите начальные показания.' : 'Введите показания с установленного прибора.'}</small></label>`;
    }
    return `<label class="field mt24"><span>${label} <span class="muted">· необязательно</span></span><textarea id="work-comment" placeholder="Что важно знать менеджеру" maxlength="400">${value}</textarea></label>`;
  }

  function reviewFields(step, draft, editable) {
    return step.fields
      .map(({key, label, unit, files}) => {
        if (files) return K.mediaUI.panel(key, editable ? 'check' : 'report');
        const value = String(draft[key] ?? '').trim();
        let edit = '';
        if (editable && K.state.mode === 'expanded') {
          const target = key === 'comment' ? 'work-comment' : key;
          edit = `<button class="text-link" data-field="${target}">${value ? 'Изменить' : 'Заполнить'}</button>`;
        } else if (editable && (key === 'serial' || key === 'reading')) {
          edit = `<button class="text-link" data-action="edit-${key}">Изменить</button>`;
        }
        return `<div class="summary-row" data-review-field="${key}"><div><p>${label}</p><strong class="${value ? '' : 'muted'}">${value ? K.escape(value) + (unit ? ' ' + unit : '') : 'Не заполнено'}</strong></div>${edit}</div>`;
      })
      .join('');
  }

  K.workForm = {
    inputs: () => installation.fields.map(input).join(''),
    inspection: () => `<div class="review-fields">${reviewFields(inspection, K.state.draft, false)}</div>`,
    review(draft = K.state.draft, editable = true) {
      return [inspection, installation]
        .map(
          (step, index) =>
            `<section class="review-step"><h3>Шаг ${index + 1} · ${step.title}</h3><div class="panel review-fields">${reviewFields(step, draft, editable && step === installation)}</div></section>`,
        )
        .join('');
    },
  };
})();
