import { F, I } from './markup.js';

const authServer = `import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const app = express();
app.use(cors());
app.use(express.json());

const SECRET = process.env.JWT_SECRET || 'doi-toa-key-nay-trong-production';
const users = new Map(); // trong production → database

function sign(user) {
  return jwt.sign({ sub: user.id, email: user.email }, SECRET, { expiresIn: '7d' });
}

// ---------- Auth middleware ----------
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Thiếu token' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token không hợp lệ hoặc hết hạn' });
  }
}

// ---------- Routes ----------
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Cần email và password' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password tối thiểu 8 ký tự' });
  }
  if (users.has(email.toLowerCase())) {
    return res.status(409).json({ error: 'Email đã tồn tại' });
  }
  const hash = await bcrypt.hash(password, 10);
  const user = { id: users.size + 1, email: email.toLowerCase(), hash, createdAt: new Date().toISOString() };
  users.set(user.email, user);
  res.status(201).json({ token: sign(user), user: { id: user.id, email: user.email } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = users.get(String(email || '').toLowerCase());
  if (!user || !(await bcrypt.compare(String(password || ''), user.hash))) {
    return res.status(401).json({ error: 'Sai email hoặc password' });
  }
  res.json({ token: sign(user), user: { id: user.id, email: user.email } });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ id: req.user.sub, email: req.user.email });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log('🔐 Auth API: http://localhost:' + PORT));
`;

const authClient = `import { createContext, useContext, useEffect, useState } from 'react';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));

  useEffect(() => {
    if (!token) return;
    fetch('/api/me', { headers: { Authorization: 'Bearer ' + token } })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => u && setUser(u))
      .catch(() => setToken(null));
  }, [token]);

  async function login(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const json = await res.json();
    localStorage.setItem('token', json.token);
    setToken(json.token);
    setUser(json.user);
  }

  function logout() {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  }

  return (
    <AuthCtx.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
`;

export default [
  {
    id: 'auth',
    title: 'Auth JWT',
    keywords: [
      'auth', 'authen', 'đăng nhập', 'login', 'register', 'jwt', 'token',
      'password', 'xác thực', 'khoá tài khoản', 'đăng ký', 'auth token',
    ],
    boost: { jwt: 3, 'đăng nhập': 2, login: 2, auth: 2 },
    corpus:
      'xây auth register login với express jwt bcrypt, middleware requireAuth, react context lưu token, refresh token lưu localStorage an toàn',
    render(ctx) {
      const thought =
        'Yêu cầu: "' + ctx.userText + '". → Intent: xác thực người dùng. Chọn stateless JWT (hạn 7 ngày) + bcrypt cost 10 — ' +
        'đúng mức cho app vừa. Phía client: AuthContext đồng bộ token ↔ user, tự verify lại khi mount. ' +
        'Điểm cần cảnh báo với user: JWT_SECRET phải lấy từ env, và hạn chế lưu token trong localStorage ' +
        '(XSS) — production nên dùng httpOnly cookie. Ghi chú rõ trong phần mẹo.';
      const answer =
        '# 🔐 Auth: JWT + bcrypt\n\n' +
        'Register / Login / verify token — đủ chạy end-to-end:\n\n' +
        F('js', 'server/auth.js', authServer) +
        'Phía React:\n\n' +
        F('jsx', 'src/auth.jsx', authClient) +
        'Dùng trong component:\n\n' +
        F('jsx', 'src/Dashboard.jsx', `import { useAuth } from './auth';

export default function Dashboard() {
  const { user, logout } = useAuth();
  if (!user) return <p>Chưa đăng nhập</p>;
  return (
    <div>
      <h1>Xin chào {user.email}</h1>
      <button onClick={logout}>Đăng xuất</button>
    </div>
  );
}`) +
        'Cần cài thêm phía server: ' + I('npm i bcryptjs jsonwebtoken') + '\n\n' +
        '**Checklist bảo mật:**\n\n' +
        '- [ ] ' + I('JWT_SECRET') + ' dài ≥ 32 ký tự, lấy từ env, KHÔNG commit\n' +
        '- [ ] Bật HTTPS — JWT trên HTTP là giao chìa khoá\n' +
        '- [ ] Rate-limit ' + I('/api/auth/*') + ' (express-rate-limit) chống brute force\n' +
        '- [ ] Production: cân nhắc httpOnly cookie thay cho localStorage\n\n' +
        '> 💡 **Mẹo Zeko:** khi cần "đổi mật khẩu có hiệu lực ngay", thêm ' + I('tokenVersion') +
        ' vào JWT payload và bump khi đổi mật khẩu — middleware verify chỉ cần so 1 trường.';
      return { thought, answer };
    },
  },
];
