/**
 * ⚡ ZekoCode — model orchestrator
 * Pipeline: greeting → follow-up(extend) → classify(checkpoint) → render(ctx)
 */
import { getCheckpoint } from './checkpoint.js';
import { tokenize, extractName, clip } from '../utils/text.js';
import DOCS, { DOCS_BY_ID } from './knowledge/index.js';
import { cosineWithSparse } from './vectors.js';
import { detectExtension } from './knowledge/extensions.js';
import memory from './memory.js';

const GREET_RE = /^(chào|xin chào|hello|hi|hey|yo|cảm ơn|thanks|thank you|ok|hey zeko|chào zeko|zế|zê)/i;

export function classify(text, checkpoint) {
  const lower = ' ' + String(text || '').toLowerCase() + ' ';
  const qv = tokenize(lower);
  const scored = DOCS.map((d) => {
    let s = 0;
    for (const kw of d.keywords) {
      if (lower.includes(kw.toLowerCase())) s += d.boost?.[kw] ?? 1;
    }
    s += cosineWithSparse(qv, checkpoint.vectors?.[d.id], checkpoint.vocab) * 2.5;
    return { id: d.id, score: s };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1] || { score: 0 };
  const confidence =
    top.score <= 0
      ? 0.52
      : Math.min(0.99, Math.max(0.55, top.score / (top.score + second.score + 1e-9) + 0.18));
  return { id: top.id, score: top.score, confidence: +confidence.toFixed(2) };
}

function lastUserText(history) {
  for (let i = history.length - 1; i >= 0; i--) if (history[i].role === 'user') return history[i].content;
  return '';
}

export async function generate({ userText, conversationId, options = {} }) {
  const checkpoint = await getCheckpoint();
  const history = memory.history(conversationId);
  const t = String(userText || '').trim();

  // 1) Chào hỏi / meta
  if (t.length < 40 && GREET_RE.test(t)) {
    const r = DOCS_BY_ID.greet.render({ userText: t, name: 'Zeko', history, version: checkpoint.version });
    return { intent: 'Greeting', id: 'greet', confidence: 0.98, version: checkpoint.version, ...r };
  }

  // 2) Follow-up trên code vừa sinh → extension patch
  const hasCodeBefore = history.some((m) => m.role === 'assistant' && /```/.test(m.content || ''));
  const isFollowUp =
    hasCodeBefore &&
    t.length < 140 &&
    /thêm|bổ sung|chỉnh sửa|sửa lại|cập nhật|update|add|remove|gỡ|đổi|nâng cấp/i.test(t);
  if (isFollowUp) {
    const ext = detectExtension(t);
    const r = DOCS_BY_ID.extend.render({
      userText: t,
      name: extractName(lastUserText(history) || t),
      history,
      version: checkpoint.version,
      ext,
    });
    return { intent: 'Extend code', id: 'extend', confidence: 0.9, version: checkpoint.version, ...r };
  }

  // 3) Phân loại intent bằng checkpoint
  const { id, confidence } = classify(t, checkpoint);
  const doc = DOCS_BY_ID[id] || DOCS_BY_ID.general;
  const r = doc.render({
    userText: t,
    name: extractName(t),
    history,
    version: checkpoint.version,
    temperature: typeof options.temperature === 'number' ? options.temperature : 0.7,
  });
  return { intent: doc.title, id: doc.id, confidence, version: checkpoint.version, ...r };
}

export { clip };
