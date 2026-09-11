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

test('keyseed: 4 key ghép lại đúng dạng, fingerprint khớp bản gốc', async () => {
  const { SEED_KEYS } = await import('../src/shared/keyseed.mjs');
  const { createHash } = await import('node:crypto');
  const fp = (k) => createHash('sha256').update(k).digest('hex').slice(0, 16);

  assert.equal(SEED_KEYS.openrouter.length, 2);
  assert.equal(SEED_KEYS.tokenrouter.length, 2);
  for (const k of SEED_KEYS.openrouter) assert.match(k, /^sk-or-v1-[0-9a-f]{64}$/, 'key OpenRouter phải đủ prefix + 64 hex');
  for (const k of SEED_KEYS.tokenrouter) assert.match(k, /^sk-[A-Za-z0-9]{40,}$/, 'key TokenRouter phải đủ dạng');
  assert.deepEqual(
    [...SEED_KEYS.openrouter, ...SEED_KEYS.tokenrouter].map(fp),
    ['9200b0ffe5a1329c', '20a34212de81535d', '50146a1e2999fcaf', '08f997e3a77751e2'],
    'key seed bị chép sai từng ký tự — so lại với key gốc',
  );
  assert.deepEqual(config.providers.tokenrouter.keys, SEED_KEYS.tokenrouter, 'mặc định phải lấy từ seed');
});

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
