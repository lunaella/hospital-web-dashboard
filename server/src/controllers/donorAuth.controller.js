import { pool } from "../db/pool.js";
import { ensureRedisConnected } from "../db/redis.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSms } from "../utils/sms.js";
import { issueOtp, verifyOtp } from "../utils/otp.js";
import { signDonorToken, signDonorPendingToken } from "../utils/jwt.js";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

// Keep in sync with env.donorJwtExpiresIn ("30d" default) — same
// hand-maintained mirroring auth.controller.js already does for the admin
// session TTL, since a Redis EX needs a concrete number of seconds and the
// JWT lib's expiresIn accepts a duration string instead.
const DONOR_SESSION_EXPIRES_SECONDS = 30 * 24 * 60 * 60;

const DONOR_SELECT = `id, donor_code AS "donorCode", name, phone, email, blood_type AS "bloodType"`;

async function startDonorSession(donorId) {
  const redis = await ensureRedisConnected();
  const { token, jti } = signDonorToken(donorId);
  await redis.set(`donor_session:${jti}`, donorId, "EX", DONOR_SESSION_EXPIRES_SECONDS);
  return token;
}

// Step 1 of donor login/signup: send a 6-digit SMS code to a phone number.
// Deliberately doesn't reveal whether that phone already belongs to a
// donor — verify-otp is where that branches into "log in" vs "needs a
// profile", so a stranger probing phone numbers here learns nothing either
// way, just that *a* code was sent.
export const requestOtp = asyncHandler(async (req, res) => {
  const phone = req.body.phone?.trim();
  if (!phone) return res.status(400).json({ error: "phone is required." });

  const result = await issueOtp(phone);
  if (!result.allowed) {
    return res.status(429).json({
      error: `Too many codes requested for this number. Try again in ${result.waitMinutes} minute${result.waitMinutes === 1 ? "" : "s"}.`,
    });
  }

  const smsResult = await sendSms(phone, `Your ResQ verification code is ${result.code}. It expires in 5 minutes.`);
  if (!smsResult.ok) {
    return res.status(502).json({ error: smsResult.error || "Could not send verification code." });
  }
  res.json({ ok: true });
});

// Step 2: verify the code. An existing donor gets a full session token
// back immediately; a phone with no matching donor record gets a
// short-lived "pending" token instead, which only unlocks complete-profile
// below — the app should treat needsProfile: true as "show the signup
// form", not an error.
export const verifyOtpAndLogin = asyncHandler(async (req, res) => {
  const phone = req.body.phone?.trim();
  const code = req.body.code?.trim();
  if (!phone || !code) return res.status(400).json({ error: "phone and code are required." });

  const valid = await verifyOtp(phone, code);
  if (!valid) return res.status(401).json({ error: "Invalid or expired code." });

  const { rows } = await pool.query(`SELECT ${DONOR_SELECT} FROM donors WHERE phone = $1`, [phone]);
  const donor = rows[0];

  if (!donor) {
    const { token } = signDonorPendingToken(phone);
    return res.json({ needsProfile: true, token });
  }

  const token = await startDonorSession(donor.id);
  res.json({ needsProfile: false, token, expiresIn: DONOR_SESSION_EXPIRES_SECONDS, donor });
});

// Step 3 (only reached when verify-otp returned needsProfile: true): create
// the donor record for this phone, or — if an admin already created one in
// the meantime (a walk-in, an import) — just log into that existing record
// instead of erroring or creating a duplicate. The phone was already
// OTP-verified in step 2, so attaching to it here is safe.
export const completeProfile = asyncHandler(async (req, res) => {
  const phone = req.pendingPhone;

  const { rows: existingRows } = await pool.query(`SELECT ${DONOR_SELECT} FROM donors WHERE phone = $1`, [phone]);
  let donor = existingRows[0];

  if (!donor) {
    const { name, bloodType, email } = req.body;
    if (!name?.trim() || !bloodType) {
      return res.status(400).json({ error: "name and bloodType are required." });
    }
    if (!BLOOD_TYPES.includes(bloodType)) {
      return res.status(400).json({ error: `bloodType must be one of: ${BLOOD_TYPES.join(", ")}` });
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = `D-${Math.floor(1000 + Math.random() * 9000)}`;
      try {
        const { rows } = await pool.query(
          `INSERT INTO donors (donor_code, name, phone, blood_type, email)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING ${DONOR_SELECT}`,
          [code, name.trim(), phone, bloodType, email?.trim() || null]
        );
        donor = rows[0];
        break;
      } catch (err) {
        if (err.code === "23505") continue; // unique_violation on donor_code — regenerate and retry
        throw err;
      }
    }
    if (!donor) {
      return res.status(500).json({ error: "Could not generate a unique donor code. Try again." });
    }
  }

  const token = await startDonorSession(donor.id);
  res.status(201).json({ token, expiresIn: DONOR_SESSION_EXPIRES_SECONDS, donor });
});

export const donorLogout = asyncHandler(async (req, res) => {
  const redis = await ensureRedisConnected();
  await redis.del(`donor_session:${req.donor.jti}`);
  res.status(204).send();
});
