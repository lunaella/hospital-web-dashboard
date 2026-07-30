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

export const donorsRouter = Router();
donorsRouter.use(requireAuth);

// NOTE: /export must be registered before /:id, or Express would match
// "export" as an :id param instead.
donorsRouter.get("/export", exportDonors);
donorsRouter.get("/", listDonors);
donorsRouter.post("/", createDonor);
donorsRouter.get("/:id", getDonor);
donorsRouter.patch("/:id/eligibility", setDonorEligibility);

export const appointmentsRouter = Router();
appointmentsRouter.use(requireAuth);

appointmentsRouter.get("/", listAppointmentsForDay);
appointmentsRouter.post("/", createAppointment);
appointmentsRouter.patch("/:id", updateAppointmentStatus);
appointmentsRouter.post("/:id/complete", completeAppointment);
