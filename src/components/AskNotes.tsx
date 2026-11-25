import { useRef, useState } from "react";
import { useStore } from "../lib/store";
import {
  askNotesStream,
  buildNotesContext,
  type AiRunResult,
  type ChatTurn,
} from "../lib/ai";
import { RouteBadge, Spinner, errorMessage } from "./ui";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  result?: AiRunResult;
  streaming?: boolean;
}

const SUGGESTIONS = [
  "What are my main open ideas?",
  "Summarize everything I've written this week",
  "What did I note about the weekend project?",
];

export function AskNotes({ onClose }: { onClose: () => void }) {
  const { demoMode, notes, pushToast } = useStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeNotes = notes.filter((n) => !n.archived);

  function scrollSoon() {
    window.setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }, 30);
  }

  async function send(questionRaw: string) {
    const question = questionRaw.trim();
    if (!question || busy) return;
    setInput("");
    const userMsg: ChatMessage = { id: ++idRef.current, role: "user", text: question };
    const assistantId = ++idRef.current;
    const history: ChatTurn[] = messages.map((m) => ({
      role: m.role,
      text: m.text,
    }));
    setMessages((m) => [
      ...m,
      userMsg,
      { id: assistantId, role: "assistant", text: "", streaming: true },
    ]);
    setBusy(true);
    scrollSoon();
    try {
      const context = buildNotesContext(
        activeNotes.map((n) => ({ title: n.title, body: n.body })),
      );
      const result = await askNotesStream(question, context, history, (partial) => {
        setMessages((m) =>
          m.map((x) => (x.id === assistantId ? { ...x, text: partial } : x)),
        );
        scrollSoon();
      });
      setMessages((m) =>
        m.map((x) =>
          x.id === assistantId
            ? { ...x, text: result.text, result, streaming: false }
            : x,
        ),
      );
    } catch (err) {
      setMessages((m) =>
        m.map((x) =>
          x.id === assistantId
            ? { ...x, text: "⚠ " + errorMessage(err), streaming: false }
            : x,
        ),
      );
      pushToast("error", errorMessage(err));
    } finally {
      setBusy(false);
      scrollSoon();
    }
  }

  return (
    <aside className="ask-panel" aria-label="Ask my notes">
      <div className="ask-head">
        <h2>💬 Ask my notes</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close Ask panel">
          ✕
        </button>
      </div>
      <p className="ask-sub">
        Answers are grounded in your {activeNotes.length} active note
        {activeNotes.length === 1 ? "" : "s"} and routed to the cloud
        (multi-turn Q&A is cloud-first; on-device is single-turn only).
      </p>

      <div className="ask-messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="ask-empty">
            <p>Ask anything about your notes.</p>
            <div className="ask-suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="btn btn-chip"
                  disabled={demoMode}
                  onClick={() => void send(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            {demoMode && (
              <p className="status-note">
                Demo mode: chat is disabled until a real Firebase config is
                added.
              </p>
            )}
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`chat-msg chat-${m.role}`}>
              <div className="chat-bubble">
                {m.text ||
                  (m.streaming ? <Spinner label="Thinking…" /> : "")}
              </div>
              {m.result && (
                <div className="chat-meta">
                  <RouteBadge result={m.result} />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <form
        className="ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            demoMode ? "Disabled in demo mode" : "Ask about your notes…"
          }
          disabled={demoMode || busy}
          aria-label="Your question"
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={demoMode || busy || input.trim().length === 0}
        >
          {busy ? <Spinner /> : "Send"}
        </button>
      </form>
    </aside>
  );
}
