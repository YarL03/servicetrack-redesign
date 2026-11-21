const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {zipSync, strToU8} = require('../vendor/fflate-0.8.3.js');

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
  selectFiles,
  shot,
  size,
}) {
  const asset = (name) => path.resolve(__dirname, '../assets', name);
  const rows = "Kontur.state.draft.fieldMedia['work-extra']";
  const pick = async (files) => {
    await action('attach-work');
    await click('#sheet [data-source=mixed]');
    await selectFiles(files);
  };
  const note = (text) => input('[data-intake-comment]', text);
  await evaluate("localStorage.removeItem('kontur-mobile-v2-drafts')");
  await size(390);
  await goto('work/10431', scope('expanded') + '&offline=1');
  await pick(['meter.jpg', 'inspection.mp4', 'meter-signal.mp3', 'replacement-act.pdf'].map(asset));
  await assert(
    'Первое фото из файловой системы показано до добавления',
    `${rows}.length===0 && document.querySelector('.intake-stage img').naturalWidth>0 && document.querySelector('.intake-heading').textContent.includes('Файл 1 из 4')`,
  );
  await note('Номер пломбы читается');
  await shot('attachment-preview-photo');
  await confirmFile();
  await assert(
    'После подтверждения фото показано второе вложение с пустым комментарием',
    `${rows}.length===1 && ${rows}[0].comment==='Номер пломбы читается' && document.querySelector('.intake-stage video').controls && !document.querySelector('[data-intake-comment]').value`,
  );
  await note('Это видео пропускаем');
  await click('[data-intake-skip]');
  await click('.intake-stage [data-audio-play]');
  await assert(
    'Пропуск видео открывает воспроизводимую аудиозапись, поле ещё содержит только фото',
    `${rows}.length===1 && !document.querySelector('.intake-stage audio').paused && !document.querySelector('[data-intake-comment]').value`,
  );
  await note('Слышен сигнал');
  await confirmFile();
  await assert(
    'Оригинал PDF доступен на предпросмотре четвёртого файла',
    `Boolean(document.querySelector('.intake-stage object[type="application/pdf"], .intake-stage a[download]')) && document.querySelector('.intake-heading h3').textContent==='replacement-act.pdf'`,
  );
  await click('#sheet [data-action=close-sheet]');
  await goto('work/10431', scope('expanded') + '&offline=1');
  await assert(
    'После закрытия и перезагрузки остались только подтверждённые файлы со своими комментариями',
    `JSON.stringify(${rows}.map(f=>[f.kind,f.comment]))===JSON.stringify([['photo','Номер пломбы читается'],['audio','Слышен сигнал']])`,
  );
  await action('attach-work');
  await click('#sheet [data-source=camera]');
  await click('[data-camera=shutter]');
  await assert(
    'Снимок камеры тоже ждёт подтверждения',
    `${rows}.length===2 && !!document.querySelector('.intake-stage img')`,
  );
  await click('[data-intake-skip]');
  await assert(
    'Отмена одиночного снимка закрывает просмотр без добавления',
    `${rows}.length===2 && !document.querySelector('#sheet').open`,
  );
  await size(320);
  await goto('delay/10429', scope('simple') + '&theme=dark');
  await action('delay-photo');
  await click('#sheet [data-source=camera]');
  await click('[data-camera=native]');
  await selectFiles([asset('meter.jpg')]);
  await assert(
    'Файл системной камеры открылся в нужном поле недопуска в упрощённом режиме',
    "document.querySelector('.intake-heading').textContent.includes('Фото уведомления') && document.querySelector('.intake-heading').textContent.includes('10429') && !Kontur.state.draft.fieldMedia.delay.length && document.querySelector('#sheet').scrollWidth<=320",
  );
  await confirmFile();
  await assert(
    'Пустой комментарий разрешён и файл добавлен только к уведомлению',
    "Kontur.state.draft.fieldMedia.delay.length===1 && Kontur.state.draft.fieldMedia.delay[0].comment==='' && !Kontur.state.draft.fieldMedia['delay-act'].length",
  );
  await action('delay-act');
  await click('#sheet [data-action=add-sample]');
  await note('Отмена при смене заявки');
  await navigate('delay/10428');
  await assert(
    'При переходе к другой заявке неподтверждённый файл закрывается',
    "!document.querySelector('#sheet').open && !Kontur.state.draft.fieldMedia['delay-act'].length",
  );
  await navigate('delay/10429');
  await assert(
    'В исходном акте недопуска также нет отменённого вложения',
    "!Kontur.state.draft.fieldMedia['delay-act'].length",
  );

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'konus-intake-'));
  const make = (name, entries) => {
    const dest = path.join(dir, name);
    fs.writeFileSync(
      dest,
      zipSync(Object.fromEntries(Object.entries(entries).map(([key, xml]) => [key, strToU8(xml)]))),
    );
    return dest;
  };
  try {
    const word = make('Акт.docx', {
      'word/document.xml':
        '<w:document xmlns:w="urn:word"><w:body><w:p><w:r><w:t>Осмотр выполнен</w:t></w:r></w:p></w:body></w:document>',
    });
    const excel = make('Показания.xlsx', {
      'xl/workbook.xml':
        '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Замеры" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet2.xml"/></Relationships>',
      'xl/worksheets/sheet2.xml':
        '<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>Значение</t></is></c><c r="B1"><v>12.5</v></c></row></sheetData></worksheet>',
    });
    const txt = path.join(dir, 'Запись.txt');
    fs.writeFileSync(txt, 'Текст осмотра <образец>');
    await goto('work/10431', scope('expanded'));
    await pick([word, excel, txt]);
    const shows = async (value) => {
      await evaluate(
        `new Promise((resolve,reject)=>{const until=Date.now()+4000;function check(){if(document.querySelector('.intake-stage')?.textContent.includes(${JSON.stringify(value)}))resolve();else if(Date.now()>until)reject(new Error('Нет содержимого в предпросмотре'));else requestAnimationFrame(check)}check()})`,
      );
    };
    await shows('Осмотр выполнен');
    await assert(
      'В DOCX виден текст документа',
      "document.querySelector('.office-excerpt p').textContent==='Осмотр выполнен'",
    );
    await click('[data-intake-skip]');
    await shows('12.5');
    await assert(
      'В XLSX видны первый лист и значения его ячеек',
      "document.querySelector('.office-excerpt strong').textContent==='Замеры' && document.querySelectorAll('.office-excerpt td').length===2",
    );
    await click('[data-intake-skip]');
    await shows('Текст осмотра <образец>');
    await note('К тексту');
    await confirmFile();
    await assert(
      'Текстовый файл добавлен с комментарием после просмотра содержимого',
      `${rows}.at(-1).name==='Запись.txt' && ${rows}.at(-1).comment==='К тексту'`,
    );
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
};
