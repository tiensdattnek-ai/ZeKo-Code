import { F, I } from './markup.js';

const serverCode = `import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// ---------- "Database" in-memory (đổi sang file/Postgres khi scale) ----------
let posts = [
  { id: 1, title: 'Chào Express', body: 'Bài viết đầu tiên của blog API', likes: 3 },
];
let nextId = 2;

// ---------- Validation ----------
function validatePost(data) {
  const errors = [];
  if (!data.title || String(data.title).trim().length < 3) {
    errors.push('title tối thiểu 3 ký tự');
  }
  if (!data.body || String(data.body).trim().length < 10) {
    errors.push('body tối thiểu 10 ký tự');
  }
  return errors;
}

// ---------- Routes ----------
app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.get('/api/posts', (req, res) => {
  const { q } = req.query;
  const list = q
    ? posts.filter((p) => p.title.toLowerCase().includes(String(q).toLowerCase()))
    : posts;
  res.json({ count: list.length, data: list });
});

app.get('/api/posts/:id', (req, res) => {
  const post = posts.find((p) => p.id === Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post không tồn tại' });
  res.json(post);
});

app.post('/api/posts', (req, res) => {
  const errors = validatePost(req.body || {});
  if (errors.length) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }
  const post = {
    id: nextId++,
    title: String(req.body.title).trim(),
    body: String(req.body.body).trim(),
    likes: 0,
  };
  posts.push(post);
  res.status(201).json(post);
});

app.patch('/api/posts/:id', (req, res) => {
  const post = posts.find((p) => p.id === Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post không tồn tại' });
  if (req.body.title) post.title = String(req.body.title).trim();
  if (req.body.body) post.body = String(req.body.body).trim();
  res.json(post);
});

app.delete('/api/posts/:id', (req, res) => {
  const idx = posts.findIndex((p) => p.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Post không tồn tại' });
  posts.splice(idx, 1);
  res.status(204).end();
});

// ---------- Error handler (kể cả JSON parse lỗi) ----------
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON không hợp lệ' });
  }
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log('🚀 Blog API đang chạy tại http://localhost:' + PORT);
});
`;

const curlCode = `# Lấy danh sách
curl http://localhost:4000/api/posts

# Tạo bài mới
curl -X POST http://localhost:4000/api/posts \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Bài thứ hai","body":"Nội dung đủ 10 ký tự để qua validation."}'

# Sửa
curl -X PATCH http://localhost:4000/api/posts/1 \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Chào Express (đã sửa)"}'

# Xoá
curl -X DELETE http://localhost:4000/api/posts/2
`;

const fetchCode = `// Phía client gọi API
async function createPost(title, body) {
  const res = await fetch('/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || 'HTTP ' + res.status);
  }
  return res.json();
}
`;

export default [
  {
    id: 'node-express',
    title: 'Node.js Express API',
    keywords: [
      'node', 'express', 'nodejs', 'node.js', 'server', 'api', 'rest', 'crud',
      'backend', 'endpoint', 'route', 'node server', 'api node', 'web server',
    ],
    boost: { express: 2, node: 2, api: 1, crud: 2, rest: 1 },
    corpus:
      'viết server node.js express crud rest api với validation, error handler trung tâm, cors, routing tham số, status code chuẩn, in-memory data',
    render(ctx) {
      const thought =
        'Yêu cầu: "' + ctx.userText + '". → Intent: backend Node.js. Chọn Express vì phổ biến + middleware hệ sinh thái rộng. ' +
        'Kiến trúc: validation tách riêng (pure function, dễ test) → routes theo REST chuẩn (GET/POST/PATCH/DELETE) → ' +
        'error handler trung tâm bắt cả JSON parse lỗi. Data in-memory để chạy ngay; để lại comment thay bằng file/Postgres khi scale. ' +
        'Status code đúng ngữ nghĩa: 201 created, 204 deleted, 400 validation, 404 not found.';
      const answer =
        '# 🚀 Express API chuẩn REST\n\n' +
        'Server Node.js chạy được ngay — validation, error handling, status code đều đúng chuẩn:\n\n' +
        F('js', 'server/index.js', serverCode) +
        '**Test nhanh với curl:**\n\n' +
        F('bash', 'terminal', curlCode) +
        'Gọi từ phía React/JS client:\n\n' +
        F('js', 'client.js', fetchCode) +
        '**Cấu trúc đã áp dụng:**\n\n' +
        '| Lớp | Vai trò |\n|---|---|\n| ' + I('validatePost') + ' | Pure function trả lỗi — không phụ thuộc req/res, test unit dễ |\n| Routes | Mỗi route 3-5 dòng, delegating logic |\n| Error handler | Middleware cuối, 4 tham số, bắt lỗi async & JSON |\n\n' +
        '> 💡 **Mẹo Zeko:** khi dữ liệu nhiều, thay mảng in-memory bằng ' + I('./store.js') +
        ' (JSON file) hoặc Prisma + PostgreSQL — signature các route không cần đổi.';
      return { thought, answer };
    },
  },
];
