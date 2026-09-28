import { Router } from "express";
import { listHospitals, createHospital, updateHospital, deleteHospital } from "../controllers/hospitals.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requireSuperAdmin } from "../middleware/permissions.js";

export const hospitalsRouter = Router();
hospitalsRouter.use(requireAuth);

// GET is intentionally NOT gated behind super admin: the hospital switcher
// in AppShell (HospitalContext) calls this on every page — Dashboard, Donor
// Management, Reports — regardless of who's logged in, so it needs to stay
// available to every authenticated admin. Only creating/editing/removing a
// hospital (the Hospital Network card inside Settings) is a real
// administrative action, and one that affects the whole network rather
// than one admin's own hospital — so it's super-admin-only, not just
// requireSection("settings", "edit") (which a hospital-scoped team manager
// could otherwise have for self-service settings, without meaning to hand
// them "add/remove hospitals" too).
hospitalsRouter.get("/", listHospitals);
hospitalsRouter.post("/", requireSuperAdmin, createHospital);
hospitalsRouter.patch("/:id", requireSuperAdmin, updateHospital);
hospitalsRouter.delete("/:id", requireSuperAdmin, deleteHospital);
