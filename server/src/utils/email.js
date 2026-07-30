import { env } from "../config/env.js";

// Sends an email via Resend (resend.com) — a modern email API with a
// generous free tier and a single API key to get started; no domain
// verification required as long as NOTIFICATION_FROM_EMAIL stays on their
// shared "onboarding@resend.dev" sender. Docs: https://resend.com/docs
//
// Same { ok, messageId, error } shape as sendSms so the notification
// service can treat both channels identically.
const RESEND_URL = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 8000;

export async function sendEmail({ to, subject, html }) {
  if (!env.resendApiKey) {
    return { ok: false, messageId: null, error: "RESEND_API_KEY is not configured." };
  }
  if (!to) {
    return { ok: false, messageId: null, error: "No email address on file for this donor." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.notificationFromEmail,
        to: [to],
        subject,
        html,
      }),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, messageId: null, error: data?.message || `Resend returned HTTP ${res.status}.` };
    }
    return { ok: true, messageId: data?.id ?? null, error: null };
  } catch (err) {
    return { ok: false, messageId: null, error: err.name === "AbortError" ? "Email request timed out." : err.message };
  } finally {
    clearTimeout(timeout);
  }
}
