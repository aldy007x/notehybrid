/**
 * Firebase project configuration for NoteHybrid.
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │  PARENT / DEPLOYER: paste your real Firebase web-app config here.     │
 * │  Firebase console → Project settings → General → "Your apps" → Web.   │
 * │  This is the ONLY file you need to edit to connect a real project.    │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * While the values below are placeholders, the app runs in a graceful
 * "demo mode": notes are stored locally in the browser, sign-in is a local
 * guest session, and the AI buttons are disabled with an explanatory
 * banner. No code anywhere else needs to change when you paste real values.
 */
export const firebaseConfig = {
  apiKey: "AIzaSyASPPIYnF-DzKJqVWs9d2Q81vJ-mrHpJ40",
  authDomain: "notehybrid-8db3f.firebaseapp.com",
  projectId: "notehybrid-8db3f",
  storageBucket: "notehybrid-8db3f.firebasestorage.app",
  messagingSenderId: "1061885748414",
  appId: "1:1061885748414:web:8f7367cd247875b91aaaef",
};

/**
 * reCAPTCHA v3 site key used by Firebase App Check in production.
 * Firebase console → App Check → register the web app with reCAPTCHA v3
 * (or reCAPTCHA Enterprise) and paste the site key here.
 * Leave empty during local development if you use an App Check debug
 * token instead (see src/lib/firebase.ts).
 */
export const appCheckSiteKey = "6LcskTEuAAAAAIBMA0fbxUXN71NXtLokQRtpe7yT";

/** True when a real Firebase config has been pasted in above. */
export const isFirebaseConfigured: boolean =
  !firebaseConfig.apiKey.startsWith("YOUR_") &&
  !firebaseConfig.projectId.startsWith("YOUR_") &&
  !firebaseConfig.appId.startsWith("YOUR_");
