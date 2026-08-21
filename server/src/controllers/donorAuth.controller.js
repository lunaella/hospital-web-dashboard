import { pool } from "../db/pool.js";
import { ensureRedisConnected } from "../db/redis.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSms } from "../utils/sms.js";
import { sendEmail } from "../utils/email.js";
import { issueOtp, verifyOtp, OTP_TTL_SECONDS } from "../utils/otp.js";
import { signDonorToken, signDonorPendingToken } from "../utils/jwt.js";
import { normalizePhoneForStorage, phoneDigits, isValidPhDigits } from "../utils/phone.js";
import { hashPassword, verifyPassword, isValidPassword, MIN_PASSWORD_LENGTH } from "../utils/password.js";
import { wrapBrandedEmail, buildOtpEmailBody, buildWelcomeEmailBody } from "../utils/emailTemplate.js";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

// Keep in sync with env.donorJwtExpiresIn ("30d" default) — same
// hand-maintained mirroring auth.controller.js already does for the admin
// session TTL, since a Redis EX needs a concrete number of seconds and the
// JWT lib's expiresIn accepts a duration string instead.
const DONOR_SESSION_EXPIRES_SECONDS = 30 * 24 * 60 * 60;

const DONOR_SELECT = `id, donor_code AS "donorCode", name, phone, email, blood_type AS "bloodType",
  age, weight_kg AS "weightKg", gender, health_screening AS "healthScreening",
  notify_sms AS "notifySms", notify_email AS "notifyEmail"`;

const GENDERS = ["male", "female"];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Password login rate limiting — same per-IP+identifier lockout shape as
// the admin login (auth.controller.js), keyed by whatever identifier
// (normalized phone or lowercased email) they logged in with, so one
// attacker can't grind a single donor's password from one source, without
// penalizing a shared IP guessing many different accounts.
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_WINDOW_SECONDS = 15 * 60;

function donorLoginAttemptsKey(ip, identifier) {
  return `donor_login_attempts:${ip}:${identifier}`;
}

async function startDonorSession(donorId) {
  const redis = await ensureRedisConnected();
  const { token, jti } = signDonorToken(donorId);
  await redis.set(`donor_session:${jti}`, donorId, "EX", DONOR_SESSION_EXPIRES_SECONDS);
  return token;
}

// Step 1 of donor login/signup: send a 6-digit code, by SMS (default) or
// email. Deliberately doesn't reveal whether that phone already belongs to
// a donor — verify-otp is where that branches into "log in" vs "needs a
// profile", so a stranger probing phone numbers here learns nothing either
// way, just that *a* code was sent.
//
// The code itself is always issued and looked up under the phone number
// (see otp.js's otpKey) regardless of which channel delivers it — this
// isn't a separate "verify by email instead of phone" identity, it's the
// same phone-bound code, just sent somewhere else the donor can actually
// read it right now. That's why verify-otp and complete-profile below
// don't need any changes at all: they only ever see {phone, code}.
export const requestOtp = asyncHandler(async (req, res) => {
  const rawPhone = req.body.phone?.trim();
  if (!rawPhone) return res.status(400).json({ error: "phone is required." });

  // Normalized once, here, so the OTP is issued under the same key that
  // verifyOtpAndLogin below will look it up under, and so the eventual
  // donors.phone lookup/insert always uses one canonical shape regardless
  // of what format the mobile client's phone picker handed back.
  const phone = normalizePhoneForStorage(rawPhone);
  if (!isValidPhDigits(phoneDigits(rawPhone))) {
    return res.status(400).json({ error: "Enter a valid Philippine mobile number." });
  }

  const channel = req.body.channel === "email" ? "email" : "sms";
  const email = req.body.email?.trim();
  if (channel === "email" && !EMAIL_REGEX.test(email ?? "")) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  const result = await issueOtp(phone);
  if (!result.allowed) {
    return res.status(429).json({
      error: `Too many codes requested for this number. Try again in ${result.waitMinutes} minute${result.waitMinutes === 1 ? "" : "s"}.`,
    });
  }

  // Same number the app's own countdown badge uses (see the expiresIn
  // field on the response below) — one constant (OTP_TTL_SECONDS, otp.js)
  // now drives both, instead of this text and that countdown each having
  // their own hardcoded "5 minutes" that could quietly drift apart.
  const expiryMinutes = Math.round(OTP_TTL_SECONDS / 60);
  const deliveryResult =
    channel === "email"
      ? await sendEmail({
          to: email,
          subject: "Your ResQ verification code",
          html: wrapBrandedEmail(buildOtpEmailBody(result.code, expiryMinutes)),
        })
      : await sendSms(phone, `Your ResQ verification code is ${result.code}. It expires in ${expiryMinutes} minutes.`);

  if (!deliveryResult.ok) {
    return res.status(502).json({ error: deliveryResult.error || "Could not send verification code." });
  }
  res.json({ ok: true, channel, expiresIn: OTP_TTL_SECONDS });
});

// Step 2: verify the code. An existing donor gets a full session token
// back immediately; a phone with no matching donor record gets a
// short-lived "pending" token instead, which only unlocks complete-profile
// below — the app should treat needsProfile: true as "show the signup
// form", not an error.
export const verifyOtpAndLogin = asyncHandler(async (req, res) => {
  const rawPhone = req.body.phone?.trim();
  const code = req.body.code?.trim();
  if (!rawPhone || !code) return res.status(400).json({ error: "phone and code are required." });
  // Same normalization as requestOtp — must match exactly for the OTP
  // lookup and the donors.phone lookup below to find what step 1 stored.
  const phone = normalizePhoneForStorage(rawPhone);

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

// Alternate, faster return login for a donor who's already set a password
// (at signup via complete-profile, or later via PATCH /api/donor/me) —
// doesn't replace the OTP flow above, which still works for anyone at any
// time (e.g. a donor who forgot their password, or one who's never set
// one).
//
// Deliberately returns a distinct error per failure reason (account not
// found / no password set yet / wrong password) rather than one generic
// "invalid credentials" — this is exactly what the original checklist's
// Account Verification item asked for ("Account does not exist. Please
// register first."). That trades away some of the "don't reveal whether an
// account exists" caution a generic message would give, which is a
// deliberate, requested choice here, not an oversight. Every branch still
// counts toward the same rate limit below, so it doesn't make the account
// any faster to brute-force enumerate than the lockout already allows.
//
// Accepts either an email or a phone number as the login identifier — the
// real mobile app's login screen (login_view.dart) has an explicit
// email/phone toggle and sends whichever one the donor picked, it's not
// phone-only like the OTP flow above. Field is named `identifier` to match
// that screen's own AuthService.signInWithCredentials() shape, with `email`
// and `phone` accepted as aliases for callers (e.g. a Postman test) that
// already know which kind they're sending.
export const donorPasswordLogin = asyncHandler(async (req, res) => {
  const rawIdentifier = (req.body.identifier ?? req.body.email ?? req.body.phone)?.trim();
  const password = req.body.password;
  if (!rawIdentifier || !password) {
    return res.status(400).json({ error: "identifier (email or phone) and password are required." });
  }

  const isEmail = rawIdentifier.includes("@");
  const lookupValue = isEmail ? rawIdentifier.toLowerCase() : normalizePhoneForStorage(rawIdentifier);

  const redis = await ensureRedisConnected();
  const attemptsKey = donorLoginAttemptsKey(req.ip, lookupValue);
  const attempts = Number((await redis.get(attemptsKey)) ?? 0);
  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    const ttl = await redis.ttl(attemptsKey);
    const waitMinutes = Math.max(1, Math.ceil(ttl / 60));
    return res.status(429).json({
      error: `Too many failed login attempts. Try again in ${waitMinutes} minute${waitMinutes === 1 ? "" : "s"}.`,
    });
  }

  const { rows } = await pool.query(
    `SELECT ${DONOR_SELECT}, password_hash AS "passwordHash" FROM donors WHERE ${isEmail ? "lower(email) = $1" : "phone = $1"}`,
    [lookupValue]
  );
  // donors.email has no DB-level UNIQUE constraint (same as phone — see
  // updateMyProfile's app-level check in donorPortal.controller.js). If two
  // rows somehow share an email, logging in by email would be genuinely
  // ambiguous, so treat that the same as "no match" rather than picking one
  // at random.
  const donor = rows.length === 1 ? rows[0] : undefined;

  async function recordFailure() {
    const newCount = await redis.incr(attemptsKey);
    if (newCount === 1) await redis.expire(attemptsKey, LOCKOUT_WINDOW_SECONDS);
  }

  if (!donor) {
    await recordFailure();
    return res.status(404).json({ error: "Account does not exist. Please register first." });
  }

  if (!donor.passwordHash) {
    await recordFailure();
    return res.status(400).json({
      error: "This account hasn't set up a password yet. Log in with your phone's SMS code instead, or set a password from Settings.",
    });
  }

  const passwordMatches = await verifyPassword(password, donor.passwordHash);
  if (!passwordMatches) {
    await recordFailure();
    return res.status(401).json({ error: "Incorrect password." });
  }

  await redis.del(attemptsKey);
  delete donor.passwordHash;

  const token = await startDonorSession(donor.id);
  res.json({ token, expiresIn: DONOR_SESSION_EXPIRES_SECONDS, donor });
});

// Step 3 (only reached when verify-otp returned needsProfile: true): create
// the donor record for this phone, or — if an admin already created one in
// the meantime (a walk-in, an import) — just log into that existing record
// instead of erroring or creating a duplicate. The phone was already
// OTP-verified in step 2, so attaching to it here is safe.
export const completeProfile = asyncHandler(async (req, res) => {
  const phone = req.pendingPhone;

  const { rows: existingRows } = await pool.query(
    `SELECT ${DONOR_SELECT}, password_hash AS "passwordHash" FROM donors WHERE phone = $1`,
    [phone]
  );
  let donor = existingRows[0];
  // Only a genuinely brand-new signup gets a welcome email — the
  // "attach to an existing admin-created record" branch below is really a
  // first login, not a registration, so it stays silent.
  const isNewDonor = !donor;

  const { name, bloodType, email, age, weightKg, gender, healthScreening, password } = req.body;
  if (!name?.trim() || !bloodType) {
    return res.status(400).json({ error: "name and bloodType are required." });
  }
  if (!BLOOD_TYPES.includes(bloodType)) {
    return res.status(400).json({ error: `bloodType must be one of: ${BLOOD_TYPES.join(", ")}` });
  }
  // age/weightKg/gender/healthScreening are all optional — the mobile
  // app's screening wizard is a separate step from this bare-minimum
  // signup, and older admin-created donor records never had them either.
  if (age !== undefined && age !== null && !Number.isInteger(age)) {
    return res.status(400).json({ error: "age must be an integer." });
  }
  if (weightKg !== undefined && weightKg !== null && !(Number(weightKg) > 0)) {
    return res.status(400).json({ error: "weightKg must be a positive number." });
  }
  if (gender !== undefined && gender !== null && !GENDERS.includes(gender)) {
    return res.status(400).json({ error: `gender must be one of: ${GENDERS.join(", ")}` });
  }
  // Email is optional here, same as always, but now that it also works as
  // a login identifier (donorPasswordLogin above), a duplicate would make
  // that login ambiguous — same reasoning as the phone uniqueness check
  // in updateMyProfile, just enforced here instead of edit time.
  const normalizedEmail = email?.trim().toLowerCase() || null;
  if (normalizedEmail) {
    const { rows: emailClash } = await pool.query(
      donor
        ? "SELECT id FROM donors WHERE lower(email) = $1 AND id != $2"
        : "SELECT id FROM donors WHERE lower(email) = $1",
      donor ? [normalizedEmail, donor.id] : [normalizedEmail]
    );
    if (emailClash[0]) return res.status(400).json({ error: "That email is already in use by another account." });
  }

  if (!donor) {
    // The phone itself was already OTP-verified to reach this step, but a
    // password is still required here so the donor has a way to log back
    // in afterward without waiting on another SMS every time — see
    // migration 009. Not optional: a signup with no password would leave
    // that donor OTP-only forever unless they later find PATCH /me.
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    }

    const passwordHash = await hashPassword(password);

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = `D-${Math.floor(1000 + Math.random() * 9000)}`;
      try {
        const { rows } = await pool.query(
          `INSERT INTO donors (donor_code, name, phone, blood_type, email, age, weight_kg, gender, health_screening, password_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING ${DONOR_SELECT}`,
          [
            code,
            name.trim(),
            phone,
            bloodType,
            normalizedEmail,
            age ?? null,
            weightKg ?? null,
            gender ?? null,
            healthScreening ? JSON.stringify(healthScreening) : null,
            passwordHash,
          ]
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
  } else {
    // A donor row already existed for this phone (an admin-created walk-in,
    // an import, or an earlier signup attempt that got cut short). Bug fixed
    // here: this branch used to just log straight into that existing row
    // and silently discard everything just submitted — including the
    // password, which meant that donor could never log back in with a
    // password afterward, only via OTP, forever. Now it fills in whatever
    // the existing row is still missing from this submission. COALESCE
    // means it only ever fills gaps — it never overwrites a value the row
    // already had (e.g. blood type an admin already set).
    let passwordHash = null;
    if (!donor.passwordHash) {
      if (!isValidPassword(password)) {
        return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
      }
      passwordHash = await hashPassword(password);
    }

    const { rows } = await pool.query(
      `UPDATE donors SET
         name = COALESCE(name, $1),
         blood_type = COALESCE(blood_type, $2),
         email = COALESCE(email, $3),
         age = COALESCE(age, $4),
         weight_kg = COALESCE(weight_kg, $5),
         gender = COALESCE(gender, $6),
         health_screening = COALESCE(health_screening, $7),
         password_hash = COALESCE(password_hash, $8)
       WHERE id = $9
       RETURNING ${DONOR_SELECT}`,
      [
        name.trim(),
        bloodType,
        normalizedEmail,
        age ?? null,
        weightKg ?? null,
        gender ?? null,
        healthScreening ? JSON.stringify(healthScreening) : null,
        passwordHash,
        donor.id,
      ]
    );
    donor = rows[0];
  }

  const token = await startDonorSession(donor.id);
  res.status(201).json({ token, expiresIn: DONOR_SESSION_EXPIRES_SECONDS, donor });

  // Fire-and-forget, same pattern as notifyDonorsForRequest — a slow or
  // failed welcome email should never hold up the signup response, and
  // there's nowhere to surface its failure to the donor anyway. Silently
  // skipped (not an error) when no email was given, since it's optional.
  if (isNewDonor && donor.email) {
    sendEmail({
      to: donor.email,
      subject: "Welcome to ResQ",
      html: wrapBrandedEmail(buildWelcomeEmailBody(donor.name, donor.bloodType)),
    }).catch((err) => console.error(`Welcome email failed for donor ${donor.id}:`, err));
  }
});

export const donorLogout = asyncHandler(async (req, res) => {
  const redis = await ensureRedisConnected();
  await redis.del(`donor_session:${req.donor.jti}`);
  res.status(204).send();
});
