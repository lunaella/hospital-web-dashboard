import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";
import { ensureRedisConnected } from "../db/redis.js";
import { signSessionToken } from "../utils/jwt.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { resolveRegion } from "../utils/geoip.js";
import { SECTIONS, emptyPermissions } from "../utils/permissionSections.js";
import { getAllowedHospitalIds } from "../utils/hospitalScope.js";

const EXPIRES_IN_SECONDS = 8 * 60 * 60; // keep in sync with env.jwtExpiresIn ("8h" default)

// Login rate limiting: tracked per IP+username combo so one attacker can't
// grind the admin account from a single source, while a shared IP (e.g. a
// hospital's NAT'd network) hammering many different usernames isn't
// penalized for a stranger's failed guesses.
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_WINDOW_SECONDS = 15 * 60;

function loginAttemptsKey(ip, username) {
  return `login_attempts:${ip}:${String(username).toLowerCase()}`;
}

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

// Pulls a short OS label ("macOS", "Windows", "iOS", "Android", "Linux")
// out of the same User-Agent string, for the session card's SYSTEM tile.
// Order matters here too: iOS/Android UAs also contain "Mac OS X"/"Linux"
// substrings, so the more specific mobile markers must be checked first.
// Note: modern browser UAs report Windows 11 as "Windows NT 10.0" too (the
// NT kernel version wasn't bumped), so there's no reliable way to tell 10
// and 11 apart from User-Agent alone — this reports "Windows" without a
// version number rather than guessing.
function parseSystemLabel(userAgent) {
  if (!userAgent) return null;
  const patterns = [
    ["iOS", /iPhone|iPad|iPod/],
    ["Android", /Android/],
    ["Windows", /Windows NT/],
    ["macOS", /Mac OS X/],
    ["Chrome OS", /CrOS/],
    ["Linux", /Linux/],
  ];
  for (const [name, pattern] of patterns) {
    if (pattern.test(userAgent)) return name;
  }
  return null;
}

export const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const redis = await ensureRedisConnected();
  const attemptsKey = loginAttemptsKey(req.ip, username);
  const attempts = Number((await redis.get(attemptsKey)) ?? 0);
  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    const ttl = await redis.ttl(attemptsKey);
    const waitMinutes = Math.max(1, Math.ceil(ttl / 60));
    return res.status(429).json({
      error: `Too many failed login attempts. Try again in ${waitMinutes} minute${waitMinutes === 1 ? "" : "s"}.`,
    });
  }

  const { rows } = await pool.query(
    "SELECT id, username, password_hash, clearance FROM admins WHERE username = $1",
    [username]
  );
  const admin = rows[0];

  const passwordMatches = admin ? await bcrypt.compare(password, admin.password_hash) : false;
  if (!admin || !passwordMatches) {
    // First failure in a fresh window starts the countdown; INCR after
    // EXPIRE is already set just keeps counting toward the same deadline.
    const newCount = await redis.incr(attemptsKey);
    if (newCount === 1) await redis.expire(attemptsKey, LOCKOUT_WINDOW_SECONDS);
    return res.status(401).json({ error: "Invalid username or password." });
  }

  // Successful login clears any prior failed attempts against this account.
  await redis.del(attemptsKey);

  const { token, jti } = signSessionToken(admin.id);
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
      parseSystemLabel(req.headers["user-agent"]),
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

// Used both to hydrate the Settings > Account Credentials card and, via
// AuthContext on the frontend, to decide what the logged-in admin can see
// and do across the whole app (nav items, page guards, action buttons).
export const me = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, username, email, clearance, can_manage_team AS "canManageTeam" FROM admins WHERE id = $1`,
    [req.admin.id]
  );
  const admin = rows[0];
  if (!admin) return res.status(404).json({ error: "Admin not found." });

  const isSuperAdmin = admin.clearance === "FULL_ROOT_ACCESS_LEVEL_5";

  // Section permissions: super admins bypass admin_permissions entirely and
  // always have edit access everywhere (reflected here instead of
  // misleadingly showing 'none' for a super admin with no stored rows).
  // Team managers are NOT exempt from this — being able to manage the team
  // roster doesn't imply edit access to every section, so their real
  // permissions still come from admin_permissions like anyone else's.
  let permissions;
  if (isSuperAdmin) {
    permissions = Object.fromEntries(SECTIONS.map((s) => [s, "edit"]));
  } else {
    permissions = emptyPermissions();
    const { rows: permRows } = await pool.query(
      "SELECT section, level FROM admin_permissions WHERE admin_id = $1",
      [admin.id]
    );
    for (const row of permRows) permissions[row.section] = row.level;
  }

  // Hospital scope: super admins and team managers both always see every
  // hospital (requireHospitalScope bypasses both the same way), so neither
  // needs a real assignedHospitalIds lookup.
  const assignedHospitalIds =
    isSuperAdmin || admin.canManageTeam ? [] : await getAllowedHospitalIds(admin.id);

  res.json({
    ...admin,
    isSuperAdmin,
    permissions,
    assignedHospitalIds,
    hospitalRestricted: assignedHospitalIds.length > 0,
  });
});
