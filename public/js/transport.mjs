/**
 * ZeKo Code — transport layer.
 *
 * The UI talks to ONE interface, whichever path carries the bytes:
 *
 *   server  →  POST /api/chat, engine runs in Node (keys stay server-side)
 *   direct  →  the same engine file runs in the browser (used when the host has
 *              no outbound network, e.g. a sandboxed preview)
 *
 * Both paths reuse parseSSE() from /shared/fusion.mjs, so event shapes are
 * identical and the chat UI cannot tell them apart.
 */

import { FusionEngine, parseSSE } from '../shared/fusion.mjs';
import { TITLE_SYSTEM } from '../shared/prompt.mjs';
import { store } from './store.mjs';

const j = (r) => r.json().catch(() => ({}));

/**
 * Server giữ config trong RAM, nên key bạn dán trong tab Cấu hình sẽ mất khi
 * restart. Ta mirror chúng vào localStorage và nạp lại mỗi lần khởi động.
 */
const LS_KEYS = 'zeko.keys.v1';
export function saveLocalOverrides(patch) {
  try { localStorage.setItem(LS_KEYS, JSON.stringify(patch)); } catch { /* private mode */ }
}
function readLocalOverrides() {
  try { return JSON.parse(localStorage.getItem(LS_KEYS) || 'null'); } catch { return null; }
}

export const transport = {
  resolved: null,      // 'server' | 'direct'
  reason: '',
  providers: {},
  engine: null,
  serverAlive: false,
  lastProbe: {},

  async init() {
    try {
      const v = await fetch('/api/version').then(j);
      this.serverAlive = !!v?.name;
    } catch { this.serverAlive = false; }

    const keys = await fetch('/api/keys').then(j).catch(() => null);
    this.providers = keys?.providers || {};
    if (this.providers.openrouter) {
      this.providers.openrouter.headers = { ...(this.providers.openrouter.headers || {}), 'HTTP-Referer': location.origin, 'X-Title': 'ZeKo Code' };
    }

    // key/model người dùng đã lưu trong trình duyệt thắng key mặc định của server
    const saved = readLocalOverrides();
    if (saved?.providers) {
      for (const [id, p] of Object.entries(saved.providers)) {
        const target = this.providers[id];
        if (!target) continue;
        if (p.keys?.length) target.keys = p.keys;
        if (p.models?.length) target.models = p.models;
        if (p.baseUrl) target.baseUrl = p.baseUrl;
      }
      if (this.serverAlive) {
        await fetch('/api/config', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providers: saved.providers }),
        }).catch(() => {});
      }
    }

    const pref = store.settings.transport;
    if (pref === 'direct') { this.useDirect('người dùng chọn direct'); return this; }
    if (pref === 'server' && this.serverAlive) { this.resolved = 'server'; this.reason = 'người dùng chọn server'; return this; }

    // auto: prefer the server, but only if it can actually reach the upstream
    if (this.serverAlive) {
      const p = await fetch('/api/probe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(j).catch(() => null);
      this.lastProbe = p?.results || {};
      const anyOk = Object.values(this.lastProbe).some((r) => r.ok);
      if (anyOk) { this.resolved = 'server'; this.reason = 'server proxy hoạt động'; return this; }
      this.reason = Object.entries(this.lastProbe).map(([k, r]) => `${k}: ${r.error || r.status}`).join(' · ') || 'server không gọi được upstream';
    } else {
      this.reason = 'không có server backend';
    }
    this.useDirect(this.reason);
    return this;
  },

  useDirect(reason) {
    this.resolved = 'direct';
    this.reason = reason || 'gọi thẳng từ trình duyệt';
    this.engine = new FusionEngine({ providers: this.providers });
  },

  /** Re-check both platforms from wherever we currently run. */
  async probe(pid) {
    if (this.resolved === 'server') {
      const r = await fetch('/api/probe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: pid }),
      }).then(j).catch(() => ({ results: {} }));
      this.lastProbe = { ...this.lastProbe, ...r.results };
      return r.results;
    }
    const ids = pid ? [pid] : Object.keys(this.providers);
    for (const id of ids) this.lastProbe[id] = await this.engine.probe(id);
    return this.lastProbe;
  },

  async health() {
    if (this.resolved === 'server') return fetch('/api/health').then(j).catch(() => ({}));
    return this.engine ? this.engine.health() : {};
  },

  /** Runtime config change (keys/models) — applies to server or local engine. */
  async applyConfig(patch) {
    if (this.resolved === 'server') {
      const r = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).then(j);
      return r;
    }
    const { applyOverrides } = await import('../shared/config.mjs');
    applyOverrides(patch);
    for (const [id, p] of Object.entries(patch.providers || {})) {
      if (this.providers[id]) Object.assign(this.providers[id], p);
    }
    this.engine = new FusionEngine({ providers: this.providers });
    return { ok: true };
  },

  /** Full key list, for the settings screen. */
  keys() { return this.providers; },

  /** Stream a turn. Yields engine events. */
  async *run(req) {
    if (this.resolved === 'server') {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: req.signal,
      });
      if (!res.ok) throw new Error(`Server trả về ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
      for await (const ev of parseSSE(res.body, req.signal)) {
        if (ev.data === '[DONE]') return;
        try { yield JSON.parse(ev.data); } catch { /* ignore keep-alive junk */ }
      }
      return;
    }
    if (!this.engine) throw new Error('Chưa khởi tạo engine ở chế độ direct');
    for await (const ev of this.engine.run(req)) yield ev;
  },

  async title(question) {
    const clean = (s) => String(s || '').replace(/^["'\s]+|["'\s.]+$/g, '').split('\n')[0].trim().slice(0, 60);
    try {
      if (this.resolved === 'server') {
        const r = await fetch('/api/title', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) }).then(j);
        return clean(r.title || r.fallback || question);
      }
      const pid = this.engine.byRole('flash') || this.engine.byRole('deep');
      if (!pid) return clean(question);
      const r = await this.engine.complete({
        pid,
        messages: [{ role: 'system', content: TITLE_SYSTEM }, { role: 'user', content: question.slice(0, 600) }],
        temperature: 0.2, maxTokens: 40, label: 'title',
      });
      return clean(r.text || question);
    } catch {
      return clean(question);
    }
  },
};
