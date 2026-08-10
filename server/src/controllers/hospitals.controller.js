import { pool } from "../db/pool.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getAllowedHospitalIds } from "../utils/hospitalScope.js";

// Backs the hospital switcher. For a super admin, team manager, or any
// unrestricted admin, this is every hospital in the system, and the
// frontend adds its own "All Hospitals" option on top; that's a UI-only
// concept, not a row here. For an admin scoped to specific hospitals (Team
// Access > which hospitals can they access), this only returns those —
// they should never even see the name of a hospital they have no access to,
// let alone be able to select it.
export const listHospitals = asyncHandler(async (req, res) => {
  const restricted = !req.admin.isSuperAdmin && !req.admin.canManageTeam;
  const allowedIds = restricted ? await getAllowedHospitalIds(req.admin.id) : [];

  const { rows } = await pool.query(
    allowedIds.length > 0
      ? `SELECT id, code, name, city, address, latitude, longitude, appointment_capacity AS "appointmentCapacity" FROM hospitals WHERE id = ANY($1) ORDER BY name`
      : `SELECT id, code, name, city, address, latitude, longitude, appointment_capacity AS "appointmentCapacity" FROM hospitals ORDER BY name`,
    allowedIds.length > 0 ? [allowedIds] : []
  );
  res.json(rows);
});

function parseCoord(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Falls back to the schema default (5) rather than 0/NaN, since 0 would mean
// "nobody can ever book this hospital" — almost certainly not what a blank
// or malformed form field means.
const DEFAULT_APPOINTMENT_CAPACITY = 5;
function parseCapacity(value) {
  if (value === undefined || value === null || value === "") return DEFAULT_APPOINTMENT_CAPACITY;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_APPOINTMENT_CAPACITY;
}

// Settings > Hospital Network "+ Add Hospital". Hospitals only ever existed
// via seed data until now — this is the first way to add one from the app
// itself instead of a SQL script.
export const createHospital = asyncHandler(async (req, res) => {
  const { name, code, city, address, latitude, longitude, appointmentCapacity } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ error: "name is required." });
  }
  if (!code?.trim()) {
    return res.status(400).json({ error: "code is required." });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO hospitals (code, name, city, address, latitude, longitude, appointment_capacity)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, code, name, city, address, latitude, longitude, appointment_capacity AS "appointmentCapacity"`,
      [
        code.trim(),
        name.trim(),
        city?.trim() || null,
        address?.trim() || null,
        parseCoord(latitude),
        parseCoord(longitude),
        parseCapacity(appointmentCapacity),
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ error: `A hospital with code "${code.trim()}" already exists.` });
    }
    throw err;
  }
});

// Editing name/location — code is left changeable too (unlike donor/request
// codes elsewhere in this app) since a hospital's short code is closer to a
// slug an admin might reasonably want to fix a typo in, not a system-
// generated id.
export const updateHospital = asyncHandler(async (req, res) => {
  const { name, code, city, address, latitude, longitude, appointmentCapacity } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ error: "name is required." });
  }
  if (!code?.trim()) {
    return res.status(400).json({ error: "code is required." });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE hospitals
       SET code = $1, name = $2, city = $3, address = $4, latitude = $5, longitude = $6, appointment_capacity = $7
       WHERE id = $8
       RETURNING id, code, name, city, address, latitude, longitude, appointment_capacity AS "appointmentCapacity"`,
      [
        code.trim(),
        name.trim(),
        city?.trim() || null,
        address?.trim() || null,
        parseCoord(latitude),
        parseCoord(longitude),
        parseCapacity(appointmentCapacity),
        req.params.id,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: "Hospital not found." });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ error: `A hospital with code "${code.trim()}" already exists.` });
    }
    throw err;
  }
});

// Every FK pointing at hospitals(id) is ON DELETE CASCADE — necessary so the
// row can be removed at all, but that also means a plain DELETE would
// silently wipe every broadcast, appointment, and arrival ever logged
// against this hospital along with it. Blocking deletion while any of that
// history exists is the honest tradeoff: admin scoping (which has no
// historical value once the hospital is gone) is fine to cascade away, but
// real activity records aren't something a delete button should be able to
// erase by accident.
export const deleteHospital = asyncHandler(async (req, res) => {
  const { rows: exists } = await pool.query("SELECT id FROM hospitals WHERE id = $1", [req.params.id]);
  if (!exists[0]) return res.status(404).json({ error: "Hospital not found." });

  const { rows: counts } = await pool.query(
    `SELECT
       (SELECT count(*) FROM blood_requests WHERE hospital_id = $1) AS requests,
       (SELECT count(*) FROM appointments WHERE hospital_id = $1) AS appointments,
       (SELECT count(*) FROM donor_arrivals WHERE hospital_id = $1) AS arrivals`,
    [req.params.id]
  );
  const { requests, appointments, arrivals } = counts[0];
  const blockers = [
    Number(requests) > 0 && `${requests} broadcast${requests === "1" ? "" : "s"}`,
    Number(appointments) > 0 && `${appointments} appointment${appointments === "1" ? "" : "s"}`,
    Number(arrivals) > 0 && `${arrivals} arrival${arrivals === "1" ? "" : "s"}`,
  ].filter(Boolean);

  if (blockers.length > 0) {
    return res.status(400).json({
      error: `Can't delete — this hospital has ${blockers.join(", ")} on record. Historical data can't be removed this way.`,
    });
  }

  await pool.query("DELETE FROM hospitals WHERE id = $1", [req.params.id]);
  res.status(204).end();
});
