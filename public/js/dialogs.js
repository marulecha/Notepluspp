'use strict';
// Modal and modeless dialogs other than Find.

const THEMES = [
  { id: 'default', name: 'Default (stylers.xml)' },
  { id: 'dark', name: 'DarkModeDefault' },
  { id: 'obsidian', name: 'Obsidian' },
  { id: 'monokai', name: 'Monokai' },
  { id: 'zenburn', name: 'Zenburn' },
  { id: 'solarized', name: 'Solarized' },
  { id: 'solarized-light', name: 'Solarized-light' },
];

const FONTS = ['Courier New', 'Consolas', 'Menlo', 'Monaco', 'SF Mono', 'Lucida Console', 'DejaVu Sans Mono', 'Source Code Pro', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', 'Andale Mono', 'monospace'];

const radio = (name, value, checked, label) => {
  const r = el('input', { type: 'radio', name, value, checked });
  return el('label', { class: 'chk' }, r, ' ' + label);
};
const check = (checked, label, onchange) => {
  const c = el('input', { type: 'checkbox', checked });
  if (onchange) c.addEventListener('change', () => onchange(c.checked));
  return el('label', { class: 'chk' }, c, ' ' + label);
};

// ---------------------------------------------------------------- Go To

function gotoDialog() {
  const cm = App.cm, doc = cm.getDoc();
  const lineR = el('input', { type: 'radio', name: 'goto-mode', checked: true });
  const offR = el('input', { type: 'radio', name: 'goto-mode' });
  const here = el('span', { class: 'goto-val' });
  const max = el('span', { class: 'goto-val' });
  const input = el('input', { type: 'text', class: 'goto-input', autofocus: true });
  const refresh = () => {
    const c = doc.getCursor();
    if (lineR.checked) { here.textContent = c.line + 1; max.textContent = doc.lineCount(); }
    else { here.textContent = doc.indexFromPos(c); max.textContent = doc.getValue().length; }
    input.focus();
  };
  lineR.addEventListener('change', refresh);
  offR.addEventListener('change', refresh);
  const body = el('div', { class: 'goto' },
    el('div', { class: 'goto-modes' }, el('label', { class: 'chk' }, lineR, ' Line'), el('label', { class: 'chk' }, offR, ' Offset')),
    el('div', { class: 'goto-grid' },
      el('label', {}, 'You are here :'), here,
      el('label', {}, 'You want to go to :'), input,
      el('label', {}, "You can't go further than :"), max));
  const go = (d) => {
    const n = parseInt(input.value, 10);
    if (Number.isNaN(n)) { input.focus(); return; }
    if (lineR.checked) {
      const line = Math.max(1, Math.min(doc.lineCount(), n)) - 1;
      d.close();
      gotoPos(line, 0);
      cm.setCursor({ line, ch: 0 });
    } else {
      const pos = doc.posFromIndex(Math.max(0, n));
      d.close();
      cm.setCursor(pos);
      cm.scrollIntoView(pos, 100);
    }
  };
  const d = new Dialog({
    title: 'Go To...', body, width: 330,
    buttons: [{ label: 'Go', default: true, run: go }, { label: "I'm going nowhere", value: null }],
  });
  d.show();
  refresh();
}

// ---------------------------------------------------------------- Column Editor

function columnEditorDialog() {
  const cm = App.cm, doc = cm.getDoc();
  const textR = el('input', { type: 'radio', name: 'col-mode', checked: true });
  const numR = el('input', { type: 'radio', name: 'col-mode' });
  const text = el('input', { type: 'text', class: 'w100', autofocus: true });
  const init = el('input', { type: 'number', value: '1' });
  const inc = el('input', { type: 'number', value: '1' });
  const rep = el('input', { type: 'number', value: '1', min: '1' });
  const lead = el('select', {}, el('option', { value: 'none' }, 'None'), el('option', { value: 'zeros' }, 'Zeros'), el('option', { value: 'spaces' }, 'Spaces'));
  const fmt = (v, l) => radio('col-fmt', v, v === 'dec', l);
  const body = el('div', { class: 'coled' },
    el('fieldset', {}, el('legend', {}, el('label', { class: 'chk' }, textR, ' Text to Insert')), text),
    el('fieldset', {}, el('legend', {}, el('label', { class: 'chk' }, numR, ' Number to Insert')),
      el('div', { class: 'coled-grid' },
        el('label', {}, 'Initial number :'), init,
        el('label', {}, 'Increase by :'), inc,
        el('label', {}, 'Repeat :'), rep,
        el('label', {}, 'Leading :'), lead),
      el('fieldset', { class: 'inner' }, el('legend', {}, 'Format'), fmt('dec', 'Dec'), fmt('hex', 'Hex'), fmt('oct', 'Oct'), fmt('bin', 'Bin'))));
  [init, inc, rep, lead].forEach((x) => x.addEventListener('focus', () => { numR.checked = true; }));
  text.addEventListener('focus', () => { textR.checked = true; });
  const apply = (d) => {
    const sels = doc.listSelections();
    let lines;
    if (sels.length > 1) lines = sels.map((r) => ({ line: Math.min(r.anchor.line, r.head.line), ch: Math.min(r.anchor.ch, r.head.ch) }));
    else {
      const from = doc.getCursor('from'), to = doc.getCursor('to');
      const col = CodeMirror.countColumn(doc.getLine(from.line), from.ch, App.settings.tabSize);
      lines = [];
      for (let l = from.line; l <= to.line; l++) lines.push({ line: l, col });
    }
    const radix = { dec: 10, hex: 16, oct: 8, bin: 2 }[$('input[name=col-fmt]:checked', body).value];
    const values = [];
    let n = Number(init.value) || 0;
    const step = Number(inc.value) || 0;
    const repeat = Math.max(1, Number(rep.value) || 1);
    for (let i = 0; i < lines.length; i++) {
      if (i > 0 && i % repeat === 0) n += step;
      values.push(n);
    }
    let strs;
    if (textR.checked) strs = lines.map(() => text.value);
    else {
      strs = values.map((v) => (v < 0 ? '-' : '') + Math.abs(v).toString(radix).toUpperCase());
      const w = Math.max(...strs.map((x) => x.length));
      if (lead.value === 'zeros') strs = strs.map((x) => x.padStart(w, '0'));
      else if (lead.value === 'spaces') strs = strs.map((x) => x.padStart(w, ' '));
      else strs = strs.map((x) => x.padEnd(w, ' '));
    }
    cm.operation(() => {
      for (let i = lines.length - 1; i >= 0; i--) {
        const L = lines[i];
        const lineText = doc.getLine(L.line);
        let ch;
        if (L.ch != null) ch = L.ch;
        else {
          ch = 0;
          let c = 0;
          while (ch < lineText.length && c < L.col) { c = CodeMirror.countColumn(lineText, ch + 1, App.settings.tabSize); ch++; }
          if (c < L.col) { doc.replaceRange(' '.repeat(L.col - c), { line: L.line, ch: lineText.length }); ch = lineText.length + (L.col - c); }
        }
        doc.replaceRange(strs[i], { line: L.line, ch });
      }
    });
    d.close();
  };
  new Dialog({ title: 'Column / Multi-Selection Editor', body, width: 360, buttons: [{ label: 'OK', default: true, run: apply }, { label: 'Cancel', value: null }] }).show();
}

// ---------------------------------------------------------------- Summary

async function summaryDialog() {
  const t = App.active, doc = t.doc;
  const text = doc.getValue();
  const words = (text.match(/[\p{L}\p{N}_]+/gu) || []).length;
  let chars = 0;
  doc.eachLine((l) => { chars += l.text.length; });
  const len = chars + (doc.lineCount() - 1) * t.eol.length;
  const bytes = new TextEncoder().encode(doc.getValue(t.eol)).length;
  const sel = doc.getSelection();
  let st = null;
  if (t.path) { try { st = await api.get('stat', { path: t.path }); } catch { /* ignore */ } }
  const lines = [
    t.path ? `Full file path: ${t.path}` : null,
    st && st.exists ? `Created: ${new Date(st.ctime).toLocaleString()}` : null,
    st && st.exists ? `Modified: ${new Date(st.mtime).toLocaleString()}` : null,
    t.path ? '' : null,
    `Characters (without line endings): ${fmtNum(chars)}`,
    `Words: ${fmtNum(words)}`,
    `Lines: ${fmtNum(doc.lineCount())}`,
    `Document length: ${fmtNum(len)}`,
    `${fmtNum(sel.length)} selected characters (${fmtNum(new TextEncoder().encode(sel).length)} bytes) in ${sel ? fmtNum(doc.getCursor('to').line - doc.getCursor('from').line + 1) : 0} ranges`,
    '',
    `File size on save (${ENC_LABEL[t.encoding]}): ${fmtNum(bytes)} bytes`,
  ].filter((x) => x !== null);
  msgBox(lines.join('\n'), { title: 'Summary', icon: null });
}

// ---------------------------------------------------------------- About

function aboutDialog() {
  const body = el('div', { class: 'about' },
    el('img', { class: 'about-logo', src: 'logo.svg', alt: APP_NAME }),
    el('div', {},
      el('div', { class: 'about-title' }, `${APP_NAME} v${APP_VERSION}   (64-bit)`),
      el('div', {}, `Build time: ${new Date(document.lastModified).toDateString()}`),
      el('div', { class: 'about-gap' }, window.desktop ? 'A free source code editor for macOS.' : 'A free source code editor that runs in your browser on localhost:7777.'),
      el('div', {}, 'Editing component: CodeMirror 5 (MIT license).'),
      el('div', { class: 'about-gap' }, `Server: Node.js on ${App.info.platform}`),
      el('div', { class: 'about-quote' }, '"Programs must be written for people to read, and only incidentally for machines to execute." — Harold Abelson')));
  new Dialog({ title: `About ${APP_NAME}`, body, width: 520, buttons: [{ label: 'OK', default: true, value: null }] }).show();
}

function debugInfoDialog() {
  const s = App.settings;
  const info = [
    `${APP_NAME} v${APP_VERSION}`,
    `Path : ${location.href}`,
    `Server platform : ${App.info.platform}`,
    `Browser : ${navigator.userAgent}`,
    `Theme : ${s.theme}`,
    `Dark mode : ${s.darkMode}`,
    `Session : ${s.rememberSession ? 'ON' : 'OFF'}`,
    `Open documents : ${App.tabs.length}`,
  ].join('\n');
  const ta = el('textarea', { class: 'debug-ta', readonly: true }, info);
  new Dialog({ title: 'Debug Info', body: ta, width: 520, buttons: [{ label: 'Copy debug info into clipboard', run: () => copyText(info) }, { label: 'OK', default: true, value: null }] }).show();
}

// ---------------------------------------------------------------- Hash generation

const HASH_NAMES = { md5: 'MD5', sha1: 'SHA-1', sha256: 'SHA-256', sha512: 'SHA-512' };

function hashDialog(algo) {
  const input = el('textarea', { class: 'hash-in', spellcheck: 'false', autofocus: true });
  const out = el('textarea', { class: 'hash-out', readonly: true });
  const perLine = el('input', { type: 'checkbox' });
  const update = async () => {
    if (perLine.checked) {
      const res = [];
      for (const l of input.value.split(/\r?\n/)) res.push(l ? `${await hashText(algo, l)}  ${l}` : '');
      out.value = res.join('\n');
    } else out.value = input.value ? await hashText(algo, input.value) : '';
  };
  input.addEventListener('input', update);
  perLine.addEventListener('change', update);
  const body = el('div', { class: 'hash' }, input, el('label', { class: 'chk' }, perLine, ' Treat each line as a separate string'), out);
  new Dialog({ title: `Generate ${HASH_NAMES[algo]} digest`, body, width: 560, buttons: [{ label: 'Copy to clipboard', run: () => copyText(out.value) }, { label: 'Close', value: null }] }).show();
}

async function hashFilesDialog(algo) {
  const out = el('textarea', { class: 'hash-out tall', readonly: true });
  const files = [];
  const add = async () => {
    const p = await fileDialog({ mode: 'open', dir: defaultDir(), title: 'Choose a file to hash' });
    if (!p) return;
    try {
      const r = await api.get('hash', { path: p, algo });
      files.push(`${r.hash}  ${basename(p)}`);
      out.value = files.join('\n');
    } catch (err) { msgBox(err.message, { icon: 'error' }); }
  };
  const body = el('div', { class: 'hash' }, el('button', { class: 'btn', onclick: add }, 'Choose files to generate ' + HASH_NAMES[algo] + '...'), out);
  new Dialog({ title: `Generate ${HASH_NAMES[algo]} digest from files`, body, width: 620, buttons: [{ label: 'Copy to clipboard', run: () => copyText(out.value) }, { label: 'Close', value: null }] }).show();
}

async function hashSelectionToClipboard(algo) {
  const sel = App.cm.getSelection();
  if (!sel) return;
  const parts = [];
  for (const l of sel.split('\n')) parts.push(l ? await hashText(algo, l) : '');
  await copyText(parts.join(App.active.eol));
}

// ---------------------------------------------------------------- Preferences

function preferencesDialog() {
  const s = App.settings;
  const draft = JSON.parse(JSON.stringify(s));
  const pages = {};
  const bind = (key, type = 'checkbox') => (input) => {
    if (type === 'checkbox') { input.checked = !!draft[key]; input.addEventListener('change', () => { draft[key] = input.checked; }); }
    else if (type === 'number') { input.value = draft[key]; input.addEventListener('input', () => { draft[key] = Number(input.value); }); }
    else { input.value = draft[key]; input.addEventListener('input', () => { draft[key] = input.value; }); }
    return input;
  };
  const cb = (key, label) => el('label', { class: 'chk' }, bind(key)(el('input', { type: 'checkbox' })), ' ' + label);
  const sel = (key, options) => bind(key, 'select')(el('select', {}, ...options.map(([v, l]) => el('option', { value: v }, l))));
  const num = (key, min, max) => bind(key, 'number')(el('input', { type: 'number', min, max, class: 'num' }));
  const txt = (key) => bind(key, 'text')(el('input', { type: 'text', class: 'w100' }));
  const radios = (key, options) => {
    const name = 'pref-' + key;
    return el('div', { class: 'radios' }, ...options.map(([v, l]) => {
      const r = el('input', { type: 'radio', name, checked: draft[key] === v });
      r.addEventListener('change', () => { if (r.checked) draft[key] = v; });
      return el('label', { class: 'chk' }, r, ' ' + l);
    }));
  };
  const group = (title, ...kids) => el('fieldset', {}, el('legend', {}, title), ...kids);
  const row = (label, input) => el('div', { class: 'prow' }, el('label', {}, label), input);

  pages['General'] = el('div', {},
    group('Localization', row('Language :', el('select', { disabled: true }, el('option', {}, 'English')))),
    group('Toolbar', cb('hideToolbar', 'Hide')),
    group('Tab Bar', cb('hideTabbar', 'Hide'), cb('tabCloseButton', 'Show close button on each tab'), cb('tabDblClickClose', 'Double click to close document')),
    group('Status Bar', cb('hideStatusbar', 'Hide')),
    group('Menu', cb('hideMenubar', 'Hide menu bar (use Alt or F10 key to toggle)')));
  pages['Dark Mode'] = el('div', {}, group('Dark Mode', radios('darkMode', [['light', 'Light mode'], ['dark', 'Dark mode'], ['os', 'Follow system']])));
  pages['Editing'] = el('div', {},
    group('Current Line Indicator', radios('currentLine', [['none', 'None'], ['highlight', 'Highlight Background'], ['frame', 'Frame']])),
    group('Caret Settings', row('Width :', sel('caretWidth', [[1, '1'], [2, '2'], [3, '3']])), row('Blink Rate (ms, 0 = no blink) :', num('caretBlink', 0, 2000))),
    group('Margins', cb('lineNumbers', 'Display line number'), cb('bookmarkMargin', 'Display bookmark'), cb('foldMargin', 'Display folding margin')),
    group('Vertical Edge', row('Column (0 = off) :', num('edgeColumn', 0, 400))),
    group('Others', cb('scrollPastEnd', 'Enable scrolling beyond last line'), cb('multiEdit', 'Enable Multi-Editing (Ctrl+Mouse click/selection)'), cb('wordWrap', 'Word wrap'), cb('rtl', 'Text direction RTL')));
  pages['Highlighting'] = el('div', {},
    group('Smart Highlighting', cb('smartHighlight', 'Enable'), cb('smartMatchCase', 'Match case'), cb('smartWholeWord', 'Match whole word only')));
  pages['New Document'] = el('div', {},
    group('Format (Line ending)', radios('newDocEol', [['\r\n', 'Windows (CR LF)'], ['\n', 'Unix (LF)'], ['\r', 'Macintosh (CR)']])),
    group('Encoding', radios('newDocEncoding', ENCODINGS.map((e) => [e.id, e.menu]))),
    group('Default language', sel('newDocLang', LANGUAGES.map((l) => [l.id, l.menu || l.name]))));
  pages['Default Directory'] = el('div', {},
    group('Default Open/Save File Directory', radios('defaultDir', [['follow', 'Follow current document'], ['last', 'Remember last used directory'], ['custom', 'Use the folder below']]), txt('customDir')));
  pages['Recent Files History'] = el('div', {},
    group('Recent Files History', row('Max. number of entries :', num('recentMax', 0, 30)), cb('recentFullPath', 'Display full file path in menu')));
  pages['Language'] = el('div', {},
    group('Tab Settings', row('Tab size :', num('tabSize', 1, 16)), cb('useSpaces', 'Replace by space')),
    group('Indentation', cb('autoIndent', 'Auto-indent')));
  pages['Auto-Completion'] = el('div', {},
    group('Auto-Completion', cb('autoComplete', 'Enable auto-completion on each input (word completion)'), row('From Nth character :', num('autoCompleteFrom', 1, 9))),
    group('Auto-Insert', cb('autoCloseBrackets', 'Auto-insert ( ) [ ] { } " \' and ` `'), cb('autoCloseTags', 'html/xml close tag')));
  pages['Searching'] = el('div', {},
    group('Searching', cb('findFillSelection', 'Fill find field with selected text'), cb('findMonospace', 'Use Monospaced font in Find dialog')));
  pages['Backup'] = el('div', {},
    group('Session snapshot', cb('rememberSession', 'Remember current session (and unsaved changes) for next launch')));
  pages['MISC.'] = el('div', {},
    group('Title Bar', cb('titleFileNameOnly', 'Show only file name in title bar')),
    group('File browser', cb('showHiddenFiles', 'Show hidden files in Open/Save dialogs')));

  const list = el('div', { class: 'pref-list' });
  const content = el('div', { class: 'pref-content' });
  const show = (name) => {
    $$('.pref-item', list).forEach((x) => x.classList.toggle('active', x.textContent === name));
    content.innerHTML = '';
    content.append(pages[name]);
  };
  Object.keys(pages).forEach((n) => list.append(el('div', { class: 'pref-item', onclick: () => show(n) }, n)));
  show(preferencesDialog.last || 'General');
  const d = new Dialog({
    title: 'Preferences', body: el('div', { class: 'pref' }, list, content), width: 720, className: 'pref-dlg',
    buttons: [{ label: 'Close', default: true, run: (dlg) => {
      preferencesDialog.last = $('.pref-item.active', list).textContent;
      const darkChanged = draft.darkMode !== s.darkMode;
      Object.assign(s, draft, { caretWidth: Number(draft.caretWidth) });
      if (darkChanged) {
        const dark = s.darkMode === 'dark' || (s.darkMode === 'os' && matchMedia('(prefers-color-scheme: dark)').matches);
        if (dark && s.theme === 'default') s.theme = 'dark';
        if (!dark && s.theme === 'dark') s.theme = 'default';
      }
      App.recent = App.recent.slice(0, s.recentMax);
      applySettings();
      updateTitle();
      dlg.close();
    } }],
  });
  d.show();
}

// ---------------------------------------------------------------- Style Configurator

function styleConfigDialog() {
  const s = App.settings;
  const orig = { theme: s.theme, fontFamily: s.fontFamily, fontSize: s.fontSize };
  const themeSel = el('select', {}, ...THEMES.map((t) => el('option', { value: t.id }, t.name)));
  themeSel.value = s.theme;
  const fontSel = el('select', {}, ...FONTS.map((f) => el('option', { value: f }, f)));
  const curFont = (s.fontFamily.match(/^'?([^',]+)/) || [])[1] || 'Courier New';
  if (!FONTS.includes(curFont)) fontSel.prepend(el('option', { value: curFont }, curFont));
  fontSel.value = curFont;
  const sizeSel = el('select', {}, ...[8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32].map((n) => el('option', { value: n }, String(n))));
  sizeSel.value = String(s.fontSize);
  if (!sizeSel.value) { sizeSel.append(el('option', { value: s.fontSize }, String(s.fontSize))); sizeSel.value = String(s.fontSize); }
  const preview = () => {
    s.theme = themeSel.value;
    s.fontFamily = `'${fontSel.value}', monospace`;
    s.fontSize = Number(sizeSel.value);
    applySettings();
  };
  [themeSel, fontSel, sizeSel].forEach((x) => x.addEventListener('change', preview));
  const langList = el('select', { size: 12, class: 'sc-list' }, el('option', {}, 'Global Styles'), ...LANGUAGES.slice(1).map((l) => el('option', {}, l.name)));
  langList.selectedIndex = 0;
  const styleList = el('select', { size: 12, class: 'sc-list' }, ...['Global override', 'Default Style', 'Indent guideline style', 'Brace highlight style', 'Bad brace colour', 'Current line background colour', 'Selected text colour', 'Caret colour', 'Edge colour', 'Line number margin', 'Bookmark margin', 'Fold', 'Fold active', 'Fold margin', 'White space symbol', 'Smart Highlighting', 'Find Mark Style', 'Mark Style 1', 'Mark Style 2', 'Mark Style 3', 'Mark Style 4', 'Mark Style 5'].map((n) => el('option', {}, n)));
  styleList.selectedIndex = 1;
  const body = el('div', { class: 'sc' },
    el('div', { class: 'prow' }, el('label', {}, 'Select theme : '), themeSel),
    el('div', { class: 'sc-main' },
      el('div', {}, el('div', { class: 'sc-h' }, 'Language :'), langList),
      el('div', {}, el('div', { class: 'sc-h' }, 'Style :'), styleList),
      el('fieldset', { class: 'sc-font' }, el('legend', {}, 'Font Style'),
        el('div', { class: 'prow' }, el('label', {}, 'Font name :'), fontSel),
        el('div', { class: 'prow' }, el('label', {}, 'Font size :'), sizeSel),
        el('div', { class: 'sc-note' }, 'Font and theme apply to every language.'))));
  const d = new Dialog({
    title: 'Style Configurator', body, width: 640, modal: false,
    buttons: [
      { label: 'Save & Close', default: true, run: (dlg) => { preview(); dlg.close('ok'); } },
      { label: 'Cancel', value: null },
    ],
    onClose: (r) => { if (r !== 'ok') { Object.assign(s, orig); applySettings(); } },
  });
  d.show();
}

// ---------------------------------------------------------------- Shortcut Mapper

function shortcutMapperDialog() {
  const filter = el('input', { type: 'text', placeholder: 'Filter', class: 'w100' });
  const table = el('div', { class: 'sm-table' });
  let selected = null;
  const render = () => {
    table.innerHTML = '';
    table.append(el('div', { class: 'sm-row sm-head' }, el('span', {}, ''), el('span', {}, 'Name'), el('span', {}, 'Shortcut'), el('span', {}, 'Category')));
    const q = filter.value.toLowerCase();
    let i = 0;
    for (const [id, c] of Object.entries(COMMANDS)) {
      if (!c.label || c.hiddenInMapper) continue;
      const label = String(c.mapperLabel || val(c.label)).replace(/\.\.\.$/, '');
      const k = keyDisplay(c);
      if (q && !(`${label} ${k} ${c.category}`).toLowerCase().includes(q)) continue;
      i++;
      const r = el('div', { class: 'sm-row' + (selected === id ? ' sel' : '') + (App.settings.keys[id] !== undefined ? ' custom' : '') }, el('span', {}, String(i)), el('span', {}, label), el('span', {}, k), el('span', {}, c.category || ''));
      r.addEventListener('click', () => { selected = id; $$('.sm-row.sel', table).forEach((x) => x.classList.remove('sel')); r.classList.add('sel'); });
      r.addEventListener('dblclick', () => modify());
      table.append(r);
    }
  };
  const modify = () => {
    if (!selected) return;
    const c = COMMANDS[selected];
    const cap = el('input', { type: 'text', class: 'w100', readonly: true, value: keyDisplay(c), placeholder: 'Press a key combination' });
    const warn = el('div', { class: 'sm-warn' });
    let captured = null;
    cap.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') return;
      e.preventDefault();
      e.stopPropagation();
      const k = keyFromEvent(e);
      if (!k) return;
      captured = k;
      cap.value = k;
      const other = Object.entries(COMMANDS).find(([id, x]) => id !== selected && commandKeys(x, id).includes(k));
      warn.textContent = other ? `CONFLICT FOUND! Used by "${val(other[1].label)}"` : 'No shortcut conflicts for this item.';
    });
    new Dialog({
      title: 'Shortcut', width: 360, body: el('div', { class: 'form' }, el('label', { class: 'block' }, val(c.label)), cap, warn),
      buttons: [
        { label: 'OK', default: true, run: (dlg) => { if (captured) { App.settings.keys[selected] = captured; rebuildKeymap(); scheduleSession(); } dlg.close(); render(); } },
        { label: 'Cancel', value: null },
      ],
    }).show();
    setTimeout(() => cap.focus(), 0);
  };
  filter.addEventListener('input', render);
  render();
  new Dialog({
    title: 'Shortcut mapper', width: 700, className: 'sm-dlg',
    body: el('div', { class: 'sm' }, filter, table),
    buttons: [
      { label: 'Modify', run: () => modify() },
      { label: 'Clear', run: () => { if (selected) { App.settings.keys[selected] = ''; rebuildKeymap(); scheduleSession(); render(); } } },
      { label: 'Reset', run: () => { if (selected) { delete App.settings.keys[selected]; rebuildKeymap(); scheduleSession(); render(); } } },
      { label: 'Close', default: true, value: null },
    ],
  }).show();
}

// ---------------------------------------------------------------- Window list

function windowsDialog() {
  const table = el('div', { class: 'win-table' });
  let selected = new Set([App.active.id]);
  let sortKey = null, sortDir = 1;
  const rowsData = () => {
    const rows = App.tabs.map((t) => ({ t, name: t.title, path: t.path ? dirname(t.path) : '', type: langOf(t).name, size: t.doc.getValue().length }));
    if (sortKey) rows.sort((a, b) => (a[sortKey] > b[sortKey] ? 1 : a[sortKey] < b[sortKey] ? -1 : 0) * sortDir);
    return rows;
  };
  const render = () => {
    table.innerHTML = '';
    const head = el('div', { class: 'win-row win-head' });
    for (const [k, l] of [['name', 'Name'], ['path', 'Path'], ['type', 'Type'], ['size', 'Size']]) {
      head.append(el('span', { onclick: () => { sortDir = sortKey === k ? -sortDir : 1; sortKey = k; render(); } }, l));
    }
    table.append(head);
    for (const r of rowsData()) {
      const row = el('div', { class: 'win-row' + (selected.has(r.t.id) ? ' sel' : '') }, el('span', {}, (isDirty(r.t) ? '*' : '') + r.name), el('span', {}, r.path), el('span', {}, r.type), el('span', {}, fmtNum(r.size)));
      row.addEventListener('click', (e) => {
        if (!(e.ctrlKey || e.metaKey)) selected = new Set();
        selected.has(r.t.id) ? selected.delete(r.t.id) : selected.add(r.t.id);
        render();
      });
      row.addEventListener('dblclick', () => { activateTab(r.t); d.close(); });
      table.append(row);
    }
  };
  const chosen = () => App.tabs.filter((t) => selected.has(t.id));
  render();
  const d = new Dialog({
    title: 'Windows', body: table, width: 720, className: 'win-dlg',
    buttons: [
      { label: 'Activate', default: true, run: (dlg) => { const c = chosen(); if (c[0]) activateTab(c[0]); dlg.close(); } },
      { label: 'Save', run: async () => { for (const t of chosen()) await saveTab(t); render(); } },
      { label: 'Close window(s)', run: async () => { await closeTabs(chosen()); selected = new Set([App.active.id]); render(); } },
      { label: 'Sort tabs', run: () => { App.tabs = rowsData().map((r) => r.t); renderTabs(); renderDocList(); } },
      { label: 'OK', value: null },
    ],
  });
  d.show();
}

// ---------------------------------------------------------------- Plugins admin

function pluginsAdminDialog() {
  const rows = [
    ['MIME Tools', '3.1', 'Base64 and URL encode/decode of the selection. Built in.'],
    ['Converter', '4.6', 'ASCII <-> HEX conversion of the selection. Built in.'],
    ['NppExport', '0.4', 'Export the current document to HTML with its syntax colours. Built in.'],
  ];
  const table = el('div', { class: 'win-table' }, el('div', { class: 'win-row win-head plug' }, el('span', {}, 'Plugin'), el('span', {}, 'Version'), el('span', {}, 'Description')),
    ...rows.map((r) => el('div', { class: 'win-row plug' }, ...r.map((c) => el('span', {}, c)))));
  const tabs = el('div', { class: 'ftabs' }, el('div', { class: 'ftab' }, 'Available'), el('div', { class: 'ftab' }, 'Updates'), el('div', { class: 'ftab active' }, 'Installed'), el('div', { class: 'ftab' }, 'Incompatible'));
  new Dialog({ title: 'Plugins Admin', width: 640, body: el('div', {}, tabs, table), buttons: [{ label: 'Close', default: true, value: null }] }).show();
}

// ---------------------------------------------------------------- Run

function runDialog() {
  const vars = () => {
    const t = App.active;
    return {
      FULL_CURRENT_PATH: t.path || '', CURRENT_DIRECTORY: t.path ? dirname(t.path) : '', FILE_NAME: t.path ? basename(t.path) : t.title,
      NAME_PART: (t.path ? basename(t.path) : t.title).replace(/\.[^.]*$/, ''), EXT_PART: t.path ? '.' + extname(t.path) : '',
      CURRENT_WORD: wordAtCursorOrSelection(), CURRENT_LINE: String(App.cm.getCursor().line + 1), CURRENT_COLUMN: String(App.cm.getCursor().ch + 1),
    };
  };
  const input = el('input', { type: 'text', class: 'w100', list: 'run-hist', value: (App.settings.runHistory || [])[0] || 'https://www.google.com/search?q=$(CURRENT_WORD)' });
  const dl = el('datalist', { id: 'run-hist' }, ...(App.settings.runHistory || []).map((v) => el('option', { value: v })));
  const body = el('div', { class: 'form' }, dl,
    el('label', { class: 'block' }, 'The URL to open :'), input,
    el('div', { class: 'note' }, 'Variables: $(FULL_CURRENT_PATH) $(CURRENT_DIRECTORY) $(FILE_NAME) $(NAME_PART) $(EXT_PART) $(CURRENT_WORD) $(CURRENT_LINE) $(CURRENT_COLUMN). Values are URL-encoded. Use preview: to open a local file through the server.'));
  new Dialog({
    title: 'Run...', body, width: 520,
    buttons: [
      { label: 'Run', default: true, run: (dlg) => {
        const v = vars();
        let url = input.value.replace(/\$\((\w+)\)/g, (a, k) => (k in v ? encodeURIComponent(v[k]) : a));
        if (url.startsWith('preview:')) url = '/preview' + decodeURIComponent(url.slice(8));
        App.settings.runHistory = [input.value, ...(App.settings.runHistory || []).filter((x) => x !== input.value)].slice(0, 10);
        window.open(url, '_blank', 'noopener');
        dlg.close();
      } },
      { label: 'Cancel', value: null },
    ],
  }).show();
}

// ---------------------------------------------------------------- Macros

function saveMacroDialog() {
  if (!App.macro.last || !App.macro.last.length) return;
  inputBox('Save Current Recorded Macro', 'Name :', `Macro ${App.settings.macros.length + 1}`).then((name) => {
    if (!name) return;
    App.settings.macros.push({ name, actions: App.macro.last });
    scheduleSession();
  });
}

function runMacroMultipleDialog() {
  const macros = [{ name: 'Current recorded macro', actions: App.macro.last }, ...App.settings.macros].filter((m) => m.actions && m.actions.length);
  if (!macros.length) return;
  const sel = el('select', {}, ...macros.map((m, i) => el('option', { value: i }, m.name)));
  const timesR = el('input', { type: 'radio', name: 'mm', checked: true });
  const eofR = el('input', { type: 'radio', name: 'mm' });
  const times = el('input', { type: 'number', value: '1', min: '1', class: 'num' });
  const body = el('div', { class: 'form' },
    el('div', { class: 'prow' }, el('label', {}, 'Macro to run :'), sel),
    el('label', { class: 'chk' }, timesR, ' Run ', times, ' times'),
    el('label', { class: 'chk' }, eofR, ' Run until the end of file'));
  new Dialog({
    title: 'Run a Macro Multiple Times', body, width: 360,
    buttons: [
      { label: 'Run', default: true, run: (dlg) => {
        const m = macros[Number(sel.value)];
        dlg.close();
        if (eofR.checked) {
          const doc = App.cm.getDoc();
          for (let i = 0; i < 100000; i++) {
            const before = doc.getCursor();
            playMacro(m.actions);
            const after = doc.getCursor();
            if (after.line >= doc.lastLine() || (after.line === before.line && after.ch === before.ch)) break;
          }
        } else {
          const n = Math.max(1, Number(times.value) || 1);
          App.cm.operation(() => { for (let i = 0; i < n; i++) playMacro(m.actions); });
        }
      } },
      { label: 'Cancel', value: null },
    ],
  }).show();
}

function toggleRecording() {
  const M = App.macro;
  if (M.recording) {
    M.recording = false;
    M.last = M.current;
    M.current = null;
  } else {
    M.recording = true;
    M.current = [];
  }
  document.body.classList.toggle('recording', M.recording);
  updateToolbarState();
}

function playMacro(actions = App.macro.last) {
  if (!actions) return;
  const cm = App.cm;
  const maps = () => [...(cm.state.keyMaps || []), cm.getOption('extraKeys'), cm.getOption('keyMap')];
  for (const a of actions) {
    if (a.t === 'text') cm.replaceSelection(a.v, 'end', '+input');
    else if (a.t === 'cmd') runCommand(a.v, { fromMacro: true });
    else if (a.t === 'key') {
      for (const m of maps()) {
        if (!m) continue;
        const r = CodeMirror.lookupKey(a.v, m, (b) => {
          if (typeof b === 'string') cm.execCommand(b); else b(cm);
          return true;
        });
        if (r === 'handled') break;
      }
    }
  }
}

// ---------------------------------------------------------------- printing and HTML export

function highlightedHtml(tab, { lineNumbers = true } = {}) {
  const text = tab.doc.getValue();
  const mode = CodeMirror.getMode({ indentUnit: App.settings.tabSize }, modeOf(tab.lang));
  const lines = [''];
  CodeMirror.runMode(text, mode, (tok, style) => {
    if (tok === '\n') { lines.push(''); return; }
    const t = escapeHtml(tok);
    lines[lines.length - 1] += style ? `<span class="${style.split(' ').map((x) => 'cm-' + x).join(' ')}">${t}</span>` : t;
  });
  const w = String(lines.length).length;
  return lines.map((l, i) => (lineNumbers ? `<span class="ln">${String(i + 1).padStart(w, ' ')}</span>` : '') + l).join('\n');
}

const EXPORT_CSS = `body{margin:0;background:#fff}pre{font:10pt 'Courier New',monospace;tab-size:${4};white-space:pre-wrap;margin:8px}
.ln{color:#808080;background:#e4e4e4;display:inline-block;padding-right:6px;margin-right:6px;user-select:none}
.cm-keyword{color:#00f;font-weight:bold}.cm-atom{color:#8000ff}.cm-number{color:#ff8000}.cm-def{color:#000}.cm-variable-2,.cm-variable-3,.cm-type{color:#8000ff}
.cm-property{color:#000}.cm-operator{color:#000080;font-weight:bold}.cm-comment{color:#008000}.cm-string,.cm-string-2{color:#808080}.cm-meta{color:#804000}
.cm-qualifier{color:#ff0000}.cm-builtin{color:#8000ff}.cm-bracket{color:#00f}.cm-tag{color:#00f}.cm-attribute{color:#f00}.cm-header{color:#000080;font-weight:bold}
.cm-quote{color:#008000}.cm-hr{color:#999}.cm-link{color:#00f;text-decoration:underline}.cm-error{color:#f00}`;

function printDocument(tab = App.active) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(tab.path || tab.title)}</title><style>${EXPORT_CSS}
@page{margin:15mm}.hdr{font:9pt Arial;color:#444;border-bottom:1px solid #999;margin:0 8px;padding-bottom:2px;display:flex;justify-content:space-between}</style></head>
<body><div class="hdr"><span>${escapeHtml(tab.path || tab.title)}</span><span>${new Date().toLocaleString()}</span></div><pre>${highlightedHtml(tab)}</pre></body></html>`;
  const frame = el('iframe', { style: { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' } });
  document.body.append(frame);
  frame.contentDocument.open();
  frame.contentDocument.write(html);
  frame.contentDocument.close();
  setTimeout(() => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1000);
  }, 100);
}

async function exportHtml(tab = App.active) {
  const name = (tab.path ? basename(tab.path) : tab.title) + '.html';
  const p = await fileDialog({ mode: 'save', title: 'Export to HTML', dir: defaultDir(), fileName: name, saveType: 'html' });
  if (!p) return;
  const html = `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>${escapeHtml(tab.path || tab.title)}</title>\n<style>${EXPORT_CSS}</style>\n</head>\n<body>\n<pre>${highlightedHtml(tab, { lineNumbers: false })}</pre>\n</body>\n</html>\n`;
  try { await api.post('write', { path: p, content: html }); } catch (err) { msgBox(err.message, { icon: 'error' }); }
}

async function copyHtml(tab = App.active) {
  const html = `<pre style="font-family:'Courier New',monospace">${highlightedHtml(tab, { lineNumbers: false })}</pre>`;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([`<style>${EXPORT_CSS}</style>` + html], { type: 'text/html' }), 'text/plain': new Blob([tab.doc.getValue()], { type: 'text/plain' }) })]);
  } catch { copyText(tab.doc.getValue()); }
}
