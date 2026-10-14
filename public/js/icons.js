'use strict';
// 16x16 toolbar and tab icons, drawn as inline SVG.

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">${body}</svg>`;
const PAGE = '<path d="M3.5 1.5h6l3 3v10h-9z" fill="#fff" stroke="#6b6b6b"/><path d="M9.5 1.5v3h3" fill="#e8e8e8" stroke="#6b6b6b"/>';
const floppy = (c, dx = 0, dy = 0) => `<g transform="translate(${dx} ${dy})"><path d="M1.5 1.5h10l3 3v10h-13z" fill="${c}" stroke="#1d3f73" stroke-width=".9"/><rect x="4" y="2" width="6.5" height="4" fill="#fff"/><rect x="8" y="2.6" width="1.6" height="2.8" fill="${c}"/><rect x="3.5" y="9" width="9" height="5" fill="#e9eef6" stroke="#1d3f73" stroke-width=".5"/></g>`;
const lens = (extra = '') => `<circle cx="6.5" cy="6.5" r="4.2" fill="#e8f4ff" stroke="#3a3a3a" stroke-width="1.4"/><path d="M9.6 9.6l4.6 4.6" stroke="#8a5a2b" stroke-width="2.4" stroke-linecap="round"/>${extra}`;
const redX = (x, y, s = 3) => `<path d="M${x - s} ${y - s}l${2 * s} ${2 * s}M${x + s} ${y - s}l${-2 * s} ${2 * s}" stroke="#d32f2f" stroke-width="2" stroke-linecap="round"/>`;

const ICONS = {
  new: svg(PAGE + '<path d="M12.5 9.5v5M10 12h5" stroke="#2e9d3a" stroke-width="1.8"/>'),
  open: svg('<path d="M1.5 3.5h5l1.5 1.5h6.5v8.5h-13z" fill="#f2c94c" stroke="#b8860b"/><path d="M1.5 13.5l2.5-6h11.5l-2.5 6z" fill="#ffe08a" stroke="#b8860b"/>'),
  save: svg(floppy('#3b78d8')),
  saveall: svg(`<g transform="scale(.78)">${floppy('#7aa5e8')}</g><g transform="translate(4 4) scale(.75)">${floppy('#3b78d8')}</g>`),
  close: svg(PAGE + redX(11.5, 11.5)),
  closeall: svg('<g transform="translate(-1.5 -1)">' + PAGE + '</g><g transform="translate(1 0.5)">' + PAGE + '</g>' + redX(12, 12)),
  print: svg('<rect x="4" y="1.5" width="8" height="4.5" fill="#fff" stroke="#555"/><rect x="1.5" y="6" width="13" height="6" rx="1" fill="#9aa3ad" stroke="#4a525a"/><rect x="4" y="10" width="8" height="4.5" fill="#fff" stroke="#555"/><circle cx="12.5" cy="8" r=".8" fill="#5f5"/>'),
  cut: svg('<circle cx="4.5" cy="12" r="2.3" fill="none" stroke="#3a3a3a" stroke-width="1.4"/><circle cx="11.5" cy="12" r="2.3" fill="none" stroke="#3a3a3a" stroke-width="1.4"/><path d="M6 10.3L11 1.5M10 10.3L5 1.5" stroke="#6b7a89" stroke-width="1.4"/>'),
  copy: svg('<path d="M2.5 1.5h6l2 2v8h-8z" fill="#fff" stroke="#6b6b6b"/><path d="M5.5 4.5h6l2 2v8h-8z" fill="#fff" stroke="#3b78d8"/><path d="M7 8h5M7 10h5M7 12h4" stroke="#9ab" stroke-width=".8"/>'),
  paste: svg('<rect x="2" y="2.5" width="10" height="12" rx="1" fill="#c08a4a" stroke="#7a5228"/><rect x="5" y="1.5" width="4" height="2.5" rx=".6" fill="#ddd" stroke="#666" stroke-width=".7"/><path d="M7.5 6.5h6v8h-6z" fill="#fff" stroke="#3b78d8"/>'),
  undo: svg('<path d="M4.5 6.5h6a3.5 3.5 0 0 1 0 7h-4" fill="none" stroke="#2f6fc6" stroke-width="2"/><path d="M1.5 6.5l4-4v8z" fill="#2f6fc6"/>'),
  redo: svg('<path d="M11.5 6.5h-6a3.5 3.5 0 0 0 0 7h4" fill="none" stroke="#2f6fc6" stroke-width="2"/><path d="M14.5 6.5l-4-4v8z" fill="#2f6fc6"/>'),
  find: svg(lens()),
  replace: svg(lens('<path d="M10 2.5h4.5M12.5 0.8l2 1.7-2 1.7" stroke="#d32f2f" stroke-width="1.2" fill="none"/>')),
  zoomin: svg(lens('<path d="M4.3 6.5h4.4M6.5 4.3v4.4" stroke="#2e9d3a" stroke-width="1.5"/>')),
  zoomout: svg(lens('<path d="M4.3 6.5h4.4" stroke="#d32f2f" stroke-width="1.5"/>')),
  syncv: svg('<rect x="1.5" y="1.5" width="5" height="13" fill="#fff" stroke="#777"/><rect x="9.5" y="1.5" width="5" height="13" fill="#fff" stroke="#777"/><path d="M8 3v10M6.5 4.5L8 3l1.5 1.5M6.5 11.5L8 13l1.5-1.5" stroke="#2f6fc6" fill="none"/>'),
  synch: svg('<rect x="1.5" y="1.5" width="13" height="5" fill="#fff" stroke="#777"/><rect x="1.5" y="9.5" width="13" height="5" fill="#fff" stroke="#777"/><path d="M3 8h10M4.5 6.5L3 8l1.5 1.5M11.5 6.5L13 8l-1.5 1.5" stroke="#2f6fc6" fill="none"/>'),
  wrap: svg('<path d="M1.5 3h13M1.5 7h10a2.5 2.5 0 0 1 0 5H7" stroke="#3a3a3a" stroke-width="1.4" fill="none"/><path d="M8.5 9.5L6 12l2.5 2.5" stroke="#2f6fc6" stroke-width="1.4" fill="none"/><path d="M1.5 12h3" stroke="#3a3a3a" stroke-width="1.4"/>'),
  allchars: svg('<path d="M7 2.5h6M8.5 2.5v11M11 2.5v11" stroke="#3a3a3a" stroke-width="1.4"/><path d="M8.5 2.5a3 3 0 0 0 0 6" fill="#3a3a3a" stroke="#3a3a3a"/>'),
  indentguide: svg('<path d="M3 2v12M7 5v9" stroke="#888" stroke-dasharray="1 1"/><path d="M5 3h9M9 6h5M9 9h5M5 12h9" stroke="#2f6fc6" stroke-width="1.4"/>'),
  udl: svg(PAGE + '<text x="8" y="12.5" font-size="5.5" font-family="Arial" font-weight="bold" text-anchor="middle" fill="#2f6fc6">UDL</text>'),
  docmap: svg('<rect x="2.5" y="1.5" width="11" height="13" fill="#fff" stroke="#777"/><rect x="3.5" y="5" width="9" height="4" fill="#cfe3ff" stroke="#2f6fc6" stroke-width=".8"/><path d="M4.5 3.3h6M4.5 11h6M4.5 13h4" stroke="#999" stroke-width=".8"/>'),
  doclist: svg('<rect x="1.5" y="1.5" width="13" height="13" fill="#fff" stroke="#777"/><path d="M3.5 4.5h1M6 4.5h7M3.5 8h1M6 8h7M3.5 11.5h1M6 11.5h7" stroke="#2f6fc6" stroke-width="1.3"/>'),
  funclist: svg('<rect x="1.5" y="1.5" width="13" height="13" fill="#fff" stroke="#777"/><text x="8" y="11.5" font-size="8" font-style="italic" font-family="Georgia,serif" font-weight="bold" text-anchor="middle" fill="#7b1fa2">fx</text>'),
  folderws: svg('<path d="M1.5 3.5h5l1.5 1.5h6.5v8.5h-13z" fill="#f2c94c" stroke="#b8860b"/><path d="M5 8v3.5h4M5 9.5h4" stroke="#7a5a10" fill="none"/>'),
  monitor: svg('<path d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8z" fill="#fff" stroke="#3a3a3a"/><circle cx="8" cy="8" r="2.6" fill="#2f6fc6"/><circle cx="8" cy="8" r="1" fill="#000"/>'),
  record: svg('<circle cx="8" cy="8" r="5.5" fill="#e53935" stroke="#9b1c1c"/>'),
  stop: svg('<rect x="3" y="3" width="10" height="10" fill="#555" stroke="#222"/>'),
  play: svg('<path d="M4 2.5l9 5.5-9 5.5z" fill="#2e9d3a" stroke="#1b5e20"/>'),
  playmulti: svg('<path d="M1.5 2.5l7 5.5-7 5.5z" fill="#2e9d3a" stroke="#1b5e20"/><path d="M7.5 2.5l7 5.5-7 5.5z" fill="#43a047" stroke="#1b5e20"/>'),
  savemacro: svg(floppy('#3b78d8') + '<circle cx="12" cy="12" r="3" fill="#e53935" stroke="#fff"/>'),
  tabsaved: svg(floppy('#3b78d8')),
  tabdirty: svg(floppy('#e53935').replace(/#1d3f73/g, '#7f1d1d')),
  tabreadonly: svg(floppy('#9e9e9e').replace(/#1d3f73/g, '#555')),
  tabmonitor: svg('<path d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8z" fill="#fff" stroke="#3a3a3a"/><circle cx="8" cy="8" r="2.6" fill="#e53935"/>'),
  folder: svg('<path d="M1.5 3.5h5l1.5 1.5h6.5v8.5h-13z" fill="#f2c94c" stroke="#b8860b"/>'),
  folderopen: svg('<path d="M1.5 3.5h5l1.5 1.5h6.5v8.5h-13z" fill="#f2c94c" stroke="#b8860b"/><path d="M1.5 13.5l2.5-6h11.5l-2.5 6z" fill="#ffe08a" stroke="#b8860b"/>'),
  file: svg(PAGE),
  up: svg('<path d="M1.5 3.5h5l1.5 1.5h6.5v8.5h-13z" fill="#f2c94c" stroke="#b8860b"/><path d="M8 12V7M5.5 9.5L8 7l2.5 2.5" stroke="#1b5e20" stroke-width="1.6" fill="none"/>'),
  newfolder: svg('<path d="M1.5 3.5h5l1.5 1.5h6.5v8.5h-13z" fill="#f2c94c" stroke="#b8860b"/><path d="M8 7v5M5.5 9.5h5" stroke="#1b5e20" stroke-width="1.6"/>'),
  home: svg('<path d="M2 8l6-5.5L14 8" fill="none" stroke="#555" stroke-width="1.4"/><path d="M3.5 7.5v6.5h3.5v-4h2v4h3.5V7.5" fill="#fff" stroke="#555"/>'),
  refresh: svg('<path d="M13 8a5 5 0 1 1-1.5-3.6" fill="none" stroke="#2f6fc6" stroke-width="1.6"/><path d="M12.5 1.5v3.5H9" fill="none" stroke="#2f6fc6" stroke-width="1.6"/>'),
  collapse: svg('<rect x="2.5" y="2.5" width="11" height="11" fill="#fff" stroke="#777"/><path d="M5 8h6" stroke="#333" stroke-width="1.4"/>'),
  info: '<svg viewBox="0 0 32 32" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#1976d2"/><circle cx="16" cy="9" r="2" fill="#fff"/><rect x="14.3" y="13" width="3.4" height="11" fill="#fff"/></svg>',
  warn: '<svg viewBox="0 0 32 32" width="32" height="32"><path d="M16 2L31 29H1z" fill="#fbc02d" stroke="#c49000"/><rect x="14.4" y="10" width="3.2" height="10" fill="#222"/><circle cx="16" cy="24" r="1.8" fill="#222"/></svg>',
  error: '<svg viewBox="0 0 32 32" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#d32f2f"/><path d="M10.5 10.5l11 11M21.5 10.5l-11 11" stroke="#fff" stroke-width="3"/></svg>',
  question: '<svg viewBox="0 0 32 32" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#1976d2"/><text x="16" y="22.5" font-size="18" font-family="Segoe UI,Arial" font-weight="bold" text-anchor="middle" fill="#fff">?</text></svg>',
};
