/**
 * Extension patches — khi user nói "thêm X" sau khi mình đã sinh code,
 * engine trả về patch đúng X (dark mode, tests, loading, i18n, ...).
 */

const EXT = {
  dark: {
    title: 'Dark mode',
    render() {
      return {
        code: `.css`,
        file: 'styles/theme.css',
        snippet: `/* CSS variables — 2 theme đổi bằng 1 class */
:root {
  --bg: #f6f8fa;
  --surface: #ffffff;
  --text: #1f2328;
  --muted: #57606a;
  --border: #d0d7de;
  --accent: #0969da;
}

[data-theme='dark'] {
  --bg: #0d1117;
  --surface: #161b22;
  --text: #e6edf3;
  --muted: #8b949e;
  --border: #30363d;
  --accent: #58a6ff;
}

body {
  background: var(--bg);
  color: var(--text);
  transition: background 0.25s ease, color 0.25s ease;
}`,
        note: `// Toggle (React)
const [theme, setTheme] = useLocalStorage('theme', 'dark');
useEffect(() => {
  document.documentElement.setAttribute('data-theme', theme);
}, [theme]);

<button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
  {theme === 'dark' ? '☀️' : '🌙'}
</button>`,
      };
    },
  },
  test: {
    title: 'Unit tests',
    render(ctx) {
      return {
        code: `.jsx`,
        file: 'src/__tests__/components.test.jsx',
        snippet: `import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TodoApp from '../components/TodoApp';

describe('TodoApp', () => {
  it('render các item mặc định', () => {
    render(<TodoApp />);
    expect(screen.getByText(/Học React 18/)).toBeTruthy();
  });

  it('thêm item mới khi submit form', async () => {
    render(<TodoApp />);
    fireEvent.change(screen.getByPlaceholderText(/Mô tả việc/), {
      target: { value: 'Viết test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    expect(screen.getByText('Viết test')).toBeTruthy();
  });

  it('bỏ trống input → không thêm item', () => {
    render(<TodoApp />);
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    expect(screen.queryByText('')).toBeNull();
    expect(screen.getByText(/Không có mục nào/)).toBeTruthy();
  });
});`,
        note: `npm i -D vitest @testing-library/react jsdom
# vite.config.js:
// test: { environment: 'jsdom' }
npm test -- --watch`,
      };
    },
  },
  loading: {
    title: 'Loading states',
    render() {
      return {
        code: `.jsx`,
        file: 'src/components/WithLoading.jsx',
        snippet: `import { useEffect, useState } from 'react';

// Wrapper dùng lại: nhận fetcher, tự quản lý loading/error/data
export function useAsync(fn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, deps);

  return { data, error, loading };
}

export function Spinner() {
  return (
    <span
      role="status"
      style={{
        display: 'inline-block',
        width: 18,
        height: 18,
        border: '2px solid rgba(56,189,248,0.3)',
        borderTopColor: '#38bdf8',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }}
    />
  );
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div role="alert" style={{ color: '#f87171', margin: '12px 0' }}>
      ⚠️ {message}{' '}
      {onRetry && <button onClick={onRetry}>Thử lại</button>}
    </div>
  );
}`,
        note: `@keyframes spin { to { transform: rotate(360deg); } }
// Dùng: const { data, loading, error } = useAsync(() => fetch('/api/x').then(r => r.json()));`,
      };
    },
  },
  i18n: {
    title: 'i18n (đa ngôn ngữ)',
    render() {
      return {
        code: `.js`,
        file: 'src/i18n.js',
        snippet: `// i18n tối giản — đủ cho 2-3 ngôn ngữ, không cần thư viện
const DICT = {
  vi: {
    welcome: 'Chào mừng',
    save: 'Lưu',
    cancel: 'Huỷ',
    itemsLeft: (n) => n + ' việc còn lại',
  },
  en: {
    welcome: 'Welcome',
    save: 'Save',
    cancel: 'Cancel',
    itemsLeft: (n) => n + ' items left',
  },
};

let current = 'vi';

export function setLocale(lang) {
  current = DICT[lang] ? lang : 'vi';
}

export function t(key, ...args) {
  const entry = (DICT[current] || DICT.vi)[key];
  return typeof entry === 'function' ? entry(...args) : entry || key;
}`,
        note: `// Trong component:
import { t } from './i18n';
<button>{t('save')}</button>
<span>{t('itemsLeft', remaining)}</span>`,
      };
    },
  },
  error: {
    title: 'Error handling',
    render() {
      return {
        code: `.jsx`,
        file: 'src/ErrorBoundary.jsx',
        snippet: `import { Component } from 'react';

// Bắt lỗi RENDER trong subtree — React 18 không crash cả app
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // nơi gôm: gửi Sentry/DataDog
    console.error('UI crash:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <h2>🚨 Có lỗi xảy ra</h2>
          <p style={{ color: '#8b949e' }}>{this.state.error.message}</p>
          <button onClick={() => this.setState({ error: null })}>
            Thử lại
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Dùng: bao quanh phần UI hay crash
<ErrorBoundary>
  <App />
</ErrorBoundary>`,
        note: `// API: mọi fetch đi qua 1 chỗ — thêm retry 1 lần cho lỗi network
async function safeFetch(url, opts) {
  try {
    return await fetch(url, opts);
  } catch {
    return fetch(url, opts); // retry duy nhất
  }
}`,
      };
    },
  },
  validation: {
    title: 'Validation với Zod',
    render() {
      return {
        code: `.js`,
        file: 'shared/schemas.js',
        snippet: `// Zod — 1 schema dùng CHUNG cả client lẫn server (dùng chung package/shared)
import { z } from 'zod';

export const TodoInput = z.object({
  title: z.string().trim().min(2, 'title tối thiểu 2 ký tự').max(200),
});

// Server (Express middleware)
app.post('/api/tasks', (req, res) => {
  const result = TodoInput.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: result.error.issues.map((i) => i.message),
    });
  }
  // req.body đã có type & được xác nhận hợp lệ
  createTask(result.data);
});

// Client (React)
const parsed = TodoInput.safeParse({ title: input });
if (!parsed.success) {
  setError(parsed.error.issues[0].message);
  return;
}`,
        note: `npm i zod
# đặt schemas ở thư mục shared/ — cả client và server import chung`,
      };
    },
  },
  animation: {
    title: 'Animation',
    render() {
      return {
        code: `.css`,
        file: 'styles/animations.css',
        snippet: `/* Animations thuần CSS — không cần thư viện */

/* Fade + slide khi mount message */
@keyframes rise {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.msg { animation: rise 0.3s ease both; }

/* Skeleton loading shimmer */
@keyframes shimmer {
  from { background-position: -200px 0; }
  to   { background-position: 200px 0; }
}
.skeleton {
  height: 16px;
  border-radius: 6px;
  background: linear-gradient(90deg, #1e293e 25%, #2a3a55 50%, #1e293e 75%);
  background-size: 400px 100%;
  animation: shimmer 1.2s infinite linear;
}

/* Micro-interaction cho button */
.btn { transition: transform 0.12s ease, box-shadow 0.12s ease; }
.btn:hover { transform: translateY(-1px); }
.btn:active { transform: translateY(0) scale(0.98); }

/* Tôn trọng người dùng sợ motion */
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}`,
        note: `// Cần animation phức tạp (drag, physics) → framer-motion
npm i framer-motion
// <motion.div initial={{opacity:0}} animate={{opacity:1}}>…`,
      };
    },
  },
  pagination: {
    title: 'Phân trang / Infinite scroll',
    render() {
      return {
        code: `.jsx`,
        file: 'src/components/InfiniteList.jsx',
        snippet: `import { useEffect, useRef, useState } from 'react';

// Infinite scroll bằng IntersectionObserver — không cần thư viện
export default function InfiniteList({ fetchPage }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const sentinel = useRef(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      async (entries) => {
        if (!entries[0].isIntersecting || loading || !hasMore) return;
        setLoading(true);
        const next = await fetchPage(page + 1);
        setItems((prev) => [...prev, ...next.data]);
        setPage((p) => p + 1);
        setHasMore(next.data.length === next.limit);
        setLoading(false);
      },
      { rootMargin: '200px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [page, hasMore, loading]);

  return (
    <div>
      <ul>
        {items.map((i) => (
          <li key={i.id}>{i.title}</li>
        ))}
      </ul>
      <div ref={sentinel} style={{ height: 1 }}>
        {loading && <span>Đang tải thêm…</span>}
      </div>
    </div>
  );
}`,
        note: `// API phía server: ?page=1&limit=20 → { data, limit, page }
// Keyset pagination (nhanh hơn offset) ở phần Database của mình`,
      };
    },
  },
};

const EXT_PATTERNS = [
  [/dark|đêm|chế độ tối|theme/i, 'dark'],
  [/test|vitest|jest|unit test/i, 'test'],
  [/loading|spinner|skeleton|đang tải/i, 'loading'],
  [/i18n|đa ngôn ngữ|tiếng anh|translate|dịch/i, 'i18n'],
  [/error|lỗi|try catch|boundary|catch/i, 'error'],
  [/valid|zod|schema check/i, 'validation'],
  [/anim|hoạt ảnh|transition|effect/i, 'animation'],
  [/pagination|phân trang|infinite|lazy load|lăn tới cuối/i, 'pagination'],
];

export function detectExtension(text) {
  const t = String(text || '').toLowerCase();
  for (const [re, key] of EXT_PATTERNS) if (re.test(t)) return EXT[key];
  return null;
}

export { EXT };
