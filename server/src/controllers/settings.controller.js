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
  if (!newPassword || newPassword.length < 16) {
    return res.status(400).json({ error: "New password must be at least 16 characters." });
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
