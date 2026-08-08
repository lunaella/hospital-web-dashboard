import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env.js";

export function signSessionToken(adminId) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: adminId, jti }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
  return { token, jti };
}

// Donor-facing tokens (the Android app) are deliberately a different shape
// (role: "donor"/"donor_pending") from an admin's, even though both are
// signed with the same secret — requireAuth and requireDonorAuth each check
// the role before trusting `sub`, so a donor token can never be replayed
// against an admin route or vice versa. Longer-lived than an admin session
// since staying logged in is the normal expectation for a consumer app, not
// a shared office terminal.
export function signDonorToken(donorId) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: donorId, jti, role: "donor" }, env.jwtSecret, {
    expiresIn: env.donorJwtExpiresIn,
  });
  return { token, jti };
}

// Issued right after OTP verification for a phone with no matching donor
// record yet — only valid for POST /api/donor-auth/complete-profile, and
// deliberately short-lived (it carries no session/Redis entry to revoke).
export function signDonorPendingToken(phone) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ phone, jti, role: "donor_pending" }, env.jwtSecret, {
    expiresIn: "15m",
  });
  return { token, jti };
}

export function verifySessionToken(token) {
  return jwt.verify(token, env.jwtSecret); // throws if invalid/expired
}
