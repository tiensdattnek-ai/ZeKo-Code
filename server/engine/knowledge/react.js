import { F, I } from './markup.js';

const todoCode = `import { useMemo, useState } from 'react';
import './TodoApp.css';

export default function TodoApp() {
  const [items, setItems] = useState([
    { id: 1, text: 'Học React 18 + Hooks', done: true },
    { id: 2, text: 'Viết API bằng Express', done: false },
  ]);
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState('all');

  const visible = useMemo(() => {
    if (filter === 'active') return items.filter((i) => !i.done);
    if (filter === 'done') return items.filter((i) => i.done);
    return items;
  }, [items, filter]);

  const remaining = items.filter((i) => !i.done).length;

  function addItem(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setItems((prev) => [...prev, { id: Date.now(), text, done: false }]);
    setInput('');
  }

  function toggle(id) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  }

  function remove(id) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <div className="todo">
      <h1>Todo — còn {remaining} việc</h1>
      <form onSubmit={addItem}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Mô tả việc cần làm..."
          aria-label="Mô tả công việc"
        />
        <button type="submit">Thêm</button>
      </form>
      <div className="filters">
        {['all', 'active', 'done'].map((f) => (
          <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>
      <ul>
        {visible.map((item) => (
          <li key={item.id} className={item.done ? 'done' : ''}>
            <label>
              <input type="checkbox" checked={item.done} onChange={() => toggle(item.id)} />
              <span>{item.text}</span>
            </label>
            <button className="remove" onClick={() => remove(item.id)} aria-label="Xoá">
              ✕
            </button>
          </li>
        ))}
        {visible.length === 0 && <li className="empty">Không có mục nào 🎉</li>}
      </ul>
    </div>
  );
}
`;

const todoCss = `.todo {
  max-width: 540px;
  margin: 48px auto;
  padding: 28px;
  font-family: system-ui, sans-serif;
  background: #0f1522;
  border: 1px solid #1e293e;
  border-radius: 18px;
  color: #e7edf6;
}
.todo h1 { font-size: 20px; margin: 0 0 16px; }
.todo form { display: flex; gap: 8px; margin-bottom: 12px; }
.todo form input {
  flex: 1;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid #1e293e;
  background: #0a0e15;
  color: inherit;
  outline: none;
}
.todo form input:focus { border-color: #38bdf8; }
.todo button {
  padding: 10px 16px;
  border: 0;
  border-radius: 10px;
  cursor: pointer;
  background: linear-gradient(120deg, #38bdf8, #8b5cf6);
  color: white;
  font-weight: 600;
}
.todo .filters { display: flex; gap: 6px; margin-bottom: 14px; }
.todo .filters button { background: #182238; color: #9fb0c7; font-weight: 500; padding: 6px 12px; }
.todo .filters button.on { background: #38bdf8; color: #06121f; }
.todo ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.todo li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #131b2c;
  border-radius: 10px;
}
.todo li.done span { text-decoration: line-through; color: #64748b; }
.todo li label { display: flex; gap: 10px; align-items: center; cursor: pointer; }
.todo .remove { background: transparent; color: #64748b; font-size: 13px; }
.todo .remove:hover { color: #f87171; }
.todo .empty { justify-content: center; color: #64748b; }
`;

const hooksCode = `import { useCallback, useEffect, useRef, useState } from 'react';

/** Fetch với loading / error / abort khi unmount. */
export function useFetch(url) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    fetch(url, { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then((json) => {
        setData(json);
        setError(null);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [url]);

  return { data, error, loading };
}

/** Trễ giá trị lại n ms — dùng cho search, autocomplete. */
export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** State đồng bộ với localStorage. */
export function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue];
}

/** Click ngoài một phần tử. */
export function useClickOutside(ref, onOutside) {
  const cb = useRef(onOutside);
  cb.current = onOutside;
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) cb.current(e);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref]);
}
`;

const hooksUsage = `import { useFetch, useDebounce } from './hooks';

export default function SearchBox() {
  const [query, setQuery] = useState('');
  const q = useDebounce(query, 400);
  const { data, loading } = useFetch('/api/posts?q=' + encodeURIComponent(q));

  if (loading) return <p>Đang tìm…</p>;
  return (
    <>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul>{(data?.data || []).map((p) => <li key={p.id}>{p.title}</li>)}</ul>
    </>
  );
}
`;

export default [
  {
    id: 'react-component',
    title: 'React Component',
    keywords: [
      'react', 'component', 'reactjs', 'react.js', 'hooks', 'jsx', 'usestate',
      'props', 'state', 'function component', 'hook react', 'component react',
      'viết react', 'tạo react', 'react app',
    ],
    boost: { react: 2, usestate: 2, component: 1, jsx: 1 },
    corpus:
      'tạo react component với hooks useState useEffect useMemo, jsx, props, validation, danh sách crud đơn giản trong 1 file, css tối giản',
    render(ctx) {
      const name = ctx.name;
      const thought =
        'Nhận yêu cầu: "' + ctx.userText + '". → Intent: xây dựng React component dùng Hooks. ' +
        'Phương án: state cục bộ (useState) cho input + danh sách, derived data qua useMemo, ' +
        'actions thuần (add/toggle/remove) để dễ test, validation tối thiểu trước khi push vào state. ' +
        'Đặt tên component là ' + name + ', tách CSS riêng. Xuất code + CSS + hướng dẫn chạy.';
      const answer =
        '# ⚛️ ' + name + '\n\n' +
        'Component ' + name + ' với React 18 + Hooks — state sạch, validation nhẹ, chạy được ngay:\n\n' +
        '**Thiết kế nhanh:**\n\n' +
        '- ' + I('items') + ' — mảng dữ liệu chính, cập nhật bất biến\n' +
        '- ' + I('input') + ' — controlled input, trim + bỏ trống trước khi add\n' +
        '- ' + I('visible') + ' — derived data qua ' + I('useMemo') + ', không render thừa\n' +
        '- actions ' + I('addItem/toggle/remove') + ' tách riêng → dễ test, dễ chuyển sang API sau\n\n' +
        F('jsx', 'src/components/' + name + '.jsx', todoCode) +
        F('css', 'src/components/' + name + '.css', todoCss) +
        '**Chạy thử:**\n\n' +
        F('bash', 'terminal', 'npm create vite@latest my-app -- --template react\ncd my-app\nnpm install\n# copy 2 file trên vào src/components/, import ' + name + ' trong App.jsx\nnpm run dev') +
        '> 💡 **Mẹo Zeko:** nếu component vượt ~120 dòng, tách logic sang custom hook ' +
        I('use' + name) + ' — UI còn lại sẽ mỏng và test hook bằng Vitest là đủ.';
      return { thought, answer };
    },
  },
  {
    id: 'react-hook',
    title: 'React Custom Hooks',
    keywords: [
      'custom hook', 'usefetch', 'usedebounce', 'uselocalstorage', 'hook riêng',
      'viết hook', 'tạo hook', 'react hook', 'hook',
    ],
    boost: { hook: 2, usefetch: 3, usedebounce: 3 },
    corpus:
      'viết custom hook react: useFetch với abort, useDebounce, useLocalStorage, useClickOutside, tái sử dụng logic, hooks best practice',
    render(ctx) {
      const thought =
        'Yêu cầu: "' + ctx.userText + '". → Intent: custom React hooks. Chọn 4 hook thực chiến nhất: ' +
        'useFetch (đúng nghĩa: loading/error/abort khi unmount), useDebounce (rule-of-hooks an toàn), ' +
        'useLocalStorage (lazy init + sync), useClickOutside (ref + handler ổn định qua useRef). ' +
        'Mỗi hook đều idempotent và cleanup đúng cách.';
      const answer =
        '# 🪝 Custom Hooks bộ 4\n\n' +
        'Bộ hook dùng được ngay, follow đúng rules of hooks — mỗi hook tự cleanup để không leak:\n\n' +
        F('jsx', 'src/hooks.js', hooksCode) +
        'Ví dụ kết hợp ' + I('useFetch') + ' + ' + I('useDebounce') + ' cho ô tìm kiếm:\n\n' +
        F('jsx', 'src/components/SearchBox.jsx', hooksUsage) +
        'Luật vàng:\n\n' +
        '1. Hook chỉ gọi hook ở cấp cao nhất, không gọi trong loop/condition\n' +
        '2. Mọi subscription (fetch, timer, event) phải có cleanup\n' +
        '3. Truyền phụ thuộc đúng trong ' + I('useEffect') + ' deps array — thiếu là bug, thừa là render thừa\n\n' +
        '> 💡 **Mẹo Zeko:** đặt tên hook theo dạng ' + I('use + DanhSách + Noun') + ' (useTasks, useUser) — đọc code liền biết dữ liệu tới từ đâu.';
      return { thought, answer };
    },
  },
];
