import { Router } from "express";
import {
  getResponseTimeSeries,
  getFulfillmentLog,
  getFulfillmentBreakdown,
  getSystemHealth,
  getKpis,
  getDemandForecast,
} from "../controllers/reports.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requireSection, requireHospitalScope } from "../middleware/permissions.js";

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireSection("reports", "view"));

reportsRouter.get("/response-time", requireHospitalScope(), getResponseTimeSeries);
reportsRouter.get("/fulfillment-log", requireHospitalScope(), getFulfillmentLog);
reportsRouter.get("/fulfillment-breakdown", requireHospitalScope(), getFulfillmentBreakdown);
// system-health is a system reachability check, not hospital data — no gate.
reportsRouter.get("/system-health", getSystemHealth);
reportsRouter.get("/kpis", requireHospitalScope(), getKpis);
reportsRouter.get("/demand-forecast", requireHospitalScope(), getDemandForecast);
