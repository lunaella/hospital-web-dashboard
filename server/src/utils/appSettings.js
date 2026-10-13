import { pool } from "../db/pool.js";
import { phoneDigits, isValidPhDigits, normalizePhoneForStorage } from "./phone.js";

// Small app-wide key/value settings the super admin edits in Settings
// (app_settings, migration 025). Keys in use:
//   red_cross_phone          — "Call Red Cross" number shown to hospitals
//   red_cross_alert_numbers  — mobiles texted for each new pending broadcast
//   red_cross_backup_numbers — mobiles added once that alert escalates
export const SETTING_KEYS = {
  redCrossPhone: "red_cross_phone",
  alertNumbers: "red_cross_alert_numbers",
  backupNumbers: "red_cross_backup_numbers",
};

export async function getSettings(keys) {
  const { rows } = await pool.query("SELECT key, value FROM app_settings WHERE key = ANY($1)", [keys]);
  return Object.fromEntries(keys.map((k) => [k, rows.find((r) => r.key === k)?.value ?? null]));
}

export async function setSetting(key, value, adminId) {
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [key, value, adminId]
  );
}

// Mobile number lists are stored as one comma-separated string of
// "+639XXXXXXXXX" (the app's canonical phone form, see phone.js).
export function splitNumberList(stored) {
  return stored ? stored.split(",").filter(Boolean) : [];
}

// Accepts an array, or one string separated by commas/semicolons/new
// lines, and returns { numbers } (normalized, de-duplicated) or { error }
// naming the first entry that isn't a Philippine mobile number — SMS can't
// reach a landline, so those are rejected here rather than failing later.
export function parseMobileList(input) {
  const parts = (Array.isArray(input) ? input : String(input ?? "").split(/[,;\n]/))
    .map((p) => String(p).trim())
    .filter(Boolean);
  const numbers = [];
  for (const part of parts) {
    if (!isValidPhDigits(phoneDigits(part))) {
      return { error: `"${part}" isn't a Philippine mobile number (e.g. 0917 123 4567). Texts can't reach landlines.` };
    }
    const normalized = normalizePhoneForStorage(part);
    if (!numbers.includes(normalized)) numbers.push(normalized);
  }
  if (numbers.length > 10) return { error: "Enter at most 10 numbers." };
  return { numbers };
}
