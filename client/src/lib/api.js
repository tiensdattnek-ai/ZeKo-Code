/**
 * SSE streaming client — POST /api/chat, parse event stream bằng ReadableStream.
 */
export async function streamChat({ conversationId, messages, options, signal, onEvent }) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({
      conversation_id: conversationId,
      messages,
      options,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error('HTTP ' + res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const evt = parseSSE(raw);
      if (evt) onEvent(evt);
    }
  }
}

function parseSSE(raw) {
  let event = 'message';
  let data = '';
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  if (!data) return null;
  try {
    return { event, data: JSON.parse(data) };
  } catch {
    return { event, data: { message: data } };
  }
}

export async function fetchModels() {
  try {
    const res = await fetch('/api/models');
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}
