import { env } from "../config/env.js";
import { phoneDigits } from "./phone.js";
import { chunk, createRateLimiter, isRetryableStatus, retryAfterMs, withRetry } from "./sendQueue.js";

// Sends an SMS via Semaphore (semaphore.co) — a Philippines-based SMS
// gateway with a simple REST API and peso-denominated pricing, a common
// choice for this kind of school project. Docs: https://semaphore.co/docs
//
// Returns a plain { ok, messageId, error } shape rather than throwing, so
// callers (the notification service) can log a per-donor failure without
// a try/catch at every call site.
const SEMAPHORE_URL = "https://api.semaphore.co/api/v4/messages";
const SEND_TIMEOUT_MS = 8000;
const BULK_TIMEOUT_MS = 20000;

// Semaphore allows 120 calls per minute on /messages and up to 1,000
// numbers per call. Every send in this process (broadcasts, OTP codes,
// approval alerts) shares one limiter, kept a little under 120 so OTP
// codes still get through while a broadcast is going out.
const MAX_NUMBERS_PER_CALL = 1000;
const limiter = createRateLimiter({
  limit: Number(process.env.SEMAPHORE_CALLS_PER_MINUTE) || 100,
  windowMs: 60000,
});

// One call to Semaphore for one or more numbers (comma-separated). A timed
// out call is not retried: Semaphore may already have accepted it, and a
// second call would text every donor twice.
async function postMessages(numbers, message, timeoutMs) {
  await limiter.acquire();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = new URLSearchParams({ apikey: env.semaphoreApiKey, number: numbers.join(","), message });
    if (env.semaphoreSenderName) body.set("sendername", env.semaphoreSenderName);

    const res = await fetch(SEMAPHORE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        retryable: isRetryableStatus(res.status),
        retryAfterMs: retryAfterMs(res.headers),
        error: data?.message || `Semaphore returned HTTP ${res.status}.`,
      };
    }
    return { ok: true, records: Array.isArray(data) ? data : [data] };
  } catch (err) {
    if (err.name === "AbortError") return { ok: false, retryable: false, error: "SMS request timed out." };
    // The request never reached Semaphore (DNS, connection refused or
    // reset), so trying again can't double-send.
    return { ok: false, retryable: true, error: err.message };
  } finally {
    clearTimeout(timeout);
  }
}

// Sends the same message to many numbers in as few calls as possible
// (1,000 numbers per call), in the order given — for a broadcast that is
// the min-heap order, fastest responders first. Returns one
// { ok, messageId, error } per input number, in the same order.
export async function sendBulkSms(recipients, message, { retries = 4, timeoutMs = BULK_TIMEOUT_MS, maxDelayMs = 60000 } = {}) {
  if (!env.semaphoreApiKey) {
    return recipients.map(() => ({ ok: false, messageId: null, error: "SEMAPHORE_API_KEY is not configured." }));
  }

  const results = recipients.map((to) =>
    to ? null : { ok: false, messageId: null, error: "No phone number on file for this donor." }
  );
  // phoneDigits() always reshapes to 639XXXXXXXXX — one of the three
  // formats Semaphore documents accepting — regardless of how a number
  // arrived (with a "+", a space, a leading 0, or already-canonical).
  const pending = recipients.flatMap((to, index) => (to ? [{ index, number: phoneDigits(to) }] : []));

  for (const batch of chunk(pending, MAX_NUMBERS_PER_CALL)) {
    const sent = await withRetry(() => postMessages(batch.map((b) => b.number), message, timeoutMs), {
      retries,
      maxDelayMs,
    });
    if (!sent.ok) {
      const error = sent.attempts > 1 ? `${sent.error} (after ${sent.attempts} tries)` : sent.error;
      for (const b of batch) results[b.index] = { ok: false, messageId: null, error };
      continue;
    }
    // Semaphore answers with one record per recipient; match by number,
    // falling back to position if a record doesn't echo the number back.
    const byNumber = new Map(sent.records.map((r) => [String(r?.recipient ?? ""), r]));
    batch.forEach((b, k) => {
      const record = byNumber.get(b.number) ?? sent.records[k];
      results[b.index] = { ok: true, messageId: record?.message_id ?? null, error: null };
    });
  }
  return results;
}

export async function sendSms(to, message) {
  // A single text (OTP code, approval alert) is someone waiting on screen,
  // so it gets fewer, shorter retries than a broadcast.
  const [result] = await sendBulkSms([to], message, { retries: 2, timeoutMs: SEND_TIMEOUT_MS, maxDelayMs: 10000 });
  return result;
}
