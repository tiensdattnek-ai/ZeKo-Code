/**
 * Boot UI khi KHÔNG có API key nào (ZEKO_NO_KEYS=1).
 * Đây là đường hồi phục sau khi sandbox reset: app phải tự mở tab Cấu hình
 * và nói rõ phải làm gì, chứ không im lặng chết.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { JSDOM, VirtualConsole } from 'jsdom';

const PORT = 8803;
const ROOT = new URL('..', import.meta.url).pathname;
let dom, app;

before(async () => {
  app = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ZEKO_NO_KEYS: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/api/version`)).ok) break; } catch { /* booting */ }
    await sleep(120);
  }

  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => { if (!/Could not load|not implemented/i.test(e.message)) console.error('[jsdom]', e.message); });
  dom = new JSDOM(readFileSync(ROOT + 'public/index.html', 'utf8'), {
    url: `http://127.0.0.1:${PORT}/`, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc,
  });
  const w = dom.window;
  const realFetch = globalThis.fetch;
  Object.assign(globalThis, {
    window: w, document: w.document, location: w.location, localStorage: w.localStorage,
    HTMLElement: w.HTMLElement, Element: w.Element, Node: w.Node, Event: w.Event,
    CustomEvent: w.CustomEvent, KeyboardEvent: w.KeyboardEvent, MouseEvent: w.MouseEvent,
    Blob: w.Blob, FileReader: w.FileReader,
    requestAnimationFrame: w.requestAnimationFrame.bind(w),
    cancelAnimationFrame: w.cancelAnimationFrame.bind(w),
    getComputedStyle: w.getComputedStyle.bind(w),
    fetch: (u, o = {}) => realFetch(String(u).startsWith('/') ? `http://127.0.0.1:${PORT}${u}` : u, o),
  });
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true });
  globalThis.navigator.clipboard = { writeText: async () => {} };

  await import('../public/js/app.js');
  for (let i = 0; i < 80; i++) {
    if (/chưa có API key/.test(w.document.querySelector('#sbStatus')?.textContent || '')) break;
    await sleep(100);
  }
});

after(() => { dom?.window.__zeko?.stop(); app?.kill('SIGTERM'); dom?.window.close(); });

const $ = (s) => dom.window.document.querySelector(s);
const $$ = (s) => [...dom.window.document.querySelectorAll(s)];

test('server: ZEKO_NO_KEYS=1 → /api/keys rỗng, không rơi key seed ra', async () => {
  const k = await fetch(`http://127.0.0.1:${PORT}/api/keys`).then((r) => r.json());
  assert.equal(k.providers.openrouter.keys.length, 0);
  assert.equal(k.providers.tokenrouter.keys.length, 0);
});

test('UI: status bar báo chưa có key, không có chip key nào', () => {
  assert.match($('#sbStatus').textContent, /chưa có API key/);
  assert.equal($$('#sbKeys .sb-key').length, 0);
});

test('UI: tự mở modal Cấu hình để người dùng dán key', () => {
  assert.equal($('#modalBackdrop').hidden, false, 'modal phải tự mở');
  assert.match($('#modalTitle').textContent, /Cấu hình/);
  assert.equal($$('#modalBody .key-edit input').length, 4, 'phải có 4 ô để dán key');
  assert.match($('#modalBody').textContent, /API key/);
});

test('UI: toast hướng dẫn + welcome screen vẫn dùng được', () => {
  const toasts = $$('.toast').map((t) => t.textContent).join(' | ');
  assert.match(toasts, /dán key/i, 'phải có toast hướng dẫn dán key (thực nhận: ' + toasts + ')');
  assert.ok($('.welcome'), 'welcome screen vẫn hiện để người dùng đọc hướng dẫn');
});
