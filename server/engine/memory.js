/**
 * Conversation memory — in-memory, giới hạn context window kiểu LLM.
 */
const MAX_MESSAGES_PER_CONVO = 12;
const MAX_CONVERSATIONS = 200;

const convos = new Map();

function push(convoId, msg) {
  const id = convoId || 'anon';
  const list = [...(convos.get(id) || []), msg].slice(-MAX_MESSAGES_PER_CONVO);
  convos.set(id, list);
  if (convos.size > MAX_CONVERSATIONS) convos.clear();
}

const memory = {
  append(convoId, msg) {
    push(convoId, msg);
  },

  history(convoId) {
    return [...(convos.get(convoId || 'anon') || [])];
  },

  lastAssistantCode(convoId) {
    const h = convos.get(convoId || 'anon') || [];
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i].role === 'assistant' && /```/.test(h[i].content || '')) return h[i].content;
    }
    return null;
  },

  size() {
    return convos.size;
  },

  clear() {
    convos.clear();
  },
};

export default memory;
