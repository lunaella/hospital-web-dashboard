// Fills a throwaway load-test database with realistic volume: donors with
// passwords and screening answers, open blood requests at every hospital,
// and upcoming appointments. Run against a local copy only, never the live
// database (see loadtest/README.md):
//
//   LOADTEST_DATABASE_URL=postgresql://resq:resq_dev_password@localhost:5432/resq_loadtest \
//     node loadtest/seed.js [donorCount]
//
// Every seeded donor signs in as loadtest+<n>@resq.test with LOADTEST_PASSWORD.

import pg from "pg";
import bcrypt from "bcryptjs";

export const LOADTEST_PASSWORD = "LoadTest-Password-2026";

const url = process.env.LOADTEST_DATABASE_URL;
const donorCount = Number(process.argv[2] ?? 2000);

// Refuses anything that isn't a local database named *_loadtest, so a
// mistyped URL can never write test donors into production.
function assertSafeTarget(raw) {
  if (!raw) throw new Error("Set LOADTEST_DATABASE_URL to the local load-test database.");
  const { hostname, pathname } = new URL(raw);
  if (!["localhost", "127.0.0.1"].includes(hostname) || !pathname.endsWith("_loadtest")) {
    throw new Error(`Refusing to seed ${hostname}${pathname}: only a local *_loadtest database is allowed.`);
  }
}

const BLOOD_TYPES = ["O+", "O+", "O+", "A+", "A+", "B+", "B+", "AB+", "O-", "A-", "B-", "AB-"];
const pick = (list, i) => list[i % list.length];

function daysAgo(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function screening(i, gender) {
  const firstTime = i % 3 === 0;
  return {
    isFirstTimeDonor: firstTime,
    lastDonationDate: firstTime ? null : daysAgo(30 + (i % 300)),
    totalDonations: firstTime ? 0 : 1 + (i % 6),
    feelsWellToday: true,
    hasEatenRecently: true,
    hasTattsOrPierce: false,
    tattooDate: null,
    hasAlcoholPast24hr: false,
    hasActiveInfectOrMeds: false,
    recentMedProcedures: [],
    medProcedureDetails: {},
    hasMajorMedicalHistory: false,
    majorMedicalHistoryDesc: null,
    hasTransfusionOrSurgery: false,
    transfusionOrSurgeryDate: null,
    hasTravelOrNeedleStick: i % 25 === 0,
    travelOrNeedleDate: i % 25 === 0 ? daysAgo(40) : null,
    travelOrNeedleDesc: i % 25 === 0 ? "Trip to Palawan" : null,
    isPregOrNursing: gender === "male" ? null : false,
    lastMensPeriodDate: gender === "male" ? null : daysAgo(20),
    hasHighRiskExpo: gender === "male" ? false : null,
  };
}

async function main() {
  assertSafeTarget(url);
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  // Clears only what an earlier seed run created.
  await client.query(`DELETE FROM appointments WHERE donor_id IN (SELECT id FROM donors WHERE email LIKE 'loadtest+%@resq.test')`);
  await client.query(`DELETE FROM donors WHERE email LIKE 'loadtest+%@resq.test'`);
  await client.query(`DELETE FROM blood_requests WHERE request_code LIKE 'LT-%'`);

  // One hash for every donor: bcrypt is deliberately slow, and hashing
  // 2,000 passwords would take minutes for no benefit.
  const passwordHash = await bcrypt.hash(LOADTEST_PASSWORD, 10);
  const { rows: hospitals } = await client.query(`SELECT id FROM hospitals ORDER BY name`);
  if (hospitals.length === 0) throw new Error("No hospitals in the load-test database — load db/schema.sql first.");

  const batchSize = 500;
  for (let start = 1; start <= donorCount; start += batchSize) {
    const values = [];
    const params = [];
    for (let i = start; i < Math.min(start + batchSize, donorCount + 1); i++) {
      const gender = i % 2 === 0 ? "male" : "female";
      const s = screening(i, gender);
      const base = params.length;
      params.push(
        `LT-${String(i).padStart(5, "0")}`,
        `Load Test Donor ${i}`,
        `+6390${String(i).padStart(8, "0")}`,
        pick(BLOOD_TYPES, i),
        `loadtest+${i}@resq.test`,
        passwordHash,
        18 + (i % 45),
        gender === "male" ? 68 : 55,
        gender,
        JSON.stringify(s),
        s.lastDonationDate,
      );
      values.push(`(${Array.from({ length: 11 }, (_, k) => `$${base + k + 1}`).join(", ")})`);
    }
    await client.query(
      `INSERT INTO donors (donor_code, name, phone, blood_type, email, password_hash, age, weight_kg, gender, health_screening, last_donation_at)
       VALUES ${values.join(", ")}`,
      params,
    );
  }

  // Open requests at each hospital, so the donor feed and the dashboard's
  // monitoring panel have real rows to return.
  let code = 1;
  for (const { id } of hospitals) {
    for (const [bloodType, priority] of [["O+", "EMERGENCY"], ["A+", "URGENT"], ["B+", "NORMAL"], ["O-", "URGENT"], ["AB+", "NORMAL"]]) {
      await client.query(
        `INSERT INTO blood_requests (hospital_id, request_code, blood_type, priority, ward, units_needed, status)
         VALUES ($1, $2, $3, $4, 'Load test ward', 4, 'OPEN')`,
        [id, `LT-${String(code++).padStart(4, "0")}`, bloodType, priority],
      );
    }
  }

  // Upcoming appointments for a slice of donors, spread over the next week.
  await client.query(
    `INSERT INTO appointments (donor_id, hospital_id, scheduled_at, status)
     SELECT d.id, h.id, date_trunc('hour', now()) + ((row_number() OVER ()) % 7 + 1) * interval '1 day', 'pending'
     FROM (SELECT id FROM donors WHERE email LIKE 'loadtest+%@resq.test' ORDER BY donor_code LIMIT 300) d
     CROSS JOIN LATERAL (SELECT id FROM hospitals ORDER BY random() LIMIT 1) h`,
  );

  const { rows } = await client.query(
    `SELECT (SELECT count(*) FROM donors) AS donors, (SELECT count(*) FROM blood_requests) AS requests, (SELECT count(*) FROM appointments) AS appointments`,
  );
  console.log(`Seeded: ${rows[0].donors} donors, ${rows[0].requests} requests, ${rows[0].appointments} appointments.`);
  await client.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
