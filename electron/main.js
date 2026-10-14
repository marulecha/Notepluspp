'use strict';
// Desktop app: runs server.js inside Electron on a free local port and shows the UI in a window.
// Session data lives in ~/Library/Application Support/Noteplus-padpad instead of the read-only bundle.

const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const server = require('../server');

const STATE_FILE = path.join(app.getPath('userData'), 'window.json');
// The name people see. app.name is the file and folder name, Noteplus-padpad.
const DISPLAY_NAME = 'Noteplus++';

let baseUrl = null;
let win = null;
let quitRequested = false;
// Files asked for before the window is ready, from Finder, the Dock or the command line.
const pendingFiles = [];

if (!app.requestSingleInstanceLock()) app.quit();

function readWindowState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { width: 1200, height: 800 }; }
}

function writeWindowState() {
  if (!win || win.isDestroyed()) return;
  const state = { ...win.getNormalBounds(), maximized: win.isMaximized() };
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)); } catch { /* not worth failing a quit over */ }
}

function isOwnUrl(url) {
  return url.startsWith(baseUrl + '/');
}

// Runs a command from the page's command table, the same ones its own menus use.
function run(id) {
  if (win) win.webContents.executeJavaScript(`runCommand(${JSON.stringify(id)})`).catch(() => {});
}

// Opens a file in the page once its startup has finished.
function openInPage(file) {
  const script = `(async () => {
    while (typeof App === 'undefined' || !App.ready) await new Promise((r) => setTimeout(r, 50));
    await openFile(${JSON.stringify(file)});
  })()`;
  win.webContents.executeJavaScript(script).catch(() => {});
}

function openFiles(files) {
  if (!win) { pendingFiles.push(...files); createWindow(); return; }
  if (win.isMinimized()) win.restore();
  win.focus();
  if (win.webContents.isLoading()) pendingFiles.push(...files);
  else files.forEach(openInPage);
}

function filesFromArgv(argv) {
  return argv.slice(app.isPackaged ? 1 : 2)
    .filter((a) => !a.startsWith('-'))
    .map((a) => path.resolve(a))
    .filter((a) => { try { return fs.statSync(a).isFile(); } catch { return false; } });
}

function createWindow() {
  const state = readWindowState();
  win = new BrowserWindow({
    x: state.x, y: state.y, width: state.width, height: state.height,
    minWidth: 600, minHeight: 400,
    show: false,
    title: DISPLAY_NAME,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (state.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());

  win.webContents.on('did-finish-load', () => {
    pendingFiles.splice(0).forEach(openInPage);
  });

  // "Launch in browser" previews open in a new app window. Other links go to the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isOwnUrl(url)) return { action: 'allow', overrideBrowserWindowOptions: { width: 1000, height: 750 } };
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (isOwnUrl(url)) return;
    e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });

  // The page decides whether the window may close: it saves the session, or asks about unsaved
  // tabs when session restore is off.
  let closing = false;
  win.on('close', (e) => {
    writeWindowState();
    if (closing) return;
    e.preventDefault();
    win.webContents.executeJavaScript('beforeAppClose()')
      .catch(() => true)
      .then((ok) => {
        if (ok) { closing = true; win.close(); } else quitRequested = false;
      });
  });
  win.on('closed', () => { win = null; });

  win.loadURL(baseUrl + '/');
}

// A menu item that shows a shortcut but leaves the key press to the page, which already handles it.
function cmd(label, id, accelerator) {
  return { label, accelerator, registerAccelerator: false, click: () => run(id) };
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: DISPLAY_NAME,
      submenu: [
        cmd(`About ${DISPLAY_NAME}`, 'help.about'),
        { type: 'separator' },
        cmd('Settings...', 'settings.prefs', 'Cmd+,'),
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: `Hide ${DISPLAY_NAME}` }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: `Quit ${DISPLAY_NAME}` },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        cmd('New', 'file.new', 'CmdOrCtrl+N'),
        cmd('Open...', 'file.open', 'CmdOrCtrl+O'),
        cmd('Reopen Closed Tab', 'file.restoreClosed', 'CmdOrCtrl+Shift+T'),
        { type: 'separator' },
        cmd('Save', 'file.save', 'CmdOrCtrl+S'),
        cmd('Save As...', 'file.saveAs', 'CmdOrCtrl+Alt+S'),
        cmd('Save All', 'file.saveAll', 'CmdOrCtrl+Shift+S'),
        { type: 'separator' },
        cmd('Close Tab', 'file.close', 'CmdOrCtrl+W'),
        { label: 'Close Window', accelerator: 'CmdOrCtrl+Shift+W', click: () => win && win.close() },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        cmd('Undo', 'edit.undo', 'CmdOrCtrl+Z'),
        cmd('Redo', 'edit.redo', 'CmdOrCtrl+Shift+Z'),
        { type: 'separator' },
        // Native roles, so the system clipboard works in the editor and in dialogs.
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
        { type: 'separator' },
        cmd('Find...', 'search.find', 'CmdOrCtrl+F'),
        cmd('Replace...', 'search.replace', 'CmdOrCtrl+H'),
        cmd('Find in Files...', 'search.fif', 'CmdOrCtrl+Shift+F'),
      ],
    },
    {
      label: 'View',
      submenu: [
        cmd('Zoom In', 'view.zoomIn', 'CmdOrCtrl+='),
        cmd('Zoom Out', 'view.zoomOut', 'CmdOrCtrl+-'),
        cmd('Actual Size', 'view.zoomReset', 'CmdOrCtrl+0'),
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }]),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [cmd(`About ${DISPLAY_NAME}`, 'help.about')],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// macOS sends files opened from Finder or dropped on the Dock icon here, possibly before 'ready'.
app.on('open-file', (e, file) => {
  e.preventDefault();
  if (baseUrl) openFiles([file]); else pendingFiles.push(file);
});

app.on('second-instance', (_e, argv) => {
  const files = filesFromArgv(argv);
  if (files.length) openFiles(files);
  else if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.on('before-quit', () => { quitRequested = true; });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || quitRequested) app.quit();
});

app.on('activate', () => {
  if (!win && baseUrl) createWindow();
});

app.whenReady().then(async () => {
  let port;
  try {
    port = await server.start({ port: 0, dataDir: app.getPath('userData') });
  } catch (err) {
    dialog.showErrorBox(`${DISPLAY_NAME} could not start`, err.message);
    app.quit();
    return;
  }
  baseUrl = `http://127.0.0.1:${port}`;
  pendingFiles.push(...filesFromArgv(process.argv));
  buildMenu();
  createWindow();
});
