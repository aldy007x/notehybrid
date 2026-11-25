import type { ReactNode } from "react";
import { InferenceMode } from "firebase/ai";
import { useStore } from "../lib/store";
import type { AiRunResult } from "../lib/ai";

/* ── Toasts ─────────────────────────────────────────────────────────── */
export function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          className={`toast toast-${t.kind}`}
          onClick={() => dismissToast(t.id)}
        >
          {t.kind === "success" ? "✓ " : t.kind === "error" ? "⚠ " : "ℹ "}
          {t.message}
        </button>
      ))}
    </div>
  );
}

/* ── Spinner ────────────────────────────────────────────────────────── */
export function Spinner({ label }: { label?: string }) {
  return (
    <span className="spinner-wrap">
      <span className="spinner" aria-hidden="true" />
      {label ? <span>{label}</span> : null}
    </span>
  );
}

/* ── Route badge: where inference ACTUALLY ran ──────────────────────── */
/**
 * Honest routing badge. The label is driven by the SDK-reported
 * `inferenceSource` (AiRunResult.actualRoute), never by what we requested:
 * a PREFER_ON_DEVICE request that fell back is shown as cloud fallback.
 */
export function RouteBadge({ result }: { result: AiRunResult }) {
  const requested =
    result.requestedMode === InferenceMode.PREFER_ON_DEVICE
      ? "on-device"
      : "cloud";
  let label: string;
  let cls: string;
  if (result.actualRoute === "ON_DEVICE") {
    label = "On-device";
    cls = "badge-device";
  } else if (result.actualRoute === "IN_CLOUD") {
    label = result.fellBackToCloud ? "Cloud · fallback" : "Cloud";
    cls = "badge-cloud";
  } else {
    label = `Route unreported (asked: ${requested})`;
    cls = "badge-unknown";
  }
  return (
    <span className="route-badge-wrap">
      <span className={`badge ${cls}`}>{label}</span>
      <span className="badge badge-latency">{result.latencyMs} ms</span>
    </span>
  );
}

/* ── Modal ──────────────────────────────────────────────────────────── */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/** Friendly message for Firebase/AI errors. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as { code?: string }).code ?? "";
    if (code.includes("auth/invalid-credential") || code.includes("auth/wrong-password"))
      return "Incorrect email or password.";
    if (code.includes("auth/email-already-in-use"))
      return "That email is already registered — try signing in.";
    if (code.includes("auth/weak-password"))
      return "Password should be at least 6 characters.";
    if (code.includes("auth/invalid-email")) return "That email looks invalid.";
    if (code.includes("ai/") || err.message.toLowerCase().includes("on-device"))
      return `AI request failed: ${err.message}`;
    return err.message;
  }
  return String(err);
}
