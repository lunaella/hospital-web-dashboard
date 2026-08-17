import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Shared branded wrapper for every transactional email this backend sends
// (OTP codes, welcome email, broadcast alerts — see donorAuth.controller.js
// and notifications.service.js). One template so all of them look like
// they came from the same product, instead of each call site hand-rolling
// its own <p> tags.
//
// Uses table-based layout and every style inline (no <style> block, no
// external CSS/fonts) — email clients (Gmail, Outlook, Apple Mail) strip or
// mis-render anything else, so this is the actual portable subset for
// HTML email, not a stylistic choice.

const BRAND_RED = "#7D1B22";
const TEXT_DARK = "#1E1E1E";
const TEXT_MUTED = "#6B7280";
const BORDER = "#EAEAEA";

// The real ResQ logo (same file as resq_app's assets/images/rq_coloredLogo.png),
// copied into this project so the backend doesn't depend on the mobile
// repo. Embedded as a base64 data URI rather than a normal <img src="https://...">
// — the backend isn't deployed anywhere public yet, so a real hosted URL
// wouldn't be reachable by whoever's actual inbox opens this email. Read
// once at startup, not per-email; it's a fixed 6KB file, not something
// that changes at runtime.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_BASE64 = fs.readFileSync(path.join(__dirname, "../assets/rq-logo.png")).toString("base64");
const LOGO_DATA_URI = `data:image/png;base64,${LOGO_BASE64}`;

/**
 * Wraps `bodyHtml` (already-built inner content) in the ResQ branded
 * header/footer shell. `bodyHtml` should be simple inline-styled <p> tags —
 * see buildOtpEmailBody/buildWelcomeEmailBody below for the pattern.
 */
export function wrapBrandedEmail(bodyHtml) {
  return `
<div style="max-width:480px;margin:0 auto;padding:32px 24px;font-family:-apple-system,Helvetica,Arial,sans-serif;background-color:#ffffff;">
  <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
    <tr>
      <td style="vertical-align:middle;">
        <img src="${LOGO_DATA_URI}" width="36" height="29" alt="ResQ" style="display:block;" />
      </td>
      <td style="padding-left:10px;vertical-align:middle;">
        <span style="font-size:19px;font-weight:bold;color:${TEXT_DARK};">ResQ</span>
      </td>
    </tr>
  </table>
  <div style="border-top:1px solid ${BORDER};padding-top:24px;">
    ${bodyHtml}
  </div>
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid ${BORDER};text-align:center;">
    <span style="color:#9a9a9a;font-size:11.5px;">Sent by ResQ &middot; Philippine Red Cross, Lucena Chapter</span>
  </div>
</div>`.trim();
}

// The big, bold code display — this is the part that mattered most about
// the reference design: the code needs to be unmissable, not buried in a
// sentence.
export function buildOtpEmailBody(code, expiryMinutes) {
  return `
    <p style="font-size:15px;line-height:1.5;color:${TEXT_DARK};margin:0 0 20px;">Hi there,</p>
    <p style="font-size:15px;line-height:1.5;color:${TEXT_DARK};margin:0 0 24px;">
      Use the following code to verify your ResQ account:
    </p>
    <p style="font-size:42px;font-weight:bold;letter-spacing:8px;color:${BRAND_RED};margin:0 0 24px;text-align:center;">
      ${code}
    </p>
    <p style="font-size:13px;line-height:1.5;color:${TEXT_MUTED};margin:0;">
      This code expires in ${expiryMinutes} minute${expiryMinutes === 1 ? "" : "s"}. If you didn't request this,
      you can safely ignore this email — no changes have been made to your account.
    </p>`;
}

export function buildWelcomeEmailBody(donorName, bloodType) {
  return `
    <p style="font-size:15px;line-height:1.5;color:${TEXT_DARK};margin:0 0 20px;">Hi ${donorName},</p>
    <p style="font-size:15px;line-height:1.5;color:${TEXT_DARK};margin:0 0 16px;">
      Your ResQ donor account is ready. You're registered as blood type
      <strong style="color:${BRAND_RED};">${bloodType}</strong>.
    </p>
    <p style="font-size:15px;line-height:1.5;color:${TEXT_DARK};margin:0 0 20px;">
      When a hospital needs your blood type, we'll text and email you here — open the app to respond.
    </p>
    <p style="font-size:13px;line-height:1.5;color:${TEXT_MUTED};margin:0;">
      Thank you for being a ResQ donor.
    </p>`;
}

export function buildBroadcastAlertEmailBody({ donorName, priorityLabel, bloodType, hospitalName, ward, requestCode }) {
  return `
    <p style="font-size:15px;line-height:1.5;color:${TEXT_DARK};margin:0 0 20px;">Hi ${donorName},</p>
    <p style="font-size:15px;line-height:1.5;color:${TEXT_DARK};margin:0 0 20px;">
      <strong>${hospitalName}</strong> has an active <strong>${priorityLabel}</strong> request for
      <strong style="color:${BRAND_RED};">${bloodType}</strong> blood (Ward: ${ward}, Request #${requestCode}).
    </p>
    <p style="font-size:15px;line-height:1.5;color:${TEXT_DARK};margin:0 0 20px;">
      Your blood type is a match. If you're eligible and able to donate, please get in touch with the hospital
      as soon as possible.
    </p>
    <p style="font-size:13px;line-height:1.5;color:${TEXT_MUTED};margin:0;">
      Thank you for being a ResQ donor.
    </p>`;
}
