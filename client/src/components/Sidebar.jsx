import { IconPlus, IconChat, IconTrash, Logo } from './Icons.jsx';

export default function Sidebar({ open, convos, activeId, model, onNew, onSelect, onDelete }) {
  return (
    <aside className={'sidebar' + (open ? ' open' : '')}>
      <div className="sb-brand">
        <Logo size={34} />
        <div className="sb-brand-text">
          <b>Zeko Code</b>
          <span>AI Coding Agent</span>
        </div>
      </div>

      <button className="new-chat" onClick={onNew} title="Ctrl/⌘ + K">
        <IconPlus size={15} />
        <span>New chat</span>
        <kbd>⌘K</kbd>
      </button>

      <div className="sb-label">Cuộc trò chuyện</div>
      <nav className="sb-list">
        {convos.length === 0 && <div className="sb-empty">Chưa có cuộc trò chuyện nào.</div>}
        {convos.map((c) => (
          <div
            key={c.id}
            className={'sb-item' + (c.id === activeId ? ' active' : '')}
            onClick={() => onSelect(c.id)}
            title={c.title}
          >
            <IconChat size={14} className="sb-ico" />
            <span className="sb-title">{c.title}</span>
            <button
              className="sb-del"
              aria-label="Xoá cuộc trò chuyện"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(c.id);
              }}
            >
              <IconTrash size={13} />
            </button>
          </div>
        ))}
      </nav>

      <div className="sb-foot">
        <div className="model-card">
          <div className="model-ava">Z</div>
          <div className="model-meta">
            <b>{model.name}</b>
            <span>
              {model.codename} · {model.runtime} · {model.params}
            </span>
          </div>
          <span className="dot online" title="Sẵn sàng" />
        </div>
      </div>
    </aside>
  );
}
