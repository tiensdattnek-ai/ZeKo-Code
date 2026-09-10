import { useEffect, useRef, useState } from 'react';
import { IconMenu, IconGear, IconCaret, IconBolt } from './Icons.jsx';

export default function Header({ title, model, models, onToggleSidebar, settings, setSettings }) {
  const [pop, setPop] = useState(null); // 'model' | 'settings' | null
  const ref = useRef(null);

  useEffect(() => {
    function close(e) {
      if (ref.current && !ref.current.contains(e.target)) setPop(null);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <header className="header" ref={ref}>
      <button className="icon-btn burger" onClick={onToggleSidebar} aria-label="Sidebar">
        <IconMenu size={17} />
      </button>

      <div className="crumb">
        <span className="crumb-app">Zeko Code</span>
        <span className="crumb-sep">/</span>
        <span className="crumb-title">{title || 'Cuộc trò chuyện mới'}</span>
      </div>

      <div className="head-right">
        <span className="sse-badge" title="Server-Sent Events streaming">
          <IconBolt size={11} /> SSE live
        </span>

        <div className="pill-wrap">
          <button
            className="pill"
            onClick={() => setPop(pop === 'model' ? null : 'model')}
            aria-haspopup="listbox"
          >
            <span className="pill-dot" />
            {model.name}
            <IconCaret size={13} className={pop === 'model' ? 'flip' : ''} />
          </button>
          {pop === 'model' && (
            <div className="pop">
              <div className="pop-title">Model</div>
              <button className="pop-item active" onClick={() => setPop(null)}>
                <span>{model.name}</span>
                <em className="chip ok">online</em>
              </button>
              {(models?.pipeline || []).map((m) => (
                <button key={m.id} className="pop-item" disabled>
                  <span>{m.name}</span>
                  <em className={'chip ' + (m.status === 'training' ? 'warn' : '')}>{m.status}</em>
                </button>
              ))}
              <div className="pop-note">Version bump: npm run bump && npm run train</div>
            </div>
          )}
        </div>

        <div className="pill-wrap">
          <button
            className="pill ghost"
            onClick={() => setPop(pop === 'settings' ? null : 'settings')}
            aria-label="Cài đặt"
          >
            <IconGear size={15} />
            <span className="pill-temp">T {settings.temperature.toFixed(1)}</span>
          </button>
          {pop === 'settings' && (
            <div className="pop">
              <div className="pop-title">Nhiệt độ sáng tạo</div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={settings.temperature}
                onChange={(e) => setSettings({ ...settings, temperature: Number(e.target.value) })}
                className="slider"
              />
              <div className="slider-ends">
                <span>Chính xác</span>
                <span>Phóng túng</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
