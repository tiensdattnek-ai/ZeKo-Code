import { F, I } from './markup.js';

const algoCode = `// ---------- Sắp xếp: quicksort (in-place, median-of-3) ----------
function quicksort(arr, lo = 0, hi = arr.length - 1) {
  if (lo >= hi) return arr;
  const mid = (lo + hi) >> 1;
  if (arr[mid] < arr[lo]) [arr[lo], arr[mid]] = [arr[mid], arr[lo]];
  if (arr[hi] < arr[lo]) [arr[lo], arr[hi]] = [arr[hi], arr[lo]];
  if (arr[mid] < arr[hi]) [arr[mid], arr[hi]] = [arr[hi], arr[mid]];
  const pivot = arr[mid];
  [arr[mid], arr[hi - 1]] = [arr[hi - 1], arr[mid]];
  let i = lo;
  let j = hi - 1;
  for (;;) {
    while (arr[++i] < pivot) {}
    while (arr[--j] > pivot) {}
    if (i >= j) break;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  [arr[i], arr[hi - 1]] = [arr[hi - 1], arr[i]];
  quicksort(arr, lo, i - 1);
  quicksort(arr, i + 1, hi);
  return arr;
}
// Đẳng cấp: O(n log n) trung bình, O(n^2) worst (hiếm vì median-of-3)

// ---------- debounce: gộp nhiều call thành 1 sau khi "im lặng" ----------
function debounce(fn, wait = 300) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}
// Ví dụ: ô tìm kiếm chỉ fetch khi người dùng ngừng gõ 300ms

// ---------- throttle: chạy tối đa 1 lần mỗi interval ----------
function throttle(fn, interval = 100) {
  let last = 0;
  let timer = null;
  return function (...args) {
    const now = Date.now();
    const remain = interval - (now - last);
    if (remain <= 0) {
      last = now;
      fn.apply(this, args);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn.apply(this, args);
      }, remain);
    }
  };
}
// Ví dụ: scroll/resize handler — không tràn event

// ---------- memoize: cache kết quả theo key ----------
function memoize(fn) {
  const cache = new Map();
  return function (arg) {
    if (!cache.has(arg)) cache.set(arg, fn(arg));
    return cache.get(arg);
  };
}
// const fib = memoize((n) => (n < 2 ? n : fib(n - 1) + fib(n - 2)));

// ---------- LRU cache: giới hạn kích thước, evict phần cũ nhất ----------
class LRUCache {
  constructor(capacity) {
    this.cap = capacity;
    this.map = new Map(); // Map giữ thứ tự chèn
  }
  get(key) {
    if (!this.map.has(key)) return undefined;
    const v = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, v); // đưa lên mới nhất
    return v;
  }
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.cap) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
  }
}

// ---------- Test nhanh ----------
console.log(quicksort([5, 2, 9, 1, 7, 3]));            // [1, 2, 3, 5, 7, 9]
const c = new LRUCache(2);
c.set('a', 1); c.set('b', 2); c.get('a'); c.set('c', 3);
console.log(c.get('b'));                                 // undefined (bị evict)
console.log(c.get('a'), c.get('c'));                     // 1 3
`;

export default [
  {
    id: 'algorithms',
    title: 'Thuật toán & Tối ưu',
    keywords: [
      'algorithm', 'thuật toán', 'sort', 'sắp xếp', 'quicksort', 'debounce',
      'throttle', 'memoize', 'memoization', 'cache', 'lru', 'dynamic programming',
      'dp', 'độ phức tạp', 'complexity', 'tối ưu thuật toán',
    ],
    boost: { debounce: 3, throttle: 3, quicksort: 3, 'thuật toán': 2 },
    corpus:
      'thuật toán javascript: quicksort in-place, debounce throttle memoize lru cache bằng Map, độ phức tạp big o, tối ưu web',
    render(ctx) {
      const thought =
        'Yêu cầu: "' + ctx.userText + '". → Intent: thuật toán & pattern tối ưu. Chọn 5 cái "ăn tiền": quicksort (in-place, median-of-3), ' +
        'debounce/throttle (khác nhau ở thời điểm chạy — hay bị nhầm), memoize (Map cache), LRU (dùng Map vì nó giữ insertion order). ' +
        'Mỗi cái kèm 1 dòng "dùng khi nào" và test output để user verify được ngay. Kết bằng bảng Big-O.';
      const answer =
        '# 🧠 Thuật toán & Patterns thực chiến\n\n' +
        '5 pattern dùng thật trong web app, kèm test để chạy verify:\n\n' +
        F('js', 'src/algorithms.js', algoCode) +
        '**Debounce vs Throttle — cái hay bị nhầm:**\n\n' +
        '| | Debounce | Throttle |\n|---|---|---|\n| Chạy khi | Input **ngừng** ' + I('wait') + ' ms | Tối đa 1 lần mỗi interval, kể cả liên tục |\n| Use case | Ô tìm kiếm, autosave | Scroll, drag, resize, click spam |\n| Input 100ms liên tục | 1 lần duy nhất cuối | N lần đều đặn |\n\n' +
        '**Độ phức tạp nhanh:**\n\n' +
        '| Operation | Average | Worst |\n|---|---|---|\n| Quicksort | ' + I('O(n log n)') + ' | ' + I('O(n²)') + ' |\n| Array find | ' + I('O(n)') + ' | ' + I('O(n)') + ' |\n| Map get/set | ' + I('O(1)') + ' | ' + I('O(1)') + ' |\n| LRU get/set | ' + I('O(1)') + ' | ' + I('O(1)') + ' |\n\n' +
        '> 💡 **Mẹo Zeko:** muốn nhanh hơn O(n log n) cho dữ liệu lặp lại, thêm ' + I('Map') +
        ' index trước khi sort — web app 90% cần index, không cần thuật toán phức tạp.';
      return { thought, answer };
    },
  },
];
