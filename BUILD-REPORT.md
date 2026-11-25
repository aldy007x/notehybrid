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
   **[SUPERSEDED 2026-11-25 — see the fix addendum at the end of this
   file: the `gemini-2.5-flash-lite` pin was replaced with
   `gemini-3.5-flash-lite` after live testing showed the older model is
   no longer available to new users.]**
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


---

## Release addendum — 2026-11-25 (App Check key, smoke, GitHub Pages)

### App Check site key + provider class
- `appCheckSiteKey` in `src/firebase-config.ts` now holds the real site key
  from the console registration (`6LcskTEuAAAAAIBMA0fbxUXN71NXtLokQRtpe7yT`,
  public site key, safe to commit).
- **Deviation, deliberate:** the console registered the web app with the
  reCAPTCHA Enterprise (Fraud Defense) provider, but the code constructed a
  `ReCaptchaV3Provider`. Enterprise keys are served by the reCAPTCHA
  Enterprise JS API and attested via `ReCaptchaEnterpriseProvider`; a v3
  provider constructed with an Enterprise key would fail attestation, and
  AI Logic App Check enforcement is "Basic - Enforced", so this would have
  broken every AI call in production. `src/lib/firebase.ts` now constructs
  `ReCaptchaEnterpriseProvider` with the same key. Debug-token behavior is
  unchanged (SDK v13 handles debug mode internally when
  `self.FIREBASE_APPCHECK_DEBUG_TOKEN` is set, regardless of provider
  class), and the try/catch no-crash guard is untouched.

### Smoke test (Firestore rules published)
`node scripts/smoke.mjs` — **ALL PASS**:
- PASS sign-in-anonymously
- PASS write-note (`users/<uid>/notes/smoke-test`)
- PASS read-note (data matches)
- PASS delete-note
- PASS sign-out

### Vite base path
- `vite.config.ts`: `base: process.env.VITE_BASE ?? "/"`. Local builds stay
  at `/` (verified: rebuilt `dist/index.html` references `/assets/...`);
  Pages builds use `VITE_BASE=/notehybrid/` (verified: asset path
  `/notehybrid/assets/...`).

### GitHub repo
- Created and pushed: **https://github.com/aldy007x/notehybrid** (public,
  Apache-2.0 LICENSE detected from repo root). `main` branch pushed
  (29 files; node_modules/dist excluded by .gitignore).

### GitHub Pages — workflow route BLOCKED, legacy route LIVE
- The Actions workflow (`.github/workflows/deploy-pages.yml`: checkout,
  Node 20, `npm ci`, build with `VITE_BASE=/notehybrid/`,
  upload-pages-artifact, deploy-pages) was written as specified, but the
  push was rejected by GitHub:
  `refusing to allow an OAuth App to create or update workflow
  .github/workflows/deploy-pages.yml without workflow scope`.
  The sandbox `gh` OAuth token lacks the `workflow` scope (same wall hit
  earlier with the Mergify OIDC probe). Unblock: `gh auth refresh -s
  workflow` (interactive, needs the user in a browser), then push the file
  (it is present in the local tree, untracked) and optionally switch Pages
  `build_type` to `workflow`.
- Fallback used instead: built locally with `VITE_BASE=/notehybrid/` and
  pushed the built site to a `gh-pages` branch (with `.nojekyll`). The
  explicit `POST /pages` enable call returned HTTP 409 "GitHub Pages is
  already enabled" because the `gh-pages` push had auto-enabled Pages with
  exactly the intended config: `build_type: legacy`,
  `source: {branch: "gh-pages", path: "/"}`.
- Pages build status reached **built**; live verification:
  `https://aldy007x.github.io/notehybrid/` → HTTP 200, title
  "NoteHybrid — notes that think locally first", JS bundle asset → HTTP 200.
- README "Live demo" line now points at the live URL (commit `8514ade`,
  pushed to `main`). Note: because Pages currently serves the `gh-pages`
  branch (not `main`), future deploys = rebuild with
  `VITE_BASE=/notehybrid/` and force-push `dist/` to `gh-pages` until the
  workflow route is unblocked.

---

## Fix addendum — 2026-11-25 (cloud model retirement: 2.5 → 3.5 flash-lite)

### Problem (found by the live end-to-end test)
Every cloud AI call returned HTTP 404. Auth, Firestore CRUD, App Check
attestation, routing and the UI all passed in the automated-browser test;
the single broken link was the pinned cloud model. Google's error:
`gemini-2.5-flash-lite` is "no longer available to new users" and directs
callers to `gemini-3.5-flash-lite` (which is also the documented default
cloud fallback for SDK ≥ 13.0.0 — see API-surprise note 2 above, now
annotated as superseded).

### Change
- `src/lib/ai.ts`: `CLOUD_MODEL = "gemini-3.5-flash-lite"`. This constant
  is the single source of truth — it feeds every `inCloudParams.model`
  (single-turn prompts + "Ask my notes" streaming) and the Hybrid status
  panel's cloud-model display in `src/components/HybridStatus.tsx`, so
  the AI layer and UI strings moved together with this one edit.
- `README.md`: architecture rule 1 now names `gemini-3.5-flash-lite`.
- Remote Config defaults contain no model name (only
  `inference_preference` / `ai_on_device_max_chars`) — nothing to change.
- Tree-wide grep for `2.5-flash` / `flash-lite`: the only remaining
  `gemini-2.5-flash-lite` mentions are the historical notes in this file,
  annotated SUPERSEDED rather than rewritten.

### Build + deploy
- `npm run build` (default base `/`): PASS (tsc --noEmit + vite build).
- Pages build: `VITE_BASE=/notehybrid/ npm run build` → PASS.
- Source committed + pushed to `main` (commit `b31a90d`).
- `dist/` (with `.nojekyll`) force-pushed to `gh-pages`
  (`16a34ef` → `05acd5a`), same legacy route as the release.

### Live verification (https://aldy007x.github.io/notehybrid/)
- Before: `assets/index-wd5rZzeN.js` — contained `gemini-2.5-flash-lite` ×1.
- After: `assets/index-ClV-ZKJl.js` — asset name/hash changed, index
  HTTP 200, fetched bundle contains `gemini-3.5-flash-lite` ×1 and
  `gemini-2.5-flash-lite` ×0.

---

## Fix addendum — 2026-11-25 (route badge: inferenceSource enum-case bug + derivation fallback)

### Problem (found by the live retest)
All AI actions worked live, but every route badge read
"Route unreported (asked: on-device)" / "(asked: cloud)".

### Root cause — a plain bug, not an absent field
`inferenceSource` IS populated by the SDK on every response
(`createEnhancedContentResponse` sets it unconditionally, defaulting to
IN_CLOUD; the streaming path threads it into the aggregated
`streamResult.response`, which is exactly where the code reads it — both
read sites were verified correct against the shipped `@firebase/ai`
bundle and type definitions). The bug was in `actualRouteOf()` in
`src/lib/ai.ts`: it compared the value against the uppercase literals
`"ON_DEVICE"` / `"IN_CLOUD"`, but the SDK's `InferenceSource` wire values
are **lowercase** — `ON_DEVICE: "on_device"`, `IN_CLOUD: "in_cloud"`
(`ai-public.d.ts`). The comparison never matched, so every result
silently degraded to UNKNOWN. (This also corrects API-surprise note 3
above, which repeated the uppercase values.) Fix: compare against the
imported `InferenceSource` enum constants.

### Derivation fallback (defense in depth)
If a future browser/SDK combination ever leaves `inferenceSource`
unreported after a successful call, the badge no longer gives up. New
`deriveRouteDisplay()` in `src/lib/ai.ts` (used by `RouteBadge` in
`src/components/ui.tsx`) applies, in order:
1. SDK-reported source wins, exactly as before (ON_DEVICE → "On-device";
   IN_CLOUD + asked on-device → "Cloud · fallback"; IN_CLOUD + asked
   cloud → "Cloud").
2. Unreported + asked cloud → "Cloud".
3. Unreported + asked on-device + the `LanguageModel.availability()`
   probe (same probe as the Hybrid status panel, captured right after
   the call into `AiRunResult.onDeviceAvailability`) says
   unavailable/unsupported → "Cloud · fallback (on-device unavailable on
   this device)" — the device provably could not have served it, and
   `fellBackToCloud` is set so the explanatory note shows too.
4. Unreported + asked on-device + device model available →
   "On-device (unconfirmed)" — never more than the evidence supports.
The full evidentiary rationale is documented in a comment block above
`deriveRouteDisplay`.

### Panel copy
`HybridStatus.tsx`: the fallback note now names the badge it promises —
"…result badges will show “Cloud · fallback”" — which is true again.

### Build + deploy
- `npm run build` (default base `/`): PASS.
- `VITE_BASE=/notehybrid/ npm run build`: PASS; `dist/` + `.nojekyll`
  force-pushed to `gh-pages` (legacy route, as before).
- Source committed + pushed to `main`.

### Live verification (https://aldy007x.github.io/notehybrid/)
- Before: `assets/index-ClV-ZKJl.js`.
- After: `assets/index-DCV9H1S2.js` — asset name/hash changed, index
  HTTP 200, fetched live bundle contains
  `Cloud · fallback (on-device unavailable` ×1 and
  `On-device (unconfirmed)` ×1.
- Expected live behavior now: in a browser without Gemini Nano (e.g. the
  cloud test Chromium), an on-device-asked action shows "Cloud · fallback"
  (SDK-reported IN_CLOUD); a cloud-asked action shows "Cloud".
