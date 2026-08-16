import { Router } from "express";
import {
  requestOtp,
  verifyOtpAndLogin,
  donorPasswordLogin,
  completeProfile,
  donorLogout,
} from "../controllers/donorAuth.controller.js";
import { requireDonorPendingAuth, requireDonorAuth } from "../middleware/donorAuth.js";

// Public (unauthenticated) donor login/signup flow for the Android app:
//   1. POST /request-otp     { phone }              -> SMS sent
//   2. POST /verify-otp      { phone, code }         -> token (+ needsProfile)
//   3. POST /complete-profile{ name, bloodType, password, ... } -> only if step 2 said needsProfile: true
//   OR, once a donor has set a password (at step 3 or later via PATCH /api/donor/me):
//      POST /login           { identifier, password } -> token, no SMS round trip
//                             (identifier = email or phone; matches the real
//                             app's login screen, which lets the donor pick either)
export const donorAuthRouter = Router();

donorAuthRouter.post("/request-otp", requestOtp);
donorAuthRouter.post("/verify-otp", verifyOtpAndLogin);
donorAuthRouter.post("/login", donorPasswordLogin);
donorAuthRouter.post("/complete-profile", requireDonorPendingAuth, completeProfile);
donorAuthRouter.post("/logout", requireDonorAuth, donorLogout);
