import { F, I } from './markup.js';

const adviceAnswer = `# 🧭 Tư vấn kiến trúc

Để chốt phương án đúng, mình cân nhắc 3 trục: **tốc độ phát triển → độ phức tạp → khả năng scale**. Không nên trả giá trục 3 khi chưa tới trục 2.

## Bộ "đáp án mặc định" theo hoàn cảnh

| Hoàn cảnh | Stack khuyến nghị | Vì sao |
|---|---|---|
| MVP / side project | Next.js + Supabase (hoặc Vite React + Express + JSON file) | Đủ auth/DB/realtime, 0 hạ tầng tự vận hành |
| API thuần, kiểm soát sâu | Express hoặc Fastify + Prisma + PostgreSQL | Sinh thái rộng, Fastify nhanh hơn ~2x |
| Realtime (chat, collab) | Socket.io hoặc SSE + Postgres LISTEN/NOTIFY | SSE đơn giản, 1 chiều, debug dễ — chat đơn giản dùng SSE là đủ |
| Tính toán nặng | Web Worker / queue (BullMQ) | Không block main thread / event loop |
| Nhiều frontend share logic | Monorepo (Turborepo) + package shared types | Types/api client chỉ 1 nguồn sự thật |

## 3 quyết định quan trọng nhất (làm sai là đau)

1. **Chỗ dữ liệu sống ở đâu** — DB server hay file/embedded? Quyết định này khó đổi sau khi có user thật.
2. **Ai sở hữu auth** — tự viết (JWT + bcrypt) hay dịch vụ (Auth0/Clerk)? Tự viết OK cho MVP, mua khi user thật.
3. **Biên API** — REST hay tRPC? REST: công khai, cache dễ. tRPC: end-to-end type, nhưng khoá chặt stack.

## Mình cần thêm 3 thông tin để chốt phương án

1. Tech stack hiện tại (nếu có)
2. Traffic dự kiến (10/ngày hay 100k/ngày?)
3. Deadline và cỡ đội nhóm

Trả lời 3 câu trên, mình sẽ vẽ sơ đồ kiến trúc + danh sách API cụ thể cho bạn.
`;

export default [
  {
    id: 'general',
    title: 'Tư vấn & Giải thích',
    keywords: [
      'tư vấn', 'advise', 'architecture', 'kiến trúc', 'giải thích', 'explain',
      'là gì', 'so sánh', 'best practice', 'nên dùng', 'phải làm sao', 'gợi ý',
      'hướng dẫn', 'hỗ trợ', 'help', 'hỏi',
    ],
    boost: { 'là gì': 1, 'nên dùng': 2, 'so sánh': 2 },
    corpus:
      'tư vấn kiến trúc web, so sánh stack, giải thích khái niệm, best practice, hỏi chung về phát triển web full stack',
    render(ctx) {
      const thought =
        'Yêu cầu: "' + ctx.userText + '". → Intent: tư vấn/giải thích (không phải code trực tiếp). ' +
        'Cấu trúc trả lời: khung suy nghĩ (3 trục) → bộ đáp án mặc định theo hoàn cảnh (bảng) → ' +
        '3 quyết định khó đảo chiều → hỏi ngược 3 thông tin còn thiếu để chốt phương án. ' +
        'Tránh trả lời chung chung: mọi khuyến nghị đều kèm "vì sao".';
      const answer = adviceAnswer;
      return { thought, answer };
    },
  },
  {
    id: 'greet',
    title: 'Greeting',
    keywords: ['chào', 'hello', 'hi', 'hey', 'xin chào', 'cảm ơn', 'thanks'],
    boost: {},
    corpus: 'chào hỏi, giới thiệu bản thân zekocode, cảm ơn',
    render(ctx) {
      const answer =
        'Chào bạn! Mình là **Zeko** — chạy trên **ZekoCode v' + ctx.version + ' (Aurora)** ⚡\n\n' +
        'Mình chuyên về **code & web**: React, Node.js, full stack, CSS, thuật toán, debug, deploy… ' +
        'Mọi code mình viết đều có nút **Copy / Download / Preview** để bạn kiểm tra ngay.\n\n' +
        'Gợi ý vài việc mình làm tốt nhất:\n\n' +
        '- "Tạo React component Todo App với validation"\n' +
        '- "Viết server Express CRUD cho blog API"\n' +
        '- "Full stack: React + Express + JSON file, có file tree"\n' +
        '- "Debug: Cannot read properties of undefined (reading map)"\n' +
        '- "Làm landing page glassmorphism, cho xem preview"\n\n' +
        'Gõ yêu cầu phía dưới là mình bắt tay vào việc 👇';
      const thought =
        'Yêu cầu: "' + ctx.userText + '". → Intent: chào hỏi. Giới thiệu ngắn gọn + năng lực + ví dụ prompt cụ thể ' +
        'để người dùng biết bắt đầu từ đâu. Giữ gọn, không dài dòng.';
      return { thought, answer };
    },
  },
];
