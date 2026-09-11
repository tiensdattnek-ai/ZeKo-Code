/**
 * ZeKo Code — application bootstrap & chat flow.
 */

import { buildSystem } from '../shared/prompt.mjs';
import { extractArtifacts, applyDiff, workspaceDigest } from '../shared/artifacts.mjs';
import { store, restore, newSession, openSession, deleteSession, renameSession, setFile, clearFiles, persist, activeSession, sessionToMarkdown, exportAll, importAll } from './store.mjs';
import { transport } from './transport.mjs';
import { mountMarkdown, mountMarkdownSoon, initCardActions } from './render.mjs';
import { toast, openModal, confirmBox, openSettings, openPalette, closePalette, setStatus, setFootStats, renderHealth, bindUiChrome, closeModal } from './ui.mjs';
import {
  wb, bindFileTree, bindEditor, bindPreview, bindTabs, renderFileTree, openFile, renderPreview, renderDiff,
  pushTelemetry, resetTelemetry, switchPane, download, downloadZip, refreshAll, esc, paintEditor,
} from './workbench.mjs';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const state = {
  busy: false,
  abort: null,
  attachments: [],
  healthTimer: null,
  following: true,   // có tự cuộn theo câu trả lời không
  mention: null,     // trạng thái popup @-file
  slash: null,       // trạng thái popup lệnh /
};

/* ═══════════════════════════ boot ═══════════════════════════ */

async function boot() {
  applyTheme();
  restore();
  if (!activeSession()) newSession();
  bindUiChrome();
  bindChrome();
  bindComposer();
  bindStreamScroll();
  bindSidebar();
  bindFileTree();
  bindEditor();
  bindPreview();
  bindTabs();
  bindStreamActions();
  resetTelemetry();
  setMode(store.settings.mode, { silent: true });
  syncReviewUi();

  setStatus('đang kiểm tra nguồn AI…', 'busy');
  try {
    await transport.init();
  } catch (e) {
    toast('Không khởi tạo được transport: ' + e.message, 'err');
  }
  await refreshHealth(true);
  renderChats();
  renderMessages();
  renderFileTree();
  renderDiff();
  renderPreview();
  setFootStats(0, 0, 0);
  $('#chipTransport').textContent = transport.resolved === 'server' ? 'server proxy' : 'browser direct';
  $('#chipTransport').classList.toggle('warn', transport.resolved !== 'server');
  $('#chipTransport').title = transport.reason || '';
  setStatus(transport.resolved === 'server' ? 'sẵn sàng · gọi qua server' : 'sẵn sàng · gọi thẳng từ trình duyệt', 'ok');

  if (transport.resolved !== 'server') {
    toast('Server không ra được Internet → đang gọi thẳng OpenRouter/TokenRouter từ trình duyệt.', 'info', 5200);
  }
  const live = countLive();
  const totalKeys = $$('#sbKeys .sb-key').length;
  if (!totalKeys) {
    setStatus('chưa có API key nào', 'bad');
    openSettings();
    toast('Chưa có API key — dán key OpenRouter & TokenRouter vào đây rồi bấm Lưu', 'warn', 0);
  } else if (live === 0) {
    setStatus('không có API key nào khả dụng — mở Cấu hình', 'bad');
  }
  startHealthLoop();
  setTimeout(() => $('#input')?.focus(), 200);
}

const countLive = () => $$('#sbKeys .sb-key.used').length;

function startHealthLoop() {
  clearInterval(state.healthTimer);
  state.healthTimer = setInterval(() => refreshHealth(false), 5000);
}

async function refreshHealth(probe = false) {
  try {
    if (probe) await transport.probe();
    const h = await transport.health();
    renderHealth(h, transport.lastProbe);
    const models = Object.values(h).map((p) => p.model).filter(Boolean);
    $('#chipModels').textContent = models.join('  +  ') || 'chưa có model';
    $('#chipModels').classList.toggle('live', models.length > 0);
  } catch (e) {
    setStatus('không đọc được trạng thái: ' + e.message, 'bad');
  }
}

/* ═══════════════════════════ chrome ═══════════════════════════ */

function bindChrome() {
  $('#newChat').onclick = () => startNewChat();
  $('#toggleTheme').onclick = () => { store.settings.theme = store.settings.theme === 'dark' ? 'light' : 'dark'; persist(); applyTheme(); };
  $('#toggleWorkbench').onclick = () => $('#app').classList.toggle('no-wb');
  $('#hideWorkbench').onclick = () => $('#app').classList.add('no-wb');
  $('#collapseSidebar').onclick = () => $('#app').classList.add('no-sidebar');
  $('#showSidebar').onclick = () => $('#app').classList.toggle('no-sidebar');
  $('#toggleReview').onclick = () => { store.settings.autoReview = !store.settings.autoReview; persist(); syncReviewUi(); };
  $('#probeBtn').onclick = async () => { $('#probeBtn').classList.add('on'); setStatus('đang ping 2 nền tảng…', 'busy'); await refreshHealth(true); $('#probeBtn').classList.remove('on'); toast('Đã kiểm tra xong — xem tab Trạng thái', 'ok'); };

  $('#modeSwitch').addEventListener('click', (e) => {
    const b = e.target.closest('.mode');
    if (b) setMode(b.dataset.mode);
  });

  window.addEventListener('zeko:mode', (e) => setMode(e.detail));
  window.addEventListener('zeko:new', () => startNewChat());
  window.addEventListener('zeko:open', (e) => { openSession(e.detail); renderChats(); renderMessages(); renderFileTree(); renderDiff(); renderPreview(); });
  window.addEventListener('zeko:probe', async () => refreshHealth(true));
  window.addEventListener('zeko:preview', () => renderPreview());
  window.addEventListener('zeko:clearfiles', () => confirmBox('Xoá toàn bộ file trong workspace này?', () => { clearFiles(); refreshAll(); toast('Đã xoá workspace', 'ok'); }));
  window.addEventListener('zeko:health', async () => refreshHealth(true));
  window.addEventListener('zeko:settings', () => { setMode(store.settings.mode, { silent: true }); syncReviewUi(); updateCtxLabel(); });
  window.addEventListener('zeko:reload', () => { renderChats(); renderMessages(); refreshAll(); });

  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    else if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); startNewChat(); }
    else if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); $('#app').classList.toggle('no-sidebar'); }
    else if (mod && e.key.toLowerCase() === 'j') { e.preventDefault(); $('#app').classList.toggle('no-wb'); }
    else if (mod && e.key.toLowerCase() === ',') { e.preventDefault(); openSettings(); }
    else if (e.key === 'Escape') { closePalette(); closeModal(); }
    else if (e.key === 'Escape' && state.busy) stopTurn();
  });

  // kéo-thả file vào cửa sổ
  window.addEventListener('dragover', (e) => { e.preventDefault(); $('#composer').style.borderColor = 'rgba(34,211,167,.6)'; });
  window.addEventListener('dragleave', () => { $('#composer').style.borderColor = ''; });
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    $('#composer').style.borderColor = '';
    await handleFiles(e.dataTransfer.files);
  });
}

function applyTheme() { document.documentElement.dataset.theme = store.settings.theme === 'light' ? 'light' : 'dark'; }

function syncReviewUi() {
  $('#toggleReview').classList.toggle('on', !!store.settings.autoReview);
  $('#reviewPill').classList.toggle('on', !!store.settings.autoReview);
}

function setMode(mode, { silent = false } = {}) {
  store.settings.mode = mode;
  persist();
  const btns = $$('#modeSwitch .mode');
  const active = btns.find((b) => b.dataset.mode === mode) || btns[0];
  btns.forEach((b) => b.classList.toggle('active', b === active));
  const thumb = $('#modeThumb');
  thumb.style.width = `${active.offsetWidth}px`;
  thumb.style.transform = `translateX(${active.offsetLeft - 3}px)`;
  $('#sbMode').textContent = mode;
  if (!silent) {
    const tip = { fusion: 'Fusion: GLM 5.3 + Flash chạy song song rồi hợp nhất 1 đáp án', relay: 'Relay: Flash phác thảo, GLM 5.3 phản biện & viết lại', deep: 'Deep: chỉ GLM 5.3 (OpenRouter)', turbo: 'Turbo: chỉ GLM 5.3 Flash (TokenRouter)' };
    setStatus(tip[mode] || mode, 'ok');
  }
}
window.addEventListener('resize', () => setMode(store.settings.mode, { silent: true }));

function startNewChat() {
  newSession();
  renderChats();
  renderMessages();
  refreshAll();
  $('#input').focus();
}

/* ═══════════════════════════ sidebar ═══════════════════════════ */

function renderChats() {
  const q = ($('#chatSearch').value || '').toLowerCase().trim();
  const list = $('#chatList');
  list.textContent = '';
  const items = store.sessions.filter((s) => !q || s.title.toLowerCase().includes(q) || (s.messages || []).some((m) => (m.content || '').toLowerCase().includes(q)));
  if (!items.length) {
    list.innerHTML = `<div class="ft-empty">Không có cuộc chat nào${q ? ' khớp từ khoá' : ''}.</div>`;
    return;
  }
  for (const s of items) {
    const li = document.createElement('li');
    li.className = 'chat-item' + (s.id === store.activeId ? ' active' : '');
    li.dataset.id = s.id;
    const when = new Date(s.updatedAt || s.createdAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    li.innerHTML = `<span class="t">${esc(s.title)}</span>
      <span class="m">${(s.messages || []).length} tin · ${Object.keys(s.files || {}).length} file · ${when}</span>
      <button class="icon-btn danger x" title="Xoá"><svg><use href="#i-trash"/></svg></button>`;
    list.append(li);
  }
}

function bindSidebar() {
  $('#chatSearch').oninput = renderChats;
  $('#chatList').addEventListener('click', (e) => {
    const li = e.target.closest('.chat-item');
    if (!li) return;
    if (e.target.closest('.x')) {
      e.stopPropagation();
      confirmBox(`Xoá cuộc chat "${li.querySelector('.t').textContent}"?`, () => { deleteSession(li.dataset.id); renderChats(); renderMessages(); refreshAll(); });
      return;
    }
    openSession(li.dataset.id);
    renderChats(); renderMessages(); renderFileTree(); renderDiff(); renderPreview();
  });
  $('#addFiles').onclick = () => $('#fileInput').click();
  $('#fileInput').onchange = (e) => handleFiles(e.target.files);
  $('#zipAll').onclick = async () => {
    if (!Object.keys(store.files).length) return toast('Workspace trống', 'info');
    await downloadZip(store.files, 'zeko-project');
    toast('Đã tải zip workspace', 'ok');
  };
  $('#clearFiles').onclick = () => confirmBox('Xoá toàn bộ file trong workspace này?', () => { clearFiles(); refreshAll(); toast('Đã xoá workspace', 'ok'); });

  $$('.side-tab').forEach((t) => t.addEventListener('click', () => {
    $$('.side-tab').forEach((x) => x.classList.toggle('active', x === t));
    $$('.side-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === t.dataset.side));
  }));
}

async function handleFiles(fileList) {
  const files = [...(fileList || [])];
  if (!files.length) return;
  let added = 0;
  for (const f of files) {
    if (f.type.startsWith('image/')) {
      const url = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
      state.attachments.push({ name: f.name, type: f.type, url });
      added++;
      continue;
    }
    if (f.size > 400_000) { toast(`Bỏ qua ${f.name} (>400KB)`, 'warn'); continue; }
    const text = await f.text();
    setFile(f.name, text);
    added++;
  }
  renderAttach();
  renderFileTree();
  if (added) toast(`Đã thêm ${added} file vào ngữ cảnh`, 'ok');
  $('#fileInput').value = '';
}

function renderAttach() {
  const row = $('#attachRow');
  row.textContent = '';
  state.attachments.forEach((a, i) => {
    const el = document.createElement('span');
    el.className = 'attach';
    el.innerHTML = (a.type.startsWith('image/') ? `<img src="${a.url}" alt="" />` : `<svg style="width:12px;height:12px"><use href="#i-file"/></svg>`) + `<span>${esc(a.name)}</span>`;
    const x = document.createElement('button');
    x.className = 'icon-btn';
    x.style.width = '18px'; x.style.height = '18px';
    x.innerHTML = '<svg style="width:11px;height:11px"><use href="#i-close"/></svg>';
    x.onclick = () => { state.attachments.splice(i, 1); renderAttach(); };
    el.append(x);
    row.append(el);
  });
}

/* ═══════════════════════════ composer ═══════════════════════════ */

function bindStreamScroll() {
  const stream = $('#stream');
  stream.addEventListener('scroll', () => {
    state.following = stream.scrollTop + stream.clientHeight >= stream.scrollHeight - 60;
    const btn = $('#toBottom');
    if (btn) btn.hidden = state.following;
  });
  const btn = $('#toBottom');
  if (btn) btn.onclick = () => { state.following = true; scrollToBottom(true); btn.hidden = true; };
}

function scrollToBottom(force = false) {
  const el = $('#stream');
  if (!el) return;
  if (force || state.following !== false) el.scrollTop = el.scrollHeight;
}

/** Gửi một câu hỏi do UI dựng sẵn (quick-ask trên code card). */
function sendText(text) {
  if (state.busy) return toast('ZeKo đang trả lời — bấm Dừng nếu muốn ngắt', 'warn');
  $('#input').value = text;
  $('#input').dispatchEvent(new Event('input'));
  send();
}

const ASK_PROMPT = {
  explain: (p) => `Giải thích code ${p ? 'trong file \`${p}\`' : 'dưới đây'}: luồng chạy, ý đồ thiết kế, và chỗ nào dễ hiểu nhầm.`,
  bug: (p) => `Review code ${p ? 'trong file \`${p}\`' : 'dưới đây'}: tìm bug, edge case và lỗ hổng bảo mật. Liệt kê theo mức độ kèm cách sửa cụ thể.`,
  test: (p) => `Viết unit test cho code ${p ? 'trong file \`${p}\`' : 'dưới đây'}, phủ cả case biên. Dùng test runner đúng chuẩn của ngôn ngữ đó.`,
};

function askAboutCode(code, path, kind) {
  if (!code) return;
  const inWorkspace = path && store.files[path] !== undefined;
  const inline = !inWorkspace || code.length <= 8000;
  const lang = path ? path.split('.').pop() : '';
  const block = inline ? '\n\n```' + lang + (path ? ' ' + path : '') + '\n' + code.slice(0, 12000) + '\n```\n'
    : `\n\n(File \`${path}\` đã có trong workspace của tôi.)\n`;
  sendText((ASK_PROMPT[kind] || ASK_PROMPT.explain)(path) + block);
}

/* ── @-mention: chèn file workspace vào ngữ cảnh ── */
const MENTION_RE = /@([\w./-]*)$/;

function updateMention() {
  const input = $('#input');
  const box = $('#mentionBox');
  const caret = input.selectionStart ?? input.value.length;
  const m = MENTION_RE.exec(input.value.slice(0, caret));
  const files = Object.keys(store.files);
  if (!m || !files.length) { box.hidden = true; state.mention = null; return; }
  const q = m[1].toLowerCase();
  const hits = files.filter((f) => f.toLowerCase().includes(q)).slice(0, 8);
  if (!hits.length) { box.hidden = true; state.mention = null; return; }
  state.mention = { start: caret - m[0].length, end: caret, hits, sel: 0 };
  box.hidden = false;
  box.innerHTML = `<div class="mh">Chèn file vào ngữ cảnh</div>` + hits.map((f, i) =>
    `<div class="mi${i === 0 ? ' sel' : ''}" data-f="${esc(f)}"><svg><use href="#i-file"/></svg>${esc(f)}<span class="sz">${(store.files[f] || '').split('\n').length} dòng</span></div>`).join('');
}

function chooseMention(idx) {
  const st = state.mention;
  const input = $('#input');
  if (!st) return;
  const path = st.hits[idx ?? st.sel];
  if (!path) return;
  input.value = input.value.slice(0, st.start) + '@' + path + ' ' + input.value.slice(st.end);
  $('#mentionBox').hidden = true;
  state.mention = null;
  input.dispatchEvent(new Event('input'));
  input.focus();
}

/* ── autocomplete cho lệnh /: gõ "/" là thấy ngay bảng lệnh ── */
const SLASH_RE = /^\/([\w-]*)$/;

function updateSlash() {
  const input = $('#input');
  const box = $('#slashBox');
  const caret = input.selectionStart ?? input.value.length;
  const m = caret === input.value.length ? SLASH_RE.exec(input.value) : null;
  if (!m) { box.hidden = true; state.slash = null; return; }
  const hits = SLASH.filter(([c]) => c.slice(1).toLowerCase().startsWith(m[1].toLowerCase())).slice(0, 8);
  if (!hits.length) { box.hidden = true; state.slash = null; return; }
  state.slash = { hits, sel: 0 };
  box.hidden = false;
  box.innerHTML = `<div class="mh">Lệnh tắt — ↑↓ chọn, Enter dùng</div>` + hits.map(([c, d], i) =>
    `<div class="mi${i === 0 ? ' sel' : ''}" data-c="${esc(c)}"><code>${esc(c)}</code><span class="sz">${esc(d)}</span></div>`).join('');
}

function chooseSlash(idx) {
  const st = state.slash;
  const input = $('#input');
  if (!st) return;
  const hit = st.hits[idx ?? st.sel];
  if (!hit) return;
  const [cmd] = hit;
  const needsArg = hit[3] === true;
  input.value = cmd + (needsArg ? ' ' : '');
  $('#slashBox').hidden = true;
  state.slash = null;
  input.dispatchEvent(new Event('input'));
  input.focus();
  if (needsArg) return;   // chờ người dùng bấm Enter để chạy lệnh
  send();
}

function bindComposer() {
  const input = $('#input');
  const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, window.innerHeight * 0.42) + 'px'; };
  input.addEventListener('input', () => { grow(); updateCtxLabel(); updateMention(); updateSlash(); $('#charHint').textContent = input.value.length > 1200 ? `${input.value.length} ký tự` : ''; });
  input.addEventListener('keyup', (e) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { updateMention(); updateSlash(); } });
  input.addEventListener('blur', () => setTimeout(() => { $('#mentionBox').hidden = true; $('#slashBox').hidden = true; }, 140));
  input.addEventListener('keydown', (e) => {
    const sbox = $('#slashBox');
    if (state.slash && !sbox.hidden) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = state.slash.hits.length;
        state.slash.sel = (state.slash.sel + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
        $$('#slashBox .mi').forEach((el, i) => el.classList.toggle('sel', i === state.slash.sel));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); chooseSlash(); return; }
      if (e.key === 'Escape') { sbox.hidden = true; state.slash = null; return; }
    }
    const box = $('#mentionBox');
    if (state.mention && !box.hidden) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = state.mention.hits.length;
        state.mention.sel = (state.mention.sel + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
        $$('#mentionBox .mi').forEach((el, i) => el.classList.toggle('sel', i === state.mention.sel));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); chooseMention(); return; }
      if (e.key === 'Escape') { box.hidden = true; state.mention = null; return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  input.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.items || [])].filter((it) => it.kind === 'file').map((it) => it.getAsFile()).filter(Boolean);
    if (!files.length) return;
    e.preventDefault();
    handleFiles(files);
  });
  $('#mentionBox').addEventListener('mousedown', (e) => {
    const item = e.target.closest('.mi');
    if (!item) return;
    e.preventDefault();
    chooseMention(state.mention?.hits.indexOf(item.dataset.f));
  });
  $('#slashBox').addEventListener('mousedown', (e) => {
    const item = e.target.closest('.mi');
    if (!item) return;
    e.preventDefault();
    chooseSlash(state.slash?.hits.findIndex((h) => h[0] === item.dataset.c));
  });
  $('#sendBtn').onclick = send;
  $('#stopBtn').onclick = stopTurn;
  $('#attachBtn').onclick = () => $('#fileInput').click();
  $('#ctxBtn').onclick = () => {
    const n = store.settings.contextFiles = store.settings.contextFiles > 0 ? 0 : 8;
    persist(); updateCtxLabel();
    toast(n ? `Sẽ gửi ${n} file workspace làm ngữ cảnh` : 'Đã tắt ngữ cảnh workspace', 'info');
  };
  $('#reviewPill').onclick = () => { store.settings.autoReview = !store.settings.autoReview; persist(); syncReviewUi(); };
  updateCtxLabel();
}

function updateCtxLabel() {
  const n = Object.keys(store.files).length;
  const send = store.settings.contextFiles > 0 ? Math.min(n, store.settings.contextFiles) : 0;
  $('#ctxLabel').textContent = `${send}/${n} file ngữ cảnh`;
  $('#ctxBtn').classList.toggle('on', send > 0);
}

const MODES = ['fusion', 'relay', 'deep', 'turbo'];
const SLASH = [
  ['/new', 'Cuộc chat mới', () => startNewChat()],
  ['/clear', 'Xoá tin nhắn cuộc chat này', () => { const s = activeSession(); s.messages = []; persist(); renderMessages(); toast('Đã xoá tin nhắn', 'ok'); }],
  ['/mode', 'Đổi chế độ: /mode fusion|relay|deep|turbo', (arg) => {
    const m = MODES.includes(arg) ? arg : null;
    if (!m) return toast('Dùng: /mode fusion | relay | deep | turbo', 'warn');
    setMode(m);
    toast(`Đã chuyển sang chế độ ${m}`, 'ok');
  }, true],
  ['/export', 'Xuất cuộc chat ra .md', () => download(sessionToMarkdown(), 'chat.md')],
  ['/zip', 'Tải workspace .zip', () => downloadZip(store.files, 'zeko-project')],
  ['/preview', 'Chạy lại preview', () => { switchPane('preview'); renderPreview(); }],
  ['/probe', 'Ping 2 nền tảng AI', async () => { await refreshHealth(true); toast('Đã ping xong', 'ok'); }],
  ['/theme', 'Đổi sáng/tối', () => $('#toggleTheme').click()],
  ['/config', 'Mở cấu hình', () => openSettings()],
  ['/help', 'Liệt kê lệnh', () => openModal({
    title: 'Lệnh tắt',
    body: `<ul style="margin:0;padding-left:1.1em;line-height:2">${SLASH.map(([c, d]) => `<li><code>${esc(c)}</code> — ${esc(d)}</li>`).join('')}</ul>
      <p class="hint-t" style="margin-top:12px">Phím tắt: <kbd>Enter</kbd> gửi · <kbd>Shift Enter</kbd> xuống dòng · <kbd>Ctrl K</kbd> lệnh · <kbd>Ctrl N</kbd> chat mới · <kbd>Ctrl B</kbd> sidebar · <kbd>Ctrl J</kbd> workbench · <kbd>Ctrl ,</kbd> cấu hình · <kbd>Esc</kbd> dừng/đóng</p>`,
  })],
];

/* ═══════════════════════════ chat render ═══════════════════════════ */

function renderMessages() {
  const s = activeSession();
  const stream = $('#stream');
  stream.textContent = '';
  if (!s || !s.messages.length) { stream.append(welcome()); return; }
  const inner = document.createElement('div');
  inner.className = 'stream-inner';
  for (const m of s.messages) inner.append(messageEl(m));
  stream.append(inner);
  stream.scrollTop = stream.scrollHeight;
}

function welcome() {
  const el = document.createElement('div');
  el.className = 'welcome';
  el.innerHTML = `
    <div class="logo"><svg><use href="#i-bolt"/></svg></div>
    <h1>ZeKo <span>Code</span></h1>
    <p>Hai bộ não GLM 5.3 và GLM 5.3 Flash suy nghĩ cùng lúc qua OpenRouter &amp; TokenRouter — 4 API key tự roll — rồi hợp nhất thành một đáp án code hoàn chỉnh, chạy thử được ngay bên phải.</p>
    <div class="caps">
      <div class="cap"><svg><use href="#i-layers"/></svg><b>Fusion 2 model</b><span>Deep + Flash chạy song song, một lượt tổng hợp giữ phần đúng của cả hai.</span></div>
      <div class="cap"><svg><use href="#i-key"/></svg><b>4 key tự roll</b><span>429 → nghỉ 45s, 401 → loại key, sập nền tảng → tự đổi nền tảng.</span></div>
      <div class="cap"><svg><use href="#i-eye"/></svg><b>Live preview</b><span>HTML/CSS/JS và cả React JSX chạy trong sandbox, kèm console log.</span></div>
      <div class="cap"><svg><use href="#i-download"/></svg><b>Copy &amp; tải code</b><span>Mỗi khối code có Copy / Lưu file / Tải xuống / Mở trong editor.</span></div>
      <div class="cap"><svg><use href="#i-diff"/></svg><b>Diff &amp; hoàn tác</b><span>Mọi lần agent ghi đè file đều so sánh được và revert được.</span></div>
      <div class="cap"><svg><use href="#i-activity"/></svg><b>Telemetry</b><span>Model nào, key nào, bao nhiêu token, mất bao lâu — hiện đủ.</span></div>
    </div>
    <div class="suggests">
      ${[
        ['Làm trang landing page', 'Viết 1 trang landing page cho quán cà phê, dark theme, có animation khi scroll, 1 file HTML duy nhất'],
        ['Game rắn săn mồi', 'Làm game rắn săn mồi bằng canvas: điều khiển phím + swipe mobile, có điểm cao lưu localStorage'],
        ['API Express + JWT', 'Viết REST API Express đăng nhập JWT, refresh token, rate limit, kèm test bằng node:test'],
        ['Dashboard React', 'Tạo dashboard React (JSX + Babel) hiển thị chart doanh thu 12 tháng bằng canvas, không dùng thư viện ngoài'],
        ['Sửa lỗi', 'Code này chạy sai ở đâu? Dán code của bạn vào đây kèm mô tả lỗi…'],
        ['Refactor', 'Refactor đoạn code này sang TypeScript strict, tách module và viết unit test'],
      ].map(([t, q]) => `<button class="suggest" data-q="${esc(q)}"><b>${esc(t)}</b>${esc(q.slice(0, 90))}…</button>`).join('')}
    </div>`;
  el.querySelectorAll('.suggest').forEach((b) => b.addEventListener('click', () => { $('#input').value = b.dataset.q; $('#input').dispatchEvent(new Event('input')); $('#input').focus(); }));
  return el;
}

function messageEl(m) {
  const el = document.createElement('div');
  el.className = `msg ${m.role === 'user' ? 'user' : 'agent'}`;
  el.dataset.role = m.role;
  el.dataset.id = m.id || '';
  if (m.role === 'user') {
    el.innerHTML = `<div class="avatar"><svg><use href="#i-chat"/></svg></div><div class="bubble">${esc(m.content)}</div>`;
    if (m.attachments?.length) {
      const box = document.createElement('div');
      box.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px';
      box.innerHTML = m.attachments.map((a) => (a.type?.startsWith('image/')
        ? `<img src="${a.url}" style="max-height:90px;border-radius:8px;border:1px solid var(--line-2)" />`
        : `<span class="attach"><svg style="width:12px;height:12px"><use href="#i-file"/></svg>${esc(a.name)}</span>`)).join('');
      el.querySelector('.bubble').append(box);
    }
    return el;
  }
  const meta = m.meta || {};
  el.innerHTML = `
    <div class="avatar"><svg><use href="#i-bolt"/></svg></div>
    <div class="bubble">
      <div class="msg-head"><b>ZeKo</b>
        ${meta.mode ? `<span class="tag mute">${esc(meta.mode)}</span>` : ''}
        ${(meta.models || []).map((x) => `<span class="tag ok">${esc(x)}</span>`).join('')}
      </div>
      ${meta.drafts ? `<div class="lanes collapsed">${meta.drafts.map((d) => laneHtml(d)).join('')}</div>` : ''}
      <div class="content"></div>
      ${m.review ? `<div class="review-box"><h5><svg><use href="#i-sparkle"/></svg>Tự kiểm tra</h5><ul>${m.review.split('\n').filter(Boolean).map((l) => `<li>${esc(l.replace(/^[-*•]\\s*/, ''))}</li>`).join('')}</ul></div>` : ''}
      ${meta.totalMs ? `<div class="msg-foot"><span>${(meta.totalMs / 1000).toFixed(1)}s</span><i class="sep"></i><span>${(meta.tokens || 0).toLocaleString('vi-VN')} token</span><i class="sep"></i><span>${esc((meta.models || []).join(' + ') || '')}</span>${meta.drafts ? `<i class="sep"></i><button class="pill" data-drafts style="padding:3px 8px">2 bản nháp</button>` : ''}</div>` : ''}
      <div class="msg-actions">
        <button class="icon-btn" data-act="copy" title="Copy câu trả lời"><svg><use href="#i-copy"/></svg></button>
        <button class="icon-btn" data-act="apply" title="Lưu mọi file vào workspace"><svg><use href="#i-save"/></svg></button>
        <button class="icon-btn" data-act="preview" title="Chạy thử HTML"><svg><use href="#i-eye"/></svg></button>
        <button class="icon-btn" data-act="regen" title="Trả lời lại"><svg><use href="#i-refresh"/></svg></button>
      </div>
    </div>`;
  if (meta.failed && !m.content) el.querySelector('.content').innerHTML = failBox(meta.error || 'Lượt này không hoàn thành.');
  else mountMarkdown(el.querySelector('.content'), m.content || '');
  bindLaneToggle(el);
  return el;
}

const laneHtml = (d) => `<div class="lane ${d.error ? 'dead' : ''}">
  <div class="lane-head"><i class="dot"></i>${esc(d.label)}<span class="meta">${esc(d.model || '')} · ${esc(d.key || '')}</span></div>
  <div class="lane-body">${esc(d.text || d.error || '')}</div></div>`;

function bindLaneToggle(root) {
  const btn = root.querySelector('[data-drafts]');
  const lanes = root.querySelector('.lanes');
  if (btn && lanes) btn.onclick = () => { lanes.classList.toggle('collapsed'); btn.textContent = lanes.classList.contains('collapsed') ? '2 bản nháp' : 'Ẩn bản nháp'; };
}

function bindStreamActions() {
  const stream = $('#stream');
  initCardActions(stream, {
    toast,
    download,
    ask: askAboutCode,
    save: (path, code) => { setFile(path, code); renderFileTree(); renderDiff(); toast(`Đã lưu ${path}`, 'ok'); },
    open: (path, code) => { setFile(path, code); openFile(path); switchPane('code'); $('#app').classList.remove('no-wb'); },
    preview: (path, code) => {
      const p = path || 'preview.html';
      setFile(p, code);
      renderFileTree();
      switchPane('preview');
      $('#app').classList.remove('no-wb');
      renderPreview(p);
      toast('Đang chạy thử trong Preview', 'ok');
    },
  });

  stream.addEventListener('click', async (e) => {
    if (e.target.closest('[data-continue]')) { continueLast(); return; }
    if (e.target.closest('[data-retry]')) { retryLast(); return; }
    const b = e.target.closest('.msg-actions [data-act]');
    if (!b) return;
    const msgEl = b.closest('.msg');
    const id = msgEl.dataset.id;
    const s = activeSession();
    const m = s?.messages.find((x) => x.id === id);
    const act = b.dataset.act;
    if (act === 'copy') { navigator.clipboard.writeText(m?.content || ''); toast('Đã copy câu trả lời', 'ok'); }
    if (act === 'apply') { const n = applyArtifacts(m?.content || ''); toast(n ? `Đã lưu ${n} file` : 'Không có file nào trong câu trả lời', n ? 'ok' : 'info'); }
    if (act === 'preview') {
      const n = applyArtifacts(m?.content || '');
      switchPane('preview'); $('#app').classList.remove('no-wb'); renderPreview();
      toast(n ? `Đã nạp ${n} file và chạy preview` : 'Không có HTML để chạy', n ? 'ok' : 'info');
    }
    if (act === 'regen') {
      const idx = s.messages.findIndex((x) => x.id === id);
      const userMsg = [...s.messages.slice(0, idx)].reverse().find((x) => x.role === 'user');
      s.messages.splice(idx, 1);
      persist(); renderMessages();
      if (userMsg) { $('#input').value = userMsg.content; send(); }
    }
  });
}

/* ═══════════════════════════ send flow ═══════════════════════════ */

async function send() {
  if (state.busy) { toast('ZeKo đang trả lời — bấm Dừng nếu muốn ngắt', 'warn'); return; }
  const input = $('#input');
  const text = input.value.trim();

  if (text.startsWith('/')) {
    const [cmd, ...rest] = text.split(/\s+/);
    const found = SLASH.find(([c]) => c.split(' ')[0] === cmd);
    if (found) { input.value = ''; input.dispatchEvent(new Event('input')); await found[2](rest.join(' ').trim()); return; }
    toast(`Không có lệnh ${cmd}. Gõ /help để xem danh sách.`, 'warn');
    return;
  }
  if (!text && !state.attachments.length) return;

  const session = activeSession();
  const userMsg = { id: 'u' + Date.now().toString(36), role: 'user', content: text, attachments: state.attachments.map((a) => ({ name: a.name, type: a.type, url: a.url })), at: Date.now() };
  session.messages.push(userMsg);
  state.attachments = [];
  renderAttach();
  input.value = '';
  input.dispatchEvent(new Event('input'));
  persist();
  renderMessages();
  updateCtxLabel();

  await runTurn(session, userMsg);
}

async function runTurn(session, userMsg) {
  state.busy = true;
  state.abort = new AbortController();
  $('#sendBtn')?.classList.add('hidden');
  $('#stopBtn')?.classList.remove('hidden');
  setStatus('đang suy nghĩ…', 'busy');

  const agentMsg = { id: 'a' + Date.now().toString(36), role: 'assistant', content: '', review: '', meta: { mode: store.settings.mode, startedAt: Date.now() }, at: Date.now() };
  session.messages.push(agentMsg);

  const inner = $('#stream .stream-inner') || (() => { const d = document.createElement('div'); d.className = 'stream-inner'; $('#stream').textContent = ''; $('#stream').append(d); return d; })();
  const el = messageEl(agentMsg);
  inner.append(el);
  const contentEl = el.querySelector('.content');
  const headEl = el.querySelector('.msg-head');

  const laneState = {};
  const ensureLanes = () => {
    if (el.querySelector('.lanes')) return el.querySelector('.lanes');
    const box = document.createElement('div');
    box.className = 'lanes';
    contentEl.before(box);
    return box;
  };
  const laneFor = (stream, provider, model, key) => {
    const label = stream === 'deep' ? 'GLM 5.3 · deep' : stream === 'flash' ? 'GLM 5.3 Flash' : stream === 'draft' ? 'Bản nháp (Flash)' : stream === 'review' ? 'Reviewer' : 'Tổng hợp';
    if (!laneState[stream]) {
      const box = ensureLanes();
      const d = document.createElement('div');
      d.className = 'lane';
      d.innerHTML = `<div class="lane-head"><i class="dot"></i>${esc(label)}<span class="meta"></span></div><div class="lane-body"></div>`;
      box.append(d);
      laneState[stream] = { el: d, body: d.querySelector('.lane-body'), meta: d.querySelector('.meta'), text: '', label };
    }
    const L = laneState[stream];
    L.meta.textContent = [model, key].filter(Boolean).join(' · ');
    return L;
  };

  let phaseEl = null;
  const setPhase = (text, kind = '') => {
    if (!text) { phaseEl?.remove(); phaseEl = null; return; }
    if (!phaseEl) { phaseEl = document.createElement('div'); phaseEl.className = 'phase'; contentEl.before(phaseEl); }
    phaseEl.className = 'phase ' + kind;
    phaseEl.innerHTML = `<svg><use href="#${kind === 'err' ? 'i-close' : 'i-layers'}"/></svg><span>${esc(text)}</span>`;
  };

  let finalText = '';
  let finishReason = null;
  let deepText = '';
  let flashText = '';
  let meta = null;
  let reviewText = '';
  let lastStreamError = '';

  const question = userMsg.content || '(file đính kèm)';

  // file được nhắc bằng @ luôn được đưa vào ngữ cảnh, kể cả khi vượt giới hạn contextFiles
  const mentioned = [...new Set((question.match(/@([\w./-]+\.[\w]+)/g) || []).map((t) => t.slice(1)))]
    .filter((p) => store.files[p] !== undefined);
  const mentionDigest = mentioned.length
    ? '\n\n## File người dùng đang nói tới (nhắc bằng @)\n' + mentioned.map((p) => `### ${p}\n\`\`\`\n${(store.files[p] || '').slice(0, 6000)}\n\`\`\`\n`).join('\n')
    : '';
  const digest = (store.settings.contextFiles > 0 ? workspaceDigest(store.files, { maxFiles: store.settings.contextFiles }) : '') + mentionDigest;
  const system = buildSystem({ workspaceDigest: digest, systemExtra: store.settings.systemExtra, mode: store.settings.mode });

  const history = session.messages.slice(0, -1).slice(-24).map((m) => {
    if (m.role === 'user') {
      const imgs = (m.attachments || []).filter((a) => a.type?.startsWith('image/'));
      if (imgs.length) {
        return { role: 'user', content: [{ type: 'text', text: m.content || '(xem ảnh)' }, ...imgs.map((a) => ({ type: 'image_url', image_url: { url: a.url } }))] };
      }
    }
    return { role: m.role === 'user' ? 'user' : 'assistant', content: m.content };
  });

  // vừa ngữ cảnh: bỏ bớt tin cũ nhất nếu vượt ngân sách ký tự
  const CTX_BUDGET = 120_000;
  const sizeOf = (m) => (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content || '').length);
  let dropped = 0;
  for (let total = history.reduce((n, m) => n + sizeOf(m), 0); total > CTX_BUDGET && history.length > 2;) {
    total -= sizeOf(history.shift());
    dropped++;
  }

  if (dropped) setPhase(`Ngữ cảnh dài — đã bỏ ${dropped} tin cũ nhất để vừa cửa sổ ngữ cảnh`);

  try {
    for await (const ev of transport.run({
      messages: history, system, mode: store.settings.mode, temperature: store.settings.temperature,
      maxTokens: store.settings.maxTokens, question, autoReview: store.settings.autoReview, signal: state.abort.signal,
    })) {
      if (ev.t === 'delta') {
        if (ev.stream === 'final') {
          finalText += ev.text;
          agentMsg.content = finalText;
          mountMarkdownSoon(contentEl, finalText);
          scrollToBottom();
        } else {
          const L = laneFor(ev.stream);
          L.text += ev.text;
          L.body.textContent = L.text.slice(-4000);
          L.body.scrollTop = L.body.scrollHeight;
          if (ev.stream === 'deep') deepText += ev.text;
          if (ev.stream === 'flash') flashText += ev.text;
        }
        setStatus('đang sinh code…', 'busy');
      } else if (ev.t === 'reason') {
        if (ev.stream === 'final') { setPhase('Đang suy luận…'); continue; }
        const L = laneFor(ev.stream);
        L.text += ev.text;
        L.body.textContent = L.text.slice(-4000);
      } else if (ev.t === 'stream_start') {
        // 'final' là đáp án hiển thị trực tiếp — chỉ mở lane cho các luồng nháp
        if (ev.stream !== 'final') laneFor(ev.stream, ev.provider, ev.model, ev.key);
        setPhase(ev.stream === 'final' ? 'Đang tổng hợp đáp án cuối…' : `Đang gọi ${ev.provider} (${ev.model})…`);
      } else if (ev.t === 'stream_end') {
        const L = laneState[ev.stream];
        if (L) { L.el.querySelector('.dot').style.animation = 'none'; L.el.querySelector('.dot').style.background = 'var(--ok)'; }
        if (ev.stream === 'final') finishReason = ev.finish || finishReason;
        if (ev.stream !== 'final' && (store.settings.mode === 'fusion')) setPhase('Đang hợp nhất hai bản nháp…');
      } else if (ev.t === 'stream_error') {
        lastStreamError = `${ev.provider}: ${ev.message}`;
        const L = laneFor(ev.stream);
        L.err = ev.message;
        L.el.classList.add('dead');
        L.body.textContent = '✖ ' + ev.message;
        setPhase(`${ev.provider} lỗi: ${ev.message}`, 'err');
      } else if (ev.t === 'warn') {
        setPhase(ev.message, 'err');
      } else if (ev.t === 'review') {
        reviewText = ev.text;
      } else if (ev.t === 'final') {
        finalText = ev.text;
        agentMsg.content = finalText;
        setPhase(null);
        mountMarkdownSoon(contentEl, finalText);
      } else if (ev.t === 'done') {
        meta = ev.meta;
      } else if (ev.t === 'error') {
        setPhase('Lỗi: ' + ev.message + netHint(ev.message), 'err');
        if (!finalText) contentEl.innerHTML = failBox(ev.message);
      } else if (ev.t === 'close') {
        break;
      }
    }
  } catch (e) {
    const msg = e?.message || String(e);
    setPhase('Lỗi đường truyền: ' + msg + netHint(msg), 'err');
    if (!finalText && contentEl) contentEl.innerHTML = failBox(msg);
    toast('Lỗi: ' + msg, 'err', 6000);
  } finally {
    state.busy = false;
    $('#sendBtn')?.classList.remove('hidden');
    $('#stopBtn')?.classList.add('hidden');
    setPhase(null);
  }

  // cả hai nguồn đều hỏng → đừng báo "hoàn tất" với bong bóng trống:
  // hiện ô lỗi + nút Thử lại, và lưu cờ failed để tải lại trang vẫn thấy.
  if (!finalText && !reviewText) {
    const why = lastStreamError || 'Cả hai nguồn AI đều không trả lời được lượt này.';
    agentMsg.content = '';
    agentMsg.meta.failed = true;
    agentMsg.meta.error = why;
    agentMsg.meta.totalMs = Date.now() - agentMsg.meta.startedAt;
    agentMsg.meta.models = [...new Set((meta?.streams || []).map((x) => x.model).filter(Boolean))];
    const failLanes = Object.values(laneState).map((L) => ({
      label: L.label, text: L.text, error: L.err || '', model: L.meta.textContent, key: '',
    }));
    if (failLanes.length) agentMsg.meta.drafts = failLanes;
    agentMsg.meta.error = why + netHint(why);
    // render lại từ store: node stream cũ bị thay nên bản render còn treo của
    // mountMarkdownSoon (throttle 90ms) không thể ghi đè ô lỗi được nữa.
    renderMessages();
    setStatus('lỗi — bấm "Thử lại" để gửi lại câu hỏi', 'err');
    persist();
    renderChats();
    refreshHealth(false);
    scrollToBottom(true);
    return;
  }

  // ── hoàn tất lượt
  const drafts = Object.values(laneState).filter((L) => L.label !== 'Tổng hợp' && L.text).map((L) => ({ label: L.label, text: L.text, model: '', key: '' }));
  const models = [...new Set((meta?.streams || []).map((s) => s.model).filter(Boolean))];
  agentMsg.content = finalText || agentMsg.content;
  agentMsg.review = reviewText;
  agentMsg.meta = {
    mode: store.settings.mode,
    totalMs: meta?.totalMs || (Date.now() - agentMsg.meta.startedAt),
    tokens: meta?.tokens || 0,
    models,
    streams: meta?.streams || [],
    drafts: store.settings.mode === 'fusion' || store.settings.mode === 'relay' ? drafts : undefined,
  };
  store.stats.turns++;
  store.stats.tokens += agentMsg.meta.tokens || 0;
  store.stats.ms += agentMsg.meta.totalMs || 0;

  if (reviewText) {
    const box = document.createElement('div');
    box.className = 'review-box';
    box.innerHTML = `<h5><svg><use href="#i-sparkle"/></svg>Tự kiểm tra</h5><ul>${reviewText.split('\n').filter(Boolean).map((l) => `<li>${esc(l.replace(/^[-*•]\s*/, ''))}</li>`).join('')}</ul>`;
    el.querySelector('.content').after(box);
  }

  // collapse lanes + footer
  const finalStream = (meta?.streams || []).filter((x) => x.stream === 'final' && x.ms).pop();
  const tokPerSec = finalStream?.usage?.completion_tokens && finalStream.ms
    ? Math.round((finalStream.usage.completion_tokens / finalStream.ms) * 1000) : 0;
  const speedHtml = tokPerSec ? `<i class="sep"></i><span>${tokPerSec} tok/s</span>` : '';
  const contHtml = finishReason === 'length'
    ? `<i class="sep"></i><button class="pill" data-continue title="Câu trả lời bị cắt vì hết max_tokens"><svg><use href="#i-undo"/></svg>Viết tiếp</button>` : '';
  const lanesEl = el.querySelector('.lanes');
  if (lanesEl) {
    lanesEl.classList.add('collapsed');
    const foot = document.createElement('div');
    foot.className = 'msg-foot';
    foot.innerHTML = `<span>${(agentMsg.meta.totalMs / 1000).toFixed(1)}s</span><i class="sep"></i><span>${(agentMsg.meta.tokens || 0).toLocaleString('vi-VN')} token</span>${speedHtml}<i class="sep"></i><span>${esc(models.join(' + '))}</span><i class="sep"></i><button class="pill" data-drafts style="padding:3px 8px">Xem bản nháp</button>${contHtml}`;
    el.querySelector('.content').after(foot);
    bindLaneToggle(el);
  } else {
    const foot = document.createElement('div');
    foot.className = 'msg-foot';
    foot.innerHTML = `<span>${(agentMsg.meta.totalMs / 1000).toFixed(1)}s</span><i class="sep"></i><span>${(agentMsg.meta.tokens || 0).toLocaleString('vi-VN')} token</span>${speedHtml}<i class="sep"></i><span>${esc(models.join(' + '))}</span>${contHtml}`;
    el.querySelector('.content').after(foot);
  }
  if (meta) {
    pushTelemetry(meta, store.settings.mode);
    for (const s of meta.streams || []) {
      const t = headEl.querySelector('.msg-head') || headEl;
      void t;
    }
    headEl.innerHTML = `<b>ZeKo</b><span class="tag mute">${esc(store.settings.mode)}</span>${models.map((m) => `<span class="tag ok">${esc(m)}</span>`).join('')}`;
  }

  // tự lưu file agent viết
  const n = store.settings.autoApply !== false ? applyArtifacts(agentMsg.content) : 0;
  if (n) {
    const auto = extractArtifacts(agentMsg.content).find((a) => a.autoPreview);
    renderFileTree();
    renderDiff();
    if (auto || /\.html?$/i.test(Object.keys(store.files).join(' '))) { switchPane('preview'); renderPreview(auto?.path); }
    updateCtxLabel();
    toast(`Đã lưu ${n} file vào workspace`, 'ok');
  }

  setFootStats(store.stats.tokens, store.stats.ms, store.stats.turns);
  setStatus('hoàn tất', 'ok');
  persist();
  renderChats();
  refreshHealth(false);

  // đặt tiêu đề cho cuộc chat mới
  if (session.title === 'Cuộc chat mới' && question) {
    transport.title(question).then((t) => { if (t) { renameSession(session.id, t); renderChats(); } });
  }
  scrollToBottom(true);
}

/** Ô báo lỗi của một lượt chat, kèm nút chạy lại đúng câu hỏi đó. */
function failBox(msg) {
  return `<div class="review-box" style="border-color:rgba(255,93,115,.4)">
    <h5 style="color:var(--danger)">Không hoàn thành được lượt này</h5>
    <p style="margin:0;font-size:13px;color:var(--text-2)">${esc(msg)}</p>
    <div style="margin-top:10px;display:flex;gap:8px;align-items:center">
      <button class="pill danger" data-retry><svg><use href="#i-refresh"/></svg>Thử lại</button>
      <span class="hint-t" style="font-size:11px">ZeKo sẽ gửi lại đúng câu hỏi này, bỏ câu trả lời lỗi.</span>
    </div>
  </div>`;
}

/** Chạy lại lượt vừa hỏng: bỏ câu trả lời lỗi, giữ nguyên câu hỏi. */
async function retryLast() {
  if (state.busy) { toast('ZeKo đang chạy — chờ chút hoặc bấm Dừng', 'warn'); return; }
  const s = activeSession();
  if (!s) return;
  while (s.messages.length && s.messages.at(-1).role === 'assistant') s.messages.pop();
  const userMsg = s.messages.at(-1);
  if (!userMsg || userMsg.role !== 'user') { toast('Không tìm thấy câu hỏi để thử lại', 'warn'); return; }
  persist();
  renderMessages();
  await runTurn(s, userMsg);
}

/** Gợi ý khi lỗi mạng ở chế độ gọi thẳng từ trình duyệt (thường là CORS/egress). */
function netHint(msg = '') {
  if (transport.resolved !== 'direct') return '';
  if (!/fetch failed|Failed to fetch|network|CORS|Load failed|ERR_/i.test(msg)) return '';
  return ' — Trình duyệt không gọi thẳng được nền tảng AI (CORS/chặn mạng). Mở Cấu hình → Đường truyền: "Qua server", hoặc chạy app trên máy có Internet.';
}

/** Ghi các artifact (file) trong câu trả lời vào workspace. Trả về số file. */
function applyArtifacts(text) {
  if (!text) return 0;
  const arts = extractArtifacts(text).filter((a) => a.isFile);
  let n = 0;
  for (const a of arts) {
    if (a.isDiff) {
      const res = applyDiff(store.files[a.path] || '', a.code);
      setFile(a.path, res.content);
      if (!res.ok) toast(`Diff ${a.path} khớp thiếu ${res.missing.length} dòng`, 'warn');
    } else {
      setFile(a.path, a.code.replace(/\n$/, ''));
    }
    n++;
  }
  return n;
}

/** Hết max_tokens giữa chừng → nối tiếp mạch, không lặp phần đã viết. */
function continueLast() {
  if (state.busy) return toast('ZeKo đang trả lời — bấm Dừng nếu muốn ngắt', 'warn');
  const s = activeSession();
  if (![...s.messages].reverse().some((m) => m.role === 'assistant')) return;
  const userMsg = {
    id: 'u' + Date.now().toString(36), role: 'user', at: Date.now(),
    content: '(Viết tiếp phần còn lại của câu trả lời trước. Không lặp lại phần đã viết, giữ đúng giao thức artifact, in FULL file nếu file chưa xong.)',
  };
  s.messages.push(userMsg);
  persist();
  renderMessages();
  runTurn(s, userMsg);
}

function stopTurn() {
  state.abort?.abort();
  state.busy = false;
  $('#sendBtn')?.classList.remove('hidden');
  $('#stopBtn')?.classList.add('hidden');
  setStatus('đã dừng', '');
  toast('Đã dừng lượt này', 'info');
}

boot();

/** Escape hatch for the console / e2e tests: inspect state, stop the health poll. */
if (typeof window !== 'undefined') {
  window.__zeko = {
    store, transport,
    stop: () => clearInterval(state.healthTimer),
    applyArtifacts,
  };
}
