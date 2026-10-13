import { Router } from "express";
import {
  updateEmail,
  updatePassword,
  getActiveSession,
  getRedCrossContact,
  updateRedCrossContact,
  getApprovalAlertSettings,
  updateApprovalAlertSettings,
} from "../controllers/settings.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requireSuperAdmin } from "../middleware/permissions.js";

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.patch("/email", updateEmail);
settingsRouter.patch("/password", updatePassword);
settingsRouter.get("/session", getActiveSession);
settingsRouter.get("/red-cross-contact", getRedCrossContact);
settingsRouter.patch("/red-cross-contact", requireSuperAdmin, updateRedCrossContact);
settingsRouter.get("/approval-alerts", requireSuperAdmin, getApprovalAlertSettings);
settingsRouter.patch("/approval-alerts", requireSuperAdmin, updateApprovalAlertSettings);
