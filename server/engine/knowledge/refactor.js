import { F, I } from './markup.js';

const beforeCode = `// ❌ Trước: waterfall — tổng thời gian = tổng từng request
async function loadDashboard() {
  const userRes = await fetch('/api/user');
  const user = await userRes.json();

  const ordersRes = await fetch('/api/orders?userId=' + user.id);
  const orders = await ordersRes.json();

  const statsRes = await fetch('/api/stats?userId=' + user.id);
  const stats = await statsRes.json();

  const badgesRes = await fetch('/api/badges?userId=' + user.id);
  const badges = await badgesRes.json();

  setDashboard({ user, orders, stats, badges }); // 4 lần re-render
}
`;

const afterCode = `// ✅ Sau: song song + 1 lần set state
async function loadDashboard() {
  const [user] = await Promise.all([
    fetch('/api/user').then((r) => r.json()),
  ]);

  // 3 request chỉ phụ thuộc user.id → vẫn song song
  const [orders, stats, badges] = await Promise.all([
    fetch('/api/orders?userId=' + user.id).then((r) => r.json()),
    fetch('/api/stats?userId=' + user.id).then((r) => r.json()),
    fetch('/api/badges?userId=' + user.id).then((r) => r.json()),
  ]);

  setDashboard({ user, orders, stats, badges });
}
// Tổng thời gian: ~tổng (waterfall) → ~2 hop mạng (song song)
`;

const memoCode = `// ❌ Trước: tạo lại function/mảng mỗi lần render → con re-render thừa
function FilteredList({ items, active }) {
  const filtered = items.filter((i) => !active || i.tag === active);
  const handleClick = (id) => select(id);
  return <List items={filtered} onSelect={handleClick} />;
}

// ✅ Sau: useMemo + useCallback — chỉ tính/đổi khi phụ thuộc đổi
import { memo, useMemo, useCallback } from 'react';

const List = memo(function List({ items, onSelect }) {
  return (
    <ul>
      {items.map((i) => (
        <li key={i.id} onClick={() => onSelect(i.id)}>{i.title}</li>
      ))}
    </ul>
  );
});

function FilteredList({ items, active }) {
  const filtered = useMemo(
    () => items.filter((i) => !active || i.tag === active),
    [items, active]
  );
  const handleClick = useCallback((id) => select(id), [select]);
  return <List items={filtered} onSelect={handleClick} />;
}
`;

export default [
  {
    id: 'refactor',
    title: 'Refactor & Performance',
    keywords: [
      'refactor', 'optimize', 'tối ưu', 'performance', 'code chậm', 'chậm',
      'nâng cao', 'clean code', 'bundle', 're-render', 'nặng', 'lag',
    ],
    boost: { 'tối ưu': 2, 'refactor': 2, 'chậm': 1, 're-render': 3 },
    corpus:
      'refactor code: promise.all thay waterfall, useMemo useCallback chống re-render, code splitting, tách component, clean code',
    render(ctx) {
      const thought =
        'Yêu cầu: "' + ctx.userText + '". → Intent: refactor/tối ưu. Ba đòn bẩy hiệu quả nhất cho web app React+Node: ' +
        '(1) song song hoá request bằng Promise.all — giảm tổng thời gian tải rõ nhất; ' +
        '(2) memo/useMemo/useCallback — chỉ dùng khi đã có bằng chứng re-render thừa; ' +
        '(3) code splitting. Trình bày dạng before/after để diff trong đầu được ngay.';
      const answer =
        '# ⚡ Refactor: từ chậm sang nhanh\n\n' +
        '**1. Waterfall → song song (ảnh hưởng lớn nhất)**\n\n' +
        F('js', 'before.js', beforeCode) +
        F('js', 'after.js', afterCode) +
        '**2. Chống re-render thừa (dùng khi đã profile)**\n\n' +
        F('jsx', 'src/List.jsx', memoCode) +
        'Khi nào NÊN / KHÔNG NÊN:\n\n' +
        '| Nên | Không nên |\n|---|---|\n| Array/object mới tạo mỗi render truyền xuống con memo | Memo hoá component rẻ (chỉ render text) |\n| Function tạo lại mỗi lần + con nhận props object | deps array để trống ' + I('[]') + ' để "tránh render" |\n| Kết quả calculate nặng (sort, group, filter lớn) | useMemo cho ' + I('a + b') + ' |\n\n' +
        '**3. Code splitting — giảm thời gian tải đầu**\n\n' +
        F('jsx', 'src/App.jsx', `import { lazy, Suspense } from 'react';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Settings = lazy(() => import('./pages/Settings'));

export default function App() {
  return (
    <Suspense fallback={<p>Đang tải…</p>}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Suspense>
  );
}`) +
        '**Checklist refactor an toàn:**\n\n' +
        '- [ ] Test (hoặc ít nhất manual checklist) SẴN SÀNG trước khi đổi cấu trúc\n' +
        '- [ ] Mỗi lần refactor 1 bước nhỏ, chạy test ngay\n' +
        '- [ ] Profile trước (React DevTools Profiler, ' + I('performance') + ' tab) — đo số 2 lần để so\n' +
        '- [ ] Giữ behaviour y hệt: refactor ≠ đổi feature\n\n' +
        '> 💡 **Mẹo Zeko:** 80% "chậm" trên web đến từ network, không phải CPU. Sửa waterfall trước, ' +
        'chỉ chạm memo khi Profiler chỉ ra bottleneck thật.';
      return { thought, answer };
    },
  },
];
