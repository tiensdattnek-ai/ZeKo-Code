/**
 * ZeKo Code — Workbench: file tree, code editor, live preview, diff, telemetry.
 */

import { highlight, gutter } from './highlight.mjs';
import { buildPreview, guessLang } from '../shared/artifacts.mjs';
import { store, setFile, deleteFile, persist } from './store.mjs';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const wb = {
  activePath: '',
  onToast: () => {},
  wrap: false,
  device: '100%',
  consoleErrors: 0,
};

/* ─────────────────────────── file tree ─────────────────────────── */

export function renderFileTree() {
  const host = $('#fileTree');
  const files = store.files;
  const paths = Object.keys(files).sort();
  if (!paths.length) {
    host.innerHTML = `<div class="ft-empty">Chưa có file nào.<br>Hãy để agent viết code, bấm <b>Đính kèm</b>, hoặc lưu từ một code card.</div>`;
    return;
  }
  host.textContent = '';
  for (const p of paths) {
    const row = document.createElement('div');
    row.className = 'ft-row' + (p === wb.activePath ? ' active' : '');
    row.dataset.path = p;
    const icon = /\.html?$/i.test(p) ? 'i-eye' : /\.(png|jpe?g|gif|svg|webp)$/i.test(p) ? 'i-layers' : 'i-file';
    row.innerHTML = `<svg><use href="#${icon}"/></svg><span class="nm">${esc(p)}</span><span class="sz">${(files[p] || '').split('\n').length}L</span>`;
    row.title = p;
    host.append(row);
  }
}

export function bindFileTree() {
  $('#fileTree').addEventListener('click', (e) => {
    const row = e.target.closest('.ft-row');
    if (!row) return;
    openFile(row.dataset.path);
    switchPane('code');
  });
}

/* ─────────────────────────── editor ─────────────────────────── */

export function openFile(path) {
  if (path == null || store.files[path] === undefined) return;
  wb.activePath = path;
  const input = $('#editorInput');
  input.value = store.files[path];
  paintEditor();
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
  $('#crumbs').innerHTML = `${dir ? `<span class="dir">${esc(dir)}</span>` : ''}<b>${esc(path.slice(dir.length))}</b>`;
  renderFileTree();
}

export function paintEditor() {
  const input = $('#editorInput');
  const lang = guessLang(wb.activePath) || 'javascript';
  $('#editorHighlight').innerHTML = `<code>${highlight(input.value, lang)}</code>`;
  $('#gutter').textContent = gutter(input.value);
}

export function bindEditor() {
  const input = $('#editorInput');
  const scroll = $('.editor-scroll');
  input.addEventListener('input', () => {
    paintEditor();
    if (wb.activePath) { setFile(wb.activePath, input.value, { keepHistory: true }); renderDiff(); }
  });
  scroll.addEventListener('scroll', () => { $('#gutter').style.transform = `translateY(${-scroll.scrollTop}px)`; });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = input.selectionStart; const en = input.selectionEnd;
      input.setRangeText('  ', s, en, 'end');
      input.dispatchEvent(new Event('input'));
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (wb.activePath) { setFile(wb.activePath, input.value); wb.onToast(`Đã lưu ${wb.activePath}`, 'ok'); renderPreview(); }
    }
  });
  $('#fileCopy').addEventListener('click', () => {
    navigator.clipboard.writeText(input.value);
    wb.onToast('Đã copy file', 'ok');
  });
  $('#fileWrap').addEventListener('click', (e) => {
    wb.wrap = !wb.wrap;
    $('.editor-wrap').classList.toggle('wrap', wb.wrap);
    e.currentTarget.classList.toggle('on', wb.wrap);
  });
  $('#fileDownload').addEventListener('click', () => download(input.value, wb.activePath || 'file.txt'));
}

/* ─────────────────────────── preview ─────────────────────────── */

/**
 * Tiêm vào đầu mỗi preview:
 *  - bắt console.* / lỗi runtime gửi về panel Console của workbench
 *  - shim localStorage/sessionStorage: iframe sandbox (opaque origin) không cho
 *    dùng storage thật, mà demo nào cũng cần nó
 */
const BOOT = `<script>
(function(){
  var send=function(lvl,a){try{parent.postMessage({__zeko:1,lvl:lvl,msg:Array.prototype.map.call(a,function(x){
    try{return typeof x==='object'?JSON.stringify(x,null,1):String(x)}catch(e){return String(x)}}).join(' ')},'*')}catch(e){}};
  ['log','warn','error','info'].forEach(function(k){var o=console[k].bind(console);console[k]=function(){var a=arguments;send(k,a);return o.apply(null,a)}});
  window.addEventListener('error',function(e){send('error',[e.message+' @ '+((e.filename||'').split('/').pop())+':'+e.lineno])});
  window.addEventListener('unhandledrejection',function(e){send('error',['Promise: '+((e.reason&&e.reason.message)||e.reason)])});
  function memStorage(name){
    var m={};
    var api={getItem:function(k){return k in m?m[k]:null},setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},
      clear:function(){m={}},key:function(i){return Object.keys(m)[i]||null},get length(){return Object.keys(m).length}};
    try{Object.defineProperty(window,name,{value:api,configurable:true,writable:false})}catch(e){}
  }
  ['localStorage','sessionStorage'].forEach(function(n){try{window[n].getItem('__zeko__')}catch(e){memStorage(n)}});
  parent.postMessage({__zeko:1,lvl:'ready',msg:''},'*');
})();
</script>`;

export function renderPreview(forceEntry) {
  const frame = $('#previewFrame');
  const files = store.files;
  const entries = Object.keys(files).filter((p) => /\.html?$/i.test(p));
  const sel = $('#entrySelect');
  const prev = sel.value;
  sel.innerHTML = entries.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
  if (entries.includes(forceEntry)) sel.value = forceEntry;
  else if (entries.includes(prev)) sel.value = prev;

  if (!entries.length) {
    if (frame) frame.removeAttribute('srcdoc');
    $('.preview-stage').innerHTML = `<div class="preview-empty"><svg><use href="#i-eye"/></svg><div><b>Chưa có gì để chạy thử</b><br><span style="font-size:12px">Yêu cầu agent tạo một trang HTML (ví dụ: "làm trang landing page") — nó sẽ hiện ở đây ngay.</span></div></div>`;
    return;
  }
  if (!$('#previewFrame')) {
    $('.preview-stage').innerHTML = '<iframe id="previewFrame" title="Live preview" sandbox="allow-scripts allow-modals allow-forms allow-popups allow-pointer-lock"></iframe>';
    bindConsole();
  }
  const f = $('#previewFrame');
  const built = buildPreview(files, sel.value);
  if (!built.ok) return;
  let html = built.html;

  // JSX/React: nạp React UMD + Babel và đánh dấu script là text/babel
  const jsxFiles = built.used.filter((p) => /\.jsx?$|\.tsx$/.test(p));
  const usesBabel = /text\/babel/.test(html) || jsxFiles.some((p) => /\.jsx|\.tsx/.test(p));
  if (usesBabel) {
    for (const p of jsxFiles) html = html.replace(new RegExp(`<script data-file="${p.split('/').pop().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g'), '<script type="text/babel" data-file="' + p.split('/').pop() + '"');
    html = html.replace(/<\/head>/i, `<script src="/vendor/react.production.min.js"></script><script src="/vendor/react-dom.production.min.js"></script><script src="/vendor/babel.min.js"></script></head>`);
  }
  html = html.replace(/<head([^>]*)>/i, (m) => m + BOOT);
  if (!/<head/i.test(html)) html = BOOT + html;

  wb.consoleErrors = 0;
  $('#consoleDot').className = 'console-dot';
  $('#previewConsole').textContent = '';
  f.style.width = wb.device;
  f.srcdoc = html;
  store.settings.device = wb.device;
}

let consoleBound = false;
function bindConsole() {
  if (consoleBound) return;
  consoleBound = true;
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.__zeko !== 1) return;
    const box = $('#previewConsole');
    if (d.lvl === 'ready') return;
    const line = document.createElement('div');
    line.className = 'log-line ' + (d.lvl === 'error' ? 'err' : d.lvl === 'warn' ? 'warn' : '');
    line.textContent = `${d.lvl === 'error' ? '✖' : d.lvl === 'warn' ? '▲' : '›'} ${d.msg}`;
    box.append(line);
    box.scrollTop = box.scrollHeight;
    if (d.lvl === 'error') {
      wb.consoleErrors++;
      $('#consoleDot').className = 'console-dot err';
    } else if (!$('#consoleDot').classList.contains('err')) {
      $('#consoleDot').className = 'console-dot log';
    }
  });
}

export function bindPreview() {
  $('#entrySelect').addEventListener('change', () => renderPreview($('#entrySelect').value));
  $('#previewReload').addEventListener('click', () => renderPreview($('#entrySelect').value));
  $('#previewOpen').addEventListener('click', () => {
    const html = $('#previewFrame').srcdoc;
    if (!html) return wb.onToast('Chưa có preview', 'info');
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank', 'noopener');
  });
  $('#previewDownload').addEventListener('click', () => {
    const html = $('#previewFrame').srcdoc;
    if (!html) return wb.onToast('Chưa có preview', 'info');
    download(html, 'preview.html');
  });
  $('#deviceSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-w]');
    if (!b) return;
    $$('#deviceSeg button').forEach((x) => x.classList.toggle('active', x === b));
    wb.device = b.dataset.w;
    $('#previewFrame').style.width = wb.device;
  });
  bindConsole();
}

/* ─────────────────────────── diff ─────────────────────────── */

/** LCS line diff. Returns [{t:'eq'|'add'|'del', a, b, text}]. */
export function diffLines(aStr, bStr, cap = 1200) {
  const a = String(aStr || '').split('\n').slice(0, cap);
  const b = String(bStr || '').split('\n').slice(0, cap);
  const n = a.length; const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let k = m - 1; k >= 0; k--) {
      dp[i][k] = a[i] === b[k] ? dp[i + 1][k + 1] + 1 : Math.max(dp[i + 1][k], dp[i][k + 1]);
    }
  }
  const out = [];
  let i = 0; let k = 0;
  while (i < n && k < m) {
    if (a[i] === b[k]) { out.push({ t: 'eq', a: i + 1, b: k + 1, text: a[i] }); i++; k++; }
    else if (dp[i + 1][k] >= dp[i][k + 1]) { out.push({ t: 'del', a: i + 1, text: a[i] }); i++; }
    else { out.push({ t: 'add', b: k + 1, text: b[k] }); k++; }
  }
  while (i < n) { out.push({ t: 'del', a: i + 1, text: a[i++] }); }
  while (k < m) { out.push({ t: 'add', b: k + 1, text: b[k++] }); }
  return out;
}

export function changedFiles() {
  const out = [];
  for (const [p, prev] of Object.entries(store.fileHistory)) {
    if (store.files[p] !== undefined && store.files[p] !== prev) out.push(p);
    else if (store.files[p] === undefined) out.push(p);
  }
  return out;
}

export function renderDiff() {
  const list = changedFiles();
  $('#diffBadge').textContent = String(list.length);
  $('#diffBadge').classList.toggle('on', list.length > 0);
  const body = $('#diffBody');
  const head = $('#diffHead');
  if (!list.length) {
    head.textContent = '';
    body.innerHTML = `<div class="preview-empty"><svg><use href="#i-diff"/></svg><div><b>Chưa có thay đổi</b><br><span style="font-size:12px">Khi agent ghi đè một file đã có, diff sẽ hiện ở đây.</span></div></div>`;
    return;
  }
  head.innerHTML = list.map((p) => `<span class="chip" data-diff="${esc(p)}">${esc(p)}</span>`).join('')
    + `<button class="btn ghost" id="revertAll" style="margin-left:auto;padding:5px 9px;font-size:12px"><svg><use href="#i-undo"/></svg>Hoàn tác tất cả</button>`;
  body.textContent = '';
  for (const p of list) {
    const rows = diffLines(store.fileHistory[p] || '', store.files[p] || '');
    const adds = rows.filter((r) => r.t === 'add').length;
    const dels = rows.filter((r) => r.t === 'del').length;
    const box = document.createElement('div');
    box.className = 'diff-file';
    box.innerHTML = `<h5>${esc(p)}<span class="add">+${adds}</span><span class="del">−${dels}</span>
      <button class="icon-btn" data-revert="${esc(p)}" title="Hoàn tác file này" style="margin-left:auto"><svg><use href="#i-undo"/></svg></button></h5>
      <table class="diff-table"><tbody>${rows.filter((r) => r.t !== 'eq').slice(0, 400).map((r) => `
        <tr class="${r.t}"><td class="n">${r.a ?? r.b ?? ''}</td><td class="s">${r.t === 'add' ? '+' : '−'}</td><td class="c">${esc(r.text)}</td></tr>`).join('') || '<tr><td class="c" style="padding:8px 10px;color:var(--muted)">không có khác biệt</td></tr>'}
      </tbody></table>`;
    body.append(box);
  }
  head.onclick = (e) => {
    const chip = e.target.closest('[data-diff]');
    if (chip) { openFile(chip.dataset.diff); switchPane('code'); return; }
    if (e.target.closest('#revertAll')) {
      for (const p of list) {
        if (store.fileHistory[p] === undefined) delete store.files[p];
        else store.files[p] = store.fileHistory[p];
        delete store.fileHistory[p];
      }
      persist(); renderDiff(); renderFileTree(); renderPreview();
      wb.onToast('Đã hoàn tác mọi thay đổi', 'ok');
    }
  };
  body.onclick = (e) => {
    const b = e.target.closest('[data-revert]');
    if (!b) return;
    const p = b.dataset.revert;
    if (store.fileHistory[p] === undefined) delete store.files[p];
    else store.files[p] = store.fileHistory[p];
    delete store.fileHistory[p];
    persist(); renderDiff(); renderFileTree(); renderPreview();
  };
}

/* ─────────────────────────── telemetry ─────────────────────────── */

export function pushTelemetry(meta, mode) {
  const host = $('#tele');
  const empty = host.querySelector('.tele-empty');
  if (empty) empty.remove();
  const rows = (meta.streams || []).filter((s) => s.chars || s.error);
  const maxMs = Math.max(1, ...rows.map((r) => r.ms || 0));
  const colors = { deep: 'var(--accent-2)', flash: 'var(--accent)', final: 'linear-gradient(90deg,#22d3a7,#7c5cff)', draft: 'var(--accent)', review: 'var(--accent-3)' };
  const el = document.createElement('div');
  el.className = 'tele-row';
  el.innerHTML = `
    <div class="th"><b>${esc(mode || meta.mode || '')}</b>
      <span class="tag mute">${new Date().toLocaleTimeString('vi-VN')}</span>
      <span class="tag ${rows.some((r) => r.error) ? 'bad' : 'ok'}">${(meta.totalMs / 1000).toFixed(1)}s</span>
      <span class="tag mute">${meta.tokens || 0} tok</span>
    </div>
    ${rows.map((r) => `
      <div class="kv" style="margin-bottom:5px">
        <span><b>${esc(r.stream)}</b></span>
        <span>${esc(r.provider || '')}</span>
        <span>${esc(r.model || '—')}</span>
        <span>key ${esc(r.key || '—')}</span>
        <span>${r.ms ? (r.ms / 1000).toFixed(1) + 's' : '—'}</span>
        <span>${r.usage?.total_tokens ? r.usage.total_tokens + ' tok' : (r.chars ? '~' + Math.round(r.chars / 4) + ' tok' : '')}</span>
        <span>${r.chars || 0} ký tự</span>
        ${r.error ? `<span style="color:var(--danger)">${esc(r.error).slice(0, 90)}</span>` : ''}
      </div>
      <div class="bar"><i style="width:${Math.round(((r.ms || 0) / maxMs) * 100)}%;background:${colors[r.stream] || 'var(--accent)'}"></i></div>
    `).join('')}`;
  host.prepend(el);
  while (host.children.length > 30) host.lastChild.remove();
}

export function resetTelemetry() {
  $('#tele').innerHTML = `<div class="tele-empty">Mỗi lượt trả lời sẽ ghi lại: model nào chạy, API key nào được roll, bao nhiêu token và mất bao lâu.</div>`;
}

/* ─────────────────────────── shared ─────────────────────────── */

export function switchPane(name) {
  $$('.wb-tab').forEach((t) => t.classList.toggle('active', t.dataset.wb === name));
  $$('.wb-pane').forEach((p) => p.classList.toggle('active', p.dataset.wbpane === name));
}

export function bindTabs() {
  $('.wb-tabs').addEventListener('click', (e) => {
    const t = e.target.closest('.wb-tab');
    if (t) switchPane(t.dataset.wb);
  });
}

export function download(text, filename) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (filename || 'file.txt').split('/').pop();
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export async function downloadZip(files, name = 'zeko-project') {
  if (!window.JSZip) return false;
  const zip = new window.JSZip();
  for (const [p, c] of Object.entries(files)) zip.file(p, c);
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.zip`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return true;
}

export function refreshAll() {
  renderFileTree();
  renderDiff();
  renderPreview();
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export { esc };
