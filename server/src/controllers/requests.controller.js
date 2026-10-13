import { pool } from "../db/pool.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { notifyDonorsForRequest } from "../services/notifications.service.js";
import { hospitalIdParam } from "../utils/hospitalScope.js";
import { broadcast, broadcastToDonors } from "../realtime/hub.js";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const PRIORITIES = ["EMERGENCY", "URGENT", "NORMAL"];

// "All Broadcasts" — every blood_request regardless of status (unlike
// /api/dashboard/monitoring, which only shows OPEN/PARTIALLY_FULFILLED ones
// for the live-tracking widget). Supports the same kind of free-text search
// as the donor list.
export const listRequests = asyncHandler(async (req, res) => {
  const hospitalId = hospitalIdParam(req);
  const search = req.query.q?.trim() || null;
  const conditions = [];
  const params = [];

  if (hospitalId) {
    params.push(hospitalId);
    conditions.push(`hospital_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(request_code ILIKE $${params.length} OR ward ILIKE $${params.length} OR blood_type::text ILIKE $${params.length})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT
       request_code AS id,
       blood_type AS "bloodType",
       priority,
       ward,
       units_needed AS "unitsNeeded",
       units_fulfilled AS "unitsFulfilled",
       round(units_fulfilled::numeric / NULLIF(units_needed, 0) * 100)::int AS pct,
       status,
       rejection_reason AS "rejectionReason",
       extract(epoch FROM (now() - created_at))::int AS seconds_open
     FROM blood_requests
     ${where}
     ORDER BY created_at DESC`,
    params
  );
  res.json(rows);
});

const RETURNING_REQUEST = `id AS "dbId", hospital_id AS "hospitalId", request_code AS id, blood_type AS "bloodType", priority, ward,
  units_needed AS "unitsNeeded", units_fulfilled AS "unitsFulfilled", status, created_at AS "createdAt"`;

// Sends a now-live broadcast out to donors. Called right after a super
// admin's own broadcast is created, or once a super admin approves a
// hospital's pending one — never for a PENDING_APPROVAL/REJECTED request.
function dispatchToDonors(request) {
  // Live-updates every connected donor app's open requests list now,
  // and again once notifyDonorsForRequest has written the in-app
  // notification rows (it waits on SMS/email/push, which can be slow).
  broadcastToDonors({ type: "blood_request_created" });

  // Fire-and-forget: notifying donors (real SMS/email calls) must never
  // hold up the response or fail the request itself. Every attempt still
  // gets logged in the notifications table.
  notifyDonorsForRequest({
    id: request.dbId,
    hospitalId: request.hospitalId,
    requestCode: request.id,
    bloodType: request.bloodType,
    priority: request.priority,
    ward: request.ward,
  })
    .catch((err) => console.error(`notifyDonorsForRequest failed for ${request.id}:`, err))
    .finally(() => broadcastToDonors({ type: "blood_request_created" }));
}

// "+ New Broadcast" — creates a new blood request. request_code is
// generated server-side (matches the REQ-XXXX pattern used throughout).
// Only a super admin's broadcast goes out to donors immediately; anyone
// else's (a hospital's) waits as PENDING_APPROVAL until a super admin
// approves or rejects it (approveRequest / rejectRequest below).
export const createRequest = asyncHandler(async (req, res) => {
  const { priority, bloodType, ward, unitsNeeded, hospitalId } = req.body;

  if (!hospitalId) {
    return res.status(400).json({ error: "hospitalId is required." });
  }
  const priorityUpper = String(priority || "").toUpperCase();
  if (!PRIORITIES.includes(priorityUpper)) {
    return res.status(400).json({ error: `priority must be one of: ${PRIORITIES.join(", ")}` });
  }
  if (!BLOOD_TYPES.includes(bloodType)) {
    return res.status(400).json({ error: `bloodType must be one of: ${BLOOD_TYPES.join(", ")}` });
  }
  if (!ward?.trim()) {
    return res.status(400).json({ error: "ward is required." });
  }
  const units = Number(unitsNeeded);
  if (!Number.isInteger(units) || units < 1) {
    return res.status(400).json({ error: "unitsNeeded must be a positive integer." });
  }

  const status = req.admin.isSuperAdmin ? "OPEN" : "PENDING_APPROVAL";

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `REQ-${Math.floor(1000 + Math.random() * 9000)}`;
    try {
      const { rows } = await pool.query(
        `INSERT INTO blood_requests (hospital_id, request_code, blood_type, priority, ward, units_needed, units_fulfilled, status, submitted_by)
         VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8)
         RETURNING ${RETURNING_REQUEST}`,
        [hospitalId, code, bloodType, priorityUpper, ward.trim(), units, status, req.admin.id]
      );
      const created = rows[0];
      res.status(201).json(created);

      if (status === "OPEN") {
        dispatchToDonors(created);
      } else {
        // Lets a super admin's open All Broadcasts page / bell pick up the
        // new pending request without waiting for their next poll.
        broadcast({ type: "broadcast_pending_approval", hospitalId: created.hospitalId, requestCode: created.id });
      }
      return;
    } catch (err) {
      if (err.code === "23505") continue; // unique_violation on request_code — regenerate and retry
      if (err.code === "23503") {
        return res.status(400).json({ error: "hospitalId does not match a known hospital." });
      }
      throw err;
    }
  }
  res.status(500).json({ error: "Could not generate a unique request code. Try again." });
});

// Super admin approves a hospital's pending broadcast: it goes live
// (status OPEN, created_at reset to now so response-time metrics start
// from when donors could actually see it) and donor alerts go out.
export const approveRequest = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE blood_requests
     SET status = 'OPEN', created_at = now(), reviewed_by = $2, reviewed_at = now()
     WHERE request_code = $1 AND status = 'PENDING_APPROVAL'
     RETURNING ${RETURNING_REQUEST}`,
    [req.params.code, req.admin.id]
  );
  const approved = rows[0];
  if (!approved) return reviewConflict(req.params.code, res);

  res.json(approved);
  broadcast({ type: "broadcast_reviewed", hospitalId: approved.hospitalId, requestCode: approved.id, status: approved.status });
  dispatchToDonors(approved);
});

// Super admin rejects a hospital's pending broadcast. It stays in the
// list (so the hospital can see it was rejected, and why) but never
// reaches a donor.
export const rejectRequest = asyncHandler(async (req, res) => {
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() || null : null;
  const { rows } = await pool.query(
    `UPDATE blood_requests
     SET status = 'REJECTED', reviewed_by = $2, reviewed_at = now(), rejection_reason = $3
     WHERE request_code = $1 AND status = 'PENDING_APPROVAL'
     RETURNING ${RETURNING_REQUEST}, rejection_reason AS "rejectionReason"`,
    [req.params.code, req.admin.id, reason]
  );
  const rejected = rows[0];
  if (!rejected) return reviewConflict(req.params.code, res);

  res.json(rejected);
  broadcast({ type: "broadcast_reviewed", hospitalId: rejected.hospitalId, requestCode: rejected.id, status: rejected.status });
});

async function reviewConflict(code, res) {
  const { rows } = await pool.query("SELECT status FROM blood_requests WHERE request_code = $1", [code]);
  if (!rows[0]) return res.status(404).json({ error: "Request not found." });
  return res.status(409).json({ error: `This broadcast was already reviewed (${rows[0].status.toLowerCase().replace("_", " ")}).` });
}

// Rating thresholds (minutes from broadcast to full quota) — tighter for
// higher-priority requests, since 45 minutes to resolve an EMERGENCY isn't
// the same performance as 45 minutes for a NORMAL request.
const RATING_THRESHOLDS_MIN = {
  EMERGENCY: [15, 30, 60],
  URGENT: [30, 60, 120],
  NORMAL: [60, 120, 240],
};

// Exported so completeAppointment (donors.controller.js) can compute the
// same rating when a donor's check-in auto-fulfills a matching broadcast,
// instead of duplicating these thresholds a second time.
export function ratingFor(priority, elapsedMinutes) {
  const [optimal, good, acceptable] = RATING_THRESHOLDS_MIN[priority] || RATING_THRESHOLDS_MIN.NORMAL;
  if (elapsedMinutes <= optimal) return "Optimal";
  if (elapsedMinutes <= good) return "Good";
  if (elapsedMinutes <= acceptable) return "Acceptable";
  return "Poor";
}

// Records progress toward a broadcast's quota (e.g. after a donor's
// donation is confirmed as going toward this specific request). Once
// units_fulfilled reaches units_needed, the request auto-resolves:
// status -> FULFILLED, resolved_at is stamped, and a system_rating is
// computed from how long it took relative to its priority tier.
export const fulfillRequest = asyncHandler(async (req, res) => {
  const addUnits = Number(req.body.units);
  if (!Number.isInteger(addUnits) || addUnits < 1) {
    return res.status(400).json({ error: "units must be a positive integer." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT id, units_needed AS "unitsNeeded", units_fulfilled AS "unitsFulfilled", priority, created_at AS "createdAt", status
       FROM blood_requests
       WHERE request_code = $1
       FOR UPDATE`,
      [req.params.code]
    );
    const request = rows[0];
    if (!request) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Request not found." });
    }
    if (request.status === "FULFILLED" || request.status === "CANCELLED") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `Request is already ${request.status.toLowerCase()}.` });
    }
    if (request.status === "PENDING_APPROVAL" || request.status === "REJECTED") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: request.status === "REJECTED" ? "This broadcast was rejected." : "This broadcast is still awaiting super admin approval.",
      });
    }

    const newFulfilled = Math.min(request.unitsNeeded, request.unitsFulfilled + addUnits);
    const isNowFulfilled = newFulfilled >= request.unitsNeeded;
    const resolvedAt = isNowFulfilled ? new Date() : null;
    const rating = isNowFulfilled
      ? ratingFor(request.priority, (resolvedAt - new Date(request.createdAt)) / 60000)
      : null;

    const { rows: updated } = await client.query(
      `UPDATE blood_requests
       SET units_fulfilled = $1,
           status = $2,
           resolved_at = COALESCE($3, resolved_at),
           system_rating = COALESCE($4, system_rating)
       WHERE id = $5
       RETURNING request_code AS id, units_needed AS "unitsNeeded", units_fulfilled AS "unitsFulfilled",
                 status, system_rating AS rating`,
      [newFulfilled, isNowFulfilled ? "FULFILLED" : "PARTIALLY_FULFILLED", resolvedAt, rating, request.id]
    );

    await client.query("COMMIT");
    res.json(updated[0]);
    broadcastToDonors({ type: "blood_request_updated" });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// Delivery status for a broadcast's donor notifications — lets an admin
// confirm who was actually reached (and why a send failed) rather than
// just trusting the broadcast went out.
export const getRequestNotifications = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT n.channel, n.recipient, n.status, n.error_message AS "errorMessage",
            n.created_at AS "createdAt", d.name AS "donorName", d.donor_code AS "donorCode"
     FROM notifications n
     JOIN blood_requests r ON r.id = n.request_id
     JOIN donors d ON d.id = n.donor_id
     WHERE r.request_code = $1
     ORDER BY n.created_at DESC`,
    [req.params.code]
  );

  const summary = rows.reduce(
    (acc, row) => {
      const key = `${row.channel}${row.status === "sent" ? "Sent" : "Failed"}`;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    { smsSent: 0, smsFailed: 0, emailSent: 0, emailFailed: 0 }
  );

  res.json({ summary, attempts: rows });
});
