/**
 * Vector math cho ZekoCode — bag-of-words + L2 normalization + cosine.
 * Dùng chung giữa scripts/train-zeko.js (giám sát: build checkpoint)
 * và engine lúc runtime (classify intent).
 */
import { tokenize } from '../utils/text.js';

export function buildIndex(docs) {
  const corpus = docs.map(
    (d) => (d.title + ' ' + d.keywords.join(' ') + ' ' + (d.corpus || '')).toLowerCase()
  );
  const docTokens = corpus.map(tokenize);
  const vocabSet = new Set();
  docTokens.forEach((toks) => toks.forEach((w) => vocabSet.add(w)));
  const vocab = [...vocabSet].sort();
  const idx = new Map(vocab.map((w, i) => [w, i]));

  const vectors = {};
  docs.forEach((d, di) => {
    const v = new Float64Array(vocab.length);
    for (const t of docTokens[di]) if (idx.has(t)) v[idx.get(t)] += 1;
    const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
    const sparse = [];
    for (let i = 0; i < v.length; i++) if (v[i] !== 0) sparse.push({ i, w: +(v[i] / norm).toFixed(5) });
    vectors[d.id] = sparse;
  });

  return {
    vocab,
    vectors,
    keywords: Object.fromEntries(docs.map((d) => [d.id, d.keywords])),
  };
}

/** Cosine giữa query (dạng dense) và doc vector sparse — vector đã L2-norm. */
export function cosineWithSparse(queryTokens, docVector, vocab) {
  if (!docVector || !docVector.length) return 0;
  const q = new Float64Array(vocab.length);
  for (const t of queryTokens) {
    const i = vocab.indexOf(t);
    if (i >= 0) q[i] += 1;
  }
  const qn = Math.sqrt(q.reduce((a, b) => a + b * b, 0)) || 1;
  let dot = 0;
  for (const { i, w } of docVector) dot += (q[i] / qn) * w;
  return dot;
}
