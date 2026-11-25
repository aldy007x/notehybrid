import { useCallback, useEffect, useState } from "react";
import {
  checkOnDeviceAvailability,
  CLOUD_MODEL,
  type OnDeviceAvailability,
} from "../lib/ai";
import { useStore } from "../lib/store";
import { Spinner } from "./ui";

const AVAILABILITY_LABEL: Record<OnDeviceAvailability, string> = {
  available: "Gemini Nano is available on this browser",
  downloadable: "Gemini Nano can be downloaded (starts on first on-device request)",
  downloading: "Gemini Nano is downloading…",
  unavailable: "Gemini Nano is not available on this device/browser",
  unsupported: "Prompt API not detected — on-device needs Chrome 139+ on desktop",
};

/**
 * Hybrid status panel: honestly reports whether the on-device model is
 * usable in THIS browser, plus the active routing policy. Nothing here is
 * faked — if on-device is unavailable, the panel says so and AI badges will
 * show cloud fallback.
 */
export function HybridStatus() {
  const { demoMode, preference, onDeviceMaxChars } = useStore();
  const [availability, setAvailability] =
    useState<OnDeviceAvailability | null>(null);
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      setAvailability(await checkOnDeviceAvailability());
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onDeviceUsable = availability === "available";
  return (
    <section className="status-card" aria-label="Hybrid inference status">
      <div className="status-head">
        <h3>Hybrid status</h3>
        <button
          className="icon-btn"
          onClick={() => void refresh()}
          aria-label="Re-check on-device availability"
          title="Re-check on-device availability"
        >
          ↻
        </button>
      </div>
      <div className="status-row">
        <span
          className={`dot ${onDeviceUsable ? "dot-on" : "dot-off"}`}
          aria-hidden="true"
        />
        {checking || availability === null ? (
          <Spinner label="Checking on-device model…" />
        ) : (
          <span>{AVAILABILITY_LABEL[availability]}</span>
        )}
      </div>
      <dl className="status-grid">
        <div>
          <dt>Routing</dt>
          <dd>
            {preference === "auto"
              ? `Auto (< ${onDeviceMaxChars} chars → device, else cloud)`
              : preference === "on-device"
                ? "Prefer on-device"
                : "Prefer cloud"}
          </dd>
        </div>
        <div>
          <dt>Cloud model</dt>
          <dd>{CLOUD_MODEL} via Firebase AI Logic</dd>
        </div>
        <div>
          <dt>Fallback</dt>
          <dd>Automatic, both directions</dd>
        </div>
      </dl>
      {demoMode && (
        <p className="status-note">
          Demo mode: AI calls are disabled until a real Firebase config is
          added.
        </p>
      )}
      {!onDeviceUsable && availability !== null && !demoMode && (
        <p className="status-note">
          On-device requests will be served by the cloud fallback — result
          badges will say so.
        </p>
      )}
    </section>
  );
}
