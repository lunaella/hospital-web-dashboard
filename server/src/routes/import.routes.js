import { Router } from "express";
import { importDonors, importInventory, importRequests, importAppointments } from "../controllers/import.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requireSection, requireHospitalScope } from "../middleware/permissions.js";
import { uploadSingleFile } from "../middleware/upload.js";

export const importRouter = Router();
importRouter.use(requireAuth, requireSection("settings", "edit"));

// Donors are hospital-agnostic (see donors.routes.js), so no hospital scope
// gate on that one. Inventory/requests/appointments imports all take
// hospitalId as a form field (multer parses it into req.body alongside the
// file), which requireHospitalScope() reads the same way it reads a normal
// JSON body's hospitalId.
importRouter.post("/donors", uploadSingleFile, importDonors);
importRouter.post("/inventory", uploadSingleFile, requireHospitalScope(), importInventory);
importRouter.post("/requests", uploadSingleFile, requireHospitalScope(), importRequests);
importRouter.post("/appointments", uploadSingleFile, requireHospitalScope(), importAppointments);
