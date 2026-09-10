export const SUGGESTIONS = [
  {
    icon: '⚛️',
    title: 'React component',
    desc: 'Todo App với hooks + validation + filter',
    prompt:
      'Hãy tạo một React component Todo App với useState, thêm/sửa/xoá item, filter all/active/done và validation input',
  },
  {
    icon: '🚀',
    title: 'API Node.js',
    desc: 'Express CRUD cho blog API',
    prompt:
      'Viết server Express CRUD cho blog API với /api/posts, validate input và error handler trung tâm',
  },
  {
    icon: '🏗️',
    title: 'Full stack app',
    desc: 'React + Express + JSON file, có file tree',
    prompt:
      'Xây full stack app quản lý nhiệm vụ: React frontend + Express backend + lưu JSON file, cho tôi file tree',
  },
  {
    icon: '🐛',
    title: 'Debug',
    desc: 'Cannot read properties of undefined',
    prompt:
      'Lỗi "Cannot read properties of undefined (reading map)" trong React — cách debug và fix?',
  },
  {
    icon: '🎨',
    title: 'UI glassmorphism',
    desc: 'Landing page HTML/CSS thuần, xem preview',
    prompt:
      'Làm landing page glassmorphism bằng HTML/CSS thuần, có button gradient và 3 card, cho xem preview',
  },
  {
    icon: '🧠',
    title: 'Thuật toán',
    desc: 'debounce vs throttle vs memoization',
    prompt:
      'Giải thích debounce vs throttle vs memoization với code JS và bảng độ phức tạp',
  },
  {
    icon: '🔐',
    title: 'Auth JWT',
    desc: 'Express + JWT + bcrypt + React context',
    prompt:
      'Xây auth register/login bằng Express + JWT + bcrypt, kèm React context phía client',
  },
  {
    icon: '📦',
    title: 'Deploy',
    desc: 'Docker Compose + nginx, VPS',
    prompt: 'Deploy full stack app với Docker Compose (app + nginx) và hướng dẫn lên VPS',
  },
];

export const FALLBACK_MODEL = {
  name: 'ZekoCode v1.2',
  version: '1.2',
  codename: 'Aurora',
  params: '4.1B',
  runtime: 'on-device',
};

export const PREVIEWABLE = ['html', 'jsx', 'tsx', 'javascript', 'typescript', 'css'];
