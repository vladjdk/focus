// Local server: serves the board and a small /api/tasks backed by a CSV file.
//   node server.mjs         serve the production build in dist/
//   node server.mjs --dev   serve through Vite with hot reload
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './lib/store.mjs';
import { createUpdater, restartProcess } from './lib/updater.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const dev = process.argv.includes('--dev');
const PORT = Number(process.env.PORT) || 5180;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_FILE = resolve(root, process.env.DATA_FILE || 'data/tasks.csv');
const store = createStore(DATA_FILE);

const isDate = v => typeof v === 'string' && (!v || /^\d{4}-\d{2}-\d{2}$/.test(v));
const isStr = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.length <= max;
const isNum = (v, max) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
function cleanLinks(v) {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > 20) return null;
  const out = [];
  for (const l of v) {
    if (!l || !isStr(l.label ?? '', 0, 200) || !isStr(l.url, 1, 2000) || !/^https?:\/\/\S+$/i.test(l.url.trim())) return null;
    out.push({ label: (l.label ?? '').trim(), url: l.url.trim() });
  }
  return out;
}
function parseTask(b) {
  if (!b || !isStr(b.id, 1, 100) || !isStr(b.title, 1, 160) || typeof b.notes !== 'string' || b.notes.length > 2000) return null;
  if (!Number.isInteger(b.q) || b.q < 0 || b.q > 3 || !isNum(b.x, 1760) || !isNum(b.y, 1460) || typeof b.done !== 'boolean' || !isDate(b.due)) return null;
  const sources = cleanLinks(b.sources), links = cleanLinks(b.links);
  if (sources === null || links === null) return null;
  // aged_from restarts a task's hourglass ("flip it"); optional ISO timestamp.
  if (b.aged_from !== undefined && (typeof b.aged_from !== 'string' || (b.aged_from && Number.isNaN(Date.parse(b.aged_from))))) return null;
  return { id: b.id, title: b.title.trim(), notes: b.notes, q: b.q, x: b.x, y: b.y, done: b.done, due: b.due, sources, links, aged_from: b.aged_from };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}
async function readJson(req) {
  if (!req.headers['content-type']?.includes('application/json')) throw Object.assign(Error('JSON required'), { status: 415 });
  let data = '';
  for await (const chunk of req) { data += chunk; if (data.length > 64_000) throw Object.assign(Error('Too large'), { status: 413 }); }
  try { return JSON.parse(data); } catch { throw Object.assign(Error('Invalid JSON'), { status: 400 }); }
}

async function api(req, res) {
  try {
    if (req.method === 'GET') {
      const tasks = (await store.list()).map(({ updated_at, generated, ...t }) => t);
      return send(res, 200, { tasks });
    }
    if (req.method === 'PUT') {
      const t = parseTask(await readJson(req));
      if (!t) return send(res, 400, { error: 'Invalid task' });
      await store.upsert(t);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      const b = await readJson(req);
      if (!isStr(b?.id, 1, 100)) return send(res, 400, { error: 'Invalid task' });
      await store.remove(b.id);
      return send(res, 200, { ok: true });
    }
    send(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, PUT, DELETE' });
  } catch (e) {
    if (e.status) return send(res, e.status, { error: e.message });
    console.error('Board operation failed', e);
    send(res, 503, { error: 'Board storage is temporarily unavailable. Please try again.' });
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2' };
const dist = join(root, 'dist');
async function serveStatic(req, res) {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  let file = join(dist, path);
  if (!file.startsWith(dist)) { res.writeHead(403); return res.end(); }
  let body;
  try { body = await readFile(file); } catch { file = join(dist, 'index.html'); body = await readFile(file); }
  const immutable = file.includes(`${dist}/assets/`);
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' });
  res.end(body);
}

let vite;
if (dev) {
  const { createServer } = await import('vite');
  vite = await createServer({ root, server: { middlewareMode: true }, appType: 'spa' });
} else {
  try { await readFile(join(dist, 'index.html')); }
  catch { console.error('No build found in dist/. Run `npm run build` first, or `npm run dev`.'); process.exit(1); }
}

const updater = createUpdater({ root, dev, restart: () => restartProcess(server) });
async function updateApi(req, res) {
  try {
    if (req.method === 'GET') {
      const { tag, error, ...info } = await updater.check(new URL(req.url, 'http://x').searchParams.has('force'));
      return send(res, 200, info);
    }
    if (req.method === 'POST') {
      // Updating runs git and npm, so only this page may ask for it: JSON forces a
      // CORS preflight for other sites, and the Origin must be the board itself.
      await readJson(req);
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'Forbidden' });
      return send(res, 200, await updater.apply());
    }
    send(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, POST' });
  } catch (e) {
    if (e.status) return send(res, e.status, { error: e.message });
    console.error('Update failed', e);
    send(res, 500, { error: 'The update did not finish. Nothing was lost; try again, or update by hand.' });
  }
}

const server = http.createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (path === '/api/tasks') return api(req, res);
  if (path === '/api/update') return updateApi(req, res);
  if (vite) return vite.middlewares(req, res);
  serveStatic(req, res).catch(e => { console.error(e); res.writeHead(500); res.end(); });
});
// After a self-restart the old process may still hold the port for a moment.
let attempts = 0;
server.on('error', e => {
  if (e.code === 'EADDRINUSE' && ++attempts <= 20) return setTimeout(() => server.listen(PORT, HOST), 250);
  throw e;
});
server.listen(PORT, HOST, () => {
  console.log(`Focus v${updater.current} on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}${dev ? ' (dev)' : ''}`);
  console.log(`Data file: ${DATA_FILE}`);
});
