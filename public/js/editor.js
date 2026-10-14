'use strict';
// Editor core: the CodeMirror instance, documents/tabs, file I/O, session and status bar.

const DEFAULT_SETTINGS = {
  theme: 'default', darkMode: 'light', fontFamily: "'Courier New', Courier, monospace", fontSize: 13, zoom: 0,
  wordWrap: false, showWhitespace: false, showEol: false, showIndentGuides: true,
  lineNumbers: true, bookmarkMargin: true, foldMargin: true,
  tabSize: 4, useSpaces: false, autoIndent: true,
  currentLine: 'highlight', caretWidth: 1, caretBlink: 530,
  smartHighlight: true, smartMatchCase: false, smartWholeWord: true,
  autoCloseBrackets: false, autoCloseTags: false, autoComplete: false, autoCompleteFrom: 3,
  newDocEol: '\r\n', newDocEncoding: 'utf8', newDocLang: 'text',
  defaultDir: 'follow', customDir: '', lastDir: '',
  recentMax: 10, recentFullPath: true,
  hideToolbar: false, hideTabbar: false, hideStatusbar: false, hideMenubar: false,
  tabCloseButton: true, tabDblClickClose: false,
  rememberSession: true, edgeColumn: 0, scrollPastEnd: false, multiEdit: true,
  findFillSelection: true, findMonospace: false, titleFileNameOnly: false,
  keys: {}, macros: [], showHiddenFiles: false,
  workspaceRoots: [], panels: { workspace: false, funclist: false, doclist: false },
  panelSizes: { left: 260, right: 260, bottom: 220 },
  findHistory: [], replaceHistory: [], fifDir: '', fifFilters: '*.*',
  rtl: false,
};

const EOL_LABEL = { '\r\n': 'Windows (CR LF)', '\n': 'Unix (LF)', '\r': 'Macintosh (CR)' };
const EOL_SHORT = { '\r\n': 'CRLF', '\n': 'LF', '\r': 'CR' };
const ENCODINGS = [
  { id: 'ansi', label: 'ANSI', menu: 'ANSI' },
  { id: 'utf8', label: 'UTF-8', menu: 'UTF-8' },
  { id: 'utf8bom', label: 'UTF-8-BOM', menu: 'UTF-8-BOM' },
  { id: 'utf16be', label: 'UTF-16 BE BOM', menu: 'UTF-16 BE BOM' },
  { id: 'utf16le', label: 'UTF-16 LE BOM', menu: 'UTF-16 LE BOM' },
];
const ENC_LABEL = Object.fromEntries(ENCODINGS.map((e) => [e.id, e.label]));

const App = {
  info: { home: '/', sep: '/', platform: '' },
  settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
  tabs: [],
  active: null,
  cm: null,
  recent: [],
  closedStack: [],
  macro: { recording: false, current: null },
  ready: false,
};

let tabSeq = 0;

function langOf(tab) { return LANG_BY_ID[tab.lang] || LANG_BY_ID.text; }
function isDirty(tab) { return !!tab && (tab.forceDirty || !tab.doc.isClean(tab.cleanGen)); }
function focusEditor() { if (App.cm && !Dialogs.some((d) => d.modal)) App.cm.focus(); }

// ---------------------------------------------------------------- CodeMirror setup

function foldMarker(open) {
  const m = el('div', { class: 'npp-fold ' + (open ? 'open' : 'folded') });
  return m;
}

// Control and invisible characters shown as placeholders (built from code points).
const SPECIAL_CHARS = (() => {
  const hex = (n) => '\\u' + n.toString(16).padStart(4, '0');
  const ranges = [[0, 8], [11, 31], [127, 159], [173], [1564], [8203], [8206, 8207], [8232, 8233], [8237, 8238], [8294, 8295], [8297], [65279], [65529, 65532]];
  return new RegExp('[' + ranges.map(([a, b]) => hex(a) + (b ? '-' + hex(b) : '')).join('') + ']');
})();

function createEditor() {
  const s = App.settings;
  const cm = CodeMirror($('#editor'), {
    value: '',
    theme: 'npp',
    addModeClass: true,
    keyMap: 'pcDefault',
    lineNumbers: true,
    gutters: ['CodeMirror-linenumbers', 'npp-bookmarks', 'CodeMirror-foldgutter'],
    foldGutter: { rangeFinder: CodeMirror.fold.auto, indicatorOpen: foldMarker(true), indicatorFolded: foldMarker(false) },
    foldOptions: { widget: '…', minFoldSize: 0 },
    matchBrackets: true,
    matchTags: { bothTags: true },
    styleActiveLine: true,
    indentUnit: s.tabSize,
    tabSize: s.tabSize,
    indentWithTabs: !s.useSpaces,
    smartIndent: false,
    electricChars: false,
    lineWrapping: s.wordWrap,
    showCursorWhenSelecting: true,
    dragDrop: true,
    undoDepth: 10000,
    historyEventDelay: 600,
    cursorBlinkRate: s.caretBlink,
    specialChars: SPECIAL_CHARS,
    specialCharPlaceholder: (ch) => {
      const names = ['NUL', 'SOH', 'STX', 'ETX', 'EOT', 'ENQ', 'ACK', 'BEL', 'BS', 'HT', 'LF', 'VT', 'FF', 'CR', 'SO', 'SI', 'DLE', 'DC1', 'DC2', 'DC3', 'DC4', 'NAK', 'SYN', 'ETB', 'CAN', 'EM', 'SUB', 'ESC', 'FS', 'GS', 'RS', 'US'];
      const c = ch.charCodeAt(0);
      return el('span', { class: 'cm-ctrlchar', title: '\\u' + c.toString(16).padStart(4, '0') }, names[c] || (c === 0x7f ? 'DEL' : 'U+' + c.toString(16).toUpperCase().padStart(4, '0')));
    },
    extraKeys: {
      Tab: (cm) => {
        if (cm.somethingSelected() && cm.listSelections().some((r) => r.anchor.line !== r.head.line)) cm.execCommand('indentMore');
        else if (App.settings.useSpaces) cm.execCommand('insertSoftTab');
        else cm.execCommand('insertTab');
      },
      'Shift-Tab': 'indentLess',
      Enter: (cm) => cm.execCommand(App.settings.autoIndent ? 'newlineAndIndent' : 'newline'),
      ...(isMac ? {
        'Cmd-Left': 'goLineStartSmart', 'Cmd-Right': 'goLineEnd', 'Cmd-Up': 'goDocStart', 'Cmd-Down': 'goDocEnd',
        'Shift-Cmd-Left': (cm) => cm.execCommand('goLineStartSmart'), 'Alt-Left': 'goGroupLeft', 'Alt-Right': 'goGroupRight',
        'Alt-Backspace': 'delGroupBefore', 'Alt-Delete': 'delGroupAfter', 'Cmd-Backspace': 'delWrappedLineLeft',
      } : {}),
    },
  });
  App.cm = cm;

  cm.addOverlay(whitespaceOverlay(), { opaque: false, priority: -1 });

  cm.on('gutterClick', (cm, line, gutter) => {
    if (gutter === 'npp-bookmarks') toggleBookmark(line);
  });
  cm.on('cursorActivity', () => { scheduleStatus(); scheduleSmartHighlight(); });
  cm.on('changes', () => { scheduleStatus(); });
  cm.on('inputRead', (cm, change) => {
    if (App.macro.recording) App.macro.current.push({ t: 'text', v: change.text.join('\n') });
    if (App.settings.autoComplete && change.origin === '+input' && /\w/.test(change.text[change.text.length - 1].slice(-1))) {
      const cur = cm.getCursor();
      const word = cm.getLine(cur.line).slice(0, cur.ch).match(/\w+$/);
      if (word && word[0].length >= App.settings.autoCompleteFrom && !cm.state.completionActive) {
        cm.showHint({ hint: CodeMirror.hint.anyword, completeSingle: false });
      }
    }
  });
  cm.on('keyHandled', (cm, name) => {
    if (App.macro.recording) App.macro.current.push({ t: 'key', v: name });
  });
  cm.on('focus', () => checkExternalChanges());
  cm.getWrapperElement().addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!cm.somethingSelected()) {
      const pos = cm.coordsChar({ left: e.clientX, top: e.clientY });
      cm.setCursor(pos);
    }
    Menu.open(editorContextMenu(), e.clientX, e.clientY);
  });
  cm.getWrapperElement().addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom(App.settings.zoom + (e.deltaY < 0 ? 1 : -1));
    }
  }, { passive: false });
  return cm;
}

// Marks spaces, tabs and indentation units so CSS can draw whitespace dots and indent guides.
function whitespaceOverlay() {
  return {
    name: 'npp-ws',
    token(stream) {
      const tabSize = App.settings.tabSize;
      const leading = /^\s*$/.test(stream.string.slice(0, stream.pos));
      const ch = stream.peek();
      if (ch === '\t' || ch === ' ') {
        const col = CodeMirror.countColumn(stream.string, stream.pos, tabSize);
        const guide = leading && col > 0 && col % tabSize === 0 ? ' npp-guide' : '';
        if (ch === '\t') { stream.next(); return 'npp-tab' + guide; }
        if (leading) {
          let n = 0;
          const want = tabSize - (col % tabSize);
          while (n < want && stream.peek() === ' ') { stream.next(); n++; }
        } else {
          stream.eatWhile(' ');
        }
        return 'npp-sp' + guide;
      }
      while (!stream.eol() && stream.peek() !== ' ' && stream.peek() !== '\t') stream.next();
      return null;
    },
  };
}

// ---------------------------------------------------------------- smart highlighting

let smartOverlay = null, smartWord = null;
const scheduleSmartHighlight = debounce(updateSmartHighlight, 80);

function updateSmartHighlight() {
  const cm = App.cm;
  const s = App.settings;
  let word = null;
  if (s.smartHighlight && cm.listSelections().length === 1 && cm.somethingSelected()) {
    const sel = cm.getSelection();
    if (sel.length < 256 && !/[\n]/.test(sel) && sel.trim()) {
      if (!s.smartWholeWord) word = sel;
      else if (/^\w+$/.test(sel)) {
        const from = cm.getCursor('from'), to = cm.getCursor('to');
        const line = cm.getLine(from.line);
        if (!/\w/.test(line.charAt(from.ch - 1) || '') && !/\w/.test(line.charAt(to.ch) || '')) word = sel;
      }
    }
  }
  if (word === smartWord) return;
  if (smartOverlay) cm.removeOverlay(smartOverlay);
  smartOverlay = null;
  smartWord = word;
  if (!word) return;
  let src = escapeRegExp(word);
  if (s.smartWholeWord) src = '\\b' + src + '\\b';
  const re = new RegExp(src, s.smartMatchCase ? 'g' : 'gi');
  smartOverlay = {
    token(stream) {
      re.lastIndex = stream.pos;
      const m = re.exec(stream.string);
      if (m && m.index === stream.pos) { stream.pos += m[0].length || 1; return 'npp-smart'; }
      if (m) stream.pos = m.index; else stream.skipToEnd();
      return null;
    },
  };
  cm.addOverlay(smartOverlay, { opaque: false });
}

// ---------------------------------------------------------------- tabs

function nextUntitledNumber() {
  const used = new Set(App.tabs.filter((t) => !t.path).map((t) => t.untitledNum));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

function modeOf(langId) {
  const l = LANG_BY_ID[langId] || LANG_BY_ID.text;
  return l.mode || 'text/plain';
}

function createTab(opts = {}) {
  const s = App.settings;
  const lang = opts.lang || (opts.path ? detectLanguage(opts.path, (opts.content || '').slice(0, 200).split(/\r?\n/)[0]) : s.newDocLang);
  const doc = CodeMirror.Doc(opts.content || '', modeOf(lang));
  const untitledNum = opts.path ? null : (opts.untitledNum || nextUntitledNumber());
  const tab = {
    id: ++tabSeq,
    path: opts.path || null,
    title: opts.path ? basename(opts.path) : (opts.title || `new ${untitledNum}`),
    untitledNum,
    doc,
    cleanGen: doc.changeGeneration(true),
    forceDirty: !!opts.dirty,
    lang,
    eol: opts.eol || s.newDocEol,
    encoding: opts.encoding || s.newDocEncoding,
    readOnly: !!opts.readOnly,
    mtime: opts.mtime || null,
    monitoring: false,
    lastDirty: null,
    marks: [],
    pendingBookmarks: opts.bookmarks || null,
  };
  doc.on('change', () => onDocChange(tab));
  return tab;
}

function addTab(tab, { activate = true, index } = {}) {
  if (index == null) App.tabs.push(tab);
  else App.tabs.splice(index, 0, tab);
  if (activate) activateTab(tab);
  else renderTabs();
  scheduleSession();
  return tab;
}

function onDocChange(tab) {
  const d = isDirty(tab);
  if (d !== tab.lastDirty) { tab.lastDirty = d; renderTabs(); updateTitle(); updateToolbarState(); }
  scheduleSession();
  if (tab === App.active) { scheduleFuncList(); }
}

function activateTab(tab) {
  if (!tab) return;
  const cm = App.cm;
  const prev = App.active;
  App.active = tab;
  if (cm.getDoc() !== tab.doc) {
    if (prev) prev.scroll = cm.getScrollInfo();
    cm.swapDoc(tab.doc);
  }
  cm.setOption('readOnly', tab.readOnly || tab.monitoring ? true : false);
  cm.getWrapperElement().style.setProperty('--eol', `"${EOL_SHORT[tab.eol]}"`);
  if (tab.pendingBookmarks) {
    for (const ln of tab.pendingBookmarks) if (ln < tab.doc.lineCount()) cm.setGutterMarker(ln, 'npp-bookmarks', bookmarkMarker());
    tab.pendingBookmarks = null;
  }
  if (tab.pendingScroll) { const p = tab.pendingScroll; tab.pendingScroll = null; setTimeout(() => cm.scrollTo(p.left, p.top), 0); }
  smartWord = '\0';
  updateSmartHighlight();
  renderTabs();
  updateTitle();
  scheduleStatus();
  updateToolbarState();
  scheduleFuncList();
  renderDocList();
  syncWorkspaceSelection();
  scheduleSession();
  focusEditor();
  const at = $('#tabs .tab.active');
  if (at) at.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function renderTabs() {
  const box = $('#tabs');
  box.innerHTML = '';
  App.tabs.forEach((t, i) => {
    const dirty = isDirty(t);
    t.lastDirty = dirty;
    const icon = t.monitoring ? 'tabmonitor' : t.readOnly ? 'tabreadonly' : dirty ? 'tabdirty' : 'tabsaved';
    const e = el('div', { class: 'tab' + (t === App.active ? ' active' : ''), draggable: 'true', title: t.path || t.title },
      el('span', { class: 'tab-icon', html: ICONS[icon] }),
      el('span', { class: 'tab-title' }, t.title),
      App.settings.tabCloseButton ? el('span', { class: 'tab-close', title: 'Close' }) : null);
    e.addEventListener('mousedown', (ev) => {
      if (ev.button === 0 && !ev.target.closest('.tab-close')) activateTab(t);
      if (ev.button === 1) ev.preventDefault();
    });
    e.addEventListener('auxclick', (ev) => { if (ev.button === 1) closeTab(t); });
    e.addEventListener('dblclick', () => { if (App.settings.tabDblClickClose) closeTab(t); });
    const x = e.querySelector('.tab-close');
    if (x) x.addEventListener('click', (ev) => { ev.stopPropagation(); closeTab(t); });
    e.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      activateTab(t);
      Menu.open(tabContextMenu(t), ev.clientX, ev.clientY);
    });
    e.addEventListener('dragstart', (ev) => { ev.dataTransfer.setData('text/x-npp-tab', String(i)); ev.dataTransfer.effectAllowed = 'move'; });
    e.addEventListener('dragover', (ev) => {
      if (!ev.dataTransfer.types.includes('text/x-npp-tab')) return;
      ev.preventDefault();
      e.classList.add('drop-target');
    });
    e.addEventListener('dragleave', () => e.classList.remove('drop-target'));
    e.addEventListener('drop', (ev) => {
      const from = Number(ev.dataTransfer.getData('text/x-npp-tab'));
      if (Number.isNaN(from) || !ev.dataTransfer.types.includes('text/x-npp-tab')) return;
      ev.preventDefault();
      ev.stopPropagation();
      const [moved] = App.tabs.splice(from, 1);
      App.tabs.splice(i, 0, moved);
      renderTabs();
      renderDocList();
      scheduleSession();
    });
    box.append(e);
  });
}

function updateTitle() {
  const t = App.active;
  if (!t) return;
  const name = t.path && !App.settings.titleFileNameOnly ? t.path : t.title;
  const title = `${isDirty(t) ? '*' : ''}${name} - ${APP_NAME}`;
  document.title = title;
  $('#title-text').textContent = title;
}

// ---------------------------------------------------------------- status bar

let statusQueued = false;
function scheduleStatus() {
  if (statusQueued) return;
  statusQueued = true;
  requestAnimationFrame(() => { statusQueued = false; updateStatus(); });
}

function buildStatusbar() {
  const sb = $('#statusbar');
  sb.innerHTML = '';
  const cell = (cls) => el('div', { class: 'sb-cell ' + cls });
  App.sb = {
    lang: cell('sb-lang'), len: cell('sb-len'), pos: cell('sb-pos'), eol: cell('sb-eol'), enc: cell('sb-enc'), ins: cell('sb-ins'),
  };
  sb.append(App.sb.lang, App.sb.len, App.sb.pos, App.sb.eol, App.sb.enc, App.sb.ins);
  App.sb.eol.addEventListener('dblclick', (e) => Menu.open(eolMenu(), e.clientX, e.clientY - 4));
  App.sb.eol.addEventListener('contextmenu', (e) => { e.preventDefault(); Menu.open(eolMenu(), e.clientX, e.clientY - 4); });
  App.sb.enc.addEventListener('dblclick', (e) => Menu.open(encodingMenu(), e.clientX, e.clientY - 4));
  App.sb.enc.addEventListener('contextmenu', (e) => { e.preventDefault(); Menu.open(encodingMenu(), e.clientX, e.clientY - 4); });
  App.sb.lang.addEventListener('dblclick', (e) => Menu.open(languageMenu(), e.clientX, e.clientY - 4));
  App.sb.ins.addEventListener('dblclick', () => { App.cm.toggleOverwrite(); scheduleStatus(); });
}

function updateStatus() {
  const t = App.active;
  if (!t || !App.sb) return;
  const cm = App.cm, doc = t.doc;
  const eolLen = t.eol.length;
  let chars = 0;
  doc.eachLine((l) => { chars += l.text.length; });
  const lines = doc.lineCount();
  chars += (lines - 1) * eolLen;
  App.sb.lang.textContent = langOf(t).desc;
  App.sb.len.textContent = `length : ${fmtNum(chars)}    lines : ${fmtNum(lines)}`;
  const cur = doc.getCursor('head');
  const col = CodeMirror.countColumn(doc.getLine(cur.line), cur.ch, App.settings.tabSize) + 1;
  let posTxt;
  if (doc.somethingSelected()) {
    let n = 0, nl = 0;
    for (const r of doc.listSelections()) {
      const from = CodeMirror.cmpPos(r.anchor, r.head) < 0 ? r.anchor : r.head;
      const to = from === r.anchor ? r.head : r.anchor;
      n += doc.getRange(from, to).length + (to.line - from.line) * (eolLen - 1);
      nl += to.line - from.line + 1;
    }
    posTxt = `Ln : ${fmtNum(cur.line + 1)}    Col : ${fmtNum(col)}    Sel : ${fmtNum(n)} | ${fmtNum(nl)}`;
  } else {
    const pos = doc.indexFromPos(cur) + cur.line * (eolLen - 1) + 1;
    posTxt = `Ln : ${fmtNum(cur.line + 1)}    Col : ${fmtNum(col)}    Pos : ${fmtNum(pos)}`;
  }
  App.sb.pos.textContent = posTxt;
  App.sb.eol.textContent = EOL_LABEL[t.eol];
  App.sb.enc.textContent = ENC_LABEL[t.encoding] || 'UTF-8';
  App.sb.ins.textContent = cm.state.overwrite ? 'OVR' : 'INS';
}

// ---------------------------------------------------------------- bookmarks

function bookmarkMarker() { return el('div', { class: 'npp-bookmark' }); }

function bookmarkedLines(doc = App.active.doc) {
  const out = [];
  let i = 0;
  doc.eachLine((lh) => { if (lh.gutterMarkers && lh.gutterMarkers['npp-bookmarks']) out.push(i); i++; });
  return out;
}

function hasBookmark(line) {
  const info = App.cm.lineInfo(line);
  return !!(info && info.gutterMarkers && info.gutterMarkers['npp-bookmarks']);
}

function setBookmark(line, on) {
  App.cm.setGutterMarker(line, 'npp-bookmarks', on ? bookmarkMarker() : null);
  scheduleSession();
}

function toggleBookmark(line = App.cm.getCursor().line) { setBookmark(line, !hasBookmark(line)); }

function gotoBookmark(dir) {
  const lines = bookmarkedLines();
  if (!lines.length) return;
  const cur = App.cm.getCursor().line;
  let target = dir > 0 ? lines.find((l) => l > cur) : [...lines].reverse().find((l) => l < cur);
  if (target == null) target = dir > 0 ? lines[0] : lines[lines.length - 1];
  App.cm.setCursor({ line: target, ch: 0 });
  App.cm.scrollIntoView(null, App.cm.getScrollInfo().clientHeight / 3);
}

// ---------------------------------------------------------------- file operations

function defaultDir() {
  const s = App.settings;
  if (s.defaultDir === 'custom' && s.customDir) return s.customDir;
  if (s.defaultDir === 'follow' && App.active && App.active.path) return dirname(App.active.path);
  return s.lastDir || App.info.home;
}

function isPristine(tab) {
  return tab && !tab.path && !isDirty(tab) && tab.doc.getValue() === '' && !tab.doc.historySize().undo;
}

function findTabByPath(p) { return App.tabs.find((t) => t.path === p); }

async function openFile(p, { line, ch, activate = true, silent = false } = {}) {
  const existing = findTabByPath(p);
  if (existing) {
    if (activate) activateTab(existing);
    if (line != null) gotoPos(line, ch || 0);
    return existing;
  }
  let r;
  try {
    r = await api.get('read', { path: p });
  } catch (err) {
    if (!silent) {
      const ans = await msgBox(`"${p}" doesn't exist. Create it?`, { title: 'Create new file', icon: 'question', buttons: ['Yes', 'No'] });
      if (ans === 'Yes') {
        try {
          await api.post('write', { path: p, content: '' });
          return openFile(p, { line, ch, activate });
        } catch (e2) { msgBox(e2.message, { icon: 'error' }); }
      }
    }
    return null;
  }
  const replace = App.tabs.length === 1 && isPristine(App.tabs[0]) ? App.tabs[0] : null;
  const tab = createTab({ path: r.path, content: r.content, encoding: r.encoding, eol: r.eol || App.settings.newDocEol, mtime: r.mtime, readOnly: !r.writable });
  addTab(tab, { activate });
  if (replace) removeTab(replace);
  addRecent(r.path);
  if (line != null) gotoPos(line, ch || 0);
  return tab;
}

function gotoPos(line, ch = 0, toCh) {
  const cm = App.cm;
  if (toCh != null) cm.setSelection({ line, ch }, { line, ch: toCh });
  else cm.setCursor({ line, ch });
  cm.scrollIntoView({ from: { line: Math.max(0, line - 5), ch: 0 }, to: { line: line + 5, ch: 0 } });
  focusEditor();
}

function newDocument() {
  const tab = createTab({});
  addTab(tab);
  return tab;
}

async function openDialog() {
  const p = await fileDialog({ mode: 'open', dir: defaultDir() });
  if (p) openFile(p);
}

async function writeTab(tab, p) {
  const content = tab.doc.getValue(tab.eol);
  return api.post('write', { path: p, content, encoding: tab.encoding });
}

async function saveTab(tab = App.active) {
  if (!tab) return false;
  if (!tab.path) return saveTabAs(tab);
  if (tab.monitoring) return true;
  try {
    const r = await writeTab(tab, tab.path);
    tab.cleanGen = tab.doc.changeGeneration(true);
    tab.forceDirty = false;
    tab.mtime = r.mtime;
    afterSave(tab);
    return true;
  } catch (err) {
    await msgBox(`Please check whether if this file is opened in another program.\n\n${err.message}`, { title: 'Save failed', icon: 'error' });
    return false;
  }
}

async function saveTabAs(tab = App.active, { copy = false } = {}) {
  if (!tab) return false;
  const name = tab.path ? basename(tab.path) : tab.title + (langOf(tab).ext[0] && tab.lang !== 'text' ? '.' + langOf(tab).ext[0] : '');
  const p = await fileDialog({ mode: 'save', title: copy ? 'Save a Copy As' : 'Save As', dir: tab.path ? dirname(tab.path) : defaultDir(), fileName: name, saveType: tab.lang });
  if (!p) return false;
  const other = findTabByPath(p);
  if (other && other !== tab) {
    await msgBox(`The file is already opened in ${APP_NAME}.`, { title: 'Save failed', icon: 'error' });
    return false;
  }
  try {
    const r = await writeTab(tab, p);
    if (copy) return true;
    const wasUntitled = !tab.path;
    tab.path = r.path;
    tab.title = basename(r.path);
    tab.untitledNum = null;
    tab.cleanGen = tab.doc.changeGeneration(true);
    tab.forceDirty = false;
    tab.mtime = r.mtime;
    tab.readOnly = false;
    if (wasUntitled || tab.lang === 'text') {
      const l = detectLanguage(r.path, tab.doc.getLine(0));
      if (l !== tab.lang) setLanguage(l, tab);
    }
    addRecent(r.path);
    afterSave(tab);
    return true;
  } catch (err) {
    await msgBox(err.message, { title: 'Save failed', icon: 'error' });
    return false;
  }
}

function afterSave(tab) {
  renderTabs();
  updateTitle();
  updateToolbarState();
  renderDocList();
  scheduleSession();
  refreshWorkspace();
}

async function saveAll() {
  for (const t of [...App.tabs]) {
    if (isDirty(t)) {
      if (!t.path) activateTab(t);
      if (!(await saveTab(t))) return false;
    }
  }
  return true;
}

// Asks to save a dirty tab. Returns false if the user cancelled.
async function confirmClose(tab) {
  if (!isDirty(tab)) return true;
  activateTab(tab);
  const ans = await msgBox(`Save file "${tab.path || tab.title}" ?`, { title: 'Save', icon: 'question', buttons: ['Yes', 'No', 'Cancel'] });
  if (ans === 'Cancel') return false;
  if (ans === 'Yes') return saveTab(tab);
  return true;
}

function removeTab(tab) {
  const i = App.tabs.indexOf(tab);
  if (i < 0) return;
  if (tab.monitorTimer) clearInterval(tab.monitorTimer);
  App.tabs.splice(i, 1);
  if (tab.path) {
    App.closedStack.push(tab.path);
    if (App.closedStack.length > 30) App.closedStack.shift();
  }
  if (!App.tabs.length) {
    const t = createTab({});
    App.tabs.push(t);
    activateTab(t);
  } else if (App.active === tab) {
    activateTab(App.tabs[Math.min(i, App.tabs.length - 1)]);
  } else {
    renderTabs();
  }
  renderDocList();
  scheduleSession();
}

async function closeTab(tab = App.active) {
  if (!tab) return false;
  if (!(await confirmClose(tab))) return false;
  removeTab(tab);
  return true;
}

async function closeTabs(list) {
  for (const t of list) {
    if (!(await closeTab(t))) return false;
  }
  return true;
}

async function reloadTab(tab = App.active, { ask = true } = {}) {
  if (!tab || !tab.path) return;
  if (ask && isDirty(tab)) {
    const ans = await msgBox(`Are you sure you want to reload the current file and lose the changes made in ${APP_NAME}?`, { title: 'Reload', icon: 'question', buttons: ['Yes', 'No'] });
    if (ans !== 'Yes') return;
  }
  try {
    const r = await api.get('read', { path: tab.path });
    const cm = App.cm;
    const isActive = tab === App.active;
    const cursor = tab.doc.getCursor();
    const scroll = isActive ? cm.getScrollInfo() : null;
    const bms = bookmarkedLines(tab.doc);
    tab.doc.setValue(r.content);
    tab.doc.clearHistory();
    tab.cleanGen = tab.doc.changeGeneration(true);
    tab.forceDirty = false;
    tab.encoding = r.encoding;
    if (r.eol) tab.eol = r.eol;
    tab.mtime = r.mtime;
    if (tab.monitoring) {
      tab.doc.setCursor({ line: tab.doc.lastLine(), ch: 0 });
    } else {
      tab.doc.setCursor(cursor);
      if (isActive) {
        for (const ln of bms) if (ln < tab.doc.lineCount()) cm.setGutterMarker(ln, 'npp-bookmarks', bookmarkMarker());
        cm.scrollTo(scroll.left, scroll.top);
      }
    }
    if (isActive && tab.monitoring) cm.scrollIntoView(null);
    renderTabs();
    updateTitle();
    scheduleStatus();
  } catch (err) {
    msgBox(err.message, { icon: 'error' });
  }
}

let checkingExternal = false;
async function checkExternalChanges() {
  if (checkingExternal || !App.ready) return;
  checkingExternal = true;
  try {
    for (const tab of [...App.tabs]) {
      if (!tab.path || tab.monitoring || !App.tabs.includes(tab)) continue;
      let st;
      try { st = await api.get('stat', { path: tab.path }); } catch { continue; }
      if (!st.exists) {
        if (tab.missingAsked) continue;
        tab.missingAsked = true;
        activateTab(tab);
        const ans = await msgBox(`"${tab.path}"\n\nThe file doesn't exist anymore.\nKeep this file in editor?`, { title: 'Keep non existing file', icon: 'question', buttons: ['Yes', 'No'] });
        if (ans === 'No') removeTab(tab);
        else { tab.forceDirty = true; renderTabs(); updateTitle(); }
      } else if (tab.mtime && st.mtime > tab.mtime + 1) {
        tab.missingAsked = false;
        activateTab(tab);
        const extra = isDirty(tab) ? `\n\nIf you reload it, you will lose the changes made in ${APP_NAME}.` : '';
        const ans = await msgBox(`${tab.path}\n\nThis file has been modified by another program.\nDo you want to reload it?${extra}`, { title: 'Reload', icon: 'question', buttons: ['Yes', 'No'] });
        if (ans === 'Yes') await reloadTab(tab, { ask: false });
        else tab.mtime = st.mtime;
      }
    }
  } finally {
    checkingExternal = false;
  }
}

function setMonitoring(tab, on) {
  if (!tab || !tab.path) return;
  tab.monitoring = on;
  if (tab.monitorTimer) { clearInterval(tab.monitorTimer); tab.monitorTimer = null; }
  if (on) {
    reloadTab(tab, { ask: false });
    tab.monitorTimer = setInterval(async () => {
      try {
        const st = await api.get('stat', { path: tab.path });
        if (st.exists && st.mtime !== tab.mtime) await reloadTab(tab, { ask: false });
      } catch { /* ignore */ }
    }, 1000);
  }
  if (tab === App.active) App.cm.setOption('readOnly', tab.readOnly || on);
  renderTabs();
  updateToolbarState();
}

// ---------------------------------------------------------------- recent files

function addRecent(p) {
  App.recent = [p, ...App.recent.filter((x) => x !== p)].slice(0, App.settings.recentMax);
  scheduleSession();
}

// ---------------------------------------------------------------- per-document settings

function setLanguage(id, tab = App.active) {
  tab.lang = id;
  if (tab === App.active) { App.cm.setOption('mode', modeOf(id)); refreshFoldGutter(); }
  scheduleStatus();
  scheduleFuncList();
  scheduleSession();
}

// The fold gutter only recomputes on edits and doc swaps, so re-arm it after a mode change.
function refreshFoldGutter() {
  const cm = App.cm;
  const opt = cm.getOption('foldGutter');
  if (!opt) return;
  cm.setOption('foldGutter', false);
  cm.setOption('foldGutter', opt);
}

function setEol(eol, tab = App.active) {
  if (tab.eol === eol) return;
  tab.eol = eol;
  tab.forceDirty = true;
  App.cm.getWrapperElement().style.setProperty('--eol', `"${EOL_SHORT[eol]}"`);
  renderTabs();
  updateTitle();
  scheduleStatus();
  scheduleSession();
}

function setEncoding(enc, tab = App.active, convert = true) {
  if (tab.encoding === enc) return;
  tab.encoding = enc;
  if (convert) tab.forceDirty = true;
  renderTabs();
  updateTitle();
  scheduleStatus();
  scheduleSession();
}

function setReadOnly(on, tab = App.active) {
  tab.readOnly = on;
  if (tab === App.active) App.cm.setOption('readOnly', on || tab.monitoring);
  renderTabs();
}

// ---------------------------------------------------------------- settings application

function setZoom(z) {
  App.settings.zoom = Math.max(-10, Math.min(20, z));
  applySettings();
}

function applySettings() {
  const s = App.settings;
  const cm = App.cm;
  const body = document.body;
  const dark = s.darkMode === 'dark' || (s.darkMode === 'os' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  body.classList.toggle('dark', dark);
  body.classList.toggle('show-ws', s.showWhitespace);
  body.classList.toggle('show-eol', s.showEol);
  body.classList.toggle('show-indent', s.showIndentGuides);
  body.classList.toggle('no-toolbar', s.hideToolbar);
  body.classList.toggle('no-tabbar', s.hideTabbar);
  body.classList.toggle('no-statusbar', s.hideStatusbar);
  body.classList.toggle('no-menubar', s.hideMenubar);
  body.classList.toggle('find-mono', s.findMonospace);
  body.classList.toggle('no-bookmark-margin', !s.bookmarkMargin);
  body.classList.toggle('no-fold-margin', !s.foldMargin);
  body.classList.toggle('cl-frame', s.currentLine === 'frame');
  body.classList.toggle('no-active-line', s.currentLine === 'none');
  body.style.setProperty('--caret-width', s.caretWidth + 'px');
  const theme = THEMES.find((t) => t.id === s.theme) ? s.theme : 'default';
  THEMES.forEach((t) => body.classList.toggle('theme-' + t.id, t.id === theme));
  const wrap = cm.getWrapperElement();
  wrap.style.fontFamily = s.fontFamily;
  wrap.style.fontSize = Math.max(6, s.fontSize + s.zoom) + 'px';
  cm.setOption('lineWrapping', s.wordWrap);
  cm.setOption('lineNumbers', s.lineNumbers);
  const gutters = ['CodeMirror-linenumbers'];
  if (s.bookmarkMargin) gutters.push('npp-bookmarks');
  if (s.foldMargin) gutters.push('CodeMirror-foldgutter');
  cm.setOption('gutters', gutters);
  cm.setOption('foldGutter', s.foldMargin ? { rangeFinder: CodeMirror.fold.auto, indicatorOpen: foldMarker(true), indicatorFolded: foldMarker(false) } : false);
  cm.setOption('tabSize', s.tabSize);
  cm.setOption('indentUnit', s.tabSize);
  cm.setOption('indentWithTabs', !s.useSpaces);
  cm.setOption('cursorBlinkRate', s.caretBlink);
  cm.setOption('styleActiveLine', s.currentLine !== 'none');
  cm.setOption('autoCloseBrackets', s.autoCloseBrackets);
  cm.setOption('autoCloseTags', s.autoCloseTags);
  cm.setOption('rulers', s.edgeColumn > 0 ? [{ column: s.edgeColumn, className: 'npp-edge' }] : []);
  cm.setOption('scrollPastEnd', s.scrollPastEnd);
  cm.setOption('direction', s.rtl ? 'rtl' : 'ltr');
  cm.setOption('configureMouse', (cm, repeat, e) => ({ addNew: s.multiEdit && (isMac ? e.metaKey : e.ctrlKey) }));
  cm.refresh();
  renderTabs();
  updateToolbarState();
  scheduleStatus();
  scheduleSession();
}

// ---------------------------------------------------------------- session

const scheduleSession = debounce(saveSession, 700);

function sessionData() {
  const s = App.settings;
  const tabs = s.rememberSession ? App.tabs.map((t) => {
    const dirty = isDirty(t);
    const isActive = t === App.active;
    const scroll = isActive ? App.cm.getScrollInfo() : (t.scroll || { left: 0, top: 0 });
    return {
      path: t.path, title: t.title, untitledNum: t.untitledNum, lang: t.lang, eol: t.eol, encoding: t.encoding,
      readOnly: t.readOnly, dirty, mtime: t.mtime,
      content: dirty || !t.path ? t.doc.getValue() : undefined,
      cursor: t.doc.getCursor(), scroll: { left: scroll.left, top: scroll.top },
      bookmarks: t.pendingBookmarks || bookmarkedLines(t.doc),
    };
  }) : [];
  return {
    version: 1, settings: s, recent: App.recent, closed: App.closedStack,
    tabs, active: App.tabs.indexOf(App.active),
  };
}

async function saveSession() {
  if (!App.ready) return;
  try { await api.post('session', sessionData()); } catch { /* server offline */ }
}

// The desktop app calls this before its window closes. Resolves to false if the user cancels.
async function beforeAppClose() {
  if (!App.ready) return true;
  if (!App.settings.rememberSession && !(await closeTabs(App.tabs.filter(isDirty)))) return false;
  await saveSession();
  return true;
}

async function restoreSession(data) {
  const restored = [];
  for (const st of data.tabs || []) {
    if (st.path && !st.dirty) {
      try {
        const r = await api.get('read', { path: st.path });
        const t = createTab({ path: r.path, content: r.content, encoding: r.encoding, eol: r.eol || st.eol, mtime: r.mtime, lang: st.lang, readOnly: st.readOnly || !r.writable, bookmarks: st.bookmarks });
        t.restoreCursor = st.cursor;
        t.pendingScroll = st.scroll;
        restored.push(t);
      } catch { /* file vanished */ }
    } else {
      const t = createTab({ path: st.path, title: st.title, untitledNum: st.untitledNum, content: st.content || '', encoding: st.encoding, eol: st.eol, lang: st.lang, readOnly: st.readOnly, dirty: !!st.dirty, mtime: st.mtime, bookmarks: st.bookmarks });
      t.restoreCursor = st.cursor;
      t.pendingScroll = st.scroll;
      restored.push(t);
    }
  }
  for (const t of restored) {
    if (t.restoreCursor) {
      const c = t.restoreCursor;
      if (c.line < t.doc.lineCount()) t.doc.setCursor(c);
    }
    App.tabs.push(t);
  }
  return restored.length ? restored[Math.max(0, Math.min(restored.length - 1, data.active || 0))] : null;
}
