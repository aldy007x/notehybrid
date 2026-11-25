/**
 * Smoke test for the NoteHybrid Firebase project (notehybrid-8db3f).
 *
 * Signs in anonymously, writes a note at users/{uid}/notes/smoke-test,
 * reads it back, deletes it, and signs out. Prints PASS/FAIL per step.
 *
 * Run:  node scripts/smoke.mjs
 *
 * The config below mirrors src/firebase-config.ts (Firebase web configs
 * are project identifiers, not secrets).
 */
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, signOut } from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyASPPIYnF-DzKJqVWs9d2Q81vJ-mrHpJ40",
  authDomain: "notehybrid-8db3f.firebaseapp.com",
  projectId: "notehybrid-8db3f",
  storageBucket: "notehybrid-8db3f.firebasestorage.app",
  messagingSenderId: "1061885748414",
  appId: "1:1061885748414:web:8f7367cd247875b91aaaef",
};

function report(step, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let uid = null;
let allOk = true;

// 1. Anonymous sign-in
try {
  const cred = await signInAnonymously(auth);
  uid = cred.user.uid;
  allOk = report("sign-in-anonymously", true, `uid=${uid}`) && allOk;
} catch (e) {
  allOk = report("sign-in-anonymously", false, `${e.code ?? ""} ${e.message}`) && false;
}

const noteRef = uid ? doc(db, "users", uid, "notes", "smoke-test") : null;
const payload = {
  title: "Smoke test note",
  body: "Written by scripts/smoke.mjs",
  updatedAt: Date.now(),
};

// 2. Write note
if (noteRef) {
  try {
    await setDoc(noteRef, payload);
    allOk = report("write-note", true, `users/${uid}/notes/smoke-test`) && allOk;
  } catch (e) {
    allOk = report("write-note", false, `${e.code ?? ""} ${e.message}`) && false;
  }
} else {
  allOk = report("write-note", false, "skipped — no uid (sign-in failed)") && false;
}

// 3. Read it back
if (noteRef) {
  try {
    const snap = await getDoc(noteRef);
    const ok = snap.exists() && snap.data().title === payload.title;
    allOk =
      report(
        "read-note",
        ok,
        ok ? "data matches" : `exists=${snap.exists()} data=${JSON.stringify(snap.data() ?? null)}`,
      ) && allOk;
  } catch (e) {
    allOk = report("read-note", false, `${e.code ?? ""} ${e.message}`) && false;
  }
} else {
  allOk = report("read-note", false, "skipped — no uid (sign-in failed)") && false;
}

// 4. Delete note
if (noteRef) {
  try {
    await deleteDoc(noteRef);
    allOk = report("delete-note", true) && allOk;
  } catch (e) {
    allOk = report("delete-note", false, `${e.code ?? ""} ${e.message}`) && false;
  }
} else {
  allOk = report("delete-note", false, "skipped — no uid (sign-in failed)") && false;
}

// 5. Sign out
try {
  await signOut(auth);
  allOk = report("sign-out", true) && allOk;
} catch (e) {
  allOk = report("sign-out", false, `${e.code ?? ""} ${e.message}`) && false;
}

console.log(allOk ? "\nSMOKE: ALL PASS" : "\nSMOKE: FAILURES PRESENT");
process.exit(allOk ? 0 : 1);
