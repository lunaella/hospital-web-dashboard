// Integration tests for the donation stages, booking rules and change log
// (migration 029), run against a real Postgres and Redis through the HTTP
// API, including concurrent requests.
//
// Skipped unless TEST_DATABASE_URL and TEST_REDIS_URL are set. The database
// must be a throwaway local one loaded from db/schema.sql: the tests insert
// and delete rows. They refuse to run against a non-local host.
//
//   docker run -d --name resq-test-pg -e POSTGRES_USER=resq -e POSTGRES_PASSWORD=test -e POSTGRES_DB=resq -p 55432:5432 postgres:16-alpine
//   docker exec -i resq-test-pg psql -U resq -d resq < db/schema.sql
//   docker run -d --name resq-test-redis -p 56379:6379 redis:7-alpine
//   TEST_DATABASE_URL=postgresql://resq:test@localhost:55432/resq TEST_REDIS_URL=redis://localhost:56379 \
//     node --test test/donationStages.integration.test.js

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const DB = process.env.TEST_DATABASE_URL;
const REDIS = process.env.TEST_REDIS_URL;
const enabled = Boolean(DB && REDIS) && /@(localhost|127\.0\.0\.1)[:/]/.test(DB ?? "");
const skip = enabled ? false : "set TEST_DATABASE_URL and TEST_REDIS_URL to a local throwaway database";

let server, base, pool, redis, signSessionToken, signDonorToken;
let adminToken, hospitalId;
const ids = { donors: [], requests: [] };

const ELIGIBLE_SCREENING = {
  hasTattsOrPierce: false,
  hasAlcoholPast24hr: false,
  hasActiveInfectOrMeds: false,
  feelsWellToday: true,
  hasEatenRecently: true,
  isFirstTimeDonor: true,
  hasHighRiskExpo: false,
};

async function call(method, path, { token = adminToken, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function makeDonor({ bloodType = "O+", screening = ELIGIBLE_SCREENING, gender = "male", verification = "verified" } = {}) {
  const tag = crypto.randomBytes(4).toString("hex");
  const phone = `+639${String(parseInt(tag, 16)).padStart(9, "0").slice(-9)}`;
  const { rows } = await pool.query(
    `INSERT INTO donors (donor_code, name, phone, blood_type, age, weight_kg, gender, health_screening)
     VALUES ($1, $2, $3, $4, 30, 60, $5, $6) RETURNING id`,
    [`T-${tag}`, `Test Donor ${tag}`, phone, bloodType, screening ? gender : null, screening ? JSON.stringify(screening) : null]
  );
  const id = rows[0].id;
  ids.donors.push(id);
  if (verification) {
    await pool.query(
      `INSERT INTO donor_verifications (donor_id, id_type, source, status) VALUES ($1, 'National ID', 'didit', $2)`,
      [id, verification]
    );
  }
  const { token, jti } = signDonorToken(id);
  await redis.set(`donor_session:${jti}`, "1", "EX", 600);
  return { id, token };
}

async function makeRequest({ bloodType = "O+", priority = "NORMAL", unitsNeeded = 2, minutesAgo = 0 } = {}) {
  const code = `REQ-T${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const { rows } = await pool.query(
    `INSERT INTO blood_requests (hospital_id, request_code, blood_type, priority, ward, units_needed, status, created_at)
     VALUES ($1, $2, $3, $4, 'ER', $5, 'OPEN', now() - make_interval(mins => $6)) RETURNING id`,
    [hospitalId, code, bloodType, priority, unitsNeeded, minutesAgo]
  );
  ids.requests.push(rows[0].id);
  return { id: rows[0].id, code };
}

let slotMinutes = 0;
function nextSlot() {
  slotMinutes += 30;
  return new Date(Date.UTC(2030, 0, 1, 0, 0) + slotMinutes * 60000).toISOString();
}

async function inventory(bloodType) {
  const { rows } = await pool.query(
    "SELECT units_available FROM blood_inventory WHERE hospital_id = $1 AND blood_type = $2",
    [hospitalId, bloodType]
  );
  return rows[0]?.units_available ?? 0;
}

async function bookAndCheckIn(donor) {
  const booked = await call("POST", "/api/donor/appointments", {
    token: donor.token,
    body: { hospitalId, scheduledAt: nextSlot() },
  });
  assert.equal(booked.status, 201, JSON.stringify(booked.body));
  const checkedIn = await call("PATCH", `/api/appointments/${booked.body.id}`, { body: { status: "confirmed" } });
  assert.equal(checkedIn.status, 200);
  return booked.body.id;
}

before(async () => {
  if (!enabled) return;
  process.env.DATABASE_URL = DB;
  process.env.REDIS_URL = REDIS;
  process.env.JWT_SECRET ||= "integration-test-secret";
  ({ pool } = await import("../src/db/pool.js"));
  ({ redis } = await import("../src/db/redis.js"));
  ({ signSessionToken, signDonorToken } = await import("../src/utils/jwt.js"));
  const { app } = await import("../src/app.js");
  await redis.connect().catch(() => {});

  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;

  const { rows: h } = await pool.query(
    `INSERT INTO hospitals (code, name, city, appointment_capacity) VALUES ($1, 'Test Hospital', 'Lucena', 2) RETURNING id`,
    [`T-${crypto.randomBytes(3).toString("hex")}`]
  );
  hospitalId = h[0].id;
  const { rows: a } = await pool.query(
    `INSERT INTO admins (username, email, password_hash, clearance) VALUES ($1, 't@example.com', 'x', 'FULL_ROOT_ACCESS_LEVEL_5') RETURNING id`,
    [`test-${crypto.randomBytes(3).toString("hex")}`]
  );
  const { token, jti } = signSessionToken(a[0].id);
  await redis.set(`session:${jti}`, "1", "EX", 600);
  adminToken = token;
});

after(async () => {
  if (!enabled) return;
  await pool.query("DELETE FROM donation_units WHERE hospital_id = $1", [hospitalId]);
  await pool.query("DELETE FROM donors WHERE id = ANY($1::uuid[])", [ids.donors]);
  await pool.query("DELETE FROM hospitals WHERE id = $1", [hospitalId]);
  server.close();
  await pool.end();
  redis.disconnect();
});

test("a donor must be ID-verified to book", { skip }, async () => {
  for (const [verification, pattern] of [
    [null, /Verify your identity/],
    ["in_review", /still being reviewed/],
    ["rejected", /wasn't approved/],
  ]) {
    const donor = await makeDonor({ verification });
    const r = await call("POST", "/api/donor/appointments", { token: donor.token, body: { hospitalId, scheduledAt: nextSlot() } });
    assert.equal(r.status, 403, `${verification}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.code, "VERIFICATION_REQUIRED");
    assert.match(r.body.error, pattern);
  }
  const verified = await makeDonor();
  const ok = await call("POST", "/api/donor/appointments", { token: verified.token, body: { hospitalId, scheduledAt: nextSlot() } });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
});

test("a deferred or unscreened donor can't book from the app", { skip }, async () => {
  const deferred = await makeDonor({ screening: { ...ELIGIBLE_SCREENING, hasAlcoholPast24hr: true } });
  const r1 = await call("POST", "/api/donor/appointments", { token: deferred.token, body: { hospitalId, scheduledAt: nextSlot() } });
  assert.equal(r1.status, 409);
  assert.equal(r1.body.screening.status, "DEFERRED");

  const female = await makeDonor({ gender: "female", screening: { ...ELIGIBLE_SCREENING, hasHighRiskExpo: true } });
  const r2 = await call("POST", "/api/donor/appointments", { token: female.token, body: { hospitalId, scheduledAt: nextSlot() } });
  assert.equal(r2.status, 409);
  assert.equal(r2.body.screening.reason, "deferredClinicalRisk");

  const unscreened = await makeDonor({ screening: null });
  const r3 = await call("POST", "/api/donor/appointments", { token: unscreened.token, body: { hospitalId, scheduledAt: nextSlot() } });
  assert.equal(r3.status, 409);
});

test("one active appointment per donor, even with simultaneous bookings", { skip }, async () => {
  const donor = await makeDonor();
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      call("POST", "/api/donor/appointments", { token: donor.token, body: { hospitalId, scheduledAt: nextSlot() } })
    )
  );
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 4);
});

test("slot capacity holds under simultaneous bookings by different donors", { skip }, async () => {
  const donors = await Promise.all(Array.from({ length: 6 }, () => makeDonor()));
  const slot = nextSlot();
  const results = await Promise.all(
    donors.map((d) => call("POST", "/api/donor/appointments", { token: d.token, body: { hospitalId, scheduledAt: slot } }))
  );
  assert.equal(results.filter((r) => r.status === 201).length, 2); // appointment_capacity = 2
});

test("check-in and collection don't touch inventory or request quotas", { skip }, async () => {
  const normal = await makeRequest({ bloodType: "A+", priority: "NORMAL", minutesAgo: 60 });
  const stat = await makeRequest({ bloodType: "A+", priority: "EMERGENCY", minutesAgo: 5 });
  const donor = await makeDonor({ bloodType: "A+" });
  const before = await inventory("A+");
  const appointmentId = await bookAndCheckIn(donor);

  const { rows: appt } = await pool.query("SELECT checked_in_at FROM appointments WHERE id = $1", [appointmentId]);
  assert.ok(appt[0].checked_in_at, "check-in time recorded");
  assert.equal(await inventory("A+"), before);

  const done = await call("POST", `/api/appointments/${appointmentId}/complete`);
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.unit.status, "collected");
  // Min-heap credits the STAT request over the older Routine one.
  assert.equal(done.body.creditedRequest.requestCode, stat.code);
  assert.equal(await inventory("A+"), before, "collected blood is not inventory");
  const { rows: reqs } = await pool.query(
    "SELECT request_code, units_fulfilled FROM blood_requests WHERE id = ANY($1::uuid[])",
    [[normal.id, stat.id]]
  );
  assert.ok(reqs.every((r) => r.units_fulfilled === 0), "no request quota moves at collection");
});

test("recording the same donation twice at once only records it once", { skip }, async () => {
  const donor = await makeDonor({ bloodType: "B+" });
  const appointmentId = await bookAndCheckIn(donor);
  const results = await Promise.all(
    Array.from({ length: 5 }, () => call("POST", `/api/appointments/${appointmentId}/complete`))
  );
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM donation_units WHERE appointment_id = $1", [appointmentId]);
  assert.equal(rows[0].n, 1);
  const { rows: arrivals } = await pool.query("SELECT count(*)::int AS n FROM donor_arrivals WHERE appointment_id = $1", [appointmentId]);
  assert.equal(arrivals[0].n, 1);
});

test("the server re-checks screening before recording a donation", { skip }, async () => {
  const donor = await makeDonor({ screening: { ...ELIGIBLE_SCREENING, hasActiveInfectOrMeds: true } });
  const booked = await call("POST", "/api/appointments", { body: { donorId: donor.id, hospitalId, scheduledAt: nextSlot() } });
  assert.equal(booked.status, 201); // staff can still book them in for an assessment
  const refused = await call("POST", `/api/appointments/${booked.body.id}/complete`);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, "SCREENING_NOT_CLEAR");
  const overridden = await call("POST", `/api/appointments/${booked.body.id}/complete`, {
    body: { screeningOverride: true, screeningNote: "Cleared by physician after interview" },
  });
  assert.equal(overridden.status, 200);
  const { rows } = await pool.query("SELECT screening_override, screening_note FROM donation_units WHERE appointment_id = $1", [
    booked.body.id,
  ]);
  assert.equal(rows[0].screening_override, true);
  assert.equal(rows[0].screening_note, "Cleared by physician after interview");
});

test("a recorded donation's appointment status can't be changed", { skip }, async () => {
  const donor = await makeDonor();
  const appointmentId = await bookAndCheckIn(donor);
  await call("POST", `/api/appointments/${appointmentId}/complete`);
  const r = await call("PATCH", `/api/appointments/${appointmentId}`, { body: { status: "cancelled" } });
  assert.equal(r.status, 409);
});

test("release adds to inventory once; lab typing corrects and logs the blood type", { skip }, async () => {
  const donor = await makeDonor({ bloodType: "AB+" });
  const appointmentId = await bookAndCheckIn(donor);
  const done = await call("POST", `/api/appointments/${appointmentId}/complete`);
  const unitId = done.body.unit.id;

  const early = await call("POST", `/api/donation-units/${unitId}/issue`, { body: {} });
  assert.equal(early.status, 409, "can't issue before testing");

  const beforeAbNeg = await inventory("AB-");
  const beforeAbPos = await inventory("AB+");
  const results = await Promise.all(
    Array.from({ length: 5 }, () => call("POST", `/api/donation-units/${unitId}/release`, { body: { bloodType: "AB-" } }))
  );
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal(await inventory("AB-"), beforeAbNeg + 1);
  assert.equal(await inventory("AB+"), beforeAbPos);

  const { rows: d } = await pool.query("SELECT blood_type, blood_type_confirmed_at FROM donors WHERE id = $1", [donor.id]);
  assert.equal(d[0].blood_type, "AB-");
  assert.ok(d[0].blood_type_confirmed_at);
  const log = await call("GET", `/api/donors/${donor.id}/changes`);
  assert.equal(log.body[0].field, "blood_type");
  assert.equal(log.body[0].oldValue, "AB+");
  assert.equal(log.body[0].newValue, "AB-");
  assert.equal(log.body[0].changedBy, "lab");
});

test("issuing moves the request quota and never over-fills it", { skip }, async () => {
  const request = await makeRequest({ bloodType: "O-", priority: "URGENT", unitsNeeded: 2 });
  const units = [];
  for (let i = 0; i < 3; i++) {
    const donor = await makeDonor({ bloodType: "O-" });
    const appointmentId = await bookAndCheckIn(donor);
    const done = await call("POST", `/api/appointments/${appointmentId}/complete`);
    await call("POST", `/api/donation-units/${done.body.unit.id}/release`, { body: { bloodType: "O-" } });
    units.push(done.body.unit.id);
  }
  const invBefore = await inventory("O-");
  const results = await Promise.all(
    units.map((id) => call("POST", `/api/donation-units/${id}/issue`, { body: { requestCode: request.code } }))
  );
  assert.equal(results.filter((r) => r.status === 200).length, 2);
  assert.equal(results.filter((r) => r.status === 409).length, 1);
  const { rows } = await pool.query("SELECT units_fulfilled, status FROM blood_requests WHERE id = $1", [request.id]);
  assert.equal(rows[0].units_fulfilled, 2);
  assert.equal(rows[0].status, "FULFILLED");
  assert.equal(await inventory("O-"), invBefore - 2, "only issued units leave inventory");
});

test("issuing to a request of another blood type is refused", { skip }, async () => {
  const request = await makeRequest({ bloodType: "B-" });
  const donor = await makeDonor({ bloodType: "A-" });
  const appointmentId = await bookAndCheckIn(donor);
  const done = await call("POST", `/api/appointments/${appointmentId}/complete`);
  await call("POST", `/api/donation-units/${done.body.unit.id}/release`, { body: { bloodType: "A-" } });
  const r = await call("POST", `/api/donation-units/${done.body.unit.id}/issue`, { body: { requestCode: request.code } });
  assert.equal(r.status, 409);
});

test("a discarded unit never reaches inventory", { skip }, async () => {
  const donor = await makeDonor({ bloodType: "B-" });
  const appointmentId = await bookAndCheckIn(donor);
  const done = await call("POST", `/api/appointments/${appointmentId}/complete`);
  const before = await inventory("B-");
  const noReason = await call("POST", `/api/donation-units/${done.body.unit.id}/discard`, { body: {} });
  assert.equal(noReason.status, 400);
  const r = await call("POST", `/api/donation-units/${done.body.unit.id}/discard`, { body: { reason: "Reactive on screening" } });
  assert.equal(r.status, 200);
  const release = await call("POST", `/api/donation-units/${done.body.unit.id}/release`, { body: { bloodType: "B-" } });
  assert.equal(release.status, 409);
  assert.equal(await inventory("B-"), before);
});

test("staff blood type corrections need a reason and are logged", { skip }, async () => {
  const donor = await makeDonor({ bloodType: "A+" });
  const noReason = await call("PATCH", `/api/donors/${donor.id}/blood-type`, { body: { bloodType: "A-" } });
  assert.equal(noReason.status, 400);
  const ok = await call("PATCH", `/api/donors/${donor.id}/blood-type`, {
    body: { bloodType: "A-", reason: "Red Cross donor card shows A-" },
  });
  assert.equal(ok.status, 200);
  const log = await call("GET", `/api/donors/${donor.id}/changes`);
  assert.equal(log.body[0].changedBy, "staff");
  assert.equal(log.body[0].reason, "Red Cross donor card shows A-");
});

test("donors can't change their blood type, and their detail edits are logged", { skip }, async () => {
  const donor = await makeDonor({ bloodType: "O+" });
  const r = await call("PATCH", "/api/donor/me", { token: donor.token, body: { bloodType: "AB-", name: "Renamed Donor" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.bloodType, "O+");
  const log = await call("GET", `/api/donors/${donor.id}/changes`);
  assert.deepEqual(
    log.body.map((c) => [c.field, c.newValue, c.changedBy]),
    [["name", "Renamed Donor", "donor"]]
  );
  const again = await call("PATCH", "/api/donor/me", { token: donor.token, body: { name: "Second Edit" } });
  assert.equal(again.status, 403);
});

test("the old self-reported verification route is closed", { skip }, async () => {
  const donor = await makeDonor();
  const r = await call("POST", "/api/donor/me/verification", { token: donor.token, body: { idType: "x" } });
  assert.equal(r.status, 410);
});

test("phone numbers are unique per donor account at the database level", { skip }, async () => {
  const donor = await makeDonor();
  const { rows } = await pool.query("SELECT phone FROM donors WHERE id = $1", [donor.id]);
  await assert.rejects(
    pool.query(`INSERT INTO donors (donor_code, name, phone) VALUES ('T-dup', 'Dup', $1)`, [rows[0].phone]),
    /uniq_donors_phone/
  );
});
