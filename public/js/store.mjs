/**
 * ZeKo Code — client state.
 * Everything the user creates (chats, workspace files, settings) lives here and
 * is mirrored to localStorage, so a refresh never loses work.
 */

const LS_KEY = 'zeko.code.v1';

export const store = {
  settings: {
    mode: 'fusion',
    temperature: 0.35,
    maxTokens: 8192,
    autoReview: false,
    contextFiles: 8,
    systemExtra: '',
    theme: 'dark',
    transport: 'auto', // auto | server | direct
    lineWrap: false,
    device: '100%',
  },
  sessions: [],
  activeId: null,
  files: {},          // workspace of the ACTIVE session (mirrored into the session)
  fileHistory: {},    // path -> previous content, for the Diff tab
  stats: { turns: 0, tokens: 0, ms: 0 },
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function activeSession() {
  return store.sessions.find((s) => s.id === store.activeId) || null;
}

export function newSession({ title = 'Cuộc chat mới' } = {}) {
  const s = { id: uid(), title, createdAt: Date.now(), updatedAt: Date.now(), messages: [], files: {}, history: {} };
  store.sessions.unshift(s);
  store.activeId = s.id;
  store.files = s.files;
  store.fileHistory = s.history;
  persist();
  return s;
}

export function openSession(id) {
  const s = store.sessions.find((x) => x.id === id);
  if (!s) return null;
  store.activeId = id;
  store.files = s.files || (s.files = {});
  store.fileHistory = s.history || (s.history = {});
  persist();
  return s;
}

export function deleteSession(id) {
  const i = store.sessions.findIndex((s) => s.id === id);
  if (i < 0) return;
  store.sessions.splice(i, 1);
  if (store.activeId === id) {
    const next = store.sessions[0] || newSession();
    store.activeId = next.id;
    store.files = next.files;
    store.fileHistory = next.history;
  }
  persist();
}

export function renameSession(id, title) {
  const s = store.sessions.find((x) => x.id === id);
  if (s) { s.title = String(title).slice(0, 80) || s.title; persist(); }
}

export function setFile(path, content, { keepHistory = true } = {}) {
  const s = activeSession();
  if (!s) return;
  if (keepHistory && store.fileHistory[path] === undefined && store.files[path] !== undefined) {
    store.fileHistory[path] = store.files[path];
  }
  store.files[path] = content;
  s.updatedAt = Date.now();
  persist();
}

export function deleteFile(path) {
  delete store.files[path];
  delete store.fileHistory[path];
  persist();
}

export function clearFiles() {
  const s = activeSession();
  for (const k of Object.keys(store.files)) delete store.files[k];
  for (const k of Object.keys(store.fileHistory)) delete store.fileHistory[k];
  if (s) s.updatedAt = Date.now();
  persist();
}

let timer = null;
export function persist() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      const s = activeSession();
      if (s) { s.files = store.files; s.history = store.fileHistory; s.updatedAt = Date.now(); }
      localStorage.setItem(LS_KEY, JSON.stringify({
        settings: store.settings,
        sessions: store.sessions.slice(0, 60),
        activeId: store.activeId,
      }));
    } catch (e) {
      console.warn('[zeko] không lưu được localStorage', e);
    }
  }, 220);
}

export function restore() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    Object.assign(store.settings, data.settings || {});
    store.sessions = Array.isArray(data.sessions) ? data.sessions : [];
    for (const s of store.sessions) {
      s.files = s.files || {};
      s.history = s.history || {};
      s.messages = s.messages || [];
    }
    store.activeId = data.activeId && store.sessions.some((s) => s.id === data.activeId) ? data.activeId : null;
    const s = activeSession();
    if (s) { store.files = s.files; store.fileHistory = s.history; }
    return store.sessions.length > 0;
  } catch (e) {
    console.warn('[zeko] restore lỗi', e);
    return false;
  }
}

export function exportAll() {
  const s = activeSession();
  if (s) { s.files = store.files; s.history = store.fileHistory; }
  return JSON.stringify({ app: 'ZeKo Code', version: 1, exportedAt: new Date().toISOString(), settings: store.settings, sessions: store.sessions }, null, 2);
}

export function importAll(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || !Array.isArray(data.sessions)) throw new Error('File backup không hợp lệ');
  store.sessions = data.sessions.map((s) => ({ ...s, files: s.files || {}, history: s.history || {}, messages: s.messages || [] }));
  if (data.settings) Object.assign(store.settings, data.settings);
  store.activeId = store.sessions[0]?.id || null;
  const s = activeSession();
  store.files = s ? s.files : {};
  store.fileHistory = s ? s.history : {};
  persist();
  return store.sessions.length;
}

/** Session → Markdown (để lưu trữ / chia sẻ). */
export function sessionToMarkdown(session = activeSession()) {
  if (!session) return '';
  const head = `# ${session.title}\n\n_Xuất từ ZeKo Code · ${new Date(session.createdAt || Date.now()).toLocaleString('vi-VN')}_\n`;
  const body = session.messages.map((m) => (m.role === 'user' ? `\n## 👤 Bạn\n\n${m.content}\n` : `\n## 🤖 ZeKo\n\n${m.content}\n`)).join('\n');
  const files = Object.entries(session.files || {});
  const tail = files.length
    ? `\n---\n\n## 📁 Workspace (${files.length} file)\n\n` + files.map(([p, c]) => `\`\`\`\n${p}\n\`\`\`\n\n\`\`\`${p.split('.').pop()}\n${c}\n\`\`\`\n`).join('\n')
    : '';
  return head + body + tail;
}
