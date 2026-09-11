/**
 * ZeKo Code — tiny syntax highlighter.
 *
 * highlight.js' ESM build only re-exports its CJS bundle, so it cannot be loaded
 * as a browser module without a bundler. Instead of shipping a 3 MB build step we
 * hand-roll a regex-token tokenizer: same visual result for the ~20 languages a
 * coding chat actually produces, zero dependencies, and unit-testable in Node.
 *
 * highlight(code, lang) -> HTML string (input is escaped, never injected raw).
 */

export function escapeHtml(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const R = {
  jsComment: /\/\/[^\n]*|\/\*[\s\S]*?\*\/|^#!.*$/m,
  hashComment: /#[^\n]*/,
  cComment: /\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*/,
  jsString: /`(?:\\[\s\S]|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/,
  dquote: /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/,
  triple: /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/,
  number: /\b0[xXbBoO][\da-fA-F_]+\b|\b\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?\b/,
  jsFn: /[A-Za-z_$][\w$]*(?=\s*\()/,
  prop: /\.[A-Za-z_$][\w$]*/,
  punct: /=>|\.\.\.|[{}()[\];,.:]|[-+*/%=<>!&|^~?]+/,
  htmlTag: /<\/?[A-Za-z][\w:.-]*|\/?>/,
  htmlAttr: /[A-Za-z_:@][\w:.-]*(?=\s*=)/,
  cssSel: /(^|\n)\s*[^{}\n/]+(?=\s*\{)/,
  cssProp: /[-a-zA-Z]+(?=\s*:)/,
  cssAt: /@[\w-]+/,
  decorator: /@[A-Za-z_][\w.]*/,
};

const KW = {
  js: 'const let var function return if else for while do switch case default break continue new delete typeof instanceof in of class extends super this null undefined true false async await yield try catch finally throw static get set import export from as void enum interface type implements readonly public private protected namespace declare keyof infer satisfies using',
  c: 'if else for while do switch case default break continue return struct union enum typedef sizeof static const extern inline volatile register goto auto signed unsigned void int char float double long short bool true false NULL class public private protected virtual override template typename namespace using new delete try catch throw this friend operator',
  py: 'def class return if elif else for while in not and or is None True False import from as with try except finally raise lambda yield global nonlocal pass break continue assert async await del self match case',
  go: 'func package import return if else for range switch case default break continue go chan select defer struct interface map type var const nil true false make new len cap append',
  rs: 'fn let mut const static struct enum impl trait pub use mod crate self Self match if else for while loop return break continue where async await move ref type dyn unsafe Box Some None Ok Err true false',
  sh: 'if then else elif fi for while do done case esac function return exit export local echo cd set unset source alias',
  sql: 'select from where insert into values update set delete create table alter drop index join left right inner outer full on group by order having limit offset as and or not null distinct union all case when then else end primary key foreign references default unique count sum avg min max',
};
const KW_RE = (s) => new RegExp(`\\b(?:${s.trim().split(/\s+/).join('|')})\\b`);

const BUILTIN = {
  js: 'console Math JSON Object Array String Number Boolean Promise Map Set WeakMap WeakSet Symbol Date RegExp Error TypeError fetch require module exports process window document localStorage setTimeout setInterval clearTimeout requestAnimationFrame parseInt parseFloat isNaN structuredClone Intl URL Blob FormData AbortController',
  py: 'print len range int str float list dict set tuple bool type isinstance enumerate zip map filter sorted sum min max open input super property staticmethod classmethod abs round repr id hash any all next iter vars globals locals',
  sh: 'echo printf cd pwd ls rm cp mv mkdir cat grep sed awk curl wget git npm node python pip docker export sudo chmod chown',
};

const RULES = {
  js: [['com', R.jsComment], ['str', R.jsString], ['num', R.number], ['key', KW_RE(KW.js)], ['bui', new RegExp(`\\b(?:${BUILTIN.js.split(' ').join('|')})\\b`)], ['fn', R.jsFn], ['prop', R.prop], ['pun', R.punct]],
  jsx: [['com', R.jsComment], ['tag', /<\/?[A-Z][\w.]*/], ['str', R.jsString], ['num', R.number], ['key', KW_RE(KW.js)], ['bui', new RegExp(`\\b(?:${BUILTIN.js.split(' ').join('|')})\\b`)], ['fn', R.jsFn], ['prop', R.prop], ['pun', R.punct]],
  ts: [['com', R.jsComment], ['str', R.jsString], ['num', R.number], ['key', KW_RE(KW.js)], ['bui', new RegExp(`\\b(?:${BUILTIN.js.split(' ').join('|')})\\b`)], ['fn', R.jsFn], ['prop', R.prop], ['pun', R.punct]],
  json: [['prop', /"[^"\\\n]*(?="\s*:)/], ['str', R.dquote], ['key', KW_RE('true false null')], ['num', R.number], ['pun', R.punct]],
  py: [['com', R.hashComment], ['dec', R.decorator], ['str', R.triple], ['num', R.number], ['key', KW_RE(KW.py)], ['bui', new RegExp(`\\b(?:${BUILTIN.py.split(' ').join('|')})\\b`)], ['fn', R.jsFn], ['prop', R.prop], ['pun', R.punct]],
  html: [['com', /<!--[\s\S]*?-->|<!DOCTYPE[^>]*>/i], ['str', R.dquote], ['tag', R.htmlTag], ['att', R.htmlAttr], ['pun', /=/]],
  css: [['com', /\/\*[\s\S]*?\*\//], ['at', R.cssAt], ['str', R.dquote], ['sel', R.cssSel], ['prop', R.cssProp], ['num', /[-+]?\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg|fr|pt)?\b|#[0-9a-fA-F]{3,8}\b/], ['pun', R.punct]],
  sh: [['com', R.hashComment], ['str', R.dquote], ['var', /\$\{[^}]*\}|\$[\w@#?*-]+/], ['key', KW_RE(KW.sh)], ['bui', new RegExp(`\\b(?:${BUILTIN.sh.split(' ').join('|')})\\b`)], ['num', R.number], ['pun', R.punct]],
  sql: [['com', /--[^\n]*|\/\*[\s\S]*?\*\//], ['str', /'(?:''|[^'])*'/], ['key', KW_RE(KW.sql)], ['num', R.number], ['fn', R.jsFn], ['pun', R.punct]],
  yaml: [['com', R.hashComment], ['prop', /^[\s-]*[A-Za-z_][\w .-]*(?=:)/m], ['str', R.dquote], ['key', KW_RE('true false null yes no on off')], ['num', R.number], ['pun', /[:\-|>[\]{}]/]],
  go: [['com', R.jsComment], ['str', /`[^`]*`|"(?:\\.|[^"\\\n])*"/], ['num', R.number], ['key', KW_RE(KW.go)], ['bui', /\b(?:fmt|os|io|strconv|strings|sync|time|errors|context|http|json)\b/], ['fn', R.jsFn], ['prop', R.prop], ['pun', R.punct]],
  rs: [['com', R.jsComment], ['str', R.dquote], ['num', R.number], ['key', KW_RE(KW.rs)], ['dec', /![\w]+!/], ['fn', R.jsFn], ['prop', R.prop], ['pun', R.punct]],
  cl: [['com', R.cComment], ['str', R.dquote], ['num', R.number], ['key', KW_RE(KW.c)], ['fn', R.jsFn], ['prop', R.prop], ['pun', R.punct]],
  php: [['com', R.cComment], ['var', /\$[A-Za-z_]\w*/], ['str', R.dquote], ['num', R.number], ['key', KW_RE(KW.c + ' function echo print isset unset array foreach as endfunction public private namespace use')], ['fn', R.jsFn], ['prop', R.prop], ['pun', R.punct]],
  ruby: [['com', R.hashComment], ['str', R.dquote], ['sym', /:[A-Za-z_]\w*/], ['num', R.number], ['key', KW_RE('def end class module if elsif else unless while for do return yield begin rescue ensure require attr_accessor self nil true false and or not')], ['fn', R.jsFn], ['pun', R.punct]],
  docker: [['com', R.hashComment], ['key', /^(?:FROM|RUN|CMD|LABEL|EXPOSE|ENV|ADD|COPY|ENTRYPOINT|VOLUME|USER|WORKDIR|ARG|ONBUILD|STOPSIGNAL|HEALTHCHECK|SHELL)\b/m], ['str', R.dquote], ['num', R.number], ['pun', R.punct]],
  generic: [['com', R.jsComment], ['str', R.dquote], ['num', R.number], ['key', KW_RE(KW.c)], ['fn', R.jsFn], ['pun', R.punct]],
};

const ALIAS = {
  javascript: 'js', mjs: 'js', cjs: 'js', node: 'js', js: 'js',
  jsx: 'jsx', react: 'jsx',
  typescript: 'ts', ts: 'ts', tsx: 'ts',
  json: 'json', jsonc: 'json',
  python: 'py', py: 'py', python3: 'py',
  html: 'html', xml: 'html', svg: 'html', vue: 'html', svelte: 'html', htm: 'html',
  css: 'css', scss: 'css', less: 'css', sass: 'css',
  bash: 'sh', sh: 'sh', shell: 'sh', zsh: 'sh', console: 'sh', terminal: 'sh',
  sql: 'sql', mysql: 'sql', postgres: 'sql', postgresql: 'sql',
  yaml: 'yaml', yml: 'yaml', toml: 'yaml', ini: 'yaml', env: 'yaml',
  go: 'go', golang: 'go',
  rust: 'rs', rs: 'rs',
  java: 'cl', c: 'cl', cpp: 'cl', 'c++': 'cl', cs: 'cl', csharp: 'cl', kotlin: 'cl', swift: 'cl', dart: 'cl',
  php: 'php', ruby: 'ruby', rb: 'ruby',
  dockerfile: 'docker', docker: 'docker', makefile: 'sh', gradle: 'cl',
};

const cache = new Map();
function compiled(family) {
  if (cache.has(family)) return cache.get(family);
  const rules = RULES[family] || RULES.generic;
  const src = rules.map(([n, re]) => `(?<${n}>${re.source})`).join('|');
  const re = new RegExp(src, 'gm');
  cache.set(family, re);
  return re;
}

/** Line-oriented languages get their own small pass (diff, markdown). */
function lineMode(code, lang) {
  const lines = code.split('\n');
  if (lang === 'diff' || lang === 'patch') {
    return lines.map((l) => {
      const e = escapeHtml(l);
      if (/^@@/.test(l)) return `<span class="tk-hd">${e}</span>`;
      if (/^\+/.test(l)) return `<span class="tk-add">${e}</span>`;
      if (/^-/.test(l)) return `<span class="tk-del">${e}</span>`;
      return e;
    }).join('\n');
  }
  if (lang === 'markdown' || lang === 'md') {
    return lines.map((l) => {
      let e = escapeHtml(l);
      if (/^\s{0,3}#{1,6}\s/.test(l)) return `<span class="tk-hd">${e}</span>`;
      if (/^\s{0,3}>/.test(l)) return `<span class="tk-com">${e}</span>`;
      e = e.replace(/(`[^`]+`)/g, '<span class="tk-str">$1</span>')
        .replace(/(\*\*[^*]+\*\*)/g, '<span class="tk-b">$1</span>')
        .replace(/(\[[^\]]+\]\([^)]+\))/g, '<span class="tk-link">$1</span>');
      return e;
    }).join('\n');
  }
  return null;
}

export function highlight(code = '', lang = '') {
  const raw = String(code);
  const key = String(lang || '').toLowerCase().trim();
  const lineOut = lineMode(raw, key);
  if (lineOut != null) return lineOut;

  const family = RULES[key] ? key : (ALIAS[key] || 'generic');
  const re = compiled(family);
  re.lastIndex = 0;

  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) out += escapeHtml(raw.slice(last, m.index));
    const g = m.groups || {};
    const name = Object.keys(g).find((k) => g[k] !== undefined) || 'pun';
    out += `<span class="tk-${name}">${escapeHtml(m[0])}</span>`;
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++; // never spin on a zero-width match
  }
  if (last < raw.length) out += escapeHtml(raw.slice(last));
  return out;
}

/** Gutter numbers for a block of code. */
export function gutter(code = '') {
  const n = String(code).split('\n').length;
  let s = '';
  for (let i = 1; i <= n; i++) s += i + '\n';
  return s;
}

export const LANG_LABEL = (lang = '') => {
  const k = String(lang || '').toLowerCase();
  if (!k) return 'text';
  return ALIAS[k] === 'cl' ? k.toUpperCase() : (ALIAS[k] || k).toUpperCase();
};
