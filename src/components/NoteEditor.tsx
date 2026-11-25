import { useEffect, useRef, useState } from "react";
import type { Note } from "../lib/notes";
import { useStore } from "../lib/store";
import {
  buildNotePrompt,
  runHybridPrompt,
  type AiRunResult,
  type NoteAiAction,
} from "../lib/ai";
import { RouteBadge, Spinner, errorMessage } from "./ui";

const ACTIONS: { key: NoteAiAction; label: string; icon: string }[] = [
  { key: "summarize", label: "Summarize", icon: "✦" },
  { key: "keypoints", label: "Key points", icon: "☰" },
  { key: "rewrite", label: "Rewrite & expand", icon: "✎" },
  { key: "translate", label: "Translate ID ↔ EN", icon: "🌐" },
];

interface AiOutput {
  action: NoteAiAction;
  result: AiRunResult;
}

export function NoteEditor({ note }: { note: Note | null }) {
  const { demoMode, preference, onDeviceMaxChars, updateNote, deleteNote, pushToast } =
    useStore();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busyAction, setBusyAction] = useState<NoteAiAction | null>(null);
  const [aiOutput, setAiOutput] = useState<AiOutput | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const loadedId = useRef<string | null>(null);

  // Load the selected note into the editor.
  useEffect(() => {
    if (note && loadedId.current !== note.id) {
      loadedId.current = note.id;
      setTitle(note.title);
      setBody(note.body);
      setAiOutput(null);
      setConfirmDelete(false);
    }
    if (!note) loadedId.current = null;
  }, [note]);

  // Debounced autosave.
  useEffect(() => {
    if (!note || loadedId.current !== note.id) return;
    if (title === note.title && body === note.body) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void updateNote(note.id, { title, body }).catch((err) =>
        pushToast("error", `Save failed: ${errorMessage(err)}`),
      );
    }, 650);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [title, body, note, updateNote, pushToast]);

  if (!note) {
    return (
      <div className="editor-empty">
        <div className="empty-hero">◐</div>
        <h2>Select a note, or create a new one</h2>
        <p>
          Short notes are processed on-device for privacy and speed; long ones
          are routed to the cloud. Every AI result shows where it actually ran.
        </p>
      </div>
    );
  }

  const charCount = `${title}\n${body}`.length;
  const routeHint =
    preference === "auto"
      ? charCount < onDeviceMaxChars
        ? `Auto routing: this note (${charCount} chars) will prefer on-device`
        : `Auto routing: this note (${charCount} chars) will prefer cloud`
      : preference === "on-device"
        ? "Settings: preferring on-device for all requests"
        : "Settings: preferring cloud for all requests";

  async function runAction(action: NoteAiAction) {
    if (!note) return;
    setBusyAction(action);
    setAiOutput(null);
    try {
      const prompt = buildNotePrompt(action, title, body);
      const result = await runHybridPrompt(prompt, preference, onDeviceMaxChars);
      setAiOutput({ action, result });
    } catch (err) {
      pushToast("error", errorMessage(err));
    } finally {
      setBusyAction(null);
    }
  }

  async function applyAi(mode: "replace" | "append") {
    if (!note || !aiOutput) return;
    const text = aiOutput.result.text.trim();
    const newBody =
      mode === "replace" ? text : `${body.trimEnd()}\n\n${text}`;
    setBody(newBody);
    try {
      await updateNote(note.id, { body: newBody });
      pushToast("success", mode === "replace" ? "Note replaced with AI output." : "AI output appended.");
      setAiOutput(null);
    } catch (err) {
      pushToast("error", `Save failed: ${errorMessage(err)}`);
    }
  }

  async function handleDelete() {
    if (!note) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      window.setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    try {
      await deleteNote(note.id);
      pushToast("info", "Note deleted.");
    } catch (err) {
      pushToast("error", errorMessage(err));
    }
  }

  return (
    <div className="editor">
      <div className="editor-toolbar">
        <button
          className={`btn btn-chip ${note.pinned ? "btn-chip-on" : ""}`}
          onClick={() =>
            void updateNote(note.id, { pinned: !note.pinned }).catch((e) =>
              pushToast("error", errorMessage(e)),
            )
          }
        >
          📌 {note.pinned ? "Pinned" : "Pin"}
        </button>
        <button
          className="btn btn-chip"
          onClick={() =>
            void updateNote(note.id, { archived: !note.archived })
              .then(() =>
                pushToast("info", note.archived ? "Note restored." : "Note archived."),
              )
              .catch((e) => pushToast("error", errorMessage(e)))
          }
        >
          🗄 {note.archived ? "Unarchive" : "Archive"}
        </button>
        <span className="toolbar-spacer" />
        <span className="char-count" title={routeHint}>
          {charCount} chars
        </span>
        <button
          className={`btn btn-chip ${confirmDelete ? "btn-danger" : ""}`}
          onClick={() => void handleDelete()}
        >
          {confirmDelete ? "Confirm delete?" : "🗑 Delete"}
        </button>
      </div>

      <input
        className="editor-title"
        placeholder="Untitled note"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Note title"
      />
      <textarea
        className="editor-body"
        placeholder="Start writing… your drafts autosave."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Note body"
      />

      <div className="ai-bar">
        <div className="ai-bar-head">
          <span className="ai-bar-title">✦ Hybrid AI</span>
          <span className="ai-bar-hint">{routeHint}</span>
        </div>
        {demoMode && (
          <div className="banner banner-demo banner-inline">
            AI is disabled in demo mode — add a real Firebase config to enable
            hybrid inference.
          </div>
        )}
        <div className="ai-actions">
          {ACTIONS.map((a) => (
            <button
              key={a.key}
              className="btn btn-ai"
              disabled={demoMode || busyAction !== null || body.trim().length === 0}
              onClick={() => void runAction(a.key)}
              title={
                demoMode
                  ? "Disabled in demo mode"
                  : body.trim().length === 0
                    ? "Write something first"
                    : a.label
              }
            >
              {busyAction === a.key ? (
                <Spinner label="Thinking…" />
              ) : (
                <>
                  <span aria-hidden="true">{a.icon}</span> {a.label}
                </>
              )}
            </button>
          ))}
        </div>

        {aiOutput && (
          <div className="ai-result" aria-live="polite">
            <div className="ai-result-head">
              <strong>
                {ACTIONS.find((a) => a.key === aiOutput.action)?.label} result
              </strong>
              <RouteBadge result={aiOutput.result} />
              <span className="toolbar-spacer" />
              <button
                className="icon-btn"
                onClick={() => setAiOutput(null)}
                aria-label="Dismiss AI result"
              >
                ✕
              </button>
            </div>
            {aiOutput.result.fellBackToCloud && (
              <p className="ai-fallback-note">
                On-device was requested, but the SDK served this from the
                cloud (on-device model unavailable here, or request needed
                cloud). Nothing about the route is hidden.
              </p>
            )}
            <div className="ai-result-text">{aiOutput.result.text}</div>
            <div className="ai-result-actions">
              <button className="btn btn-primary" onClick={() => void applyAi("replace")}>
                Replace note
              </button>
              <button className="btn btn-secondary" onClick={() => void applyAi("append")}>
                Append to note
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(aiOutput.result.text)
                    .then(() => pushToast("success", "Copied to clipboard."))
                    .catch(() => pushToast("error", "Copy failed."));
                }}
              >
                Copy
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
