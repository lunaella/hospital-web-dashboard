import crypto from "node:crypto";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { env } from "../config/env.js";

// Recursively rounds whole-number floats (1.0 -> 1) — Didit's server signs
// a canonicalized version of the body where this has already happened, so
// skipping it here would make our HMAC diverge from theirs on payloads that
// merely round-trip a float differently than the sender intended.
function shortenFloats(value) {
  if (Array.isArray(value)) return value.map(shortenFloats);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, shortenFloats(v)]));
  }
  if (typeof value === "number" && !Number.isInteger(value) && value % 1 === 0) {
    return Math.trunc(value);
  }
  return value;
}

// Recursive lexicographic key sort (array element order is left alone) —
// the other half of Didit's canonicalization before signing.
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeys(value[key]);
        return acc;
      }, {});
  }
  return value;
}

// Didit's recommended verification method (X-Signature-V2): canonicalize
// the already-parsed body the same way their server did before signing,
// then compare HMAC-SHA256 in constant time so a timing side-channel can't
// leak the correct signature one byte at a time. See
// docs.didit.me/integration/webhooks.
function isValidSignature(body, signatureHeader) {
  if (!env.diditWebhookSecret || !signatureHeader) return false;
  const canonical = JSON.stringify(sortKeys(shortenFloats(body)));
  const expected = crypto.createHmac("sha256", env.diditWebhookSecret).update(canonical, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expected);
  const gotBuf = Buffer.from(signatureHeader);
  return expectedBuf.length === gotBuf.length && crypto.timingSafeEqual(expectedBuf, gotBuf);
}

// Maps Didit's own session status onto donor_verifications.status's
// pending/in_review/verified/rejected vocabulary (migration 014). Anything
// not explicitly terminal (Not Started, In Progress, Awaiting User,
// Resubmitted) is left as 'pending' — the donor just hasn't finished yet.
function mapDiditStatus(diditStatus) {
  if (diditStatus === "Approved") return "verified";
  if (["Declined", "Abandoned", "Expired", "Kyc Expired"].includes(diditStatus)) return "rejected";
  if (diditStatus === "In Review") return "in_review";
  return "pending";
}

// Public endpoint (no donor auth — Didit's own servers call this directly,
// not the app on a donor's behalf) that delivers the real verification
// decision once a donor finishes the hosted flow started by
// startDiditVerification (donorPortal.controller.js). Follows Didit's
// documented webhook contract: reject stale timestamps (replay protection),
// verify the HMAC before trusting anything in the body, de-dupe on
// event_id (Didit retries anything that doesn't get back a fast 2xx), and
// always answer quickly regardless of what happens downstream.
export const handleDiditWebhook = asyncHandler(async (req, res) => {
  const timestamp = Number(req.headers["x-timestamp"]);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) {
    return res.status(401).send("stale");
  }

  const signature = req.headers["x-signature-v2"];
  if (!isValidSignature(req.body, signature)) {
    return res.status(401).send("bad signature");
  }

  const eventId = req.body?.event_id;
  if (eventId) {
    const { rows } = await pool.query(
      `INSERT INTO didit_webhook_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_id`,
      [eventId]
    );
    if (!rows[0]) return res.status(200).send("already processed");
  }

  const { session_id: sessionId, status } = req.body ?? {};
  if (sessionId && status) {
    await pool.query(
      `UPDATE donor_verifications
         SET status = $1, didit_status = $2, reviewed_at = now()
       WHERE didit_session_id = $3`,
      [mapDiditStatus(status), status, sessionId]
    );
  }

  res.status(200).send("ok");
});
