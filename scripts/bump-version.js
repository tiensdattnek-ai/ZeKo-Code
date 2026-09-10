#!/usr/bin/env node
/**
 * Nâng version ZekoCode (v1.2 → v1.3) trong shared/version.json.
 * Chạy tiếp `npm run train` để bake checkpoint bản mới.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const verPath = path.join(__dirname, '..', 'shared', 'version.json');
const ver = JSON.parse(fs.readFileSync(verPath, 'utf8'));

const parts = String(ver.version).split('.').map(Number);
parts[1] += 1;
const next = parts.join('.');

ver.version = next;
ver.released_at = new Date().toISOString().slice(0, 10);
ver.changelog = 'v' + next + ' — released ' + ver.released_at;

fs.writeFileSync(verPath, JSON.stringify(ver, null, 2) + '\n');
console.log('');
console.log('  ⬆️  ZekoCode: v' + (parts.join('.') ? parts.map((p, i) => (i === 1 ? p - 1 : p)).join('.') : '?') + ' → v' + next);
console.log('  Chạy tiếp: npm run train  → bake checkpoint zecocode-v' + next + '.json');
console.log('');
