import { verifySessionToken } from "../utils/jwt.js";
import { ensureRedisConnected } from "../db/redis.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { pool } from "../db/pool.js";

function extractToken(req) {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

// Mirrors requireAuth (server/src/middleware/auth.js) for the donor side of
// the API — same JWT + Redis-session pattern (donor_session:<jti> instead
// of session:<jti>), kept as its own middleware rather than teaching
// requireAuth a "donor mode" so an admin token and a donor token can never
// be used interchangeably, even by accident.
export const requireDonorAuth = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "Missing bearer token." });

  let payload;
  try {
    payload = verifySessionToken(token);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
  if (payload.role !== "donor") {
    return res.status(401).json({ error: "Invalid token for this endpoint." });
  }

  const redis = await ensureRedisConnected();
  const sessionExists = await redis.get(`donor_session:${payload.jti}`);
  if (!sessionExists) {
    return res.status(401).json({ error: "Session has been logged out or expired." });
  }

  const { rows } = await pool.query(
    `SELECT id, donor_code AS "donorCode", name, phone, email, blood_type AS "bloodType" FROM donors WHERE id = $1`,
    [payload.sub]
  );
  if (!rows[0]) {
    return res.status(401).json({ error: "This donor account no longer exists." });
  }

  req.donor = { ...rows[0], jti: payload.jti };
  next();
});

// Gate for the one endpoint (POST /api/donor-auth/complete-profile) that's
// reachable with a phone-verified-but-not-yet-a-donor-record token —
// everything else under /api/donor requires the real requireDonorAuth above.
export const requireDonorPendingAuth = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "Missing bearer token." });

  let payload;
  try {
    payload = verifySessionToken(token);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
  if (payload.role !== "donor_pending") {
    return res.status(401).json({ error: "Invalid token for this endpoint." });
  }

  req.pendingPhone = payload.phone;
  next();
});
