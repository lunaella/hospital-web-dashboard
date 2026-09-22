import admin from "firebase-admin";
import { getFirebaseApp } from "../config/firebase.js";
import { pool } from "../db/pool.js";

// Sends a push notification to one or more FCM device tokens. Mirrors
// sms.js's { ok, ... } return contract so callers can log a per-attempt
// failure without a try/catch at every call site.
//
// Unlike sendSms (one recipient per call), FCM's multicast API takes many
// tokens in one request — a donor can have more than one device registered,
// and a broadcast fans out to many donors' tokens at once — so this returns
// per-token results rather than a single ok/fail.
export async function sendPush({ tokens, title, body, data = {} }) {
  const app = getFirebaseApp();
  if (!app) {
    return { ok: false, error: "Firebase is not configured.", successCount: 0, invalidTokens: [] };
  }

  const uniqueTokens = [...new Set((tokens || []).filter(Boolean))];
  if (uniqueTokens.length === 0) {
    return { ok: false, error: "No device tokens to send to.", successCount: 0, invalidTokens: [] };
  }

  try {
    const message = {
      tokens: uniqueTokens,
      notification: { title, body },
      // FCM data payloads must be flat string->string maps.
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: { priority: "high" },
    };

    const response = await admin.messaging(app).sendEachForMulticast(message);

    // A token can go bad (app uninstalled, user revoked notification
    // permission at the OS level, token rotated) and FCM tells us which
    // ones via these specific error codes — worth pruning from
    // donor_devices so future sends don't keep paying for dead tokens.
    const invalidTokens = [];
    response.responses.forEach((result, i) => {
      const code = result.error?.code;
      if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
        invalidTokens.push(uniqueTokens[i]);
      }
    });

    if (invalidTokens.length > 0) {
      await pool.query(`DELETE FROM donor_devices WHERE fcm_token = ANY($1::text[])`, [invalidTokens]).catch((err) => {
        console.error("Failed to prune invalid FCM tokens:", err.message);
      });
    }

    return {
      ok: response.successCount > 0,
      error: response.successCount === 0 ? "All push sends failed." : null,
      successCount: response.successCount,
      invalidTokens,
    };
  } catch (err) {
    return { ok: false, error: err.message, successCount: 0, invalidTokens: [] };
  }
}

// Convenience wrapper for the common case of pushing to a single donor —
// looks up their registered device tokens and sends to all of them. Used by
// the trigger points that only ever target one donor (verification status,
// eligibility, appointment reminders) rather than a broadcast fan-out.
export async function sendPushToDonor(donorId, { title, body, data = {} }) {
  const { rows } = await pool.query(`SELECT fcm_token FROM donor_devices WHERE donor_id = $1`, [donorId]);
  if (rows.length === 0) {
    return { ok: false, error: "No devices registered for this donor.", successCount: 0, invalidTokens: [] };
  }
  return sendPush({ tokens: rows.map((r) => r.fcm_token), title, body, data });
}
