// Shared PII-masking helpers. Originally lived only in DonorManagement.jsx;
// lifted here so the Donor Profile popup (DonorProfileModal.jsx) can show
// the same masked phone by default instead of a second copy of this logic.

// Keeps only the last 4 digits visible, e.g. "09171234567" -> "•••••••4567".
// Falls back to the raw value if it's too short to meaningfully mask.
export function maskPhone(phone) {
  if (!phone) return "—";
  const digits = String(phone).trim();
  if (digits.length <= 4) return digits;
  return "•".repeat(digits.length - 4) + digits.slice(-4);
}
