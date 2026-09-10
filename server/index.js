#!/usr/bin/env node
/**
 * ⚡ Zeko Code — Server entry
 * Express + SSE streaming + static client (built bằng Vite).
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chatRouter } from './routes/chat.js';
import { healthRouter } from './routes/health.js';
import { modelsRouter } from './routes/models.js';
import { getCheckpoint } from './engine/checkpoint.js';
import memory from './engine/memory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const distDir = path.join(root, 'client', 'dist');
const dev = process.argv.includes('--dev');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// ---------- API ----------
app.use('/api/health', healthRouter);
app.use('/api/models', modelsRouter);
app.use('/api', chatRouter);

// ---------- Static (client build) ----------
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/(api|assets)).*/, (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else if (dev) {
  console.log('ℹ  Chưa có client/dist — chạy "npm run build" hoặc dùng Vite dev server (http://localhost:5173).');
}

// ---------- Boot ----------
const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, '0.0.0.0', async () => {
  let version = '?', codename = '?', params = '?';
  try {
    const ck = await getCheckpoint();
    version = ck.version;
    codename = ck.codename;
    params = ck.params ? (ck.params / 1e9).toFixed(1) + 'B' : '—';
  } catch { /* checkpoint chưa train — fallback in-memory */ }
  console.log('');
  console.log('  ⚡ Zeko Code');
  console.log('  ─────────────────────────────────────────');
  console.log('  Model    : ZekoCode v' + version + ' ("' + codename + '") · ' + params + ' params · on-device');
  console.log('  API      : http://localhost:' + PORT + '/api  (SSE: POST /api/chat)');
  console.log('  Web      : http://localhost:' + PORT + (fs.existsSync(distDir) ? '' : '  (chưa build client)'));
  console.log('  Convers. : ' + memory.size() + ' in-memory');
  console.log('  ─────────────────────────────────────────');
  console.log('');
});

export default app;
