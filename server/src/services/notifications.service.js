import { pool } from "../db/pool.js";
import { sendSms } from "../utils/sms.js";
import { sendEmail } from "../utils/email.js";

const HOSPITAL_NAME = "St. Jude Medical Center";

const PRIORITY_LABEL = {
  EMERGENCY: "EMERGENCY",
  URGENT: "Urgent",
  NORMAL: "Routine",
};

function buildSmsBody(request) {
  return (
    `ResQ Alert: ${PRIORITY_LABEL[request.priority] ?? request.priority} need for ` +
    `${request.bloodType} blood at ${HOSPITAL_NAME} (Ward: ${request.ward}). ` +
    `Request #${request.requestCode}. If you're able to donate, please contact the hospital.`
  );
}

function buildEmailHtml(donorName, request) {
  return (
    `<p>Hi ${donorName},</p>` +
    `<p><strong>${HOSPITAL_NAME}</strong> has an active ${PRIORITY_LABEL[request.priority] ?? request.priority} ` +
    `request for <strong>${request.bloodType}</strong> blood (Ward: ${request.ward}, Request #${request.requestCode}).</p>` +
    `<p>Your blood type is a match. If you're eligible and able to donate, please get in touch with the hospital as soon as possible.</p>` +
    `<p>Thank you for being a ResQ donor.</p>`
  );
}

// Notifies every eligible donor whose blood type matches a newly created
// broadcast, over both channels a donor has on file (phone always; email
// only when set). Every attempt — success or failure — is logged to
// `notifications` so admins can see who was actually reached. Designed to
// be called without awaiting from the request handler: a slow or failed
// send should never hold up the broadcast-creation response.
export async function notifyDonorsForRequest(request) {
  const { rows: donors } = await pool.query(
    `SELECT d.id, d.donor_code, d.name, d.phone, d.email
     FROM donors d
     JOIN donor_eligibility de ON de.id = d.id
     WHERE d.blood_type = $1 AND de.is_eligible = true`,
    [request.bloodType]
  );

  const attempts = donors.flatMap((donor) => {
    const jobs = [
      sendSms(donor.phone, buildSmsBody(request)).then((result) => ({
        donor,
        channel: "sms",
        recipient: donor.phone,
        result,
      })),
    ];
    if (donor.email) {
      jobs.push(
        sendEmail({
          to: donor.email,
          subject: `Urgent Blood Donation Request — ${request.bloodType} Needed`,
          html: buildEmailHtml(donor.name, request),
        }).then((result) => ({
          donor,
          channel: "email",
          recipient: donor.email,
          result,
        }))
      );
    }
    return jobs;
  });

  const settled = await Promise.allSettled(attempts);

  const summary = { totalDonors: donors.length, smsSent: 0, smsFailed: 0, emailSent: 0, emailFailed: 0 };

  for (const outcome of settled) {
    if (outcome.status !== "fulfilled") continue; // sendSms/sendEmail never throw, but stay defensive
    const { donor, channel, recipient, result } = outcome.value;

    await pool.query(
      `INSERT INTO notifications (donor_id, request_id, channel, recipient, status, provider_message_id, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [donor.id, request.id, channel, recipient, result.ok ? "sent" : "failed", result.messageId, result.error]
    );

    const key = `${channel}${result.ok ? "Sent" : "Failed"}`;
    summary[key] = (summary[key] ?? 0) + 1;
  }

  return summary;
}
