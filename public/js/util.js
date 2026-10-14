'use strict';
// Shared helpers: DOM, server API, paths, keys, hashing.

const APP_NAME = 'Notepluspp';
const APP_VERSION = '1.0';
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function el(tag, attrs, ...children) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

function debounce(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

function fmtNum(n) {
  return Number(n).toLocaleString('en-US');
}

function fmtDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtSize(n) {
  if (n == null) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.ceil(n / 1024) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

let pathSep = '/';
function basename(p) { return String(p).split(/[\\/]/).filter(Boolean).pop() || p; }
function dirname(p) {
  const s = String(p).replace(/[\\/]+$/, '');
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return i <= 0 ? s.slice(0, i + 1) || '/' : s.slice(0, i);
}
function extname(p) { const b = basename(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1).toLowerCase() : ''; }
function joinPath(dir, name) {
  if (!dir) return name;
  return dir.replace(/[\\/]+$/, '') + pathSep + name;
}
function isAbsPath(p) { return /^([a-zA-Z]:[\\/]|\/|~)/.test(p); }

const api = {
  async get(name, params = {}) {
    const r = await fetch(`/api/${name}?${new URLSearchParams(params)}`);
    const j = await r.json().catch(() => ({ error: r.statusText }));
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  },
  async post(name, body, opts = {}) {
    const r = await fetch(`/api/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: !!opts.keepalive,
    });
    const j = await r.json().catch(() => ({ error: r.statusText }));
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  },
};

// Key names are normalized to "Ctrl+Alt+Shift+Key". On macOS, Cmd counts as Ctrl.
function keyFromEvent(e) {
  let k;
  const code = e.code || '';
  if (/^Key[A-Z]$/.test(code)) k = code.slice(3);
  else if (/^Digit\d$/.test(code)) k = code.slice(5);
  else if (/^Numpad\d$/.test(code)) k = 'Num' + code.slice(6);
  else if (code === 'NumpadAdd') k = 'Num+';
  else if (code === 'NumpadSubtract') k = 'Num-';
  else if (code === 'NumpadDivide') k = 'Num/';
  else if (code === 'NumpadMultiply') k = 'Num*';
  else if (code === 'NumpadEnter') k = 'Enter';
  else if (code === 'Equal') k = '=';
  else if (code === 'Minus') k = '-';
  else if (code === 'Slash') k = '/';
  else if (code === 'Backslash') k = '\\';
  else if (code === 'Comma') k = ',';
  else if (code === 'Period') k = '.';
  else if (code === 'Backquote') k = '`';
  else if (code === 'BracketLeft') k = '[';
  else if (code === 'BracketRight') k = ']';
  else if (code === 'Semicolon') k = ';';
  else if (code === 'Quote') k = "'";
  else {
    const map = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', ' ': 'Space', Esc: 'Escape' };
    k = map[e.key] || e.key;
  }
  if (!k || ['Control', 'Shift', 'Alt', 'Meta', 'OS', 'AltGraph'].includes(k)) return null;
  if (k.length === 1) k = k.toUpperCase();
  const mods = [];
  if (e.ctrlKey || e.metaKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  return [...mods, k].join('+');
}

// Compact MD5 (RFC 1321) over a Uint8Array, returns hex.
function md5(bytes) {
  const K = new Int32Array(64), S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
  const len = bytes.length, nBlocks = ((len + 8) >> 6) + 1;
  const W = new Int32Array(nBlocks * 16);
  for (let i = 0; i < len; i++) W[i >> 2] |= bytes[i] << ((i % 4) * 8);
  W[len >> 2] |= 0x80 << ((len % 4) * 8);
  W[nBlocks * 16 - 2] = (len * 8) | 0;
  W[nBlocks * 16 - 1] = Math.floor(len / 0x20000000);
  let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
  for (let blk = 0; blk < nBlocks; blk++) {
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      const s = S[(i >> 4) * 4 + (i % 4)];
      const tmp = D; D = C; C = B;
      const x = (A + F + K[i] + W[blk * 16 + g]) | 0;
      B = (B + ((x << s) | (x >>> (32 - s)))) | 0;
      A = tmp;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }
  return [a0, b0, c0, d0].map((v) => Array.from({ length: 4 }, (_, i) => ((v >>> (i * 8)) & 255).toString(16).padStart(2, '0')).join('')).join('');
}

async function hashText(algo, text) {
  const bytes = new TextEncoder().encode(text);
  if (algo === 'md5') return md5(bytes);
  const name = { sha1: 'SHA-1', sha256: 'SHA-256', sha512: 'SHA-512' }[algo];
  const buf = await crypto.subtle.digest(name, bytes);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = el('textarea', { style: { position: 'fixed', left: '-9999px' } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}
