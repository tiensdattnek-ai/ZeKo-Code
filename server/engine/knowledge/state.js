import { F, I } from './markup.js';

const storeCode = `// ---------- Minimal store (kiểu zustand, ~20 dòng) ----------
function createStore(initial) {
  let state = initial;
  const listeners = new Set();

  return {
    getState: () => state,
    setState: (patch) => {
      const next = typeof patch === 'function' ? patch(state) : patch;
      if (Object.is(next, state)) return;
      state = { ...state, ...next };
      listeners.forEach((fn) => fn(state));
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

// ---------- Ví dụ store toàn cục cho app ----------
export const useAppStore = createStore({
  theme: 'dark',
  cart: [],
});

export function toggleTheme() {
  const { theme } = useAppStore.getState();
  useAppStore.setState({ theme: theme === 'dark' ? 'light' : 'dark' });
}

export function addToCart(item) {
  const { cart } = useAppStore.getState();
  useAppStore.setState({ cart: [...cart, item] });
}
`;

const hookCode = `import { useSyncExternalStore } from 'react';
import { useAppStore } from './store';

// Hook: subscribe đúng slice, re-render đúng chỗ
export function useStoreSelector(selector) {
  return useSyncExternalStore(
    useAppStore.subscribe,
    () => selector(useAppStore.getState()),
    () => selector(useAppStore.getState())
  );
}
`;

const usageCode = `import { useStoreSelector, toggleTheme, addToCart } from './store';

export default function App() {
  // Component này chỉ re-render khi theme đổi (selector trả giá trị primitive)
  const theme = useStoreSelector((s) => s.theme);
  const cartCount = useStoreSelector((s) => s.cart.length);

  return (
    <div data-theme={theme}>
      <button onClick={toggleTheme}>Đổi theme</button>
      <span>Giỏ hàng: {cartCount}</span>
      <button onClick={() => addToCart({ id: Date.now(), name: 'Sản phẩm mới' })}>
        Thêm vào giỏ
      </button>
    </div>
  );
}
`;

export default [
  {
    id: 'state',
    title: 'State Management',
    keywords: [
      'redux', 'zustand', 'context', 'state management', 'quản lý state',
      'store', 'global state', 'state toàn cục', 'reducer',
    ],
    boost: { zustand: 3, redux: 2, 'state management': 3, context: 1 },
    corpus:
      'quản lý state react: context khi nào đủ, store nhỏ viết tay kiểu zustand với useSyncExternalStore, selector chống re-render thừa',
    render(ctx) {
      const thought =
        'Yêu cầu: "' + ctx.userText + '". → Intent: state management. Thông điệp: ĐỪNG lên Redux ngay. ' +
        'Lựa chọn theo mức: (1) state local 80% trường hợp; (2) Context cho theme/user — ít thay đổi; ' +
        '(3) store nhỏ tự viết kiểu zustand (~20 dòng) cho dữ liệu đổi thường xuyên như cart, ' +
        'kèm selector + useSyncExternalStore để re-render đúng slice. Viết tay để user hiểu cơ chế thay vì vùi trong API.';
      const answer =
        '# 🧩 State Management — đúng mức\n\n' +
        'Lộ trình tăng dần, dừng lại ở mức đủ:\n\n' +
        '| Mức | Khi nào | Dùng gì |\n|---|---|---|\n| 1 | Component và con trực tiếp | ' + I('useState') + ' + prop drilling (≤ 3 tầng) |\n| 2 | Few values hiếm đổi (theme, user) | ' + I('Context') + ' |\n| 3 | Dữ liệu đổi thường xuyên (cart, filter) | Store nhỏ + selector |\n| 4 | App lớn, nhiều đội | Redux Toolkit / Zustand "xịn" |\n\n' +
        'Store tự viết — 20 dòng, hiểu 100% cơ chế:\n\n' +
        F('js', 'src/store.js', storeCode) +
        F('jsx', 'src/useStore.js', hookCode) +
        F('jsx', 'src/App.jsx', usageCode) +
        'Vì sao selector quan trọng:\n\n' +
        '- ' + I('s.cart') + ' (tham chiếu object) → mọi component nhận selector này re-render khi cart đổi kiểu gì\n' +
        '- ' + I('s.cart.length') + ' (primitive) → chỉ re-render khi SỐ lượng đổi\n\n' +
        '> 💡 **Mẹo Zeko:** 90% app React không cần thư viện state. Khi nào bạn bắt đầu copy object qua ' +
        '5 tầng props, đó là lúc store xuất hiện.';
      return { thought, answer };
    },
  },
];
