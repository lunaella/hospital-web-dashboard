import cron from "node-cron";
import { pool } from "../db/pool.js";
import { sendPushToDonor } from "../utils/push.js";
import { MALARIA_SYMPTOM_NUDGE_DAYS, malariaWaitFromScreening } from "../utils/eligibilityClassifier.js";

// Two pushes for a donor with a malaria exposure on file:
//  - 3 months after a trip to a malaria area: get checked if you've had
//    fever, chills or flu-like illness (the app can't check symptoms, and
//    malaria can show up months after a trip).
//  - when the waiting period is over: answer the symptom check in the app
//    to become eligible again (deferredMalariaCheck until they do).
// Each is sent once per exposure date / wait end, recorded in
// health_screening (malariaNudgeFor, malariaCheckReminderFor) so the daily
// run doesn't repeat it.
const MALARIA_REMINDER_CRON = "0 9 * * *";

async function markSent(donorId, update) {
  await pool.query(`UPDATE donors SET health_screening = health_screening || $2::jsonb WHERE id = $1`, [
    donorId,
    JSON.stringify(update),
  ]);
}

// Same "don't burn the one-shot while Firebase is unconfigured" rule as
// appointmentReminders.js.
function shouldMarkSent(result) {
  return result.ok || result.error !== "Firebase is not configured.";
}

export async function sendDueMalariaReminders(now = new Date()) {
  const { rows: donors } = await pool.query(
    `SELECT id, health_screening AS "healthScreening"
     FROM donors
     WHERE health_screening->>'hasTravelOrNeedleStick' = 'true'`,
  );

  let nudges = 0;
  let checkReminders = 0;
  for (const donor of donors) {
    const screening = donor.healthScreening;
    const wait = malariaWaitFromScreening(screening);
    if (!wait?.endsAt) continue;
    const exposureDate = screening.travelOrNeedleDate;
    const endsAt = wait.endsAt.toISOString();

    if (now >= wait.endsAt) {
      if (wait.checkDone || screening.malariaCheckReminderFor === endsAt) continue;
      const result = await sendPushToDonor(donor.id, {
        title: "Your malaria waiting period is over",
        body: "Answer a quick health check in ResQ to be eligible to donate again.",
        data: { type: "malaria_check" },
      });
      if (!result.ok) console.error(`Malaria check reminder failed for donor ${donor.id}: ${result.error}`);
      if (shouldMarkSent(result)) await markSent(donor.id, { malariaCheckReminderFor: endsAt });
      checkReminders += 1;
      continue;
    }

    const nudgeAt = new Date(new Date(exposureDate).getTime() + MALARIA_SYMPTOM_NUDGE_DAYS * 86400000);
    if (wait.exposure !== "visited" || now < nudgeAt || screening.malariaNudgeFor === exposureDate) continue;
    const result = await sendPushToDonor(donor.id, {
      title: "Time for a health check",
      body: "It's been 3 months since your trip to a malaria area. If you've had fever, chills or flu-like illness, get checked at a health center and tell ResQ in the app.",
      data: { type: "malaria_nudge" },
    });
    if (!result.ok) console.error(`Malaria symptom nudge failed for donor ${donor.id}: ${result.error}`);
    if (shouldMarkSent(result)) await markSent(donor.id, { malariaNudgeFor: exposureDate });
    nudges += 1;
  }

  return { checked: donors.length, nudges, checkReminders };
}

// Registers the daily job. Call once at server startup (see index.js).
export function scheduleMalariaReminders() {
  cron.schedule(
    MALARIA_REMINDER_CRON,
    () => {
      sendDueMalariaReminders().catch((err) => {
        console.error("Malaria reminder job failed:", err.message);
      });
    },
    { timezone: "Asia/Manila" },
  );
}
