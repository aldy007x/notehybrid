/**
 * NoteHybrid AI layer — hybrid inference via Firebase AI Logic.
 *
 * Every call follows the official "Build hybrid experiences in Web apps"
 * guide: https://firebase.google.com/docs/ai-logic/hybrid/web/get-started
 * and its configuration-options companion page:
 * https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options
 *
 * Key API facts (verified against those pages, Firebase JS SDK ≥ 12.5.0):
 *   • `getAI(app, { backend: new GoogleAIBackend() })` initializes the
 *     Gemini Developer API backend.
 *   • `getGenerativeModel(ai, { mode: InferenceMode.*, inCloudParams })`
 *     creates a hybrid model. `mode` selects the routing preference.
 *   • `model.initializeDeviceModel(cb)` must be called after a user
 *     interaction and before the first prompt request.
 *   • `result.response.inferenceSource` reports where inference ACTUALLY
 *     ran. Its wire values are the lowercase `InferenceSource.ON_DEVICE`
 *     ("on_device") / `InferenceSource.IN_CLOUD` ("in_cloud") — always
 *     compare against the enum, never against uppercase literals. We
 *     display this honestly in the UI — a requested on-device route that
 *     fell back is shown as cloud. When the SDK leaves the source
 *     unreported, the badge falls back to a probe-based derivation (see
 *     `deriveRouteDisplay`).
 *   • On-device inference is single-turn only (no multi-turn chat), so the
 *     "Ask my notes" feature sends stateless streaming requests with the
 *     conversation history embedded in the prompt, via PREFER_IN_CLOUD.
 */
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
  type GenerativeModel,
} from "firebase/ai";
import { getFirebaseServices } from "./firebase";

/** Cloud model used whenever a request is served (or falls back) to cloud. */
export const CLOUD_MODEL = "gemini-3.5-flash-lite";

/** User-facing routing preference (Settings screen / Remote Config). */
export type RoutePreference = "auto" | "on-device" | "cloud";

/** Where a request actually ran, as reported by the SDK. */
export type ActualRoute = "ON_DEVICE" | "IN_CLOUD" | "UNKNOWN";

export interface AiRunResult {
  text: string;
  /** The InferenceMode we requested from the SDK. */
  requestedMode: InferenceMode;
  /** Where the SDK says inference actually ran. */
  actualRoute: ActualRoute;
  /**
   * On-device availability probed right after the call, but ONLY when the
   * SDK left `actualRoute` UNKNOWN — it feeds the badge derivation in
   * `deriveRouteDisplay`. Null when the SDK reported a route (no probe
   * needed) or the probe has not run.
   */
  onDeviceAvailability: OnDeviceAvailability | null;
  /** True when we asked for on-device but the call was served from cloud. */
  fellBackToCloud: boolean;
  latencyMs: number;
  model: string;
}

/** Chrome Prompt API availability states (plus our own guards). */
export type OnDeviceAvailability =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable"
  | "unsupported";

/**
 * Check whether Gemini Nano is available in this browser, using the Chrome
 * Prompt API exactly as the Firebase hybrid guide prescribes
 * (`await LanguageModel.availability()`).
 */
export async function checkOnDeviceAvailability(): Promise<OnDeviceAvailability> {
  const lm = (
    globalThis as unknown as {
      LanguageModel?: { availability: () => Promise<string> };
    }
  ).LanguageModel;
  if (!lm || typeof lm.availability !== "function") return "unsupported";
  try {
    const status = await lm.availability();
    if (
      status === "available" ||
      status === "downloadable" ||
      status === "downloading" ||
      status === "unavailable"
    ) {
      return status;
    }
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

/**
 * Routing rule (auto mode): short, private-feeling work prefers the device;
 * long documents prefer the cloud. Explicit user preference always wins.
 */
export function resolveInferenceMode(
  inputChars: number,
  preference: RoutePreference,
  onDeviceMaxChars: number,
): InferenceMode {
  if (preference === "on-device") return InferenceMode.PREFER_ON_DEVICE;
  if (preference === "cloud") return InferenceMode.PREFER_IN_CLOUD;
  return inputChars < onDeviceMaxChars
    ? InferenceMode.PREFER_ON_DEVICE
    : InferenceMode.PREFER_IN_CLOUD;
}

let deviceModelInitialized = false;

/**
 * Create a hybrid GenerativeModel for one request. A fresh instance per
 * request keeps the routing mode (which is fixed for an instance's
 * lifetime, per the docs) aligned with the current input size/preference.
 */
function createHybridModel(mode: InferenceMode): GenerativeModel {
  const svc = getFirebaseServices();
  if (!svc) throw new Error("Firebase is not configured (demo mode).");
  // Per the hybrid get-started guide, Step 5.
  const ai = getAI(svc.app, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    mode,
    inCloudParams: {
      model: CLOUD_MODEL,
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
    },
  });
  // Per the hybrid get-started guide, Step 6: initializeDeviceModel() must
  // be called after/on a user interaction and before any prompt request.
  // All of our calls originate from button clicks, so this is satisfied.
  // Wrapped defensively: on browsers without the Prompt API this may throw,
  // and PREFER_* modes must still be able to fall back to the cloud.
  if (!deviceModelInitialized) {
    try {
      const p = model.initializeDeviceModel(() => undefined);
      // It returns a promise in current SDKs; never let a rejection float.
      if (p && typeof p.catch === "function") {
        p.catch(() => undefined);
      }
      deviceModelInitialized = true;
    } catch {
      /* on-device unavailable here; cloud fallback remains possible */
    }
  }
  return model;
}

function actualRouteOf(response: { inferenceSource?: unknown }): ActualRoute {
  // Compare against the InferenceSource enum, NOT uppercase literals: the
  // SDK's wire values are lowercase ("on_device" / "in_cloud"). Comparing
  // against "ON_DEVICE"/"IN_CLOUD" never matches — that was the original
  // badge bug: inferenceSource WAS populated on every response, yet every
  // result silently degraded to UNKNOWN and the badge showed
  // "Route unreported".
  const src = response?.inferenceSource;
  if (src === InferenceSource.ON_DEVICE) return "ON_DEVICE";
  if (src === InferenceSource.IN_CLOUD) return "IN_CLOUD";
  return "UNKNOWN";
}

/** How the route badge should present one finished call. */
export interface RouteDisplay {
  label: string;
  kind: "device" | "cloud" | "unknown";
  fellBackToCloud: boolean;
}

/**
 * Decide what the route badge says for a finished call.
 *
 * Evidence hierarchy — the badge never claims more than the evidence
 * supports:
 *
 *  1. The SDK-reported `inferenceSource` (AiRunResult.actualRoute) always
 *     wins: it is the SDK stating where the request was actually served.
 *     ON_DEVICE → "On-device"; IN_CLOUD after an on-device request →
 *     "Cloud · fallback"; IN_CLOUD after a cloud request → "Cloud".
 *
 *  2. When the SDK leaves the source unreported (actualRoute UNKNOWN —
 *     e.g. a browser/SDK combination that doesn't populate the field), we
 *     derive the route from the requested mode plus the same
 *     `LanguageModel.availability()` probe the Hybrid status panel uses,
 *     captured right after the successful call:
 *       • Asked cloud (PREFER_IN_CLOUD) → "Cloud": the SDK tries the
 *         cloud endpoint first in this mode, and the successful request
 *         was observed going there.
 *       • Asked on-device while the probe says the on-device model is
 *         "unavailable"/"unsupported" in this browser → the device
 *         provably could not have served the request, so the successful
 *         result must have come from the cloud fallback:
 *         "Cloud · fallback (on-device unavailable on this device)".
 *       • Asked on-device while the probe says a device model IS
 *         available → either side could have served it and we cannot
 *         prove which, so the badge claims only
 *         "On-device (unconfirmed)".
 */
export function deriveRouteDisplay(result: AiRunResult): RouteDisplay {
  const askedDevice =
    result.requestedMode === InferenceMode.PREFER_ON_DEVICE ||
    result.requestedMode === InferenceMode.ONLY_ON_DEVICE;
  if (result.actualRoute === "ON_DEVICE") {
    return { label: "On-device", kind: "device", fellBackToCloud: false };
  }
  if (result.actualRoute === "IN_CLOUD") {
    return {
      label: askedDevice ? "Cloud · fallback" : "Cloud",
      kind: "cloud",
      fellBackToCloud: askedDevice,
    };
  }
  // actualRoute === "UNKNOWN": SDK did not report — derive (see above).
  if (!askedDevice) {
    return { label: "Cloud", kind: "cloud", fellBackToCloud: false };
  }
  if (
    result.onDeviceAvailability === "unavailable" ||
    result.onDeviceAvailability === "unsupported"
  ) {
    return {
      label: "Cloud · fallback (on-device unavailable on this device)",
      kind: "cloud",
      fellBackToCloud: true,
    };
  }
  return {
    label: "On-device (unconfirmed)",
    kind: "device",
    fellBackToCloud: false,
  };
}

/** Run a single-turn prompt through the hybrid router and report honestly. */
export async function runHybridPrompt(
  prompt: string,
  preference: RoutePreference,
  onDeviceMaxChars: number,
): Promise<AiRunResult> {
  const mode = resolveInferenceMode(prompt.length, preference, onDeviceMaxChars);
  const model = createHybridModel(mode);
  const started = performance.now();
  const result = await model.generateContent(prompt);
  const latencyMs = Math.round(performance.now() - started);
  const actualRoute = actualRouteOf(result.response);
  // Probe availability only when the SDK left the route unreported — the
  // probe result feeds the badge derivation (deriveRouteDisplay).
  const onDeviceAvailability =
    actualRoute === "UNKNOWN" ? await checkOnDeviceAvailability() : null;
  const run: AiRunResult = {
    text: result.response.text(),
    requestedMode: mode,
    actualRoute,
    onDeviceAvailability,
    fellBackToCloud: false,
    latencyMs,
    model: CLOUD_MODEL,
  };
  run.fellBackToCloud = deriveRouteDisplay(run).fellBackToCloud;
  return run;
}

/** The four AI actions available on a note. */
export type NoteAiAction = "summarize" | "keypoints" | "rewrite" | "translate";

/** Very small ID/EN heuristic so Translate can pick the opposite language. */
export function detectLanguage(text: string): "id" | "en" {
  const idWords =
    /\b(yang|dan|di|ke|dari|untuk|dengan|adalah|ini|itu|tidak|saya|kami|akan|pada|atau|juga)\b/gi;
  const matches = text.match(idWords)?.length ?? 0;
  return matches >= 2 ? "id" : "en";
}

export function buildNotePrompt(
  action: NoteAiAction,
  title: string,
  body: string,
): string {
  const note = `Title: ${title || "(untitled)"}\n\n${body}`;
  switch (action) {
    case "summarize":
      return (
        "Summarize the following note in 2–4 clear sentences. Keep the key " +
        "facts and decisions. Reply with the summary only.\n\n" +
        note
      );
    case "keypoints":
      return (
        "Extract the key points of the following note as a short bulleted " +
        "list (use '- ' bullets, at most 7 points). Reply with the list only.\n\n" +
        note
      );
    case "rewrite":
      return (
        "Rewrite and expand the following note: fix grammar and flow, add " +
        "helpful structure (short headings or bullets where natural), and " +
        "elaborate briefly where the original is terse — without inventing " +
        "new facts. Reply with the rewritten note only.\n\n" +
        note
      );
    case "translate": {
      const from = detectLanguage(body);
      const target = from === "id" ? "English" : "Indonesian (Bahasa Indonesia)";
      return (
        `Translate the following note into ${target}. Preserve formatting, ` +
        "names and numbers. Reply with the translation only.\n\n" +
        note
      );
    }
  }
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

/**
 * "Ask my notes" — stateless streaming Q&A over the user's notes.
 * On-device inference is single-turn only, so history + note context are
 * embedded in one prompt and routed PREFER_IN_CLOUD (per the task spec);
 * streaming uses generateContentStream, which the hybrid guide supports.
 */
export async function askNotesStream(
  question: string,
  notesContext: string,
  history: ChatTurn[],
  onChunk: (partialText: string) => void,
): Promise<AiRunResult> {
  const svc = getFirebaseServices();
  if (!svc) throw new Error("Firebase is not configured (demo mode).");
  const ai = getAI(svc.app, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_IN_CLOUD,
    inCloudParams: {
      model: CLOUD_MODEL,
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
    },
  });

  const historyText = history
    .slice(-6)
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.text}`)
    .join("\n");
  const prompt =
    "You are NoteHybrid's assistant. Answer the user's question using ONLY " +
    "their notes below. If the answer is not in the notes, say so plainly. " +
    "Be concise and cite the note title(s) you used.\n\n" +
    `--- NOTES ---\n${notesContext}\n--- END NOTES ---\n\n` +
    (historyText ? `Conversation so far:\n${historyText}\n\n` : "") +
    `User: ${question}\nAssistant:`;

  const started = performance.now();
  const streamResult = await model.generateContentStream(prompt);
  let text = "";
  for await (const chunk of streamResult.stream) {
    const piece = chunk.text();
    if (piece) {
      text += piece;
      onChunk(text);
    }
  }
  // inferenceSource only exists on the FINAL aggregated response (the SDK
  // threads it through processStream into streamResult.response) — reading
  // it from an individual stream chunk would be too early.
  const response = await streamResult.response;
  const latencyMs = Math.round(performance.now() - started);
  const actualRoute = actualRouteOf(response);
  const onDeviceAvailability =
    actualRoute === "UNKNOWN" ? await checkOnDeviceAvailability() : null;
  const run: AiRunResult = {
    text,
    requestedMode: InferenceMode.PREFER_IN_CLOUD,
    actualRoute,
    onDeviceAvailability,
    fellBackToCloud: false,
    latencyMs,
    model: CLOUD_MODEL,
  };
  run.fellBackToCloud = deriveRouteDisplay(run).fellBackToCloud;
  return run;
}

/** Truncate the note collection into a bounded context block for Ask. */
export function buildNotesContext(
  notes: { title: string; body: string }[],
  maxTotalChars = 12000,
  maxPerNoteChars = 1500,
): string {
  let out = "";
  for (const n of notes) {
    const entry = `## ${n.title || "(untitled)"}\n${n.body.slice(0, maxPerNoteChars)}\n\n`;
    if (out.length + entry.length > maxTotalChars) break;
    out += entry;
  }
  return out || "(no notes yet)";
}
