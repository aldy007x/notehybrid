import type { Note } from "../lib/notes";
import { useStore } from "../lib/store";
import { Spinner } from "./ui";

export type NoteFilter = "active" | "pinned" | "archived";

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function NoteList({
  filter,
  setFilter,
  search,
  setSearch,
  selectedId,
  onSelect,
}: {
  filter: NoteFilter;
  setFilter: (f: NoteFilter) => void;
  search: string;
  setSearch: (s: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { notes, notesLoading, createNote, pushToast } = useStore();

  const q = search.trim().toLowerCase();
  const visible = notes.filter((n) => {
    if (filter === "active" && n.archived) return false;
    if (filter === "pinned" && (!n.pinned || n.archived)) return false;
    if (filter === "archived" && !n.archived) return false;
    if (q && !`${n.title}\n${n.body}`.toLowerCase().includes(q)) return false;
    return true;
  });

  async function handleNew() {
    try {
      const id = await createNote();
      onSelect(id);
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="note-list-wrap">
      <div className="note-list-tools">
        <input
          className="search-input"
          type="search"
          placeholder="Search notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search notes"
        />
        <button className="btn btn-primary" onClick={() => void handleNew()}>
          + New note
        </button>
      </div>
      <div className="filter-tabs" role="tablist" aria-label="Note filters">
        {(
          [
            ["active", "All"],
            ["pinned", "Pinned"],
            ["archived", "Archived"],
          ] as [NoteFilter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={filter === key}
            className={`filter-tab ${filter === key ? "filter-tab-on" : ""}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="note-list" role="list">
        {notesLoading ? (
          <div className="list-empty">
            <Spinner label="Loading notes…" />
          </div>
        ) : visible.length === 0 ? (
          <div className="list-empty">
            {notes.length === 0 ? (
              <>
                <p className="empty-title">No notes yet</p>
                <p>Create your first note — then let hybrid AI summarize it.</p>
              </>
            ) : q ? (
              <>
                <p className="empty-title">No matches</p>
                <p>Nothing matches “{search}” in this view.</p>
              </>
            ) : (
              <>
                <p className="empty-title">Nothing here</p>
                <p>
                  {filter === "pinned"
                    ? "Pin a note to keep it at the top."
                    : filter === "archived"
                      ? "Archived notes will appear here."
                      : "Create a note to get started."}
                </p>
              </>
            )}
          </div>
        ) : (
          visible.map((n: Note) => (
            <button
              key={n.id}
              role="listitem"
              className={`note-item ${n.id === selectedId ? "note-item-on" : ""}`}
              onClick={() => onSelect(n.id)}
            >
              <span className="note-item-title">
                {n.pinned ? "📌 " : ""}
                {n.title.trim() || "Untitled note"}
              </span>
              <span className="note-item-snippet">
                {n.body.trim().slice(0, 90) || "No content yet"}
              </span>
              <span className="note-item-time">{relativeTime(n.updatedAt)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
