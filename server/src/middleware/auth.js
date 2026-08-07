import { verifySessionToken } from "../utils/jwt.js";
import { ensureRedisConnected } from "../db/redis.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { pool } from "../db/pool.js";

// Verifies the JWT signature/expiry, then checks Redis for a matching
// session key. Login writes `session:{jti}` (TTL = token expiry); logout
// deletes it. This is what makes "Terminating this session will immediately
// invalidate your JWT" true — without the Redis check, a stolen token would
// stay valid until it expires on its own, even after the user logs out.
//
// Also loads clearance/can_manage_team fresh from the DB on every request
// (rather than trusting the JWT payload) so a Team Access change — e.g. the
// super admin revoking someone's access — takes effect on their very next
// request instead of waiting for them to log out and back in.
export const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing bearer token." });
  }

  let payload;
  try {
    payload = verifySessionToken(token);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }

  const redis = await ensureRedisConnected();
  const sessionExists = await redis.get(`session:${payload.jti}`);
  if (!sessionExists) {
    return res.status(401).json({ error: "Session has been logged out or expired." });
  }

  const { rows } = await pool.query(
    `SELECT clearance, can_manage_team AS "canManageTeam" FROM admins WHERE id = $1`,
    [payload.sub]
  );
  if (!rows[0]) {
    return res.status(401).json({ error: "This account no longer exists." });
  }

  req.admin = {
    id: payload.sub,
    jti: payload.jti,
    clearance: rows[0].clearance,
    isSuperAdmin: rows[0].clearance === "FULL_ROOT_ACCESS_LEVEL_5",
    canManageTeam: rows[0].canManageTeam,
  };
  next();
});
