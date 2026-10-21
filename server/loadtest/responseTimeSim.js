// End-to-end check of how ResQ measures donor response time, run against
// the local load-test copy only (see loadtest/README.md). For each scenario
// it creates a real broadcast through the API, books a matching donor,
// sets the request's creation time back by a known number of minutes, then
// checks the donor in — and verifies what the system recorded:
//   - which open request the arrival was credited to (the min-heap pick)
//   - the response time (created -> fulfilled) and its rating
//   - the Reports "Donor Response Time" average for today
// It also times how long the broadcast took to rank and log alerts for
// every matching donor.
//
//   LOADTEST_DATABASE_URL=postgresql://resq:resq_dev_password@localhost:5432/resq_loadtest \
//     node loadtest/responseTimeSim.js [--json]

import pg from "pg";
// Same password loadtest/seed.js gives every seeded donor.
const LOADTEST_PASSWORD = "LoadTest-Password-2026";

const BASE = (process.env.BASE_URL || "http://localhost:4100").replace(/\/+$/, "");
const DB_URL = process.env.LOADTEST_DATABASE_URL;

function assertLocal() {
  if (!/\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE)) throw new Error(`Refusing to run against ${BASE}: local only.`);
  const { hostname, pathname } = new URL(DB_URL ?? "postgresql://x@none/none");
  if (!["localhost", "127.0.0.1"].includes(hostname) || !pathname.endsWith("_loadtest")) {
    throw new Error("Set LOADTEST_DATABASE_URL to the local *_loadtest database.");
  }
}

// Same thresholds as requests.controller.js's RATING_THRESHOLDS_MIN.
const THRESHOLDS = { EMERGENCY: [15, 30, 60], URGENT: [30, 60, 120], NORMAL: [60, 120, 240] };
function expectedRating(priority, minutes) {
  const [optimal, good, acceptable] = THRESHOLDS[priority];
  return minutes <= optimal ? "Optimal" : minutes <= good ? "Good" : minutes <= acceptable ? "Acceptable" : "Poor";
}

async function api(method, path, token, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

// Each scenario: one broadcast, donors arriving N minutes after it was
// created. Blood types are unused by the seeded open requests where it
// matters, so the credited request is unambiguous.
const SCENARIOS = [
  { label: "Emergency, donor arrives in 12 min", priority: "EMERGENCY", bloodType: "A-", units: 1, arrivals: [12] },
  { label: "Emergency, donor arrives in 45 min", priority: "EMERGENCY", bloodType: "B-", units: 1, arrivals: [45] },
  { label: "Urgent, donor arrives in 25 min", priority: "URGENT", bloodType: "AB-", units: 1, arrivals: [25] },
  { label: "Urgent, 2 units, donors arrive at 50 and 70 min", priority: "URGENT", bloodType: "A-", units: 2, arrivals: [50, 70] },
  { label: "Normal, donor arrives in 150 min", priority: "NORMAL", bloodType: "B-", units: 1, arrivals: [150] },
];

async function main() {
  assertLocal();
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();

  const { token: admin } = await api("POST", "/auth/login", null, { username: "admin", password: "1234" });
  const { rows: [hospital] } = await db.query(`SELECT id, name FROM hospitals ORDER BY name LIMIT 1`);

  // Start clean: no earlier simulation requests or check-ins at this hospital today.
  await db.query(`DELETE FROM blood_requests WHERE ward = 'Response-time simulation'`);
  // Close the seeded open requests at this hospital so the min-heap only
  // chooses among this script's requests.
  await db.query(`UPDATE blood_requests SET status = 'CANCELLED' WHERE hospital_id = $1 AND request_code LIKE 'LT-%' AND status = 'OPEN'`, [hospital.id]);

  const usedDonors = new Set();
  async function pickDonor(bloodType) {
    const { rows } = await db.query(
      `SELECT id, email FROM donors
       WHERE email LIKE 'loadtest+%@resq.test' AND blood_type = $1
         AND id NOT IN (SELECT donor_id FROM appointments WHERE status IN ('pending', 'confirmed'))
       ORDER BY donor_code`,
      [bloodType],
    );
    const donor = rows.find((r) => !usedDonors.has(r.id));
    if (!donor) throw new Error(`No free seeded donor with blood type ${bloodType}`);
    usedDonors.add(donor.id);
    const { token } = await api("POST", "/donor-auth/login", null, { identifier: donor.email, password: LOADTEST_PASSWORD });
    return { ...donor, token };
  }

  async function broadcast(priority, bloodType, units) {
    const t = performance.now();
    const created = await api("POST", "/requests", admin, { hospitalId: hospital.id, priority, bloodType, ward: "Response-time simulation", unitsNeeded: units });
    const apiMs = performance.now() - t;
    // The API returns the request code as `id` and the row id as `dbId`.
    const id = created.dbId;
    const requestCode = created.id;
    // Alerts are sent after the API replies; wait until the count settles.
    let last = -1, count = 0, stableFor = 0;
    while (stableFor < 3) {
      await new Promise((r) => setTimeout(r, 200));
      ({ rows: [{ count }] } = await db.query(`SELECT count(*)::int AS count FROM notifications WHERE request_id = $1`, [id]));
      stableFor = count === last ? stableFor + 1 : 0;
      last = count;
    }
    const { rows: [d] } = await db.query(
      `SELECT count(*)::int AS alerts, count(DISTINCT donor_id)::int AS donors,
              EXTRACT(EPOCH FROM (max(n.created_at) - r.created_at)) * 1000 AS dispatch_ms
       FROM notifications n JOIN blood_requests r ON r.id = n.request_id WHERE r.id = $1 GROUP BY r.created_at`,
      [id],
    );
    return { id, requestCode, apiMs, alerts: d?.alerts ?? 0, alertedDonors: d?.donors ?? 0, dispatchMs: d ? Number(d.dispatch_ms) : null };
  }

  async function arrive(donor, requestId, minutesAfterCreate) {
    const scheduledAt = new Date(Date.now() + 86400000).toISOString();
    const appt = await api("POST", "/donor/appointments", donor.token, { hospitalId: hospital.id, scheduledAt });
    // Pretend the request was created `minutesAfterCreate` minutes ago.
    await db.query(
      `UPDATE blood_requests SET created_at = now() - ($2 || ' minutes')::interval, submitted_at = now() - ($2 || ' minutes')::interval WHERE id = $1`,
      [requestId, String(minutesAfterCreate)],
    );
    return api("POST", `/appointments/${appt.id}/complete`, admin, {});
  }

  const results = [];
  for (const sc of SCENARIOS) {
    const b = await broadcast(sc.priority, sc.bloodType, sc.units);
    let credited = [];
    for (let i = 0; i < sc.arrivals.length; i++) {
      // Shift the creation time so this arrival lands at its minute mark.
      const donor = await pickDonor(sc.bloodType);
      const out = await arrive(donor, b.id, sc.arrivals[i]);
      credited.push(out.fulfilledRequest?.requestCode ?? null);
    }
    const { rows: [r] } = await db.query(
      `SELECT status, units_fulfilled, system_rating, EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60 AS minutes FROM blood_requests WHERE id = $1`,
      [b.id],
    );
    const expectedMinutes = sc.arrivals[sc.arrivals.length - 1];
    const minutes = r.minutes == null ? null : Number(r.minutes);
    results.push({
      scenario: sc.label, priority: sc.priority, bloodType: sc.bloodType, units: sc.units,
      requestCode: b.requestCode, alertedDonors: b.alertedDonors, alerts: b.alerts,
      broadcastApiMs: b.apiMs, dispatchMs: b.dispatchMs,
      creditedCorrectly: credited.every((c) => c === b.requestCode),
      status: r.status, unitsFulfilled: r.units_fulfilled,
      expectedMinutes, recordedMinutes: minutes,
      expectedRating: expectedRating(sc.priority, expectedMinutes), recordedRating: r.system_rating,
    });
  }

  // Min-heap pick between competing requests: an older Urgent and a newer
  // Emergency for the same blood type. One arrival should go to Emergency.
  const urgent = await broadcast("URGENT", "AB-", 1);
  await db.query(`UPDATE blood_requests SET created_at = now() - interval '40 minutes' WHERE id = $1`, [urgent.id]);
  const emergency = await broadcast("EMERGENCY", "AB-", 1);
  const donor = await pickDonor("AB-");
  const appt = await api("POST", "/donor/appointments", donor.token, { hospitalId: hospital.id, scheduledAt: new Date(Date.now() + 86400000).toISOString() });
  const done = await api("POST", `/appointments/${appt.id}/complete`, admin, {});
  const heapPick = {
    olderUrgent: urgent.requestCode, newerEmergency: emergency.requestCode,
    creditedTo: done.fulfilledRequest?.requestCode, correct: done.fulfilledRequest?.requestCode === emergency.requestCode,
  };
  await db.query(`UPDATE blood_requests SET status = 'CANCELLED' WHERE id = $1`, [urgent.id]);

  // Reports chart: today's average for this hospital vs. the expected one.
  const series = await api("GET", `/reports/response-time?hospitalId=${hospital.id}`, admin);
  const today = series[series.length - 1];
  const { rows: [check] } = await db.query(
    `SELECT round(avg(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60)::numeric, 1) AS avg
     FROM blood_requests WHERE hospital_id = $1 AND resolved_at::date = current_date`,
    [hospital.id],
  );
  const resolvedMinutes = [...results.map((r) => r.expectedMinutes), 0];
  const report = {
    reportedAvgMinutes: today.avgMinutes == null ? null : Number(today.avgMinutes),
    databaseAvgMinutes: Number(check.avg),
    scenarioMinutes: resolvedMinutes,
    note: "The heap-pick Emergency resolves at about 0 minutes, so it is part of today's average.",
  };

  await db.end();
  const out = { hospital: hospital.name, results, heapPick, report };
  if (process.argv.includes("--json")) console.log(JSON.stringify(out, null, 1));
  else {
    console.table(results.map((r) => ({ scenario: r.scenario, alerted: r.alertedDonors, "dispatch ms": r.dispatchMs?.toFixed(0), expected: r.expectedMinutes, recorded: r.recordedMinutes?.toFixed(1), rating: `${r.recordedRating} (expected ${r.expectedRating})`, credited: r.creditedCorrectly })));
    console.log("Min-heap pick:", heapPick);
    console.log("Reports:", report);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
