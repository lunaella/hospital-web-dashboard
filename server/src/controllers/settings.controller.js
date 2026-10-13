import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const HASH_ROUNDS = 12;

export const updateEmail = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "email is required." });

  const { rows } = await pool.query(
    `UPDATE admins SET email = $1, updated_at = now() WHERE id = $2
     RETURNING id, username, email, clearance`,
    [email, req.admin.id]
  );
  res.json(rows[0]);
});

export const updatePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword) {
    return res.status(400).json({ error: "Enter your current password to change it." });
  }
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters." });
  }

  const { rows } = await pool.query("SELECT password_hash FROM admins WHERE id = $1", [req.admin.id]);
  const admin = rows[0];
  const matches = admin && (await bcrypt.compare(currentPassword, admin.password_hash));
  if (!matches) {
    return res.status(401).json({ error: "Current password is incorrect." });
  }

  const newHash = await bcrypt.hash(newPassword, HASH_ROUNDS);
  await pool.query("UPDATE admins SET password_hash = $1, updated_at = now() WHERE id = $2", [
    newHash,
    req.admin.id,
  ]);

  res.json({ message: "Credentials updated successfully." });
});

// "Active Terminal Session" card
export const getActiveSession = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT session_code AS "sessionCode", engine, system, ip_address AS "ipAddress", region, created_at AS "createdAt"
     FROM admin_sessions
     WHERE admin_id = $1 AND is_active = true
     ORDER BY created_at DESC
     LIMIT 1`,
    [req.admin.id]
  );
  res.json(rows[0] ?? null);
});

// The Red Cross hotline every hospital admin sees as "Call Red Cross"
// (CallRedCrossButton.jsx), set by the super admin in Settings. Readable by
// any signed-in admin; only a super admin can change it (see routes).
const RED_CROSS_PHONE_KEY = "red_cross_phone";

export const getRedCrossContact = asyncHandler(async (req, res) => {
  const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = $1", [RED_CROSS_PHONE_KEY]);
  res.json({ phone: rows[0]?.value ?? null });
});

export const updateRedCrossContact = asyncHandler(async (req, res) => {
  const raw = req.body?.phone;
  if (raw !== null && raw !== undefined && typeof raw !== "string") {
    return res.status(400).json({ error: "phone must be a string." });
  }
  const phone = raw?.trim() || null;
  if (phone && (phone.length > 30 || !/\d/.test(phone))) {
    return res.status(400).json({ error: "Enter a valid phone number." });
  }
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [RED_CROSS_PHONE_KEY, phone, req.admin.id]
  );
  res.json({ phone });
});
