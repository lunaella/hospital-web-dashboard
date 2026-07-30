import { Router } from "express";
import { getStats, getMonitoring, getStock, getArrivals, getHealth } from "../controllers/dashboard.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);
dashboardRouter.get("/stats", getStats);
dashboardRouter.get("/monitoring", getMonitoring);
dashboardRouter.get("/stock", getStock);
dashboardRouter.get("/arrivals", getArrivals);
dashboardRouter.get("/health", getHealth);
