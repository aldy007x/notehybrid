import { useStore } from "../lib/store";
import { remoteConfigString } from "../lib/firebase";
import type { RoutePreference } from "../lib/ai";
import { Modal, errorMessage } from "./ui";

const OPTIONS: { value: RoutePreference; label: string; hint: string }[] = [
  {
    value: "auto",
    label: "Auto (recommended)",
    hint: "Short notes prefer on-device; long documents prefer cloud.",
  },
  {
    value: "on-device",
    label: "Prefer on-device",
    hint: "Always try Gemini Nano first; fall back to cloud when unavailable.",
  },
  {
    value: "cloud",
    label: "Prefer cloud",
    hint: "Always try the cloud model first; fall back to on-device offline.",
  },
];

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const {
    user,
    demoMode,
    preferenceOverride,
    setPreferenceOverride,
    preference,
    onDeviceMaxChars,
    theme,
    toggleTheme,
    signOut,
    pushToast,
  } = useStore();

  const rcDefault = remoteConfigString("inference_preference", "auto");

  async function handleSignOut() {
    try {
      await signOut();
      onClose();
    } catch (err) {
      pushToast("error", errorMessage(err));
    }
  }

  return (
    <Modal title="Settings" onClose={onClose}>
      <section className="settings-section">
        <h3>Inference routing</h3>
        <p className="settings-note">
          Default policy comes from Firebase Remote Config
          (<code>inference_preference = "{rcDefault}"</code>, on-device
          threshold <code>{onDeviceMaxChars}</code> chars). A choice here is
          stored locally and overrides it on this device.
        </p>
        <div className="radio-group" role="radiogroup" aria-label="Inference preference">
          <label className="radio-row">
            <input
              type="radio"
              name="pref"
              checked={preferenceOverride === null}
              onChange={() => setPreferenceOverride(null)}
            />
            <span>
              <strong>Follow Remote Config</strong>
              <small>Currently resolves to “{preference}”.</small>
            </span>
          </label>
          {OPTIONS.map((o) => (
            <label key={o.value} className="radio-row">
              <input
                type="radio"
                name="pref"
                checked={preferenceOverride === o.value}
                onChange={() => setPreferenceOverride(o.value)}
              />
              <span>
                <strong>{o.label}</strong>
                <small>{o.hint}</small>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h3>Appearance</h3>
        <div className="settings-row">
          <span>Theme: {theme === "dark" ? "🌙 Dark" : "☀️ Light"}</span>
          <button className="btn btn-secondary" onClick={toggleTheme}>
            Switch to {theme === "dark" ? "light" : "dark"}
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3>Account</h3>
        <div className="settings-row">
          <span>
            {user?.isAnonymous
              ? "Guest (anonymous)"
              : (user?.email ?? "Signed out")}
            {demoMode ? " · demo mode (local data)" : ""}
          </span>
          <button className="btn btn-secondary" onClick={() => void handleSignOut()}>
            Sign out
          </button>
        </div>
      </section>
    </Modal>
  );
}
