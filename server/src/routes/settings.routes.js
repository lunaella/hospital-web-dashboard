import { Router } from "express";
import { updateEmail, updatePassword, getActiveSession } from "../controllers/settings.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.patch("/email", updateEmail);
settingsRouter.patch("/password", updatePassword);
settingsRouter.get("/session", getActiveSession);
