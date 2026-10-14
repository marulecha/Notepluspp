// Noteplus++ server: serves the UI and gives it read/write access to local files.
// It binds to 127.0.0.1 only and rejects requests from other hosts or origins.

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');

const HOST = '127.0.0.1';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const CM_DIR = path.join(ROOT, 'node_modules', 'codemirror');
// The desktop app moves this to ~/Library/Application Support, since the app bundle is read-only.
let DATA_DIR = path.join(ROOT, 'data');
let SESSION_FILE = path.join(DATA_DIR, 'session.json');
const MAX_READ = 64 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.xml': 'text/xml; charset=utf-8', '.pdf': 'application/pdf',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm',
};

// Filled in by start() once the port is known.
const ALLOWED_HOSTS = new Set();

function hostAllowed(host) {
  return ALLOWED_HOSTS.has(String(host || '').toLowerCase());
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (origin) {
    try { if (!hostAllowed(new URL(origin).host)) return false; } catch { return false; }
  }
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;
  return true;
}

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function json(res, obj, code = 200) {
  send(res, code, JSON.stringify(obj), 'application/json; charset=utf-8');
}

function fail(res, err, code = 400) {
  json(res, { error: err && err.message ? err.message : String(err) }, code);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 200 * 1024 * 1024) { reject(new Error('Request too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function absPath(p) {
  if (!p) throw new Error('Missing path');
  if (p === '~' || p.startsWith('~/')) p = path.join(os.homedir(), p.slice(1));
  return path.resolve(p);
}

// Encoding helpers. Encoding ids: utf8, utf8bom, utf16le, utf16be, ansi.
function decode(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: buf.subarray(3).toString('utf8'), encoding: 'utf8bom' };
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { text: buf.subarray(2).toString('utf16le'), encoding: 'utf16le' };
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const body = Buffer.from(buf.subarray(2, 2 + ((buf.length - 2) & ~1)));
    body.swap16();
    return { text: body.toString('utf16le'), encoding: 'utf16be' };
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), encoding: 'utf8' };
  } catch {
    return { text: buf.toString('latin1'), encoding: 'ansi' };
  }
}

// Decodes with a caller-chosen encoding (Encoding > Encode in ...), dropping a matching BOM.
function decodeAs(buf, encoding) {
  const has = (...b) => b.every((x, i) => buf[i] === x);
  switch (encoding) {
    case 'ansi': return buf.toString('latin1');
    case 'utf16le': return buf.subarray(has(0xff, 0xfe) ? 2 : 0).toString('utf16le');
    case 'utf16be': {
      const start = has(0xfe, 0xff) ? 2 : 0;
      const body = Buffer.from(buf.subarray(start, start + ((buf.length - start) & ~1)));
      body.swap16();
      return body.toString('utf16le');
    }
    default: return buf.subarray(has(0xef, 0xbb, 0xbf) ? 3 : 0).toString('utf8');
  }
}

function encode(text, encoding) {
  switch (encoding) {
    case 'utf8bom': return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]);
    case 'utf16le': return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
    case 'utf16be': {
      const body = Buffer.from(text, 'utf16le');
      body.swap16();
      return Buffer.concat([Buffer.from([0xfe, 0xff]), body]);
    }
    case 'ansi': return Buffer.from(text, 'latin1');
    default: return Buffer.from(text, 'utf8');
  }
}

function detectEol(text) {
  const i = text.search(/\r\n|\n|\r/);
  if (i < 0) return null;
  if (text[i] === '\r') return text[i + 1] === '\n' ? '\r\n' : '\r';
  return '\n';
}

function isBinary(buf) {
  if (buf.length >= 2 && ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff))) return false;
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

// Convert "*.js *.txt !*.min.js" into include/exclude tests.
function makeFilter(filters) {
  const parts = String(filters || '*.*').split(/[\s;,]+/).filter(Boolean);
  const toRe = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
  const inc = [], exc = [];
  for (const p of parts) {
    if (p.startsWith('!')) exc.push(toRe(p.slice(1)));
    else inc.push(p === '*.*' ? /.*/ : toRe(p));
  }
  if (!inc.length) inc.push(/.*/);
  return (name) => inc.some((r) => r.test(name)) && !exc.some((r) => r.test(name));
}

async function walk(dir, opts, out, limit = 50000) {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (out.length >= limit) return;
    if (!opts.hidden && e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (opts.subfolders) await walk(full, opts, out, limit);
    } else if (e.isFile() && opts.filter(e.name)) {
      out.push(full);
    }
  }
}

function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 10) starts.push(i + 1);
    else if (c === 13) { if (text.charCodeAt(i + 1) === 10) i++; starts.push(i + 1); }
  }
  return starts;
}

function lineOf(starts, idx) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= idx) lo = mid; else hi = mid - 1;
  }
  return lo;
}

async function findInFiles(body) {
  const dir = absPath(body.dir);
  const re = new RegExp(body.source, body.flags.includes('g') ? body.flags : body.flags + 'g');
  const files = [];
  await walk(dir, { hidden: !!body.hidden, subfolders: body.subfolders !== false, filter: makeFilter(body.filters) }, files);
  const results = [];
  let hits = 0;
  const maxHits = 20000;
  for (const file of files) {
    if (hits >= maxHits) break;
    let buf;
    try {
      const st = await fsp.stat(file);
      if (st.size > 20 * 1024 * 1024) continue;
      buf = await fsp.readFile(file);
    } catch { continue; }
    if (isBinary(buf)) continue;
    const { text } = decode(buf);
    re.lastIndex = 0;
    let m, starts = null;
    const lines = [];
    while ((m = re.exec(text)) && hits < maxHits) {
      if (m[0].length === 0) re.lastIndex++;
      if (!starts) starts = lineStarts(text);
      const ln = lineOf(starts, m.index);
      const ls = starts[ln];
      let le = ln + 1 < starts.length ? starts[ln + 1] : text.length;
      while (le > ls && (text[le - 1] === '\n' || text[le - 1] === '\r')) le--;
      const prev = lines[lines.length - 1];
      const col = m.index - ls;
      const end = Math.min(col + m[0].length, le - ls);
      if (prev && prev.line === ln) prev.ranges.push([col, end]);
      else lines.push({ line: ln, text: text.slice(ls, Math.min(le, ls + 1000)), ranges: [[col, end]] });
      hits++;
    }
    if (lines.length) results.push({ path: file, hits: lines.reduce((a, l) => a + l.ranges.length, 0), lines });
  }
  return { searched: files.length, hits, results };
}

async function replaceInFiles(body) {
  const dir = absPath(body.dir);
  const re = new RegExp(body.source, body.flags.includes('g') ? body.flags : body.flags + 'g');
  const files = [];
  await walk(dir, { hidden: !!body.hidden, subfolders: body.subfolders !== false, filter: makeFilter(body.filters) }, files);
  let count = 0, changed = 0;
  for (const file of files) {
    let buf;
    try {
      const st = await fsp.stat(file);
      if (st.size > 20 * 1024 * 1024) continue;
      buf = await fsp.readFile(file);
    } catch { continue; }
    if (isBinary(buf)) continue;
    const { text, encoding } = decode(buf);
    let n = 0;
    const out = text.replace(re, (...args) => { n++; return expandJsReplacement(body.replacement, args); });
    if (n && out !== text) {
      await fsp.writeFile(file, encode(out, encoding));
      count += n;
      changed++;
    }
  }
  return { count, files: changed, searched: files.length };
}

// Applies a JS-style replacement string ($1, $&, $$) given String.replace callback args.
function expandJsReplacement(rep, args) {
  let groups = args[args.length - 1];
  const hasNamed = typeof groups === 'object' && groups !== null;
  const caps = args.slice(0, hasNamed ? -3 : -2);
  if (!hasNamed) groups = null;
  return rep.replace(/\$(\$|&|\d{1,2}|<([^>]+)>)/g, (all, tok, name) => {
    if (tok === '$') return '$';
    if (tok === '&') return caps[0];
    if (name !== undefined) return groups && groups[name] != null ? groups[name] : '';
    const n = parseInt(tok, 10);
    return n < caps.length ? (caps[n] == null ? '' : caps[n]) : all;
  });
}

const routes = {
  'GET /api/info': async () => ({
    home: os.homedir(), sep: path.sep, platform: process.platform, cwd: process.cwd(), version: require('./package.json').version,
  }),

  'GET /api/ls': async (q) => {
    const dir = absPath(q.path || os.homedir());
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const list = [];
    for (const e of entries) {
      const full = path.join(dir, e.name);
      let st = null;
      try { st = await fsp.stat(full); } catch { /* broken link */ }
      const isDir = st ? st.isDirectory() : e.isDirectory();
      list.push({ name: e.name, dir: isDir, size: st && !isDir ? st.size : null, mtime: st ? st.mtimeMs : null, hidden: e.name.startsWith('.') });
    }
    list.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
    const parent = path.dirname(dir);
    return { path: dir, parent: parent !== dir ? parent : null, entries: list };
  },

  'GET /api/stat': async (q) => {
    const p = absPath(q.path);
    try {
      const st = await fsp.stat(p);
      return { exists: true, dir: st.isDirectory(), size: st.size, mtime: st.mtimeMs, ctime: st.birthtimeMs || st.ctimeMs, writable: await fsp.access(p, fs.constants.W_OK).then(() => true, () => false) };
    } catch {
      return { exists: false };
    }
  },

  'GET /api/read': async (q) => {
    const p = absPath(q.path);
    const st = await fsp.stat(p);
    if (st.isDirectory()) throw new Error(`${p} is a directory`);
    if (st.size > MAX_READ) throw new Error(`File is too big to be opened (${st.size} bytes)`);
    const buf = await fsp.readFile(p);
    const { text, encoding } = q.encoding ? { text: decodeAs(buf, q.encoding), encoding: q.encoding } : decode(buf);
    const writable = await fsp.access(p, fs.constants.W_OK).then(() => true, () => false);
    return { path: p, content: text, encoding, eol: detectEol(text), mtime: st.mtimeMs, size: st.size, writable };
  },

  'POST /api/write': async (_q, body) => {
    const p = absPath(body.path);
    await fsp.mkdir(path.dirname(p), { recursive: true });
    await fsp.writeFile(p, encode(String(body.content ?? ''), body.encoding || 'utf8'));
    const st = await fsp.stat(p);
    return { path: p, mtime: st.mtimeMs, size: st.size };
  },

  'POST /api/rename': async (_q, body) => {
    const from = absPath(body.from), to = absPath(body.to);
    if (fs.existsSync(to)) throw new Error(`${to} already exists`);
    await fsp.rename(from, to);
    return { path: to };
  },

  'POST /api/mkdir': async (_q, body) => {
    const p = absPath(body.path);
    await fsp.mkdir(p, { recursive: true });
    return { path: p };
  },

  'GET /api/session': async () => {
    try { return JSON.parse(await fsp.readFile(SESSION_FILE, 'utf8')); } catch { return {}; }
  },

  'POST /api/session': async (_q, body) => {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    const tmp = SESSION_FILE + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(body));
    await fsp.rename(tmp, SESSION_FILE);
    return { ok: true };
  },

  'POST /api/find': async (_q, body) => findInFiles(body),
  'POST /api/replace': async (_q, body) => replaceInFiles(body),

  'GET /api/hash': async (q) => {
    const algo = { md5: 'md5', sha1: 'sha1', sha256: 'sha256', sha512: 'sha512' }[q.algo];
    if (!algo) throw new Error('Unknown algorithm');
    const buf = await fsp.readFile(absPath(q.path));
    return { hash: crypto.createHash(algo).update(buf).digest('hex') };
  },

  // Opens Finder/Terminal (or the platform equivalent) at a file's folder. No user-supplied commands.
  'POST /api/reveal': async (_q, body) => {
    const p = absPath(body.path);
    const dir = fs.existsSync(p) && fs.statSync(p).isDirectory() ? p : path.dirname(p);
    let cmd, args;
    if (process.platform === 'darwin') {
      if (body.how === 'terminal') { cmd = 'open'; args = ['-a', 'Terminal', dir]; }
      else { cmd = 'open'; args = fs.existsSync(p) ? ['-R', p] : [dir]; }
    } else if (process.platform === 'win32') {
      if (body.how === 'terminal') { cmd = 'cmd.exe'; args = ['/c', 'start', 'cmd.exe', '/K', 'cd', '/d', dir]; }
      else { cmd = 'explorer.exe'; args = ['/select,', p]; }
    } else {
      cmd = 'xdg-open'; args = [dir];
    }
    await new Promise((resolve) => execFile(cmd, args, () => resolve()));
    return { ok: true };
  },
};

async function serveStatic(res, baseDir, rel) {
  const file = path.normalize(path.join(baseDir, rel));
  if (!file.startsWith(baseDir)) return send(res, 403, 'Forbidden');
  try {
    const st = await fsp.stat(file);
    if (st.isDirectory()) return serveStatic(res, baseDir, path.join(rel, 'index.html'));
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch {
    send(res, 404, 'Not found');
  }
}

const server = http.createServer(async (req, res) => {
  if (!hostAllowed(req.headers.host)) return send(res, 403, 'Forbidden host');
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  try {
    if (pathname.startsWith('/api/')) {
      if (!originAllowed(req)) return fail(res, 'Cross-origin request refused', 403);
      const handler = routes[`${req.method} ${pathname}`];
      if (!handler) return fail(res, 'Unknown endpoint', 404);
      let body = {};
      if (req.method === 'POST') {
        if (!String(req.headers['content-type'] || '').startsWith('application/json')) return fail(res, 'JSON required', 415);
        body = await readBody(req);
      }
      return json(res, await handler(Object.fromEntries(url.searchParams), body));
    }
    // Serves a local file as-is so HTML files can be viewed with their relative assets.
    if (pathname.startsWith('/preview/')) {
      const file = absPath(pathname.slice('/preview'.length));
      return serveStatic(res, path.parse(file).root, path.relative(path.parse(file).root, file));
    }
    if (pathname.startsWith('/cm/')) return serveStatic(res, CM_DIR, pathname.slice(4));
    return serveStatic(res, PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname.slice(1));
  } catch (err) {
    fail(res, err, err.code === 'ENOENT' ? 404 : 400);
  }
});

// Starts the server and resolves to the port it listens on. Port 0 picks a free port.
function start({ port = 7777, dataDir } = {}) {
  if (dataDir) {
    DATA_DIR = dataDir;
    SESSION_FILE = path.join(DATA_DIR, 'session.json');
  }
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, () => {
      const actual = server.address().port;
      ALLOWED_HOSTS.add(`localhost:${actual}`);
      ALLOWED_HOSTS.add(`127.0.0.1:${actual}`);
      resolve(actual);
    });
  });
}

module.exports = { start };

if (require.main === module) {
  start({ port: Number(process.env.PORT) || 7777 }).then((port) => {
    console.log(`Noteplus++ running at http://localhost:${port}`);
  });
}
