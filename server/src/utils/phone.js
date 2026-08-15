// Shared Philippine mobile number handling. A phone number in this app can
// arrive in several different shapes — a hospital admin types "+63 9..."
// with a space in Settings, the walk-in donor form builds "+639...", and
// the donor mobile app's phone picker can hand back almost anything (with
// or without a leading 0, with or without +63). Without a single shared
// notion of "the same phone number", two different-looking strings for the
// same real number silently fail to match each other — most importantly in
// donorAuth.controller.js's `WHERE phone = $1` login lookup, where a donor
// who registered via one format and later logs in via a differently-shaped
// (but equivalent) one would incorrectly be treated as a brand-new signup.

// Reduces any input down to the bare 12-digit "639XXXXXXXXX" digit string
// regardless of how it arrived. This is also the shape Semaphore's API
// documents accepting directly (alongside 09XXXXXXXXX, which this always
// upgrades to 639XXXXXXXXX instead of leaving alone, so there's exactly one
// canonical digit form app-wide rather than two equally-valid ones).
export function phoneDigits(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("63") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 11) return `63${digits.slice(1)}`;
  if (digits.startsWith("9") && digits.length === 10) return `63${digits}`;
  return digits; // unrecognized shape — caller decides how to handle (e.g. reject as invalid)
}

// A normalized digit string is exactly 12 digits starting with "63" once
// phoneDigits has done its best — anything else means the input wasn't a
// recognizable PH mobile number to begin with.
export function isValidPhDigits(digits) {
  return /^63\d{10}$/.test(digits);
}

// Canonical storage/display form written to donors.phone and shown in the
// UI — "+639XXXXXXXXX", matching what the web admin's walk-in donor form
// already produces (DonorManagement.jsx).
export function normalizePhoneForStorage(raw) {
  return `+${phoneDigits(raw)}`;
}
