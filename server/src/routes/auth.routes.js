import { Router } from "express";
import { login, logout, me, forgotPassword, resetPassword } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

authRouter.post("/login", login);
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/reset-password", resetPassword);
authRouter.post("/logout", requireAuth, logout);
authRouter.get("/me", requireAuth, me);
