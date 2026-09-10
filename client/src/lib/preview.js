/**
 * Preview sandbox — build srcDoc HTML chạy trong iframe (sandbox allow-scripts).
 *  - html  → render thẳng (bọc shell nếu thiếu <html>)
 *  - jsx/tsx → React 18 UMD + Babel standalone (CDN), mount component export default
 *  - js/ts  → chạy code, bắt console.log vào bảng output
 *  - css   → áp dụng lên trang demo (button, card, heading)
 */
const CDN = {
  react: 'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
  reactDom: 'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
  babel: 'https://unpkg.com/@babel/standalone@7.24.7/babel.min.js',
};

const ERR_STYLE =
  '#__err{display:none;position:fixed;left:12px;right:12px;bottom:12px;z-index:99;background:#1c1210;color:#fca5a5;border:1px solid #7f1d1d;border-radius:10px;padding:12px 14px;font:13px/1.5 ui-monospace,monospace;white-space:pre-wrap;max-height:40%;overflow:auto}';

const ERR_SCRIPT =
  'window.addEventListener("error",function(e){var el=document.getElementById("__err");if(el){el.style.display="block";el.textContent="⚠ "+e.message;}});';

function baseCss(extra) {
  return (
    '*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;' +
    'background:#f6f8fa;color:#1f2328;padding:24px}' +
    (extra || '')
  );
}

function shell(body, css, scripts, title) {
  return (
    '<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />' +
    '<title>' + title + '</title><style>' + baseCss(css) + ERR_STYLE + '</style></head><body>' +
    body + '<div id="__err"></div><script>' + ERR_SCRIPT + '</' + 'script>' +
    scripts.join('') +
    '</body></html>'
  );
}

/* ---------------- HTML ---------------- */
function previewHtml(code) {
  if (/<html[\s>]/i.test(code)) {
    if (/<\/body>/i.test(code)) {
      return code.replace(/<\/body>/i, '<div id="__err"></div><script>' + ERR_SCRIPT + '</' + 'script></body>');
    }
    return code + '<div id="__err"></div><script>' + ERR_SCRIPT + '</' + 'script>';
  }
  return shell(code, '', [], 'Preview');
}

/* ---------------- JSX / TSX ---------------- */
function cleanComponent(code, isTs) {
  let src = String(code);
  // bỏ import (React + hooks lấy từ global UMD)
  src = src.replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm, '');
  src = src.replace(/^\s*import\s+['"][^'"]+['"];\s*$/gm, '');
  // export default → gán global để script sau mount được
  src = src.replace(/export\s+default\s+/g, 'window.__ZEKO_COMPONENT = ');
  src = src.replace(/export\s+/g, '');
  const hooksLine =
    'const { useState, useEffect, useMemo, useCallback, useRef, useReducer, useContext, createContext, useSyncExternalStore, lazy, Suspense } = React;\n';
  return hooksLine + src;
}

function previewJsx(code, isTs) {
  const presets = isTs ? 'typescript,react' : 'react';
  const mount =
    '<script>' +
    'window.addEventListener("DOMContentLoaded",function(){' +
    'setTimeout(function(){' +
    'var el=document.getElementById("__err");' +
    'try{' +
    'if(window.__ZEKO_COMPONENT===undefined){throw new Error("Không tìm thấy component — code cần có export default");}' +
    'var root=ReactDOM.createRoot(document.getElementById("root"));' +
    'root.render(React.createElement(window.__ZEKO_COMPONENT));' +
    '}catch(e){el.style.display="block";el.textContent="⚠ "+e.message+"\\n"+(e.stack||"");}' +
    '},120);});' +
    '</' +
    'script>';
  return shell(
    '<div id="root"></div>',
    '',
    [
      '<script src="' + CDN.react + '"><' + '/script>',
      '<script src="' + CDN.reactDom + '"><' + '/script>',
      '<script src="' + CDN.babel + '"><' + '/script>',
      '<script type="text/babel" data-presets="' + presets + '">' + cleanComponent(code, isTs) + '<' + '/script>',
      mount,
    ],
    'Preview component'
  );
}

/* ---------------- JS / TS ---------------- */
function previewJs(code) {
  const safe = String(code).replace(/<\/script/gi, '<\\/script');
  const run =
    '<script>' +
    '(function(){' +
    'var logs=[];' +
    'function push(a){logs.push(Array.prototype.map.call(a,function(x){try{return typeof x==="object"?JSON.stringify(x,null,2):String(x)}catch(e){return String(x)}}).join(" "));}' +
    '["log","info","warn","error"].forEach(function(k){var o=console[k];console[k]=function(){push(arguments);o.apply(console,arguments);render();};});' +
    'function esc(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}' +
    'function render(){var el=document.getElementById("out");el.innerHTML=logs.length?logs.map(esc).join("<br>"): "(chưa có output)";}' +
    'render();' +
    'try{' +
    safe +
    '}catch(e){render();push(e.message);}' +
    '})();' +
    '</' +
    'script>';
  return shell(
    '<h3 style="margin:0 0 12px">Console output</h3><pre id="out" style="background:#0d1117;color:#e6edf3;border-radius:10px;padding:14px;min-height:80px;overflow:auto;font:12.5px/1.6 ui-monospace,monospace"></pre>',
    '',
    [run],
    'Preview script'
  );
}

/* ---------------- CSS ---------------- */
function previewCss(code) {
  const demo =
    '<div style="max-width:560px;margin:0 auto">' +
    '<h1 style="font-size:26px;margin-bottom:4px">Demo cho CSS của bạn</h1>' +
    '<p style="color:#57606a;margin-bottom:20px">Các element dưới dùng class chuẩn — CSS của bạn áp dụng trực tiếp.</p>' +
    '<div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">' +
    '<button class="btn">Primary button</button>' +
    '<button class="btn secondary">Secondary</button>' +
    '<button class="btn danger">Danger</button>' +
    '</div>' +
    '<div class="card" style="padding:18px;border-radius:12px;background:#fff;border:1px solid #d0d7de;margin-bottom:14px">' +
    '<h3>Card title</h3><p>Một đoạn văn bản mẫu để xem typography, spacing, màu sắc.</p>' +
    '</div>' +
    '<input class="input" placeholder="Input mẫu" style="padding:10px;border:1px solid #d0d7de;border-radius:10px;width:100%" />' +
    '</div>';
  return shell(demo, '\n' + code, [], 'Preview CSS');
}

export function buildPreview({ language, code }) {
  const lang = String(language || '').toLowerCase();
  switch (lang) {
    case 'html':
    case 'xml':
      return previewHtml(code);
    case 'jsx':
      return previewJsx(code, false);
    case 'tsx':
      return previewJsx(code, true);
    case 'js':
    case 'mjs':
    case 'javascript':
    case 'ts':
    case 'typescript':
      return previewJs(code);
    case 'css':
      return previewCss(code);
    default:
      return shell(
        '<pre style="white-space:pre-wrap;font:13px/1.6 ui-monospace,monospace">' +
          code.replace(/&/g, '&amp;').replace(/</g, '&lt;') +
          '</pre>',
        '',
        [],
        'Preview'
      );
  }
}
