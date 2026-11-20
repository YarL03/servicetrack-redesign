module.exports = async function checkChatGroups({
  action,
  click,
  input,
  evaluate,
  assert,
  size,
  goto,
  scope,
  shot,
  checkLayout,
  on,
}) {
  async function select(by) {
    await action('chat-group-menu');
    await click(`#sheet [data-chat-grouping="${by}"]`);
  }

  const snapshot = `[...document.querySelectorAll('.chat-group')].map(g => ({
    title: g.querySelector('.group-heading strong').textContent,
    city: g.querySelector('.group-heading small')?.textContent || '',
    count: Number(g.querySelector('.group-count').lastChild.textContent),
    ids: [...g.querySelectorAll('.thread-row')].map(a => Number(a.hash.split('/')[1])).sort()
  }))`;
  const expected = {
    street: [
      ['Лермонтова', 'Иркутск', [10428, 10429]],
      ['Байкальская', 'Иркутск', [10430, 10431]],
      ['Гагарина', 'Ангарск', [10432]],
    ],
    'street-house': [
      ['Лермонтова, 18', 'Иркутск', [10428]],
      ['Байкальская, 128', 'Иркутск', [10430, 10431]],
      ['Гагарина, 24', 'Ангарск', [10432]],
      ['Лермонтова, 20', 'Иркутск', [10429]],
    ],
    city: [
      ['Иркутск', '', [10428, 10429, 10430, 10431]],
      ['Ангарск', '', [10432]],
    ],
    type: [
      ['Замена электросчётчика', '', [10428, 10429, 10431, 10432]],
      ['Проверка подключения', '', [10430]],
    ],
  };

  await size(390);
  await goto('inbox', scope('simple'));
  await action('chat-group-menu');
  await assert(
    'Настройка предлагает четыре группировки и обычный список',
    "document.querySelectorAll('#sheet [data-chat-grouping]').length===5 && document.querySelector('#sheet [aria-pressed=true]').dataset.chatGrouping==='none'",
  );
  await shot('chat-group-settings');
  await click('#sheet [data-chat-grouping=street]');
  await assert(
    'Строки одной улицы сохраняют дом и квартиру',
    "document.querySelector('.chat-group [href=\"#chat/10429\"]').textContent.includes('Дом 20 · кв. 47')",
  );
  await click('.chat-group:nth-of-type(2) summary');
  await click('.chat-group [href="#chat/10429"]');
  await assert(
    'Из группы открыта квартира 47 второго дома',
    on('chat', 10429) + " && document.querySelector('.header-back').textContent.includes('кв. 47')",
  );
  await click('#app .header-back a');
  await assert(
    'После возврата открытые группы сохранились',
    "document.querySelectorAll('.chat-group[open]').length===2 && Kontur.state.chatGrouping==='street'",
  );
  await select('city');
  await input('#inbox-search', 'Ангарск');
  await assert(
    'Городской поиск пересчитывает группу и счётчик',
    `${snapshot}.length===1 && ${snapshot}[0].title==='Ангарск' && ${snapshot}[0].count===1 && ${snapshot}[0].ids[0]===10432`,
  );
  await input('#inbox-search', 'несуществующий адрес');
  await assert(
    'У пустого поиска нет групп',
    "document.querySelectorAll('.chat-group').length===0 && !!document.querySelector('[data-action=reset-inbox]')",
  );
  await action('reset-inbox');
  await click('[data-filter=unread]');
  await assert(
    'В группу попадают только непрочитанные диалоги',
    `JSON.stringify(${snapshot}[0].ids)==='[10428,10430]'`,
  );
  await click('.chat-group [href="#chat/10430"]');
  await click('#app .header-back a');
  await assert('Прочтение обновляет состав группы', `JSON.stringify(${snapshot}[0].ids)==='[10428]'`);
  await click('[data-filter=archive]');
  await assert('Архив группирует только завершённые заявки', `JSON.stringify(${snapshot}[0].ids)==='[10433]'`);
  await action('mode-menu');
  await click('#sheet [data-mode=expanded]');
  await click('.bottom-nav [href="#chats"]');
  await assert(
    'Выбор группировки общий для обоих режимов',
    "Kontur.state.chatGrouping==='city' && document.querySelectorAll('.chat-group').length===2",
  );
  await goto('chats', scope('expanded'));
  await assert(
    'После перезагрузки выбор восстановлен',
    "Kontur.state.chatGrouping==='city' && document.querySelector('.chat-group-control strong').textContent==='По населённому пункту'",
  );
  await click('.bottom-nav [href="#profile"]');
  await action('app-settings');
  await click('#sheet [data-action=chat-group-menu]');
  await click('#sheet [data-chat-grouping=type]');
  await click('.bottom-nav [href="#chats"]');
  await assert(
    'Настройка из профиля применяется к списку чатов',
    "Kontur.state.chatGrouping==='type' && document.querySelector('.group-heading').textContent.includes('Замена электросчётчика')",
  );
  await click('.bottom-nav [href="#queue"]');
  await click('#app [href="#locations"]');
  await click('[data-grouping=street]');
  await click('.bottom-nav [href="#chats"]');
  await assert(
    'Вид адресного реестра и группировка чатов независимы',
    "Kontur.state.chatGrouping==='type' && Kontur.state.addressGrouping==='street'",
  );
  await select('none');
  for (const width of [320, 360, 390, 430]) {
    await size(width);
    for (const [style, screen] of [
      ['simple', 'inbox'],
      ['expanded', 'chats'],
    ]) {
      await goto(screen, scope(style));
      for (const [by, groups] of Object.entries(expected)) {
        await select(by);
        if (width === 390) {
          const projected = groups.map(([title, city, ids]) => {
            const visible = ids.filter((id) => style === 'simple' || id !== 10431);
            return {title, city, count: visible.length, ids: visible};
          });
          await assert(
            `${style} · ${by} — заголовки, счётчики и все ID без повторов`,
            `JSON.stringify(${snapshot})===JSON.stringify(${JSON.stringify(projected)})`,
          );
          if (style === 'simple' && by !== 'type') await shot('inbox-by-' + by);
          if (style === 'expanded' && by === 'type') await shot('chats-by-type');
        }
        await checkLayout(screen, width, style + '/' + by);
      }
    }
  }
  await evaluate("Object.assign(Kontur.requests.find(r=>r.id===10432), {street:'Лермонтова',house:'18'})");
  for (const by of ['street', 'street-house']) {
    await select(by);
    await assert(
      'Одноимённые адреса в разных городах разделены · ' + by,
      `${snapshot}.some(g=>g.city==='Ангарск' && g.ids.join()==='10432') && ${snapshot}.some(g=>g.city==='Иркутск' && g.ids.includes(10428) && !g.ids.includes(10432))`,
    );
  }
  await select('none');
  await assert(
    'Без группировки возвращает обычный список диалогов',
    "document.querySelectorAll('.thread-row').length===4 && !document.querySelector('.chat-group')",
  );
};
