import { Router } from 'express';
import { getCheckpoint } from '../engine/checkpoint.js';
import memory from '../engine/memory.js';

const router = Router();

router.get('/', async (req, res) => {
  let ck;
  try {
    ck = await getCheckpoint();
  } catch {
    ck = { version: '0.0', codename: 'dev', params: 0, trained_at: null };
  }
  res.json({
    ok: true,
    model: 'ZekoCode',
    version: ck.version,
    codename: ck.codename,
    params: ck.params ? (ck.params / 1e9).toFixed(1) + 'B' : '—',
    runtime: 'on-device',
    uptime_sec: Math.round(process.uptime()),
    conversations: memory.size(),
    timestamp: new Date().toISOString(),
  });
});

export { router as healthRouter };
