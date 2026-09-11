/**
 * ZeKo Code — artifact / diff parsing.
 * Pure functions, shared by the browser UI and the test-suite.
 */

const FENCE_INFO = /^([A-Za-z0-9_+#.-]*)\s*(.*)$/;
const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Closing fence = same char as the opener, at least as many repetitions. */
const closingFenceRe = (fence) => new RegExp(`^\\s{0,3}${reEsc(fence[0])}{${fence.length},}\\s*$`);

/**
 * Parse a fence info-string:  ```tsx src/App.tsx:preview title="App"
 * -> { lang, path, autoPreview, title, isFile }
 * Shared by the markdown renderer and the artifact extractor so both agree.
 */
export function parseInfoString(raw = '') {
  const info = String(raw || '').trim();
  const im = FENCE_INFO.exec(info);
  const lang = (im?.[1] || '').toLowerCase();
  let rest = (im?.[2] || '').trim();
  let title = '';
  const t = /title\s*=\s*"([^"]*)"|title\s*=\s*'([^']*)'/i.exec(rest);
  if (t) { title = t[1] ?? t[2] ?? ''; rest = (rest.slice(0, t.index) + ' ' + rest.slice(t.index + t[0].length)).trim(); }
  let path = (rest.split(/\s+/)[0] || '').replace(/^["'`]|["'`]$/g, '');
  let autoPreview = false;
  if (path.endsWith(':preview')) { autoPreview = true; path = path.slice(0, -':preview'.length); }
  const isFile = !!path && (path.includes('/') || path.includes('.'));
  return { lang: lang || (isFile ? guessLang(path) : ''), path: isFile ? path : '', autoPreview, title: title || (isFile ? path.split('/').pop() : ''), isFile };
}

const CONTAINER_LANGS = new Set(['markdown', 'md', 'mdx', 'text', 'txt', 'plaintext', 'org', 'rst']);

/**
 * Extract fenced code blocks from markdown.
 * Returns [{ lang, path, autoPreview, title, code, start, end, fence, isDiff, isFile }]
 * Handles ``` and ~~~, variable fence length, and — for container languages
 * (markdown/text) — nested fences, so a documented example stays one artifact.
 */
export function extractArtifacts(markdown = '') {
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let open = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isBareFence = open && closingFenceRe(open.fence).test(line);

    if (open?.container && !isBareFence && /^\s{0,3}(`{3,}|~{3,})\s*\S/.test(line)) {
      open.depth++;
      open.body.push(line);
      continue;
    }
    if (isBareFence) {
      if (open.container && open.depth > 0) {
        open.depth--;
        open.body.push(line);
        continue;
      }
      open.code = open.body.join('\n');
      open.end = i;
      out.push(open);
      open = null;
      continue;
    }
    if (!open) {
      const m = /^\s{0,3}(`{3,}|~{3,})\s*(.*)$/.exec(line);
      if (!m) continue;
      const [, fence, infoRaw] = m;
      const info = parseInfoString(infoRaw);
      const { lang, path, autoPreview, title, isFile } = info;
      const looksLikePath = isFile;
      open = {
        lang: lang || (looksLikePath ? guessLang(path) : ''),
        path: looksLikePath ? path : '',
        isFile: looksLikePath,
        autoPreview,
        title: title || (looksLikePath ? path.split('/').pop() : ''),
        isDiff: lang === 'diff' || lang === 'patch',
        container: CONTAINER_LANGS.has(lang),
        depth: 0,
        fence,
        start: i,
        end: -1,
        body: [],
        code: '',
      };
      continue;
    }
    open.body.push(line);
  }
  // unterminated fence (streaming) → still emit so the UI can live-render
  if (open) {
    open.code = open.body.join('\n');
    open.end = lines.length;
    open.unterminated = true;
    out.push(open);
  } else {
    for (const a of out) if (a.end < 0) a.end = lines.length;
  }
  return out;
}

const EXT_LANG = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
  json: 'json', html: 'html', htm: 'html', css: 'css', scss: 'scss', md: 'markdown', py: 'python',
  rb: 'ruby', go: 'go', rs: 'rust', java: 'java', php: 'php', sh: 'bash', bash: 'bash', yml: 'yaml',
  yaml: 'yaml', toml: 'toml', sql: 'sql', vue: 'xml', svelte: 'xml', xml: 'xml', svg: 'xml',
  c: 'c', h: 'c', cpp: 'cpp', cs: 'csharp', kt: 'kotlin', swift: 'swift', dockerfile: 'dockerfile',
};

export function guessLang(path = '') {
  const base = path.split('/').pop().toLowerCase();
  if (base === 'dockerfile') return 'dockerfile';
  if (base === 'makefile') return 'makefile';
  const ext = base.includes('.') ? base.split('.').pop() : '';
  return EXT_LANG[ext] || '';
}

/** Parse a unified-ish diff into ops. */
export function parseDiff(code = '') {
  const ops = [];
  for (const raw of String(code).replace(/\r\n?/g, '\n').split('\n')) {
    if (raw.startsWith('@@')) {
      const m = /@@[^@]*@@\s*(.*)$/.exec(raw);
      ops.push({ type: 'hunk', context: (m?.[1] || '').trim() });
      continue;
    }
    if (raw.startsWith('+++') || raw.startsWith('---')) {
      ops.push({ type: 'meta', text: raw });
      continue;
    }
    if (raw.startsWith('+')) ops.push({ type: 'add', text: raw.slice(1) });
    else if (raw.startsWith('-')) ops.push({ type: 'del', text: raw.slice(1) });
    else ops.push({ type: 'keep', text: raw.startsWith(' ') ? raw.slice(1) : raw });
  }
  // a diff string usually ends with a newline → drop the trailing phantom keep
  if (ops.length && ops[ops.length - 1].type === 'keep' && ops[ops.length - 1].text === '') ops.pop();
  return ops;
}

/**
 * Apply a diff to a file. Anchor on `keep` runs; fuzzy-match by ±12 lines.
 * Returns { ok, content, applied, missing } — never throws.
 */
export function applyDiff(original = '', diffCode = '') {
  const src = String(original).replace(/\r\n?/g, '\n').split('\n');
  const ops = parseDiff(diffCode).filter((o) => o.type !== 'meta');
  const out = [];
  let i = 0;
  let applied = 0;
  const missing = [];

  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    if (op.type === 'hunk') continue;
    if (op.type === 'keep') {
      // consume until we find this context line
      if (src[i] === op.text) {
        out.push(src[i++]);
      } else {
        let found = -1;
        for (let d = 1; d <= 40; d++) {
          if (src[i + d] === op.text) { found = i + d; break; }
        }
        if (found >= 0) {
          while (i < found) out.push(src[i++]);
          out.push(src[i++]);
        } else {
          out.push(op.text);
          missing.push(op.text);
        }
      }
      continue;
    }
    if (op.type === 'del') {
      if (src[i] === op.text) { i++; applied++; }
      else {
        let found = -1;
        for (let d = 0; d <= 20; d++) if (src[i + d] === op.text) { found = i + d; break; }
        if (found >= 0) { while (i < found) out.push(src[i++]); i++; applied++; }
        else missing.push(op.text);
      }
      continue;
    }
    if (op.type === 'add') { out.push(op.text); applied++; }
  }
  while (i < src.length) out.push(src[i++]);
  return { ok: missing.length === 0, content: out.join('\n'), applied, missing };
}

/** Build a file map from a list of artifacts. Later wins; diffs merge into existing. */
export function artifactsToFiles(artifacts, existing = {}) {
  const files = { ...existing };
  const log = [];
  for (const a of artifacts) {
    if (!a.isFile) continue;
    const path = a.path;
    if (a.isDiff) {
      const res = applyDiff(files[path] || '', a.code);
      files[path] = res.content;
      log.push({ path, kind: 'patch', ok: res.ok, applied: res.applied, missing: res.missing });
    } else {
      const isNew = !(path in files);
      files[path] = a.code.replace(/\n$/, '');
      log.push({ path, kind: isNew ? 'create' : 'update', lang: a.lang, autoPreview: a.autoPreview, bytes: files[path].length });
    }
  }
  return { files, log };
}

/** Compact digest of the workspace injected into the system prompt. */
export function workspaceDigest(files = {}, { maxFiles = 40, maxChars = 6000 } = {}) {
  const paths = Object.keys(files);
  if (!paths.length) return '';
  const tree = paths.slice(0, maxFiles).map((p) => `- ${p} (${(files[p] || '').split('\n').length} lines)`);
  if (paths.length > maxFiles) tree.push(`- … +${paths.length - maxFiles} file khác`);
  let body = '';
  for (const p of paths.slice(0, maxFiles)) {
    const chunk = `\n### ${p}\n\`\`\`\n${(files[p] || '').slice(0, 1400)}\n\`\`\`\n`;
    if (body.length + chunk.length > maxChars) { body += `\n### ${p}\n(đã cắt bớt vì dài)\n`; continue; }
    body += chunk;
  }
  return `Cây thư mục:\n${tree.join('\n')}\n${body}`.trim();
}

/** Everything the Workbench needs to render a live preview. */
export function buildPreview(files = {}, entryPath = '') {
  const keys = Object.keys(files);
  const entry = entryPath && files[entryPath] != null
    ? entryPath
    : keys.find((k) => /(^|\/)index\.html$/i.test(k))
      || keys.find((k) => /\.html?$/i.test(k))
      || '';
  if (!entry || !/\.html?$/i.test(entry)) return { ok: false, reason: 'no-html' };
  const dir = entry.includes('/') ? entry.slice(0, entry.lastIndexOf('/') + 1) : '';
  let html = files[entry];
  const used = [];

  for (const [path, content] of Object.entries(files)) {
    if (path === entry) continue;
    const rel = path.startsWith(dir) ? path.slice(dir.length) : path;
    const name = rel.split('/').pop();
    if (/\.css$/i.test(path)) {
      html = html.replace(new RegExp(`<link[^>]*href=["']([^"']*${reEsc(name)})["'][^>]*>`, 'gi'), '');
      html = html.replace(/<\/head>/i, `<style data-file="${esc(name)}">\n${content}\n</style>\n</head>`);
      used.push(path);
    } else if (/\.m?js$/i.test(path)) {
      html = html.replace(new RegExp(`<script[^>]*src=["']([^"']*${reEsc(name)})["'][^>]*>\\s*</script>`, 'gi'), '');
      html = html.replace(/<\/body>/i, `<script data-file="${esc(name)}">\n${inlineScript(content)}\n</script>\n</body>`);
      used.push(path);
    }
  }
  return { ok: true, entry, html, used };
}

const esc = (s) => String(s).replace(/"/g, '&quot;');
const inlineScript = (js) => String(js).replace(/<\/script>/gi, '<\\/script>');
