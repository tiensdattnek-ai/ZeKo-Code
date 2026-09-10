import { F, I } from './markup.js';

const tsTypes = `// ---------- Types cho Todo app ----------
export interface Todo {
  id: number;
  text: string;
  done: boolean;
  createdAt: string; // ISO 8601
}

export type Filter = 'all' | 'active' | 'done';

// Discriminated union cho kết quả API — không thể "vừa thành vừa lỗi"
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// Payload gửi lên server — tách khỏi shape của DB
export interface CreateTodoInput {
  text: string;
}

// Config có tuỳ chọn nhiều — dùng Partial thay vì interface riêng
export interface TodoStorage {
  load(): Promise<Todo[]>;
  save(todos: Todo[]): Promise<void>;
}
`;

const tsApi = `import type { ApiResult, CreateTodoInput, Todo } from './types';

const API = '/api/todos';

// fetch wrapper có type — caller không cần try/catch mù
export async function api<T>(
  path: string,
  init?: RequestInit
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(API + path, init);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: (body && body.error) || 'HTTP ' + res.status };
    }
    return { ok: true, data: body as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

// Generics: 1 function cho mọi endpoint
export const listTodos = () => api<Todo[]>('/');
export const createTodo = (input: CreateTodoInput) =>
  api<Todo>('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
export const toggleTodo = (id: number, done: boolean) =>
  api<Todo>('/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ done }),
  });

// Caller: type-safe tận răng — IDE chỉ ra data/error
async function addTodo(text: string) {
  const res = await createTodo({ text });
  if (!res.ok) {
    alert(res.error); // res.error — IDE biết đây là string
    return;
  }
  console.log(res.data.id); // res.data: Todo
}
`;

export default [
  {
    id: 'typescript',
    title: 'TypeScript',
    keywords: [
      'typescript', 'ts', 'types', 'interface', 'type', 'strict', 'type script',
      'generic', 'discriminated union',
    ],
    boost: { typescript: 3, 'type': 1, interface: 1 },
    corpus:
      'typescript cho web: interface, discriminated union api result, generic fetch wrapper, strict mode, pattern type an toàn',
    render(ctx) {
      const thought =
        'Yêu cầu: "' + ctx.userText + '". → Intent: TypeScript. Trọng tâm: KHÔNG phải liệt kê types, ' +
        'mà là pattern bảo vệ logic: (1) ApiResult discriminated union — bắt xử lý lỗi bằng type system; ' +
        '(2) generic fetch wrapper — 1 chỗ xử lý HTTP, mọi endpoint nhận type; ' +
        '(3) tách Input/Entity — shape gửi lên ≠ shape từ DB. Bật strict ở tsconfig.';
      const answer =
        '# 🔷 TypeScript — pattern an toàn\n\n' +
        'Types không chỉ "ghi chú" — dùng đúng là chặn lỗi trước khi chạy:\n\n' +
        F('ts', 'src/types.ts', tsTypes) +
        F('ts', 'src/api.ts', tsApi) +
        'tsconfig tối thiểu nên bật:\n\n' +
        F('json', 'tsconfig.json', `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true
  }
}`) +
        'Vì sao 3 pattern trên "ăn tiền":\n\n' +
        '| Pattern | Lỗi bị chặn |\n|---|---|\n| ' + I('ApiResult<T>') + ' | Quên xử lý nhánh lỗi — compiler bắt |\n| ' + I('api<T>(...)') + ' | Gán nhầm shape, quên parse JSON |\n| Tách ' + I('CreateTodoInput') + ' | Gửi thẳng object DB lên API (rò rỉ trường nhảm) |\n\n' +
        '> 💡 **Mẹo Zeko:** ' + I('any') + ' là "chạy trốn khỏi TS" — khi buộc phải dùng (thư viện cũ), ' +
        'gắn comment ' + I('// TODO: tighten') + ' và gói gọn trong 1 function, đừng để lan.';
      return { thought, answer };
    },
  },
];
