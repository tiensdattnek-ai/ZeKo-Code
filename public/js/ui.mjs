/**
 * ZeKo Code — UI chrome: toasts, modal, settings, status bar.
 */

import { store, persist, exportAll, importAll, sessionToMarkdown, activeSession } from './store.mjs';
import { transport, saveLocalOverrides } from './transport.mjs';
import { download, downloadZip, refreshAll, esc, renderFileTree } from './workbench.mjs';

const $ = (s) => document.querySelector(s);

/* ─────────────────────────── toasts ─────────────────────────── */

const TICON = { ok: 'i-check', err: 'i-close', info: 'i-bolt', warn: 'i-sparkle' };
export function toast(msg, kind = 'info', ms = 2600) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<svg><use href="#${TICON[kind] || 'i-bolt'}"/></svg><span>${esc(msg)}</span>`;
  el.onclick = () => el.remove();
  $('#toasts').append(el);
  if (ms > 0) { // ms = 0 → toast dính lại tới khi người dùng bấm (dùng cho lỗi cấu hình)
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(14px)'; el.style.transition = '.25s'; }, ms - 260);
    setTimeout(() => el.remove(), ms);
  }
}

/* ─────────────────────────── modal ─────────────────────────── */

let modalCleanup = null;
export function openModal({ title, body, footer = '', onMount }) {
  $('#modalTitle').textContent = title;
  const b = $('#modalBody');
  b.textContent = '';
  if (typeof body === 'string') b.innerHTML = body; else b.append(body);
  $('#modalFoot').innerHTML = footer;
  $('#modalBackdrop').hidden = false;
  modalCleanup?.();
  modalCleanup = onMount ? onMount(b, $('#modalFoot')) : null;
}
export function closeModal() { $('#modalBackdrop').hidden = true; modalCleanup = null; }

export function confirmBox(message, onYes, { danger = true, yes = 'Xoá' } = {}) {
  openModal({
    title: 'Xác nhận',
    body: `<p style="margin:0;color:var(--text-2)">${esc(message)}</p>`,
    footer: `<button class="btn ghost" data-x="no">Huỷ</button><button class="btn ${danger ? 'danger' : 'primary'}" data-x="yes">${esc(yes)}</button>`,
    onMount: (_b, foot) => {
      foot.querySelector('[data-x="no"]').onclick = closeModal;
      foot.querySelector('[data-x="yes"]').onclick = () => { closeModal(); onYes(); };
    },
  });
}

/* ─────────────────────────── settings ─────────────────────────── */

export function openSettings() {
  const s = store.settings;
  const providers = transport.keys();
  const body = document.createElement('div');

  body.innerHTML = `
    <div class="section-title"><svg><use href="#i-bolt"/></svg>Suy luận</div>
    <div class="field-row">
      <div class="field"><label>Chế độ mặc định</label>
        <select id="setMode">
          <option value="fusion">Fusion — 2 model song song → 1 đáp án</option>
          <option value="relay">Relay — Flash nháp, 5.3 phản biện</option>
          <option value="deep">Deep — chỉ GLM 5.3</option>
          <option value="turbo">Turbo — chỉ GLM 5.3 Flash</option>
        </select>
      </div>
      <div class="field"><label>Đường truyền</label>
        <select id="setTransport">
          <option value="auto">Tự động (khuyên dùng)</option>
          <option value="server">Qua server (giấu key)</option>
          <option value="direct">Trực tiếp từ trình duyệt</option>
        </select>
        <div class="hint-t">Hiện tại: <b>${esc(transport.resolved || 'chưa rõ')}</b> — ${esc(transport.reason || '')}</div>
      </div>
    </div>
    <div class="field"><label>Nhiệt độ: <span id="tempVal">${s.temperature}</span></label>
      <input type="range" id="setTemp" min="0" max="1.2" step="0.05" value="${s.temperature}" />
      <div class="hint-t">Thấp = bám sát &amp; ổn định (code). Cao = sáng tạo hơn.</div>
    </div>
    <div class="field-row">
      <div class="field"><label>Max tokens mỗi lượt</label><input type="number" id="setMax" min="512" max="65536" step="512" value="${s.maxTokens}" /></div>
      <div class="field"><label>Số file workspace gửi làm ngữ cảnh</label><input type="number" id="setCtx" min="0" max="40" value="${s.contextFiles}" /></div>
    </div>
    <div class="switch-row"><div><b>Tự động review sau khi trả lời</b><p>Flash soát lại code vừa viết (bug / bảo mật / thiếu sót).</p></div>
      <div class="switch ${s.autoReview ? 'on' : ''}" id="setReview"></div></div>
    <div class="switch-row"><div><b>Tự động lưu file agent viết vào workspace</b><p>Tắt đi nếu bạn chỉ muốn copy code, không muốn workspace thay đổi.</p></div>
      <div class="switch ${s.autoApply !== false ? 'on' : ''}" id="setApply"></div></div>

    <div class="section-title"><svg><use href="#i-key"/></svg>API key &amp; model</div>
    <div class="hint-t" style="margin-bottom:10px">Mỗi nền tảng giữ nhiều key và <b>tự roll vòng</b>: key dính 429 sẽ nghỉ 45s, key sai (401) bị loại, request tự nhảy sang key/nền tảng khác.</div>
    ${Object.values(providers).map((p) => `
      <div class="field" style="border:1px solid var(--line);border-radius:11px;padding:11px;margin-bottom:11px">
        <label>${esc(p.label)} <span style="text-transform:none;color:var(--muted)">(${esc(p.role)})</span></label>
        <div class="field"><label style="font-size:10.5px">Base URL</label><input data-p="${p.id}" data-f="baseUrl" value="${esc(p.baseUrl)}" /></div>
        <div class="field"><label style="font-size:10.5px">Model ID (ưu tiên từ trái sang phải, phân cách bằng dấu phẩy)</label>
          <input data-p="${p.id}" data-f="models" value="${esc((p.models || []).join(', '))}" /></div>
        <div class="field" style="margin-bottom:4px"><label style="font-size:10.5px">API keys</label>
          <div class="keys" data-p="${p.id}">${(p.keys?.length ? p.keys : ['', '']).map((k) => keyRow(k)).join('')}</div>
          <button class="btn ghost" data-addkey="${p.id}" style="padding:6px 10px;font-size:12px"><svg><use href="#i-plus"/></svg>Thêm key</button>
          <button class="btn ghost" data-probe="${p.id}" style="padding:6px 10px;font-size:12px"><svg><use href="#i-refresh"/></svg>Dò model khả dụng</button>
        </div>
      </div>`).join('')}

    <div class="section-title"><svg><use href="#i-sparkle"/></svg>System prompt bổ sung</div>
    <div class="field"><textarea id="setExtra" placeholder="Ví dụ: luôn dùng TypeScript + Tailwind, comment tiếng Việt, không dùng class component…">${esc(s.systemExtra)}</textarea></div>

    <div class="section-title"><svg><use href="#i-save"/></svg>Dữ liệu</div>
    <div class="field-row">
      <button class="btn ghost" id="expJson">Xuất backup (.json)</button>
      <button class="btn ghost" id="impJson">Nhập backup</button>
    </div>
    <div class="field-row">
      <button class="btn ghost" id="expMd">Xuất cuộc chat (.md)</button>
      <button class="btn danger" id="wipe">Xoá toàn bộ dữ liệu</button>
    </div>
    <input type="file" id="impFile" accept="application/json" hidden />
  `;

  openModal({
    title: 'Cấu hình ZeKo Code',
    body,
    footer: `<button class="btn ghost" id="setCancel">Đóng</button><button class="btn primary" id="setSave"><svg><use href="#i-check"/></svg>Lưu</button>`,
    onMount: (b, foot) => {
      $('#setMode', b) && ($('#setMode').value = s.mode);
      $('#setTransport').value = s.transport;
      $('#setTemp').oninput = (e) => { $('#tempVal').textContent = e.target.value; };
      const toggle = (id, init) => {
        let on = init;
        $(id).onclick = () => { on = !on; $(id).classList.toggle('on', on); };
        return () => on;
      };
      const getReview = toggle('#setReview', s.autoReview);
      const getApply = toggle('#setApply', s.autoApply !== false);

      b.addEventListener('click', (e) => {
        const add = e.target.closest('[data-addkey]');
        if (add) {
          const box = b.querySelector(`.keys[data-p="${add.dataset.addkey}"]`);
          box.insertAdjacentHTML('beforeend', keyRow(''));
        }
        if (e.target.closest('[data-rmkey]')) e.target.closest('.key-edit').remove();
        const probeBtn = e.target.closest('[data-probe]');
        if (probeBtn) {
          const pid = probeBtn.dataset.probe;
          const input = b.querySelector(`[data-p="${pid}"][data-f="models"]`);
          const keyInput = b.querySelector(`.keys[data-p="${pid}"] input`);
          probeBtn.disabled = true;
          // gửi key đang gõ trong form để dò bằng chính key đó
          transport.applyConfig({ providers: { [pid]: { keys: [...b.querySelectorAll(`.keys[data-p="${pid}"] input`)].map((i) => i.value.trim()).filter(Boolean) } } })
            .then(() => transport.probe(pid))
            .then((r) => {
              const res = r[pid] || {};
              if (res.ok && (res.models || []).length) {
                const glm = res.models.filter((m) => /glm|z-?ai/i.test(m));
                input.value = (glm.length ? glm : res.models).slice(0, 6).join(', ');
                toast(`${res.models.length} model khả dụng${res.picked ? ' · đang dùng ' + res.picked : ''}`, 'ok', 4000);
              } else {
                toast('Dò thất bại: ' + (res.error || 'không phản hồi').slice(0, 90), 'err', 5000);
              }
            })
            .catch((err) => toast('Dò thất bại: ' + err.message, 'err', 5000))
            .finally(() => { probeBtn.disabled = false; void keyInput; });
        }
      });

      $('#expJson').onclick = () => download(exportAll(), `zeko-backup-${new Date().toISOString().slice(0, 10)}.json`);
      $('#expMd').onclick = () => download(sessionToMarkdown(), `${(activeSession()?.title || 'chat').replace(/[^\w\d-_ ]/g, '').slice(0, 40) || 'chat'}.md`);
      $('#impJson').onclick = () => $('#impFile').click();
      $('#impFile').onchange = async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        try {
          const n = importAll(await f.text());
          toast(`Đã nhập ${n} cuộc chat`, 'ok');
          closeModal();
          window.dispatchEvent(new Event('zeko:reload'));
        } catch (err) { toast('Import lỗi: ' + err.message, 'err'); }
      };
      $('#wipe').onclick = () => confirmBox('Xoá toàn bộ cuộc chat, workspace và cài đặt trong trình duyệt?', () => {
        localStorage.removeItem('zeko.code.v1');
        location.reload();
      });

      foot.querySelector('#setCancel').onclick = closeModal;
      foot.querySelector('#setSave').onclick = async () => {
        store.settings.mode = $('#setMode').value;
        store.settings.transport = $('#setTransport').value;
        store.settings.temperature = Number($('#setTemp').value);
        store.settings.maxTokens = Number($('#setMax').value) || 8192;
        store.settings.contextFiles = Number($('#setCtx').value) || 8;
        store.settings.autoReview = getReview();
        store.settings.autoApply = getApply();
        store.settings.systemExtra = $('#setExtra').value;
        persist();
        window.dispatchEvent(new CustomEvent('zeko:settings', { detail: store.settings }));

        const providersPatch = {};
        for (const p of Object.values(providers)) {
          const baseUrl = b.querySelector(`[data-p="${p.id}"][data-f="baseUrl"]`).value.trim();
          const models = b.querySelector(`[data-p="${p.id}"][data-f="models"]`).value.split(',').map((x) => x.trim()).filter(Boolean);
          const keys = [...b.querySelectorAll(`.keys[data-p="${p.id}"] input`)].map((i) => i.value.trim()).filter(Boolean);
          providersPatch[p.id] = { baseUrl, models, keys };
          Object.assign(transport.providers[p.id] || (transport.providers[p.id] = {}), providersPatch[p.id]);
        }
        // chỉ mirror những gì thực sự có nội dung, để lỡ xoá trống không làm mất key
        const mirror = {};
        for (const [id, p] of Object.entries(providersPatch)) {
          mirror[id] = { baseUrl: p.baseUrl };
          if (p.keys.length) mirror[id].keys = p.keys;
          if (p.models.length) mirror[id].models = p.models;
        }
        saveLocalOverrides({ providers: mirror });
        try {
          await transport.applyConfig({ providers: providersPatch, defaults: { mode: store.settings.mode } });
          toast('Đã lưu cấu hình & nạp lại key', 'ok');
        } catch (e) { toast('Lưu thất bại: ' + e.message, 'err'); }
        closeModal();
        window.dispatchEvent(new Event('zeko:health'));
      };
    },
  });
}

const keyRow = (k) => `<div class="key-edit"><input value="${esc(k)}" placeholder="sk-…" spellcheck="false" /><button class="icon-btn danger" data-rmkey title="Xoá key"><svg><use href="#i-trash"/></svg></button></div>`;

const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ─────────────────────────── status bar / providers ─────────────────────────── */

export function renderHealth(health, probes = {}) {
  const sbKeys = $('#sbKeys');
  const parts = [];
  let live = 0;
  for (const [pid, p] of Object.entries(health || {})) {
    for (const k of p.keys || []) {
      const cls = k.permanent ? 'dead' : k.cooling ? 'cool' : 'used';
      if (cls === 'used') live++;
      const tip = `${p.label} · key #${k.index + 1} ${k.masked} · ${k.calls} lượt` + (k.cooling ? ` · nghỉ ${k.cooldownLeft}s` : k.permanent ? ` · LỖI: ${k.lastError}` : '');
      parts.push(`<span class="sb-key ${cls}" title="${esc(tip)}">#${k.index + 1}${k.cooling && k.cooldownLeft ? ` ${k.cooldownLeft}s` : ''}</span>`);
    }
  }
  sbKeys.innerHTML = `<span style="opacity:.7">key</span>${parts.join('')}`;

  const host = $('#providerCards');
  if (host) {
    host.innerHTML = Object.values(health || {}).map((p) => {
      const probe = probes[p.id];
      const state = p.live ? 'ok' : 'bad';
      return `<div class="pcard">
        <h4><i class="dot ${state}"></i>${esc(p.label)}<span class="role">${esc(p.role)}</span></h4>
        <div class="model">${esc(p.model || '—')}</div>
        <div style="margin-top:6px;display:flex;flex-direction:column;gap:3px">
          ${(p.keys || []).map((k) => `<div class="keyrow"><svg style="width:12px;height:12px"><use href="#i-key"/></svg><span class="k">${esc(k.masked)}</span>
            <span class="tag ${k.permanent ? 'bad' : k.cooling ? 'warn' : 'ok'}">${k.permanent ? 'loại' : k.cooling ? `nghỉ ${k.cooldownLeft}s` : 'sẵn sàng'}</span>
            <span class="tag mute">${k.calls} lượt</span></div>`).join('')}
        </div>
        <div style="margin-top:7px" class="hint-t">${probe ? (probe.ok
          ? `ping ${probe.ms}ms · ${(probe.models || []).length} model` + (probe.picked ? ` · <b style="color:var(--accent)">đang dùng ${esc(probe.picked)}</b>` : '')
          : `✖ ${esc((probe.error || '').slice(0, 90))}`) : 'chưa ping'}</div>
      </div>`;
    }).join('');
  }

  const tb = $('#transportBox');
  if (tb) {
    tb.innerHTML = `<b style="color:var(--text-2)">Đường truyền:</b> ${transport.resolved === 'server' ? 'server proxy (key ở phía server)' : 'trực tiếp từ trình duyệt'}<br>${esc(transport.reason || '')}`;
  }
  return live;
}

export function setStatus(text, kind = '') {
  const el = $('#sbStatus');
  el.innerHTML = `<i class="dot ${kind}"></i><span>${esc(text)}</span>`;
}

export function setFootStats(tokens, ms, turns) {
  $('#sbTokens').textContent = `${(tokens || 0).toLocaleString('vi-VN')} token`;
  $('#sbTime').textContent = ms ? `${(ms / 1000).toFixed(1)}s · ${turns} lượt` : '—';
  $('#footStats').textContent = tokens ? `${(tokens || 0).toLocaleString('vi-VN')} token · ${(ms / 1000).toFixed(1)}s` : '';
}

export function bindUiChrome() {
  $('#modalClose').onclick = closeModal;
  $('#modalBackdrop').addEventListener('mousedown', (e) => { if (e.target.id === 'modalBackdrop') closeModal(); });
  $('#openSettings').onclick = openSettings;
  $('#sbSettings').onclick = openSettings;
}

export { refreshAll, renderFileTree, download, downloadZip };
