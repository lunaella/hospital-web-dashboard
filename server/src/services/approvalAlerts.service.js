import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import { sendSms } from "../utils/sms.js";
import { sendEmail } from "../utils/email.js";
import { wrapBrandedEmail } from "../utils/emailTemplate.js";
import { getSettings, splitNumberList, SETTING_KEYS } from "../utils/appSettings.js";

// Texts/emails the Red Cross (super admin) about a hospital's broadcast
// waiting on their approval, so it reaches them even when nobody has the
// dashboard open — the in-dashboard bar/sound (PendingApprovalAlerts.jsx)
// only works while a tab is open somewhere.
//
// First alert: as soon as the hospital submits (createRequest calls
// sendDueApprovalAlerts right away). Then, if it's still pending, it
// re-alerts every ESCALATE_AFTER_MIN for its priority — adding the backup
// numbers — up to MAX_ESCALATIONS times (jobs/approvalEscalation.js runs
// this every minute). Approving, rejecting, or the hospital withdrawing
// the request stops it. Nothing here ever approves a request by itself;
// that stays the Red Cross's decision.
export const ESCALATE_AFTER_MIN = { EMERGENCY: 5, URGENT: 15, NORMAL: 60 };
export const MAX_ESCALATIONS = 3;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function reviewLink() {
  return env.dashboardUrl ? `${env.dashboardUrl}/view-broadcasts` : null;
}

function buildSms(r) {
  const units = `${r.unitsNeeded} unit${r.unitsNeeded === 1 ? "" : "s"} ${r.bloodType}`;
  const link = reviewLink() ? ` Review: ${reviewLink()}` : " Review it in RESQ.";
  if (r.attempt === 1) {
    return `RESQ: ${r.priority} request awaiting your approval. ${r.hospitalName} needs ${units} (${r.ward}). ${r.requestCode}.${link}`;
  }
  return `RESQ REMINDER ${r.attempt - 1}/${MAX_ESCALATIONS}: ${r.priority} request from ${r.hospitalName} still awaiting approval after ${r.minutesWaiting} min. ${units}, ${r.requestCode}.${link}`;
}

function buildEmail(r) {
  const isReminder = r.attempt > 1;
  const subject = isReminder
    ? `Reminder: ${r.priority} blood request from ${r.hospitalName} still awaiting approval`
    : `${r.priority} blood request from ${r.hospitalName} awaiting your approval`;
  const link = reviewLink();
  const html = wrapBrandedEmail(`
    <p style="font-size:15px;line-height:1.5;color:#1a1a1a;margin:0 0 16px;">
      ${isReminder ? `Still waiting after <strong>${r.minutesWaiting} minutes</strong>: ` : ""}
      <strong>${escapeHtml(r.hospitalName)}</strong> submitted a <strong>${escapeHtml(r.priority)}</strong> request for
      <strong style="color:#9B1B20;">${r.unitsNeeded} unit${r.unitsNeeded === 1 ? "" : "s"} of ${escapeHtml(r.bloodType)}</strong>
      (Ward: ${escapeHtml(r.ward)}, Request #${escapeHtml(r.requestCode)}).
    </p>
    <p style="font-size:15px;line-height:1.5;color:#1a1a1a;margin:0 0 16px;">
      Donors won't be notified until you approve it.
      ${link ? `<a href="${escapeHtml(link)}" style="color:#9B1B20;font-weight:bold;">Review it in RESQ</a>.` : "Review it in RESQ."}
    </p>`);
  return { subject, html };
}

async function logAttempt(requestId, attempt, channel, recipient, result) {
  await pool.query(
    `INSERT INTO approval_alerts (request_id, attempt, channel, recipient, status, error_message)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [requestId, attempt, channel, recipient, result.ok ? "sent" : "failed", result.ok ? null : result.error]
  );
}

// Claims every pending request that's due an alert (never alerted yet, or
// last alerted longer ago than its priority's interval and not past the
// escalation cap) by bumping its counter in the same UPDATE, so two runs
// overlapping — the job tick and a just-submitted request — can't both
// send the same alert. Then sends to whoever is configured.
export async function sendDueApprovalAlerts() {
  const { rows: due } = await pool.query(
    `UPDATE blood_requests r
     SET approval_alert_count = r.approval_alert_count + 1, last_approval_alert_at = now()
     FROM hospitals h
     WHERE h.id = r.hospital_id
       AND r.status = 'PENDING_APPROVAL'
       AND (
         r.approval_alert_count = 0
         OR (
           r.approval_alert_count <= $1
           AND r.last_approval_alert_at <= now() - make_interval(mins => CASE r.priority
             WHEN 'EMERGENCY' THEN $2::int WHEN 'URGENT' THEN $3::int ELSE $4::int END)
         )
       )
     RETURNING r.id, r.request_code AS "requestCode", r.blood_type AS "bloodType", r.priority, r.ward,
               r.units_needed AS "unitsNeeded", r.approval_alert_count AS attempt, h.name AS "hospitalName",
               floor(extract(epoch FROM (now() - r.submitted_at)) / 60)::int AS "minutesWaiting"`,
    [MAX_ESCALATIONS, ESCALATE_AFTER_MIN.EMERGENCY, ESCALATE_AFTER_MIN.URGENT, ESCALATE_AFTER_MIN.NORMAL]
  );
  if (due.length === 0) return { sent: 0 };

  const settings = await getSettings([SETTING_KEYS.alertNumbers, SETTING_KEYS.backupNumbers]);
  const alertNumbers = splitNumberList(settings[SETTING_KEYS.alertNumbers]);
  const backupNumbers = splitNumberList(settings[SETTING_KEYS.backupNumbers]);
  const { rows: superAdmins } = await pool.query(
    "SELECT DISTINCT email FROM admins WHERE clearance = 'FULL_ROOT_ACCESS_LEVEL_5' AND email <> ''"
  );

  for (const r of due) {
    // Escalations widen the circle: the backup numbers only join once the
    // first alert has gone unanswered.
    const numbers = r.attempt === 1 ? alertNumbers : [...new Set([...alertNumbers, ...backupNumbers])];
    const message = buildSms(r);
    for (const number of numbers) {
      const result = await sendSms(number, message);
      await logAttempt(r.id, r.attempt, "sms", number, result);
      if (!result.ok) console.error(`Approval alert SMS for ${r.requestCode} to ${number} failed: ${result.error}`);
    }
    const { subject, html } = buildEmail(r);
    for (const { email } of superAdmins) {
      const result = await sendEmail({ to: email, subject, html });
      await logAttempt(r.id, r.attempt, "email", email, result);
      if (!result.ok) console.error(`Approval alert email for ${r.requestCode} to ${email} failed: ${result.error}`);
    }
    if (numbers.length === 0 && superAdmins.length === 0) {
      console.warn(`Approval alert for ${r.requestCode}: no alert numbers or super admin emails configured.`);
    }
  }
  return { sent: due.length };
}
