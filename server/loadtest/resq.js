// k6 load/stress test for the ResQ API. Two kinds of simulated users run
// side by side, each doing what the real clients do:
//   - donors (mobile app): profile, open-request feed, hospitals,
//     appointments, notifications
//   - staff (web dashboard): stats, live monitoring, stock, donor list,
//     appointments, reports
// Every request is a read; nothing is created, changed or sent, so no SMS,
// email or push goes out. See loadtest/README.md for how to run each test.
//
//   k6 run -e TEST=load loadtest/resq.js
//
// Env vars:
//   BASE_URL        default http://localhost:4100
//   TEST            smoke | load | stress | spike   (default smoke)
//   DONOR_EMAIL / DONOR_PASSWORD   one donor account (production); without
//                   them, the seeded loadtest+<n>@resq.test donors are used
//   DONOR_ACCOUNTS  how many seeded donors to sign in (default 50)
//   ADMIN_USER / ADMIN_PASSWORD    dashboard login (default admin / 1234,
//                   the local seed account)
//   MAX_VUS         caps the peak users for load/smoke on production

import http from "k6/http";
import { check, group, sleep, fail } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://localhost:4100").replace(/\/+$/, "");
const API = `${BASE_URL}/api`;
const TEST = __ENV.TEST || "smoke";
const IS_LOCAL = /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE_URL);
const SEED_PASSWORD = "LoadTest-Password-2026";

// Stress and spike are meant to find the breaking point, which on the
// live server would take the app down for real donors and staff.
if (!IS_LOCAL && (TEST === "stress" || TEST === "spike")) {
  fail(`TEST=${TEST} only runs against localhost. Use TEST=smoke or TEST=load for ${BASE_URL}.`);
}

// Peak simultaneous users per test. Donors outnumber staff about 4 to 1.
const maxVus = Number(__ENV.MAX_VUS || 0);
const cap = (n) => (maxVus > 0 ? Math.min(n, maxVus) : n);

const PROFILES = {
  // 1 donor + 1 staff for about a minute: checks that every endpoint answers.
  smoke: {
    donors: [{ duration: "1s", target: 1 }, { duration: "1m", target: 1 }],
    staff: [{ duration: "1s", target: 1 }, { duration: "1m", target: 1 }],
  },
  // Expected busy-day traffic, held for 5 minutes.
  load: {
    donors: [
      { duration: "1m", target: cap(40) },
      { duration: "5m", target: cap(40) },
      { duration: "30s", target: 0 },
    ],
    staff: [
      { duration: "1m", target: cap(10) },
      { duration: "5m", target: cap(10) },
      { duration: "30s", target: 0 },
    ],
  },
  // Keeps climbing to find where response times and errors break down.
  stress: {
    donors: [
      { duration: "1m", target: 50 },
      { duration: "2m", target: 100 },
      { duration: "2m", target: 200 },
      { duration: "2m", target: 300 },
      { duration: "2m", target: 400 },
      { duration: "1m", target: 0 },
    ],
    staff: [
      { duration: "1m", target: 10 },
      { duration: "2m", target: 25 },
      { duration: "2m", target: 50 },
      { duration: "2m", target: 75 },
      { duration: "2m", target: 100 },
      { duration: "1m", target: 0 },
    ],
  },
  // A sudden emergency broadcast: everyone opens the app at once.
  spike: {
    donors: [
      { duration: "30s", target: 10 },
      { duration: "10s", target: 300 },
      { duration: "1m", target: 300 },
      { duration: "10s", target: 10 },
      { duration: "1m", target: 10 },
      { duration: "10s", target: 0 },
    ],
    staff: [{ duration: "3m", target: 5 }],
  },
};

if (!PROFILES[TEST]) fail(`Unknown TEST=${TEST}. Use smoke, load, stress or spike.`);

// Locally the seeded admin/1234 account is used; on another server the
// staff users only run when a dashboard login is given.
const RUN_STAFF = IS_LOCAL || Boolean(__ENV.ADMIN_USER);

export const options = {
  scenarios: {
    donors: { executor: "ramping-vus", exec: "donorSession", startVUs: 0, stages: PROFILES[TEST].donors, gracefulRampDown: "10s" },
    ...(RUN_STAFF && {
      staff: { executor: "ramping-vus", exec: "staffSession", startVUs: 0, stages: PROFILES[TEST].staff, gracefulRampDown: "10s" },
    }),
  },
  // Pass/fail targets: 95% of requests under 1 s, under 1% errors. For
  // stress and spike these mark where the server stops meeting them,
  // rather than a goal it must hit at 400 users.
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1000"],
    "http_req_duration{flow:donor}": ["p(95)<1000"],
    ...(RUN_STAFF && { "http_req_duration{flow:staff}": ["p(95)<1500"] }),
    checks: ["rate>0.99"],
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

const donorScreenTime = new Trend("donor_home_screen_ms", true);
const staffScreenTime = new Trend("staff_dashboard_ms", true);
const unexpected = new Rate("unexpected_status");

function login(path, body) {
  const res = http.post(`${API}${path}`, JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    tags: { name: `POST ${path}` },
  });
  if (res.status !== 200) fail(`Login ${path} failed (${res.status}): ${res.body}`);
  return res.json("token");
}

// Signs in once before the test starts, so the run measures the screens
// people use rather than a login storm (and doesn't open hundreds of
// sessions on the live server).
export function setup() {
  const health = http.get(`${BASE_URL}/health`);
  if (health.status !== 200) fail(`${BASE_URL}/health returned ${health.status}; is the server running?`);

  let donorTokens;
  if (__ENV.DONOR_EMAIL) {
    donorTokens = [login("/donor-auth/login", { identifier: __ENV.DONOR_EMAIL, password: __ENV.DONOR_PASSWORD })];
  } else {
    const n = Number(__ENV.DONOR_ACCOUNTS || 50);
    donorTokens = Array.from({ length: n }, (_, i) =>
      login("/donor-auth/login", { identifier: `loadtest+${i + 1}@resq.test`, password: SEED_PASSWORD }),
    );
  }
  const adminToken = RUN_STAFF
    ? login("/auth/login", { username: __ENV.ADMIN_USER || "admin", password: __ENV.ADMIN_PASSWORD || "1234" })
    : null;

  const hospitals = http.get(`${API}/donor/hospitals`, { headers: { Authorization: `Bearer ${donorTokens[0]}` } }).json();
  return { donorTokens, adminToken, hospitalIds: hospitals.map((h) => h.id) };
}

function get(url, token, flow, name) {
  const res = http.get(url, { headers: { Authorization: `Bearer ${token}` }, tags: { flow, name } });
  const ok = check(res, { [`${name} is 200`]: (r) => r.status === 200 });
  unexpected.add(!ok);
  return res;
}

// Roughly around Lucena, where the seeded hospitals are.
function nearLucena() {
  return { lat: (13.93 + (Math.random() - 0.5) * 0.2).toFixed(5), lng: (121.61 + (Math.random() - 0.5) * 0.2).toFixed(5) };
}

// What the donor app loads when it opens (home_view.dart), then a few
// screens the donor taps into, with think time between them.
export function donorSession(data) {
  const token = data.donorTokens[(__VU - 1) % data.donorTokens.length];
  const { lat, lng } = nearLucena();

  group("open app", () => {
    const start = Date.now();
    const batch = http.batch([
      ["GET", `${API}/donor/me`, null, { headers: { Authorization: `Bearer ${token}` }, tags: { flow: "donor", name: "GET /donor/me" } }],
      ["GET", `${API}/donor/requests?lat=${lat}&lng=${lng}&radiusKm=50`, null, { headers: { Authorization: `Bearer ${token}` }, tags: { flow: "donor", name: "GET /donor/requests" } }],
      ["GET", `${API}/donor/appointments`, null, { headers: { Authorization: `Bearer ${token}` }, tags: { flow: "donor", name: "GET /donor/appointments" } }],
      ["GET", `${API}/donor/notifications`, null, { headers: { Authorization: `Bearer ${token}` }, tags: { flow: "donor", name: "GET /donor/notifications" } }],
    ]);
    for (const res of batch) {
      const ok = check(res, { "home screen call is 200": (r) => r.status === 200 });
      unexpected.add(!ok);
    }
    donorScreenTime.add(Date.now() - start);
  });
  sleep(2 + Math.random() * 3);

  group("browse", () => {
    get(`${API}/donor/hospitals`, token, "donor", "GET /donor/hospitals");
    sleep(1 + Math.random() * 2);
    get(`${API}/donor/donations`, token, "donor", "GET /donor/donations");
    sleep(1 + Math.random() * 2);
    get(`${API}/donor/requests/nearby?lat=${lat}&lng=${lng}`, token, "donor", "GET /donor/requests/nearby");
  });
  sleep(3 + Math.random() * 5);
}

// What the web dashboard loads on its main page, then the donor list,
// appointments and reports pages.
export function staffSession(data) {
  const token = data.adminToken;
  const hospitalId = data.hospitalIds[(__VU - 1) % data.hospitalIds.length];
  const q = `hospitalId=${hospitalId}`;
  const today = new Date().toISOString().slice(0, 10);

  group("dashboard", () => {
    const start = Date.now();
    const batch = http.batch(
      [
        ["stats", `${API}/dashboard/stats?${q}`],
        ["monitoring", `${API}/dashboard/monitoring?${q}`],
        ["stock", `${API}/dashboard/stock?${q}`],
        ["arrivals", `${API}/dashboard/arrivals?${q}`],
      ].map(([n, url]) => ["GET", url, null, { headers: { Authorization: `Bearer ${token}` }, tags: { flow: "staff", name: `GET /dashboard/${n}` } }]),
    );
    for (const res of batch) {
      const ok = check(res, { "dashboard call is 200": (r) => r.status === 200 });
      unexpected.add(!ok);
    }
    staffScreenTime.add(Date.now() - start);
  });
  sleep(3 + Math.random() * 4);

  group("donor management", () => {
    get(`${API}/donors?page=1&pageSize=25`, token, "staff", "GET /donors");
    sleep(1 + Math.random() * 2);
    get(`${API}/appointments?date=${today}&${q}`, token, "staff", "GET /appointments");
  });
  sleep(2 + Math.random() * 3);

  group("reports", () => {
    get(`${API}/reports/kpis?${q}`, token, "staff", "GET /reports/kpis");
    get(`${API}/reports/response-time?${q}`, token, "staff", "GET /reports/response-time");
    get(`${API}/reports/fulfillment-log?${q}`, token, "staff", "GET /reports/fulfillment-log");
  });
  sleep(4 + Math.random() * 6);
}
