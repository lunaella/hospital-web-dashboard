import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { chunk, createRateLimiter, isRetryableStatus, retryAfterMs, withRetry } from "./sendQueue.js";

// Sends an email via Resend (resend.com) — a modern email API with a
// generous free tier and a single API key to get started; no domain
// verification required as long as NOTIFICATION_FROM_EMAIL stays on their
// shared "onboarding@resend.dev" sender. Docs: https://resend.com/docs
//
// Same { ok, messageId, error } shape as sendSms so the notification
// service can treat both channels identically.
const RESEND_URL = "https://api.resend.com/emails";
const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";
const SEND_TIMEOUT_MS = 8000;
const BATCH_TIMEOUT_MS = 20000;

// Resend allows 10 requests per second per team and up to 100 emails per
// batch call. Every send in this process shares one limiter, kept under 10.
const MAX_EMAILS_PER_BATCH = 100;
const limiter = createRateLimiter({ limit: Number(process.env.RESEND_CALLS_PER_SECOND) || 8, windowMs: 1000 });

// One POST to Resend. The Idempotency-Key stays the same across retries of
// the same call, so Resend drops a repeat instead of sending it twice —
// which is why a timed-out call is safe to retry here (unlike SMS).
async function post(url, payload, idempotencyKey, timeoutMs) {
  await limiter.acquire();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        retryable: isRetryableStatus(res.status),
        retryAfterMs: retryAfterMs(res.headers),
        error: data?.message || `Resend returned HTTP ${res.status}.`,
      };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, retryable: true, error: err.name === "AbortError" ? "Email request timed out." : err.message };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendEmail({ to, subject, html }) {
  if (!env.resendApiKey) {
    return { ok: false, messageId: null, error: "RESEND_API_KEY is not configured." };
  }
  if (!to) {
    return { ok: false, messageId: null, error: "No email address on file for this donor." };
  }

  const key = randomUUID();
  const sent = await withRetry(
    () => post(RESEND_URL, { from: env.notificationFromEmail, to: [to], subject, html }, key, SEND_TIMEOUT_MS),
    { retries: 2, maxDelayMs: 10000 }
  );
  return sent.ok
    ? { ok: true, messageId: sent.data?.id ?? null, error: null }
    : { ok: false, messageId: null, error: sent.error };
}

// Sends many emails (each its own to/subject/html) 100 per call, in the
// order given. Returns one { ok, messageId, error } per input, in order.
export async function sendEmailBatch(emails) {
  if (!env.resendApiKey) {
    return emails.map(() => ({ ok: false, messageId: null, error: "RESEND_API_KEY is not configured." }));
  }

  const results = new Array(emails.length);
  const indexed = emails.map((email, index) => ({ ...email, index }));
  for (const batch of chunk(indexed, MAX_EMAILS_PER_BATCH)) {
    const key = randomUUID();
    const payload = batch.map(({ to, subject, html }) => ({ from: env.notificationFromEmail, to: [to], subject, html }));
    const sent = await withRetry(() => post(RESEND_BATCH_URL, payload, key, BATCH_TIMEOUT_MS), { retries: 4, maxDelayMs: 60000 });
    batch.forEach((email, k) => {
      // Resend's data[k] is the email at position k of the batch.
      results[email.index] = sent.ok
        ? { ok: true, messageId: sent.data?.data?.[k]?.id ?? null, error: null }
        : { ok: false, messageId: null, error: sent.attempts > 1 ? `${sent.error} (after ${sent.attempts} tries)` : sent.error };
    });
  }
  return results;
}
