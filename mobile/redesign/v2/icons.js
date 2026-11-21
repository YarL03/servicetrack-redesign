'use strict';
window.Kontur = {};
Kontur.paths = {
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  checks: '<path d="m2 12 4 4L16 6m-5 10 3 3L24 9"/>',
  list: '<rect x="5" y="4" width="14" height="17" rx="3"/><path d="M9 3h6v4H9zM9 12h6m-6 4h4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  chat: '<path d="M21 11a8 8 0 0 1-8 8H8l-5 3V11a9 9 0 0 1 18 0Z"/><path d="M8 10h8m-8 4h5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  pin: '<path d="M19 10c0 5-7 12-7 12S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  building: '<path d="M4 21V5l12-2v18M16 10h4v11M2 21h20M8 8h4m-4 4h4m-4 4h4"/>',
  filter:
    '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="currentColor"/><circle cx="15" cy="17" r="2" fill="currentColor"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
  cloud: '<path d="M7 18H5a4 4 0 0 1-1-8 7 7 0 0 1 13-3 5.5 5.5 0 0 1 2 11h-2M12 11v10m-3-7 3-3 3 3"/>',
  offline:
    '<path d="m3 3 18 18M2 8a17 17 0 0 1 3-2m4-1a17 17 0 0 1 13 3M5 12a11 11 0 0 1 4-2m6 0a11 11 0 0 1 4 2M8 16a6 6 0 0 1 8 0M12 20h.01"/>',
  phone: '<path d="m7 3 3 5-3 3c2 3 3 4 6 6l3-3 5 3c0 3-2 5-5 4C8 19 3 14 2 7 1 4 4 2 7 3Z"/>',
  camera: '<path d="M3 7h4l2-3h6l2 3h4v13H3Z"/><circle cx="12" cy="13" r="4"/>',
  clip: '<path d="m8 12 7-7a4 4 0 0 1 6 6L10 22a6 6 0 0 1-8-8L13 3m-8 13 10-10a2 2 0 0 1 3 3L8 19a2 2 0 0 1-3-3Z"/>',
  file: '<path d="M14 2H5v20h14V7Zm0 0v6h5M8 13h8m-8 4h6"/>',
  photo:
    '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4m-4 0h8"/>',
  video: '<rect x="2" y="5" width="13" height="14" rx="3"/><path d="m15 10 7-4v12l-7-4"/>',
  send: '<path d="m3 3 19 9-19 9 4-9Zm4 9h15"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  alert: '<path d="m12 3 10 18H2Z M12 9v5m0 3v.1"/>',
  history: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7m2-4v6l4 2"/>',
  bell: '<path d="M5 17h14l-2-4V9A5 5 0 0 0 7 9v4Zm5 3h4"/>',
  settings:
    '<path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2 2m8.8 8.8 2 2M5.6 18.4l2-2m8.8-8.8 2-2"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  scan: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 7v10m4-10v10m3-10v10m3-10v10"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  play: '<path d="m8 4 12 8-12 8Z"/>',
  pause: '<path d="M8 5v14m8-14v14" stroke-width="4"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
};
Kontur.icon = (name, cls = '') =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${Kontur.paths[name] || Kontur.paths.file}</svg>`;
