const KEY = 'zeko.code.convos.v1';
const MAX_CONVOS = 40;
const MAX_MESSAGES = 80;

export function loadConvos() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data.convos) ? data.convos : [];
  } catch {
    return [];
  }
}

export function saveConvos(convos) {
  try {
    const slim = convos.slice(0, MAX_CONVOS).map((c) => ({
      ...c,
      messages: (c.messages || []).slice(-MAX_MESSAGES),
    }));
    localStorage.setItem(KEY, JSON.stringify({ convos: slim }));
  } catch {
    /* quota full — bỏ qua, app vẫn chạy */
  }
}
