import { useState } from "react";
import { useStore } from "../lib/store";
import { Spinner, errorMessage } from "./ui";

export function AuthScreen() {
  const { demoMode, signInEmail, signUpEmail, signInGuest, pushToast } =
    useStore();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy("email");
    try {
      if (mode === "signin") await signInEmail(email, password);
      else await signUpEmail(email, password);
      pushToast("success", mode === "signin" ? "Welcome back!" : "Account created — welcome!");
    } catch (err) {
      pushToast("error", errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleGuest() {
    setBusy("guest");
    try {
      await signInGuest();
      pushToast("info", "Signed in as guest. Your notes stay on this account only.");
    } catch (err) {
      pushToast("error", errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand brand-large">
          <span className="brand-mark">◐</span> NoteHybrid
        </div>
        <p className="auth-tagline">
          Notes that think locally first. Short, private drafts are processed
          on your device with Gemini Nano; long documents route to the cloud —
          automatically, with the route shown honestly on every result.
        </p>

        {demoMode ? (
          <div className="banner banner-demo">
            <strong>Demo mode.</strong> This build has a placeholder Firebase
            config, so notes are stored locally in your browser and AI
            features are disabled. Paste a real config into
            <code> src/firebase-config.ts </code>
            to enable sync + hybrid AI.
          </div>
        ) : (
          <form onSubmit={handleEmail} className="auth-form">
            <label>
              Email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                required
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={busy !== null}
            >
              {busy === "email" ? (
                <Spinner label="Please wait…" />
              ) : mode === "signin" ? (
                "Sign in"
              ) : (
                "Create account"
              )}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin"
                ? "New here? Create an account"
                : "Already have an account? Sign in"}
            </button>
          </form>
        )}

        <div className="auth-divider"><span>or</span></div>
        <button
          className="btn btn-secondary btn-block"
          onClick={handleGuest}
          disabled={busy !== null}
        >
          {busy === "guest" ? <Spinner label="Signing in…" /> : "Continue as guest"}
        </button>
        <p className="auth-footnote">
          Guest notes are stored under an anonymous account
          {demoMode ? " in this browser only" : " and sync like any account"}.
        </p>
      </div>
    </div>
  );
}
