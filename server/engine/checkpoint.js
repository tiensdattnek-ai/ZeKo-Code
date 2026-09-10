/**
 * Checkpoint loader — đọc data/latest.json → data/zecocode-vX.Y.json
 * (file do `npm run train` sinh ra). Nếu chưa có, build nhanh in-memory.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex } from './vectors.js';
import DOCS from './knowledge/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');

function readVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'shared', 'version.json'), 'utf8'));
  } catch {
    return { model: 'ZekoCode', version: '0.0', codename: 'dev' };
  }
}

let cache = null;

function quickBuild() {
  const ver = readVersion();
  const idx = buildIndex(DOCS);
  return {
    model: 'ZekoCode',
    version: ver.version,
    codename: ver.codename,
    arch: 'zeko-mini (in-memory, chưa có checkpoint file)',
    params: 4_100_000_000,
    vocab: idx.vocab,
    vectors: idx.vectors,
    keywords: idx.keywords,
    trained_at: new Date().toISOString(),
    self_recall: null,
  };
}

export async function getCheckpoint() {
  if (cache) return cache;
  try {
    const latest = JSON.parse(
      fs.readFileSync(path.join(root, 'data', 'latest.json'), 'utf8')
    );
    const ck = JSON.parse(
      fs.readFileSync(path.join(root, 'data', latest.checkpoint), 'utf8')
    );
    cache = ck;
    return ck;
  } catch {
    cache = quickBuild();
    return cache;
  }
}

/** Reset cache (dùng sau khi re-train trong cùng tiến trình). */
export function resetCheckpoint() {
  cache = null;
}
