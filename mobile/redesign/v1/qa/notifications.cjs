/* User journeys specific to the notification redesign. */
module.exports = async ({goto, click, input, evaluate, assert, shot, settle}) => {
  const n = 'Kontur.notificationState';
  const open = (id) => click(`[data-action="notice-open"][data-notice="${id}"]`);
  const menu = (id) => click(`[data-action="notice-menu"][data-notice="${id}"]`);
  const action = (name) => click(`[data-action="${name}"]`);
  const change = async (selector, value) => {
    await evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await settle();
  };

  await goto('profile');
  await assert(
    'Profile uses Ivan Ivanov and matching initials',
    'document.querySelector(".profile-hero").textContent.includes("ИИИван Иванов")',
  );
  await action('notifications');
  await assert(
    'Profile opens dedicated feed without marking everything read',
    `${n}.entry.screen==='profile' && Kontur.notifications.count()===4 && document.querySelectorAll('.notification-row').length===6`,
  );
  await click('.header-back a[aria-label="Назад"]');
  await assert('Feed back returns to its entry point', 'Kontur.state.screen==="profile"');
  await goto('chat');
  await action('toggle-role');
  await assert(
    'Manager sees Ivan Ivanov as chat participant',
    'document.querySelector(".header-back h1").textContent==="Иван Иванов"',
  );

  await goto('queue');
  await assert(
    'Main bell displays notification count',
    'document.querySelector(".notification-bell").getAttribute("aria-label").includes("4")',
  );
  await action('notifications');
  await click('[data-action="notice-scope"][data-value="unread"]');
  await click('[data-action="notice-category"][data-value="chats"]');
  await assert(
    'Unread and category filters combine',
    'document.querySelectorAll(".notification-row").length===1 && document.querySelector(".notification-row").textContent.includes("Елена")',
  );
  await shot('notifications-filtered-390');
  await open('message');
  await assert(
    'Opening an event marks only that event read',
    `Kontur.notifications.count()===3 && ${n}.items.find(i=>i.id==='message').read && Kontur.requests[0].unread>0`,
  );
  await shot('notification-message-390');
  await action('notice-target');
  await assert(
    'Message event opens its request and highlights target message',
    'Kontur.state.screen==="chat" && Kontur.state.id===10428 && Boolean(document.querySelector("#message-manager-10428.message-highlight"))',
  );
  await click('.header-back a[aria-label="Назад"]');
  await assert(
    'Returning to feed preserves filters and shows empty unread group',
    `${n}.scope==='unread' && ${n}.category==='chats' && document.querySelector('.notification-empty').textContent.includes('Непрочитанных нет')`,
  );
  await shot('notifications-unread-empty-390');
  await action('notice-reset-filters');
  await open('revision');
  await action('notice-target');
  await assert('Revision opens the correct request', 'Kontur.state.screen==="detail" && Kontur.state.id===10432');
  await click('.header-back a[aria-label="Назад"]');
  await menu('revision');
  await action('notice-toggle-read');
  await assert(
    'Event can be marked unread again',
    `${n}.items.find(i=>i.id==='revision').read===false && Kontur.notifications.count()===3`,
  );

  await goto('notifications');
  await menu('revision');
  await action('notice-delete-confirm');
  await action('close-sheet');
  await assert(
    'Cancel deletion preserves event and badge',
    'Kontur.notifications.count()===4 && document.querySelectorAll(".notification-row").length===6',
  );
  await menu('revision');
  await action('notice-delete-confirm');
  await action('notice-delete');
  await assert(
    'Delete removes only event, preserving request',
    `Kontur.notifications.count()===3 && Kontur.requests.some(r=>r.id===10432) && ${n}.items.find(i=>i.id==='revision').deleted`,
  );
  await shot('notifications-deleted-390');
  await action('notice-undo');
  await assert(
    'Undo restores event and unread count',
    'Kontur.notifications.count()===4 && document.querySelectorAll(".notification-row").length===6',
  );
  await action('notice-list-menu');
  await action('notice-read-all');
  await assert(
    'Read all updates notifications without reading chat messages',
    'Kontur.notifications.count()===0 && Kontur.unreadCount()>0',
  );
  await click('[data-action="notice-scope"][data-value="unread"]');
  await assert(
    'Read all has a useful empty state',
    'Boolean(document.querySelector("[data-action=notice-reset-filters]"))',
  );

  await goto('notifications', '?embed=1&theme=light&offline=1');
  await open('revision');
  await assert(
    'Offline read is explicitly pending, not falsely synced',
    `${n}.pendingRead.has('revision') && document.querySelector('.notification-detail-state').textContent.includes('ожидает подключения')`,
  );
  await click('.header-back a');
  await shot('notifications-offline-390');
  await menu('assignment');
  await action('notice-delete-confirm');
  await action('notice-delete');
  await assert(
    'Deletion without network leaves event intact',
    `!${n}.items.find(i=>i.id==='assignment').deleted && document.querySelector('#toast').textContent.includes('нужна сеть')`,
  );
  await action('close-sheet');
  await open('assignment');
  await action('notice-target');
  await assert(
    'Uncached offline request has recovery screen',
    `Kontur.state.screen==='notification-unavailable' && ${n}.unavailableReason==='offline'`,
  );
  await shot('notification-uncached-390');
  await action('toggle-offline');
  await action('notice-check-access');
  await assert(
    'Reconnect syncs marks and retries correct target',
    `Kontur.state.screen==='detail' && Kontur.state.id===10429 && ${n}.pendingRead.size===0`,
  );
  await goto('notification-detail/reassigned');
  await action('notice-target');
  await action('notice-check-access');
  await assert(
    'Revoked access remains unavailable and does not expose request details',
    'Kontur.state.screen==="notification-unavailable" && !document.querySelector(".request-card") && document.querySelector("#toast").textContent.includes("не предоставлен")',
  );

  await goto('notifications');
  await action('notice-demo-failure');
  await open('revision');
  await assert(
    'Failed read keeps unread count and exposes error',
    `Kontur.notifications.count()===4 && document.querySelector('.notification-detail-state').textContent.includes('Не удалось')`,
  );
  await shot('notification-read-error-390');
  await menu('revision');
  await action('notice-toggle-read');
  await assert(
    'Read can be retried after failure',
    `Kontur.notifications.count()===3 && ${n}.items.find(i=>i.id==='revision').read`,
  );
  await change('#notice-demo-state', 'error');
  await shot('notifications-error-390');
  await action('notice-refresh');
  await assert(
    'Refresh recovers cached feed after error',
    `${n}.view==='ready' && !document.querySelector('.notification-info.error')`,
  );
  await change('#notice-demo-state', 'loading');
  await assert(
    'Loading has an accessible status and no stale rows',
    'Boolean(document.querySelector(".notification-loading[role=status]")) && !document.querySelector(".notification-row")',
  );
  await shot('notifications-loading-390');
  await change('#notice-demo-state', 'empty');
  await assert('Empty feed gives a path back to work', 'Boolean(document.querySelector("[data-action=notice-home]"))');
  await shot('notifications-empty-390');

  await goto('notification-permission');
  await action('notice-later');
  await assert(
    'Declining pre-permission leaves app usable without OS prompt',
    `Kontur.state.screen==='notifications' && ${n}.permission==='default'`,
  );
  await action('notice-permission');
  await action('notice-request-permission');
  await assert(
    'OS permission demo is explicitly labelled',
    'document.querySelector(".native-demo-label").textContent.includes("Пример")',
  );
  await shot('notification-system-dialog-390');
  await action('notice-permission-deny');
  await assert(
    'Denied permission leads to system settings, not a repeat OS prompt',
    `${n}.permission==='denied' && Boolean(document.querySelector('[data-action=notice-system-settings]'))`,
  );
  await shot('notification-denied-390');
  await action('notice-system-settings');
  await action('notice-permission-allow');
  await assert(
    'Permission can be enabled from system settings demo',
    `${n}.permission==='granted' && document.querySelector('.notification-delivery-card').textContent.includes('Push включены')`,
  );
  await click('[data-preference="chats"]');
  await assert(
    'Delivery preferences do not remove notification history',
    `${n}.preferences.chats===false && ${n}.items.length===6`,
  );
  await change('#quiet-start', '20:00');
  await change('#quiet-end', '20:00');
  await action('notice-settings-save');
  await assert(
    'Equal quiet hours show actionable validation',
    'Boolean(document.querySelector(".quiet-error[role=alert]"))',
  );
  await change('#quiet-end', '08:00');
  await action('notice-settings-save');
  await assert(
    'Overnight quiet hours are accepted',
    `${n}.quietError==='' && !document.querySelector('.quiet-error') && document.querySelector('#toast').textContent.includes('сохранены')`,
  );
  await assert(
    'Lock screen hides message text by default',
    '!document.querySelector(".push-preview").textContent.includes("Елена")',
  );
  await click('[data-preference="preview"]');
  await assert(
    'Lock screen preview can be enabled explicitly',
    'document.querySelector(".push-preview").textContent.includes("Елена")',
  );
  await evaluate('document.querySelector(".scroll-content").scrollTop=1000');
  await shot('notification-settings-details-390');

  await goto('work/10428');
  await input('#reading', '34,8');
  await evaluate(
    'document.querySelector(".scroll-content").scrollTop=160;const e=document.querySelector("#reading");e.focus({preventScroll:true});e.setSelectionRange(2,2);window.qaInputTop=e.getBoundingClientRect().top',
  );
  await action('notice-simulate');
  await assert(
    'Incoming event preserves form value, focus, caret and position',
    'document.querySelector("#reading").value==="34,8" && document.activeElement.id==="reading" && document.activeElement.selectionStart===2 && Math.abs(document.activeElement.getBoundingClientRect().top-window.qaInputTop)<2',
  );
  await action('notice-dismiss-banner');
  await assert(
    'Dismissing banner does not mark event read',
    `${n}.items.find(i=>i.id==='live-message').read===false && !document.querySelector('.incoming-notice')`,
  );
  await action('notice-simulate');
  await action('notice-banner-open');
  await assert(
    'In-work banner opens the matching conversation',
    'Kontur.state.screen==="chat" && Kontur.state.id===10428',
  );
  await click('.header-back a');
  await assert(
    'Back from notification chat restores working form',
    'Kontur.state.screen==="work" && document.querySelector("#reading").value==="34,8" && document.querySelector(".scroll-content").scrollTop>=150',
  );
  await goto('chat/10428');
  await input('#message-text', 'Мой незаконченный ответ');
  await action('notice-simulate');
  await action('notice-simulate');
  await assert(
    'Incoming in active chat does not duplicate banner or lose reply',
    `${n}.items.filter(i=>i.id==='live-message').length===1 && ${n}.items.find(i=>i.id==='live-message').read && Kontur.state.messages[10428].length===1 && !document.querySelector('.incoming-notice') && document.querySelector('#message-text').value==='Мой незаконченный ответ'`,
  );
  await goto('queue');
  await action('notice-push-preview');
  await shot('notification-push-390');
  await action('notice-push-open');
  await assert(
    'Push demo deep-links to request message and updates unread',
    'Kontur.state.screen==="chat" && Kontur.state.id===10428 && Kontur.notifications.count()===3',
  );
  await click('.header-back a');
  await assert('Push destination returns to notification feed', 'Kontur.state.screen==="notifications"');

  for (const screen of ['notifications', 'notification-detail', 'notification-settings', 'notification-in-work']) {
    await goto(screen, '?embed=1&theme=dark');
    await shot(screen + '-dark-390');
  }
};
