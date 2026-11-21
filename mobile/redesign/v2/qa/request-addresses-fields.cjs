module.exports = async function ({
  confirmFile,
  action,
  assert,
  click,
  evaluate,
  goto,
  navigate,
  scope,
  shot,
  size,
  checkLayout,
}) {
  const expanded = scope('expanded');
  const select = (by) => click(`[data-grouping="${by}"]`);
  const field = (key) => `[data-upload-field="${key}"]`;
  const fold = (key) => click(field(key) + ' > summary');
  const cityCounts =
    "[...document.querySelectorAll('.address-city')].map(g=>[g.querySelector('summary strong').textContent,g.querySelectorAll('.apartment-row').length])";
  const countsMatch =
    "[...document.querySelectorAll('.address-branch')].every(g=>Number(g.querySelector('summary .address-count').lastChild.textContent)===g.querySelectorAll('.apartment-row').length)";
  await size(390);
  await goto('queue', expanded);
  await click('.view-switch [href="#locations"]');
  for (const [list, expected] of [
    ['locations', [10428, 10429, 10430, 10431, 10432]],
    ['all-locations', [10428, 10429, 10430, 10431, 10432, 10433, 10440, 10441]],
  ]) {
    if (list === 'all-locations') {
      await click('.bottom-nav [href="#all"]');
      await click('.view-switch [href="#all-locations"]');
    }
    for (const [by, depth] of [
      ['city', 1],
      ['street', 2],
      ['street-house', 3],
    ]) {
      await select(by);
      await assert(
        `${list} · ${by} · группы по населённым пунктам, точные счётчики и заявки`,
        `JSON.stringify(${cityCounts})===JSON.stringify([['Ангарск',1],['Иркутск',${expected.length - 1}]]) && ${countsMatch} &&
        JSON.stringify([...document.querySelectorAll('.apartment-row')].map(a=>Number(a.hash.split('/')[1])).sort())==='${JSON.stringify(expected)}' &&
        [...document.querySelectorAll('.apartment-row')].every(a=>{let p=a.closest('details'),n=0;while(p){n++;p=p.parentElement.closest('details')}return n===${depth}})`,
      );
      if (by === 'city' && list === 'locations') await shot('request-cities');
      if (by === 'street-house' && list === 'all-locations') {
        await click('.address-city[open] > summary');
        await click('.address-city:last-child > summary');
        await shot('all-addresses');
      }
      await checkLayout(list, 390, by);
    }
  }
  await click('.apartment-row[href="#detail/10430"]');
  await click('.header-back a');
  await assert(
    'Возврат из карточки к своему раскрытому дереву общего реестра',
    "Kontur.state.screen==='all-locations' && document.querySelector('.address-city:last-child').open && document.querySelector('.apartment-row[href=\"#detail/10430\"]').checkVisibility({contentVisibilityAuto:true})",
  );
  await click('.view-switch [href="#all-statuses"]');
  await click('[data-status=EXECUTED]');
  await assert(
    'Во всех заявках по статусу видны и завершённые работы',
    "document.querySelectorAll('.request-card').length===1 && document.querySelector('.request-card').hash==='#detail/10433'",
  );
  await click('.view-switch [href="#all-locations"]');
  // Two settlements contain the same street, house and apartment.
  await evaluate(
    "Object.assign(Kontur.requests.find(r=>r.id===10432),{street:'Байкальская',house:'128',apartment:'12'})",
  );
  for (const by of ['street', 'street-house']) {
    await select(by);
    await assert(
      'Одноимённые адреса в разных городах · ' + by,
      "[...document.querySelectorAll('.address-city')].every(g=>[...g.querySelectorAll('.address-street > summary strong')].some(s=>s.textContent==='Байкальская')) && document.querySelector('[href=\"#detail/10430\"]').closest('.address-city')!==document.querySelector('[href=\"#detail/10432\"]').closest('.address-city')",
    );
  }
  await select('city');
  await goto('locations', expanded);
  await assert(
    'Выбор населённого пункта восстановлен в личном реестре после перезагрузки',
    "document.querySelector('[data-grouping=city]').ariaPressed==='true' && document.querySelectorAll('.apartment-row').length===5",
  );
  await size(320);
  await goto('all-locations', expanded + '&theme=dark');
  await select('street-house');
  await checkLayout('all-locations', 320, 'Три уровня адресов в тёмной теме');
  await goto('work/10428', expanded);
  await size(390);
  const extra = field('work-extra');
  const work = field('work');
  await fold('work-extra');
  await fold('work');
  await evaluate(
    "document.querySelector('#app .scroll-content').scrollTop=document.querySelector('#app .scroll-content').scrollHeight",
  );
  await shot('collapsed-fields');
  await assert(
    'Свёрнутые поля показывают счётчик и скрывают вложения и кнопку',
    `document.querySelector('${extra} [data-file-count]').textContent==='4' && !document.querySelector('${extra}').open && !document.querySelector('${work}').open && !document.querySelector('${extra} .upload-body').checkVisibility({contentVisibilityAuto:true})`,
  );
  await fold('work');
  await action('work-photo');
  await click('#sheet [data-action=add-sample]');
  await confirmFile();
  await assert(
    'Добавление в соседнее поле сохраняет сворачивание и пересчитывает файлы',
    `!document.querySelector('${extra}').open && document.querySelector('${work} [data-file-count]').textContent==='1'`,
  );
  await navigate('work/10429');
  await assert(
    'У другой заявки своё состояние полей',
    `document.querySelector('${extra}').open && document.querySelector('${extra} [data-file-count]').textContent==='0'`,
  );
  await navigate('work/10428');
  await assert('Возврат к заявке сохраняет свёрнутое поле', `!document.querySelector('${extra}').open`);
  await fold('work-extra');
  await click(extra + ' .media-thumb');
  await assert(
    'После раскрытия фото и видео снова доступны в галерее',
    "document.querySelector('#media-viewer').open && document.querySelector('.viewer-nav').textContent.includes('1 из 2')",
  );
  await click('[data-viewer-close]');
  await goto('delay/10428', expanded);
  await fold('delay');
  await fold('delay-act');
  await action('save-delay');
  await assert(
    'Проверка обязательного фото раскрывает нужное поле недопуска',
    "document.querySelector('[data-upload-field=delay]').open && !document.querySelector('[data-upload-field=delay-act]').open && document.activeElement.dataset.action==='delay-photo'",
  );
  await action('delay-photo');
  await click('#sheet [data-action=add-sample]');
  await confirmFile();
  await fold('delay');
  await assert(
    'В свёрнутом обязательном поле остаётся фото для отправки',
    "document.querySelector('[data-upload-field=delay] [data-file-count]').textContent==='1' && Kontur.state.draft.fieldMedia.delay.length===1",
  );
  await goto('chat/10428', scope('simple'));
  await fold('work-extra');
  await fold('work');
  await assert(
    'В чате фото и смешанные вложения сворачиваются независимо',
    `!document.querySelector('${work}').open && document.querySelector('${extra}').open && document.querySelector('${extra} [data-file-count]').textContent==='4'`,
  );
};
