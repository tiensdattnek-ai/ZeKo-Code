/**
 * ZeKo Code — shared configuration (runs in Node AND in the browser).
 *
 * Thứ tự ưu tiên key (cái áp SAU thắng — xem server/index.js):
 *   1. key seed ghép từ src/shared/keyseed.mjs   (mặc định, để clone là chạy)
 *   2. config.local.json ở thư mục gốc          (git-ignored)
 *   3. biến môi trường                          (deploy luôn ghi đè được)
 *   4. key dán trong tab Cấu hình               (mirror vào localStorage của trình duyệt)
 */

import { SEED_KEYS } from './keyseed.mjs';

const env = typeof process !== 'undefined' && process.env ? process.env : {};

const list = (v, fallback) =>
  (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : null) || fallback;

/** Provider definitions. `role` drives which brain is "deep" vs "flash". */
export const DEFAULT_PROVIDERS = {
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    role: 'deep', // GLM 5.3 (bản thường) — bộ não phân tích sâu
    baseUrl: env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    models: list(env.OPENROUTER_MODELS, [
      'z-ai/glm-5.3',
      'z-ai/glm-5.3:free',
      'z-ai/glm-4.6',
    ]),
    keys: [...SEED_KEYS.openrouter],
    headers: { 'HTTP-Referer': 'https://zeko.local', 'X-Title': 'ZeKo Code' },
    color: '#7c5cff',
  },
  tokenrouter: {
    id: 'tokenrouter',
    label: 'TokenRouter',
    role: 'flash', // GLM 5.3 Flash — tốc độ, phản xạ nhanh
    baseUrl: env.TOKENROUTER_BASE_URL || 'https://api.tokenrouter.com/v1',
    models: list(env.TOKENROUTER_MODELS, [
      'z-ai/glm-5.3-flash',
      'z-ai/glm-5.3-free',
      'z-ai/glm-5.3',
      'glm-5.3-flash',
    ]),
    keys: [...SEED_KEYS.tokenrouter],
    headers: {},
    color: '#20d3a6',
  },
};

/** Inference modes exposed in the UI. */
export const MODES = [
  {
    id: 'fusion',
    label: 'Fusion',
    tagline: '2 model chạy song song → hợp nhất thành 1 đáp án',
    hint: 'GLM 5.3 + GLM 5.3 Flash suy nghĩ đồng thời, một lượt tổng hợp chọn phần đúng của cả hai.',
  },
  {
    id: 'relay',
    label: 'Relay',
    tagline: 'Flash phác thảo → 5.3 phản biện & nâng cấp',
    hint: 'Nhanh ở lượt đầu, sâu ở lượt cuối. Rẻ hơn Fusion một chút.',
  },
  {
    id: 'deep',
    label: 'Deep',
    tagline: 'Chỉ GLM 5.3 (OpenRouter)',
    hint: 'Kiến trúc phức tạp, debug khó, cần lý do rõ ràng.',
  },
  {
    id: 'turbo',
    label: 'Turbo',
    tagline: 'Chỉ GLM 5.3 Flash (TokenRouter)',
    hint: 'Snippet nhanh, hỏi đáp ngắn, refactor gọn.',
  },
];

export const DEFAULTS = {
  mode: 'fusion',
  temperature: 0.35,
  maxTokens: 8192,
  autoReview: false,
  contextFiles: 8,
  systemExtra: '',
};

/** Key lấy từ env, để server áp SAU config.local.json (env phải thắng khi deploy). */
export const ENV_KEYS = {
  openrouter: list(env.OPENROUTER_API_KEYS, []),
  tokenrouter: list(env.TOKENROUTER_API_KEYS, []),
};

const clone = (o) => JSON.parse(JSON.stringify(o));

/** Live config. `applyOverrides` mutates it (used by /api/config + the UI). */
export const config = {
  providers: clone(DEFAULT_PROVIDERS),
  defaults: { ...DEFAULTS },
};

/** Deep-merge a partial config coming from the UI / server bootstrap. */
export function applyOverrides(patch = {}) {
  if (!patch || typeof patch !== 'object') return config;
  for (const [pid, p] of Object.entries(patch.providers || {})) {
    const target = config.providers[pid] || (config.providers[pid] = clone(DEFAULT_PROVIDERS[pid] || { id: pid }));
    if (p.baseUrl) target.baseUrl = String(p.baseUrl).replace(/\/+$/, '');
    if (Array.isArray(p.keys) && p.keys.length) target.keys = p.keys.filter(Boolean);
    if (Array.isArray(p.models) && p.models.length) target.models = p.models.filter(Boolean);
    if (p.role) target.role = p.role;
    if (p.label) target.label = p.label;
  }
  Object.assign(config.defaults, patch.defaults || {});
  return config;
}

/** `sk-or-v1-9a35…b12d` — safe to show in the UI. */
export function maskKey(key = '') {
  const s = String(key);
  if (s.length <= 12) return '••••' + s.slice(-2);
  return s.slice(0, 7) + '…' + s.slice(-4);
}

/** Public view of the config (never leaks full keys). */
export function publicConfig() {
  const providers = {};
  for (const [id, p] of Object.entries(config.providers)) {
    providers[id] = {
      id,
      label: p.label,
      role: p.role,
      baseUrl: p.baseUrl,
      models: p.models,
      color: p.color,
      keyCount: (p.keys || []).length,
      keys: (p.keys || []).map((k, i) => ({ index: i, masked: maskKey(k) })),
    };
  }
  return { providers, defaults: { ...config.defaults }, modes: MODES };
}
