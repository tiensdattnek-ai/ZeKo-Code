/**
 * Thứ tự ưu tiên cấu hình + cam kết "không secret nào lọt ra API công khai".
 * process.env phải được đặt TRƯỚC khi import config.mjs (file đọc env lúc khởi tạo).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.OPENROUTER_API_KEYS = 'sk-env-deep-1,sk-env-deep-2';
process.env.TOKENROUTER_API_KEYS = 'sk-env-flash-1';
process.env.OPENROUTER_MODELS = 'model-tu-env, model-tu-env-2';

const { config, applyOverrides, publicConfig, maskKey, ENV_KEYS } = await import('../src/shared/config.mjs');

test('ENV_KEYS đọc đúng biến môi trường (cắt khoảng trắng, bỏ rỗng)', () => {
  assert.deepEqual(ENV_KEYS.openrouter, ['sk-env-deep-1', 'sk-env-deep-2']);
  assert.deepEqual(ENV_KEYS.tokenrouter, ['sk-env-flash-1']);
  assert.deepEqual(config.providers.openrouter.models, ['model-tu-env', 'model-tu-env-2']);
});

test('config.local.json áp trước, env áp sau → env thắng (đúng thứ tự trong server)', () => {
  // mô phỏng config.local.json
  applyOverrides({ providers: { openrouter: { keys: ['sk-file-deep-1', 'sk-file-deep-2'] } } });
  assert.deepEqual(config.providers.openrouter.keys, ['sk-file-deep-1', 'sk-file-deep-2']);

  // mô phỏng bước env áp cuối trong server/index.js
  const envPatch = Object.fromEntries(Object.entries(ENV_KEYS).filter(([, k]) => k.length).map(([id, k]) => [id, { keys: k }]));
  applyOverrides({ providers: envPatch });

  assert.deepEqual(config.providers.openrouter.keys, ['sk-env-deep-1', 'sk-env-deep-2']);
  assert.deepEqual(config.providers.tokenrouter.keys, ['sk-env-flash-1']);
});

test('patch rỗng không được xoá key đang có', () => {
  const before = [...config.providers.tokenrouter.keys];
  applyOverrides({ providers: { tokenrouter: { keys: [] } } });
  assert.deepEqual(config.providers.tokenrouter.keys, before);
});

test('publicConfig che key: không lộ chuỗi nào giống API key thật', () => {
  const json = JSON.stringify(publicConfig());
  assert.ok(!/sk-[A-Za-z0-9_-]{20,}/.test(json), 'publicConfig không được chứa key đầy đủ');
  assert.equal(publicConfig().providers.openrouter.keyCount, 2);
  assert.match(publicConfig().providers.openrouter.keys[0].masked, /…/);
});

test('maskKey: key dài thì che giữa, key ngắn thì che gần hết', () => {
  assert.equal(maskKey('x'.repeat(40)), 'xxxxxxx…xxxx');
  assert.equal(maskKey('sk-ngan'), '••••an');
  assert.equal(maskKey(''), '••••');
});

test('baseUrl được chuẩn hoá: bỏ dấu / thừa ở cuối', () => {
  applyOverrides({ providers: { tokenrouter: { baseUrl: 'https://api.tokenrouter.com/v1///' } } });
  assert.equal(config.providers.tokenrouter.baseUrl, 'https://api.tokenrouter.com/v1');
});
