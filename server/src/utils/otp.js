import { ensureRedisConnected } from "../db/redis.js";

const OTP_TTL_SECONDS = 5 * 60;
// SMS costs real money per send — cap how many codes one phone number can
// request in a window, same spirit as the login-attempt limiter in
// auth.controller.js.
const OTP_REQUEST_LIMIT = 3;
const OTP_REQUEST_WINDOW_SECONDS = 10 * 60;

function otpKey(phone) {
  return `donor_otp:${phone}`;
}
function otpRateLimitKey(phone) {
  return `donor_otp_requests:${phone}`;
}

export function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits, never leading-zero-ambiguous
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
  return { allowed: true, code };
}

// One-time use: a correct code is deleted immediately so it can't be
// replayed, and a wrong/missing code always returns false rather than
// throwing (there's nothing exceptional about a donor mistyping a digit).
export async function verifyOtp(phone, code) {
  const redis = await ensureRedisConnected();
  const stored = await redis.get(otpKey(phone));
  if (!stored || stored !== String(code)) return false;
  await redis.del(otpKey(phone));
  return true;
}
