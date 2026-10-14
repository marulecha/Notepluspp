'use strict';
// Commands, keyboard shortcuts, menus, toolbar and context menus.

const COMMANDS = {};
let KEYMAP = new Map();
let currentCategory = 'File';

// key: shortcut string ("Ctrl+Shift+S"), array of shortcuts, or null.
// opts.passive: the shortcut is only displayed; the browser/editor handles the key itself.
// opts.global: the shortcut also fires while a text field has focus.
function def(id, label, key, run, opts = {}) {
  COMMANDS[id] = { id, label, key, run, category: currentCategory, ...opts };
}

function commandKeys(c, id = c.id) {
  const custom = App.settings.keys[id];
  if (custom !== undefined) return custom ? [custom] : [];
  if (!c.key) return [];
  return Array.isArray(c.key) ? c.key : [c.key];
}

function keyDisplay(c) {
  const k = commandKeys(c)[0];
  return k ? k.replace(/Num\+$/, 'Num +').replace(/Num-$/, 'Num -').replace(/Num\/$/, 'Num /') : '';
}

function rebuildKeymap() {
  KEYMAP = new Map();
  for (const [id, c] of Object.entries(COMMANDS)) {
    if (c.passive && App.settings.keys[id] === undefined) continue;
    for (const k of commandKeys(c, id)) if (!KEYMAP.has(k)) KEYMAP.set(k, id);
  }
}

function runCommand(id, { fromMacro = false } = {}) {
  const c = COMMANDS[id];
  if (!c) return;
  if (c.enabled && !val(c.enabled)) return;
  if (App.macro.recording && !fromMacro && !c.noRecord) App.macro.current.push({ t: 'cmd', v: id });
  try {
    const r = c.run();
    if (r && r.catch) r.catch((err) => { console.error(err); msgBox(err.message, { icon: 'error' }); });
  } catch (err) {
    console.error(err);
    msgBox(err.message, { icon: 'error' });
  }
  if (!c.keepFocus && !Dialogs.some((d) => d.visible)) setTimeout(() => { if (!Menu.isOpen() && document.activeElement === document.body) focusEditor(); }, 0);
  scheduleStatus();
  updateToolbarState();
}

function onGlobalKeyDown(e) {
  if (Menu.handleKey(e)) return;
  if (e.key === 'F10' && !e.shiftKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); App.menubar.open(0, true); return; }
  const k = keyFromEvent(e);
  if (!k) return;
  if (k === 'Escape') {
    const d = topDialog();
    if (d && !d.el.contains(e.target)) { e.preventDefault(); d.close(null); return; }
  }
  if (Dialogs.some((d) => d.modal && d.visible)) return;
  const id = KEYMAP.get(k);
  if (!id) return;
  const c = COMMANDS[id];
  const inField = e.target.closest && e.target.closest('input, textarea, select') && !e.target.closest('.CodeMirror');
  if (inField && !c.global && !/(^|\+)F\d+$/.test(k)) return;
  if (App.cm.state.completionActive && /^(Enter|Up|Down|Escape|Tab)$/.test(k)) return;
  e.preventDefault();
  e.stopPropagation();
  runCommand(id);
}

// ---------------------------------------------------------------- edit helpers

const P = (line, ch) => ({ line, ch });
const cmx = () => App.cm;
const docx = () => App.cm.getDoc();
const editable = () => !!App.active && !App.active.readOnly && !App.active.monitoring;

// Line span for line operations: selected lines, or all lines when nothing is selected and wholeDoc is set.
function opLines(wholeDoc) {
  const doc = docx();
  if (doc.somethingSelected()) {
    const from = doc.getCursor('from'), to = doc.getCursor('to');
    const end = to.ch === 0 && to.line > from.line ? to.line - 1 : to.line;
    if (end > from.line || !wholeDoc) return [from.line, end];
  }
  if (wholeDoc) return [0, doc.lastLine()];
  const c = doc.getCursor();
  return [c.line, c.line];
}

function replaceLines(start, end, lines, { select = true } = {}) {
  const doc = docx();
  const old = [];
  for (let i = start; i <= end; i++) old.push(doc.getLine(i));
  if (old.join('\n') === lines.join('\n')) return;
  cmx().operation(() => {
    doc.replaceRange(lines.join('\n'), P(start, 0), P(end, doc.getLine(end).length), '+lineop');
    if (select && lines.length > 1) doc.setSelection(P(start, 0), P(start + lines.length - 1, lines[lines.length - 1].length));
  });
}

function transformLines(fn, wholeDoc = true) {
  if (!editable()) return;
  const [s, e] = opLines(wholeDoc);
  const doc = docx();
  const lines = [];
  for (let i = s; i <= e; i++) lines.push(doc.getLine(i));
  replaceLines(s, e, fn(lines), { select: docx().somethingSelected() });
}

function transformSelection(fn) {
  if (!editable()) return;
  const cm = cmx();
  if (!cm.somethingSelected()) return;
  const sels = cm.getSelections();
  cm.replaceSelections(sels.map(fn), 'around');
}

function duplicateLine() {
  const cm = cmx(), doc = docx();
  cm.operation(() => {
    const ranges = doc.listSelections();
    for (let i = ranges.length - 1; i >= 0; i--) {
      const r = ranges[i];
      if (CodeMirror.cmpPos(r.anchor, r.head) === 0) {
        const l = r.head.line;
        doc.replaceRange('\n' + doc.getLine(l), P(l, doc.getLine(l).length));
      } else {
        const from = CodeMirror.cmpPos(r.anchor, r.head) < 0 ? r.anchor : r.head;
        const to = from === r.anchor ? r.head : r.anchor;
        doc.replaceRange(doc.getRange(from, to), to);
      }
    }
  });
}

function deleteLines() {
  const cm = cmx(), doc = docx();
  const [s, e] = opLines(false);
  cm.operation(() => {
    if (e < doc.lastLine()) doc.replaceRange('', P(s, 0), P(e + 1, 0), '+delete');
    else if (s > 0) doc.replaceRange('', P(s - 1, doc.getLine(s - 1).length), P(e, doc.getLine(e).length), '+delete');
    else doc.replaceRange('', P(0, 0), P(e, doc.getLine(e).length), '+delete');
  });
}

function linesText(s, e) {
  const doc = docx();
  const out = [];
  for (let i = s; i <= e; i++) out.push(doc.getLine(i));
  return out.join(App.active.eol) + App.active.eol;
}

function cutLine() { const [s, e] = opLines(false); copyText(linesText(s, e)); deleteLines(); }
function copyLine() { const [s, e] = opLines(false); copyText(linesText(s, e)); }

function transposeLine() {
  const doc = docx();
  const l = doc.getCursor().line;
  if (l === 0) return;
  const cur = doc.getCursor();
  replaceLines(l - 1, l, [doc.getLine(l), doc.getLine(l - 1)], { select: false });
  doc.setCursor(cur);
}

function moveLines(dir) {
  if (!editable()) return;
  const cm = cmx(), doc = docx();
  const [s, e] = opLines(false);
  if ((dir < 0 && s === 0) || (dir > 0 && e >= doc.lastLine())) return;
  const sels = doc.listSelections();
  const block = [];
  for (let i = s; i <= e; i++) block.push(doc.getLine(i));
  cm.operation(() => {
    if (dir < 0) {
      const above = doc.getLine(s - 1);
      replaceLines(s - 1, e, [...block, above], { select: false });
    } else {
      const below = doc.getLine(e + 1);
      replaceLines(s, e + 1, [below, ...block], { select: false });
    }
    doc.setSelections(sels.map((r) => ({ anchor: P(r.anchor.line + dir, r.anchor.ch), head: P(r.head.line + dir, r.head.ch) })));
  });
}

function joinLines() {
  if (!editable()) return;
  const [s, e] = opLines(false);
  if (s === e) return;
  const doc = docx();
  const parts = [];
  for (let i = s; i <= e; i++) parts.push(i === s ? doc.getLine(i).replace(/\s+$/, '') : doc.getLine(i).trim());
  replaceLines(s, e, [parts.filter((x, i) => x || i === 0).join(' ')]);
}

function splitLines() {
  const width = App.settings.edgeColumn || 80;
  transformLines((lines) => lines.flatMap((l) => {
    if (l.length <= width) return [l];
    const out = [];
    let cur = '';
    for (const w of l.split(/(\s+)/)) {
      if ((cur + w).length > width && cur.trim()) { out.push(cur.replace(/\s+$/, '')); cur = w.trimStart(); }
      else cur += w;
    }
    if (cur) out.push(cur);
    return out;
  }), false);
}

function insertBlankLine(below) {
  if (!editable()) return;
  const doc = docx(), cm = cmx();
  const l = doc.getCursor().line;
  cm.operation(() => {
    if (below) { doc.replaceRange('\n', P(l, doc.getLine(l).length)); doc.setCursor(P(l + 1, 0)); }
    else { doc.replaceRange('\n', P(l, 0)); doc.setCursor(P(l, 0)); }
  });
}

const sorters = {
  lexAsc: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
  lexDesc: (a, b) => (a < b ? 1 : a > b ? -1 : 0),
  lexAscI: (a, b) => a.toLowerCase().localeCompare(b.toLowerCase()),
  lexDescI: (a, b) => b.toLowerCase().localeCompare(a.toLowerCase()),
  locale: (a, b) => a.localeCompare(b),
  intAsc: (a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0),
  intDesc: (a, b) => (parseInt(b, 10) || 0) - (parseInt(a, 10) || 0),
  decAsc: (a, b) => (parseFloat(a.replace(',', '.')) || 0) - (parseFloat(b.replace(',', '.')) || 0),
  decDesc: (a, b) => (parseFloat(b.replace(',', '.')) || 0) - (parseFloat(a.replace(',', '.')) || 0),
  lenAsc: (a, b) => a.length - b.length,
  lenDesc: (a, b) => b.length - a.length,
};

function sortLines(kind) { transformLines((lines) => [...lines].sort(sorters[kind])); }

function properCase(s, blend) {
  return s.replace(/[\p{L}\p{N}']+/gu, (w) => w.charAt(0).toUpperCase() + (blend ? w.slice(1) : w.slice(1).toLowerCase()));
}
function sentenceCase(s, blend) {
  let start = true;
  return Array.from(blend ? s : s.toLowerCase()).map((ch) => {
    if (start && /\p{L}/u.test(ch)) { start = false; return ch.toUpperCase(); }
    if (/[.!?]/.test(ch)) start = true;
    return ch;
  }).join('');
}
const invertCase = (s) => Array.from(s).map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('');
const randomCase = (s) => Array.from(s).map((c) => (Math.random() < 0.5 ? c.toLowerCase() : c.toUpperCase())).join('');

function convertCase(fn) {
  if (!editable()) return;
  const cm = cmx();
  if (cm.somethingSelected()) transformSelection(fn);
  else {
    const r = cm.findWordAt(cm.getCursor());
    const w = cm.getRange(r.anchor, r.head);
    if (/\w/.test(w)) cm.replaceRange(fn(w), r.anchor, r.head);
  }
}

function commentOp(kind) {
  if (!editable()) return;
  const cm = cmx();
  const mode = cm.getModeAt(cm.getCursor());
  const hasLine = !!mode.lineComment;
  cm.operation(() => {
    for (const r of cm.listSelections()) {
      let from = CodeMirror.cmpPos(r.anchor, r.head) < 0 ? r.anchor : r.head;
      let to = from === r.anchor ? r.head : r.anchor;
      if (kind === 'toggle') {
        const lf = P(from.line, 0), lt = to.ch === 0 && to.line > from.line ? P(to.line - 1, cm.getLine(to.line - 1).length) : P(to.line, cm.getLine(to.line).length);
        if (!cm.uncomment(lf, lt, { fullLines: true })) {
          if (hasLine) cm.lineComment(lf, lt, { padding: ' ', commentBlankLines: false, indent: false });
          else cm.blockComment(lf, lt, { fullLines: true });
        }
      } else if (kind === 'line') {
        const lt = to.ch === 0 && to.line > from.line ? P(to.line - 1, 0) : to;
        if (hasLine) cm.lineComment(P(from.line, 0), lt, { padding: ' ', indent: false });
        else cm.blockComment(P(from.line, 0), P(lt.line, cm.getLine(lt.line).length), { fullLines: true });
      } else if (kind === 'unline') {
        const lt = to.ch === 0 && to.line > from.line ? P(to.line - 1, 0) : to;
        cm.uncomment(P(from.line, 0), P(lt.line, cm.getLine(lt.line).length), { fullLines: true });
      } else if (kind === 'block') {
        if (CodeMirror.cmpPos(from, to) === 0) { from = P(from.line, 0); to = P(from.line, cm.getLine(from.line).length); }
        cm.blockComment(from, to, { fullLines: false });
      } else if (kind === 'unblock') {
        if (!cm.uncomment(from, to, { fullLines: false })) cm.uncomment(P(from.line, 0), P(to.line, cm.getLine(to.line).length), { fullLines: true });
      }
    }
  });
}

function blankOp(kind) {
  const tabSize = App.settings.tabSize;
  const fns = {
    trailing: (l) => l.replace(/[ \t]+$/, ''),
    leading: (l) => l.replace(/^[ \t]+/, ''),
    both: (l) => l.trim(),
    tab2space: (l) => {
      let out = '';
      for (const ch of l) out += ch === '\t' ? ' '.repeat(tabSize - (out.length % tabSize)) : ch;
      return out;
    },
    space2tabAll: (l) => {
      let out = '', col = 0, spaces = 0;
      for (const ch of l) {
        if (ch === ' ') { spaces++; col++; if (col % tabSize === 0 && spaces > 1) { out += '\t'; spaces = 0; } continue; }
        out += ' '.repeat(spaces); spaces = 0;
        out += ch;
        col = ch === '\t' ? col + tabSize - (col % tabSize) : col + 1;
      }
      return out + ' '.repeat(spaces);
    },
    space2tabLead: (l) => {
      const m = l.match(/^[ \t]*/)[0];
      const width = CodeMirror.countColumn(m, m.length, tabSize);
      return '\t'.repeat(Math.floor(width / tabSize)) + ' '.repeat(width % tabSize) + l.slice(m.length);
    },
  };
  if (kind === 'eol2space' || kind === 'trimEol2space') {
    transformLines((lines) => [lines.map((l) => (kind === 'trimEol2space' ? l.trim() : l)).join(' ')]);
    return;
  }
  transformLines((lines) => lines.map(fns[kind]));
}

function fmtDate2(d, fmt) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const map = {
    yyyy: d.getFullYear(), yy: String(d.getFullYear()).slice(2), MMMM: d.toLocaleString('en', { month: 'long' }), MMM: d.toLocaleString('en', { month: 'short' }),
    MM: pad(d.getMonth() + 1), M: d.getMonth() + 1, dddd: d.toLocaleString('en', { weekday: 'long' }), ddd: d.toLocaleString('en', { weekday: 'short' }),
    dd: pad(d.getDate()), d: d.getDate(), HH: pad(d.getHours()), H: d.getHours(), hh: pad(d.getHours() % 12 || 12), h: d.getHours() % 12 || 12,
    mm: pad(d.getMinutes()), m: d.getMinutes(), ss: pad(d.getSeconds()), s: d.getSeconds(), tt: d.getHours() < 12 ? 'AM' : 'PM',
  };
  return fmt.replace(/yyyy|yy|MMMM|MMM|MM|M|dddd|ddd|dd|d|HH|H|hh|h|mm|m|ss|s|tt/g, (t) => map[t]);
}

function insertDateTime(kind) {
  const d = new Date();
  let s;
  if (kind === 'short') s = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString();
  else if (kind === 'long') s = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  else s = fmtDate2(d, App.settings.dateFormat || 'yyyy-MM-dd HH:mm:ss');
  cmx().replaceSelection(s);
}

let beginSelectPos = null;
function beginEndSelect() {
  const doc = docx();
  if (!beginSelectPos) { beginSelectPos = doc.getCursor(); document.body.classList.add('begin-select'); }
  else { doc.setSelection(beginSelectPos, doc.getCursor()); beginSelectPos = null; document.body.classList.remove('begin-select'); }
}

async function clipboardOp(kind) {
  const cm = cmx();
  if (kind === 'copy') { if (cm.somethingSelected()) await copyText(cm.getSelections().join(App.active.eol)); else if (App.settings.copyLineIfNoSel !== false) await copyText(linesText(cm.getCursor().line, cm.getCursor().line)); }
  else if (kind === 'cut') { if (!editable()) return; if (cm.somethingSelected()) { await copyText(cm.getSelections().join(App.active.eol)); cm.replaceSelection(''); } else cutLine(); }
  else if (kind === 'paste') {
    if (!editable()) return;
    try { const t = await readClipboardText(); cm.replaceSelection(t, 'end', 'paste'); }
    catch { msgBox('The browser blocked clipboard access. Use Ctrl+V (Cmd+V on macOS) instead.', { icon: 'warn' }); }
  } else if (kind === 'delete') {
    if (!editable()) return;
    if (cm.somethingSelected()) cm.replaceSelection(''); else cm.execCommand('delCharAfter');
  }
}

function gotoMatchingBrace(select) {
  const cm = cmx();
  const cur = cm.getCursor();
  let m = cm.findMatchingBracket(cur, { strict: false });
  if (!m || !m.match) {
    const s = cm.scanForBracket(cur, -1, undefined, { bracketRegex: /[(){}[\]]/ });
    if (!s) return;
    m = cm.findMatchingBracket(P(s.pos.line, s.pos.ch + 1), { strict: false });
    if (!m || !m.match) return;
  }
  if (select) {
    const a = CodeMirror.cmpPos(m.from, m.to) < 0 ? m.from : m.to;
    const b = a === m.from ? m.to : m.from;
    cm.setSelection(P(a.line, a.ch + 1), b);
  } else {
    cm.setCursor(m.to);
  }
}

function selectBetweenBraces() {
  const cm = cmx();
  const s = cm.scanForBracket(cm.getCursor(), -1, undefined, { bracketRegex: /[(){}[\]]/ });
  if (!s) return;
  const m = cm.findMatchingBracket(P(s.pos.line, s.pos.ch + 1), { strict: false });
  if (m && m.match) cm.setSelection(P(s.pos.line, s.pos.ch + 1), m.to);
}

// Fold helpers.
function foldLevels() {
  const cm = cmx(), doc = docx();
  const finder = CodeMirror.fold.auto;
  const out = [];
  const stack = [];
  const n = Math.min(doc.lineCount(), 20000);
  for (let l = 0; l < n; l++) {
    while (stack.length && stack[stack.length - 1] < l) stack.pop();
    const r = finder(cm, P(l, 0));
    if (r && r.to.line > l) {
      out.push({ line: l, level: stack.length + 1, end: r.to.line });
      stack.push(r.to.line);
    }
  }
  return out;
}

function foldLevel(level, fold) {
  const cm = cmx();
  cm.operation(() => { for (const f of foldLevels()) if (f.level === level) cm.foldCode(P(f.line, 0), null, fold ? 'fold' : 'unfold'); });
}

function foldCurrent(fold) {
  const cm = cmx();
  const cur = cm.getCursor().line;
  const levels = foldLevels().filter((f) => f.line <= cur && f.end >= cur);
  const f = levels[levels.length - 1];
  if (f) cm.foldCode(P(f.line, 0), null, fold ? 'fold' : 'unfold');
}

// MIME tools and converter.
const b64enc = (s) => { const b = new TextEncoder().encode(s); let bin = ''; b.forEach((x) => { bin += String.fromCharCode(x); }); return btoa(bin); };
const b64dec = (s) => { try { const bin = atob(s.replace(/\s+/g, '')); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); } catch { return s; } };
const urlDec = (s) => { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; } };
const ascii2hex = (s) => Array.from(new TextEncoder().encode(s), (b) => b.toString(16).toUpperCase().padStart(2, '0')).join('');
const hex2ascii = (s) => { const h = s.replace(/[^0-9a-fA-F]/g, ''); try { return new TextDecoder().decode(Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16))); } catch { return s; } };

function selectionOrWarn(fn) {
  if (!cmx().somethingSelected()) { flashStatus('Select some text first.', 'warn'); return; }
  transformSelection(fn);
}

async function openSelectionAsFile() {
  const sel = wordAtCursorOrSelection().trim().replace(/^["']|["']$/g, '');
  if (!sel) return;
  const p = isAbsPath(sel) ? sel : joinPath(App.active.path ? dirname(App.active.path) : defaultDir(), sel);
  openFile(p);
}

function searchInternet(engine = 'google') {
  const q = encodeURIComponent(wordAtCursorOrSelection());
  if (!q) return;
  const url = { google: `https://www.google.com/search?q=${q}`, wiki: `https://en.wikipedia.org/w/index.php?search=${q}` }[engine];
  window.open(url, '_blank', 'noopener');
}

function launchInBrowser() {
  const t = App.active;
  if (!t.path) { msgBox('Save the document first.', { icon: 'warn' }); return; }
  window.open('/preview' + t.path.split(/[\\/]/).map(encodeURIComponent).join('/').replace(/^\/?/, '/'), '_blank', 'noopener');
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}

function togglePostIt() {
  const on = !document.body.classList.contains('postit');
  document.body.classList.toggle('postit', on);
  if (on && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  if (!on && document.fullscreenElement) document.exitFullscreen();
  setTimeout(() => App.cm.refresh(), 100);
}

function setTabIndex(i) { if (App.tabs[i]) activateTab(App.tabs[i]); }
function cycleTab(d) { const i = App.tabs.indexOf(App.active); setTabIndex((i + d + App.tabs.length) % App.tabs.length); }
function moveTab(d) {
  const i = App.tabs.indexOf(App.active), j = i + d;
  if (j < 0 || j >= App.tabs.length) return;
  [App.tabs[i], App.tabs[j]] = [App.tabs[j], App.tabs[i]];
  renderTabs(); renderDocList(); scheduleSession();
}

function sortTabs(kind) {
  const key = { nameAZ: (t) => t.title.toLowerCase(), nameZA: (t) => t.title.toLowerCase(), path: (t) => (t.path || '').toLowerCase(), type: (t) => langOf(t).name, size: (t) => t.doc.getValue().length }[kind];
  App.tabs.sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * (kind === 'nameZA' ? -1 : 1));
  renderTabs(); renderDocList(); scheduleSession();
}

async function encodeIn(enc) {
  const t = App.active;
  if (!t.path || isDirty(t)) { setEncoding(enc, t, false); return; }
  try {
    const r = await api.get('read', { path: t.path, encoding: enc });
    const cur = t.doc.getCursor();
    t.doc.setValue(r.content);
    t.doc.setCursor(cur);
    t.cleanGen = t.doc.changeGeneration(true);
    t.encoding = enc;
    renderTabs(); updateTitle(); scheduleStatus();
  } catch (err) { msgBox(err.message, { icon: 'error' }); }
}

function wordCompletion() {
  cmx().showHint({ hint: CodeMirror.hint.anyword, completeSingle: false });
}

function functionCompletion() {
  const cm = cmx();
  const mode = cm.getModeAt(cm.getCursor());
  const kw = new Set();
  const modeName = mode.name || '';
  const spec = CodeMirror.resolveMode(modeOf(App.active.lang));
  for (const k of ['keywords', 'builtin', 'types', 'atoms', 'blockKeywords']) {
    const v = spec[k] || (spec[k + 'Set']);
    if (v && typeof v === 'object') Object.keys(v).forEach((x) => kw.add(x));
  }
  if (/javascript|typescript/.test(modeName)) 'break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return super switch this throw try typeof var void while with yield async await console document window Promise Array Object String Number Boolean Map Set JSON Math Date RegExp Error'.split(' ').forEach((x) => kw.add(x));
  if (/python/.test(modeName)) 'False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield print len range enumerate zip open isinstance dict list set tuple str int float'.split(' ').forEach((x) => kw.add(x));
  cm.showHint({
    completeSingle: false,
    hint: (cm2) => {
      const any = CodeMirror.hint.anyword(cm2) || { list: [], from: cm2.getCursor(), to: cm2.getCursor() };
      const cur = cm2.getCursor();
      const word = cm2.getRange(any.from, cur);
      const extra = [...kw].filter((k) => k.startsWith(word) && k !== word);
      return { list: [...new Set([...extra.sort(), ...any.list])], from: any.from, to: any.to };
    },
  });
}

// ---------------------------------------------------------------- command definitions

function defineCommands() {
  const has = () => !!App.active;
  const tab = () => App.active;
  const hasPath = () => !!(App.active && App.active.path);
  const hasSel = () => !!(App.cm && App.cm.somethingSelected());

  currentCategory = 'File';
  def('file.new', 'New', 'Ctrl+N', () => newDocument(), { global: true });
  def('file.open', 'Open...', 'Ctrl+O', () => openDialog(), { global: true });
  def('file.revealFinder', isMac ? 'Finder' : 'Explorer', null, () => api.post('reveal', { path: tab().path }), { enabled: hasPath });
  def('file.revealTerminal', isMac ? 'Terminal' : 'cmd', null, () => api.post('reveal', { path: tab().path, how: 'terminal' }), { enabled: hasPath });
  def('file.openWorkspace', 'Open Folder as Workspace...', null, () => addWorkspaceFolder());
  def('file.reload', 'Reload from Disk', null, () => reloadTab(), { enabled: hasPath });
  def('file.save', 'Save', 'Ctrl+S', () => saveTab(), { global: true, enabled: () => has() && (isDirty(tab()) || !tab().path) });
  def('file.saveAs', 'Save As...', 'Ctrl+Alt+S', () => saveTabAs(), { global: true });
  def('file.saveCopy', 'Save a Copy As...', null, () => saveTabAs(tab(), { copy: true }));
  def('file.saveAll', 'Save All', 'Ctrl+Shift+S', () => saveAll(), { global: true, enabled: () => App.tabs.some(isDirty) });
  def('file.rename', 'Rename...', null, async () => {
    const t = tab();
    if (!t.path) { const n = await inputBox('Rename Current Tab', 'New Name', t.title); if (n) { t.title = n; renderTabs(); updateTitle(); scheduleSession(); } return; }
    renameFile(t.path);
  });
  def('file.close', 'Close', 'Ctrl+W', () => closeTab(), { global: true });
  def('file.closeAll', 'Close All', 'Ctrl+Shift+W', () => closeTabs([...App.tabs]), { global: true });
  def('file.closeOthers', 'Close All BUT This', null, () => closeTabs(App.tabs.filter((t) => t !== App.active)));
  def('file.closeLeft', 'Close All to the Left', null, () => closeTabs(App.tabs.slice(0, App.tabs.indexOf(App.active))));
  def('file.closeRight', 'Close All to the Right', null, () => closeTabs(App.tabs.slice(App.tabs.indexOf(App.active) + 1)));
  def('file.closeUnchanged', 'Close All Unchanged', null, () => closeTabs(App.tabs.filter((t) => !isDirty(t))));
  def('file.print', 'Print...', 'Ctrl+P', () => printDocument(), { global: true });
  def('file.printNow', 'Print Now', null, () => printDocument());
  def('file.restoreClosed', 'Restore Recent Closed File', 'Ctrl+Shift+T', () => { const p = App.closedStack.pop(); if (p) openFile(p); }, { enabled: () => App.closedStack.length > 0 });
  def('file.openAllRecent', 'Open All Recent Files', null, async () => { for (const p of App.recent) await openFile(p, { silent: true }); }, { enabled: () => App.recent.length > 0 });
  def('file.emptyRecent', 'Empty Recent Files List', null, () => { App.recent = []; scheduleSession(); }, { enabled: () => App.recent.length > 0 });
  def('file.exit', 'Exit', 'Alt+F4', async () => { if (await closeTabs([...App.tabs])) { await saveSession(); window.close(); } });

  currentCategory = 'Edit';
  def('edit.undo', 'Undo', 'Ctrl+Z', () => cmx().undo(), { enabled: () => has() && docx().historySize().undo > 0 });
  def('edit.redo', 'Redo', ['Ctrl+Y', 'Ctrl+Shift+Z'], () => cmx().redo(), { enabled: () => has() && docx().historySize().redo > 0 });
  def('edit.cut', 'Cut', 'Ctrl+X', () => clipboardOp('cut'), { passive: true });
  def('edit.copy', 'Copy', 'Ctrl+C', () => clipboardOp('copy'), { passive: true });
  def('edit.paste', 'Paste', 'Ctrl+V', () => clipboardOp('paste'), { passive: true });
  def('edit.delete', 'Delete', 'Delete', () => clipboardOp('delete'), { passive: true });
  def('edit.selectAll', 'Select All', 'Ctrl+A', () => cmx().execCommand('selectAll'));
  def('edit.beginEnd', 'Begin/End Select', null, () => beginEndSelect(), { checked: () => !!beginSelectPos });
  def('edit.dateShort', 'Date Time (short)', null, () => insertDateTime('short'));
  def('edit.dateLong', 'Date Time (long)', null, () => insertDateTime('long'));
  def('edit.dateCustom', 'Date Time (customized)', null, () => insertDateTime('custom'));
  def('edit.copyPath', 'Copy Current Full File path', null, () => copyText(tab().path || tab().title));
  def('edit.copyName', 'Copy Current Filename', null, () => copyText(tab().title));
  def('edit.copyDir', 'Copy Current Dir. Path', null, () => copyText(tab().path ? dirname(tab().path) : ''));
  def('edit.indent', 'Increase Line Indent', 'Tab', () => cmx().execCommand('indentMore'), { passive: true });
  def('edit.outdent', 'Decrease Line Indent', 'Shift+Tab', () => cmx().execCommand('indentLess'), { passive: true });
  def('edit.upper', 'UPPERCASE', 'Ctrl+Shift+U', () => convertCase((s) => s.toUpperCase()));
  def('edit.lower', 'lowercase', 'Ctrl+U', () => convertCase((s) => s.toLowerCase()));
  def('edit.proper', 'Proper Case', 'Alt+U', () => convertCase((s) => properCase(s, false)));
  def('edit.properBlend', 'Proper Case (blend)', 'Alt+Shift+U', () => convertCase((s) => properCase(s, true)));
  def('edit.sentence', 'Sentence case', 'Ctrl+Alt+U', () => convertCase((s) => sentenceCase(s, false)));
  def('edit.sentenceBlend', 'Sentence case (blend)', 'Ctrl+Alt+Shift+U', () => convertCase((s) => sentenceCase(s, true)));
  def('edit.invert', 'iNVERT cASE', null, () => convertCase(invertCase));
  def('edit.random', 'ranDOm CasE', null, () => convertCase(randomCase));
  def('edit.dupLine', 'Duplicate Current Line', 'Ctrl+D', () => editable() && duplicateLine());
  def('edit.removeDup', 'Remove Duplicate Lines', null, () => transformLines((ls) => ls.filter((l, i) => ls.indexOf(l) === i)));
  def('edit.removeConsecDup', 'Remove Consecutive Duplicate Lines', null, () => transformLines((ls) => ls.filter((l, i) => i === 0 || l !== ls[i - 1])));
  def('edit.splitLines', 'Split Lines', 'Ctrl+I', () => splitLines());
  def('edit.joinLines', 'Join Lines', 'Ctrl+J', () => joinLines());
  def('edit.moveUp', 'Move Up Current Line', 'Ctrl+Shift+Up', () => moveLines(-1));
  def('edit.moveDown', 'Move Down Current Line', 'Ctrl+Shift+Down', () => moveLines(1));
  def('edit.removeEmpty', 'Remove Empty Lines', null, () => transformLines((ls) => ls.filter((l) => l !== '')));
  def('edit.removeBlank', 'Remove Empty Lines (Containing Blank characters)', null, () => transformLines((ls) => ls.filter((l) => l.trim() !== '')));
  def('edit.blankAbove', 'Insert Blank Line Above Current', 'Ctrl+Alt+Enter', () => insertBlankLine(false));
  def('edit.blankBelow', 'Insert Blank Line Below Current', 'Ctrl+Alt+Shift+Enter', () => insertBlankLine(true));
  def('edit.reverse', 'Reverse Line Order', null, () => transformLines((ls) => [...ls].reverse()));
  def('edit.randomize', 'Randomize Line Order', null, () => transformLines((ls) => { const a = [...ls]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }));
  def('edit.sortLexAsc', 'Sort Lines Lexicographically Ascending', null, () => sortLines('lexAsc'));
  def('edit.sortLexDesc', 'Sort Lines Lexicographically Descending', null, () => sortLines('lexDesc'));
  def('edit.sortLexAscI', 'Sort Lines Lex. Ascending Ignoring Case', null, () => sortLines('lexAscI'));
  def('edit.sortLexDescI', 'Sort Lines Lex. Descending Ignoring Case', null, () => sortLines('lexDescI'));
  def('edit.sortLocale', 'Sort Lines In Locale Order', null, () => sortLines('locale'));
  def('edit.sortIntAsc', 'Sort Lines As Integers Ascending', null, () => sortLines('intAsc'));
  def('edit.sortIntDesc', 'Sort Lines As Integers Descending', null, () => sortLines('intDesc'));
  def('edit.sortDecAsc', 'Sort Lines As Decimals Ascending', null, () => sortLines('decAsc'));
  def('edit.sortDecDesc', 'Sort Lines As Decimals Descending', null, () => sortLines('decDesc'));
  def('edit.sortLenAsc', 'Sort Lines By Length Ascending', null, () => sortLines('lenAsc'));
  def('edit.sortLenDesc', 'Sort Lines By Length Descending', null, () => sortLines('lenDesc'));
  def('edit.lineCut', 'Cut Current Line', 'Ctrl+L', () => editable() && cutLine());
  def('edit.lineCopy', 'Copy Current Line', 'Ctrl+Shift+X', () => copyLine());
  def('edit.lineDelete', 'Delete Current Line', 'Ctrl+Shift+L', () => editable() && deleteLines());
  def('edit.lineTranspose', 'Transpose Current and Previous Lines', 'Ctrl+T', () => editable() && transposeLine());
  def('edit.toggleComment', 'Toggle Single Line Comment', 'Ctrl+Q', () => commentOp('toggle'));
  def('edit.lineComment', 'Single Line Comment', 'Ctrl+K', () => commentOp('line'));
  def('edit.lineUncomment', 'Single Line Uncomment', 'Ctrl+Shift+K', () => commentOp('unline'));
  def('edit.blockComment', 'Block Comment', 'Ctrl+Shift+Q', () => commentOp('block'));
  def('edit.blockUncomment', 'Block Uncomment', null, () => commentOp('unblock'));
  def('edit.funcCompletion', 'Function Completion', 'Ctrl+Space', () => functionCompletion());
  def('edit.wordCompletion', 'Word Completion', 'Ctrl+Enter', () => wordCompletion());
  def('edit.eolWin', 'Windows (CR LF)', null, () => setEol('\r\n'), { checked: () => has() && tab().eol === '\r\n', radio: true });
  def('edit.eolUnix', 'Unix (LF)', null, () => setEol('\n'), { checked: () => has() && tab().eol === '\n', radio: true });
  def('edit.eolMac', 'Macintosh (CR)', null, () => setEol('\r'), { checked: () => has() && tab().eol === '\r', radio: true });
  def('edit.trimTrailing', 'Trim Trailing Space', null, () => blankOp('trailing'));
  def('edit.trimLeading', 'Trim Leading Space', null, () => blankOp('leading'));
  def('edit.trimBoth', 'Trim Leading and Trailing Space', null, () => blankOp('both'));
  def('edit.eol2space', 'EOL to Space', null, () => blankOp('eol2space'));
  def('edit.trimEol2space', 'Trim both and EOL to Space', null, () => blankOp('trimEol2space'));
  def('edit.tab2space', 'TAB to Space', null, () => blankOp('tab2space'));
  def('edit.space2tabAll', 'Space to TAB (All)', null, () => blankOp('space2tabAll'));
  def('edit.space2tabLead', 'Space to TAB (Leading)', null, () => blankOp('space2tabLead'));
  def('edit.openSelFile', 'Open File', null, () => openSelectionAsFile());
  def('edit.searchInternet', 'Search on Internet', null, () => searchInternet());
  def('edit.columnMode', 'Column Mode...', null, () => msgBox(`There are 3 ways to switch to column-select mode:\n\n1. (Keyboard and Mouse) Hold Alt while left-click dragging\n\n2. (Keyboard only) Hold Alt+Shift while using arrow keys\n\n3. (Keyboard or Mouse) Put caret at desired start of column block position, then execute "Begin/End Select" command; move caret to desired end of column block position, then execute "Begin/End Select" command again`, { title: 'Column Mode Tip' }));
  def('edit.columnEditor', 'Column Editor...', 'Alt+C', () => columnEditorDialog());
  def('edit.readOnly', 'Read-Only', null, () => setReadOnly(!tab().readOnly), { checked: () => has() && tab().readOnly });
  def('edit.colSelUp', 'Column Select Up', 'Alt+Shift+Up', () => columnSelect(-1, 0), { hiddenInMapper: false });
  def('edit.colSelDown', 'Column Select Down', 'Alt+Shift+Down', () => columnSelect(1, 0));
  def('edit.colSelLeft', 'Column Select Left', 'Alt+Shift+Left', () => columnSelect(0, -1));
  def('edit.colSelRight', 'Column Select Right', 'Alt+Shift+Right', () => columnSelect(0, 1));

  currentCategory = 'Search';
  def('search.find', 'Find...', 'Ctrl+F', () => openFindDialog('find'), { global: true, keepFocus: true });
  def('search.fif', 'Find in Files...', 'Ctrl+Shift+F', () => openFindDialog('fif'), { global: true, keepFocus: true });
  def('search.next', 'Find Next', 'F3', () => { if (!FindState.what) openFindDialog('find'); else findNext(FindState, false); }, { global: true });
  def('search.prev', 'Find Previous', 'Shift+F3', () => { if (!FindState.what) openFindDialog('find'); else findNext(FindState, true); }, { global: true });
  def('search.selNext', 'Select and Find Next', 'Ctrl+F3', () => selectAndFindNext(false));
  def('search.selPrev', 'Select and Find Previous', 'Ctrl+Shift+F3', () => selectAndFindNext(true));
  def('search.volNext', 'Find (Volatile) Next', 'Ctrl+Alt+F3', () => findVolatile(false));
  def('search.volPrev', 'Find (Volatile) Previous', 'Ctrl+Alt+Shift+F3', () => findVolatile(true));
  def('search.replace', 'Replace...', 'Ctrl+H', () => openFindDialog('replace'), { global: true, keepFocus: true });
  def('search.results', 'Search Results Window', 'F7', () => toggleResultsPanel());
  def('search.nextResult', 'Next Search Result', 'F4', () => nextResult(1));
  def('search.prevResult', 'Previous Search Result', 'Shift+F4', () => nextResult(-1));
  def('search.goto', 'Go to...', 'Ctrl+G', () => gotoDialog(), { keepFocus: true });
  def('search.brace', 'Go to Matching Brace', 'Ctrl+B', () => gotoMatchingBrace(false));
  def('search.selBrace', 'Select All In-between {} [] or ()', 'Ctrl+Alt+B', () => selectBetweenBraces());
  def('search.mark', 'Mark...', 'Ctrl+M', () => openFindDialog('mark'), { global: true, keepFocus: true });
  for (let i = 1; i <= 5; i++) {
    const ord = ['1st', '2nd', '3rd', '4th', '5th'][i - 1];
    def(`search.style${i}`, `Using ${ord} Style`, null, () => styleToken(i, true), { mapperLabel: `Style All Occurrences of Token: ${ord} Style` });
    def(`search.styleOne${i}`, `Using ${ord} Style`, null, () => styleToken(i, false), { mapperLabel: `Style One Token: ${ord} Style` });
    def(`search.clearStyle${i}`, `Clear ${ord} Style`, null, () => clearStyle(i));
    def(`search.jumpUp${i}`, `${ord} Style`, null, () => jumpToStyle(-1, i), { mapperLabel: `Jump Up: ${ord} Style` });
    def(`search.jumpDown${i}`, `${ord} Style`, null, () => jumpToStyle(1, i), { mapperLabel: `Jump Down: ${ord} Style` });
  }
  def('search.clearAllStyles', 'Clear all Styles', null, () => clearStyle('all'));
  def('search.jumpUpAll', 'All Styles', null, () => jumpToStyle(-1));
  def('search.jumpDownAll', 'All Styles', null, () => jumpToStyle(1));
  def('search.bmToggle', 'Toggle Bookmark', 'Ctrl+F2', () => toggleBookmark());
  def('search.bmNext', 'Next Bookmark', 'F2', () => gotoBookmark(1));
  def('search.bmPrev', 'Previous Bookmark', 'Shift+F2', () => gotoBookmark(-1));
  def('search.bmClear', 'Clear All Bookmarks', null, () => { cmx().clearGutter('npp-bookmarks'); scheduleSession(); });
  def('search.bmCut', 'Cut Bookmarked Lines', null, () => { const ls = bookmarkedLines(); copyText(ls.map((l) => docx().getLine(l)).join(tab().eol)); removeLinesSet(new Set(ls)); });
  def('search.bmCopy', 'Copy Bookmarked Lines', null, () => copyText(bookmarkedLines().map((l) => docx().getLine(l)).join(tab().eol)));
  def('search.bmPaste', 'Paste to (Replace) Bookmarked Lines', null, async () => {
    let t; try { t = await readClipboardText(); } catch { return; }
    const doc = docx();
    cmx().operation(() => { for (const l of bookmarkedLines().reverse()) doc.replaceRange(t.replace(/\r?\n$/, ''), P(l, 0), P(l, doc.getLine(l).length)); });
  });
  def('search.bmRemove', 'Remove Bookmarked Lines', null, () => removeLinesSet(new Set(bookmarkedLines())));
  def('search.bmRemoveUnmarked', 'Remove Unmarked Lines', null, () => { const keep = new Set(bookmarkedLines()); const all = new Set(); for (let i = 0; i < docx().lineCount(); i++) if (!keep.has(i)) all.add(i); removeLinesSet(all); });
  def('search.bmInverse', 'Inverse Bookmark', null, () => { const cm = cmx(); cm.operation(() => { for (let i = 0; i < cm.lineCount(); i++) cm.setGutterMarker(i, 'npp-bookmarks', hasBookmark(i) ? null : bookmarkMarker()); }); });

  currentCategory = 'View';
  def('view.fullscreen', 'Toggle Full Screen Mode', 'F11', () => toggleFullscreen(), { checked: () => !!document.fullscreenElement });
  def('view.postit', 'Post-It', 'F12', () => togglePostIt(), { checked: () => document.body.classList.contains('postit') });
  def('view.distraction', 'Distraction Free Mode', null, () => { document.body.classList.toggle('distraction'); togglePostIt(); }, { checked: () => document.body.classList.contains('distraction') });
  def('view.browser', 'Launch in Browser', null, () => launchInBrowser(), { enabled: hasPath });
  def('view.showWs', 'Show Space and TAB', null, () => { App.settings.showWhitespace = !App.settings.showWhitespace; applySettings(); }, { checked: () => App.settings.showWhitespace });
  def('view.showEol', 'Show End of Line', null, () => { App.settings.showEol = !App.settings.showEol; applySettings(); }, { checked: () => App.settings.showEol });
  def('view.showAll', 'Show All Characters', null, () => { const on = !(App.settings.showWhitespace && App.settings.showEol); App.settings.showWhitespace = on; App.settings.showEol = on; applySettings(); }, { checked: () => App.settings.showWhitespace && App.settings.showEol });
  def('view.indentGuide', 'Show Indent Guide', null, () => { App.settings.showIndentGuides = !App.settings.showIndentGuides; applySettings(); }, { checked: () => App.settings.showIndentGuides });
  def('view.zoomIn', 'Zoom In (Ctrl+Mouse Wheel Up)', ['Ctrl+Num+', 'Ctrl+=', 'Ctrl+Shift+='], () => setZoom(App.settings.zoom + 1));
  def('view.zoomOut', 'Zoom Out (Ctrl+Mouse Wheel Down)', ['Ctrl+Num-', 'Ctrl+-'], () => setZoom(App.settings.zoom - 1));
  def('view.zoomReset', 'Restore Default Zoom', ['Ctrl+Num/', 'Ctrl+0'], () => setZoom(0));
  for (let i = 1; i <= 9; i++) def(`view.tab${i}`, `${['1st', '2nd', '3rd'][i - 1] || i + 'th'} Tab`, [`Ctrl+Num${i}`, `Ctrl+${i}`], () => setTabIndex(i - 1));
  def('view.nextTab', 'Next Tab', 'Ctrl+PageDown', () => cycleTab(1), { global: true });
  def('view.prevTab', 'Previous Tab', 'Ctrl+PageUp', () => cycleTab(-1), { global: true });
  def('view.tabFwd', 'Move Tab Forward', 'Ctrl+Shift+PageDown', () => moveTab(1));
  def('view.tabBack', 'Move Tab Backward', 'Ctrl+Shift+PageUp', () => moveTab(-1));
  def('view.wrap', 'Word wrap', null, () => { App.settings.wordWrap = !App.settings.wordWrap; applySettings(); }, { checked: () => App.settings.wordWrap });
  def('view.foldAll', 'Fold All', 'Alt+0', () => cmx().execCommand('foldAll'));
  def('view.unfoldAll', 'Unfold All', 'Alt+Shift+0', () => cmx().execCommand('unfoldAll'));
  def('view.foldCur', 'Fold Current Level', 'Ctrl+Alt+F', () => foldCurrent(true));
  def('view.unfoldCur', 'Unfold Current Level', 'Ctrl+Alt+Shift+F', () => foldCurrent(false));
  for (let i = 1; i <= 8; i++) {
    def(`view.fold${i}`, String(i), `Alt+${i}`, () => foldLevel(i, true), { mapperLabel: `Fold Level ${i}` });
    def(`view.unfold${i}`, String(i), `Alt+Shift+${i}`, () => foldLevel(i, false), { mapperLabel: `Unfold Level ${i}` });
  }
  def('view.summary', 'Summary...', null, () => summaryDialog());
  def('view.workspace', 'Folder as Workspace', null, () => togglePanel('workspace'), { checked: () => App.settings.panels.workspace });
  def('view.doclist', 'Document List', null, () => togglePanel('doclist'), { checked: () => App.settings.panels.doclist });
  def('view.funclist', 'Function List', null, () => togglePanel('funclist'), { checked: () => App.settings.panels.funclist });
  def('view.rtl', 'Text Direction RTL', 'Ctrl+Alt+R', () => { App.settings.rtl = true; applySettings(); }, { checked: () => App.settings.rtl, radio: true });
  def('view.ltr', 'Text Direction LTR', 'Ctrl+Alt+L', () => { App.settings.rtl = false; applySettings(); }, { checked: () => !App.settings.rtl, radio: true });
  def('view.monitor', 'Monitoring (tail -f)', null, () => setMonitoring(tab(), !tab().monitoring), { checked: () => has() && tab().monitoring, enabled: hasPath });

  currentCategory = 'Encoding';
  for (const e of ENCODINGS) {
    def(`enc.in.${e.id}`, e.menu, null, () => encodeIn(e.id), { checked: () => has() && tab().encoding === e.id, radio: true });
    def(`enc.to.${e.id}`, `Convert to ${e.menu}`, null, () => setEncoding(e.id));
  }

  currentCategory = 'Language';
  for (const l of LANGUAGES) def(`lang.${l.id}`, l.menu || l.name, null, () => setLanguage(l.id), { checked: () => has() && tab().lang === l.id, radio: true });

  currentCategory = 'Settings';
  def('settings.prefs', 'Preferences...', null, () => preferencesDialog(), { keepFocus: true });
  def('settings.style', 'Style Configurator...', null, () => styleConfigDialog(), { keepFocus: true });
  def('settings.shortcuts', 'Shortcut Mapper...', null, () => shortcutMapperDialog(), { keepFocus: true });

  currentCategory = 'Tools';
  for (const a of ['md5', 'sha1', 'sha256', 'sha512']) {
    def(`tools.${a}.gen`, 'Generate...', null, () => hashDialog(a), { keepFocus: true });
    def(`tools.${a}.files`, 'Generate from files...', null, () => hashFilesDialog(a), { keepFocus: true });
    def(`tools.${a}.sel`, 'Generate from selection into clipboard', null, () => hashSelectionToClipboard(a), { enabled: hasSel });
  }

  currentCategory = 'Macro';
  def('macro.record', 'Start Recording', 'Ctrl+Shift+R', () => toggleRecording(), { noRecord: true, passive: true, enabled: () => !App.macro.recording });
  def('macro.stop', 'Stop Recording', null, () => toggleRecording(), { noRecord: true, enabled: () => App.macro.recording });
  def('macro.toggle', 'Start/Stop Recording', 'Ctrl+Shift+R', () => toggleRecording(), { noRecord: true, hiddenInMapper: true });
  def('macro.play', 'Playback', 'Ctrl+Shift+P', () => cmx().operation(() => playMacro()), { noRecord: true, enabled: () => !App.macro.recording && !!(App.macro.last && App.macro.last.length) });
  def('macro.save', 'Save Current Recorded Macro...', null, () => saveMacroDialog(), { noRecord: true, enabled: () => !App.macro.recording && !!(App.macro.last && App.macro.last.length) });
  def('macro.multi', 'Run a Macro Multiple Times...', null, () => runMacroMultipleDialog(), { noRecord: true, enabled: () => !App.macro.recording && (!!(App.macro.last && App.macro.last.length) || App.settings.macros.length > 0) });
  def('macro.trimSave', 'Trim Trailing Space and Save', 'Alt+Shift+S', () => { blankOp('trailing'); saveTab(tab()); }, { noRecord: true });

  currentCategory = 'Run';
  def('run.run', 'Run...', 'F5', () => runDialog(), { keepFocus: true });
  def('run.google', 'Search on Internet', null, () => searchInternet('google'));
  def('run.wiki', 'Wikipedia Search', null, () => searchInternet('wiki'));
  def('run.browser', 'Launch in Browser', null, () => launchInBrowser(), { enabled: hasPath });

  currentCategory = 'Plugins';
  def('plug.b64enc', 'Base64 Encode', null, () => selectionOrWarn(b64enc));
  def('plug.b64dec', 'Base64 Decode', null, () => selectionOrWarn(b64dec));
  def('plug.urlenc', 'URL Encode', null, () => selectionOrWarn(encodeURIComponent));
  def('plug.urldec', 'URL Decode', null, () => selectionOrWarn(urlDec));
  def('plug.a2h', 'ASCII -> HEX', null, () => selectionOrWarn(ascii2hex));
  def('plug.h2a', 'HEX -> ASCII', null, () => selectionOrWarn(hex2ascii));
  def('plug.exportHtml', 'Export to HTML...', null, () => exportHtml());
  def('plug.copyHtml', 'Copy HTML to clipboard', null, () => copyHtml());
  def('plug.admin', 'Plugins Admin...', null, () => pluginsAdminDialog(), { keepFocus: true });

  currentCategory = 'Window';
  def('win.windows', 'Windows...', null, () => windowsDialog(), { keepFocus: true });
  def('win.sortNameAZ', 'Name A to Z', null, () => sortTabs('nameAZ'));
  def('win.sortNameZA', 'Name Z to A', null, () => sortTabs('nameZA'));
  def('win.sortPath', 'Path A to Z', null, () => sortTabs('path'));
  def('win.sortType', 'Type A to Z', null, () => sortTabs('type'));
  def('win.sortSize', 'Content Length Ascending', null, () => sortTabs('size'));

  currentCategory = '?';
  def('help.cmdline', 'Command Line Arguments...', null, () => msgBox(`Open a file on startup with a URL parameter:\n\nhttp://localhost:7777/?open=/full/path/to/file.txt\n\nAdd &line=N to place the caret on line N.`, { title: 'Command Line Arguments' }));
  def('help.debug', 'Debug Info...', null, () => debugInfoDialog(), { keepFocus: true });
  def('help.about', `About ${APP_NAME}`, 'F1', () => aboutDialog(), { keepFocus: true });

  rebuildKeymap();
}

function removeLinesSet(set) {
  if (!editable() || !set.size) return;
  const doc = docx();
  const lines = [];
  for (let i = 0; i < doc.lineCount(); i++) if (!set.has(i)) lines.push(doc.getLine(i));
  replaceLines(0, doc.lastLine(), lines.length ? lines : [''], { select: false });
}

// Rectangular selection with Alt+Shift+arrows.
let colAnchor = null;
function columnSelect(dl, dc) {
  const cm = cmx(), doc = docx();
  const sels = doc.listSelections();
  const prim = sels[sels.length - 1];
  if (!colAnchor || sels.length === 1 && CodeMirror.cmpPos(prim.anchor, prim.head) === 0) colAnchor = { line: prim.head.line, col: CodeMirror.countColumn(doc.getLine(prim.head.line), prim.head.ch, App.settings.tabSize), head: { line: prim.head.line, col: CodeMirror.countColumn(doc.getLine(prim.head.line), prim.head.ch, App.settings.tabSize) } };
  const h = colAnchor.head;
  h.line = Math.max(0, Math.min(doc.lastLine(), h.line + dl));
  h.col = Math.max(0, h.col + dc);
  const a = colAnchor;
  const ranges = [];
  const l1 = Math.min(a.line, h.line), l2 = Math.max(a.line, h.line);
  for (let l = l1; l <= l2; l++) {
    const text = doc.getLine(l);
    ranges.push({ anchor: P(l, CodeMirror.findColumn(text, a.col, App.settings.tabSize)), head: P(l, CodeMirror.findColumn(text, h.col, App.settings.tabSize)) });
  }
  const primIndex = h.line >= a.line ? ranges.length - 1 : 0;
  doc.setSelections(ranges, primIndex);
  cm.scrollIntoView(ranges[primIndex].head);
  const stop = () => { colAnchor = null; cm.off('mousedown', stop); };
  cm.on('mousedown', stop);
}

// ---------------------------------------------------------------- menus

function letterGroups() {
  const groups = {};
  for (const l of LANGUAGES.slice(1)) {
    const k = l.name[0].toUpperCase();
    (groups[k] = groups[k] || []).push(`lang.${l.id}`);
  }
  return Object.keys(groups).sort().map((k) => ({ label: k, submenu: groups[k] }));
}

function languageMenu() { return ['lang.text', '-', ...letterGroups()]; }
function eolMenu() { return ['edit.eolWin', 'edit.eolUnix', 'edit.eolMac']; }
function encodingMenu() { return [...ENCODINGS.map((e) => `enc.in.${e.id}`), '-', ...ENCODINGS.map((e) => `enc.to.${e.id}`)]; }

function recentMenuItems() {
  if (!App.recent.length) return [];
  return [...App.recent.map((p, i) => ({ label: `${i + 1}: ${App.settings.recentFullPath ? p : basename(p)}`, run: () => openFile(p) })), '-'];
}

function styleMenus(prefix) {
  return [1, 2, 3, 4, 5].map((i) => `${prefix}${i}`);
}

function mainMenus() {
  return [
    { label: 'File', items: () => [
      'file.new', 'file.open',
      { label: 'Open Containing Folder', submenu: ['file.revealFinder', 'file.revealTerminal'], enabled: () => !!App.active.path },
      'file.openWorkspace', 'file.reload', 'file.save', 'file.saveAs', 'file.saveCopy', 'file.saveAll', 'file.rename', 'file.close', 'file.closeAll',
      { label: 'Close Multiple Documents', submenu: ['file.closeOthers', 'file.closeLeft', 'file.closeRight', 'file.closeUnchanged'] },
      '-', 'file.print', 'file.printNow', '-',
      ...recentMenuItems(),
      'file.restoreClosed', 'file.openAllRecent', 'file.emptyRecent', '-', 'file.exit',
    ] },
    { label: 'Edit', items: [
      'edit.undo', 'edit.redo', '-', 'edit.cut', 'edit.copy', 'edit.paste', 'edit.delete', 'edit.selectAll', 'edit.beginEnd', '-',
      { label: 'Insert', submenu: ['edit.dateShort', 'edit.dateLong', 'edit.dateCustom'] },
      { label: 'Copy to Clipboard', submenu: ['edit.copyPath', 'edit.copyName', 'edit.copyDir'] },
      { label: 'Indent', submenu: ['edit.indent', 'edit.outdent'] },
      { label: 'Convert Case to', submenu: ['edit.upper', 'edit.lower', 'edit.proper', 'edit.properBlend', 'edit.sentence', 'edit.sentenceBlend', 'edit.invert', 'edit.random'] },
      { label: 'Line Operations', submenu: ['edit.dupLine', 'edit.removeDup', 'edit.removeConsecDup', 'edit.splitLines', 'edit.joinLines', 'edit.moveUp', 'edit.moveDown', 'edit.removeEmpty', 'edit.removeBlank', 'edit.blankAbove', 'edit.blankBelow', '-', 'edit.reverse', 'edit.randomize', '-', 'edit.sortLexAsc', 'edit.sortLexDesc', 'edit.sortLexAscI', 'edit.sortLexDescI', 'edit.sortLocale', 'edit.sortIntAsc', 'edit.sortIntDesc', 'edit.sortDecAsc', 'edit.sortDecDesc', 'edit.sortLenAsc', 'edit.sortLenDesc', '-', 'edit.lineCut', 'edit.lineCopy', 'edit.lineDelete', 'edit.lineTranspose'] },
      { label: 'Comment/Uncomment', submenu: ['edit.toggleComment', 'edit.lineComment', 'edit.lineUncomment', 'edit.blockComment', 'edit.blockUncomment'] },
      { label: 'Auto-Completion', submenu: ['edit.funcCompletion', 'edit.wordCompletion'] },
      { label: 'EOL Conversion', submenu: eolMenu() },
      { label: 'Blank Operations', submenu: ['edit.trimTrailing', 'edit.trimLeading', 'edit.trimBoth', 'edit.eol2space', 'edit.trimEol2space', '-', 'edit.tab2space', 'edit.space2tabAll', 'edit.space2tabLead'] },
      { label: 'On Selection', submenu: ['edit.openSelFile', 'edit.searchInternet'] },
      '-', 'edit.columnMode', 'edit.columnEditor', '-', 'edit.readOnly',
    ] },
    { label: 'Search', items: [
      'search.find', 'search.fif', 'search.next', 'search.prev', 'search.selNext', 'search.selPrev', 'search.volNext', 'search.volPrev', 'search.replace', '-',
      'search.results', 'search.nextResult', 'search.prevResult', '-', 'search.goto', 'search.brace', 'search.selBrace', 'search.mark', '-',
      { label: 'Style All Occurrences of Token', submenu: styleMenus('search.style') },
      { label: 'Style One Token', submenu: styleMenus('search.styleOne') },
      { label: 'Clear Style', submenu: [...styleMenus('search.clearStyle'), 'search.clearAllStyles'] },
      { label: 'Jump Up', submenu: [...styleMenus('search.jumpUp'), 'search.jumpUpAll'] },
      { label: 'Jump Down', submenu: [...styleMenus('search.jumpDown'), 'search.jumpDownAll'] },
      '-',
      { label: 'Bookmark', submenu: ['search.bmToggle', 'search.bmNext', 'search.bmPrev', 'search.bmClear', 'search.bmCut', 'search.bmCopy', 'search.bmPaste', 'search.bmRemove', 'search.bmRemoveUnmarked', 'search.bmInverse'] },
    ] },
    { label: 'View', items: [
      'view.fullscreen', 'view.postit', 'view.distraction', '-',
      { label: 'View Current File in', submenu: ['view.browser'] }, '-',
      { label: 'Show Symbol', submenu: ['view.showWs', 'view.showEol', 'view.showAll', '-', 'view.indentGuide'] },
      { label: 'Zoom', submenu: ['view.zoomIn', 'view.zoomOut', 'view.zoomReset'] },
      { label: 'Tab', submenu: [...Array.from({ length: 9 }, (_, i) => `view.tab${i + 1}`), '-', 'view.nextTab', 'view.prevTab', '-', 'view.tabFwd', 'view.tabBack'] },
      'view.wrap', '-',
      'view.foldAll', 'view.unfoldAll', 'view.foldCur', 'view.unfoldCur',
      { label: 'Fold Level', submenu: Array.from({ length: 8 }, (_, i) => `view.fold${i + 1}`) },
      { label: 'Unfold Level', submenu: Array.from({ length: 8 }, (_, i) => `view.unfold${i + 1}`) },
      '-', 'view.summary', '-', 'view.workspace', 'view.doclist', 'view.funclist', '-', 'view.rtl', 'view.ltr', '-', 'view.monitor',
    ] },
    { label: 'Encoding', items: () => encodingMenu() },
    { label: 'Language', items: () => languageMenu() },
    { label: 'Settings', items: ['settings.prefs', 'settings.style', 'settings.shortcuts'] },
    { label: 'Tools', items: ['md5', 'sha1', 'sha256', 'sha512'].map((a) => ({ label: HASH_NAMES[a], submenu: [`tools.${a}.gen`, `tools.${a}.files`, `tools.${a}.sel`] })) },
    { label: 'Macro', items: () => [
      'macro.record', 'macro.stop', 'macro.play', 'macro.save', 'macro.multi', '-', 'macro.trimSave',
      ...(App.settings.macros.length ? ['-', ...App.settings.macros.map((m) => ({ label: m.name, run: () => App.cm.operation(() => playMacro(m.actions)) })),
        { label: 'Delete Macro', submenu: App.settings.macros.map((m, i) => ({ label: m.name, run: () => { App.settings.macros.splice(i, 1); scheduleSession(); } })) }] : []),
    ] },
    { label: 'Run', items: ['run.run', '-', 'run.browser', 'run.google', 'run.wiki'] },
    { label: 'Plugins', items: [
      { label: 'Converter', submenu: ['plug.a2h', 'plug.h2a'] },
      { label: 'MIME Tools', submenu: ['plug.b64enc', 'plug.b64dec', '-', 'plug.urlenc', 'plug.urldec'] },
      { label: 'NppExport', submenu: ['plug.exportHtml', 'plug.copyHtml'] },
      '-', 'plug.admin', { label: 'Open Plugins Folder...', enabled: false },
    ] },
    { label: 'Window', items: () => [
      'win.windows',
      { label: 'Sort By', submenu: ['win.sortNameAZ', 'win.sortNameZA', 'win.sortPath', 'win.sortType', 'win.sortSize'] },
      '-',
      ...App.tabs.slice(0, 20).map((t, i) => ({ label: `${i + 1}: ${t.title}`, checked: () => t === App.active, run: () => activateTab(t) })),
    ] },
    { label: '?', items: ['help.cmdline', '-', 'help.debug', '-', 'help.about'] },
  ];
}

function editorContextMenu() {
  return [
    { label: 'Style all occurrences of token', submenu: styleMenus('search.style') },
    { label: 'Style one token', submenu: styleMenus('search.styleOne') },
    { label: 'Clear style', submenu: [...styleMenus('search.clearStyle'), 'search.clearAllStyles'] },
    '-', 'edit.cut', 'edit.copy', 'edit.paste', 'edit.delete', 'edit.selectAll', 'edit.beginEnd', '-',
    'edit.upper', 'edit.lower', '-', 'edit.openSelFile', 'edit.searchInternet', '-',
    'edit.toggleComment', 'edit.blockComment', 'edit.blockUncomment', '-',
    'search.bmToggle',
  ];
}

function tabContextMenu(t) {
  return [
    'file.close', 'file.closeOthers', 'file.closeLeft', 'file.closeRight', 'file.closeUnchanged', '-',
    'file.save', 'file.saveAs',
    { label: 'Open Containing Folder', submenu: ['file.revealFinder', 'file.revealTerminal'], enabled: () => !!t.path },
    'file.rename', 'file.reload', 'file.print', '-',
    'edit.readOnly', '-',
    'edit.copyPath', 'edit.copyName', 'edit.copyDir', '-',
    { label: 'Move to Start', run: () => { App.tabs.splice(App.tabs.indexOf(t), 1); App.tabs.unshift(t); renderTabs(); renderDocList(); } },
    { label: 'Move to End', run: () => { App.tabs.splice(App.tabs.indexOf(t), 1); App.tabs.push(t); renderTabs(); renderDocList(); } },
  ];
}

// ---------------------------------------------------------------- toolbar

const TOOLBAR = [
  ['new', 'file.new', 'New'], ['open', 'file.open', 'Open'], ['save', 'file.save', 'Save'], ['saveall', 'file.saveAll', 'Save All'],
  ['close', 'file.close', 'Close'], ['closeall', 'file.closeAll', 'Close All'], ['print', 'file.print', 'Print'], '|',
  ['cut', 'edit.cut', 'Cut'], ['copy', 'edit.copy', 'Copy'], ['paste', 'edit.paste', 'Paste'], '|',
  ['undo', 'edit.undo', 'Undo'], ['redo', 'edit.redo', 'Redo'], '|',
  ['find', 'search.find', 'Find'], ['replace', 'search.replace', 'Replace'], '|',
  ['zoomin', 'view.zoomIn', 'Zoom In'], ['zoomout', 'view.zoomOut', 'Zoom Out'], '|',
  ['syncv', null, 'Synchronize Vertical Scrolling'], ['synch', null, 'Synchronize Horizontal Scrolling'], '|',
  ['wrap', 'view.wrap', 'Word wrap'], ['allchars', 'view.showAll', 'Show All Characters'], ['indentguide', 'view.indentGuide', 'Show Indent Guide'], '|',
  ['udl', null, 'Define your language...'], ['docmap', null, 'Document Map'], ['doclist', 'view.doclist', 'Document List'], ['funclist', 'view.funclist', 'Function List'], ['folderws', 'view.workspace', 'Folder as Workspace'], '|',
  ['monitor', 'view.monitor', 'Monitoring (tail -f)'], '|',
  ['record', 'macro.record', 'Start Recording'], ['stop', 'macro.stop', 'Stop Recording'], ['play', 'macro.play', 'Playback'], ['playmulti', 'macro.multi', 'Run a Macro Multiple Times'], ['savemacro', 'macro.save', 'Save Current Recorded Macro'],
];

function buildToolbar() {
  const tb = $('#toolbar');
  tb.innerHTML = '';
  App.toolbarButtons = [];
  for (const item of TOOLBAR) {
    if (item === '|') { tb.append(el('div', { class: 'tb-sep' })); continue; }
    const [icon, cmd, title] = item;
    const c = cmd && COMMANDS[cmd];
    const k = c ? keyDisplay(c) : '';
    const b = el('button', { class: 'tb-btn', title: k ? `${title} (${k})` : title, html: ICONS[icon], tabindex: '-1' });
    b.addEventListener('mousedown', (e) => e.preventDefault());
    if (cmd) b.addEventListener('click', () => runCommand(cmd));
    else b.disabled = true;
    tb.append(b);
    App.toolbarButtons.push({ b, cmd });
  }
}

function updateToolbarState() {
  if (!App.toolbarButtons) return;
  for (const { b, cmd } of App.toolbarButtons) {
    if (!cmd) continue;
    const c = COMMANDS[cmd];
    b.disabled = c.enabled ? !val(c.enabled) : false;
    b.classList.toggle('checked', c.checked ? !!val(c.checked) : false);
  }
}
