import { Router } from "express";
import {
  listDonationUnits,
  releaseDonationUnit,
  discardDonationUnit,
  issueDonationUnit,
} from "../controllers/donationUnits.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requireSection, requireHospitalScope } from "../middleware/permissions.js";
import { pool } from "../db/pool.js";

async function unitHospitalId(req) {
  const { rows } = await pool.query("SELECT hospital_id FROM donation_units WHERE id = $1", [req.params.id]);
  return rows[0]?.hospital_id ?? null;
}

// Collected units: release after testing, discard, or issue to a request
// (see donationUnits.controller.js).
export const donationUnitsRouter = Router();
donationUnitsRouter.use(requireAuth, requireSection("donor_management", "view"));
donationUnitsRouter.get("/", requireHospitalScope(), listDonationUnits);
for (const [action, handler] of [
  ["release", releaseDonationUnit],
  ["discard", discardDonationUnit],
  ["issue", issueDonationUnit],
]) {
  donationUnitsRouter.post(
    `/:id/${action}`,
    requireSection("donor_management", "edit"),
    requireHospitalScope(unitHospitalId),
    handler
  );
}
