import bcrypt from "bcryptjs";

// Same round count admins already hash at (team.controller.js,
// settings.controller.js) — one number in one place so donor and admin
// password strength never silently drift apart.
const HASH_ROUNDS = 12;

export const MIN_PASSWORD_LENGTH = 8;

export function isValidPassword(password) {
  return typeof password === "string" && password.length >= MIN_PASSWORD_LENGTH;
}

export function hashPassword(password) {
  return bcrypt.hash(password, HASH_ROUNDS);
}

// Safe to call with a null/undefined hash (a donor who's never set a
// password yet) — resolves false instead of throwing, so callers don't
// need their own "do they even have one" branch before comparing.
export function verifyPassword(password, hash) {
  if (!hash) return Promise.resolve(false);
  return bcrypt.compare(password, hash);
}
