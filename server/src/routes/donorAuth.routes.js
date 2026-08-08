import { Router } from "express";
import { requestOtp, verifyOtpAndLogin, completeProfile, donorLogout } from "../controllers/donorAuth.controller.js";
import { requireDonorPendingAuth, requireDonorAuth } from "../middleware/donorAuth.js";

// Public (unauthenticated) donor login/signup flow for the Android app:
//   1. POST /request-otp     { phone }              -> SMS sent
//   2. POST /verify-otp      { phone, code }         -> token (+ needsProfile)
//   3. POST /complete-profile{ name, bloodType, ... } -> only if step 2 said needsProfile: true
export const donorAuthRouter = Router();

donorAuthRouter.post("/request-otp", requestOtp);
donorAuthRouter.post("/verify-otp", verifyOtpAndLogin);
donorAuthRouter.post("/complete-profile", requireDonorPendingAuth, completeProfile);
donorAuthRouter.post("/logout", requireDonorAuth, donorLogout);
