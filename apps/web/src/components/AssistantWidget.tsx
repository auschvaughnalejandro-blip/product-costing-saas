import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '../lib/api';
import { useAssistant } from '../lib/assistant';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  grounded?: boolean;
}

const QUICK_PROMPTS = [
  'Explain this cost breakdown',
  'What is driving the cost?',
  'What does overhead mean here?',
  'What if material prices rose 10%?',
];

export function AssistantWidget() {
  const { open, setOpen, pageContext } = useAssistant();
  const { data: status } = useQuery({
    queryKey: ['assistant-status'],
    queryFn: api.assistantStatus,
    staleTime: Infinity,
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setMessages((m) => [...m, { role: 'user', text: question }]);
    setInput('');
    setBusy(true);
    try {
      const r = await api.assistantExplain(question, pageContext);
      setMessages((m) => [...m, { role: 'assistant', text: r.answer, grounded: r.grounded }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: err instanceof api.ApiClientError ? err.message : 'Something went wrong.',
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="assistant-fab" onClick={() => setOpen(!open)} title="Assistant" aria-label="Assistant">
        ✦
      </button>

      {open && (
        <div className="assistant-panel">
          <div className="assistant-header">
            <strong>Assistant</strong>
            <span className="muted">{status?.enabled ? 'explains your figures' : 'not configured'}</span>
            <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close">
              ✕
            </button>
          </div>

          {status && !status.enabled && (
            <div className="alert alert-warning">
              The AI assistant isn’t configured on this server. It explains figures once a key is
              set — cost numbers always come from the engine.
            </div>
          )}

          <div className="assistant-body">
            {messages.length === 0 && (
              <div>
                <p className="muted">
                  Ask about any figure or term. The assistant <strong>explains</strong> — it never
                  changes a number.
                </p>
                <div className="assistant-quick">
                  {QUICK_PROMPTS.map((q) => (
                    <button key={q} className="chip" onClick={() => ask(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`bubble bubble-${m.role}`}>
                {m.text}
                {m.role === 'assistant' && m.grounded && (
                  <div className="bubble-meta">grounded in your data</div>
                )}
              </div>
            ))}
            {busy && <div className="bubble bubble-assistant muted">thinking…</div>}
          </div>

          <form
            className="assistant-input"
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
            />
            <button className="btn btn-primary btn-sm" disabled={busy}>
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}
