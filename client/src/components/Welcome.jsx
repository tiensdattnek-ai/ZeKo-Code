import { SUGGESTIONS, FALLBACK_MODEL } from '../constants/index.js';
import { Logo } from './Icons.jsx';

export default function Welcome({ onPick }) {
  return (
    <div className="welcome">
      <div className="welcome-logo">
        <Logo size={54} />
      </div>
      <h1 className="welcome-title">
        Zeko <span className="grad">Code</span>
      </h1>
      <p className="welcome-sub">
        Trợ lý AI chuyên code — <b>ZekoCode v{FALLBACK_MODEL.version} ({FALLBACK_MODEL.codename})</b> trực tuyến.
        Mọi code đều có <b>Copy</b> / <b>Download</b> / <b>Preview</b>.
      </p>
      <div className="sug-grid">
        {SUGGESTIONS.map((s) => (
          <button key={s.title} className="sug" onClick={() => onPick(s.prompt)} title={s.prompt}>
            <span className="sug-ico">{s.icon}</span>
            <span className="sug-body">
              <b>{s.title}</b>
              <small>{s.desc}</small>
            </span>
            <span className="sug-arrow">→</span>
          </button>
        ))}
      </div>
    </div>
  );
}
