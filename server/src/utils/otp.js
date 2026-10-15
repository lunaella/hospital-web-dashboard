import crypto from "node:crypto";
import { ensureRedisConnected } from "../db/redis.js";

// Exported so requestOtp (donorAuth.controller.js) can hand the exact
// figure back to the app for its expiry countdown, instead of a duplicated
// "5 minutes" hardcoded on both sides that could quietly drift apart.
export const OTP_TTL_SECONDS = 5 * 60;
// SMS costs real money per send — cap how many codes one phone number can
// request in a window, same spirit as the login-attempt limiter in
// auth.controller.js.
const OTP_REQUEST_LIMIT = 3;
const OTP_REQUEST_WINDOW_SECONDS = 10 * 60;
// A correct code logs the donor in, so wrong guesses are capped: after this
// many, the code is burned and a new one has to be requested. Without it a
// 6-digit code could be brute-forced within its 5-minute lifetime.
const MAX_OTP_ATTEMPTS = 5;

function otpKey(phone) {
  return `donor_otp:${phone}`;
}
function otpAttemptsKey(phone) {
  return `donor_otp_attempts:${phone}`;
}
function otpRateLimitKey(phone) {
  return `donor_otp_requests:${phone}`;
}

export function generateOtpCode() {
  return String(crypto.randomInt(100000, 1000000)); // 6 digits, never leading-zero-ambiguous
}

// Stores a fresh 5-minute code for this phone and returns it for the
// caller to send via SMS. Returns { allowed: false, waitMinutes } instead
// once the request-rate cap is hit.
export async function issueOtp(phone) {
  const redis = await ensureRedisConnected();
  const rateLimitKey = otpRateLimitKey(phone);
  const requests = Number((await redis.get(rateLimitKey)) ?? 0);
  if (requests >= OTP_REQUEST_LIMIT) {
    const ttl = await redis.ttl(rateLimitKey);
    return { allowed: false, waitMinutes: Math.max(1, Math.ceil(ttl / 60)) };
  }
  const newCount = await redis.incr(rateLimitKey);
  if (newCount === 1) await redis.expire(rateLimitKey, OTP_REQUEST_WINDOW_SECONDS);

  const code = generateOtpCode();
  await redis.set(otpKey(phone), code, "EX", OTP_TTL_SECONDS);
  await redis.del(otpAttemptsKey(phone));
  return { allowed: true, code };
}

// One-time use: a correct code is deleted immediately so it can't be
// replayed, and a wrong/missing code always returns false rather than
// throwing (there's nothing exceptional about a donor mistyping a digit).
export async function verifyOtp(phone, code) {
  const redis = await ensureRedisConnected();
  const stored = await redis.get(otpKey(phone));
  if (!stored) return false;
  if (stored !== String(code)) {
    const attempts = await redis.incr(otpAttemptsKey(phone));
    if (attempts === 1) await redis.expire(otpAttemptsKey(phone), OTP_TTL_SECONDS);
    if (attempts >= MAX_OTP_ATTEMPTS) await redis.del(otpKey(phone), otpAttemptsKey(phone));
    return false;
  }
  await redis.del(otpKey(phone), otpAttemptsKey(phone));
  return true;
}
