import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";
import { ensureRedisConnected } from "../db/redis.js";
import { signSessionToken } from "../utils/jwt.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { resolveRegion } from "../utils/geoip.js";

const EXPIRES_IN_SECONDS = 8 * 60 * 60; // keep in sync with env.jwtExpiresIn ("8h" default)

// Pulls a short "Chrome 122" / "Safari 17" style label out of a raw
// User-Agent string for display on the Settings session card. Falls back
// to a truncated raw string for UAs the simple regex doesn't recognize,
// so we never depend on the browser sending something we expect.
function parseEngineLabel(userAgent) {
  if (!userAgent) return null;
  // Order matters: Chromium-based Edge/Opera UAs also contain "Chrome/xxx",
  // so their own markers must be checked first or they'd misreport as Chrome.
  const patterns = [
    ["Edge", /Edg\/(\d+)/],
    ["Opera", /OPR\/(\d+)/],
    ["Chrome", /Chrome\/(\d+)/],
    ["Firefox", /Firefox\/(\d+)/],
    ["Safari", /Version\/(\d+).*Safari/],
  ];
  for (const [name, pattern] of patterns) {
    const match = userAgent.match(pattern);
    if (match) return `${name} ${match[1]}`;
  }
  return userAgent.slice(0, 100);
}

export const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const { rows } = await pool.query(
    "SELECT id, username, password_hash, clearance FROM admins WHERE username = $1",
    [username]
  );
  const admin = rows[0];

  const passwordMatches = admin ? await bcrypt.compare(password, admin.password_hash) : false;
  if (!admin || !passwordMatches) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const { token, jti } = signSessionToken(admin.id);

  const redis = await ensureRedisConnected();
  await redis.set(`session:${jti}`, admin.id, "EX", EXPIRES_IN_SECONDS);

  // Best-effort IP geolocation for the Settings "Last login from ..." line.
  // Never let a slow/unreachable lookup block or fail the login itself.
  const region = await resolveRegion(req.ip);

  await pool.query(
    `INSERT INTO admin_sessions (admin_id, session_code, engine, system, ip_address, region)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      admin.id,
      jti.slice(0, 8).toUpperCase(),
      parseEngineLabel(req.headers["user-agent"]),
      null,
      req.ip,
      region,
    ]
  );

  res.json({
    token,
    expiresIn: EXPIRES_IN_SECONDS,
    admin: { id: admin.id, username: admin.username, clearance: admin.clearance },
  });
});

export const logout = asyncHandler(async (req, res) => {
  const redis = await ensureRedisConnected();
  await redis.del(`session:${req.admin.jti}`);

  await pool.query(
    "UPDATE admin_sessions SET is_active = false, revoked_at = now() WHERE admin_id = $1 AND is_active = true",
    [req.admin.id]
  );

  res.status(204).send();
});

export const me = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, username, email, clearance FROM admins WHERE id = $1",
    [req.admin.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Admin not found." });
  res.json(rows[0]);
});
