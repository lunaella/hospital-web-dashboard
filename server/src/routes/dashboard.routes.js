import { Router } from "express";
import { getStats, getMonitoring, getStock, updateStockThreshold, getArrivals, getHealth } from "../controllers/dashboard.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requireSection, requireHospitalScope } from "../middleware/permissions.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth, requireSection("dashboard", "view"));
// /health is a system reachability check (DB/Redis), not hospital data — no
// hospitalId gate needed there even though the frontend's api.get() always
// tacks a ?hospitalId= query param onto every request.
dashboardRouter.get("/stats", requireHospitalScope(), getStats);
dashboardRouter.get("/monitoring", requireHospitalScope(), getMonitoring);
dashboardRouter.get("/stock", requireHospitalScope(), getStock);
dashboardRouter.patch("/stock/:bloodType", requireSection("dashboard", "edit"), requireHospitalScope(), updateStockThreshold);
dashboardRouter.get("/arrivals", requireHospitalScope(), getArrivals);
dashboardRouter.get("/health", getHealth);
