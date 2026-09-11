/**
 * ZeKo Code — markdown → code cards.
 *
 * marked produces the prose; every fenced block is replaced by a placeholder and
 * then hydrated into an interactive card (copy / wrap / save / preview / download)
 * with our own highlighter. Placeholders keep the sanitiser simple and let us
 * re-render a streaming answer without losing card state.
 */

import { marked } from '../vendor/marked.esm.js';
import DOMPurifyMod from '../vendor/purify.es.mjs';
import { highlight, gutter, LANG_LABEL } from './highlight.mjs';
import { parseInfoString } from '../shared/artifacts.mjs';

const purifyInstance = (() => {
  // DOMPurify's ESM default export is the ready instance in a browser, but the
  // bare factory when no `document` existed at import time. Handle both.
  const mod = DOMPurifyMod;
  const candidates = [mod, mod?.default];
  for (const c of candidates) {
    if (c?.sanitize) return c;
    if (typeof c === 'function') {
      try { const inst = c(globalThis.window); if (inst?.sanitize) return inst; } catch { /* try next */ }
    }
  }
  return null;
})();

/** Never inject model-authored HTML raw: sanitise, or escape if no sanitiser. */
function safeSanitize(html) {
  if (purifyInstance) {
    return purifyInstance.sanitize(html, { USE_PROFILES: { html: true }, ADD_ATTR: ['data-idx', 'data-file', 'data-act', 'target', 'rel'] });
  }
  return String(html).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const ICON = {
  copy: 'i-copy', wrap: 'i-terminal', save: 'i-save', eye: 'i-eye', dl: 'i-download', open: 'i-folder',
};

marked.setOptions({ gfm: true, breaks: false });

const renderer = new marked.Renderer();
const origCode = renderer.code.bind(renderer);
renderer.code = function (tokenOrCode, infoArg) {
  // marked >=12 passes a token object; <=11 passes (code, infostring, escaped)
  const text = typeof tokenOrCode === 'object' ? tokenOrCode.text : tokenOrCode;
  const infoRaw = typeof tokenOrCode === 'object' ? tokenOrCode.lang : infoArg;
  const info = parseInfoString(infoRaw || '');
  if (!text) return origCode(tokenOrCode, infoArg);
  renderer.__cards = renderer.__cards || [];
  const idx = renderer.__cards.length;
  renderer.__cards.push({ ...info, code: text.replace(/\n$/, '') });
  return `<div class="cc-slot" data-idx="${idx}"></div>`;
};

marked.use({ renderer });

export function buildCard(card, i) {
  const el = document.createElement('div');
  el.className = 'code-card';
  el.dataset.idx = String(i);
  if (card.path) el.dataset.file = card.path;

  const lines = card.code.split('\n').length;
  const dir = card.path && card.path.includes('/') ? card.path.slice(0, card.path.lastIndexOf('/') + 1) : '';
  const base = card.path ? card.path.slice(dir.length) : (card.title || (card.lang || 'code'));
  const canPreview = /\.html?$/i.test(card.path || '') || card.autoPreview;

  el.innerHTML = `
    <div class="code-card-head">
      <span class="cc-lang ${card.isFile ? 'file' : ''}">${LANG_LABEL(card.lang)}</span>
      <span class="cc-path">${dir ? `<span class="dir">${esc(dir)}</span>` : ''}${esc(base)}</span>
      <span class="cc-meta">${lines} dòng · ${card.code.length} B</span>
      <div class="cc-actions">
        ${canPreview ? btn('eye', 'Chạy thử trong Preview', 'preview') : ''}
        ${card.isFile ? btn('save', 'Lưu vào workspace', 'save') : ''}
        ${card.isFile ? btn('open', 'Mở trong tab Code', 'open') : ''}
        ${btn('wrap', 'Xuống dòng', 'wrap')}
        ${btn('dl', 'Tải file', 'download')}
        ${btn('copy', 'Copy code', 'copy')}
      </div>
    </div>
    <div class="code-scroll">
      <div class="code-ln">
        <span class="ln">${gutter(card.code)}</span>
        <pre><code>${highlight(card.code, card.lang)}</code></pre>
      </div>
    </div>`;
  return el;
}

const btn = (icon, title, act) =>
  `<button class="icon-btn" data-act="${act}" title="${title}"><svg><use href="#${ICON[icon]}"/></svg></button>`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Render markdown into `host` and hydrate code cards.
 * Returns the list of artifacts found (files + snippets).
 */
export function mountMarkdown(host, markdown) {
  renderer.__cards = [];
  const rawHtml = marked.parse(String(markdown || ''), { async: false });
  const safe = safeSanitize(rawHtml);
  const wrap = document.createElement('div');
  wrap.className = 'md';
  wrap.innerHTML = safe;

  const cards = renderer.__cards || [];
  wrap.querySelectorAll('.cc-slot').forEach((slot) => {
    const i = Number(slot.dataset.idx);
    const card = cards[i];
    if (!card) { slot.remove(); return; }
    slot.replaceWith(buildCard(card, i));
  });

  host.textContent = '';
  host.append(wrap);
  return cards;
}

/** Streaming-safe: render without destroying the previous frame mid-typing. */
let rafId = 0;
export function mountMarkdownSoon(host, markdown, done) {
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    const cards = mountMarkdown(host, markdown);
    if (done) done(cards);
  });
}

/** Delegated click handling for every code card inside `root`. */
export function initCardActions(root, handlers) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('.cc-actions [data-act]');
    if (!b) return;
    const cardEl = b.closest('.code-card');
    if (!cardEl) return;
    const code = cardEl.querySelector('pre code')?.textContent || '';
    const path = cardEl.dataset.file || '';
    const lang = cardEl.querySelector('.cc-lang')?.textContent.toLowerCase() || '';
    const act = b.dataset.act;

    if (act === 'copy') {
      navigator.clipboard.writeText(code).then(() => flash(b, 'i-check'), () => {});
      handlers.toast?.('Đã copy ' + (path || `${code.split('\n').length} dòng code`), 'ok');
    } else if (act === 'wrap') {
      cardEl.classList.toggle('wrap');
      b.classList.toggle('on');
    } else if (act === 'download') {
      handlers.download?.(code, path || `snippet.${extOf(lang)}`);
    } else if (act === 'save') {
      handlers.save?.(path, code);
    } else if (act === 'open') {
      handlers.open?.(path, code);
    } else if (act === 'preview') {
      handlers.preview?.(path, code);
    }
  });
}

function flash(b, icon) {
  const use = b.querySelector('use');
  const prev = use.getAttribute('href');
  use.setAttribute('href', `#${icon}`);
  b.classList.add('on');
  setTimeout(() => { use.setAttribute('href', prev); b.classList.remove('on'); }, 900);
}

const EXT = { javascript: 'js', typescript: 'ts', jsx: 'jsx', tsx: 'tsx', python: 'py', html: 'html', css: 'css', json: 'json', bash: 'sh', sql: 'sql', yaml: 'yml', markdown: 'md' };
const extOf = (lang) => EXT[lang] || lang || 'txt';
