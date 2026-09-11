/**
 * ZeKo Code — server.
 *
 * Two jobs:
 *  1. Serve the workbench UI (static files, vendored libs, no build step).
 *  2. Proxy the fusion engine to the browser as Server-Sent Events, so the API
 *     keys never have to live in the page when the host has outbound access.
 *
 * If this host cannot reach the upstream (sandboxed egress), the browser detects
 * it from the `transport` probe and switches to "direct mode" — same engine file,
 * executed client-side. Nothing else changes.
 */

import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';

import { FusionEngine } from '../src/shared/fusion.mjs';
import { config, applyOverrides, publicConfig, ENV_KEYS } from '../src/shared/config.mjs';
import { TITLE_SYSTEM } from '../src/shared/prompt.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';

/**
 * API key lives in `config.local.json` (git-ignored) or in env vars — never in
 * the committed source. Env wins, because it is what a host/deploy provides.
 */
const LOCAL_CONFIG = join(ROOT, 'config.local.json');
if (existsSync(LOCAL_CONFIG)) {
  try {
    applyOverrides(JSON.parse(await readFile(LOCAL_CONFIG, 'utf8')));
  } catch (e) {
    console.warn(`[zeko] bỏ qua config.local.json: ${e.message}`);
  }
}
// env áp cuối cùng → deploy luôn ghi đè được file local
const envPatch = Object.fromEntries(Object.entries(ENV_KEYS).filter(([, k]) => k.length).map(([id, k]) => [id, { keys: k }]));
if (Object.keys(envPatch).length) applyOverrides({ providers: envPatch });

const engine = new FusionEngine({ providers: config.providers });
const app = express();
app.use(express.json({ limit: '24mb' }));

/* ------------------------------------------------------------ static files */

const nm = (...p) => join(ROOT, 'node_modules', ...p);
app.use('/shared', express.static(join(ROOT, 'src/shared'), { maxAge: '0', etag: false }));
app.use('/vendor/hljs', express.static(nm('highlight.js/styles')));
app.get('/vendor/marked.esm.js', (_req, res) => res.type('text/javascript').sendFile(nm('marked/lib/marked.esm.js')));
app.get('/vendor/purify.es.mjs', (_req, res) => res.type('text/javascript').sendFile(nm('dompurify/dist/purify.es.mjs')));
app.get('/vendor/jszip.min.js', (_req, res) => res.type('text/javascript').sendFile(nm('jszip/dist/jszip.min.js')));
app.get('/vendor/babel.min.js', (_req, res) => res.type('text/javascript').sendFile(nm('@babel/standalone/babel.min.js')));
app.get('/vendor/react.production.min.js', (_req, res) => res.type('text/javascript').sendFile(nm('react/umd/react.production.min.js')));
app.get('/vendor/react-dom.production.min.js', (_req, res) => res.type('text/javascript').sendFile(nm('react-dom/umd/react-dom.production.min.js')));
app.use(express.static(join(ROOT, 'public'), { extensions: ['html'] }));

/* ------------------------------------------------------------------- meta */

app.get('/api/version', (_req, res) => {
  res.json({ name: 'ZeKo Code', version: '1.0.0', node: process.version, mode: config.defaults.mode });
});

/** Config without secrets — the UI status bar uses this. */
app.get('/api/config', (_req, res) => res.json(publicConfig()));

/** Runtime overrides (keys / models / defaults) — memory only, never written to git. */
app.post('/api/config', (req, res) => {
  applyOverrides(req.body || {});
  engine.reload(config.providers); // engine giữ state theo key — phải nạp lại, không thì key mới bị bỏ qua
  res.json({ ok: true, config: publicConfig(), health: engine.health() });
});

/** Full keys — required for browser "direct mode". Local app only. */
app.get('/api/keys', (_req, res) => {
  res.json({
    providers: Object.fromEntries(Object.entries(config.providers).map(([id, p]) => [id, {
      id, label: p.label, role: p.role, baseUrl: p.baseUrl, models: p.models, keys: p.keys, headers: p.headers, color: p.color,
    }])),
    defaults: config.defaults,
  });
});

app.get('/api/health', (_req, res) => res.json(engine.health()));

/** Real round-trip to each platform: proves keys + egress before the user types. */
app.post('/api/probe', async (req, res) => {
  const only = req.body?.provider;
  const ids = only ? [only] : Object.keys(config.providers);
  const out = {};
  await Promise.all(ids.map(async (id) => { out[id] = await engine.probe(id); }));
  res.json({ ok: true, results: out, health: engine.health() });
});

/* ------------------------------------------------------------- chat (SSE) */

app.post('/api/chat', async (req, res) => {
  const { messages = [], system = '', mode = 'fusion', temperature = 0.35, maxTokens = 8192, question = '', autoReview = false } = req.body || {};
  if (!messages.length) return res.status(400).json({ error: 'messages rỗng' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: hello\ndata: ${JSON.stringify({ transport: 'server', mode })}\n\n`);

  const ctrl = new AbortController();
  // `req` closes as soon as its body is read — only the RESPONSE closing means
  // the client actually went away.
  res.on('close', () => { if (!res.writableEnded) ctrl.abort(); });

  const send = (event) => {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    for await (const ev of engine.run({ messages, system, mode, temperature, maxTokens, question, autoReview, signal: ctrl.signal })) {
      send(ev);
    }
  } catch (e) {
    send({ t: 'error', message: e?.message || String(e), fatal: true });
  } finally {
    if (!res.writableEnded) { res.write(`data: ${JSON.stringify({ t: 'close' })}\n\n`); res.end(); }
  }
});

/** Short conversation title (used by the sidebar). */
app.post('/api/title', async (req, res) => {
  const { question = '' } = req.body || {};
  const pid = engine.byRole('flash') || engine.byRole('deep');
  if (!pid) return res.status(503).json({ error: 'chưa cấu hình provider nào' });
  try {
    const r = await engine.complete({
      pid,
      messages: [{ role: 'system', content: TITLE_SYSTEM }, { role: 'user', content: question.slice(0, 800) }],
      temperature: 0.2, maxTokens: 40, label: 'title',
    });
    res.json({ title: clean(r.text) });
  } catch (e) {
    res.status(502).json({ error: e?.message || 'title failed', fallback: clean(question).slice(0, 40) });
  }
});
const clean = (s) => String(s || '').replace(/^["'\s]+|["'\s.]+$/g, '').split('\n')[0].trim();

/* -------------------------------------------------------- session storage */

const safeId = (id) => String(id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
const sessionPath = (id) => join(DATA_DIR, `session-${id}.json`);

app.get('/api/sessions', async (_req, res) => {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    const { readdir } = await import('node:fs/promises');
    const names = await readdir(DATA_DIR);
    const items = [];
    for (const n of names.filter((f) => /^session-.*\.json$/.test(f))) {
      try {
        const raw = JSON.parse(await readFile(join(DATA_DIR, n), 'utf8'));
        items.push({ id: raw.id, title: raw.title, updatedAt: raw.updatedAt, messages: (raw.messages || []).length });
      } catch { /* ignore corrupt file */ }
    }
    items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    res.json({ sessions: items });
  } catch (e) { res.status(500).json({ error: e?.message }); }
});

app.get('/api/sessions/:id', async (req, res) => {
  const id = safeId(req.params.id);
  try {
    if (!existsSync(sessionPath(id))) return res.status(404).json({ error: 'not found' });
    res.json(JSON.parse(await readFile(sessionPath(id), 'utf8')));
  } catch (e) { res.status(500).json({ error: e?.message }); }
});

app.put('/api/sessions/:id', async (req, res) => {
  const id = safeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id không hợp lệ' });
  try {
    await mkdir(DATA_DIR, { recursive: true });
    const payload = { ...req.body, id, updatedAt: Date.now() };
    await writeFile(sessionPath(id), JSON.stringify(payload), 'utf8');
    res.json({ ok: true, id, updatedAt: payload.updatedAt });
  } catch (e) { res.status(500).json({ error: e?.message }); }
});

app.delete('/api/sessions/:id', async (req, res) => {
  const id = safeId(req.params.id);
  try { await unlink(sessionPath(id)); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e?.message }); }
});

/* -------------------------------------------------------------- fallbacks */

app.use('/api', (_req, res) => res.status(404).json({ error: 'không có endpoint này' }));
app.use((err, _req, res, _next) => {
  console.error('[zeko]', err);
  res.status(500).json({ error: err?.message || 'server error' });
});

createServer(app).listen(PORT, HOST, () => {
  const keyCount = Object.values(config.providers).reduce((n, p) => n + (p.keys?.length || 0), 0);
  console.log(`\n  ⚡ ZeKo Code  →  http://localhost:${PORT}`);
  console.log(`     providers: ${Object.entries(config.providers).map(([id, p]) => `${p.label}(${p.role}:${(p.keys || []).length} keys, ${p.models?.[0]})`).join('  ')}`);
  if (keyCount) console.log(`     tổng ${keyCount} API key sẵn sàng roll\n`);
  else console.log(`     ⚠ chưa có API key nào — tạo config.local.json (xem config.local.example.json) hoặc dán key trong tab Cấu hình\n`);
});
