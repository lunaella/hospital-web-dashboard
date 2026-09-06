import { Router } from "express";
import {
  getMyProfile,
  updateMyProfile,
  listOpenRequestsForDonor,
  listHospitalsForDonors,
  listMyAppointments,
  bookMyAppointment,
  cancelMyAppointment,
  listMyDonations,
  listMyNotifications,
  markMyNotificationsRead,
  getAppointmentQrToken,
  deleteMyAccount,
  submitVerification,
  startDiditVerification,
} from "../controllers/donorPortal.controller.js";
import { requireDonorAuth } from "../middleware/donorAuth.js";
import { uploadVerificationFiles } from "../middleware/upload.js";

// Everything here requires a real donor session (see middleware/donorAuth.js)
// — this is the "logged in" surface of the Android app's API.
export const donorPortalRouter = Router();
donorPortalRouter.use(requireDonorAuth);

donorPortalRouter.get("/me", getMyProfile);
donorPortalRouter.patch("/me", updateMyProfile);
donorPortalRouter.delete("/me", deleteMyAccount);
donorPortalRouter.post("/me/verification", uploadVerificationFiles, submitVerification); // legacy on-device flow, no longer called by the app
donorPortalRouter.post("/me/verification/didit-session", startDiditVerification);
donorPortalRouter.get("/requests", listOpenRequestsForDonor);
donorPortalRouter.get("/hospitals", listHospitalsForDonors);
donorPortalRouter.get("/appointments", listMyAppointments);
donorPortalRouter.post("/appointments", bookMyAppointment);
donorPortalRouter.patch("/appointments/:id/cancel", cancelMyAppointment);
donorPortalRouter.get("/appointments/:id/qr", getAppointmentQrToken);
donorPortalRouter.get("/donations", listMyDonations);
donorPortalRouter.get("/notifications", listMyNotifications);
donorPortalRouter.patch("/notifications/read", markMyNotificationsRead);
