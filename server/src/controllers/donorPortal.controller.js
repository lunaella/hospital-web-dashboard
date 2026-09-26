import { pool } from "../db/pool.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { bookAppointment, AppointmentBookingError } from "../services/appointments.service.js";
import { normalizePhoneForStorage, phoneDigits, isValidPhDigits } from "../utils/phone.js";
import { signAppointmentCheckinToken } from "../utils/jwt.js";
import { hashPassword, verifyPassword, isValidPassword, MIN_PASSWORD_LENGTH } from "../utils/password.js";
import { verifyOtp } from "../utils/otp.js";
import { ensureRedisConnected } from "../db/redis.js";
import { broadcast } from "../realtime/hub.js";
import { imageSize } from "image-size";
import { env } from "../config/env.js";

const CHECKIN_TOKEN_TTL_SECONDS = 10 * 60; // keep in sync with jwt.js's CHECKIN_TOKEN_TTL
const GENDERS = ["male", "female"]; // keep in sync with donorAuth.controller.js and schema.sql's donor_gender enum

// PRC coordinates all donor-facing blood requests on behalf of the partner
// hospitals — the app's Priority Request Feed and "Schedule New Appointment"
// flow should only ever surface broadcasts from this one hospital row, even
// though other hospitals still exist in the `hospitals` table for other
// purposes (admin-side records, walk-in appointments booked directly by
// staff). Must match the `name` of the hospital row created in Settings >
// Hospital Network exactly.
const COORDINATING_HOSPITAL_NAME = "Philippine Red Cross - Quezon Chapter";

// Same 90-day DOH cooling-rule math as the donor_eligibility view (schema.sql)
// and exportDonors (donors.controller.js) — duplicated as a WHERE id = $1
// query rather than joining the view, since the view isn't donor-scoped and
// this just needs the one row.
// Builds an absolute URL to GET /api/donor-photos/:id (a public route, see
// app.js) from whatever host this request actually came in on, rather than
// a hardcoded/env-configured base — works the same in local dev, Render,
// and behind a custom domain without needing a separate env var (trust
// proxy is already enabled in app.js, so req.protocol/req.get("host")
// resolve to the real public host even behind Render's proxy). The ?v=
// timestamp is a cache-buster: the URL is otherwise identical before and
// after a donor replaces their photo, and NetworkImage/browsers would
// otherwise keep showing the old cached bytes.
function buildPhotoUrl(req, donorId, photoUpdatedAt) {
  const base = `${req.protocol}://${req.get("host")}`;
  const version = photoUpdatedAt ? new Date(photoUpdatedAt).getTime() : 0;
  return `${base}/api/donor-photos/${donorId}?v=${version}`;
}

// Same idea as buildPhotoUrl above, for the Digital Health Card's drawn
// signature (see migration 019) — GET /api/donor-signatures/:id.
function buildSignatureUrl(req, donorId, signatureUpdatedAt) {
  const base = `${req.protocol}://${req.get("host")}`;
  const version = signatureUpdatedAt ? new Date(signatureUpdatedAt).getTime() : 0;
  return `${base}/api/donor-signatures/${donorId}?v=${version}`;
}

export const getMyProfile = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT d.id, d.donor_code AS "donorCode", d.name, d.phone, d.email, d.blood_type AS "bloodType",
            d.last_donation_at AS "lastDonationAt", d.created_at AS "memberSince",
            d.age, d.weight_kg AS "weightKg", d.gender, d.health_screening AS "healthScreening",
            d.birth_date AS "birthDate",
            d.emergency_contact_name AS "emergencyContactName",
            d.emergency_contact_phone AS "emergencyContactPhone",
            d.notify_sms AS "notifySms", d.notify_email AS "notifyEmail",
            (d.photo IS NOT NULL) AS "hasPhoto", d.photo_updated_at AS "photoUpdatedAt",
            (d.signature IS NOT NULL) AS "hasSignature", d.signature_updated_at AS "signatureUpdatedAt",
            CASE
              WHEN d.last_donation_at IS NULL THEN true
              WHEN now() - d.last_donation_at >= INTERVAL '90 days' THEN true
              ELSE false
            END AS "isEligible",
            GREATEST(0, 90 - EXTRACT(DAY FROM now() - d.last_donation_at)::int) AS "daysUntilEligible",
            -- Hospital-verified donation count (the app's Lifetime Impact
            -- Record / "Hero" badge source of truth) — donor_arrivals is
            -- the same table completeAppointment writes to, so this only
            -- grows when a hospital admin actually completes a visit, never
            -- from the donor's own self-reported screening answers.
            (SELECT count(*)::int FROM donor_arrivals da WHERE da.donor_id = d.id) AS "completedDonations",
            -- Latest "Get Verified" submission's status (pending/verified/
            -- rejected) — null for a donor who's never submitted one,
            -- which the app's own verificationStatusFromString already
            -- treats the same as "not started".
            (SELECT dv.status FROM donor_verifications dv
              WHERE dv.donor_id = d.id ORDER BY dv.submitted_at DESC LIMIT 1) AS "verificationStatus"
     FROM donors d WHERE d.id = $1`,
    [req.donor.id]
  );
  const donor = rows[0];
  if (!donor) return res.status(404).json({ error: "Donor not found." });

  donor.photoUrl = donor.hasPhoto ? buildPhotoUrl(req, donor.id, donor.photoUpdatedAt) : null;
  delete donor.hasPhoto;
  delete donor.photoUpdatedAt;
  donor.signatureUrl = donor.hasSignature ? buildSignatureUrl(req, donor.id, donor.signatureUpdatedAt) : null;
  delete donor.hasSignature;
  delete donor.signatureUpdatedAt;
  res.json(donor);
});

// POST /api/donor/me/photo (multipart, field "photo") — the endpoint
// editable_avatar.dart has always called; it just never existed
// server-side until now (see migration 016's doc comment). Stored as bytea
// directly on the donors row, same as donor_verifications, since this
// project has no disk/object storage configured.
export const uploadMyPhoto = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "photo is required." });
  if (!file.mimetype?.startsWith("image/")) {
    return res.status(400).json({ error: "photo must be an image file." });
  }
  // Confirms it actually decodes as an image (catches corrupted uploads
  // and non-image files a spoofed mimetype could slip past the check
  // above) — same library already used for verification photos, but no
  // minimum-dimension floor here since a profile photo isn't a compliance
  // document and the client already caps it at 800px wide.
  try {
    imageSize(file.buffer);
  } catch {
    return res.status(400).json({ error: "Could not process that image — please try a different photo." });
  }

  const { rows } = await pool.query(
    `UPDATE donors SET photo = $1, photo_mime_type = $2, photo_updated_at = now()
     WHERE id = $3 RETURNING photo_updated_at AS "photoUpdatedAt"`,
    [file.buffer, file.mimetype, req.donor.id]
  );
  res.json({ photoUrl: buildPhotoUrl(req, req.donor.id, rows[0].photoUpdatedAt) });
});

// GET /api/donor-photos/:id — deliberately public (see app.js), not behind
// requireDonorAuth like the rest of this file's routes. A profile photo
// isn't sensitive medical data the way verification photos are, and
// keeping it public lets the mobile app's plain NetworkImage load it
// without attaching an Authorization header. :id is a UUID, not
// sequential, so this isn't meaningfully enumerable.
export const getDonorPhoto = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT photo, photo_mime_type AS "mimeType" FROM donors WHERE id = $1`, [
    req.params.id,
  ]);
  const donor = rows[0];
  if (!donor?.photo) return res.status(404).end();

  res.set("Content-Type", donor.mimeType || "image/jpeg");
  // Safe to cache aggressively — the URL is versioned with ?v=<timestamp>
  // (see buildPhotoUrl), so a new photo gets a new URL rather than
  // invalidating this one.
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.send(donor.photo);
});

// POST /api/donor/me/signature (multipart, field "signature") — the
// Digital Health Card's signature box calls this after the donor draws
// their signature in signature_pad_view.dart and exports it as a PNG.
// Same bytea-on-the-donors-row pattern as uploadMyPhoto above (see
// migration 019).
export const uploadMySignature = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "signature is required." });
  if (!file.mimetype?.startsWith("image/")) {
    return res.status(400).json({ error: "signature must be an image file." });
  }
  try {
    imageSize(file.buffer);
  } catch {
    return res.status(400).json({ error: "Could not process that signature — please try drawing it again." });
  }

  const { rows } = await pool.query(
    `UPDATE donors SET signature = $1, signature_mime_type = $2, signature_updated_at = now()
     WHERE id = $3 RETURNING signature_updated_at AS "signatureUpdatedAt"`,
    [file.buffer, file.mimetype, req.donor.id]
  );
  res.json({ signatureUrl: buildSignatureUrl(req, req.donor.id, rows[0].signatureUpdatedAt) });
});

// GET /api/donor-signatures/:id — public, same reasoning as
// getDonorPhoto above: not sensitive medical data, needs to load in a
// plain NetworkImage without an Authorization header, :id is a
// non-enumerable UUID.
export const getDonorSignature = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT signature, signature_mime_type AS "mimeType" FROM donors WHERE id = $1`,
    [req.params.id]
  );
  const donor = rows[0];
  if (!donor?.signature) return res.status(404).end();

  res.set("Content-Type", donor.mimeType || "image/png");
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.send(donor.signature);
});

// Self-service profile edit: name, phone, email, and the mobile app's
// screening inputs (age/weightKg/healthScreening — these can legitimately
// change over time, e.g. re-answering the screener before a new donation
// attempt, unlike blood type). Blood type is deliberately NOT editable
// here — it's a safety-critical field that drives which donors get matched
// to which broadcast, so a correction has to go through an admin (Donor
// Management), not a raw self-edit a donor could fat-finger.
export const updateMyProfile = asyncHandler(async (req, res) => {
  const {
    name,
    phone,
    email,
    age,
    weightKg,
    gender,
    healthScreening,
    notifySms,
    notifyEmail,
    password,
    currentPassword,
    birthDate,
    emergencyContactName,
    emergencyContactPhone,
  } = req.body;
  const updates = [];
  const params = [];

  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: "name cannot be empty." });
    params.push(name.trim());
    updates.push(`name = $${params.length}`);
  }

  if (phone !== undefined) {
    const normalizedPhone = normalizePhoneForStorage(phone);
    if (!isValidPhDigits(phoneDigits(phone))) {
      return res.status(400).json({ error: "Enter a valid Philippine mobile number." });
    }
    // No DB-level UNIQUE constraint on donors.phone (see schema.sql) — this
    // app-level check is what actually keeps two donor accounts from
    // colliding onto the same login phone.
    const { rows: clash } = await pool.query("SELECT id FROM donors WHERE phone = $1 AND id != $2", [
      normalizedPhone,
      req.donor.id,
    ]);
    if (clash[0]) return res.status(400).json({ error: "That phone number is already in use by another account." });
    params.push(normalizedPhone);
    updates.push(`phone = $${params.length}`);
  }

  if (email !== undefined) {
    const normalizedEmail = email?.trim().toLowerCase() || null;
    // Email now works as a login identifier too (donorPasswordLogin,
    // donorAuth.controller.js), so a duplicate here would make that login
    // ambiguous — same app-level guard as phone above, since donors.email
    // has no DB-level UNIQUE constraint either.
    if (normalizedEmail) {
      const { rows: clash } = await pool.query("SELECT id FROM donors WHERE lower(email) = $1 AND id != $2", [
        normalizedEmail,
        req.donor.id,
      ]);
      if (clash[0]) return res.status(400).json({ error: "That email is already in use by another account." });
    }
    params.push(normalizedEmail);
    updates.push(`email = $${params.length}`);
  }

  if (age !== undefined) {
    if (age !== null && !Number.isInteger(age)) {
      return res.status(400).json({ error: "age must be an integer." });
    }
    params.push(age);
    updates.push(`age = $${params.length}`);
  }

  if (weightKg !== undefined) {
    if (weightKg !== null && !(Number(weightKg) > 0)) {
      return res.status(400).json({ error: "weightKg must be a positive number." });
    }
    params.push(weightKg);
    updates.push(`weight_kg = $${params.length}`);
  }

  if (gender !== undefined) {
    if (gender !== null && !GENDERS.includes(gender)) {
      return res.status(400).json({ error: `gender must be one of: ${GENDERS.join(", ")}` });
    }
    params.push(gender);
    updates.push(`gender = $${params.length}`);
  }

  if (healthScreening !== undefined) {
    params.push(healthScreening === null ? null : JSON.stringify(healthScreening));
    updates.push(`health_screening = $${params.length}`);
  }

  // Digital Health Card fields (migration 018) — both optional, edited from
  // Settings, no validation beyond "is this a real-ish date/string" since
  // neither drives any eligibility or matching logic elsewhere.
  if (birthDate !== undefined) {
    if (birthDate !== null && Number.isNaN(Date.parse(birthDate))) {
      return res.status(400).json({ error: "birthDate must be a valid date." });
    }
    params.push(birthDate);
    updates.push(`birth_date = $${params.length}`);
  }

  if (emergencyContactName !== undefined) {
    params.push(emergencyContactName === null ? null : String(emergencyContactName).trim() || null);
    updates.push(`emergency_contact_name = $${params.length}`);
  }

  if (emergencyContactPhone !== undefined) {
    params.push(emergencyContactPhone === null ? null : String(emergencyContactPhone).trim() || null);
    updates.push(`emergency_contact_phone = $${params.length}`);
  }

  // Settings > Notification Preferences toggle — which channel(s) an
  // eligible, blood-type-matching donor actually gets contacted on for a
  // broadcast (see notifyDonorsForRequest, notifications.service.js). Plain
  // booleans, not something an admin needs to touch, so this endpoint is
  // the only place they're ever written.
  if (notifySms !== undefined) {
    params.push(Boolean(notifySms));
    updates.push(`notify_sms = $${params.length}`);
  }

  if (notifyEmail !== undefined) {
    params.push(Boolean(notifyEmail));
    updates.push(`notify_email = $${params.length}`);
  }

  // Sets or changes the donor's password login (see migration 009 and
  // POST /api/donor-auth/login). If they already have one, currentPassword
  // must match it first — proves whoever's holding this session actually
  // knows the old password, so a left-open/stolen session can't silently
  // lock the real owner out by swapping the password out from under them.
  // A donor who's never set one yet (still OTP-only) can set their first
  // one here with no currentPassword required — there's nothing to prove
  // knowledge of.
  if (password !== undefined) {
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    }
    const { rows: pwRows } = await pool.query(`SELECT password_hash AS "passwordHash" FROM donors WHERE id = $1`, [
      req.donor.id,
    ]);
    const existingHash = pwRows[0]?.passwordHash;
    if (existingHash) {
      const matches = await verifyPassword(currentPassword, existingHash);
      if (!matches) return res.status(400).json({ error: "currentPassword is incorrect." });
    }
    params.push(await hashPassword(password));
    updates.push(`password_hash = $${params.length}`);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "Nothing to update." });
  }

  params.push(req.donor.id);
  const { rows } = await pool.query(
    `UPDATE donors SET ${updates.join(", ")}, updated_at = now()
     WHERE id = $${params.length}
     RETURNING id, donor_code AS "donorCode", name, phone, email, blood_type AS "bloodType",
               age, weight_kg AS "weightKg", gender, health_screening AS "healthScreening",
               notify_sms AS "notifySms", notify_email AS "notifyEmail",
               birth_date AS "birthDate", emergency_contact_name AS "emergencyContactName",
               emergency_contact_phone AS "emergencyContactPhone"`,
    params
  );
  res.json(rows[0]);
});

// Self-service account deletion, gated behind the same OTP flow used
// elsewhere (POST /donor-auth/request-otp, then this call with the code).
// Every donor-owned table (appointments, donor_arrivals, notifications) has
// ON DELETE CASCADE back to donors (schema.sql), so a single DELETE here is
// enough — no manual per-table cleanup to keep in sync as those tables grow.
export const deleteMyAccount = asyncHandler(async (req, res) => {
  const { otpCode } = req.body;
  if (!otpCode) {
    return res.status(400).json({ error: "otpCode is required." });
  }

  const isValid = await verifyOtp(req.donor.phone, otpCode);
  if (!isValid) {
    return res.status(400).json({ error: "Invalid or expired verification code." });
  }

  await pool.query(`DELETE FROM donors WHERE id = $1`, [req.donor.id]);

  // Same revocation donorLogout uses — without this the JWT itself would
  // stay valid (stateless) until it naturally expires, even though the
  // account behind it no longer exists.
  const redis = await ensureRedisConnected();
  await redis.del(`donor_session:${req.donor.jti}`);

  res.status(204).send();
});

const VERIFICATION_ALWAYS_REQUIRED_FIELDS = ["idFront", "face_front", "face_left", "face_right", "face_up", "face_down"];

// Mirrors kNoIdBackTypes in resq_app/lib/views/profile/get_ver_view.dart —
// these document types have nothing usable on the back (a passport's data
// is all on the photo page; a clearance/certificate is a single printed
// page), so the app never captures or sends an "idBack" file for them.
// Kept server-side too rather than trusting the client's own omission,
// since this affects what's actually required to accept a submission.
const VERIFICATION_NO_BACK_ID_TYPES = new Set([
  "Philippine Passport issued by the Department of Foreign Affairs (DFA)",
  "NBI Clearance or Police Clearance",
  "Barangay Clearance or Barangay ID",
  "PSA Birth Certificate or Marriage Contract",
]);

// Real photos from get_ver_view.dart's camera capture (maxWidth 1600) are
// always well above this — anything smaller than a thumbnail is almost
// certainly a placeholder, a corrupt upload, or a deliberately garbage
// file, not a usable ID/face photo. min(width,height) rather than both
// dimensions, so a legitimately off-aspect capture doesn't get rejected
// just for not being square-ish.
const MIN_VERIFICATION_IMAGE_DIMENSION = 300;

// Automated check #2 (server-side): confirms every uploaded field actually
// decodes as a real image of a sane size, on top of check #1 (the app's
// own on-device face-presence check on capture). Neither of these confirms
// the ID actually belongs to the donor — that would need real face-
// matching against a trusted source, which this project doesn't have — but
// together they catch corrupted uploads, non-image files, and obviously
// fake/placeholder submissions automatically, without a manual reviewer.
function validVerificationImage(file) {
  if (!file.mimetype?.startsWith("image/")) return false;
  try {
    const { width, height } = imageSize(file.buffer);
    return Math.min(width, height) >= MIN_VERIFICATION_IMAGE_DIMENSION;
  } catch {
    return false; // doesn't even decode as a recognizable image format
  }
}

// A loose sanity check, not a real parse — just enough to keep obviously
// garbage input out of the DATE column rather than letting Postgres reject
// the whole insert over it. The app only ever sends its own
// DateTime.toIso8601String() output here (or nothing).
function looksLikeIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

// Superseded by startDiditVerification below once the group started paying
// for real third-party KYC — kept working (route still wired) rather than
// deleted, since ripping it out doesn't buy anything and ties the schema's
// hands for no reason. The mobile app's "Get Verified" screen no longer
// calls this.
//
// "Get Verified" flow (mobile app, get_ver_view.dart): stores the donor's
// chosen ID type plus the required photos as one submission row (idBack is
// only required for ID types outside VERIFICATION_NO_BACK_ID_TYPES).
//
// Auto-approved (status inserted as 'verified' directly) rather than left
// 'pending' for a human reviewer — there's no admin-side review screen
// built yet to ever move it out of 'pending', and no 3rd-party KYC
// provider wired in to confirm the ID actually belongs to the donor. What
// IS automated: every file must decode as a real, reasonably-sized image
// (validVerificationImage below), on top of the app's own on-device checks
// that a face is visible in the ID photo and that its printed text is at
// least roughly consistent with the donor's own registered name/age
// (extractedBirthdate/extractedAddress below are that check's by-products,
// carried through for context — not re-verified here) — together these
// catch corrupted, blank, or obviously-wrong-person submissions without a
// human needing to look. None of this is real identity verification
// (matching the ID's face to the selfie captures, or confirming the ID
// itself is genuine); the photos are still fully captured and stored
// either way, so upgrading to a manual review step or real face-matching
// later only changes this one function, not the schema or the app's
// upload flow.
//
// Multiple submissions per donor are still allowed (e.g. retaking bad
// photos) — this always inserts a fresh row rather than overwriting a
// previous one; getMyProfile always reads whichever row is newest.
export const submitVerification = asyncHandler(async (req, res) => {
  const idType = req.body?.idType?.trim();
  if (!idType) {
    return res.status(400).json({ error: "idType is required." });
  }

  const requiredFields = VERIFICATION_NO_BACK_ID_TYPES.has(idType)
    ? VERIFICATION_ALWAYS_REQUIRED_FIELDS
    : [...VERIFICATION_ALWAYS_REQUIRED_FIELDS, "idBack"];

  const missing = requiredFields.filter((field) => !req.files?.[field]?.[0]);
  if (missing.length) {
    return res.status(400).json({ error: `Missing required file(s): ${missing.join(", ")}` });
  }
  const file = (field) => req.files[field]?.[0];
  const hasIdBack = Boolean(file("idBack"));

  const invalid = [...requiredFields, ...(hasIdBack ? ["idBack"] : [])].filter(
    (field) => !validVerificationImage(file(field))
  );
  if (invalid.length) {
    return res.status(400).json({
      error: `Could not process: ${invalid.join(", ")} — make sure each is a clear photo, not a corrupted or placeholder file.`,
    });
  }

  const extractedBirthdate = looksLikeIsoDate(req.body?.extractedBirthdate) ? req.body.extractedBirthdate : null;
  const extractedAddress = req.body?.extractedAddress?.trim() || null;

  await pool.query(
    `INSERT INTO donor_verifications (
       donor_id, id_type,
       id_front, id_front_mime, id_back, id_back_mime,
       face_front, face_front_mime, face_left, face_left_mime,
       face_right, face_right_mime, face_up, face_up_mime,
       face_down, face_down_mime,
       extracted_birthdate, extracted_address,
       status, reviewed_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'verified',now())`,
    [
      req.donor.id,
      idType,
      file("idFront").buffer,
      file("idFront").mimetype,
      hasIdBack ? file("idBack").buffer : null,
      hasIdBack ? file("idBack").mimetype : null,
      file("face_front").buffer,
      file("face_front").mimetype,
      file("face_left").buffer,
      file("face_left").mimetype,
      file("face_right").buffer,
      file("face_right").mimetype,
      file("face_up").buffer,
      file("face_up").mimetype,
      file("face_down").buffer,
      file("face_down").mimetype,
      extractedBirthdate,
      extractedAddress,
    ]
  );

  res.status(201).json({ verificationStatus: "verified" });
});

const DIDIT_SESSION_URL = "https://verification.didit.me/v3/session/";

// Kicks off Didit's hosted KYC flow (real ID authenticity checks, liveness,
// and face match — see docs.didit.me) for the signed-in donor. The mobile
// app opens the returned `url` in the device browser; Didit runs its own
// capture UI end to end and, once the donor finishes, calls back to
// POST /api/webhooks/didit (diditWebhook.controller.js) with the actual
// decision — this endpoint never sees or stores the ID/face photos itself,
// unlike the legacy submitVerification flow above.
//
// A donor_verifications row is created up front (status 'pending') so
// getMyProfile has something to report immediately, and so the webhook has
// a row to find via didit_session_id once the decision comes in — Didit's
// session-create response doesn't include enough to identify the donor on
// its own (vendor_data does, but only round-trips through the webhook).
export const startDiditVerification = asyncHandler(async (req, res) => {
  if (!env.diditApiKey) {
    return res.status(503).json({ error: "Identity verification isn't configured yet." });
  }

  const diditRes = await fetch(DIDIT_SESSION_URL, {
    method: "POST",
    headers: { "x-api-key": env.diditApiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      workflow_id: env.diditWorkflowId,
      vendor_data: req.donor.id,
    }),
  });

  if (!diditRes.ok) {
    const detail = await diditRes.text().catch(() => "");
    // Logged server-side (not just returned to the app) since Didit's
    // actual rejection reason — bad/revoked key, workflow_id that doesn't
    // belong to this application, etc. — lives in `detail`, and the app UI
    // only ever shows the generic `error` message below.
    console.error(`[startDiditVerification] Didit session create failed (${diditRes.status}): ${detail}`);
    return res.status(502).json({ error: "Could not start verification. Please try again.", detail });
  }

  const session = await diditRes.json();

  await pool.query(
    `INSERT INTO donor_verifications (donor_id, id_type, source, didit_session_id, status)
     VALUES ($1, 'didit', 'didit', $2, 'pending')`,
    [req.donor.id, session.session_id]
  );

  res.status(201).json({ url: session.url, sessionId: session.session_id });
});

// Home screen "Priority Request Feed" — open broadcasts matching this
// donor's exact blood type (same exact-match rule notifyDonorsForRequest
// already uses; this app has no ABO/Rh compatibility matrix anywhere, so a
// feed that suddenly showed "compatible" types would be a new, undiscussed
// matching rule, not this endpoint's call to make). Ranked by urgency tier
// first always, then by proximity to ?lat=&lng= (the donor's current GPS
// position, passed as query params since donors don't have a fixed stored
// location — a hospital does) when supplied, falling back to most-recent
// first when it isn't.
export const listOpenRequestsForDonor = asyncHandler(async (req, res) => {
  const lat = req.query.lat !== undefined ? Number(req.query.lat) : null;
  const lng = req.query.lng !== undefined ? Number(req.query.lng) : null;
  const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);

  // Haversine distance in km — only computed when the app actually sent a
  // position; NULL (and therefore last in NULLS LAST ordering) otherwise
  // rather than pretending everyone is equidistant.
  // Cast, not a bare "NULL" — an untyped NULL literal sitting alone in
  // ORDER BY makes Postgres try to parse it as an ordinal column reference
  // ("ORDER BY 1") instead of a value, and throws "non-integer constant in
  // ORDER BY" since NULL isn't an integer. Never caught before because
  // nothing actually called this endpoint without lat/lng until the mobile
  // app's Priority Request Feed was wired up.
  const distanceExpr = hasLocation
    ? `6371 * acos(least(1, greatest(-1,
         cos(radians($2)) * cos(radians(h.latitude)) * cos(radians(h.longitude) - radians($3))
         + sin(radians($2)) * sin(radians(h.latitude))
       )))`
    : "NULL::numeric";

  const { rows } = await pool.query(
    `SELECT
       r.request_code AS "requestCode",
       r.blood_type AS "bloodType",
       r.priority,
       r.ward,
       r.units_needed AS "unitsNeeded",
       r.units_fulfilled AS "unitsFulfilled",
       r.status,
       extract(epoch FROM (now() - r.created_at))::int AS "secondsOpen",
       h.id AS "hospitalId",
       h.name AS "hospitalName",
       h.address AS "hospitalAddress",
       h.latitude,
       h.longitude,
       round((${distanceExpr})::numeric, 1) AS "distanceKm"
     FROM blood_requests r
     JOIN hospitals h ON h.id = r.hospital_id
     WHERE r.status IN ('OPEN', 'PARTIALLY_FULFILLED') AND r.blood_type = $1
       AND h.name = $${hasLocation ? 4 : 2}
     ORDER BY
       CASE r.priority WHEN 'EMERGENCY' THEN 0 WHEN 'URGENT' THEN 1 ELSE 2 END,
       (${distanceExpr}) ASC NULLS LAST,
       r.created_at DESC`,
    hasLocation
      ? [req.donor.bloodType, lat, lng, COORDINATING_HOSPITAL_NAME]
      : [req.donor.bloodType, COORDINATING_HOSPITAL_NAME]
  );
  res.json(rows);
});

// Powers the app's hospital picker when booking an appointment — public
// hospital info only (no admin-facing fields like appointment_capacity).
export const listHospitalsForDonors = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, code, name, city, address, latitude, longitude FROM hospitals ORDER BY name`
  );
  res.json(rows);
});

export const listMyAppointments = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.id, a.hospital_id AS "hospitalId", h.name AS "hospitalName", h.address AS "hospitalAddress",
            a.scheduled_at AS "scheduledAt", a.status
     FROM appointments a
     JOIN hospitals h ON h.id = a.hospital_id
     WHERE a.donor_id = $1
     ORDER BY a.scheduled_at DESC`,
    [req.donor.id]
  );
  res.json(rows);
});

// Donation History — completed donations only, from donor_arrivals (the
// same table completeAppointment in donors.controller.js writes to when
// admin staff record a donation). request_id is a LEFT JOIN, not an INNER
// one: donor_arrivals.request_id is nullable and today's completeAppointment
// flow never actually sets it (a completed *appointment* isn't necessarily
// tied to a specific broadcast), so most rows won't have one — this just
// surfaces which broadcast it was for on the rows that do.
export const listMyDonations = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT da.id, h.name AS "hospitalName", da.arrived_at AS "arrivedAt",
            r.request_code AS "requestCode", r.blood_type AS "bloodType"
     FROM donor_arrivals da
     JOIN hospitals h ON h.id = da.hospital_id
     LEFT JOIN blood_requests r ON r.id = da.request_id
     WHERE da.donor_id = $1
     ORDER BY da.arrived_at DESC`,
    [req.donor.id]
  );
  res.json(rows);
});

// Powers the mobile app's bell — one row per broadcast the donor was
// notified about, not one per delivery attempt. notifyDonorsForRequest
// (notifications.service.js) inserts a *separate* row per channel (sms,
// and email if the donor has one on file), so a donor with an email would
// otherwise see every alert listed twice. Grouping by request_id collapses
// that back into what the donor actually experienced: one alert per
// broadcast, read once both/either channel's row has been marked read.
export const listMyNotifications = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT
       n.request_id AS "requestId",
       r.request_code AS "requestCode",
       r.blood_type AS "bloodType",
       r.priority,
       r.ward,
       r.status,
       r.units_needed AS "unitsNeeded",
       r.units_fulfilled AS "unitsFulfilled",
       h.id AS "hospitalId",
       h.name AS "hospitalName",
       min(n.created_at) AS "createdAt",
       bool_and(n.read_at IS NOT NULL) AS "isRead",
       -- A donor's own rows for one broadcast are always consistently one
       -- audience or the other (see notifyDonorsForRequest) — bool_and is
       -- just a safe way to collapse them to a single value.
       bool_and(n.audience = 'referral') AS "isReferral"
     FROM notifications n
     JOIN blood_requests r ON r.id = n.request_id
     JOIN hospitals h ON h.id = r.hospital_id
     WHERE n.donor_id = $1
     GROUP BY n.request_id, r.request_code, r.blood_type, r.priority, r.ward, r.status,
              r.units_needed, r.units_fulfilled, h.id, h.name
     ORDER BY min(n.created_at) DESC
     LIMIT 50`,
    [req.donor.id]
  );
  res.json({ notifications: rows, unreadCount: rows.filter((r) => !r.isRead).length });
});

// Marks every one of this donor's notification rows as read in one shot —
// the mobile app calls this when the bell's list screen is opened, not per
// item, since the UX this backs is "you've now seen your notifications",
// not per-row read receipts.
export const markMyNotificationsRead = asyncHandler(async (req, res) => {
  await pool.query(`UPDATE notifications SET read_at = now() WHERE donor_id = $1 AND read_at IS NULL`, [
    req.donor.id,
  ]);
  res.status(204).send();
});

// Donor self-service booking — same bookAppointment() the admin walk-in
// flow uses (donors.controller.js createAppointment), so the slot-capacity
// rule can never drift between "staff booked it for you" and "you booked
// it yourself in the app".
export const bookMyAppointment = asyncHandler(async (req, res) => {
  const { hospitalId, scheduledAt } = req.body;
  if (!hospitalId || !scheduledAt) {
    return res.status(400).json({ error: "hospitalId and scheduledAt are required." });
  }
  try {
    const appointment = await bookAppointment({ donorId: req.donor.id, hospitalId, scheduledAt });
    res.status(201).json(appointment);

    // Pushes to the admin Appointment View / notification bell in real
    // time (see server/src/realtime) instead of waiting on their next poll
    // or manual refresh. After res.json, same fire-and-forget-after-respond
    // pattern as the welcome email in donorAuth.controller.js — a donor's
    // booking should never wait on this.
    broadcast({
      type: "appointment_booked",
      hospitalId: appointment.hospitalId,
      appointment: {
        id: appointment.id,
        status: appointment.status,
        scheduledAt: appointment.scheduledAt,
        donorName: req.donor.name,
        bloodType: req.donor.bloodType,
      },
    });
  } catch (err) {
    if (err instanceof AppointmentBookingError) {
      return res.status(err.status).json({ error: err.message });
    }
    throw err;
  }
});

// Scoped to `donor_id = req.donor.id` so a donor can only ever cancel their
// own appointment, never someone else's by guessing an id. Completed
// appointments are excluded deliberately — a donation that already happened
// isn't something the app should let a donor "undo".
export const cancelMyAppointment = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE appointments SET status = 'cancelled', updated_at = now()
     WHERE id = $1 AND donor_id = $2 AND status NOT IN ('completed', 'cancelled')
     RETURNING id, status, hospital_id AS "hospitalId", scheduled_at AS "scheduledAt"`,
    [req.params.id, req.donor.id]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: "Appointment not found, already cancelled, or already completed." });
  }
  const appointment = rows[0];
  res.json({ id: appointment.id, status: appointment.status });

  // See bookMyAppointment's matching broadcast above — same real-time push
  // to the admin side, this time for a cancellation.
  broadcast({
    type: "appointment_cancelled",
    hospitalId: appointment.hospitalId,
    appointment: {
      id: appointment.id,
      status: appointment.status,
      scheduledAt: appointment.scheduledAt,
      donorName: req.donor.name,
      bloodType: req.donor.bloodType,
    },
  });
});

// Issues the short-lived signed token the mobile app renders as a QR code
// for hospital check-in (see utils/jwt.js and the admin-side
// POST /api/appointments/checkin that consumes it in donors.controller.js).
// Only issuable for the donor's own appointment, and only while it's still
// pending/confirmed — no point generating a check-in pass for a visit
// that's already happened or been cancelled.
export const getAppointmentQrToken = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT id, status FROM appointments WHERE id = $1 AND donor_id = $2`, [
    req.params.id,
    req.donor.id,
  ]);
  const appt = rows[0];
  if (!appt) return res.status(404).json({ error: "Appointment not found." });
  if (!["pending", "confirmed"].includes(appt.status)) {
    return res.status(400).json({ error: `Can't generate a check-in pass for a ${appt.status} appointment.` });
  }

  const token = signAppointmentCheckinToken(appt.id, req.donor.id);
  res.json({ token, expiresIn: CHECKIN_TOKEN_TTL_SECONDS });
});

// Registers (or re-registers) this device's FCM token for push. Called on
// app start once notification permission is granted, and again whenever
// Firebase rotates the token. ON CONFLICT covers two real cases: the same
// donor re-registering the same device (just bumps last_seen_at, doubling as
// a lightweight liveness signal for future token-pruning), and a token that
// got reassigned to a different donor by Firebase (rare, but a stale
// donor_id on a token neither donor owns anymore is worse than overwriting
// it) — DO UPDATE SET donor_id keeps this table correct either way. No
// separate notify_push opt-in column: registering a token *is* the opt-in,
// same as having a phone on file implies SMS is possible (see notify_sms/
// notify_email, which are opt-*outs* on top of a channel that's already
// available — push has no such toggle yet since there's nothing to turn off
// independently of just not registering a device).
export const registerDevice = asyncHandler(async (req, res) => {
  const { fcmToken, platform } = req.body;
  if (!fcmToken || typeof fcmToken !== "string") {
    return res.status(400).json({ error: "fcmToken is required." });
  }
  await pool.query(
    `INSERT INTO donor_devices (donor_id, fcm_token, platform, last_seen_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (fcm_token) DO UPDATE SET donor_id = $1, platform = $3, last_seen_at = now()`,
    [req.donor.id, fcmToken, platform || "android"]
  );
  res.status(204).send();
});

// Called on logout, so a signed-out device stops receiving pushes meant for
// whichever donor is no longer signed in on it — unlike the session/JWT,
// there's no natural expiry on a push token otherwise.
export const unregisterDevice = asyncHandler(async (req, res) => {
  const { fcmToken } = req.body;
  if (!fcmToken) {
    return res.status(400).json({ error: "fcmToken is required." });
  }
  await pool.query(`DELETE FROM donor_devices WHERE fcm_token = $1 AND donor_id = $2`, [fcmToken, req.donor.id]);
  res.status(204).send();
});
