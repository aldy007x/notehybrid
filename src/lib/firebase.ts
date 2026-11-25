/**
 * Firebase service initialization for NoteHybrid.
 *
 * Everything here is guarded by `isFirebaseConfigured` (see
 * src/firebase-config.ts). When the config is still a placeholder the app
 * runs in demo mode and NONE of the Firebase services are initialized —
 * the data/AI layers fall back to local implementations instead.
 */
import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from "firebase/app-check";
import { getAuth, type Auth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import {
  getRemoteConfig,
  fetchAndActivate,
  getString,
  type RemoteConfig,
} from "firebase/remote-config";
import {
  firebaseConfig,
  appCheckSiteKey,
  isFirebaseConfigured,
} from "../firebase-config";

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  remoteConfig: RemoteConfig;
  appCheck: AppCheck | null;
}

let services: FirebaseServices | null = null;
let initAttempted = false;

/**
 * Initialize Firebase exactly once. Returns null in demo mode
 * (placeholder config) so callers can fall back gracefully.
 */
export function getFirebaseServices(): FirebaseServices | null {
  if (!isFirebaseConfigured) return null;
  if (services) return services;
  if (initAttempted) return null; // a previous attempt failed; stay in demo mode
  initAttempted = true;

  try {
    const app = initializeApp(firebaseConfig);

    // ── App Check ──────────────────────────────────────────────────────
    // Firebase AI Logic requires App Check (enforced automatically by the
    // AI Logic setup workflow in the console).
    //
    // Debug tokens (SDK v13 behavior, verified in @firebase/app-check):
    // there is no exported DebugProvider anymore. If the environment set
    // `self.FIREBASE_APPCHECK_DEBUG_TOKEN` (a token string, or `true`)
    // BEFORE initializeAppCheck runs, the SDK internally switches to
    // debug mode and the provider below returns the debug token instead
    // of performing reCAPTCHA attestation. So local development only
    // needs that global set (see README) — the
    // ReCaptchaEnterpriseProvider is still the provider we register
    // (the console registered this app with the reCAPTCHA Enterprise /
    // Fraud Defense provider), and its site key is never used in
    // debug mode.
    //
    // Any failure here must NOT crash the app — App Check simply stays
    // uninitialized and AI calls will surface their own errors.
    let appCheck: AppCheck | null = null;
    try {
      const debugToken = (
        self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }
      ).FIREBASE_APPCHECK_DEBUG_TOKEN;
      const debugMode = debugToken !== undefined && debugToken !== false;
      if (debugMode || appCheckSiteKey) {
        appCheck = initializeAppCheck(app, {
          provider: new ReCaptchaEnterpriseProvider(
            appCheckSiteKey || "debug-mode-no-site-key",
          ),
          isTokenAutoRefreshEnabled: true,
        });
        if (debugMode) {
          console.info(
            "[NoteHybrid] App Check running in debug-token mode " +
              "(FIREBASE_APPCHECK_DEBUG_TOKEN is set).",
          );
        }
      } else {
        console.info(
          "[NoteHybrid] App Check not initialized: no debug token and no " +
            "reCAPTCHA site key configured (see src/firebase-config.ts).",
        );
      }
    } catch (err) {
      console.warn("[NoteHybrid] App Check initialization failed:", err);
      appCheck = null;
    }

    const auth = getAuth(app);

    // Firestore with offline persistence (multi-tab safe local cache), so
    // notes keep working on flaky connections and sync when back online.
    // Docs: https://firebase.google.com/docs/firestore/manage-data/enable-offline
    const db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });

    // ── Remote Config ──────────────────────────────────────────────────
    // Defaults are provided in code; the console can override them without
    // an app update. Local user overrides (Settings screen) win over these.
    const remoteConfig = getRemoteConfig(app);
    remoteConfig.settings.minimumFetchIntervalMillis = 60_000;
    remoteConfig.defaultConfig = {
      // "auto" | "on-device" | "cloud" — default inference routing policy.
      inference_preference: "auto",
      // Notes shorter than this (chars) prefer on-device inference in auto mode.
      ai_on_device_max_chars: "1500",
    };
    // Fire-and-forget: defaults apply immediately if the fetch fails.
    void fetchAndActivate(remoteConfig).catch(() => undefined);

    services = { app, auth, db, remoteConfig, appCheck };
    return services;
  } catch (err) {
    console.error("[NoteHybrid] Firebase initialization failed:", err);
    return null;
  }
}

/** Read a string value from Remote Config (falls back to `fallback`). */
export function remoteConfigString(key: string, fallback: string): string {
  const svc = getFirebaseServices();
  if (!svc) return fallback;
  try {
    return getString(svc.remoteConfig, key) || fallback;
  } catch {
    return fallback;
  }
}
