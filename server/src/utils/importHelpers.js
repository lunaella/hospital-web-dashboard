// Shared helpers for /api/import/* endpoints. Real hospitals' spreadsheets
// won't match our exact column names, so every field is looked up by a list
// of acceptable header aliases (case/whitespace/punctuation-insensitive)
// instead of one hardcoded key. Exported so parseSpreadsheet.js can also use
// it to find which row of a messy file (title rows, blank rows above the
// real header) is actually the header row — same normalization, same alias
// lists, used both to locate the header and to read values out of it.
export function normalizeHeader(s) {
  return String(s ?? "").toLowerCase().replace(/[\s_\-'".]/g, "");
}

export function field(row, ...aliases) {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const target = normalizeHeader(alias);
    const match = keys.find((k) => normalizeHeader(k) === target);
    if (match !== undefined) {
      const value = row[match];
      return typeof value === "string" ? value.trim() : value ?? "";
    }
  }
  return "";
}

// Per-import-type alias groups — the single source of truth for "what
// column names do we recognize for this field", shared by field() lookups
// in import.controller.js and by parseSpreadsheet.js's header-row detection
// (so both agree on what counts as, say, a "phone" column). Deliberately
// generous with real-world phrasing (Cell/Mobile/Contact No., Blood Group,
// etc.) since these come from whatever a hospital already had in Excel, not
// a template we control.
export const DONOR_ALIASES = {
  name: ["Name", "Full Name", "Donor Name", "Donor's Name", "Complete Name"],
  phone: ["Phone", "Phone Number", "Contact", "Mobile Number", "Contact Number", "Contact No", "Cellphone", "Cell Number", "Mobile"],
  email: ["Email", "Email Address"],
  bloodType: ["Blood Type", "Type", "BloodType", "Blood Group"],
  lastDonationAt: ["Last Donation Date", "Last Donation", "LastDonationAt", "Date of Last Donation"],
};

export const INVENTORY_ALIASES = {
  bloodType: DONOR_ALIASES.bloodType,
  units: ["Units Available", "Units", "Stock", "Quantity", "Available Units"],
  critical: ["Critical Threshold", "Critical"],
  low: ["Low Threshold", "Low"],
};

export const REQUEST_ALIASES = {
  bloodType: DONOR_ALIASES.bloodType,
  priority: ["Priority", "Priority Level", "Urgency"],
  ward: ["Ward", "Department", "Unit"],
  unitsNeeded: ["Units Needed", "UnitsNeeded", "Units Requested"],
  unitsFulfilled: ["Units Fulfilled", "UnitsFulfilled", "Units Received"],
  createdAt: ["Created At", "Date", "CreatedAt", "Date Requested"],
};

export const APPOINTMENT_ALIASES = {
  phone: DONOR_ALIASES.phone,
  scheduledAt: ["Scheduled At", "Date", "Appointment Date", "Schedule"],
  status: ["Status"],
};

// Flattens an alias-group object (field name -> array of header aliases)
// into one plain list of every recognized header string, for scoring
// candidate header rows during parsing.
export function flattenAliases(aliasGroup) {
  return Object.values(aliasGroup).flat();
}

export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export function normalizeBloodType(raw) {
  const cleaned = String(raw || "").toUpperCase().replace(/\s/g, "");
  return BLOOD_TYPES.includes(cleaned) ? cleaned : null;
}

// Caps how many row errors get sent back to the client — a genuinely broken
// file (wrong template entirely) could otherwise produce thousands of error
// entries for a few hundred rows.
export function finalizeResult(result, maxErrors = 50) {
  if (result.errors.length > maxErrors) {
    const truncated = result.errors.length - maxErrors;
    result.errors = result.errors.slice(0, maxErrors);
    result.errorsTruncated = truncated;
  }
  return result;
}
