import { F, I } from './markup.js';

const sqlCode = `-- =====================================================================
-- Schema: blog (PostgreSQL)
-- =====================================================================

CREATE TABLE users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         CITEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member'
                CHECK (role IN ('member', 'editor', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE posts (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  author_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  slug        TEXT UNIQUE NOT NULL,
  body_md     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tags (
  id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE post_tags (
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id  BIGINT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- Index: truy vấn nóng
CREATE INDEX idx_posts_author       ON posts(author_id);
CREATE INDEX idx_posts_status_pub   ON posts(status) WHERE status = 'published';
CREATE INDEX idx_posts_created      ON posts(created_at DESC);
CREATE INDEX idx_post_tags_tag      ON post_tags(tag_id);

-- Trigger: tự cập nhật updated_at
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_posts_touch
BEFORE UPDATE ON posts
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
`;

const queryCode = `-- Lấy 20 bài đã publish mới nhất, kèm author + tags
SELECT p.id, p.title, p.slug, p.published_at,
       u.display_name AS author,
       COALESCE(
         json_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL),
         '[]'
       ) AS tags
FROM posts p
JOIN users u ON u.id = p.author_id
LEFT JOIN post_tags pt ON pt.post_id = p.id
LEFT JOIN tags t ON t.id = pt.tag_id
WHERE p.status = 'published'
  AND p.published_at IS NOT NULL
ORDER BY p.published_at DESC
LIMIT 20;

-- Pagination kiểu keyset (ổn định, nhanh trên dữ liệu lớn)
-- Gọi lần sau: ?before=<published_at của item cuối lần trước>
SELECT id, title, published_at
FROM posts
WHERE status = 'published'
  AND (published_at, id) < ($1::timestamptz, $2::bigint)
ORDER BY published_at DESC, id DESC
LIMIT 20;
`;

const prismaCode = `// schema.prisma — prisma init rồi dán
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id          BigInt  @id @default(autoincrement())
  email       String  @unique
  displayName String  @map("display_name")
  passwordHash String @map("password_hash")
  role        String  @default("member")
  posts       Post[]
  createdAt   DateTime @default(now()) @map("created_at")

  @@map("users")
}

model Post {
  id           BigInt   @id @default(autoincrement())
  author       User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
  authorId     BigInt   @map("author_id")
  title        String
  slug         String   @unique
  bodyMd       String   @map("body_md")
  status       String   @default("draft")
  publishedAt  DateTime? @map("published_at")
  tags         PostTag[]
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@index([authorId])
  @@map("posts")
}
`;

export default [
  {
    id: 'database',
    title: 'Database / SQL',
    keywords: [
      'sql', 'database', 'db', 'postgres', 'postgresql', 'mysql', 'schema',
      'prisma', 'mongodb', 'orm', 'bảng', 'tạo bảng', 'index', 'database schema',
    ],
    boost: { postgres: 2, prisma: 2, schema: 2, 'tạo bảng': 2 },
    corpus:
      'thiết kế database postgresql: schema users posts tags, constraint, partial index, trigger updated_at, keyset pagination, prisma schema',
    render(ctx) {
      const thought =
        'Yêu cầu: "' + ctx.userText + '". → Intent: thiết kế database. Chọn PostgreSQL — constraint mạnh, index linh hoạt. ' +
        'Thiết kế theo mô hình blog phổ biến: users 1-N posts, posts M-N tags qua bảng join. ' +
        'Điểm kỹ thuật hay bị thiếu: CHECK constraint, partial index cho published, trigger updated_at, ' +
        'và keyset pagination (offset pagination chết dần ở trang sâu). Kèm Prisma mirror cho phía app.';
      const answer =
        '# 🗄️ Schema PostgreSQL chuẩn\n\n' +
        'Mô hình blog: users → posts → tags (many-to-many), đủ constraint để DB tự "phòng thủ":\n\n' +
        F('sql', 'schema.sql', sqlCode) +
        '**Query thực chiến:**\n\n' +
        F('sql', 'queries.sql', queryCode) +
        'Nếu app dùng Prisma, đây là mirror schema:\n\n' +
        F('prisma', 'prisma/schema.prisma', prismaCode) +
        F('bash', 'terminal', 'npx prisma init\nnpx prisma migrate dev --name init\nnpx prisma studio   # xem dữ liệu bằng UI') +
        'Quy tắc đặt tên & thiết kế:\n\n' +
        '- Bảng số nhiều, snake_case; PK: ' + I('BIGINT identity') + ' (không UUID trừ khi cần phân tán)\n' +
        '- Mọi FK: ' + I('ON DELETE') + ' rõ ràng (CASCADE cho phụ thuộc mạnh, SET NULL cho tuỳ chọn)\n' +
        '- Text tìm kiếm: cân nhắc ' + I('pg_trgm') + ' index thay vì LIKE kiểu "chained match" mù\n' +
        '- ' + I('updated_at') + ' bằng trigger — không code trong app (tránh quên)\n\n' +
        '> 💡 **Mẹo Zeko:** trước khi tạo index, chạy query bằng ' + I('EXPLAIN ANALYZE') +
        ' — chỉ index những gì query thực sự chậm. Index thừa làm chậm ghi.';
      return { thought, answer };
    },
  },
];
