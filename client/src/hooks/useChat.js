/**
 * useChat — state machine cho hội thoại + streaming SSE.
 * convos persist localStorage; mỗi message assistant có:
 *   thought (stream suy nghĩ), content (stream nội dung), meta, stats, status.
 */
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { streamChat } from '../lib/api.js';
import { loadConvos, saveConvos } from '../lib/storage.js';

let n = 0;
const uid = (p) => p + '_' + Date.now().toString(36) + (n++).toString(36);

const titleFrom = (text) => {
  const t = String(text).replace(/\s+/g, ' ').trim();
  return t.length > 46 ? t.slice(0, 45) + '…' : t;
};

const initialState = () => ({
  convos: loadConvos(),
  activeId: null,
  streamConvId: null,
  stream: 'idle', // idle | thinking | streaming
  error: null,
});

function updateBot(state, fn) {
  const id = state.streamConvId;
  if (!id) return state;
  return {
    ...state,
    convos: state.convos.map((c) => {
      if (c.id !== id) return c;
      const msgs = [...c.messages];
      msgs[msgs.length - 1] = fn(msgs[msgs.length - 1]);
      return { ...c, messages: msgs };
    }),
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'new-chat':
      return { ...state, activeId: uid('c'), stream: 'idle', error: null };
    case 'select':
      return { ...state, activeId: action.id, error: null };
    case 'delete': {
      const convos = state.convos.filter((c) => c.id !== action.id);
      return { ...state, convos, activeId: state.activeId === action.id ? null : state.activeId };
    }
    case 'send': {
      let convos = state.convos;
      const activeId = action.convId;
      if (!convos.some((c) => c.id === activeId)) {
        convos = [
          { id: activeId, title: titleFrom(action.text), createdAt: Date.now(), messages: [] },
          ...convos,
        ];
      }
      const convo = convos.find((c) => c.id === activeId);
      const messages = [
        ...convo.messages,
        { role: 'user', content: action.text, at: Date.now() },
        {
          role: 'assistant',
          thought: '',
          content: '',
          status: 'thinking',
          meta: {},
          stats: null,
          error: null,
          at: Date.now(),
        },
      ];
      convos = convos.map((c) => (c.id === activeId ? { ...c, messages } : c));
      return { ...state, convos, activeId, streamConvId: activeId, stream: 'thinking', error: null };
    }
    case 'meta':
      return updateBot(state, (m) => ({ ...m, meta: action.data }));
    case 'thought':
      return updateBot(state, (m) => ({ ...m, thought: m.thought + action.token }));
    case 'thought_done':
      return updateBot(state, (m) =>
        m.status === 'thinking' ? { ...m, status: 'streaming' } : m
      );
    case 'delta':
      return {
        ...updateBot(state, (m) => ({
          ...m,
          status: m.status === 'thinking' ? 'streaming' : m.status,
          content: m.content + action.token,
        })),
        stream: 'streaming',
      };
    case 'done':
      return {
        ...updateBot(state, (m) =>
          m.status === 'error' ? m : { ...m, status: action.data.aborted ? 'aborted' : 'done', stats: action.data }
        ),
        stream: 'idle',
        streamConvId: null,
      };
    case 'error':
      return {
        ...updateBot(state, (m) =>
          m.status === 'error' ? m : { ...m, status: 'error', error: action.data.message || 'Lỗi stream' }
        ),
        stream: 'idle',
        streamConvId: null,
        error: action.data.message,
      };
    default:
      return state;
  }
}

export function useChat() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const abortRef = useRef(null);
  const busyRef = useRef(false);

  useEffect(() => {
    saveConvos(state.convos);
  }, [state.convos]);

  const send = useCallback(
    async (text, options = {}) => {
      const t = String(text || '').trim();
      if (!t || busyRef.current) return;
      busyRef.current = true;

      const hasActive = state.convos.some((c) => c.id === state.activeId);
      const convId = hasActive ? state.activeId : uid('c');
      const convo = state.convos.find((c) => c.id === convId);
      const history = convo
        ? convo.messages.map((m) => ({ role: m.role, content: m.content }))
        : [];

      dispatch({ type: 'send', text: t, convId });
      abortRef.current = new AbortController();

      try {
        await streamChat({
          conversationId: convId,
          messages: [...history, { role: 'user', content: t }],
          options,
          signal: abortRef.current.signal,
          onEvent: (evt) => {
            switch (evt.event) {
              case 'meta':
                dispatch({ type: 'meta', data: evt.data });
                break;
              case 'thought':
                dispatch({ type: 'thought', token: evt.data.token });
                break;
              case 'thought_done':
                dispatch({ type: 'thought_done' });
                break;
              case 'delta':
                dispatch({ type: 'delta', token: evt.data.token });
                break;
              case 'done':
                dispatch({ type: 'done', data: evt.data });
                break;
              case 'error':
                dispatch({ type: 'error', data: evt.data });
                break;
              default:
                break;
            }
          },
        });
      } catch (err) {
        if (err && err.name === 'AbortError') {
          dispatch({ type: 'done', data: { aborted: true } });
        } else {
          dispatch({ type: 'error', data: { message: (err && err.message) || 'Không kết nối được server' } });
        }
      } finally {
        busyRef.current = false;
        abortRef.current = null;
      }
    },
    [state.convos, state.activeId]
  );

  const stop = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  const newChat = useCallback(() => dispatch({ type: 'new-chat' }), []);
  const select = useCallback((id) => dispatch({ type: 'select', id }), []);
  const remove = useCallback((id) => dispatch({ type: 'delete', id }), []);

  return { state, send, stop, newChat, select, remove };
}
