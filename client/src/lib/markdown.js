/**
 * Markdown → HTML với code blocks nâng cấp:
 * header (dots + filename + lang), nút Copy / Download / Preview,
 * syntax highlight bằng highlight.js (pre-highlight, không cần DOM pass).
 */
import { marked } from 'marked';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import python from 'highlight.js/lib/languages/python';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import { PREVIEWABLE } from '../constants/index.js';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('jsx', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('tsx', typescript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('css', css);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('vue', xml);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('python', python);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('dockerfile', bash);
hljs.registerLanguage('nginx', yaml);
hljs.registerLanguage('prisma', json);

const DEFAULT_NAMES = {
  jsx: 'Component.jsx',
  tsx: 'Component.tsx',
  js: 'script.js',
  ts: 'script.ts',
  html: 'index.html',
  css: 'styles.css',
  json: 'package.json',
  bash: 'terminal',
  sh: 'terminal',
  sql: 'schema.sql',
  yaml: 'config.yaml',
  text: 'notes.txt',
};

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const SVG = {
  copy:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  download:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M4 21h16"/></svg>',
  eye:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
};

function normalizeLang(lang) {
  const l = (lang || '').toLowerCase();
  if (l === 'js' || l === 'jsx' || l === 'mjs') return 'javascript';
  if (l === 'ts' || l === 'tsx') return 'typescript';
  if (l === 'sh' || l === 'shell' || l === 'dockerfile') return 'bash';
  if (l === 'yml') return 'yaml';
  if (l === 'html' || l === 'vue') return 'xml';
  if (l === 'prisma') return 'json';
  if (l === 'nginx') return 'yaml';
  return l;
}

const renderer = new marked.Renderer();
renderer.code = function (code, infostring) {
  const info = String(infostring || '').trim();
  let lang = 'text';
  let filename = '';
  const m = info.match(/^([a-zA-Z0-9+#.-]+):(.+)$/);
  if (m) {
    lang = m[1].toLowerCase();
    filename = m[2].trim();
  } else if (info) {
    lang = info.split(/\s+/)[0].toLowerCase();
  }

  const key = normalizeLang(lang);
  let highlighted;
  if (hljs.getLanguage(key)) {
    highlighted = hljs.highlight(code, { language: key, ignoreIllegals: true }).value;
  } else {
    highlighted = esc(code);
  }

  const displayName = filename || DEFAULT_NAMES[lang] || DEFAULT_NAMES[key] || 'code';
  const previewable = PREVIEWABLE.includes(lang) || PREVIEWABLE.includes(key);

  return (
    '<div class="codeblock" data-lang="' + esc(lang) + '" data-filename="' + esc(filename) + '">' +
    '<div class="cb-head">' +
    '<span class="cb-dots"><i></i><i></i><i></i></span>' +
    '<span class="cb-file">' + esc(displayName) + '</span>' +
    '<span class="cb-lang">' + esc(key || 'text') + '</span>' +
    '<span class="cb-actions">' +
    '<button class="cb-btn" data-act="copy" title="Copy code" aria-label="Copy code">' + SVG.copy + '</button>' +
    '<button class="cb-btn" data-act="download" title="Tải file" aria-label="Download">' + SVG.download + '</button>' +
    (previewable
      ? '<button class="cb-btn" data-act="preview" title="Preview" aria-label="Preview">' + SVG.eye + '</button>'
      : '') +
    '</span>' +
    '</div>' +
    '<pre class="cb-pre"><code class="hljs">' + highlighted + '</code></pre>' +
    '</div>'
  );
};

marked.setOptions({ gfm: true, breaks: true });
marked.use({ renderer });

export function renderMarkdown(md) {
  try {
    return marked.parse(String(md || ''));
  } catch {
    return '<pre>' + esc(md) + '</pre>';
  }
}
