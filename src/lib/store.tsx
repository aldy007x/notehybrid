/**
 * NoteHybrid application store (React context).
 *
 * Owns: auth session, notes subscription, inference-routing settings
 * (Remote Config defaults + local override), theme, and toasts.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { getFirebaseServices, remoteConfigString } from "./firebase";
import { isFirebaseConfigured } from "../firebase-config";
import {
  notesBackend,
  sortNotes,
  type Note,
  type NotePatch,
} from "./notes";
import type { RoutePreference } from "./ai";

export interface SessionUser {
  uid: string;
  email: string | null;
  isAnonymous: boolean;
}

export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  message: string;
}

type Theme = "light" | "dark";

interface Store {
  demoMode: boolean;
  authReady: boolean;
  user: SessionUser | null;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string) => Promise<void>;
  signInGuest: () => Promise<void>;
  signOut: () => Promise<void>;

  notes: Note[];
  notesLoading: boolean;
  createNote: () => Promise<string>;
  updateNote: (id: string, patch: NotePatch) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;

  /** Local override (Settings). null = follow Remote Config. */
  preferenceOverride: RoutePreference | null;
  setPreferenceOverride: (p: RoutePreference | null) => void;
  /** Effective routing preference after override/Remote Config resolution. */
  preference: RoutePreference;
  onDeviceMaxChars: number;

  theme: Theme;
  toggleTheme: () => void;

  toasts: Toast[];
  pushToast: (kind: Toast["kind"], message: string) => void;
  dismissToast: (id: number) => void;
}

const Ctx = createContext<Store | null>(null);

const PREF_KEY = "notehybrid.preferenceOverride";
const THEME_KEY = "notehybrid.theme";
const DEMO_USER_KEY = "notehybrid.demoUser";

function toSessionUser(u: User): SessionUser {
  return { uid: u.uid, email: u.email, isAnonymous: u.isAnonymous };
}

function validPreference(v: string): RoutePreference {
  return v === "on-device" || v === "cloud" ? v : "auto";
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const demoMode = !isFirebaseConfigured;
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const [preferenceOverride, setPreferenceOverrideState] =
    useState<RoutePreference | null>(() => {
      const raw = localStorage.getItem(PREF_KEY);
      return raw === "auto" || raw === "on-device" || raw === "cloud"
        ? (raw as RoutePreference)
        : null;
    });

  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  /* ── toasts ─────────────────────────────────────────────────────── */
  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);
  const pushToast = useCallback(
    (kind: Toast["kind"], message: string) => {
      const id = ++toastId.current;
      setToasts((t) => [...t.slice(-3), { id, kind, message }]);
      window.setTimeout(() => dismissToast(id), 4200);
    },
    [dismissToast],
  );

  /* ── theme ──────────────────────────────────────────────────────── */
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);
  const toggleTheme = useCallback(
    () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    [],
  );

  /* ── auth session ───────────────────────────────────────────────── */
  useEffect(() => {
    const svc = getFirebaseServices();
    if (!svc) {
      // Demo mode: restore a persisted local guest session, if any.
      try {
        const raw = localStorage.getItem(DEMO_USER_KEY);
        if (raw) setUser(JSON.parse(raw) as SessionUser);
      } catch {
        /* ignore */
      }
      setAuthReady(true);
      return;
    }
    const unsub = onAuthStateChanged(svc.auth, (u) => {
      setUser(u ? toSessionUser(u) : null);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  const signInEmail = useCallback(async (email: string, password: string) => {
    const svc = getFirebaseServices();
    if (!svc) throw new Error("Demo mode: use guest sign-in.");
    await signInWithEmailAndPassword(svc.auth, email.trim(), password);
  }, []);

  const signUpEmail = useCallback(async (email: string, password: string) => {
    const svc = getFirebaseServices();
    if (!svc) throw new Error("Demo mode: use guest sign-in.");
    await createUserWithEmailAndPassword(svc.auth, email.trim(), password);
  }, []);

  const signInGuest = useCallback(async () => {
    const svc = getFirebaseServices();
    if (!svc) {
      const guest: SessionUser = {
        uid: "demo-guest",
        email: null,
        isAnonymous: true,
      };
      localStorage.setItem(DEMO_USER_KEY, JSON.stringify(guest));
      setUser(guest);
      return;
    }
    await signInAnonymously(svc.auth);
  }, []);

  const signOut = useCallback(async () => {
    const svc = getFirebaseServices();
    if (!svc) {
      localStorage.removeItem(DEMO_USER_KEY);
      setUser(null);
      return;
    }
    await fbSignOut(svc.auth);
  }, []);

  /* ── notes subscription ─────────────────────────────────────────── */
  useEffect(() => {
    if (!user) {
      setNotes([]);
      return;
    }
    setNotesLoading(true);
    const unsub = notesBackend.subscribe(
      user.uid,
      (list) => {
        setNotes(sortNotes(list));
        setNotesLoading(false);
      },
      (err) => {
        setNotesLoading(false);
        pushToast("error", `Could not load notes: ${err.message}`);
      },
    );
    return unsub;
  }, [user, pushToast]);

  const createNote = useCallback(async (): Promise<string> => {
    if (!user) throw new Error("Not signed in.");
    const now = Date.now();
    return notesBackend.create(user.uid, {
      title: "",
      body: "",
      pinned: false,
      archived: false,
      createdAt: now,
      updatedAt: now,
    });
  }, [user]);

  const updateNote = useCallback(
    async (id: string, patch: NotePatch) => {
      if (!user) return;
      await notesBackend.update(user.uid, id, patch);
    },
    [user],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      if (!user) return;
      await notesBackend.remove(user.uid, id);
    },
    [user],
  );

  /* ── inference settings ─────────────────────────────────────────── */
  const setPreferenceOverride = useCallback((p: RoutePreference | null) => {
    setPreferenceOverrideState(p);
    if (p === null) localStorage.removeItem(PREF_KEY);
    else localStorage.setItem(PREF_KEY, p);
  }, []);

  // Remote Config supplies the default policy; the local override wins.
  const preference: RoutePreference =
    preferenceOverride ??
    validPreference(remoteConfigString("inference_preference", "auto"));
  const onDeviceMaxChars =
    parseInt(remoteConfigString("ai_on_device_max_chars", "1500"), 10) || 1500;

  const value = useMemo<Store>(
    () => ({
      demoMode,
      authReady,
      user,
      signInEmail,
      signUpEmail,
      signInGuest,
      signOut,
      notes,
      notesLoading,
      createNote,
      updateNote,
      deleteNote,
      preferenceOverride,
      setPreferenceOverride,
      preference,
      onDeviceMaxChars,
      theme,
      toggleTheme,
      toasts,
      pushToast,
      dismissToast,
    }),
    [
      demoMode,
      authReady,
      user,
      signInEmail,
      signUpEmail,
      signInGuest,
      signOut,
      notes,
      notesLoading,
      createNote,
      updateNote,
      deleteNote,
      preferenceOverride,
      setPreferenceOverride,
      preference,
      onDeviceMaxChars,
      theme,
      toggleTheme,
      toasts,
      pushToast,
      dismissToast,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
