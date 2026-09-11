/**
 * ZeKo Code — Fusion Engine.
 *
 * One implementation, two runtimes: the Node server imports it for /api/chat,
 * and the browser imports the very same file for "direct mode" (used when the
 * server cannot reach the upstream, e.g. a sandboxed host without egress).
 *
 * Responsibilities
 *  • round-robin across the 2 API keys of each platform, with health/cooldown
 *  • model-id fallback when a platform renames/retires a model
 *  • cross-platform failover so a dead provider never kills the turn
 *  • 4 inference modes: turbo | deep | relay | fusion(2 não → 1 đáp án)
 *  • token/stream accounting surfaced to the UI
 */

import { config, maskKey } from './config.mjs';
import { SYNTHESIS_SYSTEM, REVIEW_SYSTEM, synthesisUserPrompt, reviewUserPrompt } from './prompt.mjs';

export class ApiError extends Error {
  constructor(message, extra = {}) {
    super(message);
    this.name = 'ApiError';
    Object.assign(this, extra);
  }
}

const COOLDOWN = { auth: Infinity, rate: 45_000, server: 12_000, network: 8_000 };

function createQueue() {
  const items = [];
  let wake = null;
  let closed = false;
  return {
    push(v) {
      if (closed) return;
      items.push(v);
      if (wake) { const w = wake; wake = null; w(); }
    },
    close() {
      closed = true;
      if (wake) { const w = wake; wake = null; w(); }
    },
    get size() { return items.length; },
    async next() {
      for (;;) {
        if (items.length) return { value: items.shift(), done: false };
        if (closed) return { value: undefined, done: true };
        await new Promise((r) => { wake = r; });
      }
    },
  };
}

export class FusionEngine {
  constructor({ providers = config.providers, fetchImpl, now = Date.now, timeout = 180_000 } = {}) {
    this.providers = providers;
    this.fetchImpl = fetchImpl || ((...a) => globalThis.fetch(...a));
    this.now = now;
    this.timeout = timeout;
    this.state = {};
    for (const [pid, p] of Object.entries(providers)) {
      this.state[pid] = {
        keys: (p.keys || []).map((k, i) => ({
          index: i, key: k, masked: maskKey(k), calls: 0, fails: 0, deadUntil: 0, permanent: false, lastError: '', lastStatus: 0,
        })),
        cursor: 0,
        modelIdx: 0,
        workingModel: null,
        modelsCache: null,
        modelsAt: 0,
      };
    }
  }

  /* ------------------------------------------------------------------ keys */

  /** Round-robin over live keys; `null` when every key of the provider is cooling down. */
  pickKey(pid) {
    const st = this.state[pid];
    if (!st || !st.keys.length) return null;
    const t = this.now();
    const n = st.keys.length;
    for (let i = 0; i < n; i++) {
      const k = st.keys[(st.cursor + i) % n];
      if (!k.permanent && k.deadUntil <= t) {
        st.cursor = (k.index + 1) % n;
        return k;
      }
    }
    // everything cooling → pick the one that wakes soonest (better than failing)
    const soonest = [...st.keys].filter((k) => !k.permanent).sort((a, b) => a.deadUntil - b.deadUntil)[0];
    return soonest || null;
  }

  noteKey(pid, keyId, { ok, status = 0, kind = '', error = '' }) {
    const k = this.state[pid]?.keys[keyId];
    if (!k) return;
    if (ok) {
      k.calls++; k.fails = 0; k.deadUntil = 0; k.lastError = ''; k.lastStatus = status;
      return;
    }
    k.calls++; k.fails++;
    k.lastStatus = status;
    k.lastError = error.slice(0, 220);
    if (kind === 'auth') { k.permanent = true; }
    else k.deadUntil = this.now() + (COOLDOWN[kind] || COOLDOWN.network);
  }

  classify(status) {
    if (status === 401 || status === 403 || status === 422) return 'auth';
    if (status === 429) return 'rate';
    if (status >= 500 || status === 408 || status === 502 || status === 503) return 'server';
    return 'client';
  }

  modelFor(pid) {
    const st = this.state[pid];
    if (st.workingModel) return st.workingModel;
    const list = this.providers[pid]?.models || [];
    return list[Math.min(st.modelIdx, list.length - 1)] || null;
  }

  dropModel(pid, model) {
    const st = this.state[pid];
    const list = this.providers[pid]?.models || [];
    const i = list.indexOf(model);
    if (i >= 0 && st.modelIdx < list.length - 1) st.modelIdx = i + 1;
    if (st.workingModel === model) st.workingModel = null;
  }

  /** Health snapshot for the status bar. */
  health() {
    const t = this.now();
    const out = {};
    for (const [pid, st] of Object.entries(this.state)) {
      const p = this.providers[pid] || {};
      out[pid] = {
        id: pid,
        label: p.label,
        role: p.role,
        color: p.color,
        baseUrl: p.baseUrl,
        model: this.modelFor(pid),
        models: p.models || [],
        keys: st.keys.map((k) => ({
          index: k.index, masked: k.masked, calls: k.calls, fails: k.fails,
          permanent: k.permanent, lastStatus: k.lastStatus, lastError: k.lastError,
          cooling: !k.permanent && k.deadUntil > t,
          cooldownLeft: k.permanent ? null : Math.max(0, Math.round((k.deadUntil - t) / 1000)),
        })),
        live: st.keys.some((k) => !k.permanent && k.deadUntil <= t),
      };
    }
    return out;
  }

  /**
   * Re-read provider config (after the user edits keys/models in the UI).
   * Health of a key that is still configured is preserved, so editing one key
   * does not resurrect a different key that is cooling down.
   */
  reload(providers = this.providers) {
    this.providers = providers;
    for (const [pid, p] of Object.entries(providers)) {
      const prev = this.state[pid];
      this.state[pid] = {
        keys: (p.keys || []).map((k, i) => {
          const old = prev?.keys.find((x) => x.key === k);
          return old ? { ...old, index: i } : {
            index: i, key: k, masked: maskKey(k), calls: 0, fails: 0,
            deadUntil: 0, permanent: false, lastError: '', lastStatus: 0,
          };
        }),
        cursor: 0,
        modelIdx: 0,
        workingModel: null,
        modelsCache: null,
        modelsAt: 0,
      };
    }
    for (const pid of Object.keys(this.state)) if (!providers[pid]) delete this.state[pid];
    return this.health();
  }

  /* -------------------------------------------------------------- network */

  /** GET /models — used both for the UI "ping" and for auto-selecting a model id. */
  async probe(pid, { signal } = {}) {
    const p = this.providers[pid];
    const k = this.pickKey(pid);
    const started = this.now();
    if (!p || !k) return { ok: false, provider: pid, error: 'no-key', ms: 0 };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    const onAbort = () => ctrl.abort();
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await this.fetchImpl(`${p.baseUrl.replace(/\/+$/, '')}/models`, {
        headers: { Authorization: `Bearer ${k.key}`, ...(p.headers || {}) },
        signal: ctrl.signal,
      });
      const ms = this.now() - started;
      const text = await res.text();
      let models = [];
      try {
        const json = JSON.parse(text);
        models = (json.data || json.models || []).map((m) => m.id || m.model || m).filter(Boolean);
      } catch { /* keep [] */ }
      this.noteKey(pid, k.index, { ok: res.ok, status: res.status, kind: res.ok ? '' : this.classify(res.status), error: text });
      let picked = null;
      if (res.ok && models.length) {
        this.state[pid].modelsCache = models;
        this.state[pid].modelsAt = this.now();
        const known = (p.models || []).find((m) => models.includes(m));
        if (known) {
          this.state[pid].workingModel = known;
          picked = known;
        } else {
          // Không model nào ta cấu hình còn tồn tại → tự chọn model GLM tốt nhất
          // trong danh sách thật, theo vai trò (deep tránh bản flash, flash ưu tiên bản nhanh).
          const ranked = models.map((m) => ({ m, s: scoreModel(m, p.role) })).sort((a, b) => b.s - a.s);
          if (ranked.length && ranked[0].s >= 100) {
            this.state[pid].workingModel = ranked[0].m;
            picked = ranked[0].m;
          }
        }
      }
      return { ok: res.ok, provider: pid, status: res.status, ms, models, picked, key: k.masked, error: res.ok ? '' : text.slice(0, 300) };
    } catch (e) {
      const kind = /abort/i.test(e?.name || '') ? 'server' : 'network';
      this.noteKey(pid, k.index, { ok: false, kind, error: e?.message || String(e) });
      return { ok: false, provider: pid, ms: this.now() - started, key: k.masked, error: `${e?.name || 'Error'}: ${e?.message || e}` };
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }

  /**
   * Low-level streaming completion. Yields {type:'delta'|'reasoning'|'usage'} and
   * returns through the generator's final {type:'done'}.
   * Retries across keys and model ids before giving up.
   */
  async *stream({ pid, messages, temperature, maxTokens, signal, expectJson = false, label = pid }) {
    const p = this.providers[pid];
    if (!p) throw new ApiError(`Không có provider ${pid}`, { provider: pid, fatal: true });
    const attempts = Math.max(1, (p.keys?.length || 1) * 2);
    let lastErr = null;
    const triedModels = new Set();

    for (let attempt = 0; attempt < attempts; attempt++) {
      const model = this.modelFor(pid);
      if (!model) { lastErr = new ApiError(`${p.label}: không còn model nào để thử`, { provider: pid }); break; }
      const key = this.pickKey(pid);
      if (!key) {
        const st = this.state[pid];
        const why = st.keys.map((k) => k.permanent
          ? `key #${k.index + 1} ${k.masked} bị từ chối (${k.lastStatus || 'auth'}: ${k.lastError})`
          : `key #${k.index + 1} ${k.masked} tạm nghỉ (${k.lastStatus || k.lastError})`).join(' · ');
        lastErr = new ApiError(`${p.label}: toàn bộ ${st.keys.length} API key không khả dụng — ${why}. Mở tab Cấu hình để thay key.`, { provider: pid, keysExhausted: true });
        break;
      }

      const url = `${p.baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const body = {
        model,
        messages,
        stream: true,
        temperature: temperature ?? 0.35,
      };
      if (maxTokens) body.max_tokens = maxTokens;
      if (pid === 'openrouter') body.stream_options = { include_usage: true };
      if (expectJson) body.response_format = { type: 'json_object' };

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeout);
      const onAbort = () => ctrl.abort();
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      const started = this.now();

      try {
        const res = await this.fetchImpl(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key.key}`,
            Accept: 'text/event-stream',
            ...(p.headers || {}),
          },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          const kind = this.classify(res.status);
          const modelNotFound = res.status === 404 || /model.*not (found|exist|supported)|invalid.*model|no such model/i.test(text);
          this.noteKey(pid, key.index, { ok: false, status: res.status, kind: modelNotFound ? '' : kind, error: text });
          lastErr = new ApiError(`${p.label} ${res.status}: ${cleanErr(text)}`, {
            provider: pid, status: res.status, key: key.masked, model, modelNotFound,
          });
          if (modelNotFound && !triedModels.has(model)) {
            triedModels.add(model);
            this.dropModel(pid, model);
            continue;
          }
          continue; // try another key
        }

        let usage = null;
        let chars = 0;
        let reasoningChars = 0;
        let finish = null;

        for await (const ev of parseSSE(res.body, ctrl.signal)) {
          if (ev.data === '[DONE]') break;
          let json;
          try { json = JSON.parse(ev.data); } catch { continue; }
          if (json.error) {
            this.noteKey(pid, key.index, { ok: false, status: 200, kind: 'server', error: JSON.stringify(json.error) });
            throw new ApiError(`${p.label}: ${json.error.message || 'stream error'}`, { provider: pid, key: key.masked, model });
          }
          const choice = json.choices?.[0];
          const d = choice?.delta || {};
          const piece = typeof d.content === 'string' ? d.content : '';
          const think = typeof d.reasoning === 'string' ? d.reasoning
            : typeof d.reasoning_content === 'string' ? d.reasoning_content
              : typeof d.thinking === 'string' ? d.thinking : '';
          if (piece) { chars += piece.length; yield { type: 'delta', text: piece, stream: label, provider: pid, model, key: key.masked }; }
          if (think) { reasoningChars += think.length; yield { type: 'reasoning', text: think, stream: label, provider: pid, model }; }
          if (choice?.finish_reason) finish = choice.finish_reason;
          if (json.usage) usage = json.usage;
        }

        const ms = this.now() - started;
        this.noteKey(pid, key.index, { ok: true, status: 200 });
        if (!usage) usage = { prompt_tokens: 0, completion_tokens: Math.round(chars / 4), total_tokens: Math.round(chars / 4), estimated: true };
        yield { type: 'done', usage, ms, provider: pid, model, key: key.masked, finish, chars, reasoningChars, stream: label };
        return;
      } catch (e) {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
        if (e instanceof ApiError) { lastErr = e; continue; }
        if (e?.name === 'AbortError' && signal?.aborted) { throw new ApiError('Đã huỷ', { provider: pid, aborted: true, fatal: true }); }
        const kind = e?.name === 'AbortError' ? 'server' : 'network';
        this.noteKey(pid, key.index, { ok: false, kind, error: e?.message || String(e) });
        lastErr = new ApiError(`${p.label}: ${e?.message || e}`, { provider: pid, key: key.masked, model, network: true });
        continue;
      } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
      }
    }
    throw lastErr || new ApiError(`${this.providers[pid]?.label || pid}: thất bại`, { provider: pid });
  }

  /** Non-streaming convenience wrapper. */
  async complete(opts) {
    let text = '';
    for await (const ev of this.stream(opts)) {
      if (ev.type === 'delta') text += ev.text;
      if (ev.type === 'done') return { text, ...ev };
    }
    return { text };
  }

  /* --------------------------------------------------------- orchestration */

  byRole(role) {
    const entry = Object.entries(this.providers).find(([, p]) => p.role === role && (p.keys || []).length);
    return entry ? entry[0] : null;
  }

  /**
   * Main entry. Async generator of UI events.
   * req = { messages, system, mode, temperature, maxTokens, question, signal, autoReview }
   */
  async *run(req = {}) {
    const q = createQueue();
    const driver = this._drive(req, q);
    driver.catch((e) => {
      q.push({ t: 'error', message: e?.message || String(e), detail: `${e?.name || ''} ${e?.provider || ''}`.trim(), fatal: true });
    }).finally(() => q.close());

    for (;;) {
      const { value, done } = await q.next();
      if (done) return;
      yield value;
    }
  }

  async _drive(req, q) {
    const {
      messages = [], system = '', mode = 'fusion', temperature = 0.35,
      maxTokens = 8192, question = '', signal, autoReview = false,
    } = req;

    const deep = this.byRole('deep');
    const flash = this.byRole('flash');
    const started = this.now();
    const meta = { mode, startedAt: started, streams: [], totalMs: 0 };

    const baseMessages = system ? [{ role: 'system', content: system }, ...messages] : messages;
    q.push({ t: 'run_start', mode, providers: { deep, flash } });

    const capture = async (pid, streamLabel, msgs, extra = {}) => {
      let text = '';
      let info = null;
      try {
        q.push({ t: 'stream_start', stream: streamLabel, provider: pid, model: this.modelFor(pid) });
        for await (const ev of this.stream({ pid, messages: msgs, temperature, maxTokens, signal, label: streamLabel, ...extra })) {
          if (ev.type === 'delta') { text += ev.text; q.push({ t: 'delta', stream: streamLabel, text: ev.text, provider: pid, model: ev.model, key: ev.key }); }
          else if (ev.type === 'reasoning') q.push({ t: 'reason', stream: streamLabel, text: ev.text, provider: pid });
          else if (ev.type === 'done') { info = ev; }
        }
        q.push({ t: 'stream_end', stream: streamLabel, provider: pid, model: info?.model, key: info?.key, usage: info?.usage, ms: info?.ms, chars: text.length, finish: info?.finish });
        meta.streams.push({ stream: streamLabel, provider: pid, model: info?.model, key: info?.key, usage: info?.usage, ms: info?.ms, chars: text.length });
      } catch (e) {
        q.push({ t: 'stream_error', stream: streamLabel, provider: pid, message: e?.message || String(e) });
        meta.streams.push({ stream: streamLabel, provider: pid, error: e?.message || String(e) });
      }
      return { text, info, provider: pid };
    };

    let finalText = '';

    if (mode === 'turbo' || mode === 'deep') {
      const pid = mode === 'turbo' ? (flash || deep) : (deep || flash);
      if (!pid) throw new ApiError('Không có provider nào được cấu hình', { fatal: true });
      const r = await capture(pid, 'final', baseMessages);
      finalText = r.text;
      if (!finalText && (mode === 'turbo' ? deep : flash)) {
        const alt = mode === 'turbo' ? deep : flash;
        q.push({ t: 'warn', message: `${this.providers[pid]?.label} không trả lời — chuyển sang ${this.providers[alt]?.label}.` });
        finalText = (await capture(alt, 'final', baseMessages)).text;
      }
    } else if (mode === 'relay') {
      const draftPid = flash || deep;
      const refinePid = deep || flash;
      const draft = await capture(draftPid, 'draft', baseMessages);
      if (!draft.text) {
        finalText = (await capture(refinePid, 'final', baseMessages)).text;
      } else {
        const relayMsgs = [
          ...baseMessages,
          { role: 'assistant', content: draft.text },
          { role: 'user', content: 'Bản nháp trên có thể thiếu sót. Hãy kiểm tra lỗi, edge case, bảo mật và viết lại thành bản cuối hoàn chỉnh (giữ đúng giao thức artifact, in FULL file). Nếu bản nháp đã đúng, chỉ sửa điểm yếu và giữ nguyên phần đúng.' },
        ];
        finalText = (await capture(refinePid, 'final', relayMsgs)).text || draft.text;
      }
    } else {
      // fusion: hai bộ não chạy song song
      const [a, b] = await Promise.all([
        deep ? capture(deep, 'deep', baseMessages) : Promise.resolve({ text: '', provider: deep }),
        flash ? capture(flash, 'flash', baseMessages) : Promise.resolve({ text: '', provider: flash }),
      ]);
      const drafts = [a, b].filter((r) => r.text.trim());
      if (!drafts.length) throw new ApiError('Cả hai model đều không phản hồi. Kiểm tra tab Trạng thái để xem lỗi API key.', { fatal: true });

      if (drafts.length === 1) {
        q.push({ t: 'warn', message: 'Chỉ một model phản hồi — dùng bản đó làm đáp án cuối (bỏ lượt hợp nhất).' });
        finalText = drafts[0].text;
      } else {
        const synthPid = deep && a.text ? deep : drafts[0].provider;
        const synthMsgs = [
          { role: 'system', content: SYNTHESIS_SYSTEM },
          { role: 'user', content: synthesisUserPrompt({ question: question || lastUserText(messages), draftDeep: a.text, draftFlash: b.text }) },
        ];
        const merged = await capture(synthPid, 'final', synthMsgs, { temperature: Math.min(temperature, 0.25) });
        finalText = merged.text || pickBetter(a.text, b.text);
      }
    }

    q.push({ t: 'final', text: finalText });

    if (autoReview && finalText.trim() && codeBlockCount(finalText) > 0) {
      const reviewPid = flash || deep;
      if (reviewPid) {
        try {
          const r = await this.complete({
            pid: reviewPid,
            messages: [{ role: 'system', content: REVIEW_SYSTEM }, { role: 'user', content: reviewUserPrompt(finalText) }],
            temperature: 0.1,
            maxTokens: 700,
            signal,
            label: 'review',
          });
          if (r.text) q.push({ t: 'review', text: r.text.trim(), provider: reviewPid });
        } catch (e) {
          q.push({ t: 'warn', message: `Bỏ qua lượt tự review: ${e?.message || e}` });
        }
      }
    }

    meta.totalMs = this.now() - started;
    meta.tokens = meta.streams.reduce((sum, s) => sum + (s.usage?.total_tokens || 0), 0);
    q.push({ t: 'done', meta });
  }
}

/* --------------------------------------------------------------- helpers */

/** Minimal, tolerant SSE reader for `fetch().body` (works in Node 18+ & browsers). */
export async function* parseSSE(body, signal) {
  if (!body) return;
  const reader = typeof body.getReader === 'function' ? body.getReader() : null;
  if (!reader) return;
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  try {
    for (;;) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).replace(/\r$/, '');
        buf = buf.slice(idx + 1);
        if (!line.trim()) continue;
        if (line.startsWith(':')) continue;
        if (line.startsWith('data:')) yield { data: line.slice(5).trim() };
      }
    }
    if (buf.trim().startsWith('data:')) yield { data: buf.trim().slice(5).trim() };
  } finally {
    try { reader.releaseLock(); } catch { /* noop */ }
  }
}

function cleanErr(text = '') {
  try {
    const j = JSON.parse(text);
    return (j.error?.message || j.message || j.detail || text).slice(0, 240);
  } catch { return text.slice(0, 240) || 'không có nội dung lỗi'; }
}

const lastUserText = (messages = []) =>
  [...messages].reverse().find((m) => m.role === 'user')?.content || '';

const codeBlockCount = (t = '') => (t.match(/```/g) || []).length / 2 | 0;

function pickBetter(a, b) {
  const score = (t) => (t || '').length + (t || '').split('```').length * 40;
  return score(a) >= score(b) ? a : b;
}

export const estimateTokens = (t = '') => Math.ceil(String(t).length / 4);

/**
 * Chấm điểm một model id theo vai trò, dùng khi nền tảng đổi tên model và không
 * id nào trong danh sách cấu hình còn khớp (>=100 nghĩa là "đúng họ GLM").
 */
export function scoreModel(id = '', role = 'deep') {
  const s = String(id).toLowerCase();
  let score = 0;
  if (/glm|z-?ai|zhipu/.test(s)) score += 100;
  if (/5[.\-]?3/.test(s)) score += 60;
  else if (/5[.\-]?1|4[.\-]?6|4[.\-]?7/.test(s)) score += 25;
  const fast = /(flash|fast|free|air|lite|mini|turbo)/.test(s);
  if (role === 'flash') score += fast ? 30 : 0;
  else score += fast ? -25 : 10;
  if (/code/.test(s)) score += 6;
  if (/:(free|nitro|floor)$/.test(s)) score += 4;
  return score;
}
