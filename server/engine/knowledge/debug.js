import { F, I } from './markup.js';

const undefinedFix = `// ❌ Lỗi: Cannot read properties of undefined (reading 'map')
// data.user.profile là undefined ở lần render đầu (fetch chưa về)

// ✅ Fix 1: optional chaining + fallback rỗng
const profile = data?.user?.profile ?? { name: '...', skills: [] };
const skills = profile.skills ?? [];
skills.map((s) => ...);

// ✅ Fix 2: guard ở nơi dữ liệu tới (useEffect)
useEffect(() => {
  fetch('/api/profile')
    .then((r) => r.json())
    .then((json) => {
      if (!json || !json.user) {
        setProfile(null); // state rỗng hợp lệ, UI hiển thị skeleton
        return;
      }
      setProfile(json.user.profile);
    })
    .catch((e) => setError(e.message));
}, []);
`;

const corsFix = `// ❌ Browser chặn: "CORS policy: No 'Access-Control-Allow-Origin'"
// Nguyên nhân: backend không trả CORS header cho origin phía client.

// ✅ Fix phía Express (đúng cách — không cần wildcard trong production):
import cors from 'cors';
const app = express();
app.use(
  cors({
    origin: [
      'http://localhost:5173', // Vite dev
      process.env.PUBLIC_URL,  // production
    ],
    credentials: true,
  })
);

// ⚠️ Tránh: app.use(cors()) wildcard khi dùng cookies/credentials —
//    browser sẽ từ chối. Luôn liệt kê origin cụ thể.
`;

const moduleFix = `# ❌ Error: Cannot find module './store'
# Node ESM bắt buộc khai báo phần mở rộng file:

import { store } from './store.js';   // ✅ ESM
import store from './store.js';       // ✅

# ❌ import { store } from './store';  // ESM: lỗi
# (CJS require('./store') thì không cần — nhưng project đang "type": "module")

# Và kiểm tra: file có đúng vị trí, tên hoa/thường khớp (Linux phân biệt)
ls -la server/
`;

export default [
  {
    id: 'debug',
    title: 'Debug & Fix Lỗi',
    keywords: [
      'bug', 'lỗi', 'error', 'fix', 'debug', 'không chạy', 'bị lỗi', 'lỗi runtime',
      'cannot read properties', 'undefined', 'cors', '500', '404', 'không hoạt động',
      'lỗi node', 'lỗi react', 'crash', 'vỡ', 'không đúng',
    ],
    boost: { 'cannot read properties': 5, cors: 2, 'lỗi': 1, bug: 2 },
    corpus:
      'debug các lỗi phổ biến web: cannot read properties of undefined trong react, cors bị chặn, cannot find module esm, lỗi 500, phương pháp thu hẹp bug',
    render(ctx) {
      const thought =
        'Yêu cầu: "' + ctx.userText + '". → Intent: debug. Chiến lược: không đoán, mà thu hẹp. Liệt kê 4 lỗi "quốc dân" ' +
        '(undefined map, CORS, ESM module, 500) kèm root cause + fix copy-paste được, rồi chốt quy trình debug 5 bước ' +
        'để user tự xử mọi lỗi còn lại: đọc stack → tái hiện → cô lập → giả thuyết → fix + test.';
      const answer =
        '# 🐛 Debug — 4 lỗi "quốc dân" + quy trình\n\n' +
        '**1. ' + I("Cannot read properties of undefined (reading 'map')") + ' trong React**\n\n' +
        'Nguyên nhân: data fetch về bất đồng bộ, lần render đầu ' + I('data') + ' là ' + I('null') + '. Fix:\n\n' +
        F('jsx', 'src/fix.jsx', undefinedFix) +
        '**2. CORS bị browser chặn**\n\n' +
        F('js', 'server/cors.js', corsFix) +
        '**3. ' + I("Cannot find module") + ' — ESM extension**\n\n' +
        F('bash', 'terminal', moduleFix) +
        '**4. Lỗi 500 chung chung**\n\n' +
        '- Express: đảm bảo có error middleware 4 tham số cuối route — lỗi async đang bị nuốt\n' +
        '- Log ' + I('err.stack') + ' (không chỉ ' + I('err.message') + ') trước ' + I('res.status(500)') + '\n' +
        '- 90% lỗi 500 đến từ: JSON.parse dữ liệu rác, gọi ' + I('undefined') + ' như function, thiếu dependency\n\n' +
        '**Quy trình debug 5 bước (dùng cho mọi lỗi còn lại):**\n\n' +
        '1. **Đọc stack từ dưới lên** — dòng đầu tiên trong stack là nơi chết\n' +
        '2. **Tái hiện 100%** — không tái hiện được thì chưa đủ thông tin\n' +
        '3. **Cô lập** — tắt bớt code cho đến khi lỗi biến mất → phạm vi thu hẹp\n' +
        '4. **Giả thuyết → test nhanh nhất** — console.log giá trị nghi phạm ngay trước dòng lỗi\n' +
        '5. **Fix + viết test regression** để không tái diễn\n\n' +
        '> 💡 **Mẹo Zeko:** gửi cho mình **màn hình/stack lỗi đầy đủ + 5 dòng code quanh vị trí lỗi** — ' +
        'mình sẽ chẩn đoán chính xác hơn là mô tả bằng lời.';
      return { thought, answer };
    },
  },
];
