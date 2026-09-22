import cron from "node-cron";
import { pool } from "../db/pool.js";
import { sendPushToDonor } from "../utils/push.js";

// How far ahead of an appointment to remind a donor. A donor who booked for
// tomorrow should hear about it once, not get spammed every time this job
// runs — reminder_sent_at (migration 015) is what makes that a one-shot
// rather than a repeat every REMINDER_CHECK_CRON tick.
const REMINDER_WINDOW_HOURS = 24;

// Checked this often. Frequent enough that a reminder still lands within a
// reasonable time of crossing the 24h-out mark, cheap enough (one indexed
// query against a small table) that there's no real cost to it.
const REMINDER_CHECK_CRON = "*/15 * * * *";

function formatApptTime(scheduledAt) {
  return new Date(scheduledAt).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Finds every confirmed/pending appointment landing inside the reminder
// window that hasn't been reminded about yet, pushes to each donor, and
// marks reminder_sent_at so the next run skips it. Exported as a plain
// function (not just the cron registration) so it can be run once directly —
// handy for a manual trigger or a test — separate from scheduleAppointmentReminders
// wiring it to run on a timer.
export async function sendDueAppointmentReminders() {
  const { rows: appointments } = await pool.query(
    `SELECT a.id, a.donor_id AS "donorId", a.scheduled_at AS "scheduledAt", h.name AS "hospitalName"
     FROM appointments a
     JOIN hospitals h ON h.id = a.hospital_id
     WHERE a.status IN ('pending', 'confirmed')
       AND a.reminder_sent_at IS NULL
       AND a.scheduled_at BETWEEN now() AND now() + ($1 || ' hours')::interval`,
    [REMINDER_WINDOW_HOURS]
  );

  for (const appt of appointments) {
    const result = await sendPushToDonor(appt.donorId, {
      title: "Appointment reminder",
      body: `Your donation at ${appt.hospitalName} is on ${formatApptTime(appt.scheduledAt)}.`,
      data: { type: "appointment_reminder", appointmentId: appt.id },
    });

    if (!result.ok) {
      console.error(`Appointment reminder push failed for appointment ${appt.id}: ${result.error}`);
    }

    // Firebase being unconfigured is a whole-system, temporary condition —
    // don't burn this appointment's one-shot reminder on it, or the
    // reminder never goes out even after Firebase gets set up. Any other
    // failure (no device registered, a bad token) is specific to this donor
    // and genuinely won't resolve itself by retrying every 15 minutes, so
    // those are still marked sent — this is a best-effort reminder, not a
    // logged/retried channel like SMS/email.
    if (result.ok || result.error !== "Firebase is not configured.") {
      await pool.query(`UPDATE appointments SET reminder_sent_at = now() WHERE id = $1`, [appt.id]);
    }
  }

  return { checked: appointments.length };
}

// Registers the recurring job. Call once at server startup (see index.js).
// A no-op if Firebase isn't configured — sendPushToDonor/sendPush already
// degrade to a per-call "not configured" failure, so this still runs
// harmlessly (just marks reminders sent without actually pushing) rather
// than needing its own separate configured-check.
export function scheduleAppointmentReminders() {
  cron.schedule(REMINDER_CHECK_CRON, () => {
    sendDueAppointmentReminders().catch((err) => {
      console.error("Appointment reminder job failed:", err.message);
    });
  });
}
