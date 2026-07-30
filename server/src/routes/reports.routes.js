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

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

reportsRouter.get("/response-time", getResponseTimeSeries);
reportsRouter.get("/fulfillment-log", getFulfillmentLog);
reportsRouter.get("/fulfillment-breakdown", getFulfillmentBreakdown);
reportsRouter.get("/system-health", getSystemHealth);
reportsRouter.get("/kpis", getKpis);
reportsRouter.get("/demand-forecast", getDemandForecast);
