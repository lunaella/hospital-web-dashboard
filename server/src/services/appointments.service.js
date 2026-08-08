import { pool } from "../db/pool.js";

// Thrown by bookAppointment for any expected failure (unknown hospital,
// slot full) so callers can map it to the right HTTP status without the
// service needing to know about Express at all.
export class AppointmentBookingError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Shared by the admin walk-in flow (donors.controller.js createAppointment)
// and the donor-facing self-booking endpoint (donorPortal.controller.js) —
// one place enforcing "a hospital can only take appointment_capacity
// donors in the same scheduled_at slot" so the rule can't drift between the
// two callers. See server/db/migrations/005_add_appointment_capacity.sql.
//
// Wrapped in a transaction with a row lock on the hospital so two
// near-simultaneous bookings for the last open spot in a slot can't both
// succeed — the second one re-counts after the first commits, instead of
// both reading the same stale count.
export async function bookAppointment({ donorId, hospitalId, scheduledAt }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: hospitalRows } = await client.query(
      `SELECT appointment_capacity AS "appointmentCapacity" FROM hospitals WHERE id = $1 FOR UPDATE`,
      [hospitalId]
    );
    if (!hospitalRows[0]) {
      throw new AppointmentBookingError(400, "donorId or hospitalId does not match a known record.");
    }

    const { rows: countRows } = await client.query(
      `SELECT COUNT(*)::int AS count FROM appointments
       WHERE hospital_id = $1 AND scheduled_at = $2 AND status != 'cancelled'`,
      [hospitalId, scheduledAt]
    );
    const capacity = hospitalRows[0].appointmentCapacity;
    if (countRows[0].count >= capacity) {
      throw new AppointmentBookingError(
        409,
        `This time slot is fully booked (${capacity} donor${capacity === 1 ? "" : "s"} max). Please choose a different time.`
      );
    }

    const { rows } = await client.query(
      `INSERT INTO appointments (donor_id, hospital_id, scheduled_at, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id, donor_id AS "donorId", hospital_id AS "hospitalId", scheduled_at AS "scheduledAt", status`,
      [donorId, hospitalId, scheduledAt]
    );
    await client.query("COMMIT");
    return rows[0];
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err instanceof AppointmentBookingError) throw err;
    if (err.code === "23503") throw new AppointmentBookingError(400, "donorId or hospitalId does not match a known record.");
    throw err;
  } finally {
    client.release();
  }
}
