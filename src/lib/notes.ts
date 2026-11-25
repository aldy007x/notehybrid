/**
 * Notes data layer.
 *
 * One interface, two implementations:
 *   • FirestoreNotesBackend — real backend: `users/{uid}/notes` in Cloud
 *     Firestore with offline persistence enabled (see lib/firebase.ts), so
 *     reads/writes work offline and sync when the connection returns.
 *   • LocalNotesBackend — demo mode (placeholder Firebase config): notes in
 *     localStorage, so the product is fully explorable before a real
 *     Firebase project is connected.
 */
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { getFirebaseServices } from "./firebase";

export interface Note {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export type NotePatch = Partial<
  Pick<Note, "title" | "body" | "pinned" | "archived">
>;

export interface NotesBackend {
  subscribe(
    uid: string,
    onNotes: (notes: Note[]) => void,
    onError: (err: Error) => void,
  ): () => void;
  create(uid: string, data: Omit<Note, "id">): Promise<string>;
  update(uid: string, id: string, patch: NotePatch): Promise<void>;
  remove(uid: string, id: string): Promise<void>;
}

/** Pinned first, then most recently updated — applied uniformly in the UI. */
export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

/* ───────────────────────── Firestore backend ───────────────────────── */

class FirestoreNotesBackend implements NotesBackend {
  private col(uid: string) {
    const svc = getFirebaseServices();
    if (!svc) throw new Error("Firebase is not configured (demo mode).");
    return collection(svc.db, "users", uid, "notes");
  }

  subscribe(uid: string, onNotes: (n: Note[]) => void, onError: (e: Error) => void) {
    const q = query(this.col(uid), orderBy("updatedAt", "desc"));
    return onSnapshot(
      q,
      (snap) => {
        onNotes(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Note, "id">) })),
        );
      },
      (err) => onError(err instanceof Error ? err : new Error(String(err))),
    );
  }

  async create(uid: string, data: Omit<Note, "id">): Promise<string> {
    const ref = await addDoc(this.col(uid), data);
    return ref.id;
  }

  async update(uid: string, id: string, patch: NotePatch): Promise<void> {
    const svc = getFirebaseServices();
    if (!svc) throw new Error("Firebase is not configured (demo mode).");
    await updateDoc(doc(svc.db, "users", uid, "notes", id), {
      ...patch,
      updatedAt: Date.now(),
    });
  }

  async remove(uid: string, id: string): Promise<void> {
    const svc = getFirebaseServices();
    if (!svc) throw new Error("Firebase is not configured (demo mode).");
    await deleteDoc(doc(svc.db, "users", uid, "notes", id));
  }
}

/* ────────────────────────── Local backend ──────────────────────────── */

const LOCAL_KEY = (uid: string) => `notehybrid.notes.${uid}`;

function seedNotes(): Note[] {
  const now = Date.now();
  return [
    {
      id: "seed-welcome",
      title: "Welcome to NoteHybrid 👋",
      body:
        "NoteHybrid keeps your notes in sync AND thinks before it sends them anywhere.\n\n" +
        "• Short, private drafts are summarized on your own device (Gemini Nano in Chrome) — fast, offline, and nothing leaves the machine.\n" +
        "• Long documents are routed to the cloud model automatically.\n" +
        "• Every AI result shows an honest badge: where inference actually ran, and how long it took.\n\n" +
        "Try it: open a note and tap Summarize, Key points, Rewrite, or Translate.",
      pinned: true,
      archived: false,
      createdAt: now - 60_000,
      updatedAt: now - 60_000,
    },
    {
      id: "seed-ideas",
      title: "Ideas — weekend project",
      body:
        "Brainstorm for a small side project:\n" +
        "- A reading-list app that summarizes articles offline\n" +
        "- A travel journal that drafts captions on-device\n" +
        "- Meeting notes that extract action items before sync\n\n" +
        "Constraint: must work on a train with flaky signal. Hybrid inference fits perfectly.",
      pinned: false,
      archived: false,
      createdAt: now - 3_600_000,
      updatedAt: now - 3_600_000,
    },
  ];
}

class LocalNotesBackend implements NotesBackend {
  private listeners = new Map<string, Set<(notes: Note[]) => void>>();

  private load(uid: string): Note[] {
    try {
      const raw = localStorage.getItem(LOCAL_KEY(uid));
      if (raw) return JSON.parse(raw) as Note[];
    } catch {
      /* corrupted storage → reseed */
    }
    const seeded = seedNotes();
    this.save(uid, seeded);
    return seeded;
  }

  private save(uid: string, notes: Note[]) {
    try {
      localStorage.setItem(LOCAL_KEY(uid), JSON.stringify(notes));
    } catch {
      /* storage full/unavailable — in-memory state still works this session */
    }
  }

  private emit(uid: string) {
    const notes = this.load(uid);
    this.listeners.get(uid)?.forEach((cb) => cb(notes));
  }

  subscribe(uid: string, onNotes: (n: Note[]) => void) {
    if (!this.listeners.has(uid)) this.listeners.set(uid, new Set());
    this.listeners.get(uid)!.add(onNotes);
    onNotes(this.load(uid));
    return () => {
      this.listeners.get(uid)?.delete(onNotes);
    };
  }

  async create(uid: string, data: Omit<Note, "id">): Promise<string> {
    const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const notes = this.load(uid);
    notes.unshift({ id, ...data });
    this.save(uid, notes);
    this.emit(uid);
    return id;
  }

  async update(uid: string, id: string, patch: NotePatch): Promise<void> {
    const notes = this.load(uid).map((n) =>
      n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n,
    );
    this.save(uid, notes);
    this.emit(uid);
  }

  async remove(uid: string, id: string): Promise<void> {
    this.save(
      uid,
      this.load(uid).filter((n) => n.id !== id),
    );
    this.emit(uid);
  }
}

/** Pick the backend once, based on whether a real config is present. */
export const notesBackend: NotesBackend =
  getFirebaseServices() !== null
    ? new FirestoreNotesBackend()
    : new LocalNotesBackend();

export const usingLocalBackend = notesBackend instanceof LocalNotesBackend;
