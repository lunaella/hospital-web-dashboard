// Checks the three features the stress and load runs don't touch, against
// a separate local test database (never production):
//
//   - 24-hour appointment reminders (jobs/appointmentReminders.js)
//   - Red Cross approval escalation at 5 / 15 / 60 minutes
//     (services/approvalAlerts.service.js, run every minute by
//     jobs/approvalEscalation.js)
//   - QR check-in (POST /api/appointments/checkin)
//
// The jobs run in this process with time moved by setting timestamps back,
// so a 60-minute escalation is checked in seconds. Texts go to the fake
// gateway (loadtest/mockSmsGateway.js) and pushes are recorded, not sent.
// Check-in goes through a local API server on the same database.
//
//   createdb resq_jobs_loadtest; psql resq_jobs_loadtest < db/schema.sql
//   LOADTEST_DATABASE_URL=postgresql://resq:resq_dev_password@localhost:5432/resq_jobs_loadtest node loadtest/seed.js 120
//   node loadtest/mockSmsGateway.js &
//   PORT=4102 DATABASE_URL=<same> REDIS_URL=redis://:resq_dev_password@localhost:6379/2 \
//     SEMAPHORE_API_KEY=mock node --import ./loadtest/redirectSms.js src/index.js &
//   LOADTEST_DATABASE_URL=<same> RESULTS_OUT=jobs.json \
//     node --test --experimental-test-module-mocks loadtest/scheduledJobsAndCheckin.js

import { test, mock, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import WebSocket from "ws";
import "./redirectSms.js";

const DB_URL = process.env.LOADTEST_DATABASE_URL;
const BASE = (process.env.BASE_URL || "http://localhost:4102").replace(/\/+$/, "");
const MOCK_SMS = process.env.MOCK_SMS_URL || "http://localhost:4200";
const PASSWORD = "LoadTest-Password-2026";
{
  const { hostname, pathname } = new URL(DB_URL ?? "postgresql://x@none/none");
  if (!["localhost", "127.0.0.1"].includes(hostname) || !pathname.endsWith("_loadtest")) {
    throw new Error("Set LOADTEST_DATABASE_URL to a local *_loadtest database.");
  }
  if (!/\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE)) throw new Error("BASE_URL must be local.");
}

// The server modules read these when first imported.
process.env.DATABASE_URL = DB_URL;
process.env.REDIS_URL ||= "redis://:resq_dev_password@localhost:6379/2";
process.env.SEMAPHORE_API_KEY = "mock-key-for-local-test";
process.env.RESEND_API_KEY = "";
process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 = "";

// Pushes are recorded. A donor id in pushFailures gets that error back.
const pushCalls = [];
const pushFailures = new Map();
mock.module("../src/utils/push.js", {
  namedExports: {
    sendPushToDonor: async (donorId, message) => {
      pushCalls.push({ donorId: String(donorId), ...message, at: Date.now() });
      const error = pushFailures.get(String(donorId));
      return error ? { ok: false, error, successCount: 0, invalidTokens: [] } : { ok: true, error: null, successCount: 1, invalidTokens: [] };
    },
    sendPush: async () => ({ ok: true, error: null, successCount: 1, invalidTokens: [] }),
  },
});

const { pool } = await import("../src/db/pool.js");
const { sendDueAppointmentReminders } = await import("../src/jobs/appointmentReminders.js");
const { sendDueApprovalAlerts, ESCALATE_AFTER_MIN, MAX_ESCALATIONS } = await import("../src/services/approvalAlerts.service.js");
const { env } = await import("../src/config/env.js");

// Every check is also written to RESULTS_OUT for the results workbook.
const results = [];
function check(group, name, expected, actual, pass) {
  results.push({ group, name, expected, actual: String(actual), pass: Boolean(pass) });
  assert.ok(pass, `${group} / ${name}: expected ${expected}, got ${actual}`);
}
after(async () => {
  if (process.env.RESULTS_OUT) fs.writeFileSync(process.env.RESULTS_OUT, JSON.stringify(results, null, 1));
  await pool.end();
});

const q = (sql, params) => pool.query(sql, params).then((r) => r.rows);
const { rows: hospitals } = await pool.query(`SELECT id, name FROM hospitals ORDER BY name`);

async function freeDonor() {
  const rows = await q(
    `SELECT id, donor_code AS "donorCode", email FROM donors
     WHERE email LIKE 'loadtest+%@resq.test' AND id NOT IN (SELECT donor_id FROM appointments)
     ORDER BY donor_code LIMIT 1`,
  );
  if (!rows[0]) throw new Error("Out of seeded donors without appointments.");
  return rows[0];
}

async function appointment(hoursFromNow, status = "pending", hospital = hospitals[0]) {
  const donor = await freeDonor();
  const [row] = await q(
    `INSERT INTO appointments (donor_id, hospital_id, scheduled_at, status)
     VALUES ($1, $2, now() + ($3 || ' hours')::interval, $4) RETURNING id`,
    [donor.id, hospital.id, String(hoursFromNow), status],
  );
  return { id: row.id, donor, hospital };
}

const remindersFor = (donorId) => pushCalls.filter((c) => c.donorId === String(donorId) && c.data?.type === "appointment_reminder");

// ------------------------------------------------- 24-hour reminders

test("24-hour appointment reminders", async () => {
  const G = "24-hour reminder";
  // Only this test's appointments may be due.
  await pool.query(`UPDATE appointments SET reminder_sent_at = now() WHERE reminder_sent_at IS NULL`);

  const in23h = await appointment(23);
  const in2hConfirmed = await appointment(2, "confirmed");
  const in25h = await appointment(25);
  const past = await appointment(-1);
  const cancelled = await appointment(23, "cancelled");
  const completed = await appointment(23, "completed");
  const firebaseDown = await appointment(20);
  const noDevice = await appointment(21);
  pushFailures.set(String(firebaseDown.donor.id), "Firebase is not configured.");
  pushFailures.set(String(noDevice.donor.id), "No devices registered for this donor.");

  await sendDueAppointmentReminders();

  const r23 = remindersFor(in23h.donor.id);
  check(G, "Pending appointment 23 h away is reminded", "1 reminder", `${r23.length} reminder(s)`, r23.length === 1);
  const body = r23[0]?.body ?? "";
  check(G, "Reminder names the hospital and the Philippine time", `contains "${in23h.hospital.name}"`, body, body.includes(in23h.hospital.name) && /\d{1,2}:\d{2}/.test(body));
  check(G, "Confirmed appointment 2 h away is reminded", "1 reminder", `${remindersFor(in2hConfirmed.donor.id).length} reminder(s)`, remindersFor(in2hConfirmed.donor.id).length === 1);
  check(G, "Appointment 25 h away is not reminded yet", "0", remindersFor(in25h.donor.id).length, remindersFor(in25h.donor.id).length === 0);
  check(G, "Appointment already past is not reminded", "0", remindersFor(past.donor.id).length, remindersFor(past.donor.id).length === 0);
  check(G, "Cancelled appointment is not reminded", "0", remindersFor(cancelled.donor.id).length, remindersFor(cancelled.donor.id).length === 0);
  check(G, "Completed appointment is not reminded", "0", remindersFor(completed.donor.id).length, remindersFor(completed.donor.id).length === 0);

  // Second run: nobody is reminded twice.
  await sendDueAppointmentReminders();
  check(G, "Running the job again does not remind twice", "still 1", `${remindersFor(in23h.donor.id).length}`, remindersFor(in23h.donor.id).length === 1);

  // The 25 h appointment enters the window (clock moved forward 2 h).
  await pool.query(`UPDATE appointments SET scheduled_at = scheduled_at - interval '2 hours' WHERE id = $1`, [in25h.id]);
  await sendDueAppointmentReminders();
  check(G, "Appointment is reminded once it is within 24 h", "1 reminder", `${remindersFor(in25h.donor.id).length} reminder(s)`, remindersFor(in25h.donor.id).length === 1);

  // Push service down: not marked, so it goes out once the service is back.
  const [fd] = await q(`SELECT reminder_sent_at FROM appointments WHERE id = $1`, [firebaseDown.id]);
  check(G, "Push service not configured: reminder kept for the next run", "not marked sent", fd.reminder_sent_at ? "marked sent" : "not marked sent", fd.reminder_sent_at === null);
  const triesWhileDown = remindersFor(firebaseDown.donor.id).length;
  pushFailures.delete(String(firebaseDown.donor.id));
  await sendDueAppointmentReminders();
  await sendDueAppointmentReminders();
  const [fdAfter] = await q(`SELECT reminder_sent_at FROM appointments WHERE id = $1`, [firebaseDown.id]);
  const triesAfter = remindersFor(firebaseDown.donor.id).length - triesWhileDown;
  check(G, "...retried on every run, then sent once push works, and not again", "retried while down; 1 more attempt after; marked sent",
    `${triesWhileDown} tries while down, ${triesAfter} after, ${fdAfter.reminder_sent_at ? "marked sent" : "not marked"}`,
    triesWhileDown >= 2 && triesAfter === 1 && fdAfter.reminder_sent_at !== null);

  // Donor-specific failure (no phone registered): not retried every 15 min.
  await sendDueAppointmentReminders();
  const nd = remindersFor(noDevice.donor.id);
  check(G, "Donor with no device registered: tried once, not every 15 min", "1 attempt", `${nd.length} attempt(s)`, nd.length === 1);
});

// --------------------------------------------- approval escalation

async function setting(key, value) {
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value],
  );
}

async function pendingRequest(priority, bloodType = "O+") {
  const code = `ESC-${priority[0]}${Math.floor(1000 + Math.random() * 9000)}`;
  const [row] = await q(
    `INSERT INTO blood_requests (hospital_id, request_code, blood_type, priority, ward, units_needed, status, submitted_at)
     VALUES ($1, $2, $3, $4, 'Escalation test', 1, 'PENDING_APPROVAL', now()) RETURNING id`,
    [hospitals[1].id, code, bloodType, priority],
  );
  return { id: row.id, code, priority };
}

const alertRows = (id) => q(`SELECT attempt, channel, recipient, status, error_message FROM approval_alerts WHERE request_id = $1 ORDER BY id`, [id]);
const attempts = async (id) => new Set((await alertRows(id)).map((r) => r.attempt)).size;
// Moves "the last alert" back by `minutes`, as if that much time passed.
const age = (id, minutes) =>
  pool.query(
    `UPDATE blood_requests SET last_approval_alert_at = last_approval_alert_at - ($2 || ' minutes')::interval,
            submitted_at = submitted_at - ($2 || ' minutes')::interval WHERE id = $1`,
    [id, String(minutes)],
  );
const smsTo = async (code) => (await (await fetch(`${MOCK_SMS}/__messages`)).json()).filter((m) => m.message.includes(code));

test("Red Cross approval escalation (5 / 15 / 60 minutes)", async () => {
  const G = "Approval escalation";
  const ALERT = "09170000001";
  const BACKUP = "09170000002";
  await setting("red_cross_alert_numbers", ALERT);
  await setting("red_cross_backup_numbers", BACKUP);
  await fetch(`${MOCK_SMS}/__reset`, { method: "POST" });
  // Nothing else pending, so only this test's requests are alerted.
  await pool.query(`UPDATE blood_requests SET status = 'WITHDRAWN' WHERE status = 'PENDING_APPROVAL'`);

  // Emergency: first alert at once, then every 5 minutes, at most 3 reminders.
  const e = await pendingRequest("EMERGENCY");
  await sendDueApprovalAlerts();
  let sms = await smsTo(e.code);
  check(G, "Emergency: first alert is sent as soon as it is submitted", "1 text to the alert number", `${sms.length} text(s) to ${[...new Set(sms.map((m) => m.number))].join(", ")}`,
    sms.length === 1 && sms[0].number === "639170000001" && sms[0].message.includes("awaiting your approval"));
  await sendDueApprovalAlerts();
  check(G, "Emergency: no repeat right away", "still 1 alert", `${await attempts(e.id)} alert(s)`, (await attempts(e.id)) === 1);
  await age(e.id, ESCALATE_AFTER_MIN.EMERGENCY - 1);
  await sendDueApprovalAlerts();
  check(G, "Emergency: no reminder at 4 minutes", "still 1 alert", `${await attempts(e.id)} alert(s)`, (await attempts(e.id)) === 1);
  await age(e.id, 1);
  await sendDueApprovalAlerts();
  sms = await smsTo(e.code);
  const reminder1 = sms.filter((m) => m.message.includes("REMINDER 1/3"));
  check(G, "Emergency: reminder 1 at 5 minutes, now also to the backup number", "texts to alert and backup numbers",
    reminder1.map((m) => m.number).sort().join(", "), reminder1.length === 2 && reminder1.some((m) => m.number === "639170000002"));
  for (let i = 2; i <= MAX_ESCALATIONS; i++) {
    await age(e.id, ESCALATE_AFTER_MIN.EMERGENCY);
    await sendDueApprovalAlerts();
  }
  check(G, `Emergency: stops after ${MAX_ESCALATIONS} reminders`, `${MAX_ESCALATIONS + 1} alerts`, `${await attempts(e.id)} alerts`, (await attempts(e.id)) === MAX_ESCALATIONS + 1);
  await age(e.id, ESCALATE_AFTER_MIN.EMERGENCY);
  await sendDueApprovalAlerts();
  check(G, "Emergency: nothing more after the last reminder", `${MAX_ESCALATIONS + 1} alerts`, `${await attempts(e.id)} alerts`, (await attempts(e.id)) === MAX_ESCALATIONS + 1);

  // Urgent at 15, Normal at 60.
  for (const [priority, minutes] of [["URGENT", ESCALATE_AFTER_MIN.URGENT], ["NORMAL", ESCALATE_AFTER_MIN.NORMAL]]) {
    const r = await pendingRequest(priority);
    await sendDueApprovalAlerts();
    await age(r.id, minutes - 1);
    await sendDueApprovalAlerts();
    const before = await attempts(r.id);
    await age(r.id, 1);
    await sendDueApprovalAlerts();
    const afterDue = await attempts(r.id);
    check(G, `${priority[0] + priority.slice(1).toLowerCase()}: no reminder at ${minutes - 1} min, reminder at ${minutes} min`, "1 then 2 alerts", `${before} then ${afterDue}`, before === 1 && afterDue === 2);
  }

  // Approving, rejecting or withdrawing stops the reminders.
  for (const status of ["OPEN", "REJECTED", "WITHDRAWN"]) {
    const r = await pendingRequest("EMERGENCY");
    await sendDueApprovalAlerts();
    await pool.query(`UPDATE blood_requests SET status = $2 WHERE id = $1`, [r.id, status]);
    await age(r.id, ESCALATE_AFTER_MIN.EMERGENCY);
    await sendDueApprovalAlerts();
    const label = { OPEN: "Approved", REJECTED: "Rejected", WITHDRAWN: "Withdrawn by the hospital" }[status];
    check(G, `${label}: no more reminders`, "1 alert", `${await attempts(r.id)} alert(s)`, (await attempts(r.id)) === 1);
  }

  // The job tick and a new submission running at the same moment.
  const c = await pendingRequest("EMERGENCY");
  await Promise.all([sendDueApprovalAlerts(), sendDueApprovalAlerts(), sendDueApprovalAlerts()]);
  const cRows = (await alertRows(c.id)).filter((r) => r.channel === "sms");
  check(G, "Three runs at the same moment send the first alert once", "1 text", `${cRows.length} text(s)`, cRows.length === 1);

  // Every attempt is logged, including the email to the super admin.
  const eRows = await alertRows(e.id);
  check(G, "Every attempt is logged (SMS and email, sent or failed)", "SMS and email rows for each alert",
    `${eRows.filter((r) => r.channel === "sms").length} SMS, ${eRows.filter((r) => r.channel === "email").length} email`,
    eRows.some((r) => r.channel === "email") && eRows.filter((r) => r.channel === "sms").length === 1 + 2 * MAX_ESCALATIONS);
});

// ------------------------------------------------------- QR check-in

async function api(method, path, token, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function staffAccount(username, hospitalId) {
  const hash = await bcrypt.hash("Staff-Test-2026", 10);
  const [admin] = await q(
    `INSERT INTO admins (username, email, password_hash, clearance) VALUES ($1, $2, $3, 'ADMIN')
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [username, `${username}@resq.test`, hash],
  );
  await pool.query(`DELETE FROM admin_permissions WHERE admin_id = $1`, [admin.id]);
  await pool.query(`DELETE FROM admin_hospital_assignments WHERE admin_id = $1`, [admin.id]);
  await pool.query(`INSERT INTO admin_permissions (admin_id, section, level) VALUES ($1, 'donor_management', 'edit')`, [admin.id]);
  await pool.query(`INSERT INTO admin_hospital_assignments (admin_id, hospital_id) VALUES ($1, $2)`, [admin.id, hospitalId]);
  return (await api("POST", "/auth/login", null, { username, password: "Staff-Test-2026" })).json.token;
}

test("QR check-in", async () => {
  const G = "QR check-in";
  const admin = (await api("POST", "/auth/login", null, { username: "admin", password: "1234" })).json.token;
  const ws = new WebSocket(BASE.replace(/^http/, "ws") + `/ws?token=${encodeURIComponent(admin)}`);
  const events = [];
  ws.on("message", (m) => events.push({ at: performance.now(), event: JSON.parse(m.toString()) }));
  await new Promise((resolve) => ws.on("open", resolve));

  const appt = await appointment(3, "pending", hospitals[0]);
  const donorToken = (await api("POST", "/donor-auth/login", null, { identifier: appt.donor.email, password: PASSWORD })).json.token;
  const pass = await api("GET", `/donor/appointments/${appt.id}/qr`, donorToken);
  check(G, "Donor's app gets a check-in pass for a pending appointment", "200 with a 10-minute pass", `${pass.status}, expires in ${pass.json?.expiresIn}s`, pass.status === 200 && pass.json.expiresIn === 600);

  const sent = performance.now();
  const scan = await api("POST", "/appointments/checkin", admin, { token: pass.json.token });
  await new Promise((r) => setTimeout(r, 300));
  const event = events.find((e) => e.event.type === "appointment_updated" && e.event.appointment?.id === appt.id);
  check(G, "Scanning the pass checks the donor in", "200, confirmed, right donor", `${scan.status}, ${scan.json?.status}, ${scan.json?.donorCode}`,
    scan.status === 200 && scan.json.status === "confirmed" && scan.json.donorCode === appt.donor.donorCode);
  check(G, "Open dashboards are told about the check-in", "live event within 1 s", event ? `${Math.round(event.at - sent)} ms` : "no event", Boolean(event) && event.at - sent < 1000);
  const [row] = await q(`SELECT status FROM appointments WHERE id = $1`, [appt.id]);
  check(G, "Appointment is confirmed in the database", "confirmed", row.status, row.status === "confirmed");

  const again = await api("POST", "/appointments/checkin", admin, { token: pass.json.token });
  check(G, "Scanning the same pass twice does no harm", "200, still confirmed", `${again.status}, ${again.json?.status}`, again.status === 200 && again.json.status === "confirmed");

  const tampered = pass.json.token.slice(0, -4) + (pass.json.token.endsWith("AAAA") ? "BBBB" : "AAAA");
  const bad = await api("POST", "/appointments/checkin", admin, { token: tampered });
  check(G, "A tampered pass is rejected", "400", `${bad.status}: ${bad.json?.error}`, bad.status === 400);

  const wrongRole = await api("POST", "/appointments/checkin", admin, { token: donorToken });
  check(G, "A login token is not accepted as a pass", "400", `${wrongRole.status}: ${wrongRole.json?.error}`, wrongRole.status === 400);

  const expired = jwt.sign({ appointmentId: appt.id, donorId: appt.donor.id, role: "appointment_checkin" }, env.jwtSecret, { expiresIn: -1 });
  const late = await api("POST", "/appointments/checkin", admin, { token: expired });
  check(G, "An expired pass (older than 10 minutes) is rejected", "400", `${late.status}: ${late.json?.error}`, late.status === 400 && /expired/i.test(late.json?.error ?? ""));

  // Hospital staff can only check in donors at their own hospital.
  const other = await appointment(3, "pending", hospitals[0]);
  const otherDonor = (await api("POST", "/donor-auth/login", null, { identifier: other.donor.email, password: PASSWORD })).json.token;
  const otherPass = (await api("GET", `/donor/appointments/${other.id}/qr`, otherDonor)).json.token;
  const outsider = await staffAccount("qr_other_hospital", hospitals[1].id);
  const denied = await api("POST", "/appointments/checkin", outsider, { token: otherPass });
  check(G, "Staff of another hospital cannot check this donor in", "403", `${denied.status}: ${denied.json?.error}`, denied.status === 403);
  const insider = await staffAccount("qr_same_hospital", hospitals[0].id);
  const allowed = await api("POST", "/appointments/checkin", insider, { token: otherPass });
  check(G, "Staff of the donor's hospital can", "200", `${allowed.status}`, allowed.status === 200);

  // Cancelled: no pass, and an earlier pass stops working.
  const cancelledAppt = await appointment(3, "pending", hospitals[0]);
  const cDonor = (await api("POST", "/donor-auth/login", null, { identifier: cancelledAppt.donor.email, password: PASSWORD })).json.token;
  const cPass = (await api("GET", `/donor/appointments/${cancelledAppt.id}/qr`, cDonor)).json.token;
  await api("PATCH", `/donor/appointments/${cancelledAppt.id}/cancel`, cDonor);
  const noPass = await api("GET", `/donor/appointments/${cancelledAppt.id}/qr`, cDonor);
  const usedAfterCancel = await api("POST", "/appointments/checkin", admin, { token: cPass });
  check(G, "Cancelled appointment: no new pass, and an earlier pass is refused", "400 and 400", `${noPass.status} and ${usedAfterCancel.status}: ${usedAfterCancel.json?.error}`,
    noPass.status === 400 && usedAfterCancel.status === 400);

  // After check-in, recording the donation completes it; the pass is then spent.
  const done = await api("POST", `/appointments/${appt.id}/complete`, admin, {});
  const [arrival] = await q(`SELECT count(*)::int AS n FROM donor_arrivals WHERE donor_id = $1`, [appt.donor.id]);
  check(G, "Recording the donation after check-in completes it", "200, completed, 1 arrival", `${done.status}, ${done.json?.status}, ${arrival.n} arrival`, done.status === 200 && done.json.status === "completed" && arrival.n === 1);
  const spent = await api("POST", "/appointments/checkin", admin, { token: pass.json.token });
  check(G, "The pass cannot be used again after the donation", "400", `${spent.status}: ${spent.json?.error}`, spent.status === 400);

  ws.close();
  const temp = `(SELECT id FROM admins WHERE username IN ('qr_other_hospital', 'qr_same_hospital'))`;
  for (const table of ["admin_permissions", "admin_hospital_assignments", "admin_sessions"]) {
    await pool.query(`DELETE FROM ${table} WHERE admin_id IN ${temp}`);
  }
  await pool.query(`DELETE FROM admins WHERE username IN ('qr_other_hospital', 'qr_same_hospital')`);
});
