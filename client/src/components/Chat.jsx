import { useEffect, useRef } from 'react';
import Message from './Message.jsx';
import Welcome from './Welcome.jsx';

export default function Chat({ convo, stream, onSuggestion }) {
  const scrollRef = useRef(null);
  const endRef = useRef(null);
  const stick = useRef(true);

  const msgs = (convo && convo.messages) || [];

  useEffect(() => {
    if (stick.current) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  });

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
  }

  return (
    <div className="chat" ref={scrollRef} onScroll={onScroll}>
      <div className="chat-inner">
        {msgs.length === 0 && <Welcome onPick={onSuggestion} />}
        {msgs.map((m, i) => (
          <Message
            key={i}
            msg={m}
            streaming={i === msgs.length - 1 && m.role === 'assistant' && stream !== 'idle'}
          />
        ))}
        <div ref={endRef} className="chat-end" />
      </div>
    </div>
  );
}
