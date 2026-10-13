import { Router } from "express";
import {
  listRequests,
  createRequest,
  approveRequest,
  rejectRequest,
  fulfillRequest,
  getRequestNotifications,
} from "../controllers/requests.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requireSection, requireHospitalScope, requireSuperAdmin } from "../middleware/permissions.js";
import { pool } from "../db/pool.js";

// fulfillRequest and getRequestNotifications identify their target by its
// own request_code, with no hospitalId anywhere on the request.
async function requestHospitalId(req) {
  const { rows } = await pool.query("SELECT hospital_id FROM blood_requests WHERE request_code = $1", [
    req.params.code,
  ]);
  return rows[0]?.hospital_id ?? null;
}

export const requestsRouter = Router();
requestsRouter.use(requireAuth, requireSection("broadcasts", "view"));

requestsRouter.get("/", requireHospitalScope(), listRequests);
requestsRouter.post("/", requireSection("broadcasts", "edit"), requireHospitalScope(), createRequest);
// Hospitals' broadcasts wait as PENDING_APPROVAL until the super admin
// reviews them (see createRequest).
requestsRouter.post("/:code/approve", requireSuperAdmin, approveRequest);
requestsRouter.post("/:code/reject", requireSuperAdmin, rejectRequest);
requestsRouter.patch(
  "/:code/fulfill",
  requireSection("broadcasts", "edit"),
  requireHospitalScope(requestHospitalId),
  fulfillRequest
);
requestsRouter.get("/:code/notifications", requireHospitalScope(requestHospitalId), getRequestNotifications);
