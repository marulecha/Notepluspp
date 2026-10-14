'use strict';
// Startup: load server info and the saved session, build the UI, restore documents.

async function main() {
  // The desktop app has a native title bar, so the page hides its own.
  if (window.desktop) document.body.classList.add('desktop');
  try {
    App.info = await api.get('info');
    pathSep = App.info.sep;
  } catch (err) {
    document.body.textContent = `Cannot reach the ${APP_NAME} server: ${err.message}`;
    return;
  }
  let session = {};
  try { session = await api.get('session'); } catch { /* first run */ }
  if (session.settings) {
    const saved = session.settings;
    Object.assign(App.settings, saved, {
      panels: { ...DEFAULT_SETTINGS.panels, ...(saved.panels || {}) },
      panelSizes: { ...DEFAULT_SETTINGS.panelSizes, ...(saved.panelSizes || {}) },
      keys: saved.keys || {},
    });
  }
  App.recent = session.recent || [];
  App.closedStack = session.closed || [];
  if (App.settings.find) Object.assign(FindState, App.settings.find, { what: '', replace: '' });

  createEditor();
  defineCommands();
  App.menubar = buildMenubar($('#menubar'), mainMenus());
  $('#menubar').append(el('div', { class: 'mb-right' },
    el('button', { class: 'mb-btn', title: 'List all documents', onmousedown: (e) => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); Menu.open(App.tabs.map((t) => ({ label: t.title, checked: () => t === App.active, run: () => activateTab(t) })), r.right - 200, r.bottom); } }, '▼'),
    el('button', { class: 'mb-btn', title: 'Add a new document', onclick: () => runCommand('file.new') }, '+'),
    el('button', { class: 'mb-btn mb-close', title: 'Close current document', onclick: () => runCommand('file.close') }, '✕')));
  buildToolbar();
  buildStatusbar();
  initSplitters();

  const active = await restoreSession(session);
  if (!App.tabs.length) App.tabs.push(createTab({}));
  applySettings();
  activateTab(active || App.tabs[0]);
  if (App.active.pendingScroll) { const p = App.active.pendingScroll; App.active.pendingScroll = null; setTimeout(() => App.cm.scrollTo(p.left, p.top), 50); }
  App.tabs.forEach((t) => { if (t !== App.active) t.scroll = t.pendingScroll; });
  layoutPanels();

  const params = new URLSearchParams(location.search);
  if (params.get('open')) {
    const line = params.get('line') ? Math.max(0, Number(params.get('line')) - 1) : undefined;
    await openFile(params.get('open'), { line });
    history.replaceState(null, '', '/');
  }

  window.addEventListener('keydown', onGlobalKeyDown, true);
  window.addEventListener('focus', () => checkExternalChanges());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveSession(); });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (App.settings.darkMode === 'os') applySettings(); });

  const tabbar = $('#tabbar');
  tabbar.addEventListener('dblclick', (e) => { if (!e.target.closest('.tab')) newDocument(); });
  tabbar.addEventListener('wheel', (e) => { $('#tabs').scrollLeft += e.deltaY || e.deltaX; e.preventDefault(); }, { passive: false });
  $('#titlebar').addEventListener('dblclick', () => toggleFullscreen());

  // Files dropped from the operating system open as new documents. A browser hides their path,
  // so they open untitled. The desktop app catches drops from Finder and opens them by path.
  document.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  document.addEventListener('drop', async (e) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    e.stopPropagation();
    for (const f of e.dataTransfer.files) {
      const text = await f.text();
      const lang = detectLanguage(f.name, text.slice(0, 200).split(/\r?\n/)[0]);
      const eol = (text.match(/\r\n|\n|\r/) || [App.settings.newDocEol])[0];
      const replace = App.tabs.length === 1 && isPristine(App.tabs[0]) ? App.tabs[0] : null;
      const t = createTab({ title: f.name, content: text, lang, eol });
      t.untitledNum = null;
      addTab(t);
      if (replace) removeTab(replace);
    }
  }, true);

  // Keep the toolbar's Undo/Redo/Save state in sync while typing.
  App.cm.on('changes', debounce(updateToolbarState, 150));

  App.ready = true;
  scheduleSession();
}

main();
