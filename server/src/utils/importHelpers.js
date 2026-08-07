// Shared helpers for /api/import/* endpoints. Real hospitals' spreadsheets
// won't match our exact column names, so every field is looked up by a list
// of acceptable header aliases (case/whitespace/punctuation-insensitive)
// instead of one hardcoded key.
export function field(row, ...aliases) {
  const keys = Object.keys(row);
  const normalize = (s) => s.toLowerCase().replace(/[\s_-]/g, "");
  for (const alias of aliases) {
    const target = normalize(alias);
    const match = keys.find((k) => normalize(k) === target);
    if (match !== undefined) {
      const value = row[match];
      return typeof value === "string" ? value.trim() : value ?? "";
    }
  }
  return "";
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
