'use strict';
// Menus, dialogs, message boxes and the Open/Save file browser.

const layer = () => $('#layer');

// ---------------------------------------------------------------- menus

// A menu item is '-' (separator), a command id string, or an object:
// { label, key, run, checked, radio, enabled, submenu, disabled }
// Function-valued fields are evaluated when the menu opens.
function resolveItem(it) {
  if (it === '-') return { sep: true };
  if (typeof it === 'string') {
    const c = COMMANDS[it];
    if (!c) return { label: `?? ${it}`, enabled: false };
    return { label: c.label, key: keyDisplay(c), run: () => runCommand(it), checked: c.checked, radio: c.radio, enabled: c.enabled };
  }
  return it;
}

const val = (v) => (typeof v === 'function' ? v() : v);

const Menu = {
  stack: [],          // [{ el, items, index, parentItemEl }]
  bar: null,          // menubar controller when the open menu came from the menubar
  onClose: null,

  open(items, x, y, opts = {}) {
    if (!opts.sub) this.closeAll();
    const m = el('div', { class: 'menu', role: 'menu' });
    const entries = [];
    items = val(items).map(resolveItem);
    items.forEach((it) => {
      if (it.sep) { m.append(el('div', { class: 'menu-sep' })); return; }
      if (it.hidden && val(it.hidden)) return;
      const enabled = it.enabled === undefined ? true : !!val(it.enabled);
      const checked = it.checked ? !!val(it.checked) : false;
      const row = el('div', { class: 'mi' + (enabled ? '' : ' disabled') + (it.submenu ? ' has-sub' : '') },
        el('span', { class: 'mi-check' }, checked ? (it.radio ? '●' : '✓') : ''),
        el('span', { class: 'mi-label' }, val(it.label)),
        el('span', { class: 'mi-key' }, it.key ? val(it.key) : ''),
        el('span', { class: 'mi-arrow' }, it.submenu ? '▶' : ''));
      const entry = { row, it, enabled };
      entries.push(entry);
      row.addEventListener('mouseenter', () => this.hover(depth, entries.indexOf(entry), true));
      row.addEventListener('mousedown', (e) => e.preventDefault());
      row.addEventListener('click', (e) => { e.stopPropagation(); this.activate(depth, entries.indexOf(entry)); });
      m.append(row);
    });
    const depth = this.stack.length;
    layer().append(m);
    const r = m.getBoundingClientRect();
    const W = window.innerWidth, H = window.innerHeight;
    if (opts.sub) {
      const pr = opts.parentRect;
      x = pr.right - 3;
      y = pr.top - 3;
      if (x + r.width > W) x = pr.left - r.width + 3;
    }
    if (x + r.width > W) x = Math.max(0, W - r.width - 2);
    if (y + r.height > H) y = Math.max(0, opts.sub ? H - r.height - 2 : y - r.height);
    m.style.left = x + 'px';
    m.style.top = y + 'px';
    this.stack.push({ el: m, entries, index: -1, timer: null });
    if (opts.onClose) this.onClose = opts.onClose;
    if (opts.selectFirst) this.move(depth, 1);
    return m;
  },

  hover(depth, index, fromMouse) {
    const level = this.stack[depth];
    if (!level) return;
    this.closeFrom(depth + 1);
    this.highlight(depth, index);
    const entry = level.entries[index];
    clearTimeout(level.timer);
    if (entry && entry.it.submenu && entry.enabled) {
      const openSub = () => {
        if (this.stack.length > depth + 1) return;
        this.open(val(entry.it.submenu), 0, 0, { sub: true, parentRect: entry.row.getBoundingClientRect() });
      };
      if (fromMouse) level.timer = setTimeout(openSub, 180);
      else openSub();
    }
  },

  highlight(depth, index) {
    const level = this.stack[depth];
    level.entries.forEach((e, i) => e.row.classList.toggle('active', i === index));
    level.index = index;
  },

  activate(depth, index) {
    const entry = this.stack[depth] && this.stack[depth].entries[index];
    if (!entry || !entry.enabled) return;
    if (entry.it.submenu) {
      if (this.stack.length <= depth + 1) this.open(val(entry.it.submenu), 0, 0, { sub: true, parentRect: entry.row.getBoundingClientRect(), selectFirst: true });
      return;
    }
    this.closeAll();
    if (entry.it.run) setTimeout(() => entry.it.run(), 0);
  },

  move(depth, dir) {
    const level = this.stack[depth];
    const n = level.entries.length;
    if (!n) return;
    let i = level.index;
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (level.entries[i].enabled) break;
    }
    this.closeFrom(depth + 1);
    this.highlight(depth, i);
  },

  closeFrom(depth) {
    while (this.stack.length > depth) {
      const l = this.stack.pop();
      clearTimeout(l.timer);
      l.el.remove();
    }
  },

  closeAll() {
    const wasOpen = this.stack.length > 0;
    this.closeFrom(0);
    if (this.bar) { this.bar.deactivate(); this.bar = null; }
    const cb = this.onClose;
    this.onClose = null;
    if (wasOpen && cb) cb();
  },

  isOpen() { return this.stack.length > 0; },

  handleKey(e) {
    if (!this.isOpen()) return false;
    const depth = this.stack.length - 1;
    const level = this.stack[depth];
    const k = e.key;
    if (k === 'ArrowDown') this.move(depth, 1);
    else if (k === 'ArrowUp') this.move(depth, -1);
    else if (k === 'ArrowRight') {
      const entry = level.entries[level.index];
      if (entry && entry.it.submenu) this.activate(depth, level.index);
      else if (this.bar) this.bar.step(1);
    } else if (k === 'ArrowLeft') {
      if (depth > 0) this.closeFrom(depth);
      else if (this.bar) this.bar.step(-1);
    } else if (k === 'Enter' || k === ' ') {
      if (level.index >= 0) this.activate(depth, level.index);
    } else if (k === 'Escape') {
      if (depth > 0) this.closeFrom(depth);
      else this.closeAll();
    } else if (k === 'Tab') {
      // ignore
    } else {
      return false;
    }
    e.preventDefault();
    e.stopPropagation();
    return true;
  },
};

document.addEventListener('mousedown', (e) => {
  if (!Menu.isOpen()) return;
  if (e.target.closest('.menu') || e.target.closest('.mb-item')) return;
  Menu.closeAll();
}, true);
window.addEventListener('blur', () => Menu.closeAll());

function buildMenubar(container, menus) {
  container.innerHTML = '';
  const items = [];
  const ctl = {
    active: -1,
    open(i, selectFirst) {
      Menu.bar = null;
      Menu.closeAll();
      items.forEach((b, j) => b.classList.toggle('open', j === i));
      this.active = i;
      const r = items[i].getBoundingClientRect();
      Menu.open(menus[i].items, r.left, r.bottom, { selectFirst });
      Menu.bar = ctl;
    },
    deactivate() {
      this.active = -1;
      items.forEach((b) => b.classList.remove('open'));
    },
    step(d) {
      const i = (this.active + d + items.length) % items.length;
      this.open(i, true);
    },
  };
  menus.forEach((m, i) => {
    const b = el('div', { class: 'mb-item' }, m.label);
    b.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (ctl.active === i) { Menu.closeAll(); return; }
      ctl.open(i);
    });
    b.addEventListener('mouseenter', () => { if (ctl.active >= 0 && ctl.active !== i) ctl.open(i); });
    items.push(b);
    container.append(b);
  });
  return ctl;
}

// ---------------------------------------------------------------- dialogs

const Dialogs = [];

class Dialog {
  constructor({ title, body, modal = true, className = '', width, onClose, buttons, footer }) {
    this.modal = modal;
    this.onClose = onClose;
    this.el = el('div', { class: 'dlg ' + className, role: 'dialog' });
    if (width) this.el.style.width = typeof width === 'number' ? width + 'px' : width;
    this.titleEl = el('div', { class: 'dlg-title' }, el('span', { class: 'dlg-title-text' }, title),
      el('button', { class: 'dlg-x', title: 'Close', onclick: () => this.close(null) }, '✕'));
    this.body = el('div', { class: 'dlg-body' });
    if (body) this.body.append(body);
    this.el.append(this.titleEl, this.body);
    if (buttons || footer) {
      const f = el('div', { class: 'dlg-buttons' });
      if (footer) f.append(footer);
      (buttons || []).forEach((b) => {
        const btn = el('button', { class: 'btn' + (b.default ? ' default' : ''), onclick: () => b.run ? b.run(this) : this.close(b.value ?? b.label) }, b.label);
        if (b.default) this.defaultBtn = btn;
        if (b.id) btn.id = b.id;
        f.append(btn);
      });
      this.el.append(f);
    }
    this.makeDraggable();
    this.el.addEventListener('keydown', (e) => this.onKey(e));
    this.el.addEventListener('mousedown', () => this.raise());
  }

  makeDraggable() {
    this.titleEl.addEventListener('mousedown', (e) => {
      if (e.target.closest('.dlg-x')) return;
      e.preventDefault();
      const r = this.el.getBoundingClientRect();
      const ox = e.clientX - r.left, oy = e.clientY - r.top;
      const move = (ev) => {
        this.el.style.left = Math.min(window.innerWidth - 60, Math.max(-r.width + 80, ev.clientX - ox)) + 'px';
        this.el.style.top = Math.min(window.innerHeight - 30, Math.max(0, ev.clientY - oy)) + 'px';
      };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }

  show() {
    if (this.modal) {
      this.backdrop = el('div', { class: 'dlg-backdrop' });
      this.backdrop.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.el.classList.remove('flash');
        void this.el.offsetWidth;
        this.el.classList.add('flash');
      });
      layer().append(this.backdrop);
    }
    layer().append(this.el);
    Dialogs.push(this);
    this.center();
    this.raise();
    const first = this.el.querySelector('[autofocus]') || this.el.querySelector('input:not([type=radio]):not([type=checkbox]):not([disabled]), select:not([disabled]), textarea:not([disabled])') || this.defaultBtn;
    if (first) setTimeout(() => { first.focus(); if (first.select && first.tagName === 'INPUT') first.select(); }, 0);
    this.visible = true;
    return this;
  }

  center() {
    const r = this.el.getBoundingClientRect();
    this.el.style.left = Math.max(0, (window.innerWidth - r.width) / 2) + 'px';
    this.el.style.top = Math.max(0, (window.innerHeight - r.height) / 2.4) + 'px';
  }

  raise() {
    Dialog.z = (Dialog.z || 1000) + 2;
    if (this.backdrop) this.backdrop.style.zIndex = Dialog.z - 1;
    this.el.style.zIndex = Dialog.z;
    $$('.dlg').forEach((d) => d.classList.toggle('inactive', d !== this.el));
  }

  hide() {
    this.el.remove();
    if (this.backdrop) this.backdrop.remove();
    const i = Dialogs.indexOf(this);
    if (i >= 0) Dialogs.splice(i, 1);
    this.visible = false;
  }

  close(result) {
    if (!this.visible) return;
    this.hide();
    if (this.onClose) this.onClose(result);
    if (!Dialogs.some((d) => d.modal)) setTimeout(() => focusEditor(), 0);
  }

  onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(null); return; }
    if (e.key === 'Enter' && this.defaultBtn && !e.target.matches('textarea, button, select') && !e.defaultPrevented) {
      e.preventDefault();
      this.defaultBtn.click();
    }
  }
}

function topDialog() {
  return Dialogs.filter((d) => d.visible).sort((a, b) => Number(b.el.style.zIndex) - Number(a.el.style.zIndex))[0] || null;
}

function msgBox(message, { title = APP_NAME, icon = 'info', buttons = ['OK'], defaultButton } = {}) {
  return new Promise((resolve) => {
    const body = el('div', { class: 'msgbox' },
      icon ? el('div', { class: 'msgbox-icon', html: ICONS[icon] }) : null,
      el('div', { class: 'msgbox-text' }, message));
    const d = new Dialog({
      title, body, className: 'msgbox-dlg',
      buttons: buttons.map((b) => ({ label: b, value: b, default: b === (defaultButton || buttons[0]) })),
      onClose: (r) => resolve(r == null ? (buttons.includes('Cancel') ? 'Cancel' : buttons[buttons.length - 1]) : r),
    });
    d.show();
  });
}

function inputBox(title, label, value = '', { width = 360 } = {}) {
  return new Promise((resolve) => {
    const input = el('input', { type: 'text', class: 'w100', value });
    const body = el('div', { class: 'form' }, el('label', { class: 'block' }, label), input);
    const d = new Dialog({
      title, body, width,
      buttons: [
        { label: 'OK', default: true, run: (dlg) => { dlg.close(input.value); } },
        { label: 'Cancel', value: null },
      ],
      onClose: (r) => resolve(r),
    });
    d.show();
  });
}

// ---------------------------------------------------------------- file dialog

// mode: 'open' | 'save' | 'folder'. Resolves to an absolute path or null.
function fileDialog({ mode = 'open', title, dir, fileName = '', saveType } = {}) {
  return new Promise((resolve) => {
    let cwd = dir || App.info.home;
    let entries = [];
    let showHidden = !!App.settings.showHiddenFiles;
    const pathInput = el('input', { type: 'text', class: 'fd-path' });
    const list = el('div', { class: 'fd-list', tabindex: '0' });
    const nameInput = el('input', { type: 'text', class: 'fd-name', value: fileName });
    const typeSel = el('select', { class: 'fd-type' });
    if (mode === 'save') {
      for (const l of LANGUAGES) {
        const o = el('option', { value: l.id }, `${l.desc} (${l.ext.map((x) => '*.' + x).join(';')})`);
        typeSel.append(o);
      }
      typeSel.value = saveType || 'text';
    } else {
      typeSel.append(el('option', { value: '*' }, 'All types (*.*)'));
      for (const l of LANGUAGES.slice(1)) typeSel.append(el('option', { value: l.id }, `${l.name} (${l.ext.map((x) => '*.' + x).join(';')})`));
    }
    const hiddenChk = el('input', { type: 'checkbox', checked: showHidden });
    const okLabel = mode === 'open' ? 'Open' : mode === 'save' ? 'Save' : 'Select Folder';
    const toolbar = el('div', { class: 'fd-bar' },
      el('label', {}, mode === 'save' ? 'Save in:' : 'Look in:'), pathInput,
      el('button', { class: 'tbtn', title: 'Up One Level', html: ICONS.up, onclick: () => cwdParent && load(cwdParent) }),
      el('button', { class: 'tbtn', title: 'Home', html: ICONS.home, onclick: () => load(App.info.home) }),
      el('button', { class: 'tbtn', title: 'Create New Folder', html: ICONS.newfolder, onclick: newFolder }),
      el('button', { class: 'tbtn', title: 'Refresh', html: ICONS.refresh, onclick: () => load(cwd) }));
    const header = el('div', { class: 'fd-row fd-head' }, el('span', { class: 'fd-c-name' }, 'Name'), el('span', { class: 'fd-c-date' }, 'Date modified'), el('span', { class: 'fd-c-size' }, 'Size'));
    const grid = el('div', { class: 'fd-grid' },
      el('label', {}, mode === 'folder' ? 'Folder:' : 'File name:'), nameInput, el('button', { class: 'btn default', onclick: accept }, okLabel),
      el('label', {}, mode === 'save' ? 'Save as type:' : 'Files of type:'), mode === 'folder' ? el('span') : typeSel, el('button', { class: 'btn', onclick: () => d.close(null) }, 'Cancel'));
    const body = el('div', { class: 'fd' }, toolbar, el('div', { class: 'fd-listwrap' }, header, list), grid,
      el('label', { class: 'fd-hidden' }, hiddenChk, ' Show hidden files'));
    let cwdParent = null;
    const d = new Dialog({ title: title || (mode === 'open' ? 'Open' : mode === 'save' ? 'Save As' : 'Select a folder'), body, className: 'fd-dlg', onClose: (r) => resolve(r) });
    d.defaultBtn = grid.querySelector('.btn.default');

    pathInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); load(pathInput.value.trim()); } });
    hiddenChk.addEventListener('change', () => { showHidden = hiddenChk.checked; App.settings.showHiddenFiles = showHidden; render(); });
    typeSel.addEventListener('change', () => {
      if (mode === 'save') {
        const l = LANG_BY_ID[typeSel.value];
        const n = nameInput.value.trim();
        if (n && l && l.ext[0]) nameInput.value = n.replace(/(\.[^.]*)?$/, '.' + l.ext[0]);
      }
      render();
    });
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); accept(); } });
    list.addEventListener('keydown', (e) => {
      const rows = $$('.fd-row', list);
      let i = rows.findIndex((r) => r.classList.contains('sel'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        i = Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
        rows[i] && rows[i].dispatchEvent(new MouseEvent('click'));
        rows[i] && rows[i].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        if (rows[i]) rows[i].dispatchEvent(new MouseEvent('dblclick'));
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        if (cwdParent) load(cwdParent);
      }
    });

    function matchesType(name) {
      if (mode === 'save' || typeSel.value === '*' || mode === 'folder') return true;
      const l = LANG_BY_ID[typeSel.value];
      return l && (l.ext.includes(extname(name)) || (l.names || []).includes(name.toLowerCase()));
    }

    function render() {
      list.innerHTML = '';
      for (const ent of entries) {
        if (!showHidden && ent.hidden) continue;
        if (!ent.dir && (mode === 'folder' || !matchesType(ent.name))) continue;
        const row = el('div', { class: 'fd-row' + (ent.dir ? ' dir' : '') },
          el('span', { class: 'fd-c-name' }, el('span', { class: 'ico', html: ent.dir ? ICONS.folder : ICONS.file }), ent.name),
          el('span', { class: 'fd-c-date' }, fmtDate(ent.mtime)),
          el('span', { class: 'fd-c-size' }, ent.dir ? '' : fmtSize(ent.size)));
        row.addEventListener('click', () => {
          $$('.fd-row.sel', list).forEach((r) => r.classList.remove('sel'));
          row.classList.add('sel');
          if (!ent.dir || mode === 'folder') nameInput.value = ent.dir && mode === 'folder' ? ent.name : ent.name;
        });
        row.addEventListener('dblclick', () => {
          if (ent.dir) load(joinPath(cwd, ent.name));
          else { nameInput.value = ent.name; accept(); }
        });
        list.append(row);
      }
    }

    async function load(p) {
      try {
        const r = await api.get('ls', { path: p });
        cwd = r.path;
        cwdParent = r.parent;
        entries = r.entries;
        pathInput.value = cwd;
        if (mode === 'folder') nameInput.value = '';
        render();
        list.scrollTop = 0;
      } catch (err) {
        msgBox(err.message, { icon: 'error', title: 'Error' });
        pathInput.value = cwd;
      }
    }

    async function newFolder() {
      const n = await inputBox('Create New Folder', 'Folder name:', 'New folder');
      if (!n) return;
      try {
        await api.post('mkdir', { path: joinPath(cwd, n) });
        await load(cwd);
      } catch (err) { msgBox(err.message, { icon: 'error' }); }
    }

    async function accept() {
      let n = nameInput.value.trim();
      if (mode === 'folder') {
        const target = n ? (isAbsPath(n) ? n : joinPath(cwd, n)) : cwd;
        const st = await api.get('stat', { path: target });
        if (st.exists && st.dir) { App.settings.lastDir = target; d.close(target); }
        else msgBox(`${target}\nThe folder does not exist.`, { icon: 'warn' });
        return;
      }
      if (!n) return;
      const full = isAbsPath(n) ? n : joinPath(cwd, n);
      const st = await api.get('stat', { path: full });
      if (st.exists && st.dir) { load(full); nameInput.value = ''; return; }
      if (mode === 'open') {
        if (!st.exists) { msgBox(`${basename(full)}\nFile not found.\nCheck the file name and try again.`, { icon: 'warn', title: 'Open' }); return; }
      } else {
        if (st.exists) {
          const r = await msgBox(`${basename(full)} already exists.\nDo you want to replace it?`, { icon: 'warn', title: 'Confirm Save As', buttons: ['Yes', 'No'], defaultButton: 'No' });
          if (r !== 'Yes') return;
        }
      }
      App.settings.lastDir = dirname(full);
      d.close(full);
    }

    d.show();
    load(cwd);
  });
}
