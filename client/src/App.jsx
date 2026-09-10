import { useEffect, useMemo, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Header from './components/Header.jsx';
import Chat from './components/Chat.jsx';
import Composer from './components/Composer.jsx';
import PreviewModal from './components/PreviewModal.jsx';
import { useChat } from './hooks/useChat.js';
import { fetchModels } from './lib/api.js';
import { FALLBACK_MODEL } from './constants/index.js';

export default function App() {
  const { state, send, stop, newChat, select, remove } = useChat();
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth > 900
  );
  const [models, setModels] = useState(null);
  const [settings, setSettings] = useState({ temperature: 0.7 });

  const model = useMemo(
    () =>
      models?.active
        ? {
            name: models.active.name,
            version: models.active.version,
            codename: models.active.codename,
            params: models.active.params,
            runtime: models.active.runtime,
          }
        : FALLBACK_MODEL,
    [models]
  );

  const activeConvo = state.convos.find((c) => c.id === state.activeId) || null;

  useEffect(() => {
    let alive = true;
    fetchModels().then((m) => alive && setModels(m));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        newChat();
        setSidebarOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newChat]);

  return (
    <div className="app">
      <Sidebar
        open={sidebarOpen}
        convos={state.convos}
        activeId={state.activeId}
        model={model}
        onNew={newChat}
        onSelect={(id) => {
          select(id);
          if (window.innerWidth <= 900) setSidebarOpen(false);
        }}
        onDelete={remove}
      />
      {sidebarOpen && window.innerWidth <= 900 && (
        <div className="scrim" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="main">
        <Header
          title={activeConvo?.title}
          model={model}
          models={models}
          settings={settings}
          setSettings={setSettings}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
        />
        <Chat
          convo={activeConvo}
          stream={state.stream}
          onSuggestion={(p) => send(p, { temperature: settings.temperature })}
        />
        <Composer
          onSend={(t, opts) => send(t, opts)}
          busy={state.stream !== 'idle'}
          onStop={stop}
          model={model}
          settings={settings}
        />
      </div>

      <PreviewModal />
    </div>
  );
}
