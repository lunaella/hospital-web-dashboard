import { pool } from "../db/pool.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Backs the super admin's hospital switcher — every hospital in the system,
// for populating the dropdown. The frontend adds its own "All Hospitals"
// option on top of this list; that's a UI-only concept; it isn't a row here.
export const listHospitals = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, code, name, city FROM hospitals ORDER BY name`
  );
  res.json(rows);
});
