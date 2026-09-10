import { Router } from 'express';
import { getCheckpoint } from '../engine/checkpoint.js';

const router = Router();

router.get('/', async (req, res) => {
  const ck = await getCheckpoint();
  const active = {
    id: 'zecocode-v' + ck.version,
    name: 'ZekoCode v' + ck.version,
    codename: ck.codename,
    params: ck.params ? (ck.params / 1e9).toFixed(1) + 'B' : '—',
    runtime: 'on-device',
    trained_at: ck.trained_at,
    status: 'online',
  };
  res.json({
    active,
    pipeline: [
      { id: 'zecocode-v' + nextMinor(ck.version), name: 'ZekoCode v' + nextMinor(ck.version), status: 'training', note: 'đang huấn luyện' },
      { id: 'zecocode-v' + prevMinor(ck.version), name: 'ZekoCode v' + prevMinor(ck.version), status: 'legacy' },
    ],
    protocol: {
      stream: 'POST /api/chat → SSE (meta, thought, delta, done, error)',
      models: 'GET /api/models',
      health: 'GET /api/health',
    },
  });
});

function nextMinor(v) {
  const parts = String(v).split('.').map(Number);
  return parts[0] + '.' + (parts[1] + 1);
}
function prevMinor(v) {
  const parts = String(v).split('.').map(Number);
  return parts[0] + '.' + Math.max(0, parts[1] - 1);
}

export { router as modelsRouter };
