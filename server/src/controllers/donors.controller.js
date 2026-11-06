import { pool } from "../db/pool.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { hospitalIdParam } from "../utils/hospitalScope.js";
import { bookAppointment, AppointmentBookingError } from "../services/appointments.service.js";
import { verifySessionToken } from "../utils/jwt.js";
import { broadcast, broadcastToDonors, sendToDonor } from "../realtime/hub.js";
import { newUnitCode } from "./donationUnits.controller.js";
import { classifyDonorRow, donorEligibility } from "../utils/eligibilityClassifier.js";
import { MinHeap } from "../utils/minHeap.js";
import { sendPushToDonor } from "../utils/push.js";
import { buildPhotoUrl } from "../utils/mediaUrl.js";

const PAGE_SIZE_DEFAULT = 5; // matches the frontend's current PAGE_SIZE

// What a donor's eligibility would be if Mark Eligible cleared both the
// hospital-recorded and the self-reported donation date (see
// setDonorEligibility) — still deferred if another rule applies.
function eligibilityWithDatesCleared(donor) {
  const screening = donor.healthScreening;
  return donorEligibility({
    ...donor,
    lastDonationAt: null,
    healthScreening: screening && typeof screening === "object" ? { ...screening, lastDonationDate: null } : screening,
  });
}

// Adds isEligible / daysUntilEligible / lockReason / lockMessage to a donor
// row and drops the screening columns they were computed from, which the
// admin list doesn't otherwise show. canMarkEligible says whether the
// admin's Mark Eligible would actually make this donor eligible, so the
// list only offers it when it would.
function withEligibility(donor) {
  const { age, weightKg, gender, healthScreening, ...rest } = donor;
  const eligibility = donorEligibility(donor);
  const canMarkEligible =
    !eligibility.isEligible && eligibility.lockReason === "deferredInterval" && eligibilityWithDatesCleared(donor).isEligible;
  return { ...rest, ...eligibility, canMarkEligible };
}

// The donor list's filters (blood type, search, hospital), shared with the
// CSV export so an export always contains exactly the rows the list shows
// (TC-DM-004: the export used to ignore every filter).
function donorFilters(req) {
  const bloodTypes = req.query.bloodType
    ? [].concat(req.query.bloodType) // supports ?bloodType=O-&bloodType=A+
    : null;
  const search = req.query.q?.trim() || null;
  const hospitalId = hospitalIdParam(req);

  const conditions = [];
  const params = [];

  if (bloodTypes?.length) {
    params.push(bloodTypes);
    conditions.push(`blood_type = ANY($${params.length}::blood_type[])`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(name ILIKE $${params.length} OR donor_code ILIKE $${params.length} OR phone ILIKE $${params.length})`);
  }
  // Donors are a shared pool with no hospital_id of their own — scoping to
  // one hospital means "has this hospital ever actually interacted with
  // this donor", i.e. an appointment (any status) or a recorded donation
  // there. "All Hospitals" (hospitalId === null) skips this entirely.
  if (hospitalId) {
    params.push(hospitalId);
    conditions.push(
      `(EXISTS (SELECT 1 FROM appointments a WHERE a.donor_id = donors.id AND a.hospital_id = $${params.length})
        OR EXISTS (SELECT 1 FROM donor_arrivals da WHERE da.donor_id = donors.id AND da.hospital_id = $${params.length}))`
    );
  }
  return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params };
}

// "eligible" | "locked" | undefined/"all"
function matchesEligibility(donor, eligibility) {
  return eligibility === "eligible" ? donor.isEligible : eligibility === "locked" ? !donor.isEligible : true;
}

export const listDonors = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Number(req.query.pageSize) || PAGE_SIZE_DEFAULT, 100);
  const offset = (page - 1) * pageSize;
  const { where, params } = donorFilters(req);

  // Eligibility is the same full screening check the donor's app and the
  // broadcast pushes use (donorEligibility), not just the 90-day rule. The
  // decision tree runs in JS, so the eligible/locked filter and paging
  // happen after the query instead of in SQL.
  const { rows: matching } = await pool.query(
    `SELECT
       id, donor_code AS "donorCode", name, phone, blood_type AS "bloodType",
       (photo IS NOT NULL) AS "hasPhoto", photo_updated_at AS "photoUpdatedAt",
       last_donation_at AS "lastDonationAt",
       age, weight_kg AS "weightKg", gender, health_screening AS "healthScreening"
     FROM donors
     ${where}
     ORDER BY name`,
    params
  );
  const classified = matching
    .map((donor) => withEligibility(donor))
    .filter((donor) => matchesEligibility(donor, req.query.eligibility));
  const total = classified.length;
  const rows = classified.slice(offset, offset + pageSize);

  // Real donor-uploaded photo (migration 016), not the unused avatar_url
  // column — see donorPortal.controller.js's buildPhotoUrl doc comment for
  // why this is built per-request rather than stored.
  for (const donor of rows) {
    donor.avatar = donor.hasPhoto ? buildPhotoUrl(req, donor.id, donor.photoUpdatedAt) : null;
    delete donor.hasPhoto;
    delete donor.photoUpdatedAt;
  }

  res.json({
    donors: rows,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

// Registers a brand-new donor — used by the walk-in form when the person at
// the desk isn't already in the system. donor_code is generated server-side
// (staff shouldn't have to invent a unique ID); collisions are vanishingly
// unlikely but retried a few times just in case.
export const createDonor = asyncHandler(async (req, res) => {
  const { name, phone, bloodType, email } = req.body;
  if (!name?.trim() || !phone?.trim() || !bloodType) {
    return res.status(400).json({ error: "name, phone, and bloodType are required." });
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
         RETURNING id, donor_code AS "donorCode", name, phone, blood_type AS "bloodType", email`,
        [code, name.trim(), phone.trim(), bloodType, email?.trim() || null]
      );
      return res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === "23505") continue; // unique_violation on donor_code — regenerate and retry
      throw err;
    }
  }
  res.status(500).json({ error: "Could not generate a unique donor code. Try again." });
});

// Manual override for the DOH 90-day cooling rule (e.g. an admin correcting
// a data-entry mistake, or force-locking a donor). Since eligibility is
// derived from the last donation date rather than stored as a flag,
// "locking" means setting last_donation_at to now, and "marking eligible"
// means clearing the date the 90-day rule counts from. That date is the
// hospital-recorded last_donation_at, or, when there is none, the donor's
// own answer at registration (health_screening.lastDonationDate) — so both
// are cleared. Clearing only last_donation_at left every donor deferred by
// their self-reported date still deferred, while the push below told them
// they could donate.
export const setDonorEligibility = asyncHandler(async (req, res) => {
  const { eligible } = req.body;
  if (typeof eligible !== "boolean") {
    return res.status(400).json({ error: "eligible must be a boolean." });
  }

  const { rows: current } = await pool.query(
    `SELECT age, weight_kg AS "weightKg", gender, health_screening AS "healthScreening",
            last_donation_at AS "lastDonationAt"
     FROM donors WHERE id = $1`,
    [req.params.id]
  );
  if (!current[0]) return res.status(404).json({ error: "Donor not found." });

  if (eligible) {
    // Only the 90-day rule can be overridden here. If another deferral
    // would remain (a recent tattoo, travel, an active infection...),
    // change nothing and say why, rather than "marking eligible" a donor
    // who would still be deferred everywhere else.
    const after = eligibilityWithDatesCleared(current[0]);
    if (!after.isEligible) {
      return res.status(409).json({
        error: `This donor is still deferred for another reason: ${after.lockMessage ?? "see their screening"}`,
        lockReason: after.lockReason,
      });
    }
  }

  const { rows } = await pool.query(
    `UPDATE donors
     SET last_donation_at = $1,
         health_screening = CASE
           WHEN $3 AND jsonb_typeof(health_screening) = 'object' AND health_screening ? 'lastDonationDate'
             THEN jsonb_set(health_screening, '{lastDonationDate}', 'null'::jsonb)
           ELSE health_screening
         END,
         updated_at = now()
     WHERE id = $2
     RETURNING id, donor_code AS "donorCode", last_donation_at AS "lastDonationAt",
               age, weight_kg AS "weightKg", gender, health_screening AS "healthScreening"`,
    [eligible ? null : new Date(), req.params.id, eligible]
  );
  res.json(withEligibility(rows[0]));

  // Either direction updates the donor's open app right away (HomeView
  // applies `eligible` directly).
  sendToDonor(rows[0].id, { type: "eligibility_changed", eligible });

  // Only worth telling a donor about the "good news" direction — an admin
  // force-locking someone isn't something to push-notify them about.
  // Fire-and-forget after responding, same pattern as the broadcast/booking
  // pushes elsewhere: an admin's click shouldn't wait on this.
  if (eligible) {
    sendPushToDonor(rows[0].id, {
      title: "You're eligible to donate again!",
      body: "The hospital has cleared you to donate. Book an appointment whenever you're ready.",
      data: { type: "account_notice", reason: "eligible_again" },
    }).catch((err) => {
      console.error("Eligibility push failed:", err.message);
    });
  }
});

// Full unpaginated export for CSV download — separate from listDonors so
// the paginated endpoint's page size cap (100) doesn't limit exports. Same
// hospital scoping as listDonors, so an export taken while a specific
// hospital is selected matches what that admin actually sees on screen.
export const exportDonors = asyncHandler(async (req, res) => {
  const { where, params } = donorFilters(req);
  const { rows } = await pool.query(
    `SELECT donor_code AS "donorCode", name, phone, blood_type AS "bloodType",
            last_donation_at AS "lastDonationAt",
            age, weight_kg AS "weightKg", gender, health_screening AS "healthScreening"
     FROM donors
     ${where}
     ORDER BY name`,
    params
  );
  res.json(
    rows.map((donor) => withEligibility(donor)).filter((donor) => matchesEligibility(donor, req.query.eligibility))
  );
});

export const getDonor = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, donor_code AS "donorCode", name, phone, blood_type AS "bloodType",
            (photo IS NOT NULL) AS "hasPhoto", photo_updated_at AS "photoUpdatedAt",
            last_donation_at AS "lastDonationAt", age, weight_kg AS "weightKg", gender,
            created_at AS "memberSince"
     FROM donors WHERE id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Donor not found." });
  const donor = rows[0];
  donor.avatar = donor.hasPhoto ? buildPhotoUrl(req, donor.id, donor.photoUpdatedAt) : null;
  delete donor.hasPhoto;
  delete donor.photoUpdatedAt;
  res.json(donor);
});

// Donor Profile popup (Donor Management screen) — donation history. Only
// arrived/completed visits count as "history" (donor_arrivals is written
// exclusively by completeAppointment, never for a pending/cancelled
// appointment), so this is already exactly "donations this donor actually
// showed up and gave blood for", one row per visit. Deliberately returns
// only hospital + date, not any request/PII beyond what's already visible
// elsewhere in the admin — this powers a history list, not a report.
export const getDonationHistory = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT da.id, da.arrived_at AS "arrivedAt", h.name AS "hospitalName"
     FROM donor_arrivals da
     JOIN hospitals h ON h.id = da.hospital_id
     WHERE da.donor_id = $1
     ORDER BY da.arrived_at DESC`,
    [req.params.id]
  );
  res.json(rows);
});

// Appointment View: donations scheduled for a single day, with left/right
// day navigation on the frontend driving the `date` query param. Also
// accepts ?hospitalId=<uuid> from the super admin's hospital switcher (or
// omitted/"all" to show every hospital's appointments for that day).
export const listAppointmentsForDay = asyncHandler(async (req, res) => {
  const hospitalId = hospitalIdParam(req);
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const hospitalClause = hospitalId ? "AND a.hospital_id = $2" : "";
  const params = hospitalId ? [date, hospitalId] : [date];

  const { rows } = await pool.query(
    `SELECT a.id, a.scheduled_at AS "scheduledAt", a.status,
            d.name, d.blood_type AS "bloodType",
            (d.photo IS NOT NULL) AS "hasPhoto", d.id AS "donorId", d.photo_updated_at AS "photoUpdatedAt"
     FROM appointments a
     JOIN donors d ON d.id = a.donor_id
     WHERE a.scheduled_at::date = $1::date ${hospitalClause}
     ORDER BY a.scheduled_at ASC`,
    params
  );
  for (const row of rows) {
    row.avatar = row.hasPhoto ? buildPhotoUrl(req, row.donorId, row.photoUpdatedAt) : null;
    delete row.hasPhoto;
    delete row.donorId;
    delete row.photoUpdatedAt;
  }
  res.json(rows);
});

// Feeds the admin notification bell (NotificationBell.jsx) — surfaces
// appointments a donor booked or cancelled themselves through the mobile
// app recently, the same way GET /api/requests already surfaces broadcasts
// there. One row per appointment: if it's currently cancelled, that's the
// event shown (using updated_at as the cancellation time); otherwise it's
// shown as a "booked" event (using created_at). A booked-then-cancelled
// appointment inside the same window only shows once, as cancelled — an
// acceptable simplification, not a second missed notification, since the
// donor's most recent action is the one that actually matters to the admin.
const RECENT_APPOINTMENT_WINDOW = "7 days";

export const listRecentAppointmentEvents = asyncHandler(async (req, res) => {
  const hospitalId = hospitalIdParam(req);
  const hospitalClause = hospitalId ? "AND a.hospital_id = $1" : "";
  const params = hospitalId ? [hospitalId] : [];

  const { rows } = await pool.query(
    `SELECT a.id, a.status, a.scheduled_at AS "scheduledAt",
            a.created_at AS "createdAt", a.updated_at AS "updatedAt",
            d.name AS "donorName", d.blood_type AS "bloodType"
     FROM appointments a
     JOIN donors d ON d.id = a.donor_id
     WHERE (a.created_at > now() - interval '${RECENT_APPOINTMENT_WINDOW}'
            OR (a.status = 'cancelled' AND a.updated_at > now() - interval '${RECENT_APPOINTMENT_WINDOW}'))
       ${hospitalClause}
     ORDER BY GREATEST(a.created_at, a.updated_at) DESC
     LIMIT 50`,
    params
  );

  const events = rows.map((r) => {
    const isCancelled = r.status === "cancelled";
    return {
      id: r.id,
      eventType: isCancelled ? "cancelled" : "booked",
      eventAt: isCancelled ? r.updatedAt : r.createdAt,
      donorName: r.donorName,
      bloodType: r.bloodType,
      scheduledAt: r.scheduledAt,
    };
  });

  res.json(events);
});

// hospitalId is required here — in the real app this is whichever hospital
// the donor's geolocation-based nearest-hospital match resolved to for this
// appointment; this admin's walk-in form asks for it explicitly instead
// (defaulting to the currently-selected hospital in the switcher).
//
// Slot-capacity enforcement lives in bookAppointment (services/appointments
// .service.js) so this admin flow and the donor-facing self-booking
// endpoint (donorPortal.controller.js, used by the Android app) can never
// enforce the rule differently.
export const createAppointment = asyncHandler(async (req, res) => {
  const { donorId, scheduledAt, hospitalId } = req.body;
  if (!donorId || !scheduledAt || !hospitalId) {
    return res.status(400).json({ error: "donorId, scheduledAt, and hospitalId are required." });
  }

  try {
    const appointment = await bookAppointment({ donorId, hospitalId, scheduledAt });
    res.status(201).json(appointment);
    // Live-updates the donor's app (see realtime/hub.js) when staff book
    // on their behalf.
    sendToDonor(appointment.donorId, { type: "appointment_status_changed" });
  } catch (err) {
    if (err instanceof AppointmentBookingError) {
      return res.status(err.status).json({ error: err.message });
    }
    throw err;
  }
});

// "completed" is deliberately excluded here — recording a donation has real
// side effects (donor_arrivals, last_donation_at, a collected unit) and must
// go through the transactional completeAppointment endpoint below instead of
// this plain status-only update.
export const updateAppointmentStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const allowed = ["confirmed", "pending", "cancelled", "no_show"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(", ")}` });
  }
  // A completed appointment has a collected unit behind it; changing its
  // status here would leave that unit and the donor's 90-day interval in
  // place while the appointment said otherwise. "confirmed" means the donor
  // has arrived, so it stamps the check-in time (kept if already set).
  const { rows } = await pool.query(
    `UPDATE appointments
     SET status = $1::appointment_status,
         checked_in_at = CASE WHEN $1::appointment_status = 'confirmed' THEN COALESCE(checked_in_at, now()) ELSE checked_in_at END,
         updated_at = now()
     WHERE id = $2 AND status != 'completed'
     RETURNING id, donor_id AS "donorId", hospital_id AS "hospitalId", scheduled_at AS "scheduledAt", status,
               checked_in_at AS "checkedInAt"`,
    [status, req.params.id]
  );
  if (!rows[0]) {
    const { rows: exists } = await pool.query("SELECT status FROM appointments WHERE id = $1", [req.params.id]);
    if (exists[0]) return res.status(409).json({ error: "This donation has already been recorded; its status can't be changed." });
    return res.status(404).json({ error: "Appointment not found." });
  }
  res.json(rows[0]);
  sendToDonor(rows[0].donorId, { type: "appointment_status_changed" });
  broadcast({ type: "appointment_updated", hospitalId: rows[0].hospitalId, appointment: { id: rows[0].id, status: rows[0].status } });
});

// Finds the donor's own next active (pending/confirmed) appointment, if
// any — powers the QR pass's scan-to-check-in flow (DonorManagement.jsx's
// `checkin` query param): once a donor is looked up by donor_code, this is
// how staff find which appointment to close out without hunting through
// the day's list by hand. Not date-restricted (earliest active one wins)
// since a donor could scan in slightly before or after their exact slot.
export const getActiveAppointmentForDonor = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.id, a.status, a.hospital_id AS "hospitalId", a.scheduled_at AS "scheduledAt",
            h.name AS "hospitalName"
     FROM appointments a
     JOIN hospitals h ON h.id = a.hospital_id
     WHERE a.donor_id = $1 AND a.status IN ('pending', 'confirmed')
     ORDER BY a.scheduled_at ASC
     LIMIT 1`,
    [req.params.id]
  );
  res.json(rows[0] ?? null);
});

// Instant Pre-Screening Verification — re-runs the same rule-based decision
// tree the donor's own app uses (see eligibilityClassifier.js) against
// whatever screening answers are on file, server-side, so a hospital
// staffer scanning a donor's QR pass gets an authoritative eligible /
// temporarily deferred (with a clearance date) / requires clinical review
// read, without trusting a client-cached status the donor's phone could be
// showing stale.
export const getScreeningSummary = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT age, weight_kg AS "weightKg", gender, health_screening AS "healthScreening",
            last_donation_at AS "lastDonationAt"
     FROM donors WHERE id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Donor not found." });
  res.json(classifyDonorRow(rows[0]));
});

// Records that blood was collected from the donor. It deliberately does NOT
// add the unit to inventory or count it toward a request: collected blood
// still has to pass testing (donationUnits.controller.js release/discard)
// and then be issued to a request (issue). What it does:
//   - re-runs the donor's screening server-side (classifyDonorRow). A donor
//     who isn't ELIGIBLE (deferred, needs clinical review, or no screening on
//     file) is refused unless staff send screeningOverride: true after the
//     on-site interview/physician clearance; the override and its note are
//     stored on the unit.
//   - flips the appointment to completed and starts the 90-day interval
//   - logs the donor_arrivals row (arrived_at = the check-in time if the
//     donor was checked in, for response-time tracking)
//   - creates a donation_units row with status 'collected'
//   - credits the donation to an open request of the same blood type at this
//     hospital, chosen by the MinHeap (most urgent tier, then oldest). The
//     credit records which request the donor responded to; the request's
//     units_fulfilled only changes when a released unit is issued to it.
// Everything runs in one transaction with the appointment row locked, so a
// double-click can't record the same donation twice.
export const completeAppointment = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT a.id, a.status, a.donor_id AS "donorId", a.hospital_id AS "hospitalId",
              a.checked_in_at AS "checkedInAt", d.blood_type AS "bloodType",
              d.age, d.weight_kg AS "weightKg", d.gender, d.health_screening AS "healthScreening",
              d.last_donation_at AS "lastDonationAt"
       FROM appointments a
       JOIN donors d ON d.id = a.donor_id
       WHERE a.id = $1
       FOR UPDATE OF a`,
      [req.params.id]
    );
    const appt = rows[0];
    if (!appt) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Appointment not found." });
    }
    if (appt.status === "completed") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "This donation has already been recorded." });
    }
    if (appt.status === "cancelled" || appt.status === "no_show") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `This appointment is ${appt.status.replace("_", "-")}; book a new one first.` });
    }

    const screening = classifyDonorRow(appt);
    const override = req.body?.screeningOverride === true;
    const screeningNote = typeof req.body?.screeningNote === "string" ? req.body.screeningNote.trim() || null : null;
    if (screening.status !== "ELIGIBLE" && !override) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error:
          screening.status === "UNKNOWN"
            ? `${screening.message} Screen the donor on site before recording the donation.`
            : `The donor's screening says ${screening.status.replace("_", " ").toLowerCase()}: ${screening.message}`,
        code: "SCREENING_NOT_CLEAR",
        screening,
      });
    }

    // Provisional type for the unit: the donor's type on file, or what staff
    // enter for a donor registered as "not sure" (migration 027). The lab's
    // typing confirms or corrects it at release.
    let bloodType = appt.bloodType;
    if (!bloodType && req.body?.bloodType !== undefined) {
      if (!BLOOD_TYPES.includes(req.body.bloodType)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: `bloodType must be one of: ${BLOOD_TYPES.join(", ")}` });
      }
      bloodType = req.body.bloodType;
    }

    await client.query(
      `UPDATE appointments SET status = 'completed', checked_in_at = COALESCE(checked_in_at, now()), updated_at = now()
       WHERE id = $1`,
      [appt.id]
    );
    await client.query("UPDATE donors SET last_donation_at = now(), updated_at = now() WHERE id = $1", [appt.donorId]);
    const { rows: arrivalRows } = await client.query(
      `INSERT INTO donor_arrivals (donor_id, hospital_id, arrived_at, appointment_id)
       VALUES ($1, $2, COALESCE($3, now()), $4) RETURNING id`,
      [appt.donorId, appt.hospitalId, appt.checkedInAt, appt.id]
    );
    const arrivalId = arrivalRows[0].id;

    // Min-Heap: open requests for this exact blood type at this hospital,
    // most urgent tier first, then oldest — extractMin() picks the request
    // this donation is credited to.
    let creditedRequest = null;
    if (bloodType) {
      const { rows: candidateRows } = await client.query(
        `SELECT id, request_code AS "requestCode", units_needed AS "unitsNeeded",
                units_fulfilled AS "unitsFulfilled", priority, created_at AS "createdAt"
         FROM blood_requests
         WHERE hospital_id = $1 AND blood_type = $2 AND status IN ('OPEN', 'PARTIALLY_FULFILLED')`,
        [appt.hospitalId, bloodType]
      );
      const priorityRank = { EMERGENCY: 0, URGENT: 1 };
      const requestHeap = new MinHeap((a, b) => {
        const rankA = priorityRank[a.priority] ?? 2;
        const rankB = priorityRank[b.priority] ?? 2;
        if (rankA !== rankB) return rankA - rankB;
        return new Date(a.createdAt) - new Date(b.createdAt);
      });
      for (const row of candidateRows) requestHeap.insert(row);
      const match = requestHeap.extractMin();
      if (match) {
        creditedRequest = { requestCode: match.requestCode, unitsNeeded: match.unitsNeeded, unitsFulfilled: match.unitsFulfilled };
        await client.query("UPDATE donor_arrivals SET request_id = $1 WHERE id = $2", [match.id, arrivalId]);
        creditedRequest.id = match.id;
      }
    }

    let unit = null;
    for (let attempt = 0; attempt < 5 && !unit; attempt++) {
      await client.query("SAVEPOINT unit_code");
      try {
        const { rows: unitRows } = await client.query(
          `INSERT INTO donation_units (unit_code, appointment_id, donor_id, hospital_id, blood_type, request_id,
                                       screening_override, screening_note, collected_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id, unit_code AS "unitCode", status, blood_type AS "bloodType"`,
          [
            newUnitCode(),
            appt.id,
            appt.donorId,
            appt.hospitalId,
            bloodType,
            creditedRequest?.id ?? null,
            screening.status !== "ELIGIBLE",
            screening.status !== "ELIGIBLE" ? screeningNote ?? `Recorded with screening ${screening.status}` : null,
            req.admin?.id ?? null,
          ]
        );
        unit = unitRows[0];
      } catch (err) {
        if (err.code !== "23505" || !/unit_code/.test(err.constraint ?? "")) throw err;
        await client.query("ROLLBACK TO SAVEPOINT unit_code");
      }
    }
    if (!unit) throw new Error("Could not generate a unique unit code.");

    await client.query("COMMIT");
    if (creditedRequest) delete creditedRequest.id;
    res.json({ id: appt.id, status: "completed", unit, creditedRequest, screening: screening.status });

    broadcast({
      type: "appointment_completed",
      hospitalId: appt.hospitalId,
      appointment: { id: appt.id, status: "completed" },
    });
    sendToDonor(appt.donorId, { type: "donation_completed" });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
});

// QR check-in: the donor's mobile app shows GET /api/donor/appointments/:id/qr
// as a QR code; front-desk staff scan it (or, until the web UI has an actual
// camera-based scanner, paste the decoded text into a plain input — a QR
// scanner "typing" into a focused field is a common, legitimate pattern, not
// a placeholder hack) and this endpoint does the same thing confirmArrival
// already does: flips the appointment to 'confirmed'. It deliberately does
// NOT call completeAppointment's full donation-recording flow (inventory,
// last_donation_at, donor_arrivals) — check-in means "they've shown up",
// not "the donation happened", which still needs a staff member's actual
// medical sign-off afterward.
export const checkInByQr = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "token is required." });

  let payload;
  try {
    payload = verifySessionToken(token);
  } catch {
    return res.status(400).json({ error: "This check-in code is invalid or has expired." });
  }
  if (payload.role !== "appointment_checkin") {
    return res.status(400).json({ error: "This is not a valid check-in code." });
  }

  const { rows } = await pool.query(
    `SELECT a.id, a.status, a.hospital_id AS "hospitalId", a.scheduled_at AS "scheduledAt",
            d.name AS "donorName", d.donor_code AS "donorCode", d.blood_type AS "bloodType",
            d.age, d.weight_kg AS "weightKg", d.gender, d.health_screening AS "healthScreening",
            d.last_donation_at AS "lastDonationAt"
     FROM appointments a
     JOIN donors d ON d.id = a.donor_id
     WHERE a.id = $1 AND a.donor_id = $2`,
    [payload.appointmentId, payload.donorId]
  );
  const appt = rows[0];
  if (!appt) return res.status(404).json({ error: "Appointment not found." });
  if (!["pending", "confirmed"].includes(appt.status)) {
    return res.status(400).json({ error: `This appointment is already ${appt.status}.` });
  }

  await pool.query(
    "UPDATE appointments SET status = 'confirmed', checked_in_at = COALESCE(checked_in_at, now()), updated_at = now() WHERE id = $1",
    [appt.id]
  );
  // Re-run the screening server-side so staff see it at check-in; it is
  // enforced when the donation is recorded (completeAppointment).
  const screening = classifyDonorRow(appt);

  res.json({
    id: appt.id,
    status: "confirmed",
    donorName: appt.donorName,
    donorCode: appt.donorCode,
    bloodType: appt.bloodType,
    scheduledAt: appt.scheduledAt,
    screening,
  });
  sendToDonor(payload.donorId, { type: "appointment_status_changed" });
  broadcast({ type: "appointment_updated", hospitalId: appt.hospitalId, appointment: { id: appt.id, status: "confirmed" } });
});

// Staff correction of a donor's blood type (e.g. the donor typed it wrong at
// registration and the blood bank has a record). Donors can never change it
// themselves (updateMyProfile ignores it). A reason is required, and the
// old and new values go to donor_change_log with the admin who made the
// change. Lab typing at unit release (donationUnits.controller.js) is the
// other way it changes, and is logged the same way.
export const correctDonorBloodType = asyncHandler(async (req, res) => {
  const { bloodType } = req.body ?? {};
  const reason = String(req.body?.reason ?? "").trim();
  if (!BLOOD_TYPES.includes(bloodType)) {
    return res.status(400).json({ error: `bloodType must be one of: ${BLOOD_TYPES.join(", ")}` });
  }
  if (!reason) return res.status(400).json({ error: "Give a reason for the correction." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT blood_type AS "bloodType" FROM donors WHERE id = $1 FOR UPDATE`, [
      req.params.id,
    ]);
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Donor not found." });
    }
    if (rows[0].bloodType === bloodType) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `The donor's blood type is already ${bloodType}.` });
    }
    await client.query(
      `INSERT INTO donor_change_log (donor_id, field, old_value, new_value, changed_by, admin_id, reason)
       VALUES ($1, 'blood_type', $2, $3, 'staff', $4, $5)`,
      [req.params.id, rows[0].bloodType, bloodType, req.admin.id, reason]
    );
    // A staff correction isn't lab typing, so the lab confirmation is cleared
    // until the donor's next unit is typed.
    await client.query(
      "UPDATE donors SET blood_type = $1, blood_type_confirmed_at = NULL, updated_at = now() WHERE id = $2",
      [bloodType, req.params.id]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  res.json({ id: req.params.id, bloodType });
  sendToDonor(req.params.id, { type: "profile_updated" });
});

// History of changes to a donor's details (donor_change_log), newest first.
export const getDonorChangeLog = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.field, c.old_value AS "oldValue", c.new_value AS "newValue", c.changed_by AS "changedBy",
            a.username AS "adminName", c.reason, c.created_at AS "createdAt"
     FROM donor_change_log c
     LEFT JOIN admins a ON a.id = c.admin_id
     WHERE c.donor_id = $1
     ORDER BY c.created_at DESC
     LIMIT 100`,
    [req.params.id]
  );
  res.json(rows);
});
