import { useEffect, useState } from 'react';
import { buildPreview } from '../lib/preview.js';
import { IconX } from './Icons.jsx';

export default function PreviewModal() {
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    function onPreview(e) {
      const { language, code, filename } = e.detail || {};
      if (!code) return;
      setPreview({ language, filename, html: buildPreview({ language, code }) });
    }
    window.addEventListener('zeko:preview', onPreview);
    return () => window.removeEventListener('zeko:preview', onPreview);
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') setPreview(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!preview) return null;

  return (
    <div className="modal-backdrop" onClick={() => setPreview(null)} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">👁 Preview — {preview.filename}</span>
          <span className="modal-lang">{preview.language}</span>
          <button className="icon-btn" onClick={() => setPreview(null)} aria-label="Đóng">
            <IconX size={15} />
          </button>
        </div>
        <iframe
          className="modal-frame"
          sandbox="allow-scripts allow-modals"
          srcDoc={preview.html}
          title="Code preview"
        />
        <div className="modal-foot">
          Sandbox iframe (allow-scripts) · code chạy nguyên gốc, chưa tách module ngoài
        </div>
      </div>
    </div>
  );
}
