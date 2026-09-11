/**
 * End-to-end of the REAL frontend.
 *
 * jsdom loads public/index.html, we stub the browser globals, mock the two AI
 * upstreams, then import public/js/app.js — the same file the browser runs.
 * Everything asserted below happens inside the actual UI code: boot, chat
 * streaming, markdown → code cards, workspace files, live preview, telemetry.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { JSDOM, VirtualConsole } from 'jsdom';

const PORT = 8799;
const ROOT = new URL('..', import.meta.url).pathname;

let dom, app, clipboard, downloads;
const captured = [];   // body các request gửi lên model
let failAll = false;   // bật lên để giả lập mọi lời gọi model đều 500

const ANSWER = [
  'Đây là trang demo:\n',
  '```html index.html:preview',
  '<!DOCTYPE html><html><head><link rel="stylesheet" href="styles.css"></head>',
  '<body><h1 id="t">ZeKo</h1><script src="app.js"><\/script></body></html>',
  '```',
  '',
  '```css styles.css',
  'h1 { color: #22d3a7; }',
  '```',
  '',
  '```js app.js',
  'console.log("hello from ZeKo");',
  '```',
].join('\n');

const sseText = (text, finish = 'stop') => {
  const enc = new TextEncoder();
  const chunks = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(0, 20) } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(20) } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finish }], usage: { prompt_tokens: 5, completion_tokens: 9, total_tokens: 14 } })}\n\n`,
    'data: [DONE]\n\n',
  ];
  return {
    ok: true, status: 200,
    body: new ReadableStream({ start(c) { for (const ch of chunks) c.enqueue(enc.encode(ch)); c.close(); } }),
    text: async () => chunks.join(''),
  };
};

before(async () => {
  app = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/api/version`)).ok) break; } catch { /* booting */ }
    await sleep(120);
  }

  // nạp key test qua API thật — test không được phụ thuộc config.local.json (file git-ignored)
  await fetch(`http://127.0.0.1:${PORT}/api/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      providers: {
        openrouter: { keys: ['sk-test-deep-1', 'sk-test-deep-2'] },
        tokenrouter: { keys: ['sk-test-flash-1', 'sk-test-flash-2'] },
      },
    }),
  });

  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => { if (!/Could not load|not implemented/i.test(e.message)) console.error('[jsdom]', e.message); });
  vc.on('error', (...a) => console.error('[page error]', ...a));

  dom = new JSDOM(readFileSync(ROOT + 'public/index.html', 'utf8'), {
    url: `http://127.0.0.1:${PORT}/`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });

  const w = dom.window;
  clipboard = [];
  downloads = [];

  const realFetch = globalThis.fetch;
  const fakeFetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1:' + PORT) || u.startsWith('/')) return realFetch(u.startsWith('/') ? `http://127.0.0.1:${PORT}${u}` : u, opts);
    if (u.endsWith('/models')) {
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ data: [{ id: 'z-ai/glm-5.3' }, { id: 'z-ai/glm-5.3-flash' }] }),
      };
    }
    const body = opts.body ? JSON.parse(opts.body) : {};
    captured.push(body);
    if (failAll) {
      return { ok: false, status: 500, statusText: 'Server Error',
        text: async () => JSON.stringify({ error: { message: 'upstream 500 (giả lập)' } }) };
    }
    const flat = JSON.stringify(body.messages || []);
    if (flat.includes('CẮT NGẮN')) return sseText('câu trả lời bị cắt giữa chừng vì hết token', 'length');
    const isSynthesis = /bộ tổng hợp/.test(body.messages?.[0]?.content || '');
    return sseText(isSynthesis ? ANSWER : 'bản nháp nhanh');
  };

  Object.assign(globalThis, {
    window: w,
    document: w.document,
    location: w.location,
    localStorage: w.localStorage,
    HTMLElement: w.HTMLElement,
    Element: w.Element,
    Node: w.Node,
    Event: w.Event,
    CustomEvent: w.CustomEvent,
    KeyboardEvent: w.KeyboardEvent,
    MouseEvent: w.MouseEvent,
    Blob: w.Blob,
    FileReader: w.FileReader,
    requestAnimationFrame: w.requestAnimationFrame.bind(w),
    cancelAnimationFrame: w.cancelAnimationFrame.bind(w),
    getComputedStyle: w.getComputedStyle.bind(w),
    fetch: fakeFetch,
  });
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true });
  globalThis.navigator.clipboard = { writeText: async (t) => { clipboard.push(t); } };
  globalThis.URL.createObjectURL = () => 'blob:mock';
  globalThis.URL.revokeObjectURL = () => {};

  await import('../public/js/app.js');

  for (let i = 0; i < 80; i++) {
    const s = w.document.querySelector('#sbStatus')?.textContent || '';
    if (/sẵn sàng|không có API key/.test(s)) break;
    await sleep(100);
  }
});

after(() => { dom?.window.__zeko?.stop(); app?.kill('SIGTERM'); dom?.window.close(); });

const $ = (s) => dom.window.document.querySelector(s);
const $$ = (s) => [...dom.window.document.querySelectorAll(s)];
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
const idle = async () => {
  await sleep(200);
  await wait(() => $('#stopBtn').classList.contains('hidden') && /hoàn tất|đã dừng/.test($('#sbStatus').textContent), 20000);
  await sleep(150);
};
const wait = async (fn, ms = 12000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(80); }
  return false;
};

test('boot: giao diện khởi động, welcome screen và 2 thẻ provider hiển thị', async () => {
  assert.ok($('.welcome'), 'phải có welcome screen');
  assert.match($('.welcome h1').textContent, /ZeKo/);
  assert.ok($('.caps').children.length >= 6, 'phải liệt kê đủ tính năng');
  assert.equal($$('#providerCards .pcard').length, 2, 'phải có 2 thẻ provider');
  assert.match($('#providerCards').textContent, /OpenRouter/);
  assert.match($('#providerCards').textContent, /TokenRouter/);
  assert.equal($$('#sbKeys .sb-key').length, 4, 'status bar phải hiện 4 API key');
  assert.equal($$('#modeSwitch .mode').length, 4, 'phải có 4 chế độ');
  assert.equal($('.mode.active').dataset.mode, 'fusion');
});

test('boot: server không ra được Internet nên UI tự chuyển sang browser-direct', async () => {
  const box = $('#transportBox').textContent;
  assert.match(box, /trực tiếp từ trình duyệt/, 'phải fallback sang direct mode');
  assert.equal($('#chipTransport').textContent, 'browser direct');
});

test('gửi tin nhắn: stream 2 lane rồi hợp nhất, render code card có nút copy/download', async () => {
  const input = $('#input');
  input.value = 'Làm trang demo 3 file';
  input.dispatchEvent(new dom.window.Event('input'));
  $('#input').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

  assert.ok(await wait(() => $$('.msg.user').length === 1), 'tin nhắn người dùng phải hiện ra');
  assert.ok(await wait(() => ($('.msg.agent .content')?.textContent || '').includes('ZeKo'), 20000), 'câu trả lời phải được stream vào UI');

  const cards = $$('.msg.agent .code-card');
  assert.equal(cards.length, 3, 'phải render đúng 3 code card');
  const html = cards[0];
  assert.match(html.querySelector('.cc-lang').textContent, /HTML/);
  assert.match(html.querySelector('.cc-path').textContent, /index\.html/);
  assert.ok(html.querySelector('.cc-lang').classList.contains('file'), 'file phải được đánh dấu khác snippet');

  const acts = [...html.querySelectorAll('.cc-actions [data-act]')].map((b) => b.dataset.act);
  for (const a of ['preview', 'save', 'open', 'wrap', 'download', 'copy']) {
    assert.ok(acts.includes(a), `code card phải có nút ${a}`);
  }
  assert.ok(html.querySelector('.ln').textContent.trim().length > 0, 'phải có số dòng');
  assert.match(html.querySelector('pre code').innerHTML, /tk-/, 'code phải được tô sáng cú pháp');
});

test('agent tự lưu file vào workspace, có diff và preview chạy được', async () => {
  assert.ok(await wait(() => $$('#fileTree .ft-row').length === 3), 'workspace phải có 3 file');
  assert.deepEqual($$('#fileTree .ft-row').map((r) => r.dataset.path), ['app.js', 'index.html', 'styles.css']);

  const { store } = await import('../public/js/store.mjs');
  assert.match(store.files['index.html'], /<h1 id="t">ZeKo<\/h1>/);
  assert.equal(store.files['styles.css'], 'h1 { color: #22d3a7; }');

  const frame = $('#previewFrame');
  assert.ok(frame?.getAttribute('srcdoc'), 'iframe phải có srcdoc');
  const srcdoc = frame.getAttribute('srcdoc');
  assert.match(srcdoc, /<style data-file="styles\.css">/, 'css phải được inline vào html');
  assert.ok(!/<link[^>]*styles\.css/.test(srcdoc), 'thẻ link cũ phải bị gỡ');
  assert.match(srcdoc, /<script data-file="app\.js">/, 'js phải được inline');
  assert.match(srcdoc, /__zeko/, 'phải tiêm đoạn bắt console');
  assert.deepEqual([...$('#entrySelect').options].map((o) => o.value), ['index.html']);
});

test('telemetry ghi lại model, key, token cho từng luồng', async () => {
  assert.ok(await wait(() => $$('#tele .tele-row').length >= 1));
  const row = $('#tele .tele-row');
  assert.match(row.textContent, /fusion/);
  assert.match(row.textContent, /z-ai\/glm-5\.3-flash/, 'phải ghi model flash');
  assert.match(row.textContent, /z-ai\/glm-5\.3/, 'phải ghi model deep');
  assert.match(row.textContent, /sk-/, 'phải ghi key đã roll');
  assert.equal(row.querySelectorAll('.bar i').length >= 3, true, 'phải có bar cho deep/flash/final');
  const { store } = await import('../public/js/store.mjs');
  assert.ok(store.stats.tokens >= 42, `token phải được cộng dồn (nhận ${store.stats.tokens})`);
  assert.match($('#sbTokens').textContent, /token/);
});

test('nút Copy trên code card copy đúng nội dung code', async () => {
  const card = $$('.msg.agent .code-card')[2]; // app.js
  click(card.querySelector('[data-act="copy"]'));
  await sleep(30);
  assert.equal(clipboard.length, 1);
  assert.equal(clipboard[0], 'console.log("hello from ZeKo");');
});

test('nút Tải xuống tạo blob với đúng tên file', async () => {
  let name = null;
  const origClick = dom.window.HTMLAnchorElement.prototype.click;
  dom.window.HTMLAnchorElement.prototype.click = function () { name = this.download; };
  click($$('.msg.agent .code-card')[1].querySelector('[data-act="download"]'));
  await sleep(20);
  dom.window.HTMLAnchorElement.prototype.click = origClick;
  assert.equal(name, 'styles.css');
});

test('mở file trong editor: có tô sáng, gutter, và sửa được', async () => {
  click($$('#fileTree .ft-row').find((r) => r.dataset.path === 'app.js'));
  await sleep(30);
  assert.equal($('#editorInput').value, 'console.log("hello from ZeKo");');
  assert.match($('#editorHighlight').innerHTML, /tk-/, 'editor phải tô sáng');
  assert.equal($('#gutter').textContent.trim(), '1');
  assert.match($('#crumbs').textContent, /app\.js/);
  assert.ok($('.wb-pane[data-wbpane="code"]').classList.contains('active'), 'phải tự chuyển sang tab Code');

  $('#editorInput').value = 'console.log("đã sửa");';
  $('#editorInput').dispatchEvent(new dom.window.Event('input'));
  await sleep(30);
  const { store } = await import('../public/js/store.mjs');
  assert.equal(store.files['app.js'], 'console.log("đã sửa");');
  assert.ok(Number($('#diffBadge').textContent) >= 1, 'badge diff phải tăng');
});

test('chế độ: đổi sang Turbo thì chỉ còn 1 luồng, không có lane hợp nhất', async () => {
  click($('#modeSwitch .mode[data-mode="turbo"]'));
  await sleep(40);
  const { store } = await import('../public/js/store.mjs');
  assert.equal(store.settings.mode, 'turbo');
  assert.equal($('.mode.active').dataset.mode, 'turbo');

  const input = $('#input');
  input.value = 'Viết hàm trừ';
  input.dispatchEvent(new dom.window.Event('input'));
  click($('#sendBtn'));

  assert.ok(await wait(() => $$('.msg.agent').length === 2, 20000), 'phải có câu trả lời thứ 2');
  assert.ok(await wait(() => ($$('.msg.agent').at(-1).querySelector('.content')?.textContent || '').trim().length > 0), 'nội dung phải render xong');
  const last = $$('.msg.agent').at(-1);
  assert.match(last.querySelector('.content').textContent, /bản nháp nhanh/, 'turbo dùng thẳng câu trả lời của Flash');
  assert.equal(last.querySelector('.lanes'), null, 'turbo không có lane bản nháp');
  assert.match(last.querySelector('.msg-foot').textContent, /token/);
  assert.ok(await wait(() => $('#sbStatus').textContent.includes('hoàn tất')), 'trạng thái phải về hoàn tất');
});

test('slash command: /mode deep đổi đúng chế độ, /help mở bảng lệnh', async () => {
  const input = $('#input');
  input.value = '/mode deep';
  click($('#sendBtn'));
  await sleep(80);
  const { store } = await import('../public/js/store.mjs');
  assert.equal(store.settings.mode, 'deep');
  assert.equal($('.mode.active').dataset.mode, 'deep');
  assert.equal($('#input').value, '', 'lệnh không được để lại trong ô nhập');

  input.value = '/help';
  click($('#sendBtn'));
  await sleep(60);
  assert.equal($('#modalBackdrop').hidden, false, '/help phải mở modal');
  assert.match($('#modalBody').textContent, /\/mode/, 'modal phải liệt kê lệnh');
  click($('#modalClose'));

  input.value = '/khongtonthai';
  click($('#sendBtn'));
  await sleep(60);
  assert.equal($('#input').value, '/khongtonthai', 'lệnh sai phải giữ lại để người dùng sửa');
  input.value = '';
  input.dispatchEvent(new dom.window.Event('input'));
});

test('lưu session xuống localStorage và khôi phục được', async () => {
  const { store, persist } = await import('../public/js/store.mjs');
  persist();
  await sleep(400);
  const raw = dom.window.localStorage.getItem('zeko.code.v1');
  assert.ok(raw, 'phải có dữ liệu trong localStorage');
  const data = JSON.parse(raw);
  assert.equal(data.sessions.length, 1);
  assert.ok(data.sessions[0].messages.length >= 4);
  assert.deepEqual(Object.keys(data.sessions[0].files).sort(), ['app.js', 'index.html', 'styles.css']);
  assert.equal(store.settings.mode, 'deep');
});

test('cấu hình: mở modal, đổi chế độ + thêm API key rồi lưu xuống engine', async () => {
  const { openSettings } = await import('../public/js/ui.mjs');
  const { transport } = await import('../public/js/transport.mjs');
  openSettings();
  await sleep(60);

  assert.equal($('#modalBackdrop').hidden, false, 'modal phải mở');
  assert.equal($$('#modalBody .key-edit input').length, 4, 'phải hiện đủ 4 ô API key');
  assert.equal($$('#modalBody [data-probe]').length, 2, 'mỗi nền tảng phải có nút Dò model');
  assert.equal($('#setMode').value, 'deep', 'select phải phản ánh chế độ hiện tại');

  $('#setMode').value = 'relay';
  click($('#modalBody [data-addkey="tokenrouter"]'));
  const keyInputs = $$('#modalBody .keys[data-p="tokenrouter"] input');
  assert.equal(keyInputs.length, 3, 'phải thêm được ô key mới');
  keyInputs.at(-1).value = 'sk-them-moi';

  click($('#modalFoot #setSave'));
  await sleep(200);

  assert.equal($('#modalBackdrop').hidden, true, 'modal phải đóng sau khi lưu');
  const { store } = await import('../public/js/store.mjs');
  assert.equal(store.settings.mode, 'relay');
  assert.equal($('.mode.active').dataset.mode, 'relay', 'thanh chế độ phải cập nhật');
  const h = await transport.health();
  assert.equal(h.tokenrouter.keys.length, 3, 'engine phải nạp key mới ngay');
  assert.equal(h.tokenrouter.keys[2].masked, '••••oi');
});

test('hết max_tokens: hiện nút "Viết tiếp" + tốc độ tok/s, bấm thì sinh lượt mới', async () => {
  const before = $$('.msg').length;
  const input = $('#input');
  input.value = 'Viết bài thật dài, CẮT NGẮN giữa chừng';
  input.dispatchEvent(new dom.window.Event('input'));
  click($('#sendBtn'));

  assert.ok(await wait(() => $$('.msg').length >= before + 2, 20000), 'phải có lượt trả lời mới');
  assert.ok(await wait(() => !!$('[data-continue]'), 8000), 'phải hiện nút Viết tiếp khi finish_reason=length');
  assert.match($('.msg.agent:last-of-type .msg-foot').textContent, /tok\/s/, 'footer phải hiện tốc độ');

  click($('[data-continue]'));
  assert.ok(await wait(() => $$('.msg').length >= before + 4, 20000), 'bấm Viết tiếp phải sinh thêm 1 lượt user + 1 lượt agent');
  const { activeSession } = await import('../public/js/store.mjs');
  const texts = activeSession().messages.map((m) => m.content);
  assert.ok(texts.some((t) => /Viết tiếp phần còn lại/.test(t)), 'phải có tin nhắn nối mạch trong lịch sử');
  assert.ok(await wait(() => /hoàn tất/.test($('#sbStatus').textContent), 15000), 'đợi lượt nối mạch kết thúc');
});

test('@-mention: gõ @ hiện popup file, Enter chèn đường dẫn, file vào ngữ cảnh', async () => {
  const input = $('#input');
  input.value = 'sửa lỗi trong @ind';
  input.selectionStart = input.selectionEnd = input.value.length;
  input.dispatchEvent(new dom.window.Event('input'));
  await sleep(40);

  assert.equal($('#mentionBox').hidden, false, 'popup @ phải hiện');
  const items = $$('#mentionBox .mi');
  assert.ok(items.some((i) => i.dataset.f === 'index.html'), 'phải gợi ý index.html');

  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await sleep(40);
  assert.equal($('#mentionBox').hidden, true, 'popup phải đóng sau khi chọn');
  assert.equal(input.value, 'sửa lỗi trong @index.html ');

  captured.length = 0;
  click($('#sendBtn'));
  const sysOf = (b) => (b.messages?.[0]?.role === 'system' ? b.messages[0].content : '');
  assert.ok(await wait(() => captured.some((b) => sysOf(b).includes('File người dùng đang nói tới')), 20000),
    'file nhắc bằng @ phải được đưa vào system prompt');
  const sys = sysOf(captured.find((b) => sysOf(b).includes('File người dùng đang nói tới')));
  assert.match(sys, /### index\.html/, 'phải kèm nội dung file được nhắc');
  assert.match(sys, /<h1 id="t">ZeKo<\/h1>/, 'phải kèm đúng nội dung index.html');
  await idle();
});

test('paste ảnh vào ô nhập → thành attachment (vision)', async () => {
  const input = $('#input');
  const file = new dom.window.File([new dom.window.Uint8Array([137, 80, 78, 71])], 'bug.png', { type: 'image/png' });
  const ev = new dom.window.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clipboardData', {
    value: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }], files: [file] },
  });
  input.dispatchEvent(ev);
  assert.ok(await wait(() => $$('#attachRow .attach').length === 1, 5000), 'phải hiện chip ảnh đính kèm');
  assert.match($('#attachRow').textContent, /bug\.png/);
  assert.ok($('#attachRow img'), 'ảnh phải có thumbnail');
  $$('#attachRow .attach .icon-btn').forEach((b) => click(b)); // dọn
});

test('quick-ask trên code card: bấm "Tìm bug" thì gửi đúng prompt review', async () => {
  const card = $$('.msg.agent .code-card')[0];
  assert.ok(card.querySelector('.cc-ask [data-ask="bug"]'), 'card phải có nút Tìm bug');
  captured.length = 0;
  click(card.querySelector('.cc-ask [data-ask="bug"]'));
  assert.ok(await wait(() => captured.length > 0, 15000), 'phải gửi lượt mới lên model');
  const user = captured[0].messages.at(-1);
  const text = typeof user.content === 'string' ? user.content : JSON.stringify(user.content);
  assert.match(text, /Review code/, 'prompt phải là yêu cầu review');
  assert.match(text, /index\.html/, 'phải nói rõ file nào');
  assert.ok(await wait(() => /hoàn tất/.test($('#sbStatus').textContent), 15000));
});

test('nút "về cuối" hoạt động khi người dùng cuộn lên', async () => {
  const btn = $('#toBottom');
  btn.hidden = false;
  click(btn);
  await sleep(20);
  assert.equal(btn.hidden, true, 'bấm xong phải ẩn nút và cuộn về cuối');
});

test('gõ "/" hiện bảng lệnh tắt, Enter chọn lệnh', async () => {
  await idle();
  captured.length = 0;
  const input = $('#input');
  const box = $('#slashBox');

  input.value = '/mo';
  input.selectionStart = input.selectionEnd = 3;
  input.dispatchEvent(new dom.window.Event('input'));
  assert.equal(box.hidden, false, 'popup lệnh phải hiện khi gõ /');
  const cmds = $$('#slashBox .mi').map((el) => el.dataset.c);
  assert.deepEqual(cmds, ['/mode'], `lọc theo tiền tố phải ra đúng /mode (thấy: ${cmds.join(', ')})`);

  // Enter chọn lệnh cần tham số → điền "/mode " chứ chưa gửi
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(input.value, '/mode ', 'lệnh có tham số phải được điền kèm khoảng trắng');
  assert.equal(box.hidden, true, 'popup phải đóng sau khi chọn');
  await sleep(300);
  assert.equal(captured.length, 0, 'mới điền lệnh thì chưa được gọi model');

  // Escape đóng popup
  input.value = '/th';
  input.selectionStart = input.selectionEnd = 3;
  input.dispatchEvent(new dom.window.Event('input'));
  assert.equal(box.hidden, false, 'popup phải hiện lại');
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(box.hidden, true, 'Escape phải đóng popup');

  // lệnh không tham số → chạy luôn
  input.value = '/help';
  input.selectionStart = input.selectionEnd = 5;
  input.dispatchEvent(new dom.window.Event('input'));
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await sleep(200);
  assert.equal($('#modalBackdrop').hidden, false, 'chọn /help phải mở bảng lệnh');
  assert.match($('#modalBody').textContent, /\/mode|Lệnh tắt/);
  $('#modalClose')?.click();
  $('#modalBackdrop').hidden = true;
  input.value = '';
  input.dispatchEvent(new dom.window.Event('input'));
});

test('lượt chat lỗi → nút Thử lại gửi đúng câu hỏi cũ, không nhân đôi tin', async () => {
  await idle();
  failAll = true;
  const input = $('#input');
  input.value = 'sửa giúp tôi lỗi này';
  input.dispatchEvent(new dom.window.Event('input'));
  const before = captured.length;
  click($('#sendBtn'));
  assert.ok(await wait(() => $('[data-retry]'), 60000), 'ô báo lỗi phải có nút Thử lại');
  assert.match($('#sbStatus').textContent, /lỗi/i, 'không được báo "hoàn tất" cho một lượt hỏng');
  assert.match($('#stream').textContent, /Không hoàn thành được lượt này/);

  const st = dom.window.__zeko.store;
  const sess = () => st.sessions.find((x) => x.id === st.activeId);
  const nU = sess().messages.filter((m) => m.role === 'user').length;
  const nA = sess().messages.filter((m) => m.role === 'assistant').length;

  failAll = false;
  click($('[data-retry]'));
  assert.ok(await wait(() => captured.length > before, 40000), 'bấm Thử lại phải gọi model lần nữa');
  assert.ok(await wait(() => /hoàn tất/.test($('#sbStatus').textContent), 40000), 'lượt thử lại phải chạy tới nơi tới chốn');

  assert.equal(sess().messages.filter((m) => m.role === 'user').length, nU, 'không được lặp câu hỏi');
  assert.equal(sess().messages.filter((m) => m.role === 'assistant').length, nA, 'câu trả lời lỗi phải bị thay, không nhân đôi');
  assert.ok(sess().messages.at(-1).content.length > 20, 'câu trả lời mới phải có nội dung');
  assert.ok(!sess().messages.some((m) => m.meta?.failed), 'không được còn tin đánh dấu failed sau khi thử lại thành công');
  assert.ok(!$('#stream').textContent.includes('upstream 500'), 'không được còn ô lỗi cũ trên màn hình');
  await idle();
});

test('ngữ cảnh quá dài → tự bỏ tin cũ nhất cho vừa cửa sổ', async () => {
  await idle();
  const input = $('#input');
  const big = 'A'.repeat(130_000);

  captured.length = 0;
  input.value = big;
  input.dispatchEvent(new dom.window.Event('input'));
  click($('#sendBtn'));
  assert.ok(await wait(() => captured.length > 0, 20000), 'lượt 1 phải gửi đi');
  await idle();

  captured.length = 0;
  input.value = big;
  input.dispatchEvent(new dom.window.Event('input'));
  click($('#sendBtn'));
  assert.ok(await wait(() => captured.length > 0, 20000), 'lượt 2 phải gửi đi');

  const msgs = captured[0].messages;
  const giants = msgs.filter((m) => typeof m.content === 'string' && m.content.length > 100_000);
  assert.equal(giants.length, 1, `chỉ được giữ 1 tin 130k, tin cũ phải bị cắt (thấy ${giants.length}/${msgs.length} tin)`);
  const total = msgs.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : 0), 0);
  assert.ok(total < 200_000, `tổng ngữ cảnh phải dưới ngân sách (thực tế ${total})`);
  await idle();
});
