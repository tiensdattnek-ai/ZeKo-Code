/**
 * POST /api/chat — SSE streaming endpoint.
 * Body: { conversation_id, messages: [{role, content}], options: { temperature } }
 */
import { Router } from 'express';
import { sse, initSSE, sleep } from '../sse.js';
import { generate } from '../engine/zeco-model.js';
import { streamTokens } from '../engine/stream.js';
import memory from '../engine/memory.js';

const router = Router();

router.post('/chat', async (req, res) => {
  initSSE(res);
  const send = (event, data) => res.write(sse(event, data));

  const { messages = [], conversation_id = 'anon', options = {} } = req.body || {};
  const userMsg = [...messages].reverse().find((m) => m && m.role === 'user' && m.content);

  if (!userMsg) {
    send('error', { message: 'Thiếu user message có content.' });
    return res.end();
  }

  const controller = new AbortController();
  res.on('close', () => {
    // chỉ abort khi client "bỏ chạy" giữa stream (không phải khi stream kết thúc bình thường)
    if (!res.writableEnded) controller.abort();
  });

  const t0 = Date.now();
  try {
    const result = await generate({
      userText: userMsg.content,
      conversationId: conversation_id,
      options,
    });

    send('meta', {
      run_id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      model: 'ZekoCode',
      version: result.version,
      codename: 'Aurora',
      intent: result.intent,
      confidence: result.confidence,
    });

    await sleep(300); // "prefill"

    let thoughtChars = 0;
    const thoughtOk = await streamTokens(result.thought, {
      signal: controller.signal,
      delayMin: 3,
      delayMax: 11,
      onToken: (tok) => {
        thoughtChars += tok.length;
        send('thought', { token: tok });
      },
    });
    send('thought_done', {});

    await sleep(200); // "decode start"

    let chars = 0;
    const ok =
      thoughtOk &&
      (await streamTokens(result.answer, {
        signal: controller.signal,
        delayMin: 4,
        delayMax: 15,
        onToken: (tok) => {
          chars += tok.length;
          send('delta', { token: tok });
        },
      }));

    const aborted = !ok;
    if (!aborted) {
      memory.append(conversation_id, { role: 'user', content: userMsg.content });
      memory.append(conversation_id, { role: 'assistant', content: result.answer });
    }

    const elapsed = Date.now() - t0;
    const completionTokens = Math.max(1, Math.round((chars + thoughtChars) / 4));
    const promptTokens = Math.max(1, Math.round(userMsg.content.length / 4)) + 42;
    send('done', {
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
      elapsed_ms: elapsed,
      tokens_per_sec: Math.round(completionTokens / Math.max(0.4, elapsed / 1000)),
      intent: result.intent,
      confidence: result.confidence,
      aborted,
    });
  } catch (err) {
    if (!controller.signal.aborted) send('error', { message: err.message || 'Lỗi không xác định trong engine.' });
    send('done', { usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, elapsed_ms: Date.now() - t0, error: true });
  } finally {
    res.end();
  }
});

export { router as chatRouter };
