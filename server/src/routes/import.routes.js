import { Router } from "express";
import { importInventory, importRequests, importAppointments } from "../controllers/import.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requireSection, requireHospitalScope } from "../middleware/permissions.js";
import { uploadSingleFile } from "../middleware/upload.js";

export const importRouter = Router();
importRouter.use(requireAuth, requireSection("settings", "edit"));

// Donor import was removed (see import.controller.js). Inventory/requests/
// appointments imports all take
// hospitalId as a form field (multer parses it into req.body alongside the
// file), which requireHospitalScope() reads the same way it reads a normal
// JSON body's hospitalId.
importRouter.post("/inventory", uploadSingleFile, requireHospitalScope(), importInventory);
importRouter.post("/requests", uploadSingleFile, requireHospitalScope(), importRequests);
importRouter.post("/appointments", uploadSingleFile, requireHospitalScope(), importAppointments);
