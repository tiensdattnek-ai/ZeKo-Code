import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FusionEngine, parseSSE, ApiError, scoreModel } from '../src/shared/fusion.mjs';
import { maskKey } from '../src/shared/config.mjs';
import { extractArtifacts, parseDiff, applyDiff, artifactsToFiles, buildPreview, workspaceDigest } from '../src/shared/artifacts.mjs';

/* ------------------------------------------------------------- test utils */

const PROVIDERS = {
  openrouter: {
    id: 'openrouter', label: 'OpenRouter', role: 'deep', baseUrl: 'https://or.test/v1',
    models: ['z-ai/glm-5.3', 'z-ai/glm-4.6'], keys: ['sk-or-AAA', 'sk-or-BBB'],
  },
  tokenrouter: {
    id: 'tokenrouter', label: 'TokenRouter', role: 'flash', baseUrl: 'https://tr.test/v1',
    models: ['z-ai/glm-5.3-flash'], keys: ['sk-tr-CCC', 'sk-tr-DDD'],
  },
};

const enc = new TextEncoder();
function sse(chunks, status = 200) {
  const body = new ReadableStream({
    start(c) { for (const ch of chunks) c.enqueue(enc.encode(ch)); c.close(); },
  });
  return {
    ok: status >= 200 && status < 300, status, body,
    text: async () => chunks.join(''),
  };
}
const dataOf = (text, extra = {}) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text }, ...extra }], ...extra.top })}\n\n`;

/** Stream a full answer as 2 chunks + usage + [DONE]. */
function okStream(text) {
  const half = Math.ceil(text.length / 2);
  return sse([
    dataOf(text.slice(0, half)),
    dataOf(text.slice(half)),
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`,
    'data: [DONE]\n\n',
  ]);
}

/** Programmable mock fetch that records every call. */
function mockFetch(handler) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : null;
    const auth = (opts.headers?.Authorization || '').replace('Bearer ', '');
    const call = { url: String(url), key: auth, model: body?.model, messages: body?.messages, body };
    calls.push(call);
    return handler(call, calls.length);
  };
  fn.calls = calls;
  return fn;
}

const collect = async (gen) => {
  const events = [];
  for await (const e of gen) events.push(e);
  return events;
};
const text = (events, stream = 'final') =>
  events.filter((e) => e.t === 'delta' && e.stream === stream).map((e) => e.text).join('');

const baseReq = {
  messages: [{ role: 'user', content: 'Viết hàm cộng' }],
  system: 'Bạn là ZeKo Code',
  question: 'Viết hàm cộng',
};

/* ------------------------------------------------------------- SSE parser */

test('parseSSE: gộp chunk bị cắt giữa dòng và dừng ở [DONE]', async () => {
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode('data: {"a":'));
      c.enqueue(enc.encode('1}\n\ndata: [DONE]\n\n'));
      c.close();
    },
  });
  const got = [];
  for await (const ev of parseSSE(stream)) got.push(ev.data);
  assert.deepEqual(got, ['{"a":1}', '[DONE]']);
});

test('parseSSE: bỏ qua comment và dòng event rỗng', async () => {
  const stream = new ReadableStream({
    start(c) { c.enqueue(enc.encode(': ping\n\nevent: message\ndata: hi\n\n')); c.close(); },
  });
  const got = [];
  for await (const ev of parseSSE(stream)) got.push(ev.data);
  assert.deepEqual(got, ['hi']);
});

/* ----------------------------------------------------------- key rotation */

test('xoay vòng key: 2 lượt gọi dùng 2 key khác nhau', async () => {
  const f = mockFetch(() => okStream('ok'));
  const engine = new FusionEngine({ providers: PROVIDERS, fetchImpl: f });
  await engine.complete({ pid: 'openrouter', messages: [], label: 'final' });
  await engine.complete({ pid: 'openrouter', messages: [], label: 'final' });
  assert.deepEqual(f.calls.map((c) => c.key), ['sk-or-AAA', 'sk-or-BBB']);
});

test('429 → tạm nghỉ key đó và roll sang key kế tiếp trong cùng lượt', async () => {
  const f = mockFetch((c) => (c.key === 'sk-or-AAA' ? sse(['{"error":{"message":"rate limited"}}'], 429) : okStream('đáp án từ key 2')));
  const engine = new FusionEngine({ providers: PROVIDERS, fetchImpl: f });
  const r = await engine.complete({ pid: 'openrouter', messages: [], label: 'final' });
  assert.equal(r.text, 'đáp án từ key 2');
  assert.equal(f.calls.length, 2);
  const h = engine.health().openrouter;
  assert.equal(h.keys[0].cooling, true, 'key 1 phải đang cooldown');
  assert.equal(h.keys[0].lastStatus, 429);
  assert.equal(h.keys[1].cooling, false);
});

test('401 → key bị loại vĩnh viễn, các lượt sau không dùng lại', async () => {
  const f = mockFetch((c) => (c.key === 'sk-or-AAA' ? sse(['{"error":{"message":"invalid api key"}}'], 401) : okStream('ok')));
  const engine = new FusionEngine({ providers: PROVIDERS, fetchImpl: f });
  await engine.complete({ pid: 'openrouter', messages: [], label: 'final' });
  await engine.complete({ pid: 'openrouter', messages: [], label: 'final' });
  const used = f.calls.map((c) => c.key);
  assert.equal(used[0], 'sk-or-AAA');
  assert.equal(used[1], 'sk-or-BBB');
  assert.equal(used[2], 'sk-or-BBB', 'key chết không được dùng lại');
  assert.equal(engine.health().openrouter.keys[0].permanent, true);
});

test('mọi key chết → engine báo lỗi rõ ràng thay vì treo', async () => {
  const f = mockFetch(() => sse(['{"error":{"message":"nope"}}'], 401));
  const engine = new FusionEngine({ providers: PROVIDERS, fetchImpl: f });
  await assert.rejects(
    () => engine.complete({ pid: 'openrouter', messages: [], label: 'final' }),
    (e) => e instanceof ApiError && /401/.test(e.message),
  );
  assert.equal(engine.health().openrouter.live, false);
});

/* -------------------------------------------------------- model fallback */

test('model 404 → tự rơi xuống model kế tiếp trong danh sách', async () => {
  const f = mockFetch((c) => (c.model === 'z-ai/glm-5.3' ? sse(['{"error":{"message":"model not found"}}'], 404) : okStream('chạy với glm-4.6')));
  const engine = new FusionEngine({ providers: PROVIDERS, fetchImpl: f });
  const r = await engine.complete({ pid: 'openrouter', messages: [], label: 'final' });
  assert.equal(r.text, 'chạy với glm-4.6');
  assert.deepEqual(f.calls.map((c) => c.model), ['z-ai/glm-5.3', 'z-ai/glm-4.6']);
  assert.equal(engine.health().openrouter.model, 'z-ai/glm-4.6');
});

test('lỗi mạng → thử key khác rồi mới chịu thua', async () => {
  let n = 0;
  const f = mockFetch(async () => {
    n++;
    if (n < 3) throw new TypeError('fetch failed');
    return okStream('đã khôi phục');
  });
  const engine = new FusionEngine({ providers: PROVIDERS, fetchImpl: f });
  const r = await engine.complete({ pid: 'tokenrouter', messages: [], label: 'final' });
  assert.equal(r.text, 'đã khôi phục');
  assert.equal(f.calls.length, 3);
});

/* ------------------------------------------------------------ fusion mode */

test('FUSION: 2 model chạy song song rồi hợp nhất thành 1 đáp án', async () => {
  const f = mockFetch((c) => {
    if (c.url.includes('or.test')) {
      return c.messages[0].content.includes('bộ tổng hợp')
        ? okStream('FINAL: add có kiểm tra Number.isFinite')
        : okStream('```js add.js\nconst add=(a,b)=>a+b;\n```');
    }
    return okStream('```js add.js\nconst add=(a,b)=>a+b\n```');
  });
  const engine = new FusionEngine({ providers: PROVIDERS, fetchImpl: f });
  const events = await collect(engine.run({ ...baseReq, mode: 'fusion' }));

  assert.equal(text(events, 'deep'), '```js add.js\nconst add=(a,b)=>a+b;\n```');
  assert.equal(text(events, 'flash'), '```js add.js\nconst add=(a,b)=>a+b\n```');
  assert.equal(text(events, 'final'), 'FINAL: add có kiểm tra Number.isFinite');

  const done = events.find((e) => e.t === 'done');
  assert.equal(done.meta.mode, 'fusion');
  assert.equal(done.meta.streams.length, 3, 'deep + flash + synthesis');
  assert.equal(done.meta.tokens, 45, '15 token × 3 lượt');

  // lượt hợp nhất phải nhận được cả 2 bản nháp
  const synth = f.calls.find((c) => c.messages?.[0]?.content?.includes('bộ tổng hợp'));
  assert.ok(synth, 'phải có lượt synthesis');
  assert.match(synth.messages[1].content, /BẢN NHÁP A[\s\S]*add=\(a,b\)=>a\+b/);
  assert.match(synth.messages[1].content, /BẢN NHÁP B/);
});

test('FUSION: một model chết → cảnh báo và dùng model còn sống', async () => {
  const f = mockFetch((c) => (c.url.includes('tr.test') ? sse(['{"error":{"message":"quota"}}'], 429) : okStream('bản deep thắng')));
  const engine = new FusionEngine({ providers: PROVIDERS, fetchImpl: f });
  const events = await collect(engine.run({ ...baseReq, mode: 'fusion' }));
  const warn = events.find((e) => e.t === 'warn');
  assert.ok(warn && /Chỉ một model phản hồi/.test(warn.message), 'phải có cảnh báo degrade');
  assert.equal(text(events, 'deep'), 'bản deep thắng');
  assert.ok(events.some((e) => e.t === 'done'));
});

test('FUSION: cả hai chết → lỗi fatal có thông điệp hành động được', async () => {
  const f = mockFetch(() => sse(['{"error":{"message":"down"}}'], 500));
  const engine = new FusionEngine({ providers: PROVIDERS, fetchImpl: f });
  const events = await collect(engine.run({ ...baseReq, mode: 'fusion' }));
  const err = events.find((e) => e.t === 'error');
  assert.ok(err && err.fatal, 'phải có error fatal');
  assert.match(err.message, /tab Trạng thái/);
});

test('RELAY: flash nháp → deep viết lại bản cuối, có kèm bản nháp trong context', async () => {
  const f = mockFetch((c) => (c.url.includes('tr.test') ? okStream('nháp nhanh') : okStream('bản cuối đã phản biện')));
  const engine = new FusionEngine({ providers: PROVIDERS, fetchImpl: f });
  const events = await collect(engine.run({ ...baseReq, mode: 'relay' }));
  assert.equal(text(events, 'draft'), 'nháp nhanh');
  assert.equal(text(events, 'final'), 'bản cuối đã phản biện');
  const refine = f.calls.find((c) => c.url.includes('or.test'));
  assert.equal(refine.messages.at(-2).content, 'nháp nhanh');
});

test('TURBO: chỉ dùng flash, và tự đổi sang deep khi flash sập', async () => {
  const f = mockFetch((c) => (c.url.includes('tr.test') ? okStream('trả lời turbo') : okStream('fallback deep')));
  const engine = new FusionEngine({ providers: PROVIDERS, fetchImpl: f });
  const ev1 = await collect(engine.run({ ...baseReq, mode: 'turbo' }));
  assert.equal(text(ev1, 'final'), 'trả lời turbo');
  assert.equal(f.calls.filter((c) => c.url.includes('or.test')).length, 0);

  const f2 = mockFetch((c) => (c.url.includes('tr.test') ? sse(['{"error":{"message":"nope"}}'], 401) : okStream('fallback deep')));
  const e2 = new FusionEngine({ providers: PROVIDERS, fetchImpl: f2 });
  const ev2 = await collect(e2.run({ ...baseReq, mode: 'turbo' }));
  assert.equal(text(ev2, 'final'), 'fallback deep');
});

test('abort từ người dùng → dừng sạch, có error aborted', async () => {
  const ctrl = new AbortController();
  const f = mockFetch(async () => { ctrl.abort(); const e = new Error('aborted'); e.name = 'AbortError'; throw e; });
  const engine = new FusionEngine({ providers: PROVIDERS, fetchImpl: f });
  const events = await collect(engine.run({ ...baseReq, mode: 'turbo', signal: ctrl.signal }));
  const err = events.find((e) => e.t === 'error') || events.find((e) => e.t === 'stream_error');
  assert.ok(err, 'phải báo lỗi khi huỷ');
});

test('reload(): đổi key/model giữa chừng thì engine dùng ngay, key còn giữ nguyên thì giữ trạng thái', async () => {
  const f = mockFetch((c) => (c.key === 'sk-or-BBB' ? sse(['{"error":{"message":"rate limited"}}'], 429) : okStream('ok')));
  const engine = new FusionEngine({ providers: PROVIDERS, fetchImpl: f });
  await engine.complete({ pid: 'openrouter', messages: [], label: 'final' }); // AAA ok
  await engine.complete({ pid: 'openrouter', messages: [], label: 'final' }); // BBB 429 → cooling

  const next = {
    ...PROVIDERS,
    openrouter: { ...PROVIDERS.openrouter, keys: ['sk-or-BBB', 'sk-or-EEE'], models: ['m-moi'] },
  };
  const h = engine.reload(next);
  assert.deepEqual(h.openrouter.keys.map((k) => k.masked), [maskKey('sk-or-BBB'), maskKey('sk-or-EEE')]);
  assert.equal(h.openrouter.model, 'm-moi', 'model mới phải được dùng ngay');
  assert.equal(h.openrouter.keys[0].cooling, true, 'key BBB vẫn còn → phải giữ cooldown');
  assert.equal(h.openrouter.keys[1].calls, 0, 'key mới bắt đầu từ 0 lượt');

  await engine.complete({ pid: 'openrouter', messages: [], label: 'final' });
  assert.equal(f.calls.at(-1).key, 'sk-or-EEE', 'phải roll sang key mới, không dùng key mặc định cũ');
  assert.equal(f.calls.at(-1).model, 'm-moi');
});

test('probe(): đọc /models và chốt model id đang tồn tại', async () => {
  const f = mockFetch(() => ({
    ok: true, status: 200,
    text: async () => JSON.stringify({ data: [{ id: 'z-ai/glm-4.6' }, { id: 'z-ai/glm-5.3' }] }),
  }));
  const engine = new FusionEngine({ providers: PROVIDERS, fetchImpl: f });
  const r = await engine.probe('openrouter');
  assert.equal(r.ok, true);
  assert.equal(engine.modelFor('openrouter'), 'z-ai/glm-5.3');
});

test('scoreModel: deep né bản flash, flash ưu tiên bản nhanh, model lạ điểm thấp', () => {
  assert.ok(scoreModel('z-ai/glm-5.3', 'deep') > scoreModel('z-ai/glm-5.3-flash', 'deep'));
  assert.ok(scoreModel('z-ai/glm-5.3-flash', 'flash') > scoreModel('z-ai/glm-5.3', 'flash'));
  assert.ok(scoreModel('meta-llama/llama-3.3', 'deep') < 100, 'model không thuộc họ GLM phải dưới ngưỡng');
  assert.ok(scoreModel('z-ai/glm-5.3-free', 'flash') >= 100);
});

test('probe(): model cấu hình không còn → tự chọn model GLM tốt nhất theo vai trò', async () => {
  const f = mockFetch((c) => ({
    ok: true, status: 200,
    text: async () => JSON.stringify({
      data: c.url.includes('or.test')
        ? [{ id: 'meta-llama/llama-3.3' }, { id: 'vendor/glm-5.3-preview' }, { id: 'vendor/glm-5.3-flash-x' }]
        : [{ id: 'z-ai/glm-5.3-turbo' }, { id: 'z-ai/glm-5.3' }],
    }),
  }));
  const engine = new FusionEngine({ providers: PROVIDERS, fetchImpl: f });

  const deep = await engine.probe('openrouter');
  assert.equal(deep.picked, 'vendor/glm-5.3-preview', 'deep phải chọn bản không-flash');
  assert.equal(engine.modelFor('openrouter'), 'vendor/glm-5.3-preview');

  const flash = await engine.probe('tokenrouter');
  assert.equal(flash.picked, 'z-ai/glm-5.3-turbo', 'flash phải ưu tiên bản nhanh');
});

/* --------------------------------------------------------------- artifacts */

test('extractArtifacts: fence có đường dẫn = file, có :preview, snippet thường', () => {
  const md = [
    'Giải thích ngắn.',
    '```tsx src/App.tsx',
    'export default () => <b>hi</b>;',
    '```',
    '```html index.html:preview',
    '<h1>Hi</h1>',
    '```',
    '```js',
    'console.log(1); // snippet, không phải file',
    '```',
  ].join('\n');
  const a = extractArtifacts(md);
  assert.equal(a.length, 3);
  assert.equal(a[0].path, 'src/App.tsx');
  assert.equal(a[0].lang, 'tsx');
  assert.equal(a[0].isFile, true);
  assert.equal(a[1].path, 'index.html');
  assert.equal(a[1].autoPreview, true);
  assert.equal(a[2].path, '');
  assert.equal(a[2].isFile, false);
});

test('extractArtifacts: fence lồng nhau và fence chưa đóng khi đang stream', () => {
  const nested = '```markdown demo.md\nVí dụ:\n```js\nx=1\n```\n```';
  const a = extractArtifacts(nested);
  assert.equal(a.length, 1, 'fence lồng phải nằm trong 1 artifact');
  assert.equal(a[0].path, 'demo.md');
  assert.match(a[0].code, /```js/);

  const open = extractArtifacts('```python main.py\nprint(1)');
  assert.equal(open.length, 1);
  assert.equal(open[0].unterminated, true);
  assert.equal(open[0].code, 'print(1)');
});

test('applyDiff: thêm/xoá đúng chỗ, kể cả khi context lệch dòng', () => {
  const original = 'line1\nline2\nline3\nline4\n';
  const diff = ' line1\n-line2\n+line2-fixed\n line3\n';
  const r = applyDiff(original, diff);
  assert.equal(r.ok, true);
  assert.equal(r.content, 'line1\nline2-fixed\nline3\nline4\n', 'giữ nguyên newline cuối của file gốc');

  const fuzzy = applyDiff('a\nb\nc\nd\ne\n', ' b\n-c\n+C\n d\n');
  assert.equal(fuzzy.ok, true);
  assert.equal(fuzzy.content, 'a\nb\nC\nd\ne\n');
});

test('artifactsToFiles: tạo mới, ghi đè và áp diff vào file có sẵn', () => {
  const md = '```js a.js\nconst a=1;\n```\n```diff a.js\n-const a=1;\n+const a=2;\n```';
  const { files, log } = artifactsToFiles(extractArtifacts(md), {});
  assert.equal(files['a.js'], 'const a=2;');
  assert.equal(log[0].kind, 'create');
  assert.equal(log[1].kind, 'patch');
});

test('buildPreview: gộp css/js vào html và gỡ thẻ link/script cũ', () => {
  const files = {
    'index.html': '<html><head><link rel="stylesheet" href="styles.css"></head><body><div id="r"></div><script src="app.js"></script></body></html>',
    'styles.css': 'body{background:#000}',
    'app.js': 'document.getElementById("r").textContent = "</scr" + "ipt an toàn";',
  };
  const p = buildPreview(files);
  assert.equal(p.ok, true);
  assert.equal(p.entry, 'index.html');
  assert.match(p.html, /<style data-file="styles\.css">/);
  assert.ok(!/<link[^>]*styles\.css/.test(p.html), 'thẻ <link> cũ phải bị gỡ');
  assert.ok(!/<script src="app\.js">/.test(p.html), 'thẻ <script src> cũ phải bị gỡ');
  assert.equal(p.used.length, 2);
});

test('buildPreview: không có html → báo lý do thay vì crash', () => {
  assert.deepEqual(buildPreview({ 'a.js': '1' }), { ok: false, reason: 'no-html' });
});

test('workspaceDigest: liệt kê cây thư mục và cắt bớt file dài', () => {
  const files = { 'index.html': '<h1>x</h1>', 'big.js': 'y'.repeat(5000) };
  const d = workspaceDigest(files, { maxChars: 2000 });
  assert.match(d, /- index\.html \(1 lines\)/);
  assert.match(d, /big\.js/);
  assert.ok(d.length < 3000);
  assert.equal(workspaceDigest({}), '');
});

test('parseDiff: đọc đúng tiền tố và bỏ qua header ---/+++', () => {
  const ops = parseDiff('--- a.js\n+++ a.js\n context\n+add\n-del\n');
  assert.deepEqual(ops.map((o) => o.type), ['meta', 'meta', 'keep', 'add', 'del']);
});
