import admin from "firebase-admin";
import { env } from "./env.js";

// Lazily initializes the Firebase Admin SDK from the base64-encoded service
// account in env.js, and caches the app instance. Mirrors the rest of this
// codebase's "optional integration" pattern (see sms.js, email.js,
// didit.js): nothing here throws at import time just because Firebase isn't
// configured yet — getFirebaseApp() returns null instead, and callers
// (push.js) turn that into a per-send "not configured" failure.
let app;
let initAttempted = false;

export function getFirebaseApp() {
  if (initAttempted) return app ?? null;
  initAttempted = true;

  if (!env.firebaseServiceAccountBase64) {
    return null;
  }

  try {
    const json = Buffer.from(env.firebaseServiceAccountBase64, "base64").toString("utf8");
    const serviceAccount = JSON.parse(json);
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    return app;
  } catch (err) {
    console.error("Failed to initialize Firebase Admin SDK:", err.message);
    app = null;
    return null;
  }
}
