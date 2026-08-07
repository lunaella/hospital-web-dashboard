import { pool } from "../db/pool.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { parseSpreadsheet } from "../utils/parseSpreadsheet.js";
import { field, normalizeBloodType, BLOOD_TYPES, finalizeResult } from "../utils/importHelpers.js";

function parseUploadedFile(req) {
  if (!req.file) {
    const err = new Error('No file uploaded. Attach a .csv or .xlsx file as "file".');
    err.status = 400;
    throw err;
  }
  return parseSpreadsheet(req.file.buffer, req.file.originalname);
}

function parseDateOrNull(raw) {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// POST /api/import/donors — donors are hospital-agnostic (see schema.sql:
// which hospital a donor visits is decided per-appointment, not fixed to the
// donor record), so this doesn't take a hospitalId. One row per donor: Name,
// Phone, Blood Type required; Email and Last Donation Date optional.
// donor_code is always generated fresh (same D-XXXX pattern as the manual
// walk-in form) — existing donors are matched, and skipped rather than
// duplicated, by phone number instead.
export const importDonors = asyncHandler(async (req, res) => {
  const rows = parseUploadedFile(req);
  const result = { imported: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +1 for the header row, +1 for 1-indexing

    const name = field(row, "Name", "Full Name", "Donor Name");
    const phone = field(row, "Phone", "Phone Number", "Contact", "Mobile Number");
    const email = field(row, "Email", "Email Address");
    const bloodType = normalizeBloodType(field(row, "Blood Type", "Type", "BloodType"));
    const lastDonationAt = parseDateOrNull(field(row, "Last Donation Date", "Last Donation", "LastDonationAt"));

    if (!name || !phone) {
      result.errors.push({ row: rowNum, message: "Missing name or phone." });
      continue;
    }
    if (!bloodType) {
      result.errors.push({ row: rowNum, message: `Blood type must be one of: ${BLOOD_TYPES.join(", ")}.` });
      continue;
    }

    const { rows: existing } = await pool.query("SELECT id FROM donors WHERE phone = $1", [phone]);
    if (existing.length > 0) {
      result.skipped++;
      continue;
    }

    let inserted = false;
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      const code = `D-${Math.floor(1000 + Math.random() * 9000)}`;
      try {
        await pool.query(
          `INSERT INTO donors (donor_code, name, phone, blood_type, email, last_donation_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [code, name, phone, bloodType, email || null, lastDonationAt]
        );
        inserted = true;
        result.imported++;
      } catch (err) {
        if (err.code === "23505") continue; // donor_code collision — regenerate and retry
        result.errors.push({ row: rowNum, message: err.message });
        break;
      }
    }
  }

  res.json(finalizeResult(result));
});

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
  const rows = parseUploadedFile(req);
  const result = { imported: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const bloodType = normalizeBloodType(field(row, "Blood Type", "Type", "BloodType"));
    const unitsRaw = field(row, "Units Available", "Units", "Stock");
    const criticalRaw = field(row, "Critical Threshold", "Critical");
    const lowRaw = field(row, "Low Threshold", "Low");

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
  const rows = parseUploadedFile(req);
  const result = { imported: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const bloodType = normalizeBloodType(field(row, "Blood Type", "Type", "BloodType"));
    const priority = String(field(row, "Priority") || "NORMAL").toUpperCase();
    const ward = field(row, "Ward", "Department", "Unit") || "Unspecified";
    const unitsNeeded = Number(field(row, "Units Needed", "UnitsNeeded"));
    const unitsFulfilledRaw = Number(field(row, "Units Fulfilled", "UnitsFulfilled"));
    const createdAt = parseDateOrNull(field(row, "Created At", "Date", "CreatedAt")) || new Date();

    if (!bloodType) {
      result.errors.push({ row: rowNum, message: `Blood type must be one of: ${BLOOD_TYPES.join(", ")}.` });
      continue;
    }
    if (!REQUEST_PRIORITIES.includes(priority)) {
      result.errors.push({ row: rowNum, message: `Priority must be one of: ${REQUEST_PRIORITIES.join(", ")}.` });
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
// exist (import donors first). Deliberately does NOT run the same side
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
  const rows = parseUploadedFile(req);
  const result = { imported: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const phone = field(row, "Phone", "Donor Phone", "Phone Number");
    const scheduledAt = parseDateOrNull(field(row, "Scheduled At", "Date", "Appointment Date"));
    const status = String(field(row, "Status") || "completed").toLowerCase();

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
      result.errors.push({ row: rowNum, message: `No donor found with phone ${phone}. Import donors first.` });
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
