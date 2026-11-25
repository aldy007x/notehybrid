/**
 * Ambient types for browser APIs TypeScript doesn't ship:
 *  - Chrome's Prompt API global (`LanguageModel`) used to check Gemini Nano
 *    availability, exactly as the Firebase hybrid guide prescribes.
 *  - The App Check debug-token global read in src/lib/firebase.ts.
 */
export {};

declare global {
  interface LanguageModelStatic {
    availability: () => Promise<
      "available" | "downloadable" | "downloading" | "unavailable"
    >;
    create: (options?: Record<string, unknown>) => Promise<unknown>;
  }

  // eslint-disable-next-line no-var
  var LanguageModel: LanguageModelStatic | undefined;

  interface Window {
    FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean;
  }
}
