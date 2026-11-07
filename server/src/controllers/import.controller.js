import { pool } from "../db/pool.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { parseSpreadsheet } from "../utils/parseSpreadsheet.js";
import {
  field,
  normalizeBloodType,
  BLOOD_TYPES,
  finalizeResult,
  flattenAliases,
  INVENTORY_ALIASES,
  REQUEST_ALIASES,
  APPOINTMENT_ALIASES,
} from "../utils/importHelpers.js";
import { PRIORITY_LABEL, priorityFromInput } from "../utils/priorityLabels.js";

// knownAliases tells parseSpreadsheet which header row, among any title/
// note/blank rows a real hospital export might have above it, to actually
// treat as the column headers — see parseSpreadsheet.js's
// findHeaderRowIndex for why row 0 isn't a safe assumption.
function parseUploadedFile(req, aliasGroup) {
  if (!req.file) {
    const err = new Error('No file uploaded. Attach a .csv or .xlsx file as "file".');
    err.status = 400;
    throw err;
  }
  return parseSpreadsheet(req.file.buffer, req.file.originalname, flattenAliases(aliasGroup));
}

function parseDateOrNull(raw) {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Donor import was removed (panel revisions, Nov 2026): imported donors
// had no health screening or identity verification but could still receive
// broadcast alerts. Donors now join only through the app (screened and
// verified) or a staff walk-in record.

// POST /api/import/inventory — requires hospitalId (form field alongside the
// file; inventory is per hospital). One row per blood type: Blood Type,
// Units Available required; Critical/Low Threshold optional (existing
// thresholds — or the table defaults — are kept if omitted). Upserts rather
// than inserts, so re-running an import to fix a mistake just updates the
// same rows instead of erroring on the second attempt.
export const importInventory = asyncHandler(async (req, res) => {
  const { hospitalId } = req.body;
  if (!hospitalId) {
    return res.status(400).json({ error: "hospitalId is required." });
  }
  const rows = parseUploadedFile(req, INVENTORY_ALIASES);
  const result = { imported: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const bloodType = normalizeBloodType(field(row, ...INVENTORY_ALIASES.bloodType));
    const unitsRaw = field(row, ...INVENTORY_ALIASES.units);
    const criticalRaw = field(row, ...INVENTORY_ALIASES.critical);
    const lowRaw = field(row, ...INVENTORY_ALIASES.low);

    if (!bloodType) {
      result.errors.push({ row: rowNum, message: `Blood type must be one of: ${BLOOD_TYPES.join(", ")}.` });
      continue;
    }
    const units = Number(unitsRaw);
    if (!Number.isInteger(units) || units < 0) {
      result.errors.push({ row: rowNum, message: "Units Available must be a whole number, 0 or higher." });
      continue;
    }
    const critical = criticalRaw !== "" ? Number(criticalRaw) : null;
    const low = lowRaw !== "" ? Number(lowRaw) : null;
    if ((critical !== null && !Number.isInteger(critical)) || (low !== null && !Number.isInteger(low))) {
      result.errors.push({ row: rowNum, message: "Critical/Low Threshold must be whole numbers." });
      continue;
    }

    try {
      await pool.query(
        `INSERT INTO blood_inventory (hospital_id, blood_type, units_available, critical_threshold, low_threshold)
         VALUES ($1, $2, $3, COALESCE($4, 10), COALESCE($5, 20))
         ON CONFLICT (hospital_id, blood_type)
         DO UPDATE SET units_available = $3,
                       critical_threshold = COALESCE($4, blood_inventory.critical_threshold),
                       low_threshold = COALESCE($5, blood_inventory.low_threshold),
                       updated_at = now()`,
        [hospitalId, bloodType, units, critical, low]
      );
      result.imported++;
    } catch (err) {
      if (err.code === "23503") {
        result.errors.push({ row: rowNum, message: "hospitalId does not match a known hospital." });
        break; // same hospitalId on every row — no point repeating this one
      }
      result.errors.push({ row: rowNum, message: err.message });
    }
  }

  res.json(finalizeResult(result));
});

const REQUEST_PRIORITIES = ["EMERGENCY", "URGENT", "NORMAL"];

// POST /api/import/requests — historical blood requests, hospital-scoped.
// Imported as already-resolved audit records: status is derived from
// Units Fulfilled vs Units Needed (FULFILLED / PARTIALLY_FULFILLED / OPEN)
// rather than taken from the file, and — unlike POST /api/requests, which
// dispatches a live broadcast — this never fires donor SMS/email
// notifications. It's a record of what already happened, not a new ask.
export const importRequests = asyncHandler(async (req, res) => {
  const { hospitalId } = req.body;
  if (!hospitalId) {
    return res.status(400).json({ error: "hospitalId is required." });
  }
  const rows = parseUploadedFile(req, REQUEST_ALIASES);
  const result = { imported: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const bloodType = normalizeBloodType(field(row, ...REQUEST_ALIASES.bloodType));
    const priority = priorityFromInput(field(row, ...REQUEST_ALIASES.priority) || "NORMAL");
    const ward = field(row, ...REQUEST_ALIASES.ward) || "Unspecified";
    const unitsNeeded = Number(field(row, ...REQUEST_ALIASES.unitsNeeded));
    const unitsFulfilledRaw = Number(field(row, ...REQUEST_ALIASES.unitsFulfilled));
    const createdAt = parseDateOrNull(field(row, ...REQUEST_ALIASES.createdAt)) || new Date();

    if (!bloodType) {
      result.errors.push({ row: rowNum, message: `Blood type must be one of: ${BLOOD_TYPES.join(", ")}.` });
      continue;
    }
    if (!REQUEST_PRIORITIES.includes(priority)) {
      result.errors.push({ row: rowNum, message: `Priority must be one of: ${Object.values(PRIORITY_LABEL).join(", ")}.` });
      continue;
    }
    if (!Number.isInteger(unitsNeeded) || unitsNeeded < 1) {
      result.errors.push({ row: rowNum, message: "Units Needed must be a positive whole number." });
      continue;
    }

    const unitsFulfilled = Math.min(Math.max(0, Number.isInteger(unitsFulfilledRaw) ? unitsFulfilledRaw : 0), unitsNeeded);
    const status = unitsFulfilled >= unitsNeeded ? "FULFILLED" : unitsFulfilled > 0 ? "PARTIALLY_FULFILLED" : "OPEN";
    const resolvedAt = status === "FULFILLED" ? createdAt : null;

    let inserted = false;
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      const code = `REQ-${Math.floor(1000 + Math.random() * 9000)}`;
      try {
        await pool.query(
          `INSERT INTO blood_requests
             (hospital_id, request_code, blood_type, priority, ward, units_needed, units_fulfilled, status, created_at, resolved_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [hospitalId, code, bloodType, priority, ward, unitsNeeded, unitsFulfilled, status, createdAt, resolvedAt]
        );
        inserted = true;
        result.imported++;
      } catch (err) {
        if (err.code === "23505") continue; // request_code collision — regenerate and retry
        if (err.code === "23503") {
          result.errors.push({ row: rowNum, message: "hospitalId does not match a known hospital." });
        } else {
          result.errors.push({ row: rowNum, message: err.message });
        }
        break;
      }
    }
  }

  res.json(finalizeResult(result));
});

const APPOINTMENT_STATUSES = ["confirmed", "pending", "cancelled", "completed", "no_show"];

// POST /api/import/appointments — historical donation appointments,
// hospital-scoped. Donors are matched by phone number and must already
// exist (registered through the app or as a walk-in). Deliberately does NOT run the same side
// effects as completing a live appointment (donor_arrivals row, inventory
// bump, last_donation_at update) even for rows marked "completed" — that
// donation and that inventory unit were already consumed when it actually
// happened, so replaying those effects here would double-count them. This
// endpoint only writes the historical appointment record itself.
export const importAppointments = asyncHandler(async (req, res) => {
  const { hospitalId } = req.body;
  if (!hospitalId) {
    return res.status(400).json({ error: "hospitalId is required." });
  }
  const rows = parseUploadedFile(req, APPOINTMENT_ALIASES);
  const result = { imported: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const phone = field(row, ...APPOINTMENT_ALIASES.phone);
    const scheduledAt = parseDateOrNull(field(row, ...APPOINTMENT_ALIASES.scheduledAt));
    const status = String(field(row, ...APPOINTMENT_ALIASES.status) || "completed").toLowerCase();

    if (!phone) {
      result.errors.push({ row: rowNum, message: "Missing donor phone number." });
      continue;
    }
    if (!scheduledAt) {
      result.errors.push({ row: rowNum, message: "Scheduled At must be a valid date." });
      continue;
    }
    if (!APPOINTMENT_STATUSES.includes(status)) {
      result.errors.push({ row: rowNum, message: `Status must be one of: ${APPOINTMENT_STATUSES.join(", ")}.` });
      continue;
    }

    const { rows: donorRows } = await pool.query("SELECT id FROM donors WHERE phone = $1", [phone]);
    if (!donorRows[0]) {
      result.errors.push({ row: rowNum, message: `No donor found with phone ${phone}. The donor must already be registered in ResQ.` });
      continue;
    }

    try {
      await pool.query(
        `INSERT INTO appointments (donor_id, hospital_id, scheduled_at, status) VALUES ($1, $2, $3, $4)`,
        [donorRows[0].id, hospitalId, scheduledAt, status]
      );
      result.imported++;
    } catch (err) {
      if (err.code === "23503") {
        result.errors.push({ row: rowNum, message: "hospitalId does not match a known hospital." });
        break;
      }
      result.errors.push({ row: rowNum, message: err.message });
    }
  }

  res.json(finalizeResult(result));
});
