'use strict';
// Find / Replace / Find in Files / Mark, plus the Search results panel.

const FindState = {
  what: '', replace: '', mode: 'normal', matchCase: false, wholeWord: false, wrap: true, backward: false,
  dotAll: false, inSelection: false, bookmarkLine: false, purge: false,
  fifDir: '', fifFilters: '*.*', fifSub: true, fifHidden: false, fifFollow: false,
  transparency: false, transMode: 'blur', transValue: 70,
};

// ---------------------------------------------------------------- regex building

function unescapeExtended(s) {
  return s.replace(/\\(?:x([0-9a-fA-F]{2})|u([0-9a-fA-F]{4})|o([0-7]{3})|d(\d{3})|b([01]{8})|(.))/g, (all, x, u, o, d, b, c) => {
    if (x) return String.fromCharCode(parseInt(x, 16));
    if (u) return String.fromCharCode(parseInt(u, 16));
    if (o) return String.fromCharCode(parseInt(o, 8));
    if (d) return String.fromCharCode(parseInt(d, 10));
    if (b) return String.fromCharCode(parseInt(b, 2));
    return { n: '\n', r: '\r', t: '\t', 0: '\0', '\\': '\\' }[c] ?? '\\' + c;
  });
}

// Builds the JS RegExp for a search. Throws on invalid regular expressions.
function buildRegex(o, extraFlags = '') {
  let src;
  if (o.mode === 'regex') {
    src = o.what.replace(/\\r\\n/g, '\\n').replace(/\\</g, '\\b(?=\\w)').replace(/\\>/g, '\\b(?<=\\w)');
  } else {
    let t = o.mode === 'extended' ? unescapeExtended(o.what) : o.what;
    t = t.replace(/\r\n?/g, '\n');
    src = escapeRegExp(t);
  }
  if (o.wholeWord) src = '(?<![\\w])(?:' + src + ')(?![\\w])';
  let flags = 'gm' + (o.matchCase ? '' : 'i') + (o.mode === 'regex' && o.dotAll ? 's' : '') + extraFlags;
  return new RegExp(src, flags);
}

// Expands a replacement for one regex match (m is a RegExp exec result).
function expandReplacement(rep, m, mode) {
  if (mode === 'normal') return rep;
  if (mode === 'extended') return unescapeExtended(rep);
  let out = '', caseMode = null, nextCase = null;
  const push = (str) => {
    for (const ch of str || '') {
      let c = ch;
      if (caseMode === 'U') c = c.toUpperCase();
      else if (caseMode === 'L') c = c.toLowerCase();
      if (nextCase) { c = nextCase === 'u' ? c.toUpperCase() : c.toLowerCase(); nextCase = null; }
      out += c;
    }
  };
  for (let i = 0; i < rep.length; i++) {
    const c = rep[i];
    if (c === '\\' && i + 1 < rep.length) {
      const n = rep[++i];
      if (/\d/.test(n)) push(m[Number(n)]);
      else if (n === 'n') push('\n');
      else if (n === 't') push('\t');
      else if (n === 'r') push('\r');
      else if (n === 'U' || n === 'L') caseMode = n;
      else if (n === 'E') caseMode = null;
      else if (n === 'u' || n === 'l') nextCase = n;
      else push(n);
    } else if (c === '$' && i + 1 < rep.length) {
      const rest = rep.slice(i + 1);
      let mm;
      if (rest[0] === '$') { push('$'); i++; }
      else if (rest[0] === '&') { push(m[0]); i++; }
      else if ((mm = rest.match(/^\{(\w+)\}/))) {
        push(/^\d+$/.test(mm[1]) ? m[Number(mm[1])] : (m.groups || {})[mm[1]]);
        i += mm[0].length;
      } else if ((mm = rest.match(/^\d{1,2}/))) {
        let g = mm[0];
        if (Number(g) >= m.length && g.length > 1) g = g[0];
        push(m[Number(g)]);
        i += g.length;
      } else push('$');
    } else {
      push(c);
    }
  }
  return out;
}

// Converts a NoteplusPP replacement into a String.replace replacement string (used server-side).
function jsReplacementFor(rep, mode) {
  if (mode === 'normal') return rep.replace(/\$/g, '$$$$');
  if (mode === 'extended') return unescapeExtended(rep).replace(/\$/g, '$$$$');
  return rep.replace(/\\(\d)|\\n|\\t|\\r|\\\\|\$0|\$\{(\d+)\}/g, (all, d, br) => {
    if (d) return '$' + d;
    if (br) return '$' + br;
    return { '\\n': '\n', '\\t': '\t', '\\r': '\r', '\\\\': '\\', '$0': '$&' }[all];
  });
}

function allMatches(re, text, from = 0, to = text.length) {
  const out = [];
  re.lastIndex = from;
  let m;
  while ((m = re.exec(text))) {
    if (m.index >= to) break;
    if (m.index + m[0].length > to) break;
    out.push(m);
    if (m[0].length === 0) re.lastIndex++;
    if (out.length > 500000) break;
  }
  return out;
}

// ---------------------------------------------------------------- operations on the active doc

const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 >> 3) ^ 1 && n % 10] || 'th');

function setFindStatus(msg, kind = 'info') {
  App.lastFindStatus = msg;
  if (FindDlg.status) {
    FindDlg.status.textContent = msg;
    FindDlg.status.className = 'find-status ' + kind;
  }
  if (msg && (!FindDlg.dialog || !FindDlg.dialog.visible)) flashStatus(msg, kind);
}

function flashStatus(msg, kind) {
  let n = $('#flash');
  if (!n) { n = el('div', { id: 'flash' }); $('#app').append(n); }
  n.textContent = msg;
  n.className = kind;
  clearTimeout(flashStatus.t);
  n.style.display = 'block';
  flashStatus.t = setTimeout(() => { n.style.display = 'none'; }, 2500);
}

function safeRegex(o) {
  try { return buildRegex(o); } catch (err) {
    setFindStatus(`Find: Invalid regular expression`, 'error');
    return null;
  }
}

function findNext(o = FindState, backward = o.backward, { quiet = false, label = 'Find' } = {}) {
  if (!o.what) return false;
  const re = safeRegex(o);
  if (!re) return false;
  const cm = App.cm, doc = cm.getDoc();
  const text = doc.getValue();
  const selFrom = doc.indexFromPos(doc.getCursor('from'));
  const selTo = doc.indexFromPos(doc.getCursor('to'));
  let m = null, wrapped = false;
  if (!backward) {
    re.lastIndex = selTo;
    m = re.exec(text);
    if (m && m[0].length === 0 && m.index === selTo && selFrom === selTo) { re.lastIndex = selTo + 1; m = re.exec(text); }
    if (!m && o.wrap) { re.lastIndex = 0; m = re.exec(text); wrapped = !!m; }
  } else {
    const before = allMatches(re, text, 0, selFrom).filter((x) => x.index < selFrom);
    m = before[before.length - 1] || null;
    if (!m && o.wrap) {
      const all = allMatches(re, text);
      m = all[all.length - 1] || null;
      wrapped = !!m;
    }
  }
  if (!m) {
    setFindStatus(`${label}: Can't find the text "${o.what}"`, 'error');
    if (!quiet) beep();
    return false;
  }
  const from = doc.posFromIndex(m.index), to = doc.posFromIndex(m.index + m[0].length);
  doc.setSelection(from, to);
  cm.scrollIntoView({ from, to }, cm.getScrollInfo().clientHeight / 3);
  if (wrapped) setFindStatus(backward ? `${label}: Found the 1st occurrence from the bottom. The beginning of the document has been reached.` : `${label}: Found the 1st occurrence from the top. The end of the document has been reached.`, 'warn');
  else setFindStatus('', 'info');
  return true;
}

function beep() {
  const w = App.cm.getWrapperElement();
  w.classList.remove('beep');
  void w.offsetWidth;
  w.classList.add('beep');
}

function searchRange(o, doc) {
  if (o.inSelection && doc.somethingSelected()) {
    return [doc.indexFromPos(doc.getCursor('from')), doc.indexFromPos(doc.getCursor('to'))];
  }
  return null;
}

function countMatches(o = FindState) {
  const re = safeRegex(o);
  if (!re || !o.what) return;
  const doc = App.active.doc;
  const text = doc.getValue();
  const rng = searchRange(o, doc);
  const n = allMatches(re, text, rng ? rng[0] : 0, rng ? rng[1] : text.length).length;
  setFindStatus(`Count: ${fmtNum(n)} match${n === 1 ? '' : 'es'} in ${rng ? 'selected text' : 'entire file'}`, n ? 'info' : 'error');
}

function replaceOne(o = FindState) {
  const re = safeRegex(o);
  if (!re || !o.what) return;
  const cm = App.cm, doc = cm.getDoc();
  if (cm.getOption('readOnly')) return;
  if (doc.somethingSelected()) {
    const from = doc.indexFromPos(doc.getCursor('from'));
    const to = doc.indexFromPos(doc.getCursor('to'));
    const text = doc.getValue();
    re.lastIndex = from;
    const m = re.exec(text);
    if (m && m.index === from && m.index + m[0].length === to) {
      const rep = expandReplacement(o.replace, m, o.mode);
      doc.replaceSelection(rep, 'start');
      const end = doc.posFromIndex(from + rep.length);
      doc.setCursor(o.backward ? doc.posFromIndex(from) : end);
      const found = findNext(o, o.backward, { label: 'Replace', quiet: true });
      setFindStatus(found ? 'Replace: 1 occurrence was replaced. The next occurrence found.' : 'Replace: 1 occurrence was replaced. No more occurrences were found.', found ? 'info' : 'warn');
      return;
    }
  }
  findNext(o, o.backward, { label: 'Replace' });
}

function replaceAllIn(tab, o) {
  const re = buildRegex(o);
  const doc = tab.doc;
  const text = doc.getValue();
  const rng = tab === App.active ? searchRange(o, doc) : null;
  const matches = allMatches(re, text, rng ? rng[0] : 0, rng ? rng[1] : text.length);
  if (!matches.length) return 0;
  if (matches.length > 3000) {
    let out = '', last = 0;
    for (const m of matches) { out += text.slice(last, m.index) + expandReplacement(o.replace, m, o.mode); last = m.index + m[0].length; }
    out += text.slice(last);
    doc.replaceRange(out, doc.posFromIndex(0), doc.posFromIndex(text.length), '+replace');
  } else {
    const edits = matches.map((m) => ({ from: doc.posFromIndex(m.index), to: doc.posFromIndex(m.index + m[0].length), text: expandReplacement(o.replace, m, o.mode) }));
    const run = () => { for (let i = edits.length - 1; i >= 0; i--) doc.replaceRange(edits[i].text, edits[i].from, edits[i].to, '+replace'); };
    if (tab === App.active) App.cm.operation(run); else run();
  }
  return matches.length;
}

function replaceAll(o = FindState) {
  if (!o.what || !safeRegex(o)) return;
  if (App.active.readOnly || App.active.monitoring) { setFindStatus('Replace All: Cannot replace text. The current document is read only.', 'error'); return; }
  const n = replaceAllIn(App.active, o);
  setFindStatus(`Replace All: ${fmtNum(n)} occurrence${n === 1 ? ' was' : 's were'} replaced in ${o.inSelection ? 'selected text' : 'entire file'}.`, n ? 'info' : 'error');
}

function replaceAllOpenDocs(o = FindState) {
  if (!o.what || !safeRegex(o)) return;
  let total = 0;
  for (const t of App.tabs) if (!t.readOnly && !t.monitoring) total += replaceAllIn(t, { ...o, inSelection: false });
  setFindStatus(`Replace in Opened Files: ${fmtNum(total)} occurrence${total === 1 ? ' was' : 's were'} replaced.`, total ? 'info' : 'error');
}

function markAll(o = FindState) {
  const re = safeRegex(o);
  if (!re || !o.what) return;
  const tab = App.active, doc = tab.doc, cm = App.cm;
  if (o.purge) clearMarks();
  const text = doc.getValue();
  const rng = searchRange(o, doc);
  const matches = allMatches(re, text, rng ? rng[0] : 0, rng ? rng[1] : text.length);
  cm.operation(() => {
    for (const m of matches) {
      if (!m[0].length) continue;
      const from = doc.posFromIndex(m.index), to = doc.posFromIndex(m.index + m[0].length);
      tab.marks.push(doc.markText(from, to, { className: 'npp-mark', clearWhenEmpty: true }));
      if (o.bookmarkLine) for (let l = from.line; l <= to.line; l++) cm.setGutterMarker(l, 'npp-bookmarks', bookmarkMarker());
    }
  });
  setFindStatus(`Mark: ${fmtNum(matches.length)} match${matches.length === 1 ? '' : 'es'} in ${rng ? 'selected text' : 'entire file'}`, matches.length ? 'info' : 'error');
}

function clearMarks() {
  const tab = App.active;
  App.cm.operation(() => { for (const m of tab.marks) m.clear(); });
  tab.marks = [];
  setFindStatus('', 'info');
}

function copyMarkedText() {
  const tab = App.active;
  const parts = tab.marks.map((m) => m.find()).filter(Boolean).sort((a, b) => CodeMirror.cmpPos(a.from, b.from)).map((r) => tab.doc.getRange(r.from, r.to));
  copyText(parts.join(tab.eol));
}

// Style tokens (Search > Style All Occurrences of Token).
function styleToken(n, allOccurrences = true) {
  const cm = App.cm, doc = cm.getDoc(), tab = App.active;
  tab.styles = tab.styles || {};
  let word = cm.getSelection();
  let from = cm.getCursor('from'), to = cm.getCursor('to');
  if (!word) {
    const r = cm.findWordAt(cm.getCursor());
    word = doc.getRange(r.anchor, r.head);
    from = r.anchor; to = r.head;
  }
  if (!word || !word.trim()) return;
  const list = tab.styles[n] = tab.styles[n] || [];
  if (!allOccurrences) {
    list.push(doc.markText(from, to, { className: `npp-style${n}` }));
    return;
  }
  const re = new RegExp((/^\w/.test(word) ? '\\b' : '') + escapeRegExp(word) + (/\w$/.test(word) ? '\\b' : ''), 'g');
  const text = doc.getValue();
  cm.operation(() => {
    for (const m of allMatches(re, text)) list.push(doc.markText(doc.posFromIndex(m.index), doc.posFromIndex(m.index + m[0].length), { className: `npp-style${n}` }));
  });
}

function clearStyle(n) {
  const tab = App.active;
  if (!tab.styles) return;
  const keys = n === 'all' ? Object.keys(tab.styles) : [n];
  App.cm.operation(() => { for (const k of keys) { (tab.styles[k] || []).forEach((m) => m.clear()); tab.styles[k] = []; } });
}

function jumpToStyle(dir, n) {
  const tab = App.active, cm = App.cm;
  const ranges = [];
  const keys = n == null ? Object.keys(tab.styles || {}) : [n];
  for (const k of keys) for (const m of (tab.styles || {})[k] || []) { const r = m.find(); if (r) ranges.push(r); }
  ranges.sort((a, b) => CodeMirror.cmpPos(a.from, b.from));
  if (!ranges.length) return;
  const cur = cm.getCursor(dir > 0 ? 'to' : 'from');
  let r = dir > 0 ? ranges.find((x) => CodeMirror.cmpPos(x.from, cur) >= 0) : [...ranges].reverse().find((x) => CodeMirror.cmpPos(x.to, cur) <= 0);
  if (!r) r = dir > 0 ? ranges[0] : ranges[ranges.length - 1];
  cm.setSelection(r.from, r.to);
  cm.scrollIntoView(r, 100);
}

function wordAtCursorOrSelection() {
  const cm = App.cm;
  if (cm.somethingSelected()) return cm.getSelection();
  const r = cm.findWordAt(cm.getCursor());
  return cm.getRange(r.anchor, r.head).trim();
}

function selectAndFindNext(backward) {
  const w = wordAtCursorOrSelection();
  if (!w || w.includes('\n')) return;
  FindState.what = w;
  FindState.mode = 'normal';
  if (!App.cm.somethingSelected()) {
    const r = App.cm.findWordAt(App.cm.getCursor());
    App.cm.setSelection(r.anchor, r.head);
  }
  addHistory('findHistory', w);
  findNext({ ...FindState, wrap: true }, backward);
}

function findVolatile(backward) {
  const w = wordAtCursorOrSelection();
  if (!w || w.includes('\n')) return;
  if (!App.cm.somethingSelected()) {
    const r = App.cm.findWordAt(App.cm.getCursor());
    App.cm.setSelection(r.anchor, r.head);
  }
  findNext({ what: w, mode: 'normal', matchCase: false, wholeWord: false, wrap: true }, backward);
}

function addHistory(key, v) {
  if (!v) return;
  const h = App.settings[key] || [];
  App.settings[key] = [v, ...h.filter((x) => x !== v)].slice(0, 20);
}

// ---------------------------------------------------------------- Search results panel

const Results = { blocks: [], hits: [], current: -1, el: null };

function searchDocsForResults(o, tabs) {
  const re = safeRegex(o);
  if (!re) return null;
  const files = [];
  let hits = 0;
  for (const t of tabs) {
    const doc = t.doc;
    const lines = [];
    const text = doc.getValue();
    for (const m of allMatches(re, text)) {
      const from = doc.posFromIndex(m.index), to = doc.posFromIndex(m.index + m[0].length);
      const endCh = to.line === from.line ? to.ch : doc.getLine(from.line).length;
      const prev = lines[lines.length - 1];
      if (prev && prev.line === from.line) prev.ranges.push([from.ch, endCh]);
      else lines.push({ line: from.line, text: doc.getLine(from.line), ranges: [[from.ch, endCh]] });
      hits++;
    }
    if (lines.length) files.push({ tabId: t.id, path: t.path || t.title, hits: lines.reduce((a, l) => a + l.ranges.length, 0), lines });
  }
  return { files, hits, searched: tabs.length };
}

function findAllInDocs(o = FindState, tabs = [App.active]) {
  if (!o.what) return;
  const r = searchDocsForResults(o, tabs);
  if (!r) return;
  addResultsBlock(o.what, r.files, r.hits, r.searched);
  setFindStatus(`Find All: ${fmtNum(r.hits)} hit${r.hits === 1 ? '' : 's'} in ${tabs.length === 1 ? 'current document' : r.files.length + ' document(s)'}`, r.hits ? 'info' : 'error');
}

async function findInFiles(o = FindState) {
  if (!o.what) return;
  let re;
  try { re = buildRegex(o); } catch { setFindStatus('Find in Files: Invalid regular expression', 'error'); return; }
  const dir = o.fifDir || defaultDir();
  setFindStatus('Find in Files: searching...', 'info');
  try {
    const r = await api.post('find', { dir, filters: o.fifFilters, source: re.source, flags: re.flags, subfolders: o.fifSub, hidden: o.fifHidden });
    const files = r.results.map((f) => ({ path: f.path, hits: f.hits, lines: f.lines }));
    addResultsBlock(o.what, files, r.hits, r.searched);
    setFindStatus(`Find in Files: ${fmtNum(r.hits)} hit${r.hits === 1 ? '' : 's'} in ${fmtNum(files.length)} file${files.length === 1 ? '' : 's'} of ${fmtNum(r.searched)} searched`, r.hits ? 'info' : 'error');
  } catch (err) {
    setFindStatus('Find in Files: ' + err.message, 'error');
  }
}

async function replaceInFiles(o = FindState) {
  if (!o.what) return;
  let re;
  try { re = buildRegex(o); } catch { setFindStatus('Replace in Files: Invalid regular expression', 'error'); return; }
  const dir = o.fifDir || defaultDir();
  const ans = await msgBox(`Are you sure you want to replace all occurrences in :\n${dir}\nfor file type :\n${o.fifFilters || '*.*'}`, { title: 'Are you sure?', icon: 'question', buttons: ['OK', 'Cancel'], defaultButton: 'Cancel' });
  if (ans !== 'OK') return;
  try {
    const r = await api.post('replace', { dir, filters: o.fifFilters, source: re.source, flags: re.flags, subfolders: o.fifSub, hidden: o.fifHidden, replacement: jsReplacementFor(o.replace, o.mode) });
    setFindStatus(`Replace in Files: ${fmtNum(r.count)} occurrence${r.count === 1 ? ' was' : 's were'} replaced in ${fmtNum(r.files)} file(s).`, r.count ? 'info' : 'error');
    for (const t of App.tabs) if (t.path && !isDirty(t) && t.path.startsWith(dir)) await reloadTab(t, { ask: false });
  } catch (err) {
    setFindStatus('Replace in Files: ' + err.message, 'error');
  }
}

function addResultsBlock(what, files, hits, searched) {
  Results.blocks.unshift({ what, files, hits, searched, collapsed: false });
  Results.blocks.forEach((b, i) => { if (i > 0) b.collapsed = true; });
  Results.current = -1;
  showResultsPanel();
}

function renderHitText(text, ranges) {
  const frag = document.createDocumentFragment();
  let last = 0;
  const lead = text.match(/^\s*/)[0].length;
  const shown = text.slice(lead);
  for (const [s, e] of ranges) {
    const ss = Math.max(s - lead, 0), ee = Math.max(e - lead, 0);
    if (ss < last) continue;
    frag.append(shown.slice(last, ss), el('span', { class: 'sr-hit' }, shown.slice(ss, ee)));
    last = ee;
  }
  frag.append(shown.slice(last));
  return frag;
}

function showResultsPanel() {
  const root = el('div', { class: 'sr', tabindex: '0' });
  Results.hits = [];
  Results.blocks.forEach((b, bi) => {
    const head = el('div', { class: 'sr-search' + (b.collapsed ? ' collapsed' : '') },
      el('span', { class: 'sr-tog' }, b.collapsed ? '+' : '−'),
      `Search "${b.what}" (${fmtNum(b.hits)} hit${b.hits === 1 ? '' : 's'} in ${b.files.length} file${b.files.length === 1 ? '' : 's'} of ${b.searched} searched)`);
    head.addEventListener('click', () => { b.collapsed = !b.collapsed; showResultsPanel(); });
    root.append(head);
    if (b.collapsed) return;
    for (const f of b.files) {
      const fh = el('div', { class: 'sr-file' + (f.collapsed ? ' collapsed' : '') }, el('span', { class: 'sr-tog' }, f.collapsed ? '+' : '−'), `${f.path} (${f.hits} hit${f.hits === 1 ? '' : 's'})`);
      fh.addEventListener('click', () => { f.collapsed = !f.collapsed; showResultsPanel(); });
      root.append(fh);
      if (f.collapsed) continue;
      for (const l of f.lines) {
        const idx = Results.hits.length;
        const row = el('div', { class: 'sr-line' }, el('span', { class: 'sr-ln' }, `Line ${l.line + 1}: `), renderHitText(l.text, l.ranges));
        const hit = { file: f, line: l, row };
        Results.hits.push(hit);
        if (bi === 0 && idx === Results.current) row.classList.add('current');
        row.addEventListener('click', () => { $$('.sr-line.sel', root).forEach((x) => x.classList.remove('sel')); row.classList.add('sel'); });
        row.addEventListener('dblclick', () => openHit(idx));
        root.append(row);
      }
    }
  });
  root.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    Menu.open([
      { label: 'Collapse all', run: () => { Results.blocks.forEach((b) => (b.collapsed = true)); showResultsPanel(); } },
      { label: 'Uncollapse all', run: () => { Results.blocks.forEach((b) => { b.collapsed = false; b.files.forEach((f) => (f.collapsed = false)); }); showResultsPanel(); } },
      '-',
      { label: 'Copy', run: () => copyText($$('.sr-line.sel', root).map((r) => r.textContent).join('\n') || window.getSelection().toString()) },
      { label: 'Copy Pathname(s)', run: () => copyText([...new Set(Results.blocks.flatMap((b) => b.files.map((f) => f.path)))].join('\n')) },
      { label: 'Select all', run: () => $$('.sr-line', root).forEach((r) => r.classList.add('sel')) },
      { label: 'Clear all', run: () => { Results.blocks = []; showResultsPanel(); } },
      '-',
      { label: 'Open all', run: () => { for (const b of Results.blocks) for (const f of b.files) if (!f.tabId) openFile(f.path, { activate: false, silent: true }); } },
      '-',
      { label: 'Close', run: () => hideBottomPanel() },
    ], e.clientX, e.clientY);
  });
  const total = Results.blocks.reduce((a, b) => a + b.hits, 0);
  showBottomPanel(`Search results - (${fmtNum(Results.blocks[0] ? Results.blocks[0].hits : 0)} hits)`, root, 'results');
  Results.el = root;
  void total;
}

async function openHit(idx) {
  const hit = Results.hits[idx];
  if (!hit) return;
  Results.current = idx;
  $$('.sr-line.current', Results.el).forEach((x) => x.classList.remove('current'));
  hit.row.classList.add('current');
  hit.row.scrollIntoView({ block: 'nearest' });
  const { file, line } = hit;
  let tab = file.tabId && App.tabs.find((t) => t.id === file.tabId);
  if (tab) activateTab(tab);
  else tab = await openFile(file.path);
  if (!tab) return;
  const [s, e] = line.ranges[0];
  gotoPos(line.line, s, e);
}

function nextResult(dir) {
  if (!Results.hits.length) return;
  let i = Results.current + dir;
  if (i < 0) i = Results.hits.length - 1;
  if (i >= Results.hits.length) i = 0;
  openHit(i);
}

// ---------------------------------------------------------------- Find dialog

const FindDlg = { dialog: null, tab: 'find', status: null, fields: {} };

function openFindDialog(tab = 'find') {
  const cm = App.cm;
  if (!FindDlg.dialog) buildFindDialog();
  const f = FindDlg.fields;
  if (App.settings.findFillSelection && cm) {
    const sel = cm.getSelection();
    if (sel && !sel.includes('\n') && sel.length < 1000) f.what.value = sel;
    else if (!sel) {
      const w = wordAtCursorOrSelection();
      if (w && /^\w+$/.test(w)) f.what.value = w;
    }
  }
  setFindTab(tab);
  if (!FindDlg.dialog.visible) FindDlg.dialog.show();
  FindDlg.dialog.raise();
  setTimeout(() => { f.what.focus(); f.what.select(); }, 0);
}

function setFindTab(tab) {
  FindDlg.tab = tab;
  const d = FindDlg.dialog;
  d.titleEl.querySelector('.dlg-title-text').textContent = { find: 'Find', replace: 'Replace', fif: 'Find in Files', mark: 'Mark' }[tab];
  $$('.ftab', d.el).forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  $$('[data-tabs]', d.el).forEach((e) => { e.style.display = e.dataset.tabs.split(' ').includes(tab) ? '' : 'none'; });
  if (tab === 'fif' && !FindDlg.fields.dir.value) FindDlg.fields.dir.value = defaultDir();
  if (tab === 'fif' && FindDlg.fields.follow.checked && App.active.path) FindDlg.fields.dir.value = dirname(App.active.path);
  setFindStatus('', 'info');
}

function readFindFields() {
  const f = FindDlg.fields;
  Object.assign(FindState, {
    what: f.what.value, replace: f.replace.value,
    mode: f.mode.find((r) => r.checked).value,
    matchCase: f.matchCase.checked, wholeWord: f.wholeWord.checked, wrap: f.wrap.checked, backward: f.backward.checked,
    dotAll: f.dotAll.checked, inSelection: f.inSel.checked && FindDlg.tab !== 'find',
    bookmarkLine: f.bookmark.checked, purge: f.purge.checked,
    fifDir: f.dir.value, fifFilters: f.filters.value || '*.*', fifSub: f.sub.checked, fifHidden: f.hidden.checked, fifFollow: f.follow.checked,
  });
  addHistory('findHistory', FindState.what);
  if (FindDlg.tab !== 'find' && FindDlg.tab !== 'mark') addHistory('replaceHistory', FindState.replace);
  refreshDatalists();
  App.settings.find = { ...FindState, what: undefined, replace: undefined };
  scheduleSession();
  return FindState;
}

function refreshDatalists() {
  const fill = (dl, list) => { dl.innerHTML = ''; (list || []).forEach((v) => dl.append(el('option', { value: v }))); };
  if (!FindDlg.findDl) return;
  fill(FindDlg.findDl, App.settings.findHistory);
  fill(FindDlg.replDl, App.settings.replaceHistory);
}

function buildFindDialog() {
  const s = App.settings.find || {};
  Object.assign(FindState, s, { what: FindState.what, replace: FindState.replace });
  const f = FindDlg.fields;
  const chk = (label, checked, tabs) => {
    const c = el('input', { type: 'checkbox', checked });
    return [c, el('label', { class: 'chk', 'data-tabs': tabs }, c, ' ' + label)];
  };
  f.what = el('input', { type: 'text', list: 'find-hist', class: 'find-input', spellcheck: 'false' });
  f.replace = el('input', { type: 'text', list: 'repl-hist', class: 'find-input', spellcheck: 'false', value: FindState.replace });
  f.filters = el('input', { type: 'text', class: 'find-input', value: FindState.fifFilters });
  f.dir = el('input', { type: 'text', class: 'find-input', value: FindState.fifDir });
  const [follow, followL] = chk('Follow current doc.', FindState.fifFollow, 'fif');
  const [sub, subL] = chk('In all sub-folders', FindState.fifSub, 'fif');
  const [hidden, hiddenL] = chk('In hidden folders', FindState.fifHidden, 'fif');
  const [inSel, inSelL] = chk('In selection', false, 'replace mark');
  const [bookmark, bookmarkL] = chk('Bookmark line', FindState.bookmarkLine, 'mark');
  const [purge, purgeL] = chk('Purge for each search', FindState.purge, 'mark');
  const [backward, backwardL] = chk('Backward direction', FindState.backward, 'find replace');
  const [wholeWord, wholeWordL] = chk('Match whole word only', FindState.wholeWord, 'find replace fif mark');
  const [matchCase, matchCaseL] = chk('Match case', FindState.matchCase, 'find replace fif mark');
  const [wrap, wrapL] = chk('Wrap around', FindState.wrap, 'find replace');
  Object.assign(f, { follow, sub, hidden, inSel, bookmark, purge, backward, wholeWord, matchCase, wrap });
  const radio = (v, label) => {
    const r = el('input', { type: 'radio', name: 'find-mode', value: v, checked: FindState.mode === v });
    return [r, el('label', { class: 'chk' }, r, ' ' + label)];
  };
  const [rn, rnL] = radio('normal', 'Normal');
  const [rx, rxL] = radio('extended', 'Extended (\\n, \\r, \\t, \\0, \\x...)');
  const [rr, rrL] = radio('regex', 'Regular expression');
  f.mode = [rn, rx, rr];
  const dotAll = el('input', { type: 'checkbox', checked: FindState.dotAll });
  f.dotAll = dotAll;
  const dotAllL = el('label', { class: 'chk dotall' }, dotAll, ' . matches newline');
  const syncDot = () => { dotAll.disabled = !rr.checked; dotAllL.classList.toggle('disabled', !rr.checked); };
  f.mode.forEach((r) => r.addEventListener('change', syncDot));
  syncDot();

  const transChk = el('input', { type: 'checkbox', checked: FindState.transparency });
  const tBlur = el('input', { type: 'radio', name: 'find-trans', checked: FindState.transMode === 'blur' });
  const tAlways = el('input', { type: 'radio', name: 'find-trans', checked: FindState.transMode === 'always' });
  const tRange = el('input', { type: 'range', min: '20', max: '95', value: FindState.transValue });

  const btn = (label, tabs, run, cls = '') => el('button', { class: 'btn ' + cls, 'data-tabs': tabs, onclick: () => { readFindFields(); run(); } }, label);
  const tabBtn = (id, label) => el('div', { class: 'ftab', 'data-tab': id, onclick: () => setFindTab(id) }, label);

  const browse = el('button', { class: 'btn small', onclick: async () => { const p = await fileDialog({ mode: 'folder', dir: f.dir.value || defaultDir() }); if (p) f.dir.value = p; } }, '...');
  const toCurrent = el('button', { class: 'btn small', title: 'Fill with the current document folder', onclick: () => { if (App.active.path) f.dir.value = dirname(App.active.path); } }, '←');

  const body = el('div', { class: 'find' },
    FindDlg.findDl = el('datalist', { id: 'find-hist' }), FindDlg.replDl = el('datalist', { id: 'repl-hist' }),
    el('div', { class: 'ftabs' }, tabBtn('find', 'Find'), tabBtn('replace', 'Replace'), tabBtn('fif', 'Find in Files'), tabBtn('mark', 'Mark')),
    el('div', { class: 'find-main' },
      el('div', { class: 'find-left' },
        el('div', { class: 'frow' }, el('label', {}, 'Find what :'), f.what),
        el('div', { class: 'frow', 'data-tabs': 'replace fif' }, el('label', {}, 'Replace with :'), f.replace),
        el('div', { class: 'frow', 'data-tabs': 'fif' }, el('label', {}, 'Filters :'), f.filters),
        el('div', { class: 'frow', 'data-tabs': 'fif' }, el('label', {}, 'Directory :'), f.dir, toCurrent, browse),
        el('div', { class: 'fopts' },
          el('div', { class: 'fopts-col' }, bookmarkL, purgeL, inSelL, backwardL, wholeWordL, matchCaseL, wrapL),
          el('div', { class: 'fopts-col', 'data-tabs': 'fif' }, followL, subL, hiddenL)),
        el('div', { class: 'fgroups' },
          el('fieldset', {}, el('legend', {}, 'Search Mode'), rnL, rxL, el('div', { class: 'fline' }, rrL, dotAllL)),
          el('fieldset', { class: 'ftrans' }, el('legend', {}, el('label', { class: 'chk' }, transChk, ' Transparency')),
            el('label', { class: 'chk' }, tBlur, ' On losing focus'), el('label', { class: 'chk' }, tAlways, ' Always'), tRange))),
      el('div', { class: 'find-right' },
        btn('Find Next', 'find replace', () => findNext(FindState, FindState.backward), 'default'),
        btn('Count', 'find', () => countMatches()),
        btn('Find All in All Opened Documents', 'find', () => findAllInDocs(FindState, App.tabs)),
        btn('Find All in Current Document', 'find', () => findAllInDocs(FindState, [App.active])),
        btn('Replace', 'replace', () => replaceOne()),
        btn('Replace All', 'replace', () => replaceAll()),
        btn('Replace All in All Opened Documents', 'replace', () => replaceAllOpenDocs()),
        btn('Find All', 'fif', () => findInFiles(), 'default'),
        btn('Replace in Files', 'fif', () => replaceInFiles()),
        btn('Mark All', 'mark', () => markAll(), 'default'),
        btn('Clear all marks', 'mark', () => clearMarks()),
        btn('Copy Marked Text', 'mark', () => copyMarkedText()),
        el('button', { class: 'btn', onclick: () => FindDlg.dialog.close() }, 'Close'))),
    FindDlg.status = el('div', { class: 'find-status' }));

  const d = new Dialog({ title: 'Find', body, modal: false, className: 'find-dlg' });
  FindDlg.dialog = d;
  d.onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); d.close(); return; }
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type === 'text') {
      e.preventDefault();
      const def = $$('.find-right .btn.default', d.el).find((b) => b.style.display !== 'none');
      if (e.shiftKey && (FindDlg.tab === 'find' || FindDlg.tab === 'replace')) { readFindFields(); findNext(FindState, !FindState.backward); return; }
      if (def) def.click();
    }
  };
  const applyTrans = () => {
    FindState.transparency = transChk.checked;
    FindState.transMode = tAlways.checked ? 'always' : 'blur';
    FindState.transValue = Number(tRange.value);
    const focused = d.el.contains(document.activeElement);
    const on = transChk.checked && (FindState.transMode === 'always' || !focused);
    d.el.style.opacity = on ? String(tRange.value / 100) : '';
  };
  [transChk, tBlur, tAlways, tRange].forEach((x) => x.addEventListener('input', applyTrans));
  d.el.addEventListener('focusin', applyTrans);
  d.el.addEventListener('focusout', () => setTimeout(applyTrans, 0));
  refreshDatalists();
}
