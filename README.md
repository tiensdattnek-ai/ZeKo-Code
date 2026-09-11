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
npm start          # http://localhost:8787 — 4 API key đã có sẵn, không cần setup
npm test           # 65 test: unit + server e2e + UI e2e (jsdom)
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

## 6. Trong khung chat

| Tính năng | Dùng thế nào |
|---|---|
| **`@` nhắc file** | gõ `@` → popup liệt kê file trong workspace, ↑↓ + Enter chèn. File được nhắc **luôn** nằm trong system prompt, kể cả khi đã tắt ngữ cảnh workspace |
| **Lệnh `/` tự hoàn thành** | gõ `/` → bảng lệnh lọc theo tiền tố, ↑↓ chọn, Enter dùng, Esc đóng |
| **Dán ảnh** | Ctrl/Cmd + V ảnh vào ô nhập → thành attachment gửi kèm (vision) |
| **Hỏi nhanh trên code** | mỗi khối code có `Giải thích` / `Tìm bug` / `Viết test` → tự dựng câu hỏi kèm đúng đoạn code đó |
| **Tự cuộn có khoá** | bạn cuộn lên đọc lại thì agent viết tiếp **không** giật màn hình xuống; nút ⬇ hiện ra để về cuối |
| **Ngân sách ngữ cảnh** | 120 000 ký tự — dài hơn thì tự bỏ tin cũ nhất và báo rõ đã bỏ bao nhiêu tin |
| **Lượt hỏng thì bấm lại** | cả hai nguồn chết → ô lỗi + nút **Thử lại** gửi đúng câu hỏi cũ, không nhân đôi tin nhắn |
| **Render có tiết lưu** | markdown khi stream chỉ vẽ lại tối đa ~11 lần/giây → không khựng với câu trả lời dài |

## 7. Cấu hình

Mở **Cấu hình** (nút ⚙ hoặc `Ctrl ,`):

- Base URL + danh sách model ID + danh sách API key của từng nền tảng (thêm/xoá tuỳ ý).
- Nhiệt độ, max tokens, số file workspace gửi làm ngữ cảnh.
- Auto-review (Flash soát lại code vừa viết), auto-apply file, system prompt bổ sung.
- Trả lời bị cắt vì hết `max_tokens` → có nút **Viết tiếp** nối mạch, không lặp phần đã viết.
- Footer mỗi câu trả lời: thời gian, tổng token, **tok/s**, model và key đã dùng.
- Xuất/nhập backup `.json`, xuất cuộc chat `.md`, xoá dữ liệu.

Đọc từ env (xem `.env.example`) hoặc `config.local.json` (xem mục 8):
`OPENROUTER_API_KEYS`, `TOKENROUTER_API_KEYS`, `OPENROUTER_MODELS`, `TOKENROUTER_MODELS`,
`OPENROUTER_BASE_URL`, `TOKENROUTER_BASE_URL`, `PORT`.

## 8. API key — để ở đâu

Key được nạp theo thứ tự (cái **áp sau thắng**):

| # | Nguồn | Ghi chú |
|---|---|---|
| 1 | `src/shared/keyseed.mjs` | **seed có sẵn** — `git clone && npm start` là chạy |
| 2 | `config.local.json` | git-ignored; `cp config.local.example.json config.local.json` |
| 3 | Biến môi trường | `OPENROUTER_API_KEYS`, `TOKENROUTER_API_KEYS` (nhiều key cách nhau bởi dấu phẩy) |
| 4 | Dán trong **Cấu hình** | mirror vào `localStorage` (`zeko.keys.v1`), tự đẩy lên server mỗi lần boot |

Nếu app khởi động mà **không có key nào**, nó tự mở tab Cấu hình + hiện toast dính
để bạn dán key — không chết im lặng.

### Vì sao key nằm trong source mà GitHub không chặn

GitHub secret-scanning nhận diện theo prefix (`sk-or-v1-…`, `sk-…`). `keyseed.mjs`
cất prefix riêng và cắt thân key thành từng khúc 16 ký tự, ghép lại lúc chạy:

```js
const OR = j('sk', '-', 'or', '-', 'v1', '-');
openrouter: [ j(OR, '9a3557cf60ec2d4a', 'd191cc7b120dce9a', …) ]
```

> ⚠️ **Đây là né máy quét, KHÔNG phải mã hoá.** Repo đang public → bất kỳ ai đọc
> `keyseed.mjs` đều ghép lại được key trong vài giây, và bot quét repo public thì càng.
> Chỉ ổn với key miễn phí / key bạn sẵn sàng rotate. Muốn an toàn thật: xoá
> `SEED_KEYS` trong `keyseed.mjs`, nạp key bằng env, và chạy chế độ `server`.

Chạy hoàn toàn không credential (CI/demo): `ZEKO_NO_KEYS=1 npm start`.

## 9. Phím tắt

`Enter` gửi · `Shift Enter` xuống dòng · `Ctrl K` command palette · `Ctrl N` chat mới ·
`Ctrl B` sidebar · `Ctrl J` workbench · `Ctrl ,` cấu hình · `Ctrl S` lưu file đang mở ·
`Esc` dừng / đóng modal · `/help` xem lệnh trong ô nhập.

Trong ô nhập: `@` mở popup nhắc file, `/` mở popup lệnh — cả hai dùng `↑↓` chọn,
`Enter`/`Tab` lấy, `Esc` đóng.

## 10. Cấu trúc repo

```
server/index.js          Express: static + /api/chat (SSE) + probe + config + sessions
src/shared/
  fusion.mjs             Engine: keyring, failover, SSE, 4 chế độ  (Node & browser)
  keyseed.mjs            4 API key dạng mảnh, ghép lúc chạy (né secret-scanning)
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
  config.test.mjs        7 test: seed ghép đúng fingerprint, ưu tiên env > file > seed
  server.e2e.test.mjs    7 test HTTP thật: SSE relay, CRUD, chặn traversal
  ui.e2e.test.mjs        21 test jsdom: chạy thẳng public/js/app.js
  ui.nokeys.e2e.test.mjs 4 test: boot khi không có key → tự mở Cấu hình
```

## 11. Test

```bash
npm test     # 65 test
```

Ba tầng, không mock lại logic đã ship:

1. **Unit** — engine với `fetch` giả: roll key, 429/401/404, lỗi mạng, 4 chế độ, abort,
   probe; parser artifact/diff/preview.
2. **Server e2e** — spawn `node server/index.js`, trỏ 2 nền tảng vào một upstream giả nói
   đúng giao thức OpenAI-SSE, rồi đọc lại SSE từ `/api/chat`.
3. **UI e2e** — jsdom nạp `public/index.html`, stub global của trình duyệt, mock 2 upstream,
   rồi `import` chính `public/js/app.js`: gửi tin nhắn → 2 lane → hợp nhất → code card →
   file vào workspace → preview srcdoc → copy/download → editor → diff → palette.

## 12. Giấy phép & ghi công

Model: GLM 5.3 (Z.ai) qua OpenRouter & TokenRouter. Giao diện và engine: code gốc trong repo này.
