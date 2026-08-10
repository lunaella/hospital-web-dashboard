import { Router } from "express";
import { listHospitals, createHospital, updateHospital, deleteHospital } from "../controllers/hospitals.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requireSection } from "../middleware/permissions.js";

export const hospitalsRouter = Router();
hospitalsRouter.use(requireAuth);

// GET is intentionally NOT gated behind the 'settings' section: the hospital
// switcher in AppShell (HospitalContext) calls this on every page — Dashboard,
// Donor Management, Reports — regardless of whether that admin has any
// Settings access, so it needs to stay available to every authenticated
// admin. Only creating/editing hospitals (the Hospital Network card inside
// Settings) is a real administrative action worth gating.
hospitalsRouter.get("/", listHospitals);
hospitalsRouter.post("/", requireSection("settings", "edit"), createHospital);
hospitalsRouter.patch("/:id", requireSection("settings", "edit"), updateHospital);
hospitalsRouter.delete("/:id", requireSection("settings", "edit"), deleteHospital);
