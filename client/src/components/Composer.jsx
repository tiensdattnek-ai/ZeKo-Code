import { useRef, useState } from 'react';
import { IconSend, IconStop } from './Icons.jsx';

export default function Composer({ onSend, busy, onStop, model, settings }) {
  const [text, setText] = useState('');
  const taRef = useRef(null);

  function autoGrow() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }

  function submit() {
    const t = text.trim();
    if (!t || busy) return;
    onSend(t, { temperature: settings.temperature });
    setText('');
    requestAnimationFrame(autoGrow);
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const approxTokens = Math.max(1, Math.round(text.length / 4));

  return (
    <div className="composer-wrap">
      <div className="composer">
        <textarea
          ref={taRef}
          value={text}
          rows={1}
          placeholder="Mô tả gì bạn cần — React, Node, full stack, debug, deploy…"
          onChange={(e) => {
            setText(e.target.value);
            autoGrow();
          }}
          onKeyDown={onKey}
          aria-label="Nhập yêu cầu"
        />
        <div className="composer-actions">
          {busy ? (
            <button className="send-btn stop" onClick={onStop} title="Dừng stream">
              <IconStop size={15} />
              <span>Dừng</span>
            </button>
          ) : (
            <button className="send-btn" onClick={submit} disabled={!text.trim()} title="Gửi (Enter)">
              <IconSend size={15} />
              <span>Gửi</span>
            </button>
          )}
        </div>
      </div>
      <div className="composer-meta">
        <span className="hint">
          <b>Enter</b> gửi · <b>Shift+Enter</b> xuống dòng
        </span>
        <span className="spacer" />
        <span className="meta-item" title="Model đang chạy">
          ⚡ {model.name}
        </span>
        <span className="meta-item" title="Nhiệt độ sáng tạo">
          T {settings.temperature.toFixed(1)}
        </span>
        {text && <span className="meta-item tokens">≈ {approxTokens} tokens</span>}
      </div>
    </div>
  );
}
