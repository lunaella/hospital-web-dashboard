import { pool } from "../db/pool.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { hospitalIdParam } from "../utils/hospitalScope.js";
import { bookAppointment, AppointmentBookingError } from "../services/appointments.service.js";
import { verifySessionToken } from "../utils/jwt.js";

const PAGE_SIZE_DEFAULT = 5; // matches the frontend's current PAGE_SIZE

export const listDonors = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Number(req.query.pageSize) || PAGE_SIZE_DEFAULT, 100);
  const offset = (page - 1) * pageSize;
  const bloodTypes = req.query.bloodType
    ? [].concat(req.query.bloodType) // supports ?bloodType=O-&bloodType=A+
    : null;
  const search = req.query.q?.trim() || null;
  const eligibility = req.query.eligibility; // "eligible" | "locked" | undefined/"all"

  const conditions = [];
  const params = [];

  if (bloodTypes?.length) {
    params.push(bloodTypes);
    conditions.push(`blood_type = ANY($${params.length}::blood_type[])`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(name ILIKE $${params.length} OR donor_code ILIKE $${params.length} OR phone ILIKE $${params.length})`);
  }
  if (eligibility === "eligible") {
    conditions.push(`(last_donation_at IS NULL OR now() - last_donation_at >= INTERVAL '90 days')`);
  } else if (eligibility === "locked") {
    conditions.push(`(last_donation_at IS NOT NULL AND now() - last_donation_at < INTERVAL '90 days')`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await pool.query(`SELECT count(*)::int AS total FROM donors ${where}`, params);
  const total = countResult.rows[0].total;

  params.push(pageSize, offset);
  const { rows } = await pool.query(
    `SELECT
       id, donor_code AS "donorCode", name, phone, blood_type AS "bloodType", avatar_url AS avatar,
       last_donation_at AS "lastDonationAt",
       CASE
         WHEN last_donation_at IS NULL THEN true
         WHEN now() - last_donation_at >= INTERVAL '90 days' THEN true
         ELSE false
       END AS "isEligible",
       GREATEST(0, 90 - EXTRACT(DAY FROM now() - last_donation_at)::int) AS "daysUntilEligible"
     FROM donors
     ${where}
     ORDER BY name
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  res.json({
    donors: rows,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

// Registers a brand-new donor — used by the walk-in form when the person at
// the desk isn't already in the system. donor_code is generated server-side
// (staff shouldn't have to invent a unique ID); collisions are vanishingly
// unlikely but retried a few times just in case.
export const createDonor = asyncHandler(async (req, res) => {
  const { name, phone, bloodType, email } = req.body;
  if (!name?.trim() || !phone?.trim() || !bloodType) {
    return res.status(400).json({ error: "name, phone, and bloodType are required." });
  }
  if (!BLOOD_TYPES.includes(bloodType)) {
    return res.status(400).json({ error: `bloodType must be one of: ${BLOOD_TYPES.join(", ")}` });
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `D-${Math.floor(1000 + Math.random() * 9000)}`;
    try {
      const { rows } = await pool.query(
        `INSERT INTO donors (donor_code, name, phone, blood_type, email)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, donor_code AS "donorCode", name, phone, blood_type AS "bloodType", email`,
        [code, name.trim(), phone.trim(), bloodType, email?.trim() || null]
      );
      return res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === "23505") continue; // unique_violation on donor_code — regenerate and retry
      throw err;
    }
  }
  res.status(500).json({ error: "Could not generate a unique donor code. Try again." });
});

// Manual override for the DOH 90-day cooling rule (e.g. an admin correcting
// a data-entry mistake, or force-locking a donor). Since eligibility is
// derived from last_donation_at rather than stored as a flag, "locking"
// means setting last_donation_at to now, and "marking eligible" means
// clearing it.
export const setDonorEligibility = asyncHandler(async (req, res) => {
  const { eligible } = req.body;
  if (typeof eligible !== "boolean") {
    return res.status(400).json({ error: "eligible must be a boolean." });
  }

  const { rows } = await pool.query(
    `UPDATE donors SET last_donation_at = $1, updated_at = now() WHERE id = $2
     RETURNING id, donor_code AS "donorCode", last_donation_at AS "lastDonationAt"`,
    [eligible ? null : new Date(), req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Donor not found." });
  res.json(rows[0]);
});

// Full unpaginated export for CSV download — separate from listDonors so
// the paginated endpoint's page size cap (100) doesn't limit exports.
export const exportDonors = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT donor_code AS "donorCode", name, phone, blood_type AS "bloodType",
            CASE
              WHEN last_donation_at IS NULL THEN true
              WHEN now() - last_donation_at >= INTERVAL '90 days' THEN true
              ELSE false
            END AS "isEligible",
            GREATEST(0, 90 - EXTRACT(DAY FROM now() - last_donation_at)::int) AS "daysUntilEligible"
     FROM donors
     ORDER BY name`
  );
  res.json(rows);
});

export const getDonor = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, donor_code AS "donorCode", name, phone, blood_type AS "bloodType", avatar_url AS avatar,
            last_donation_at AS "lastDonationAt"
     FROM donors WHERE id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Donor not found." });
  res.json(rows[0]);
});

// Appointment View: donations scheduled for a single day, with left/right
// day navigation on the frontend driving the `date` query param. Also
// accepts ?hospitalId=<uuid> from the super admin's hospital switcher (or
// omitted/"all" to show every hospital's appointments for that day).
export const listAppointmentsForDay = asyncHandler(async (req, res) => {
  const hospitalId = hospitalIdParam(req);
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const hospitalClause = hospitalId ? "AND a.hospital_id = $2" : "";
  const params = hospitalId ? [date, hospitalId] : [date];

  const { rows } = await pool.query(
    `SELECT a.id, a.scheduled_at AS "scheduledAt", a.status,
            d.name, d.blood_type AS "bloodType", d.avatar_url AS avatar
     FROM appointments a
     JOIN donors d ON d.id = a.donor_id
     WHERE a.scheduled_at::date = $1::date ${hospitalClause}
     ORDER BY a.scheduled_at ASC`,
    params
  );
  res.json(rows);
});

// hospitalId is required here — in the real app this is whichever hospital
// the donor's geolocation-based nearest-hospital match resolved to for this
// appointment; this admin's walk-in form asks for it explicitly instead
// (defaulting to the currently-selected hospital in the switcher).
//
// Slot-capacity enforcement lives in bookAppointment (services/appointments
// .service.js) so this admin flow and the donor-facing self-booking
// endpoint (donorPortal.controller.js, used by the Android app) can never
// enforce the rule differently.
export const createAppointment = asyncHandler(async (req, res) => {
  const { donorId, scheduledAt, hospitalId } = req.body;
  if (!donorId || !scheduledAt || !hospitalId) {
    return res.status(400).json({ error: "donorId, scheduledAt, and hospitalId are required." });
  }

  try {
    const appointment = await bookAppointment({ donorId, hospitalId, scheduledAt });
    res.status(201).json(appointment);
  } catch (err) {
    if (err instanceof AppointmentBookingError) {
      return res.status(err.status).json({ error: err.message });
    }
    throw err;
  }
});

// "completed" is deliberately excluded here — recording a completed donation
// has real side effects (donor_arrivals, last_donation_at, inventory) and
// must go through the transactional completeAppointment endpoint below
// instead of this plain status-only update.
export const updateAppointmentStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const allowed = ["confirmed", "pending", "cancelled", "no_show"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(", ")}` });
  }
  const { rows } = await pool.query(
    `UPDATE appointments SET status = $1, updated_at = now() WHERE id = $2
     RETURNING id, donor_id AS "donorId", scheduled_at AS "scheduledAt", status`,
    [status, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Appointment not found." });
  res.json(rows[0]);
});

// Records an actual completed donation. This is the one place that closes
// the loop between "donor showed up" and the rest of the system: it flips
// the appointment to completed, logs a donor_arrivals row (so the donor
// shows up in Dashboard's Recent Arrivals) tagged to the same hospital as
// the appointment, starts the donor's 90-day DOH cooling period, and adds
// one unit to that hospital's inventory for that blood type. Wrapped in a
// single transaction with a row lock so a double-click can't double-count
// the same donation.
export const completeAppointment = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT a.id, a.status, a.donor_id AS "donorId", a.hospital_id AS "hospitalId", d.blood_type AS "bloodType"
       FROM appointments a
       JOIN donors d ON d.id = a.donor_id
       WHERE a.id = $1
       FOR UPDATE OF a`,
      [req.params.id]
    );
    const appt = rows[0];
    if (!appt) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Appointment not found." });
    }
    if (appt.status === "completed") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "This donation has already been recorded." });
    }

    await client.query(
      "UPDATE appointments SET status = 'completed', updated_at = now() WHERE id = $1",
      [appt.id]
    );
    await client.query(
      "UPDATE donors SET last_donation_at = now(), updated_at = now() WHERE id = $1",
      [appt.donorId]
    );
    await client.query(
      "INSERT INTO donor_arrivals (donor_id, hospital_id, arrived_at) VALUES ($1, $2, now())",
      [appt.donorId, appt.hospitalId]
    );
    // Upsert rather than a plain UPDATE: a hospital might not have a
    // pre-seeded inventory row for every blood type, and the first
    // completed donation of a given type at a given hospital should still
    // count instead of silently updating zero rows.
    await client.query(
      `INSERT INTO blood_inventory (hospital_id, blood_type, units_available)
       VALUES ($1, $2, 1)
       ON CONFLICT (hospital_id, blood_type)
       DO UPDATE SET units_available = blood_inventory.units_available + 1, updated_at = now()`,
      [appt.hospitalId, appt.bloodType]
    );

    await client.query("COMMIT");
    res.json({ id: appt.id, status: "completed" });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// QR check-in: the donor's mobile app shows GET /api/donor/appointments/:id/qr
// as a QR code; front-desk staff scan it (or, until the web UI has an actual
// camera-based scanner, paste the decoded text into a plain input — a QR
// scanner "typing" into a focused field is a common, legitimate pattern, not
// a placeholder hack) and this endpoint does the same thing confirmArrival
// already does: flips the appointment to 'confirmed'. It deliberately does
// NOT call completeAppointment's full donation-recording flow (inventory,
// last_donation_at, donor_arrivals) — check-in means "they've shown up",
// not "the donation happened", which still needs a staff member's actual
// medical sign-off afterward.
export const checkInByQr = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "token is required." });

  let payload;
  try {
    payload = verifySessionToken(token);
  } catch {
    return res.status(400).json({ error: "This check-in code is invalid or has expired." });
  }
  if (payload.role !== "appointment_checkin") {
    return res.status(400).json({ error: "This is not a valid check-in code." });
  }

  const { rows } = await pool.query(
    `SELECT a.id, a.status, a.scheduled_at AS "scheduledAt",
            d.name AS "donorName", d.donor_code AS "donorCode", d.blood_type AS "bloodType"
     FROM appointments a
     JOIN donors d ON d.id = a.donor_id
     WHERE a.id = $1 AND a.donor_id = $2`,
    [payload.appointmentId, payload.donorId]
  );
  const appt = rows[0];
  if (!appt) return res.status(404).json({ error: "Appointment not found." });
  if (!["pending", "confirmed"].includes(appt.status)) {
    return res.status(400).json({ error: `This appointment is already ${appt.status}.` });
  }

  await pool.query("UPDATE appointments SET status = 'confirmed', updated_at = now() WHERE id = $1", [appt.id]);

  res.json({
    id: appt.id,
    status: "confirmed",
    donorName: appt.donorName,
    donorCode: appt.donorCode,
    bloodType: appt.bloodType,
    scheduledAt: appt.scheduledAt,
  });
});
