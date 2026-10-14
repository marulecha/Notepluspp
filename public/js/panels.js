'use strict';
// Docking panels: Folder as Workspace, Document List, Function List and the bottom results panel.

function panelSection(id, title, content, onClose, toolbar) {
  return el('div', { class: 'psec', 'data-id': id },
    el('div', { class: 'ptitle' }, el('span', {}, title), toolbar || null, el('button', { class: 'pclose', title: 'Close', onclick: onClose }, '✕')),
    el('div', { class: 'pbody' }, content));
}

function layoutPanels() {
  const P = App.settings.panels;
  const left = $('#leftpanel'), right = $('#rightpanel');
  left.innerHTML = '';
  right.innerHTML = '';
  if (P.workspace) left.append(workspaceSection());
  if (P.doclist) left.append(docListSection());
  if (P.funclist) right.append(funcListSection());
  const showL = P.workspace || P.doclist, showR = P.funclist;
  left.classList.toggle('hidden', !showL);
  $('#leftsplit').classList.toggle('hidden', !showL);
  right.classList.toggle('hidden', !showR);
  $('#rightsplit').classList.toggle('hidden', !showR);
  left.style.width = App.settings.panelSizes.left + 'px';
  right.style.width = App.settings.panelSizes.right + 'px';
  if (P.doclist) renderDocList();
  if (P.funclist) updateFuncList();
  if (App.cm) App.cm.refresh();
}

function togglePanel(name, on) {
  const P = App.settings.panels;
  P[name] = on === undefined ? !P[name] : on;
  layoutPanels();
  scheduleSession();
}

function initSplitters() {
  const drag = (splitter, apply) => {
    splitter.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const start = { x: e.clientX, y: e.clientY };
      const sizes = { ...App.settings.panelSizes };
      document.body.classList.add('resizing');
      const move = (ev) => apply(ev.clientX - start.x, ev.clientY - start.y, sizes);
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        document.body.classList.remove('resizing');
        App.cm.refresh();
        scheduleSession();
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  };
  drag($('#leftsplit'), (dx, dy, s) => { App.settings.panelSizes.left = Math.max(120, Math.min(800, s.left + dx)); $('#leftpanel').style.width = App.settings.panelSizes.left + 'px'; });
  drag($('#rightsplit'), (dx, dy, s) => { App.settings.panelSizes.right = Math.max(120, Math.min(800, s.right - dx)); $('#rightpanel').style.width = App.settings.panelSizes.right + 'px'; });
  drag($('#bottomsplit'), (dx, dy, s) => { App.settings.panelSizes.bottom = Math.max(60, Math.min(window.innerHeight - 200, s.bottom - dy)); $('#bottompanel').style.height = App.settings.panelSizes.bottom + 'px'; });
}

// ---------------------------------------------------------------- bottom panel

function showBottomPanel(title, content, kind) {
  const p = $('#bottompanel');
  p.innerHTML = '';
  p.dataset.kind = kind || '';
  p.append(panelSection(kind || 'bottom', title, content, () => hideBottomPanel()));
  p.classList.remove('hidden');
  $('#bottomsplit').classList.remove('hidden');
  p.style.height = App.settings.panelSizes.bottom + 'px';
  App.cm.refresh();
}

function hideBottomPanel() {
  $('#bottompanel').classList.add('hidden');
  $('#bottomsplit').classList.add('hidden');
  App.cm.refresh();
  focusEditor();
}

function toggleResultsPanel() {
  if ($('#bottompanel').classList.contains('hidden')) showResultsPanel();
  else hideBottomPanel();
}

// ---------------------------------------------------------------- Folder as Workspace

const WS = { nodes: new Map(), expanded: new Set(), tree: null, selected: null };

function workspaceSection() {
  const tree = el('div', { class: 'tree', tabindex: '0' });
  WS.tree = tree;
  const tb = el('span', { class: 'ptools' },
    el('button', { class: 'tbtn', title: 'Locate current file', html: ICONS.find, onclick: () => locateInWorkspace() }),
    el('button', { class: 'tbtn', title: 'Collapse all', html: ICONS.collapse, onclick: () => { WS.expanded.clear(); renderWorkspace(); } }),
    el('button', { class: 'tbtn', title: 'Add folder', html: ICONS.folderws, onclick: () => addWorkspaceFolder() }));
  tree.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.tnode')) return;
    e.preventDefault();
    Menu.open([{ label: 'Add', run: () => addWorkspaceFolder() }, { label: 'Remove All', enabled: App.settings.workspaceRoots.length > 0, run: () => { App.settings.workspaceRoots = []; renderWorkspace(); scheduleSession(); } }], e.clientX, e.clientY);
  });
  renderWorkspace();
  return panelSection('workspace', 'Folder as Workspace', tree, () => togglePanel('workspace', false), tb);
}

async function addWorkspaceFolder() {
  const p = await fileDialog({ mode: 'folder', dir: defaultDir(), title: 'Select a folder to add in Folder as Workspace panel' });
  if (!p) return;
  if (!App.settings.workspaceRoots.includes(p)) App.settings.workspaceRoots.push(p);
  WS.expanded.add(p);
  togglePanel('workspace', true);
}

async function loadChildren(p) {
  try {
    const r = await api.get('ls', { path: p });
    WS.nodes.set(p, r.entries.filter((e) => App.settings.showHiddenFiles || !e.hidden));
  } catch {
    WS.nodes.set(p, []);
  }
}

async function renderWorkspace() {
  const tree = WS.tree;
  if (!tree) return;
  const frag = document.createDocumentFragment();
  if (!App.settings.workspaceRoots.length) {
    frag.append(el('div', { class: 'tree-empty' }, 'Right-click here or use File > Open Folder as Workspace... to add a folder.'));
  }
  const addNode = async (p, name, isDir, depth, isRoot) => {
    const open = isDir && WS.expanded.has(p);
    const row = el('div', { class: 'tnode' + (isRoot ? ' root' : '') + (WS.selected === p ? ' sel' : ''), style: { paddingLeft: 4 + depth * 16 + 'px' }, title: p },
      el('span', { class: 'texp' }, isDir ? (open ? '▾' : '▸') : ''),
      el('span', { class: 'ico', html: isDir ? (open ? ICONS.folderopen : ICONS.folder) : ICONS.file }),
      el('span', { class: 'tname' }, name));
    row.addEventListener('click', () => {
      WS.selected = p;
      $$('.tnode.sel', tree).forEach((x) => x.classList.remove('sel'));
      row.classList.add('sel');
      if (isDir) { open ? WS.expanded.delete(p) : WS.expanded.add(p); renderWorkspace(); }
    });
    row.addEventListener('dblclick', () => { if (!isDir) openFile(p); });
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      WS.selected = p;
      const items = isDir ? [
        isRoot ? { label: 'Remove', run: () => { App.settings.workspaceRoots = App.settings.workspaceRoots.filter((x) => x !== p); renderWorkspace(); scheduleSession(); } } : null,
        isRoot ? { label: 'Remove All', run: () => { App.settings.workspaceRoots = []; renderWorkspace(); scheduleSession(); } } : null,
        isRoot ? '-' : null,
        { label: 'New File...', run: async () => { const n = await inputBox('New File', 'File name :', 'new.txt'); if (n) { await openFile(joinPath(p, n), { silent: false }); WS.expanded.add(p); refreshWorkspace(); } } },
        { label: 'New Folder...', run: async () => { const n = await inputBox('New Folder', 'Folder name :', 'New folder'); if (n) { await api.post('mkdir', { path: joinPath(p, n) }); WS.expanded.add(p); refreshWorkspace(); } } },
        '-',
        { label: 'Copy Path', run: () => copyText(p) },
        { label: 'Find in Files...', run: () => { openFindDialog('fif'); FindDlg.fields.dir.value = p; } },
        '-',
        { label: isMac ? 'Reveal in Finder' : 'Explorer here', run: () => api.post('reveal', { path: p }) },
        { label: isMac ? 'Terminal here' : 'CMD here', run: () => api.post('reveal', { path: p, how: 'terminal' }) },
        '-',
        { label: 'Refresh', run: () => refreshWorkspace() },
      ] : [
        { label: 'Open', run: () => openFile(p) },
        '-',
        { label: 'Copy Path', run: () => copyText(p) },
        { label: 'Copy File Name', run: () => copyText(basename(p)) },
        '-',
        { label: 'Rename...', run: () => renameFile(p) },
        { label: isMac ? 'Reveal in Finder' : 'Explorer here', run: () => api.post('reveal', { path: p }) },
        { label: isMac ? 'Terminal here' : 'CMD here', run: () => api.post('reveal', { path: p, how: 'terminal' }) },
      ];
      Menu.open(items.filter(Boolean), e.clientX, e.clientY);
    });
    frag.append(row);
    if (open) {
      if (!WS.nodes.has(p)) await loadChildren(p);
      for (const c of WS.nodes.get(p)) await addNode(joinPath(p, c.name), c.name, c.dir, depth + 1, false);
    }
  };
  for (const r of App.settings.workspaceRoots) await addNode(r, basename(r) || r, true, 0, true);
  tree.innerHTML = '';
  tree.append(frag);
}

function refreshWorkspace() {
  if (!App.settings.panels.workspace) return;
  WS.nodes.clear();
  renderWorkspace();
}

async function locateInWorkspace() {
  const p = App.active && App.active.path;
  if (!p) return;
  const root = App.settings.workspaceRoots.find((r) => p.startsWith(r.replace(/[\\/]$/, '') + pathSep));
  if (!root) return;
  let cur = dirname(p);
  while (cur.length >= root.length) { WS.expanded.add(cur); if (cur === root) break; cur = dirname(cur); }
  WS.selected = p;
  await renderWorkspace();
  const node = $$('.tnode', WS.tree).find((n) => n.title === p);
  if (node) node.scrollIntoView({ block: 'center' });
}

function syncWorkspaceSelection() {
  if (!WS.tree || !App.settings.panels.workspace || !App.active || !App.active.path) return;
  $$('.tnode', WS.tree).forEach((n) => n.classList.toggle('sel', n.title === App.active.path));
}

async function renameFile(p) {
  const n = await inputBox('Rename', 'New name :', basename(p));
  if (!n || n === basename(p)) return;
  const to = joinPath(dirname(p), n);
  try {
    await api.post('rename', { from: p, to });
    const t = findTabByPath(p);
    if (t) { t.path = to; t.title = basename(to); renderTabs(); updateTitle(); }
    refreshWorkspace();
  } catch (err) { msgBox(err.message, { icon: 'error' }); }
}

// ---------------------------------------------------------------- Document List

let docListBody = null;
function docListSection() {
  docListBody = el('div', { class: 'doclist' });
  return panelSection('doclist', 'Document List', docListBody, () => togglePanel('doclist', false));
}

function renderDocList() {
  if (!docListBody || !App.settings.panels.doclist) return;
  docListBody.innerHTML = '';
  docListBody.append(el('div', { class: 'dl-row dl-head' }, el('span', {}, 'Name'), el('span', {}, 'Ext.')));
  for (const t of App.tabs) {
    const name = t.title.replace(/\.[^.]*$/, '') || t.title;
    const ext = t.path ? (extname(t.path) ? '.' + extname(t.path) : '') : '';
    const icon = t.readOnly ? 'tabreadonly' : isDirty(t) ? 'tabdirty' : 'tabsaved';
    const r = el('div', { class: 'dl-row' + (t === App.active ? ' sel' : ''), title: t.path || t.title },
      el('span', {}, el('span', { class: 'ico', html: ICONS[icon] }), t.path ? name : t.title), el('span', {}, ext));
    r.addEventListener('click', () => activateTab(t));
    r.addEventListener('contextmenu', (e) => { e.preventDefault(); activateTab(t); Menu.open(tabContextMenu(t), e.clientX, e.clientY); });
    docListBody.append(r);
  }
}

// ---------------------------------------------------------------- Function List

let funcBody = null, funcFilter = null, funcSorted = false;
const scheduleFuncList = debounce(() => updateFuncList(), 400);

function funcListSection() {
  funcFilter = el('input', { type: 'text', class: 'fl-search', placeholder: 'Search' });
  funcFilter.addEventListener('input', () => updateFuncList());
  funcBody = el('div', { class: 'tree fl' });
  const tb = el('span', { class: 'ptools' },
    el('button', { class: 'tbtn', title: 'Sort', onclick: () => { funcSorted = !funcSorted; updateFuncList(); } }, 'A↓'),
    el('button', { class: 'tbtn', title: 'Reload', html: ICONS.refresh, onclick: () => updateFuncList() }));
  return panelSection('funclist', 'Function List', el('div', { class: 'fl-wrap' }, funcFilter, funcBody), () => togglePanel('funclist', false), tb);
}

function parseFunctions(tab) {
  const rules = FUNC_RULES[tab.lang];
  if (!rules) return [];
  const out = [];
  const doc = tab.doc;
  let inBlockComment = false;
  const n = Math.min(doc.lineCount(), 50000);
  for (let i = 0; i < n; i++) {
    const text = doc.getLine(i);
    if (/^(c|cpp|cs|java|javascript|typescript|php|go|rust|kotlin|swift|scala|d|objc|groovy)$/.test(tab.lang)) {
      if (inBlockComment) { if (text.includes('*/')) inBlockComment = false; continue; }
      if (/^\s*\/\*/.test(text) && !text.includes('*/')) { inBlockComment = true; continue; }
      if (/^\s*(\/\/|\*)/.test(text)) continue;
    }
    for (const r of rules) {
      const m = text.match(r.re);
      if (m && m[1] && !(r.skip && r.skip.has(m[1]))) {
        out.push({ name: m[1].trim(), line: i, kind: r.kind || 'fn', indent: text.match(/^\s*/)[0].length });
        break;
      }
    }
  }
  return out;
}

function updateFuncList() {
  if (!funcBody || !App.settings.panels.funclist || !App.active) return;
  const tab = App.active;
  let items = parseFunctions(tab);
  const q = funcFilter.value.toLowerCase();
  if (q) items = items.filter((x) => x.name.toLowerCase().includes(q));
  if (funcSorted) items = [...items].sort((a, b) => a.name.localeCompare(b.name));
  funcBody.innerHTML = '';
  const root = el('div', { class: 'tnode root' }, el('span', { class: 'texp' }, '▾'), el('span', { class: 'ico', html: ICONS.file }), el('span', { class: 'tname' }, tab.title));
  funcBody.append(root);
  if (!FUNC_RULES[tab.lang]) return;
  for (const f of items) {
    const depth = f.kind === 'class' ? 1 : (items.some((c) => c.kind === 'class') && f.indent > 0 ? 2 : 1);
    const row = el('div', { class: 'tnode fl-' + f.kind, style: { paddingLeft: 4 + depth * 16 + 'px' } },
      el('span', { class: 'texp' }, ''), el('span', { class: 'fl-ico ' + f.kind }), el('span', { class: 'tname' }, f.name));
    row.addEventListener('click', () => { $$('.tnode.sel', funcBody).forEach((x) => x.classList.remove('sel')); row.classList.add('sel'); });
    row.addEventListener('dblclick', () => gotoPos(f.line, 0));
    row.addEventListener('click', () => gotoPos(f.line, 0));
    funcBody.append(row);
  }
}
