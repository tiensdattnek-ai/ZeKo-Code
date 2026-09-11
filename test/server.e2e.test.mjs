/**
 * End-to-end: browser-less HTTP test of the real server.
 *
 *   node:test  →  spawns `node server/index.js`
 *             →  POST /api/config points both platforms at a local fake upstream
 *             →  POST /api/chat and reads the Server-Sent Events back
 *
 * This exercises server/index.js, the SSE relay, key rotation over the wire and
 * the fusion event protocol — none of it is re-implemented here.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 8798;
const UPSTREAM = 8797;
const BASE = `http://127.0.0.1:${PORT}`;

let app;         // ZeKo server process
let upstream;    // fake OpenAI-compatible endpoint
let upstreamHits = [];

const sse = (res, chunks) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
};

before(async () => {
  upstream = createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      upstreamHits.push({ url: req.url, auth: req.headers.authorization, model: body.model, sys: body.messages?.[0]?.content?.slice(0, 60) });
      if (req.url.endsWith('/models')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ data: [{ id: 'm-deep' }, { id: 'm-flash' }] }));
      }
      const isSynthesis = /bộ tổng hợp/.test(body.messages?.[0]?.content || '');
      const text = isSynthesis ? 'ĐÁP ÁN CUỐI' : `nháp từ ${body.model}`;
      sse(res, [
        { choices: [{ delta: { content: text.slice(0, 4) } }] },
        { choices: [{ delta: { content: text.slice(4) } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 7, completion_tokens: 4, total_tokens: 11 } },
      ]);
    });
  });
  await new Promise((r) => upstream.listen(UPSTREAM, '127.0.0.1', r));

  app = spawn(process.execPath, ['server/index.js'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  app.stderr.on('data', (d) => process.env.DEBUG_E2E && console.error('[app]', String(d)));

  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return; } catch { /* not up yet */ }
    await sleep(120);
  }
  throw new Error('server không khởi động được');
});

after(async () => {
  app?.kill('SIGTERM');
  await new Promise((r) => upstream?.close(r));
});

async function readSSE(res) {
  const events = [];
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      const data = block.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('');
      if (data) { try { events.push(JSON.parse(data)); } catch { /* skip */ } }
    }
  }
  return events;
}

const post = (path, body) => fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('server: /api/version + /api/config không lộ key thật', async () => {
  const v = await fetch(`${BASE}/api/version`).then((r) => r.json());
  assert.equal(v.name, 'ZeKo Code');
  const keys = await fetch(`${BASE}/api/keys`).then((r) => r.json());
  assert.equal(keys.providers.openrouter.keys.length, 2, 'phải có 2 key OpenRouter (seed hoặc file)');
  assert.match(keys.providers.openrouter.keys[0], /^sk-or-v1-[0-9a-f]{64}$/, 'key ghép lại phải đúng dạng OpenRouter');
  assert.match(keys.providers.tokenrouter.keys[0], /^sk-[A-Za-z0-9]{40,}$/, 'key ghép lại phải đúng dạng TokenRouter');

  const c = await fetch(`${BASE}/api/config`).then((r) => r.json());
  assert.equal(c.providers.openrouter.keyCount, 2);
  assert.ok(!/sk-[A-Za-z0-9_-]{20,}/.test(JSON.stringify(c)), 'config công khai không được chứa key đầy đủ');
  assert.match(c.providers.openrouter.keys[0].masked, /…/, 'key phải được che bớt');
});

test('server: trỏ 2 nền tảng về upstream giả rồi /api/chat stream đúng giao thức', async () => {
  const cfg = await post('/api/config', {
    providers: {
      openrouter: { baseUrl: `http://127.0.0.1:${UPSTREAM}/v1`, models: ['m-deep'], keys: ['k-deep-1', 'k-deep-2'] },
      tokenrouter: { baseUrl: `http://127.0.0.1:${UPSTREAM}/v1`, models: ['m-flash'], keys: ['k-flash-1'] },
    },
  }).then((r) => r.json());
  assert.equal(cfg.ok, true);

  const res = await post('/api/chat', {
    messages: [{ role: 'user', content: 'viết hàm cộng' }],
    system: 'Bạn là ZeKo Code', question: 'viết hàm cộng', mode: 'fusion',
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const events = await readSSE(res);

  const errs = events.filter((e) => e.t === 'stream_error' || e.t === 'error');
  assert.deepEqual(errs, [], 'không được có lỗi luồng (regression: req.on("close") từng abort ngay lập tức)');
  const deltas = (s) => events.filter((e) => e.t === 'delta' && e.stream === s).map((e) => e.text).join('');
  assert.equal(deltas('deep'), 'nháp từ m-deep');
  assert.equal(deltas('flash'), 'nháp từ m-flash');
  assert.equal(deltas('final'), 'ĐÁP ÁN CUỐI');

  const done = events.find((e) => e.t === 'done');
  assert.ok(done, 'phải có event done');
  assert.equal(done.meta.streams.length, 3);
  assert.equal(done.meta.tokens, 33);
  assert.ok(events.some((e) => e.t === 'close'), 'phải đóng stream bằng event close');

  // lượt synthesis phải đi kèm cả 2 bản nháp
  const synth = upstreamHits.filter((h) => /bộ tổng hợp/.test(h.sys || ''));
  assert.equal(synth.length, 1);
});

test('server: key được roll vòng qua từng request', async () => {
  const usedBefore = upstreamHits.length;
  for (let i = 0; i < 2; i++) {
    const res = await post('/api/chat', { messages: [{ role: 'user', content: 'x' }], mode: 'turbo' });
    await readSSE(res);
  }
  const keys = upstreamHits.slice(usedBefore).map((h) => h.auth);
  assert.deepEqual(keys, ['Bearer k-flash-1', 'Bearer k-flash-1'], 'tokenrouter chỉ có 1 key nên dùng lại');
  const h = await fetch(`${BASE}/api/health`).then((r) => r.json());
  assert.equal(h.tokenrouter.keys[0].calls >= 2, true, 'health phải đếm số lượt gọi');
});

test('server: /api/probe trả về danh sách model và chốt model đang tồn tại', async () => {
  const r = await post('/api/probe', {}).then((r) => r.json());
  assert.equal(r.results.openrouter.ok, true);
  assert.deepEqual(r.results.openrouter.models, ['m-deep', 'm-flash']);
});

test('server: session CRUD ghi xuống data/ và đọc lại được', async () => {
  const put = await fetch(`${BASE}/api/sessions/abc123`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Test chat', messages: [{ role: 'user', content: 'hi' }] }),
  }).then((r) => r.json());
  assert.equal(put.ok, true);

  const get = await fetch(`${BASE}/api/sessions/abc123`).then((r) => r.json());
  assert.equal(get.title, 'Test chat');

  const list = await fetch(`${BASE}/api/sessions`).then((r) => r.json());
  assert.ok(list.sessions.some((s) => s.id === 'abc123'));

  const del = await fetch(`${BASE}/api/sessions/abc123`, { method: 'DELETE' }).then((r) => r.json());
  assert.equal(del.ok, true);
  const gone = await fetch(`${BASE}/api/sessions/abc123`);
  assert.equal(gone.status, 404);
});

test('server: path traversal trong session id bị chặn', async () => {
  const r = await fetch(`${BASE}/api/sessions/..%2F..%2Fpackage`);
  assert.equal(r.status, 404);
});

test('server: /api/chat với messages rỗng → 400', async () => {
  const r = await post('/api/chat', { messages: [] });
  assert.equal(r.status, 400);
});
