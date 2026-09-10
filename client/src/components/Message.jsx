import { useMemo, useState } from 'react';
import { renderMarkdown } from '../lib/markdown.js';
import { FALLBACK_MODEL } from '../constants/index.js';

const SVG_COPY =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
const SVG_CHECK =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

const fmtTime = (at) =>
  new Date(at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

export default function Message({ msg, streaming }) {
  const html = useMemo(() => (msg.content ? renderMarkdown(msg.content) : ''), [msg.content]);
  const [tOpen, setTOpen] = useState(true);
  const isUser = msg.role === 'user';

  function handleCodeAction(e) {
    const btn = e.target.closest('.cb-btn');
    if (!btn) return;
    const block = btn.closest('.codeblock');
    if (!block) return;
    const pre = block.querySelector('pre code');
    const raw = pre ? pre.textContent : '';
    const filename = block.dataset.filename || 'code.' + (block.dataset.lang || 'txt');
    const act = btn.dataset.act;

    if (act === 'copy') {
      navigator.clipboard
        .writeText(raw)
        .then(() => {
          btn.classList.add('ok');
          btn.innerHTML = SVG_CHECK;
          setTimeout(() => {
            btn.classList.remove('ok');
            btn.innerHTML = SVG_COPY;
          }, 1400);
        })
        .catch(() => {});
    } else if (act === 'download') {
      const blob = new Blob([raw], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } else if (act === 'preview') {
      window.dispatchEvent(
        new CustomEvent('zeko:preview', {
          detail: { language: block.dataset.lang, code: raw, filename },
        })
      );
    }
  }

  if (isUser) {
    return (
      <div className="msg user">
        <div className="user-bubble">{msg.content}</div>
      </div>
    );
  }

  const thinking = streaming && msg.status === 'thinking';
  const version = msg.meta?.version || FALLBACK_MODEL.version;

  return (
    <div className="msg assistant">
      <div className="avatar">Z</div>
      <div className="msg-body">
        <div className="msg-head">
          <span className="msg-name">
            ZekoCode v{version}
            <em className="codename">{msg.meta?.codename || 'Aurora'}</em>
          </span>
          {msg.meta?.intent && (
            <span className="intent-chip" title="Intent do classifier checkpoint phân loại">
              {msg.meta.intent} · {Math.round((msg.meta.confidence || 0) * 100)}%
            </span>
          )}
          <span className="msg-time">{fmtTime(msg.at)}</span>
        </div>

        {msg.thought && (
          <details
            className="thought"
            open={tOpen}
            onToggle={(e) => setTOpen(e.target.open)}
          >
            <summary>
              💭 Suy nghĩ{' '}
              <span className={thinking ? 'live' : 'done'}>
                {thinking ? 'đang suy nghĩ…' : 'hoàn tất'}
              </span>
            </summary>
            <div className="thought-text">
              {msg.thought}
              {thinking && <span className="caret" />}
            </div>
          </details>
        )}

        {msg.content ? (
          <div className="md" onClick={handleCodeAction} dangerouslySetInnerHTML={{ __html: html }} />
        ) : null}

        {streaming && msg.content && <span className="caret md-caret" />}
        {thinking && !msg.thought && (
          <div className="typing" aria-label="đang suy nghĩ">
            <i />
            <i />
            <i />
          </div>
        )}

        {msg.status === 'aborted' && (
          <div className="msg-stats warn">⏹ Đã dừng stream</div>
        )}
        {msg.status === 'error' && (
          <div className="msg-stats error">⚠ {msg.error}</div>
        )}
        {msg.stats && !streaming && (
          <div className="msg-stats">
            <span>✓ {msg.stats.usage?.completion_tokens ?? '—'} tokens</span>
            <span>· {msg.stats.tokens_per_sec ?? '—'} tok/s</span>
            <span>· {((msg.stats.elapsed_ms || 0) / 1000).toFixed(1)}s</span>
            {msg.meta?.intent && (
              <span className="stat-intent">
                · intent: {msg.meta.intent} ({Math.round((msg.meta.confidence || 0) * 100)}%)
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
