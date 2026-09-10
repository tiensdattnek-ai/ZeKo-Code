import { F, I } from './markup.js';

const treeCode = `task-app/
├── server/
│   ├── index.js          # Express API + serve client build
│   └── store.js          # JSON file làm "database"
├── client/
│   ├── index.html
│   └── src/
│       └── App.jsx       # React UI gọi /api
├── data/
│   └── tasks.json        # tự sinh khi tạo task đầu
└── package.json
`;

const storeCode = `import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'tasks.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return { nextId: 1, tasks: [] };
  }
}

function save(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

export const store = {
  list() {
    return load().tasks;
  },
  create({ title }) {
    const db = load();
    const task = {
      id: db.nextId++,
      title: String(title).trim(),
      done: false,
      createdAt: new Date().toISOString(),
    };
    db.tasks.push(task);
    save(db);
    return task;
  },
  update(id, patch) {
    const db = load();
    const task = db.tasks.find((t) => t.id === id);
    if (!task) return null;
    if (patch.title) task.title = String(patch.title).trim();
    if (typeof patch.done === 'boolean') task.done = patch.done;
    save(db);
    return task;
  },
  remove(id) {
    const db = load();
    const idx = db.tasks.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    db.tasks.splice(idx, 1);
    save(db);
    return true;
  },
};
`;

const serverCode = `import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());

// ---------- API ----------
app.get('/api/tasks', (req, res) => {
  const tasks = store.list();
  res.json({ count: tasks.length, data: tasks });
});

app.post('/api/tasks', (req, res) => {
  const { title } = req.body || {};
  if (!title || String(title).trim().length < 2) {
    return res.status(400).json({ error: 'title tối thiểu 2 ký tự' });
  }
  res.status(201).json(store.create({ title }));
});

app.patch('/api/tasks/:id', (req, res) => {
  const task = store.update(Number(req.params.id), req.body || {});
  if (!task) return res.status(404).json({ error: 'Task không tồn tại' });
  res.json(task);
});

app.delete('/api/tasks/:id', (req, res) => {
  const ok = store.remove(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Task không tồn tại' });
  res.status(204).end();
});

// ---------- Error handler ----------
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON không hợp lệ' });
  }
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

// ---------- Serve client build (nếu đã build) ----------
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (e) => e && next());
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log('🚀 Task app full stack: http://localhost:' + PORT);
});
`;

const appCode = `import { useCallback, useEffect, useState } from 'react';

const API = '/api/tasks';

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(API);
      const json = await res.json();
      setTasks(json.data || []);
      setError(null);
    } catch {
      setError('Không tải được dữ liệu — server đã chạy chưa?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault();
    if (!title.trim()) return;
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (res.status === 201) {
      setTitle('');
      load();
    }
  }

  async function toggle(task) {
    await fetch(API + '/' + task.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: !task.done }),
    });
    load();
  }

  async function remove(id) {
    await fetch(API + '/' + id, { method: 'DELETE' });
    load();
  }

  if (loading) {
    return <main className="wrap"><p>Đang tải…</p></main>;
  }

  return (
    <main className="wrap">
      <h1>✅ Tasks — full stack</h1>
      {error && <p className="error">{error}</p>}
      <form onSubmit={add}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Việc mới..." />
        <button type="submit">Thêm</button>
      </form>
      <ul>
        {tasks.map((t) => (
          <li key={t.id} className={t.done ? 'done' : ''}>
            <label>
              <input type="checkbox" checked={t.done} onChange={() => toggle(t)} />
              {t.title}
            </label>
            <button className="del" onClick={() => remove(t.id)}>✕</button>
          </li>
        ))}
      </ul>
      <p className="meta">
        {tasks.filter((t) => !t.done).length} việc còn lại · React + Express + JSON file
      </p>
    </main>
  );
}
`;

const pkgCode = `{
  "name": "task-app",
  "type": "module",
  "scripts": {
    "dev:server": "node --watch server/index.js",
    "dev:client": "vite",
    "build": "vite build",
    "start": "node server/index.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.19.2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.8"
  }
}
`;

export default [
  {
    id: 'fullstack',
    title: 'Full Stack App',
    keywords: [
      'full stack', 'fullstack', 'full-stack', 'react node', 'react + node',
      'frontend backend', 'web hoàn chỉnh', 'toàn stack', 'mvp', 'ứng dụng hoàn chỉnh',
    ],
    boost: { 'full stack': 4, fullstack: 4, 'full-stack': 4, mvp: 1 },
    corpus:
      'xây full stack app hoàn chỉnh react frontend + express backend + json file database, file tree, persist dữ liệu, serve static client từ express',
    render(ctx) {
      const thought =
        'Yêu cầu: "' + ctx.userText + '". → Intent: full stack end-to-end. Chốt stack tối giản nhưng đủ "chính chủ": ' +
        'React (client) + Express (API + serve static) + JSON file (persistence không cần DB server). ' +
        'Kiến trúc: tách store.js để route handler mỏng, validation tại API, client gọi fetch tương đối (cùng origin nên không CORS lúc production). ' +
        'Giao theo file tree → server → client → package.json, kèm lệnh chạy.';
      const answer =
        '# 🏗️ Full Stack: React + Express + JSON File\n\n' +
        'Ứng dụng quản lý nhiệm vụ chạy end-to-end, không cần DB server — dữ liệu persist vào file:\n\n' +
        '**Cấu trúc dự án:**\n\n' +
        F('text', 'tree', treeCode) +
        F('js', 'server/store.js', storeCode) +
        F('js', 'server/index.js', serverCode) +
        F('jsx', 'client/src/App.jsx', appCode) +
        F('json', 'package.json', pkgCode) +
        '**Chạy:**\n\n' +
        F('bash', 'terminal', 'npm install\nnpm run build        # build client vào client/dist\nnpm run dev:server   # server serve cả API lẫn UI tại :4000') +
        'Khi dev muốn hot-reload cả hai: chạy ' + I('npm run dev:client') + ' (Vite :5173, proxy /api) song song ' +
        I('npm run dev:server') + '.\n\n' +
        '**Quyết định thiết kế:**\n\n' +
        '| Lựa chọn | Lý do |\n|---|---|\n| JSON file store | Không cài DB, restart vẫn giữ dữ liệu, đọc code store.js là đủ |\n| Express serve ' + I('client/dist') + ' | 1 origin → không đau đầu CORS, deploy 1 process |\n| Validation tại API | Không tin client, chặn sớm ở biên |\n| ' + I('useCallback') + ' cho load | Tránh fetch lặp vòng trong useEffect |\n\n' +
        '> 💡 **Mẹo Zeko:** bước upgrade tiếp: thay ' + I('store.js') + ' bằng Prisma + PostgreSQL (chỉ đổi 1 file), thêm ' +
        I('helmet') + ' + rate-limit trước khi lên production.';
      return { thought, answer };
    },
  },
];
