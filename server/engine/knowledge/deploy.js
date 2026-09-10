import { F, I } from './markup.js';

const dockerfileCode = `FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist
EXPOSE 4000
USER node
CMD ["node", "server/index.js"]
`;

const composeCode = `version: '3.9'

services:
  app:
    build: .
    ports:
      - "4000:4000"
    environment:
      - NODE_ENV=production
      - JWT_SECRET=\${JWT_SECRET:?set JWT_SECRET in .env}
    volumes:
      - app-data:/app/data          # persist JSON file store
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:4000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  nginx:
    image: nginx:1.27-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      app:
        condition: service_healthy
    restart: unless-stopped

volumes:
  app-data:
`;

const nginxCode = `worker_processes auto;

events {
  worker_connections 1024;
}

http {
  upstream zeko {
    server app:4000;
    keepalive 32;
  }

  # Gzip cho SSE KHÔNG bật — sẽ đệm response!
  gzip off;

  server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;
  }

  server {
    listen 443 ssl;
    server_name example.com;

    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    # Important cho SSE: tắt buffering, giữ kết nối lâu
    location /api/chat {
      proxy_pass http://zeko;
      proxy_http_version 1.1;
      proxy_set_header Connection '';
      proxy_buffering off;
      proxy_cache off;
      proxy_read_timeout 1h;
    }

    location / {
      proxy_pass http://zeko;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-Proto $scheme;
    }
  }
}
`;

const pm2Code = `// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'zeko-code',
      script: 'server/index.js',
      instances: 'max',        // fork từng core (Node ESM OK)
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      max_memory_restart: '300M',
      out_file: 'logs/out.log',
      error_file: 'logs/err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
`;

const vercelCode = `{
  "buildCommand": "npm run build",
  "outputDirectory": "client/dist",
  "rewrites": [{ "source": "/api/(.*)", "destination": "/api" }],
  "functions": { "api/index.js": { "maxDuration": 30 } }
}
`;

export default [
  {
    id: 'deploy',
    title: 'Deploy & Production',
    keywords: [
      'deploy', 'docker', 'compose', 'vercel', 'render', 'pm2', 'hosting',
      'production', 'môi trường', 'up app', 'đưa lên server', 'vps', 'nginx',
    ],
    boost: { docker: 2, deploy: 2, vercel: 2, 'docker compose': 3, nginx: 1 },
    corpus:
      'deploy production: dockerfile multi-stage node alpine, docker compose với nginx reverse proxy và healthcheck, pm2 cluster, vercel config, lưu ý buffering cho SSE qua proxy',
    render(ctx) {
      const thought =
        'Yêu cầu: "' + ctx.userText + '". → Intent: deploy. Ba con đường phổ biến, chọn theo hoàn cảnh: ' +
        '(1) VPS + Docker Compose — full control, chi phí thấp; (2) PaaS (Render/Vercel) — nhanh, ít config; ' +
        '(3) PM2 — khi không dùng container. Điểm chết người hay gặp: proxy buffer khiến SSE bị tắc — ' +
        'kèm sẵn config nginx tắt proxy_buffering cho /api/chat. Dockerfile dùng multi-stage để image gọn.';
      const answer =
        '# 📦 Deploy production\n\n' +
        'Ba con đường, chọn theo hoàn cảnh:\n\n' +
        '| Cách | Dùng khi | Chi phí |\n|---|---|---|\n| Docker Compose + nginx | Muốn full control, 1 VPS | ~$5–12/tháng |\n| Render / Railway / Vercel | Muốn nhanh, tự scale | free tier → trả phí |\n| PM2 (trực tiếp) | Server cũ, không container | $0 thêm |\n\n' +
        '## 1. Docker (multi-stage, image gọn)\n\n' +
        F('dockerfile', 'Dockerfile', dockerfileCode) +
        F('yaml', 'docker-compose.yml', composeCode) +
        'Config nginx — **phần quan trọng nhất cho SSE**:\n\n' +
        F('nginx', 'nginx.conf', nginxCode) +
        'Chạy:\n\n' +
        F('bash', 'terminal', 'cp .env.example .env   # điền JWT_SECRET\ndocker compose up -d --build\ndocker compose logs -f app') +
        '## 2. PM2 (không container)\n\n' +
        F('js', 'ecosystem.config.cjs', pm2Code) +
        F('bash', 'terminal', 'npm i -g pm2\npm2 start ecosystem.config.cjs\npm2 save && pm2 startup') +
        '## 3. Vercel\n\n' +
        'App full stack có state file nên Vercel chỉ hợp cho frontend; backend tách sang Render/Railway ' +
        'hoặc chuyển store sang database có server. Config tham khảo:\n\n' +
        F('json', 'vercel.json', vercelCode) +
        '**Checklist lên production:**\n\n' +
        '- [ ] ' + I('NODE_ENV=production') + ', secret trong env — không nằm trong code\n' +
        "- [ ] HTTPS bắt buộc (Let's Encrypt tự động nếu nginx)\n" +
        '- [ ] Health check endpoint + alert khi down\n' +
        '- [ ] Log có timestamp, giới hạn size log\n' +
        '- [ ] Backup ' + I('data/') + ' (nếu dùng JSON file) — cron nightly\n\n' +
        '> 💡 **Mẹo Zeko:** SSE chết thầm qua proxy là lỗi deploy số 1. Test ngay sau deploy: ' +
        I('curl -N http://localhost/api/chat') + ' — token phải chảy liên tục, không phải 1 cục.';
      return { thought, answer };
    },
  },
];
