# ⚡ Zeko Code — AI Coding Agent

Web chat AI chuyên code, chạy trên model **ZekoCode v1.2 "Aurora"** (on-device, không cần API key).
Giao diện dark kiểu GitHub Copilot, **SSE streaming** (suy nghĩ + nội dung chảy realtime),
mỗi khối code có **Copy / Download / Preview** (preview chạy JSX/HTML/CSS/JS ngay trong sandbox iframe).

## Chạy nhanh

```bash
npm install
npm run train     # huấn luyện ZekoCode v1.2 → data/zecocode-v1.2.json (checkpoint)
npm run build     # build client (Vite + React) → client/dist
npm start         # server Express :3001 (API + web)
# mở http://localhost:3001
```

Dev mode (hot reload): `npm run dev` → web :5173 (proxy /api → :3001), API :3001.

## Model & versioning

- `shared/version.json` — nguồn sự thật của version (hiện: **1.2 / Aurora**)
- `npm run bump` — nâng version (1.2 → 1.3)
- `npm run train` — vector hoá 16 knowledge shards, tự đánh giá self-recall,
  xuất checkpoint `data/zecocode-v<X>.json` + `data/latest.json`
- Engine runtime đọc checkpoint để **classify intent** (cosine similarity + keyword boosting),
  rồi render response từ knowledge shard khớp nhất
- `GET /api/models` trả về model đang online + pipeline (bản kế đang "training")

> ZekoCode là engine suy luận on-device (classifier + knowledge generation), chạy offline 100%.
> Tầng model được thiết kế thay thế được: muốn nối LLM thật (OpenAI/Anthropic/Ollama) chỉ cần
> thay phần `generate()` trong `server/engine/zeco-model.js` — protocol SSE không đổi.

## API

| Endpoint | Mô tả |
|---|---|
| `POST /api/chat` | `{ conversation_id, messages, options:{temperature} }` → **SSE**: `meta`, `thought`, `thought_done`, `delta`, `done`, `error` |
| `GET /api/models` | Model online + pipeline versioning |
| `GET /api/health` | health + version + uptime |

## Kiến trúc

```
ZeKo-Code/
├── shared/version.json          # model version (bump tại đây)
├── data/                        # checkpoints (sinh bởi train)
├── scripts/
│   ├── train-zeko.js            # ⚡ trainer → checkpoint JSON
│   └── bump-version.js          # ⬆️ v1.2 → v1.3
├── server/
│   ├── index.js                 # Express entry (API + static)
│   ├── sse.js                   # SSE protocol helpers
│   ├── routes/
│   │   ├── chat.js              # POST /api/chat (SSE streaming)
│   │   ├── models.js            # GET /api/models
│   │   └── health.js            # GET /api/health
│   ├── engine/
│   │   ├── zeco-model.js        # orchestrator: greeting → extend → classify → render
│   │   ├── checkpoint.js        # đọc data/latest.json (fallback in-memory)
│   │   ├── vectors.js           # bag-of-words + cosine (train & runtime chung)
│   │   ├── memory.js            # conversation memory (context window)
│   │   ├── stream.js            # token streamer (sim nhả token)
│   │   └── knowledge/           # 16 knowledge shards (tri thức model)
│   │       ├── react.js  node.js  fullstack.js  auth.js
│   │       ├── uicss.js  algorithms.js  debug.js  refactor.js
│   │       ├── deploy.js  database.js  typescript.js  form.js
│   │       ├── state.js  general.js  extensions.js (dark mode, test, i18n, …)
│   │       └── markup.js
│   └── utils/text.js            # tokenize, extractName…
└── client/                      # Vite + React 18
    └── src/
        ├── App.jsx
        ├── constants/           # suggestions, model fallback
        ├── lib/
        │   ├── api.js           # SSE stream reader (fetch + ReadableStream)
        │   ├── markdown.js      # marked + highlight.js + code block UI
        │   ├── preview.js       # sandbox srcDoc (React UMD + Babel)
        │   └── storage.js       # conversations → localStorage
        ├── hooks/useChat.js     # state machine chat + streaming
        ├── components/          # Sidebar, Header, Chat, Message, Composer, Welcome, PreviewModal, Icons
        └── styles/index.css     # design system (GitHub-dark × Zeko gradient)
```

## Tính năng

- 💭 **Thought streaming** — xem model "suy nghĩ gì" trước khi viết code
- ⚡ **SSE realtime** — token chảy liên tục, nút **Dừng** ngắt stream
- 📋 **Copy / ⬇️ Download / 👁 Preview** cho mọi khối code
- 👁 **Preview thật** — JSX chạy bằng React UMD + Babel, HTML/CSS render thẳng, JS bắt console
- 🧠 **Follow-up context** — sau khi sinh code, hỏi "thêm dark mode / test / i18n…" nhận patch cộng gộp
- 🗂 Conversations persist localStorage, model picker + temperature
- 🏷 Intent classifier hiển thị confidence (vd: `React Component · 92%`)
- ⌨ `Ctrl/⌘+K` new chat, `Enter` gửi, `Shift+Enter` xuống dòng
