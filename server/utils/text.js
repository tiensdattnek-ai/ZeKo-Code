/**
 * Text utilities: tokenize, tên component, features.
 */
export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .match(/[a-z0-9_]+/g) || [];
}

export function pascal(s) {
  return String(s)
    .trim()
    .split(/[\s_\-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

const NAME_HINTS = [
  [/todo|nhiệm vụ|việc cần làm|task list|nhiệm vụ/i, 'TodoApp'],
  [/kanban/i, 'KanbanBoard'],
  [/timer|đồng hồ|đếm ngược|countdown/i, 'TimerApp'],
  [/counter|đếm số|hiệu ứng đếm/i, 'CounterApp'],
  [/blog/i, 'BlogApp'],
  [/chat|nhắn tin|trò chuyện|messenger/i, 'ChatApp'],
  [/music|nhạc|audio|player/i, 'MusicPlayer'],
  [/dashboard|bảng điều khiển/i, 'Dashboard'],
  [/store|cửa hàng|shop|mua sắm|thương mại/i, 'StoreApp'],
  [/game/i, 'MiniGame'],
  [/weather|thời tiết/i, 'WeatherApp'],
  [/note|ghi chú/i, 'NotesApp'],
  [/invoice|hóa đơn/i, 'InvoiceApp'],
  [/quiz|trắc nghiệm/i, 'QuizApp'],
  [/form|biểu mẫu|đăng ký|đăng nhập|login|register/i, 'FormApp'],
  [/landing|landing page|trang chủ|website/i, 'LandingPage'],
];

export function extractName(text) {
  const t = String(text || '');
  const quoted = t.match(/["'“”‘’]([A-Za-zÀ-ỹ][A-Za-z0-9À-ỹ _-]{1,30})["'“”‘’]/);
  if (quoted) return pascal(quoted[1]);
  for (const [re, name] of NAME_HINTS) if (re.test(t)) return name;
  const cap = t.match(/\b([A-Z][a-z]{2,})\b/);
  if (cap) return pascal(cap[1]);
  return 'TodoApp';
}

/** Truncate an toàn cho hiển thị trong thought. */
export function clip(text, n) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
