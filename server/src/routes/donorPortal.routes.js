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
  startDiditVerification,
  registerDevice,
  unregisterDevice,
  uploadMyPhoto,
  uploadMySignature,
  checkNearbyRequest,
  updateMyLocation,
  submitMalariaCheck,
} from "../controllers/donorPortal.controller.js";
import { requireDonorAuth } from "../middleware/donorAuth.js";
import { uploadProfilePhoto, uploadSignature } from "../middleware/upload.js";

// Everything here requires a real donor session (see middleware/donorAuth.js)
// — this is the "logged in" surface of the Android app's API.
export const donorPortalRouter = Router();
donorPortalRouter.use(requireDonorAuth);

donorPortalRouter.get("/me", getMyProfile);
donorPortalRouter.patch("/me", updateMyProfile);
donorPortalRouter.delete("/me", deleteMyAccount);
donorPortalRouter.post("/me/malaria-check", submitMalariaCheck);
donorPortalRouter.post("/me/photo", uploadProfilePhoto, uploadMyPhoto);
donorPortalRouter.post("/me/signature", uploadSignature, uploadMySignature);
// The legacy on-device flow marked a donor verified from whatever the client
// sent, with no third-party check. The app uses Didit (below) instead, so
// this is closed; verification only comes from the signed Didit webhook.
donorPortalRouter.post("/me/verification", (req, res) =>
  res.status(410).json({ error: "This verification method is no longer available. Update the app and verify with Didit." })
);
donorPortalRouter.post("/me/verification/didit-session", startDiditVerification);
donorPortalRouter.get("/requests", listOpenRequestsForDonor);
donorPortalRouter.get("/requests/nearby", checkNearbyRequest);
donorPortalRouter.patch("/location", updateMyLocation);
donorPortalRouter.get("/hospitals", listHospitalsForDonors);
donorPortalRouter.get("/appointments", listMyAppointments);
donorPortalRouter.post("/appointments", bookMyAppointment);
donorPortalRouter.patch("/appointments/:id/cancel", cancelMyAppointment);
donorPortalRouter.get("/appointments/:id/qr", getAppointmentQrToken);
donorPortalRouter.get("/donations", listMyDonations);
donorPortalRouter.get("/notifications", listMyNotifications);
donorPortalRouter.patch("/notifications/read", markMyNotificationsRead);
donorPortalRouter.post("/devices", registerDevice);
donorPortalRouter.delete("/devices", unregisterDevice);
