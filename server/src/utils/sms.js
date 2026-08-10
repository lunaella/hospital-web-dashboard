import { env } from "../config/env.js";

// Sends an SMS via Semaphore (semaphore.co) — a Philippines-based SMS
// gateway with a simple REST API and peso-denominated pricing, a common
// choice for this kind of school project. Docs: https://semaphore.co/docs
//
// Returns a plain { ok, messageId, error } shape rather than throwing, so
// callers (the notification service) can log a per-donor failure without
// a try/catch at every call site.
const SEMAPHORE_URL = "https://api.semaphore.co/api/v4/messages";
const SEND_TIMEOUT_MS = 8000;

// Semaphore only documents three accepted formats for `number`: 9998887777,
// 09998887777, or 639998887777 — plain digits, no "+" and no spaces. Every
// phone number in this app so far is stored with a leading "+" (walk-in
// registration writes "+639XXXXXXXXX", the seed data has "+63 9XXXXXXXXX"
// with a space, and the donor mobile app's signup number comes through
// as-is, unnormalized, from whatever the phone's contact picker produced).
// Sending any of those straight through as `number` risks Semaphore
// rejecting it as malformed — this strips it down to one of the three
// accepted shapes regardless of how it was entered upstream, rather than
// requiring every call site to agree on a format.
function normalizePhForSemaphore(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("63") && digits.length === 12) return digits; // 639XXXXXXXXX
  if (digits.startsWith("0") && digits.length === 11) return digits; // 09XXXXXXXXX
  if (digits.startsWith("9") && digits.length === 10) return `63${digits}`; // 9XXXXXXXXX -> 639XXXXXXXXX
  return digits; // unrecognized shape — let Semaphore's own validation reject it with a real error
}

export async function sendSms(to, message) {
  if (!env.semaphoreApiKey) {
    return { ok: false, messageId: null, error: "SEMAPHORE_API_KEY is not configured." };
  }
  if (!to) {
    return { ok: false, messageId: null, error: "No phone number on file for this donor." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const body = new URLSearchParams({
      apikey: env.semaphoreApiKey,
      number: normalizePhForSemaphore(to),
      message,
    });
    if (env.semaphoreSenderName) body.set("sendername", env.semaphoreSenderName);

    const res = await fetch(SEMAPHORE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, messageId: null, error: data?.message || `Semaphore returned HTTP ${res.status}.` };
    }
    // Semaphore responds with an array (one entry per recipient); a single
    // "to" here always yields exactly one.
    const record = Array.isArray(data) ? data[0] : data;
    return { ok: true, messageId: record?.message_id ?? null, error: null };
  } catch (err) {
    return { ok: false, messageId: null, error: err.name === "AbortError" ? "SMS request timed out." : err.message };
  } finally {
    clearTimeout(timeout);
  }
}
