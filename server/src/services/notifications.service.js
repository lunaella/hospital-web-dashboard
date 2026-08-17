import { pool } from "../db/pool.js";
import { sendSms } from "../utils/sms.js";
import { sendEmail } from "../utils/email.js";
import { MinHeap } from "../utils/minHeap.js";
import { wrapBrandedEmail, buildBroadcastAlertEmailBody } from "../utils/emailTemplate.js";

// Donors with no arrival history have no measured response time yet. They
// still get notified, but a min-heap keyed on response time needs *some*
// number to place them at — treat them as an average responder rather than
// letting `NULL` sort as either best or worst.
const FALLBACK_RESPONSE_MINUTES = 60;

const PRIORITY_LABEL = {
  EMERGENCY: "EMERGENCY",
  URGENT: "Urgent",
  NORMAL: "Routine",
};

// Used only if a broadcast's hospital somehow can't be resolved (shouldn't
// happen — hospital_id is NOT NULL + FK-constrained on blood_requests) so a
// notification still goes out with an honest placeholder instead of
// crashing the whole fire-and-forget flow.
const FALLBACK_HOSPITAL_NAME = "the requesting hospital";

// request.hospitalName is resolved in notifyDonorsForRequest below — was
// previously a hardcoded "St. Jude Medical Center" here, which meant every
// broadcast email/SMS named the same hospital regardless of which one the
// admin actually selected.
function buildSmsBody(request) {
  return (
    `ResQ Alert: ${PRIORITY_LABEL[request.priority] ?? request.priority} need for ` +
    `${request.bloodType} blood at ${request.hospitalName} (Ward: ${request.ward}). ` +
    `Request #${request.requestCode}. If you're able to donate, please contact the hospital.`
  );
}

function buildEmailHtml(donorName, request) {
  return wrapBrandedEmail(
    buildBroadcastAlertEmailBody({
      donorName,
      priorityLabel: PRIORITY_LABEL[request.priority] ?? request.priority,
      bloodType: request.bloodType,
      hospitalName: request.hospitalName,
      ward: request.ward,
      requestCode: request.requestCode,
    })
  );
}

// A donor who's never given blood ranks as "most overdue" for tiebreaking —
// not as a null/unknown that could sort either way.
const NEVER_DONATED_RANK_MS = -1;
function overdueRankMs(donor) {
  return donor.lastDonationAt ? new Date(donor.lastDonationAt).getTime() : NEVER_DONATED_RANK_MS;
}

// Two donors can easily land on the exact same avgResponseMinutes — most
// obviously when neither has any arrival history yet and both fall back to
// FALLBACK_RESPONSE_MINUTES, but real historical averages can tie too. Left
// unbroken, a tie is resolved by wherever the two donors happened to land
// in the heap's internal array — an implementation detail, not a decision.
// Breaking it by "longest since last donation" (never-donated counts as
// longest) gives every tie a real, defensible answer: the donor who's most
// overdue goes first.
function compareDonorRank(a, b) {
  if (a.avgResponseMinutes !== b.avgResponseMinutes) return a.avgResponseMinutes - b.avgResponseMinutes;
  return overdueRankMs(a.donor) - overdueRankMs(b.donor);
}

// Ranks matching donors by how quickly they've historically shown up after
// a broadcast, fastest first, using a real min-heap rather than an ORDER BY.
// A heap is the right structure here (not just a sort) because dispatch
// only ever needs "who's next" one at a time — extractMin pulls the current
// fastest-responder in O(log n) — which matters if this is later changed to
// stream out notifications in priority batches instead of all at once.
function rankDonorsByResponseTime(donors, avgResponseByDonorId) {
  const heap = new MinHeap(compareDonorRank);
  for (const donor of donors) {
    const avgResponseMinutes = avgResponseByDonorId.get(donor.id) ?? FALLBACK_RESPONSE_MINUTES;
    heap.insert({ donor, avgResponseMinutes });
  }
  return heap.drainToSortedArray();
}

// Notifies every eligible donor whose blood type matches a newly created
// broadcast, over both channels a donor has on file (phone always; email
// only when set). Every attempt — success or failure — is logged to
// `notifications` so admins can see who was actually reached. Designed to
// be called without awaiting from the request handler: a slow or failed
// send should never hold up the broadcast-creation response.
//
// Donors are contacted in min-heap order of their historical average
// response time (fastest-typical-responders first, derived from real past
// donor_arrivals — not a distance/ETA guess), rather than in arbitrary row
// order. This is the "Min-Heap Optimized" ranking shown against the Donor
// Response Time chart in Reports.
export async function notifyDonorsForRequest(request) {
  const { rows: hospitalRows } = await pool.query("SELECT name FROM hospitals WHERE id = $1", [request.hospitalId]);
  request.hospitalName = hospitalRows[0]?.name ?? FALLBACK_HOSPITAL_NAME;

  const { rows: donors } = await pool.query(
    `SELECT d.id, d.donor_code, d.name, d.phone, d.email, d.last_donation_at AS "lastDonationAt",
            d.notify_sms AS "notifySms", d.notify_email AS "notifyEmail"
     FROM donors d
     JOIN donor_eligibility de ON de.id = d.id
     WHERE d.blood_type = $1 AND de.is_eligible = true`,
    [request.bloodType]
  );

  const { rows: responseStats } = donors.length
    ? await pool.query(
        `SELECT da.donor_id AS id, AVG(EXTRACT(EPOCH FROM (da.arrived_at - br.created_at)) / 60) AS avg_minutes
         FROM donor_arrivals da
         JOIN blood_requests br ON br.id = da.request_id
         WHERE da.donor_id = ANY($1::uuid[])
         GROUP BY da.donor_id`,
        [donors.map((d) => d.id)]
      )
    : { rows: [] };
  const avgResponseByDonorId = new Map(responseStats.map((r) => [r.id, Number(r.avg_minutes)]));

  const rankedDonors = rankDonorsByResponseTime(donors, avgResponseByDonorId);

  // notify_sms/notify_email are the donor's own Settings > Notification
  // Preferences toggle (see migration 008) — a donor who's still a match
  // (right blood type, still eligible) but has opted a channel off simply
  // gets no attempt logged for it, same as if they had no email on file.
  const attempts = rankedDonors.flatMap(({ donor }) => {
    const jobs = [];
    if (donor.notifySms) {
      jobs.push(
        sendSms(donor.phone, buildSmsBody(request)).then((result) => ({
          donor,
          channel: "sms",
          recipient: donor.phone,
          result,
        }))
      );
    }
    if (donor.email && donor.notifyEmail) {
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

  const summary = {
    totalDonors: donors.length,
    smsSent: 0,
    smsFailed: 0,
    emailSent: 0,
    emailFailed: 0,
    // Donor codes in the order the min-heap dispatched them — fastest
    // historical responder first. Empty when no donors matched.
    priorityOrder: rankedDonors.map((r) => r.donor.donor_code),
  };

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
