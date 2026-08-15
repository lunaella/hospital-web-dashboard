import { pool } from "../db/pool.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { bookAppointment, AppointmentBookingError } from "../services/appointments.service.js";
import { normalizePhoneForStorage, phoneDigits, isValidPhDigits } from "../utils/phone.js";

// Same 90-day DOH cooling-rule math as the donor_eligibility view (schema.sql)
// and exportDonors (donors.controller.js) — duplicated as a WHERE id = $1
// query rather than joining the view, since the view isn't donor-scoped and
// this just needs the one row.
export const getMyProfile = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, donor_code AS "donorCode", name, phone, email, blood_type AS "bloodType",
            last_donation_at AS "lastDonationAt",
            CASE
              WHEN last_donation_at IS NULL THEN true
              WHEN now() - last_donation_at >= INTERVAL '90 days' THEN true
              ELSE false
            END AS "isEligible",
            GREATEST(0, 90 - EXTRACT(DAY FROM now() - last_donation_at)::int) AS "daysUntilEligible"
     FROM donors WHERE id = $1`,
    [req.donor.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Donor not found." });
  res.json(rows[0]);
});

// Self-service profile edit: name, phone, email. Blood type is deliberately
// NOT editable here — it's a safety-critical field that drives which
// donors get matched to which broadcast, so a correction has to go through
// an admin (Donor Management), not a raw self-edit a donor could fat-finger.
export const updateMyProfile = asyncHandler(async (req, res) => {
  const { name, phone, email } = req.body;
  const updates = [];
  const params = [];

  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: "name cannot be empty." });
    params.push(name.trim());
    updates.push(`name = $${params.length}`);
  }

  if (phone !== undefined) {
    const normalizedPhone = normalizePhoneForStorage(phone);
    if (!isValidPhDigits(phoneDigits(phone))) {
      return res.status(400).json({ error: "Enter a valid Philippine mobile number." });
    }
    // No DB-level UNIQUE constraint on donors.phone (see schema.sql) — this
    // app-level check is what actually keeps two donor accounts from
    // colliding onto the same login phone.
    const { rows: clash } = await pool.query("SELECT id FROM donors WHERE phone = $1 AND id != $2", [
      normalizedPhone,
      req.donor.id,
    ]);
    if (clash[0]) return res.status(400).json({ error: "That phone number is already in use by another account." });
    params.push(normalizedPhone);
    updates.push(`phone = $${params.length}`);
  }

  if (email !== undefined) {
    params.push(email?.trim() || null);
    updates.push(`email = $${params.length}`);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "Nothing to update." });
  }

  params.push(req.donor.id);
  const { rows } = await pool.query(
    `UPDATE donors SET ${updates.join(", ")}, updated_at = now()
     WHERE id = $${params.length}
     RETURNING id, donor_code AS "donorCode", name, phone, email, blood_type AS "bloodType"`,
    params
  );
  res.json(rows[0]);
});

// Powers the app's hospital picker when booking an appointment — public
// hospital info only (no admin-facing fields like appointment_capacity).
export const listHospitalsForDonors = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, code, name, city, address, latitude, longitude FROM hospitals ORDER BY name`
  );
  res.json(rows);
});

export const listMyAppointments = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.id, a.hospital_id AS "hospitalId", h.name AS "hospitalName", h.address AS "hospitalAddress",
            a.scheduled_at AS "scheduledAt", a.status
     FROM appointments a
     JOIN hospitals h ON h.id = a.hospital_id
     WHERE a.donor_id = $1
     ORDER BY a.scheduled_at DESC`,
    [req.donor.id]
  );
  res.json(rows);
});

// Donation History — completed donations only, from donor_arrivals (the
// same table completeAppointment in donors.controller.js writes to when
// admin staff record a donation). request_id is a LEFT JOIN, not an INNER
// one: donor_arrivals.request_id is nullable and today's completeAppointment
// flow never actually sets it (a completed *appointment* isn't necessarily
// tied to a specific broadcast), so most rows won't have one — this just
// surfaces which broadcast it was for on the rows that do.
export const listMyDonations = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT da.id, h.name AS "hospitalName", da.arrived_at AS "arrivedAt",
            r.request_code AS "requestCode", r.blood_type AS "bloodType"
     FROM donor_arrivals da
     JOIN hospitals h ON h.id = da.hospital_id
     LEFT JOIN blood_requests r ON r.id = da.request_id
     WHERE da.donor_id = $1
     ORDER BY da.arrived_at DESC`,
    [req.donor.id]
  );
  res.json(rows);
});

// Powers the mobile app's bell — one row per broadcast the donor was
// notified about, not one per delivery attempt. notifyDonorsForRequest
// (notifications.service.js) inserts a *separate* row per channel (sms,
// and email if the donor has one on file), so a donor with an email would
// otherwise see every alert listed twice. Grouping by request_id collapses
// that back into what the donor actually experienced: one alert per
// broadcast, read once both/either channel's row has been marked read.
export const listMyNotifications = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT
       n.request_id AS "requestId",
       r.request_code AS "requestCode",
       r.blood_type AS "bloodType",
       r.priority,
       r.ward,
       h.name AS "hospitalName",
       min(n.created_at) AS "createdAt",
       bool_and(n.read_at IS NOT NULL) AS "isRead"
     FROM notifications n
     JOIN blood_requests r ON r.id = n.request_id
     JOIN hospitals h ON h.id = r.hospital_id
     WHERE n.donor_id = $1
     GROUP BY n.request_id, r.request_code, r.blood_type, r.priority, r.ward, h.name
     ORDER BY min(n.created_at) DESC
     LIMIT 50`,
    [req.donor.id]
  );
  res.json({ notifications: rows, unreadCount: rows.filter((r) => !r.isRead).length });
});

// Marks every one of this donor's notification rows as read in one shot —
// the mobile app calls this when the bell's list screen is opened, not per
// item, since the UX this backs is "you've now seen your notifications",
// not per-row read receipts.
export const markMyNotificationsRead = asyncHandler(async (req, res) => {
  await pool.query(`UPDATE notifications SET read_at = now() WHERE donor_id = $1 AND read_at IS NULL`, [
    req.donor.id,
  ]);
  res.status(204).send();
});

// Donor self-service booking — same bookAppointment() the admin walk-in
// flow uses (donors.controller.js createAppointment), so the slot-capacity
// rule can never drift between "staff booked it for you" and "you booked
// it yourself in the app".
export const bookMyAppointment = asyncHandler(async (req, res) => {
  const { hospitalId, scheduledAt } = req.body;
  if (!hospitalId || !scheduledAt) {
    return res.status(400).json({ error: "hospitalId and scheduledAt are required." });
  }
  try {
    const appointment = await bookAppointment({ donorId: req.donor.id, hospitalId, scheduledAt });
    res.status(201).json(appointment);
  } catch (err) {
    if (err instanceof AppointmentBookingError) {
      return res.status(err.status).json({ error: err.message });
    }
    throw err;
  }
});

// Scoped to `donor_id = req.donor.id` so a donor can only ever cancel their
// own appointment, never someone else's by guessing an id. Completed
// appointments are excluded deliberately — a donation that already happened
// isn't something the app should let a donor "undo".
export const cancelMyAppointment = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE appointments SET status = 'cancelled', updated_at = now()
     WHERE id = $1 AND donor_id = $2 AND status NOT IN ('completed', 'cancelled')
     RETURNING id, status`,
    [req.params.id, req.donor.id]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: "Appointment not found, already cancelled, or already completed." });
  }
  res.json(rows[0]);
});
