# Load and stress tests

Automated performance tests for the ResQ API, written for [k6](https://k6.io).
`resq.js` simulates two kinds of users at once:

- **Donors** using the mobile app: profile, open-request feed (with a GPS
  position), appointments, notifications, hospitals, donation history.
- **Staff** using the web dashboard: stats, live monitoring, stock, arrivals,
  donor list, appointments, reports.

Every request is a read. The test never creates, changes or deletes data, and
never sends SMS, email or push notifications.

| Test | What it does | Peak users | Length |
|---|---|---|---|
| `smoke` | 1 donor + 1 staff; checks every endpoint answers | 2 | ~1 min |
| `load` | Expected busy-day traffic, held steady | 40 donors + 10 staff | ~6.5 min |
| `stress` | Keeps climbing to find the breaking point | 400 donors + 100 staff | ~10 min |
| `spike` | Sudden jump, like an emergency broadcast | 300 donors | ~3 min |

Pass/fail targets: 95% of requests under 1 s (1.5 s for the dashboard), under
1% failed requests. `stress` and `spike` only run against localhost, because
they're meant to overload the server.

## Setup (once)

```bash
brew install k6
cd server
docker compose up -d
```

Create a separate database for the test, so your normal local data isn't
touched, and fill it with 2,000 donors, open requests and appointments:

```bash
psql postgresql://resq:resq_dev_password@localhost:5432/resq -c "CREATE DATABASE resq_loadtest"
psql postgresql://resq:resq_dev_password@localhost:5432/resq_loadtest -f db/schema.sql
LOADTEST_DATABASE_URL=postgresql://resq:resq_dev_password@localhost:5432/resq_loadtest node loadtest/seed.js 2000
```

(`schema.sql` prints two errors from its sample-data inserts; the tables are
still created.) The seed script refuses to run against anything except a local
database whose name ends in `_loadtest`.

## Run against a local copy

Start the API on port 4100 against the test database, with SMS, email and push
switched off:

```bash
PORT=4100 \
DATABASE_URL=postgresql://resq:resq_dev_password@localhost:5432/resq_loadtest \
REDIS_URL=redis://:resq_dev_password@localhost:6379/1 \
SEMAPHORE_API_KEY= RESEND_API_KEY= FIREBASE_SERVICE_ACCOUNT_BASE64= DIDIT_API_KEY= \
NODE_ENV=production node src/index.js
```

Then, in another terminal:

```bash
k6 run -e TEST=smoke  loadtest/resq.js
k6 run -e TEST=load   loadtest/resq.js
k6 run -e TEST=stress loadtest/resq.js
k6 run -e TEST=spike  loadtest/resq.js
```

Add `--summary-export results.json` to save the numbers.

## Run against production (light load only)

Use a quiet time, and a test donor account and dashboard login, never a real
donor's. Only `smoke` and `load` are allowed, and `MAX_VUS` caps the users:

```bash
k6 run -e TEST=load -e MAX_VUS=20 \
  -e BASE_URL=https://hospital-web-dashboard.onrender.com \
  -e DONOR_EMAIL=<test donor email> -e DONOR_PASSWORD=<password> \
  -e ADMIN_USER=<dashboard username> -e ADMIN_PASSWORD=<password> \
  loadtest/resq.js
```

## Reading the results

- `http_req_duration` p(95): 95% of requests finished within this time.
- `http_req_failed`: the share of requests that errored or timed out.
- `donor_home_screen_ms` / `staff_dashboard_ms`: how long the app's home screen
  and the dashboard's main page took to load all their data.
- `http_reqs`: total requests, and requests per second (throughput).
- A ✓ or ✗ next to each threshold shows whether that target was met.

Local numbers depend on the Mac running both k6 and the server, so they show
how the code scales rather than how Render performs. The production run gives
the real figures.

## Stress scenarios (thesis Table 13)

`stressScenarios.js` runs TC-ST-01 to TC-ST-03 against the local copy through
the real API. Each prints its results as JSON:

```bash
export LOADTEST_DATABASE_URL=postgresql://resq:resq_dev_password@localhost:5432/resq_loadtest
node loadtest/stressScenarios.js st01   # 50 donations recorded at once for a 2-unit request
node loadtest/stressScenarios.js st03   # 240 requests of mixed urgency within 60 seconds
```

TC-ST-02 (a broadcast to 500+ donors) sends its SMS to a fake gateway, so no
real texts go out. Start the gateway and a second local server whose Semaphore
calls are redirected to it, then run the scenario against that server:

```bash
MOCK_SMS_MODE=limited node loadtest/mockSmsGateway.js &   # Semaphore's 120 calls/minute
PORT=4101 SEMAPHORE_API_KEY=mock DATABASE_URL=... REDIS_URL=... \
  node --import ./loadtest/redirectSms.js src/index.js &
BASE_URL=http://localhost:4101 node loadtest/stressScenarios.js st02
```

`MOCK_SMS_FAIL_FIRST=2` makes the gateway reject its first two calls, to check
that ResQ retries them.

## Other checks

- `minHeapBenchmark.js`: times the min-heap from 100 to 1,000,000 items.
- `responseTimeSim.js`: checks that ResQ records each request's response
  time, rating and credited request correctly (local copy only).
- `scheduledJobsAndCheckin.js`: 24-hour appointment reminders, Red Cross
  approval escalation (5 / 15 / 60 minutes) and QR check-in. Uses its own
  database so a running server's scheduled jobs can't interfere; setup steps
  are at the top of the file. Not named `*.test.js` on purpose, so `npm test`
  and CI don't pick it up:

  ```bash
  LOADTEST_DATABASE_URL=postgresql://resq:resq_dev_password@localhost:5432/resq_jobs_loadtest \
    node --test --experimental-test-module-mocks loadtest/scheduledJobsAndCheckin.js
  ```

  The reminder and escalation checks run the jobs in-process; the QR check-in
  checks need the local server from the file's header running on port 4102.
