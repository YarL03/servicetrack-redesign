/* Canonical page hierarchy for Kontur, independent of navigation history. */
(() => {
  const R = window.RD;
  const sections = {
    'Обзор': 'dashboard', 'Заявки': 'requests', 'Контракты': 'contracts',
    'Отчёты': 'reports', 'Пользователи': 'users', 'Компании': 'companies',
    'Справочники': 'dictionaries', 'Настройки': 'settings'
  };
  const children = {
    'request-filter': ['request-filter-save'],
    'request-filter-edit': ['request-filter-delete'],
    'request-assign': ['request-assign-confirm'],
    request: [
      'request-edit-customer', 'request-edit-address', 'request-edit-workers',
      'request-edit-start', 'request-edit-planned', 'request-edit-manager',
      'request-object', 'request-files', 'request-history', 'request-denials', 'request-status'
    ],
    'request-object': ['request-object-edit'],
    'request-object-edit': ['request-save'],
    'request-files': ['request-file', 'request-video', 'request-file-comment'],
    'request-file': ['request-file-edit', 'request-file-delete'],
    'request-denials': ['denial-create', 'denial-edit'],
    'request-status': ['request-cancel', 'request-revision', 'request-finish', 'request-reopen'],
    contract: [
      'contract-edit', 'contract-company', 'contract-archive', 'contract-restore',
      'contract-documents', 'contract-import', 'contract-requests'
    ],
    'contract-documents': ['contract-document-add', 'contract-document-edit', 'contract-document-delete'],
    'contract-import': ['contract-import-add', 'contract-import-result'],
    'contract-filters': ['contract-filter-save'],
    'contract-filter-edit': ['contract-filter-delete'],
    'report-executed': ['report-filter', 'report-preview'],
    notifications: ['notification', 'notification-delete-all'],
    'user-edit': ['user-delete', 'user-block', 'password', 'user-address'],
    company: ['company-delete', 'contact-create', 'contact-edit'],
    'contact-edit': ['contact-delete'],
    'work-types': ['work-type', 'work-type-create'],
    'work-type': ['work-subtype', 'work-builder'],
    'work-builder': ['work-field'],
    locations: ['location-edit', 'location-create'],
    'cancel-reasons': ['cancel-reason-edit', 'cancel-reason-create'],
    'device-models': ['device-model-create', 'device-model-edit'],
    devices: ['device-edit'],
    'device-edit': ['device-lock'],
    settings: ['mobile-app'],
    'import-devices': ['import-result', 'import-template-error'],
    profile: ['tariffs', 'balance'],
    tariffs: ['tariff-connect', 'tariff-success', 'tariff-invoice', 'state-tariff', 'state-tariff-loading', 'state-tariff-error'],
    balance: ['payment-create', 'payment-history', 'payment-documents'],
    'payment-history': ['payment-invoice'],
    login: ['login-redirect', 'registration'],
    registration: ['captcha', 'registration-success', 'registration-exists'],
    requests: ['state-loading', 'state-empty']
  };
  const parents = new Map(Object.entries(children).flatMap(([parent, ids]) => ids.map(id => [id, parent])));
  // Full names match the saved values in the shared demonstration forms.
  // Draft edits do not rename the record before it is saved.
  const labels = {
    dashboard: 'Рабочее пространство',
    'user-edit': 'Смирнов Александр Андреевич',
    'contact-edit': 'Морозова Елена Сергеевна',
    'user-unblock': 'Восстановить доступ: Павел Зайцев',
    notification: 'Заявка № 10426 выполнена',
    'request-file-comment': 'Комментарий: Акт замены прибора.pdf',
    'import-result': 'Результаты: devices_november.xlsx',
    'import-template-error': 'Ошибка шаблона: legacy_list.xlsx'
  };

  R.konturBreadcrumbPath = id => {
    const path = [];
    let screen = R.screens.find(item => item.id === id);
    while (screen) {
      path.unshift({id: screen.id, label: labels[screen.id] || screen.title});
      if (screen.id === 'dashboard') break;
      const section = sections[screen.group];
      const parent = parents.get(screen.id) || (section !== screen.id && section) || 'dashboard';
      screen = R.screens.find(item => item.id === parent);
    }
    return path;
  };
})();
