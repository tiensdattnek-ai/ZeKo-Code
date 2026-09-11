# ⚡ ZeKo Code — AI Coding Agent (GLM 5.3 Fusion)

Web chat AI chuyên code, hợp nhất **GLM 5.3** (OpenRouter) và **GLM 5.3 Flash** (TokenRouter)
thành **một bộ não duy nhất**: hai model suy nghĩ song song, một lượt tổng hợp giữ lại phần
đúng của cả hai rồi trả về **một đáp án hoàn chỉnh**.

4 API key (2 mỗi nền tảng) được **roll vòng tự động**, kèm live preview, diff, telemetry và
tải code — tất cả trong một app Node không cần build step.

```
┌──────────────┬───────────────────────────────┬────────────────────────────┐
│  Sidebar     │        Chat stream            │        WORKBENCH           │
│  • lịch sử   │  ┌ GLM 5.3 ┐ ┌ 5.3 Flash ┐    │  Preview │ Code │ Diff │Tel│
│  • file      │  │ streaming│ │ streaming │   │  ┌──────────────────────┐  │
│  • 4 API key │  └─────────┘ └───────────┘    │  │ iframe sandbox       │  │
│    + ping    │        ↓ hợp nhất             │  │ + console log thật   │  │
│              │  ▌đáp án cuối (markdown +     │  └──────────────────────┘  │
│              │    code card: copy/save/…)    │  file tree · editor · LCS  │
└──────────────┴───────────────────────────────┴────────────────────────────┘
```

---

## 1. Chạy

```bash
npm install
cp config.local.example.json config.local.json   # dán 4 API key vào đây (file này không vào git)
npm start          # http://localhost:8787
npm test           # 52 test: unit + server e2e + UI e2e (jsdom)
```

Không có bước build: frontend là ES module thuần, thư viện được serve thẳng từ
`node_modules` qua symlink trong `public/vendor`.

## 2. Bốn chế độ suy luận

| Chế độ | Luồng | Dùng khi |
|---|---|---|
| **Fusion** (mặc định) | GLM 5.3 ∥ Flash → 1 lượt synthesis | việc quan trọng, muốn đáp án tốt nhất |
| **Relay** | Flash phác thảo → GLM 5.3 phản biện, viết lại | cần nhanh ở đầu, chặt ở cuối |
| **Deep** | chỉ GLM 5.3 (OpenRouter) | kiến trúc, debug khó |
| **Turbo** | chỉ GLM 5.3 Flash (TokenRouter) | snippet, hỏi đáp ngắn |

Fusion stream **cả hai bản nháp song song** ra UI (2 lane), rồi model deep tổng hợp.
Bạn luôn bấm "Xem bản nháp" để so sánh. Nếu một model chết → tự degrade xuống model
còn sống và báo rõ; nếu cả hai chết → thông báo lỗi có thể hành động.

## 3. Roll key & chịu lỗi

Mỗi nền tảng có 2 key. Với **mỗi request**:

- Round-robin qua các key còn sống → key nào cũng được dùng đều.
- `429` → key nghỉ 45 s (theo `retry-after` nếu có), request nhảy ngay sang key kế.
- `401/403/422` → key bị **loại vĩnh viễn** (key sai thì thử lại chỉ tốn thời gian).
- `5xx` / lỗi mạng → nghỉ 12 s rồi thử key khác.
- Model bị `404`/“model not found” → tự rơi xuống model ID kế tiếp trong danh sách.
- Cả nền tảng chết → chế độ Deep/Turbo **tự đổi nền tảng**; Fusion degrade còn 1 não.

Toàn bộ trạng thái (số lượt gọi, cooldown còn lại, lỗi cuối) hiện ở **tab Trạng thái**
và trên status bar, tự làm mới mỗi 5 giây.

## 4. Hai đường truyền (tự chọn)

| | Đường đi | Khi nào |
|---|---|---|
| **server** (ưu tiên) | trình duyệt → Express → OpenRouter/TokenRouter | host có Internet ra ngoài; key không lộ ra page |
| **browser direct** | trình duyệt → thẳng OpenRouter/TokenRouter | host bị chặn egress (sandbox/preview) |

Cùng **một file engine** (`src/shared/fusion.mjs`) chạy ở cả hai nơi, nên hành vi giống
nhau tuyệt đối. Lúc khởi động app tự ping cả 2 nền tảng qua server; nếu server không ra
được Internet thì chuyển sang direct và báo trên status bar. Ép bằng tay trong **Cấu hình → Đường truyền**.

## 5. Giao thức artifact (agent được dạy qua system prompt)

```
```tsx src/components/Counter.tsx      ← có đường dẫn = file thật trong workspace
```html index.html:preview             ← thêm :preview = tự mở tab Preview
```diff src/app.js                     ← patch có chủ đích (+/-), UI tự áp dụng
```js                                  ← không đường dẫn = snippet minh hoạ
```

UI tự động: lưu file vào workspace → hiện **code card** (Copy · Lưu · Mở · Xuống dòng · Tải)
→ nạp vào **Preview** (gộp CSS/JS, hỗ trợ JSX qua React UMD + Babel, có shim `localStorage`,
bắt console & lỗi runtime) → ghi **diff** (LCS) và cho hoàn tác từng file → ghi **telemetry**
(model nào, key nào, bao nhiêu token, bao lâu).

## 6. Cấu hình

Mở **Cấu hình** (nút ⚙ hoặc `Ctrl ,`):

- Base URL + danh sách model ID + danh sách API key của từng nền tảng (thêm/xoá tuỳ ý).
- Nhiệt độ, max tokens, số file workspace gửi làm ngữ cảnh.
- Auto-review (Flash soát lại code vừa viết), auto-apply file, system prompt bổ sung.
- Xuất/nhập backup `.json`, xuất cuộc chat `.md`, xoá dữ liệu.

Đọc từ env (xem `.env.example`) hoặc `config.local.json` (xem mục 7):
`OPENROUTER_API_KEYS`, `TOKENROUTER_API_KEYS`, `OPENROUTER_MODELS`, `TOKENROUTER_MODELS`,
`OPENROUTER_BASE_URL`, `TOKENROUTER_BASE_URL`, `PORT`.

## 7. API key — để ở đâu

**Không có secret nào được commit.** Thứ tự ưu tiên:

1. Biến môi trường (`OPENROUTER_API_KEYS`, `TOKENROUTER_API_KEYS` — nhiều key cách nhau bởi dấu phẩy).
2. `config.local.json` ở thư mục gốc (**đã nằm trong `.gitignore`**):

```bash
cp config.local.example.json config.local.json   # rồi dán key thật vào
npm start
```

3. Dán trực tiếp trong **Cấu hình → API keys** — key được mirror vào `localStorage`
   của trình duyệt (`zeko.keys.v1`) và đẩy lên server mỗi lần khởi động, nên restart
   server vẫn không mất.

Lưu ý còn lại: `GET /api/keys` trả key đầy đủ cho page để chế độ *browser direct*
hoạt động → **chỉ chạy ở máy local**. Trước khi deploy: xoay key, dùng env, và ép
đường truyền `server` để key không bao giờ rời backend.

## 8. Phím tắt

`Enter` gửi · `Shift Enter` xuống dòng · `Ctrl K` command palette · `Ctrl N` chat mới ·
`Ctrl B` sidebar · `Ctrl J` workbench · `Ctrl ,` cấu hình · `Ctrl S` lưu file đang mở ·
`Esc` dừng / đóng modal · `/help` xem lệnh trong ô nhập.

## 9. Cấu trúc repo

```
server/index.js          Express: static + /api/chat (SSE) + probe + config + sessions
src/shared/
  fusion.mjs             Engine: keyring, failover, SSE, 4 chế độ  (Node & browser)
  artifacts.mjs          parse fence/file/diff, applyDiff, buildPreview, digest
  prompt.mjs             system prompt agent + prompt tổng hợp + reviewer
  config.mjs             provider, key, model, mặc định
public/
  index.html             khung 3 pane + icon sprite
  styles/app.css         design system (dark/light)
  js/app.js              boot, luồng chat, streaming, slash command
  js/render.mjs          markdown → code card (marked + DOMPurify)
  js/highlight.mjs       syntax highlighter tự viết (~20 ngôn ngữ)
  js/workbench.mjs       file tree, editor, preview, diff LCS, telemetry
  js/transport.mjs       server ↔ browser-direct
  js/store.mjs           state + localStorage + export/import
  js/ui.mjs              toast, modal, palette, settings, status bar
test/
  fusion.test.mjs        26 unit test (mock fetch): rotation, failover, fusion, diff…
  config.test.mjs        6 test: thứ tự ưu tiên env > config.local.json, che key
  server.e2e.test.mjs    7 test HTTP thật: SSE relay, CRUD, chặn traversal
  ui.e2e.test.mjs        13 test jsdom: chạy thẳng public/js/app.js
```

## 10. Test

```bash
npm test     # 52 test
```

Ba tầng, không mock lại logic đã ship:

1. **Unit** — engine với `fetch` giả: roll key, 429/401/404, lỗi mạng, 4 chế độ, abort,
   probe; parser artifact/diff/preview.
2. **Server e2e** — spawn `node server/index.js`, trỏ 2 nền tảng vào một upstream giả nói
   đúng giao thức OpenAI-SSE, rồi đọc lại SSE từ `/api/chat`.
3. **UI e2e** — jsdom nạp `public/index.html`, stub global của trình duyệt, mock 2 upstream,
   rồi `import` chính `public/js/app.js`: gửi tin nhắn → 2 lane → hợp nhất → code card →
   file vào workspace → preview srcdoc → copy/download → editor → diff → palette.

## 11. Giấy phép & ghi công

Model: GLM 5.3 (Z.ai) qua OpenRouter & TokenRouter. Giao diện và engine: code gốc trong repo này.
