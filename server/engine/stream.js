/**
 * Token stream — cắt nội dung thành chunk tự nhiên (theo word, flush khi
 * gặp dấu câu hoặc đủ dài) và phát ra dần như LLM đang "nhả token".
 */
function* chunksOf(text, minLen = 14) {
  const parts = String(text).match(/\S+\s*/g) || [];
  let buf = '';
  for (const p of parts) {
    buf += p;
    if (buf.length >= minLen || /[,;:.\n!?]$/.test(buf.trim())) {
      yield buf;
      buf = '';
    }
  }
  if (buf) yield buf;
}

export async function streamTokens(text, { onToken, signal, delayMin = 4, delayMax = 16, minLen } = {}) {
  for (const chunk of chunksOf(text, minLen)) {
    if (signal?.aborted) return false;
    onToken(chunk);
    const ms = delayMin + Math.random() * (delayMax - delayMin);
    await new Promise((r) => setTimeout(r, ms));
  }
  return !signal?.aborted;
}
