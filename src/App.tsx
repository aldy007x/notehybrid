import { useEffect, useMemo, useState } from "react";
import { useStore } from "./lib/store";
import { AuthScreen } from "./components/AuthScreen";
import { NoteList, type NoteFilter } from "./components/NoteList";
import { NoteEditor } from "./components/NoteEditor";
import { AskNotes } from "./components/AskNotes";
import { SettingsModal } from "./components/SettingsModal";
import { HybridStatus } from "./components/HybridStatus";
import { Toasts, Spinner } from "./components/ui";

export default function App() {
  const { authReady, user, demoMode, notes, theme, toggleTheme } = useStore();
  const [filter, setFilter] = useState<NoteFilter>("active");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Keep a sensible selection: first visible note when none is selected.
  useEffect(() => {
    if (!selectedId && notes.length > 0) {
      const first = notes.find((n) => !n.archived) ?? notes[0];
      setSelectedId(first.id);
    }
    if (selectedId && !notes.some((n) => n.id === selectedId)) {
      setSelectedId(null);
    }
  }, [notes, selectedId]);

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId],
  );

  if (!authReady) {
    return (
      <div className="splash">
        <Spinner label="Loading NoteHybrid…" />
      </div>
    );
  }

  if (!user) return (
    <>
      <AuthScreen />
      <Toasts />
    </>
  );

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">◐</span> NoteHybrid
          {demoMode && <span className="badge badge-demo">DEMO</span>}
        </div>
        <div className="header-actions">
          <button
            className={`btn btn-chip ${askOpen ? "btn-chip-on" : ""}`}
            onClick={() => setAskOpen((o) => !o)}
          >
            💬 Ask my notes
          </button>
          <button
            className="icon-btn"
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button
            className="icon-btn"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            title="Settings"
          >
            ⚙️
          </button>
          <span className="user-chip" title={user.uid}>
            {user.isAnonymous ? "Guest" : (user.email ?? "Account")}
          </span>
        </div>
      </header>

      {demoMode && (
        <div className="banner banner-demo banner-top">
          <strong>Demo mode:</strong> placeholder Firebase config — notes are
          local to this browser and AI is disabled. Add your config in
          <code> src/firebase-config.ts </code> to go live.
        </div>
      )}

      <main className={`layout ${askOpen ? "layout-ask" : ""}`}>
        <aside className="sidebar">
          <NoteList
            filter={filter}
            setFilter={setFilter}
            search={search}
            setSearch={setSearch}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <HybridStatus />
        </aside>
        <section className="editor-pane">
          <NoteEditor note={selectedNote} />
        </section>
        {askOpen && <AskNotes onClose={() => setAskOpen(false)} />}
      </main>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      <Toasts />
    </div>
  );
}
