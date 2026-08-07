import { Router } from "express";
import {
  listDonors,
  getDonor,
  createDonor,
  setDonorEligibility,
  exportDonors,
  listAppointmentsForDay,
  createAppointment,
  updateAppointmentStatus,
  completeAppointment,
} from "../controllers/donors.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requireSection, requireHospitalScope } from "../middleware/permissions.js";
import { pool } from "../db/pool.js";

// Donors themselves are hospital-agnostic (a shared pool — see schema.sql),
// so donorsRouter is intentionally NOT hospital-scoped, only section-gated.
// Appointments, being tied to one hospital, are scoped below.
export const donorsRouter = Router();
donorsRouter.use(requireAuth, requireSection("donor_management", "view"));

// NOTE: /export must be registered before /:id, or Express would match
// "export" as an :id param instead.
donorsRouter.get("/export", exportDonors);
donorsRouter.get("/", listDonors);
donorsRouter.post("/", requireSection("donor_management", "edit"), createDonor);
donorsRouter.get("/:id", getDonor);
donorsRouter.patch("/:id/eligibility", requireSection("donor_management", "edit"), setDonorEligibility);

// Looks up an existing appointment's own hospital_id — updateAppointmentStatus
// and completeAppointment identify their target purely by :id, with no
// hospitalId anywhere on the request, so requireHospitalScope needs this to
// know which hospital a scoped admin would be acting on.
async function appointmentHospitalId(req) {
  const { rows } = await pool.query("SELECT hospital_id FROM appointments WHERE id = $1", [req.params.id]);
  return rows[0]?.hospital_id ?? null;
}

export const appointmentsRouter = Router();
appointmentsRouter.use(requireAuth, requireSection("donor_management", "view"));

appointmentsRouter.get("/", requireHospitalScope(), listAppointmentsForDay);
appointmentsRouter.post("/", requireSection("donor_management", "edit"), requireHospitalScope(), createAppointment);
appointmentsRouter.patch(
  "/:id",
  requireSection("donor_management", "edit"),
  requireHospitalScope(appointmentHospitalId),
  updateAppointmentStatus
);
appointmentsRouter.post(
  "/:id/complete",
  requireSection("donor_management", "edit"),
  requireHospitalScope(appointmentHospitalId),
  completeAppointment
);
