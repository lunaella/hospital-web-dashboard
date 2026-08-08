import { pool } from "../db/pool.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { bookAppointment, AppointmentBookingError } from "../services/appointments.service.js";

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
