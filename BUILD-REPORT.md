# NoteHybrid — Build Report

**Status: ✅ Production build passes.** `npm install` + `npm run build`
(`tsc --noEmit && vite build`) succeed in this sandbox; `dist/` is produced
and was smoke-tested with `vite preview` (index served; bundle verified to
contain the AI layer).

## What was built

A complete web app (Vite + React 19 + TypeScript, modular Firebase JS SDK
v13.4.0) implementing "NoteHybrid": notes whose AI runs hybrid via Firebase
AI Logic — on-device (Gemini Nano via Chrome Prompt API) for short/private
work, cloud for long work, automatic fallback both ways, and an honest
route badge on every result.

| Area | Implementation |
|---|---|
| Auth | Email/password + anonymous guest (`firebase/auth`); local guest session in demo mode |
| Notes | Full CRUD in Firestore at `users/{uid}/notes` with **offline persistence** (`persistentLocalCache` + multi-tab manager); search, pin/archive, debounced autosave; localStorage backend with seeded sample notes in demo mode |
| AI actions | Summarize, Key points, Rewrite & expand, Translate ID↔EN (auto-detect) — routing: `< 1500 chars → PREFER_ON_DEVICE`, else `PREFER_IN_CLOUD` (threshold + default preference from Remote Config) |
| Route honesty | Badge driven by SDK-reported `result.response.inferenceSource` (`ON_DEVICE`/`IN_CLOUD`) + measured latency; explicit "Cloud · fallback" state and explanatory note when an on-device request was served by cloud |
| Hybrid status panel | Live `LanguageModel.availability()` check (Chrome Prompt API, per the official guide) with refresh; shows routing policy + cloud model; states plainly when on-device is unavailable |
| Ask my notes | Stateless streaming Q&A (`generateContentStream`, `PREFER_IN_CLOUD`) with note titles+bodies as bounded context and prior turns embedded in the prompt (on-device is single-turn only, so no `startChat` for hybrid) |
| Settings | Inference preference override (Auto / Prefer on-device / Prefer cloud / Follow Remote Config) — Remote Config defaults `inference_preference`, `ai_on_device_max_chars`; local override in localStorage wins |
| App Check | `initializeAppCheck` + `ReCaptchaV3Provider`, debug-token aware (see surprise #1), fully try/catch wrapped |
| Design | Hand-rolled CSS variables, dark mode (persisted, system-aware), empty/loading states, error toasts, responsive layout |
| Demo mode | Placeholder config ⇒ no Firebase init, local notes, guest session, AI disabled with explanatory banners. Dropping in a real config flips everything live with zero code changes |

## Where the real Firebase config goes

**One file only:** `src/firebase-config.ts`

- Replace the `firebaseConfig` object's placeholder values with the web app
  config from Firebase console → Project settings → General → Your apps.
- Optionally set `appCheckSiteKey` (reCAPTCHA v3 site key) in the same file
  for production App Check. For local dev, setting
  `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` in the browser console before
  load is enough (register the printed token in the console).

Console-side setup the parent still needs to do (browser work, not done
here): create the project, run the AI Logic "Get started" workflow (Gemini
Developer API), enable Auth providers (Email/Password + Anonymous), create
Firestore, register the web app + App Check, apply the suggested Firestore
rules from the README.

## API-surface surprises vs the docs (verified against installed SDK 13.4.0)

1. **`DebugProvider` no longer exists.** The hybrid/App Check docs still
   describe a debug provider class, but `firebase/app-check` v13.4.0 does
   not export it. Inspecting the shipped `@firebase/app-check` bundle shows
   debug mode is now **internal and automatic**: if
   `self.FIREBASE_APPCHECK_DEBUG_TOKEN` is set before `initializeAppCheck`,
   the registered provider's `getToken()` short-circuits to the debug
   token. The code therefore always registers `ReCaptchaV3Provider` and
   just detects/logs the debug global. (Matches the task instruction to use
   ReCaptchaV3Provider.)
2. **Hybrid model creation omits the top-level `model` name.** Per the
   current hybrid docs + types (`HybridModelParams`), you pass
   `{ mode: InferenceMode.*, inCloudParams: { model: "gemini-2.5-flash-lite" } }`.
   The documented default cloud fallback is `gemini-3.5-flash-lite`
   (SDK ≥ 13.0.0); we pin `gemini-2.5-flash-lite` explicitly via
   `inCloudParams` for predictability.
3. **`inferenceSource` is real and typed** (`GenerateContentResponse.inferenceSource?: InferenceSource`,
   values `ON_DEVICE` / `IN_CLOUD`, SDK ≥ 12.5.0) — the badge uses it
   verbatim, so fallback is never hidden.
4. **`initializeDeviceModel()` returns `Promise<void>`** in v13 (the guide
   shows it fire-and-forget). The code attaches a `.catch()` so a rejection
   on non-Chrome browsers can never surface as an unhandled rejection, and
   only calls it once per session, from click handlers (user-activation
   requirement).
5. **On-device = single-turn only** (docs): multi-turn chat and tools are
   cloud-only capabilities. "Ask my notes" is therefore implemented as
   stateless streaming requests with history in the prompt, not `startChat`.

## Honest gaps

- **Not yet run against a real Firebase project** — no config exists yet
  (parent's browser step). All Firebase paths are type-checked and built,
  but live Auth/Firestore/AI behavior (incl. actual on-device inference in
  Chrome 139+ with the Prompt API flag) is unverified until the config is
  pasted in and the app is opened in a desktop Chrome.
- Screenshots section in README is placeholder (needs the live app).
- One JS chunk ≈ 984 kB (gzip ≈ 297 kB) — standard for the full Firebase
  SDK; Vite prints a chunk-size warning. Cosmetic; code-splitting is a
  post-hackathon optimization.
- Firestore security rules are provided in the README but not deployed
  (no `firestore.rules` file / firebase.json, since hosting/rules deploy is
  the parent's console step).

## Key files

- `src/firebase-config.ts` — **paste real config here**
- `src/lib/ai.ts` — hybrid routing layer (doc links in comments)
- `src/lib/firebase.ts` — service init incl. App Check + Remote Config
- `src/lib/notes.ts` — Firestore/local data layer
- `src/lib/store.tsx` — app state
- `src/components/` — AuthScreen, NoteList, NoteEditor, AskNotes,
  HybridStatus, SettingsModal, ui
- `README.md` — pitch, mermaid architecture diagram, full setup guide
- `LICENSE` — Apache-2.0

---

## Release prep — real config wired (2026-11-25)

- **Config:** real Firebase web config for project `notehybrid-8db3f`
  pasted into `src/firebase-config.ts` (only the config object changed;
  file structure/comments untouched). No code anywhere else needed changes.
- **Demo-mode check:** `isFirebaseConfigured` keys off `YOUR_` prefixes in
  apiKey/projectId/appId — with the real values it evaluates `true`, so
  `demoMode` in `src/lib/store.tsx` is `false` and Firebase initializes for
  real. Verified in the production bundle: `notehybrid-8db3f` present,
  `YOUR_API_KEY` absent. **No fix to the detection logic was needed.**
- **Build:** `npm run build` (`tsc --noEmit && vite build`) ✅ PASS with
  the real config (53 modules; same cosmetic >500 kB chunk warning as
  before — Firebase SDK weight).
- **Firestore rules:** `firestore.rules` now exists at the repo root
  (owner-only access to `users/{uid}/notes/{noteId}`); the parent
  publishes it via the console. (This supersedes the "no firestore.rules
  file" note in the gaps section above.)
- **Smoke test** (`scripts/smoke.mjs`, Node, project's firebase 13.4.0):
  - sign-in-anonymously — ✅ PASS (uid issued; Auth + Anonymous provider
    confirmed live against the real project)
  - write-note — ❌ FAIL `permission-denied` (Firestore code 7
    PERMISSION_DENIED: Missing or insufficient permissions)
  - read-note — ❌ FAIL `permission-denied`
  - delete-note — ❌ FAIL `permission-denied`
  - sign-out — ✅ PASS
  - Interpretation: the write/read/delete failures are the expected
    "rules not yet published" state (default production-mode rules deny
    all client access) — **not** a config error, since anonymous auth
    against the same config/project succeeds. Re-run `node
    scripts/smoke.mjs` after the rules are published; all steps should
    pass.
- **Git:** repo initialized locally (not pushed), `.gitignore` verified
  (node_modules/dist/.env excluded), README gained a "Live demo"
  placeholder line, **28 files staged** and ready for the parent's push.
