import { pool } from "../db/pool.js";

// Shared helper for the super admin's hospital switcher: every list/
// aggregate endpoint that touches hospital-scoped tables (blood_inventory,
// blood_requests, appointments, donor_arrivals) accepts a ?hospitalId=<uuid>
// query param to scope to one hospital. Omitting it (or passing the literal
// string "all") aggregates across every hospital instead.
export function hospitalIdParam(req) {
  const raw = req.query.hospitalId;
  if (!raw || raw === "all") return null;
  return raw;
}

// Returns the hospital ids an admin has been explicitly scoped to, or an
// empty array if they're unrestricted (no rows = every existing admin
// created before this feature shipped, plus any new admin nobody has
// bothered to scope down). Super admins and team managers should never call
// this — callers are expected to bypass them before reaching here, same as
// requireSection bypasses them for section permissions.
export async function getAllowedHospitalIds(adminId) {
  const { rows } = await pool.query("SELECT hospital_id AS id FROM admin_hospital_assignments WHERE admin_id = $1", [
    adminId,
  ]);
  return rows.map((r) => r.id);
}
