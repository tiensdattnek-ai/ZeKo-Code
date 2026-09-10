/**
 * SSE (Server-Sent Events) helpers — protocol Zeko Code:
 *
 *   event: meta         { run_id, model, version, intent, confidence }
 *   event: thought      { token }            (streaming suy nghĩ)
 *   event: thought_done {}
 *   event: delta        { token }            (streaming nội dung)
 *   event: done         { usage, elapsed_ms, tokens_per_sec, intent, confidence, aborted }
 *   event: error        { message }
 */
export function sse(event, data) {
  return 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n';
}

export function initSSE(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': zeko-code sse stream\n\n');
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
