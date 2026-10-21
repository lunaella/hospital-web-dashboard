// Stress scenarios TC-ST-01 to TC-ST-03 from the thesis (Table 13), run
// against the local load-test copy only (see loadtest/README.md):
//
//   TC-ST-01  50 donors' donations recorded at the same moment for a
//             2-unit request: exactly 2 may count, nothing may crash.
//             Also: 50 donors booking the same slot at once (capacity 5),
//             and one donation "double-clicked" 10 times at once.
//             While it runs, an admin WebSocket times how long the
//             dashboard takes to hear about each donation.
//   TC-ST-02  One broadcast to 500+ matching donors, with SMS going to a
//             local fake gateway (loadtest/mockSmsGateway.js). Needs the
//             second server started with loadtest/redirectSms.js.
//   TC-ST-03  240 overlapping requests (Emergency/Urgent/Normal) within
//             60 seconds, while the dashboard and a donor's feed are read
//             every second to check that Emergency stays on top.
//
//   LOADTEST_DATABASE_URL=postgresql://resq:resq_dev_password@localhost:5432/resq_loadtest \
//     node loadtest/stressScenarios.js st01|st02|st03 [--json]

import pg from "pg";
import bcrypt from "bcryptjs";
import WebSocket from "ws";
import { execFileSync } from "node:child_process";

// Same password loadtest/seed.js gives every seeded donor.
const LOADTEST_PASSWORD = "LoadTest-Password-2026";

const BASE = (process.env.BASE_URL || "http://localhost:4100").replace(/\/+$/, "");
const DB_URL = process.env.LOADTEST_DATABASE_URL;
const MOCK_SMS = process.env.MOCK_SMS_URL || "http://localhost:4200";

function assertLocal() {
  if (!/\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE)) throw new Error(`Refusing to run against ${BASE}: local only.`);
  const { hostname, pathname } = new URL(DB_URL ?? "postgresql://x@none/none");
  if (!["localhost", "127.0.0.1"].includes(hostname) || !pathname.endsWith("_loadtest")) {
    throw new Error("Set LOADTEST_DATABASE_URL to the local *_loadtest database.");
  }
}

async function api(method, path, token, body) {
  const t = performance.now();
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, ms: performance.now() - t };
}

async function mustApi(method, path, token, body) {
  const r = await api(method, path, token, body);
  if (r.status >= 400) throw new Error(`${method} ${path} -> ${r.status}: ${JSON.stringify(r.json)}`);
  return r.json;
}

const pct = (xs, p) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};
const stats = (xs) => ({ n: xs.length, avg: xs.reduce((a, b) => a + b, 0) / (xs.length || 1), p50: pct(xs, 50), p95: pct(xs, 95), max: pct(xs, 100) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Resident memory of the server process listening on the API port, in MB.
function serverRssMb() {
  try {
    const port = new URL(BASE).port || "80";
    const pid = execFileSync("lsof", ["-tiTCP:" + port, "-sTCP:LISTEN"]).toString().trim().split("\n")[0];
    return Number(execFileSync("ps", ["-o", "rss=", "-p", pid]).toString().trim()) / 1024;
  } catch {
    return null;
  }
}

async function adminLogin() {
  return (await mustApi("POST", "/auth/login", null, { username: "admin", password: "1234" })).token;
}

// Seeded donors of one blood type with no active appointment, signed in.
async function signedInDonors(db, bloodType, count) {
  const { rows } = await db.query(
    `SELECT id, email FROM donors
     WHERE email LIKE 'loadtest+%@resq.test' AND blood_type = $1
       AND id NOT IN (SELECT donor_id FROM appointments WHERE status IN ('pending', 'confirmed'))
     ORDER BY donor_code LIMIT $2`,
    [bloodType, count],
  );
  if (rows.length < count) throw new Error(`Only ${rows.length} free ${bloodType} donors, need ${count}.`);
  const out = [];
  for (const d of rows) {
    const { token } = await mustApi("POST", "/donor-auth/login", null, { identifier: d.email, password: LOADTEST_PASSWORD });
    out.push({ ...d, token });
  }
  return out;
}

// Opens the admin real-time feed and records when each event arrives.
function openAdminSocket(token) {
  const url = BASE.replace(/^http/, "ws") + `/ws?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(url);
  const events = [];
  ws.on("message", (raw) => {
    try {
      events.push({ at: performance.now(), event: JSON.parse(raw.toString()) });
    } catch {}
  });
  return new Promise((resolve, reject) => {
    ws.on("open", () => resolve({ ws, events }));
    ws.on("error", reject);
  });
}

// A future slot on the hour, `hoursAhead` from now, so every round books
// clean slots nobody else holds.
function slot(hoursAhead) {
  const d = new Date(Date.now() + hoursAhead * 3600000);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

// ---------------------------------------------------------------- TC-ST-01

async function st01() {
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  const admin = await adminLogin();
  const { rows: hospitals } = await db.query(`SELECT id, name, appointment_capacity AS cap FROM hospitals ORDER BY name`);
  const { ws, events } = await openAdminSocket(admin);
  const ROUNDS = [
    { bloodType: "A-", hospital: hospitals[0] },
    { bloodType: "B-", hospital: hospitals[1] },
    { bloodType: "AB-", hospital: hospitals[2] },
    { bloodType: "O-", hospital: hospitals[0] },
    { bloodType: "AB+", hospital: hospitals[1] },
  ];
  const DONORS = 50;
  const UNITS = 2;
  const rounds = [];
  let hourOffset = 24 * 30 + Math.floor(Math.random() * 24 * 300);

  for (const [i, { bloodType, hospital }] of ROUNDS.entries()) {
    // Only this round's request may be open for this blood type here, so
    // "exactly 2 credited" is unambiguous.
    await db.query(
      `UPDATE blood_requests SET status = 'CANCELLED' WHERE hospital_id = $1 AND blood_type = $2 AND status IN ('OPEN', 'PARTIALLY_FULFILLED')`,
      [hospital.id, bloodType],
    );
    const created = await mustApi("POST", "/requests", admin, { hospitalId: hospital.id, priority: "URGENT", bloodType, ward: "Stress test ST-01", unitsNeeded: UNITS });
    const donors = await signedInDonors(db, bloodType, DONORS);
    const { rows: [inv0] } = await db.query(`SELECT COALESCE(sum(units_available), 0)::int AS units FROM blood_inventory WHERE hospital_id = $1 AND blood_type = $2`, [hospital.id, bloodType]);

    // Part A: all 50 book the same slot at once. Capacity is 5.
    hourOffset += 1;
    const sameSlot = slot(hourOffset);
    const booking = await Promise.all(donors.map((d) => api("POST", "/donor/appointments", d.token, { hospitalId: hospital.id, scheduledAt: sameSlot })));
    const booked = booking.filter((r) => r.status === 201);
    const full = booking.filter((r) => r.status === 409);
    const { rows: [slotCount] } = await db.query(
      `SELECT count(*)::int AS n FROM appointments WHERE hospital_id = $1 AND scheduled_at = $2 AND status != 'cancelled'`,
      [hospital.id, sameSlot],
    );

    // The rest book their own slots (5 per slot), so all 50 have an appointment.
    const apptByDonor = new Map(booking.map((r, k) => [donors[k].id, r.status === 201 ? r.json.id : null]));
    const waiting = donors.filter((d) => !apptByDonor.get(d.id));
    for (let k = 0; k < waiting.length; k++) {
      if (k % hospital.cap === 0) hourOffset += 1;
      const appt = await mustApi("POST", "/donor/appointments", waiting[k].token, { hospitalId: hospital.id, scheduledAt: slot(hourOffset) });
      apptByDonor.set(waiting[k].id, appt.id);
    }

    // Part B: all 50 donations recorded at the same moment.
    const eventsBefore = events.length;
    const sentAt = new Map();
    const completions = await Promise.all(
      donors.map((d) => {
        const id = apptByDonor.get(d.id);
        sentAt.set(id, performance.now());
        return api("POST", `/appointments/${id}/complete`, admin, {}).then((r) => ({ ...r, id }));
      }),
    );
    await sleep(1500); // let the last WebSocket events arrive
    const completedEvents = events.slice(eventsBefore).filter((e) => e.event.type === "appointment_completed");
    const wsLatency = completedEvents.map((e) => e.at - sentAt.get(e.event.appointment.id)).filter((x) => Number.isFinite(x));

    const { rows: [req] } = await db.query(
      `SELECT status, units_needed, units_fulfilled, (SELECT count(*)::int FROM donor_arrivals WHERE request_id = r.id) AS arrivals
       FROM blood_requests r WHERE id = $1`,
      [created.dbId],
    );
    const { rows: [inv1] } = await db.query(`SELECT COALESCE(sum(units_available), 0)::int AS units FROM blood_inventory WHERE hospital_id = $1 AND blood_type = $2`, [hospital.id, bloodType]);

    // Part C: one donation "double-clicked" 10 times at once.
    const [extra] = await signedInDonors(db, bloodType, 1);
    hourOffset += 1;
    const extraAppt = await mustApi("POST", "/donor/appointments", extra.token, { hospitalId: hospital.id, scheduledAt: slot(hourOffset) });
    const { rows: [{ clickStart }] } = await db.query(`SELECT now() AS "clickStart"`);
    const clicks = await Promise.all(Array.from({ length: 10 }, () => api("POST", `/appointments/${extraAppt.id}/complete`, admin, {})));
    const { rows: [arrivalsForExtra] } = await db.query(
      `SELECT count(*)::int AS n FROM donor_arrivals WHERE donor_id = $1 AND arrived_at >= $2`,
      [extra.id, clickStart],
    );

    const credited = completions.filter((r) => r.status === 200 && r.json?.fulfilledRequest?.requestCode === created.id);
    rounds.push({
      round: i + 1,
      hospital: hospital.name,
      bloodType,
      request: created.id,
      unitsNeeded: UNITS,
      booking: { attempts: DONORS, capacity: hospital.cap, booked: booked.length, slotFullReplies: full.length, otherReplies: DONORS - booked.length - full.length, rowsInSlot: slotCount.n },
      completion: {
        attempts: DONORS,
        ok: completions.filter((r) => r.status === 200).length,
        serverErrors: completions.filter((r) => r.status >= 500).length,
        creditedToRequest: credited.length,
        notCredited: completions.filter((r) => r.status === 200 && !r.json?.fulfilledRequest).length,
        requestStatus: req.status,
        unitsFulfilled: req.units_fulfilled,
        arrivalsLinkedToRequest: req.arrivals,
        inventoryAdded: inv1.units - inv0.units,
        apiMs: stats(completions.map((r) => r.ms)),
        dashboardEvents: completedEvents.length,
        dashboardUpdateMs: stats(wsLatency),
      },
      doubleClick: {
        clicks: 10,
        recorded: clicks.filter((r) => r.status === 200).length,
        rejectedAlreadyRecorded: clicks.filter((r) => r.status === 400).length,
        serverErrors: clicks.filter((r) => r.status >= 500).length,
        arrivalRows: arrivalsForExtra.n,
      },
    });
  }
  ws.close();
  await db.end();
  return { test: "TC-ST-01", rounds };
}

// ---------------------------------------------------------------- TC-ST-02

// Tops up one blood type to `target` donors who are eligible right now
// (never donated, clean screening), using the seed's naming so a reseed
// clears them too.
async function ensureEligibleDonors(db, bloodType, target) {
  const { rows: [{ n }] } = await db.query(
    `SELECT count(*)::int AS n FROM donors WHERE blood_type = $1 AND email LIKE 'loadtest+st%@resq.test'`,
    [bloodType],
  );
  const add = Math.max(0, target - n);
  if (!add) return;
  const hash = await bcrypt.hash(LOADTEST_PASSWORD, 10);
  const screening = JSON.stringify({
    isFirstTimeDonor: true, lastDonationDate: null, totalDonations: 0, feelsWellToday: true, hasEatenRecently: true,
    hasTattsOrPierce: false, tattooDate: null, hasAlcoholPast24hr: false, hasActiveInfectOrMeds: false,
    recentMedProcedures: [], medProcedureDetails: {}, hasMajorMedicalHistory: false, majorMedicalHistoryDesc: null,
    hasTransfusionOrSurgery: false, transfusionOrSurgeryDate: null, hasTravelOrNeedleStick: false,
    travelOrNeedleDate: null, travelOrNeedleDesc: null, isPregOrNursing: null, lastMensPeriodDate: null, hasHighRiskExpo: false,
  });
  for (let i = n + 1; i <= target; i++) {
    await db.query(
      `INSERT INTO donors (donor_code, name, phone, blood_type, email, password_hash, age, weight_kg, gender, health_screening)
       VALUES ($1, $2, $3, $4, $5, $6, 30, 68, 'male', $7)`,
      [`LT-ST${String(i).padStart(4, "0")}`, `Stress Donor ${i}`, `+6391${String(i).padStart(8, "0")}`, bloodType, `loadtest+st${i}@resq.test`, hash, screening],
    );
  }
}

async function st02() {
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  const BLOOD = "O+";
  await ensureEligibleDonors(db, BLOOD, 400);
  // Fresh eligibility for this test: nobody of this type donated recently.
  await db.query(`UPDATE donors SET last_donation_at = NULL WHERE blood_type = $1 AND email LIKE 'loadtest+st%@resq.test'`, [BLOOD]);
  const admin = await adminLogin();
  const { rows: [hospital] } = await db.query(`SELECT id FROM hospitals ORDER BY name LIMIT 1`);

  const mode = process.env.MOCK_SMS_MODE || "unlimited";
  await fetch(`${MOCK_SMS}/__reset`, { method: "POST" });
  const rss = [serverRssMb()];
  const created = await api("POST", "/requests", admin, { hospitalId: hospital.id, priority: "EMERGENCY", bloodType: BLOOD, ward: "Stress test ST-02", unitsNeeded: 3 });
  if (created.status !== 201) throw new Error(`Broadcast failed: ${created.status} ${JSON.stringify(created.json)}`);
  const start = performance.now();

  // Wait until the notification log stops growing.
  let last = -1, count = 0, stableFor = 0;
  while (stableFor < 10) {
    await sleep(500);
    ({ rows: [{ count }] } = await db.query(`SELECT count(*)::int AS count FROM notifications WHERE request_id = $1`, [created.json.dbId]));
    rss.push(serverRssMb());
    stableFor = count === last ? stableFor + 1 : 0;
    last = count;
  }
  const gateway = await (await fetch(`${MOCK_SMS}/__stats`)).json();

  const { rows: byChannel } = await db.query(
    `SELECT channel, status, count(*)::int AS n,
            EXTRACT(EPOCH FROM (max(created_at) - (SELECT created_at FROM blood_requests WHERE id = $1))) AS last_s
     FROM notifications WHERE request_id = $1 GROUP BY channel, status ORDER BY channel, status`,
    [created.json.dbId],
  );
  const { rows: errors } = await db.query(
    `SELECT error_message, count(*)::int AS n FROM notifications WHERE request_id = $1 AND status = 'failed' AND channel = 'sms' GROUP BY 1 ORDER BY 2 DESC`,
    [created.json.dbId],
  );
  // Who should have been texted: every donor of this type whose app would
  // say "can donate now" and who has SMS on. Computed by the server's own
  // rule, so read it back from the sms rows plus the deferred in-app rows.
  const { rows: [matched] } = await db.query(
    `SELECT count(DISTINCT donor_id) FILTER (WHERE audience = 'direct')::int AS direct,
            count(DISTINCT donor_id) FILTER (WHERE audience = 'referral')::int AS referral
     FROM notifications WHERE request_id = $1`,
    [created.json.dbId],
  );
  await db.query(`UPDATE blood_requests SET status = 'CANCELLED' WHERE id = $1`, [created.json.dbId]);
  await db.end();
  return {
    test: "TC-ST-02",
    gatewayMode: mode,
    request: created.json.id,
    broadcastApiMs: created.ms,
    eligibleDonorsAlerted: matched.direct,
    deferredDonorsInApp: matched.referral,
    notificationRows: count,
    byChannel,
    smsFailureReasons: errors,
    gateway,
    secondsUntilLogComplete: (performance.now() - start) / 1000 - 5,
    serverRssMb: { before: rss[0], peak: Math.max(...rss.filter(Boolean)), after: rss[rss.length - 1] },
  };
}

// ---------------------------------------------------------------- TC-ST-03

async function st03() {
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  const admin = await adminLogin();
  const { rows: hospitals } = await db.query(`SELECT id FROM hospitals ORDER BY name`);
  const [watcher] = await signedInDonors(db, "O+", 1);
  const { rows: [{ before }] } = await db.query(`SELECT count(*)::int AS before FROM blood_requests WHERE status IN ('OPEN','PARTIALLY_FULFILLED')`);

  const TOTAL = 240;
  const WINDOW_MS = 60000;
  const PRIORITIES = ["EMERGENCY", "URGENT", "NORMAL"];
  const TYPES = ["O+", "A+", "B+", "AB+", "O-", "A-", "B-", "AB-"];
  // Emergencies are deliberately sent late in the window, after many
  // Urgent and Normal requests, so "reaches the top" is actually tested.
  const plan = Array.from({ length: TOTAL }, (_, i) => ({
    at: Math.floor((i / TOTAL) * WINDOW_MS),
    priority: PRIORITIES[i % 3],
    bloodType: i % 4 === 0 ? "O+" : TYPES[i % TYPES.length],
    hospitalId: hospitals[i % hospitals.length].id,
  }));

  const creates = [];
  const checks = [];
  const rss = [];
  const t0 = performance.now();
  let flooding = true;

  // Every second: read the dashboard and the donor feed, check the order.
  const isOrdered = (rows) => {
    const rank = { EMERGENCY: 0, URGENT: 1, NORMAL: 2 };
    for (let k = 1; k < rows.length; k++) if (rank[rows[k - 1].priority] > rank[rows[k].priority]) return false;
    return true;
  };
  const watcherLoop = (async () => {
    while (flooding) {
      const [dash, feed] = await Promise.all([api("GET", "/dashboard/monitoring", admin), api("GET", "/donor/requests", watcher.token)]);
      const hasEmergency = (rows) => (rows ?? []).some((r) => r.priority === "EMERGENCY");
      checks.push({
        t: performance.now() - t0,
        dashMs: dash.ms, dashRows: dash.json?.length ?? 0, dashOrdered: dash.status === 200 && isOrdered(dash.json), dashTopEmergency: !hasEmergency(dash.json) || dash.json[0].priority === "EMERGENCY",
        feedMs: feed.ms, feedRows: feed.json?.length ?? 0, feedOrdered: feed.status === 200 && isOrdered(feed.json), feedTopEmergency: !hasEmergency(feed.json) || feed.json[0].priority === "EMERGENCY",
      });
      rss.push(serverRssMb());
      await sleep(1000);
    }
  })();

  await Promise.all(
    plan.map(async (p, i) => {
      await sleep(p.at);
      const r = await api("POST", "/requests", admin, { hospitalId: p.hospitalId, priority: p.priority, bloodType: p.bloodType, ward: "Stress test ST-03", unitsNeeded: 1 + (i % 3) });
      creates.push({ ...p, status: r.status, ms: r.ms, code: r.json?.id });
    }),
  );
  const floodSeconds = (performance.now() - t0) / 1000;
  // Keep watching while the alert dispatches for all 240 finish.
  let last = -1, stableFor = 0, notifCount = 0;
  while (stableFor < 6) {
    await sleep(1000);
    ({ rows: [{ notifCount }] } = await db.query(
      `SELECT count(*)::int AS "notifCount" FROM notifications n JOIN blood_requests r ON r.id = n.request_id WHERE r.ward = 'Stress test ST-03'`,
    ));
    stableFor = notifCount === last ? stableFor + 1 : 0;
    last = notifCount;
  }
  flooding = false;
  await watcherLoop;
  const drainSeconds = (performance.now() - t0) / 1000;

  // Final order, and the newest Emergency must be at the very top.
  const dash = await api("GET", "/dashboard/monitoring", admin);
  const feed = await api("GET", "/donor/requests", watcher.token);
  const { rows: [after] } = await db.query(
    `SELECT count(*)::int AS open, count(*) FILTER (WHERE priority = 'EMERGENCY')::int AS emergencies FROM blood_requests WHERE ward = 'Stress test ST-03' AND status = 'OPEN'`,
  );
  await db.query(`UPDATE blood_requests SET status = 'CANCELLED' WHERE ward = 'Stress test ST-03'`);
  await db.end();

  const ok = creates.filter((c) => c.status === 201);
  const lastCheck = checks[checks.length - 1];
  return {
    test: "TC-ST-03",
    requestsSent: TOTAL,
    windowSeconds: WINDOW_MS / 1000,
    floodSeconds,
    created: ok.length,
    failed: creates.length - ok.length,
    byPriority: Object.fromEntries(PRIORITIES.map((p) => [p, ok.filter((c) => c.priority === p).length])),
    createApiMs: stats(creates.map((c) => c.ms)),
    openRequestsBefore: before,
    openStressRequestsAfter: after.open,
    alertsLogged: notifCount,
    secondsUntilAllAlertsLogged: drainSeconds,
    dashboard: {
      reads: checks.length,
      orderedEveryTime: checks.every((c) => c.dashOrdered),
      emergencyOnTopEveryTime: checks.every((c) => c.dashTopEmergency),
      readMs: stats(checks.map((c) => c.dashMs)),
      rowsAtEnd: dash.json?.length,
      finalOrdered: isOrdered(dash.json),
      finalTop: dash.json?.[0]?.priority,
    },
    donorFeed: {
      reads: checks.length,
      orderedEveryTime: checks.every((c) => c.feedOrdered),
      emergencyOnTopEveryTime: checks.every((c) => c.feedTopEmergency),
      readMs: stats(checks.map((c) => c.feedMs)),
      rowsAtEnd: feed.json?.length,
      finalOrdered: isOrdered(feed.json),
      finalTop: feed.json?.[0]?.priority,
    },
    serverRssMb: { start: rss[0], peak: Math.max(...rss.filter(Boolean)), end: lastCheck ? rss[rss.length - 1] : null },
    timeline: checks.map((c, k) => ({ t: Math.round(c.t / 1000), dashMs: Math.round(c.dashMs), dashRows: c.dashRows, feedMs: Math.round(c.feedMs), feedRows: c.feedRows, rssMb: rss[k] && Math.round(rss[k]) })),
  };
}

const TESTS = { st01, st02, st03 };
const name = process.argv[2];
if (!TESTS[name]) {
  console.error(`Usage: node loadtest/stressScenarios.js ${Object.keys(TESTS).join("|")} [--json]`);
  process.exit(1);
}
assertLocal();
TESTS[name]()
  .then((out) => {
    console.log(process.argv.includes("--json") ? JSON.stringify(out, null, 1) : JSON.stringify(out, (k, v) => (k === "timeline" ? undefined : v), 1));
    process.exit(0);
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
