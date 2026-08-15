import { env } from "../config/env.js";
import { phoneDigits } from "./phone.js";

// Sends an SMS via Semaphore (semaphore.co) — a Philippines-based SMS
// gateway with a simple REST API and peso-denominated pricing, a common
// choice for this kind of school project. Docs: https://semaphore.co/docs
//
// Returns a plain { ok, messageId, error } shape rather than throwing, so
// callers (the notification service) can log a per-donor failure without
// a try/catch at every call site.
const SEMAPHORE_URL = "https://api.semaphore.co/api/v4/messages";
const SEND_TIMEOUT_MS = 8000;

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
      // phoneDigits() always reshapes to 639XXXXXXXXX — one of the three
      // formats Semaphore documents accepting — regardless of how `to`
      // arrived (with a "+", a space, a leading 0, or already-canonical).
      number: phoneDigits(to),
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
