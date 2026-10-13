import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getSettings, setSetting, splitNumberList, parseMobileList, SETTING_KEYS } from "../utils/appSettings.js";
import { ESCALATE_AFTER_MIN, MAX_ESCALATIONS } from "../services/approvalAlerts.service.js";

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
export const getRedCrossContact = asyncHandler(async (req, res) => {
  const settings = await getSettings([SETTING_KEYS.redCrossPhone]);
  res.json({ phone: settings[SETTING_KEYS.redCrossPhone] });
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
  await setSetting(SETTING_KEYS.redCrossPhone, phone, req.admin.id);
  res.json({ phone });
});

// Who gets texted about broadcasts awaiting approval
// (services/approvalAlerts.service.js). Super admin only, both ways —
// these are staff's personal mobiles, unlike the public hotline above.
export const getApprovalAlertSettings = asyncHandler(async (req, res) => {
  const settings = await getSettings([SETTING_KEYS.alertNumbers, SETTING_KEYS.backupNumbers]);
  res.json({
    alertNumbers: splitNumberList(settings[SETTING_KEYS.alertNumbers]),
    backupNumbers: splitNumberList(settings[SETTING_KEYS.backupNumbers]),
    escalateAfterMinutes: ESCALATE_AFTER_MIN,
    maxEscalations: MAX_ESCALATIONS,
  });
});

export const updateApprovalAlertSettings = asyncHandler(async (req, res) => {
  const alerts = parseMobileList(req.body?.alertNumbers);
  if (alerts.error) return res.status(400).json({ error: `Alert numbers: ${alerts.error}` });
  const backups = parseMobileList(req.body?.backupNumbers);
  if (backups.error) return res.status(400).json({ error: `Backup numbers: ${backups.error}` });

  await setSetting(SETTING_KEYS.alertNumbers, alerts.numbers.join(",") || null, req.admin.id);
  await setSetting(SETTING_KEYS.backupNumbers, backups.numbers.join(",") || null, req.admin.id);
  res.json({ alertNumbers: alerts.numbers, backupNumbers: backups.numbers });
});
