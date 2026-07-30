# ResQ Database Layer

PostgreSQL is the system of record. Redis is used only where it earns its
keep: things that are ephemeral, need to be fast, or need to fan out to
multiple connected dashboards in real time.

## Getting started

```bash
cd server
cp .env.example .env
docker compose up -d
```

This starts Postgres (port 5432) and Redis (port 6379) and loads
`db/schema.sql` automatically on first run, including seed data that mirrors
the current frontend mock data.

Then start the API:

```bash
npm install
npm run dev
```

Default dev login: username `admin`, password `1234`.
Change it via `PATCH /api/settings/password` before this ever touches a real
deployment.

To reset the database from scratch:

```bash
docker compose down -v   # -v also drops the data volumes
docker compose up -d
```

## Schema overview (`db/schema.sql`)

| Table | Backs |
|---|---|
| `admins` / `admin_sessions` | Settings page — account credentials, active session card, JWT invalidation on logout |
| `blood_inventory` (+ `blood_stock_status` view) | Dashboard Stock Criticality card |
| `blood_requests` | Dashboard Live Match Monitoring, Reports Recent Fulfillment Log, Reports KPIs |
| `donors` (+ `donor_eligibility` view) | Donor Management registered donor list, DOH 90-day cooling rule |
| `appointments` | Donor Management Appointment View |
| `donor_arrivals` | Dashboard Recent Arrivals |
| `system_health_snapshots` | Reports System Health card |

Derived values (donor eligibility, stock status, response time) are computed
via views/queries rather than stored, so there's no risk of them drifting out
of sync with the source data.

## API endpoints

All routes except `/health` and `POST /api/auth/login` require
`Authorization: Bearer <token>` from a successful login.

| Method & path | Purpose |
|---|---|
| `POST /api/auth/login` | Authenticate, returns JWT + admin info |
| `POST /api/auth/logout` | Revokes the current session in Redis |
| `GET /api/auth/me` | Current admin's profile |
| `GET /api/dashboard/stats` | Stat cards (Code Red count, units needed, active donors, fulfillment rate) |
| `GET /api/dashboard/monitoring` | Live Match Monitoring rows |
| `GET /api/dashboard/stock` | Stock Criticality by blood type |
| `GET /api/dashboard/arrivals` | Recent Arrivals |
| `GET /api/donors` | Paginated donor list (`page`, `pageSize`, `bloodType`, `q`) |
| `GET /api/donors/:id` | Single donor |
| `GET /api/appointments?date=YYYY-MM-DD` | Appointment View for a given day |
| `POST /api/appointments` | Schedule a new appointment |
| `PATCH /api/appointments/:id` | Update appointment status |
| `GET /api/reports/response-time` | 7-day Donor Response Time series |
| `GET /api/reports/fulfillment-log` | Recent Fulfillment Log |
| `GET /api/reports/system-health` | Latest System Health snapshot |
| `GET /api/reports/kpis` | Units Processed / Mean Response Time / Active Donors Reach, each with a 24h trend |
| `PATCH /api/settings/email` | Update admin email |
| `PATCH /api/settings/password` | Change password (requires current password, 16+ char new password) |
| `GET /api/settings/session` | Active Terminal Session card data |

## Where Redis fits in

Redis is not a second database — nothing here is the only copy of any data.
Everything in Redis can be rebuilt from Postgres if it's lost.

- **Session / JWT invalidation.** On login, store the session's JWT ID in
  Redis (`session:{jti}` → admin ID, TTL = token expiry). Logout deletes the
  key ("Terminating this session will immediately invalidate your JWT" on
  the Settings page becomes an actual `DEL`, not just a UI message). The auth
  middleware checks Redis before trusting a token.

- **Live Match Monitoring / broadcast fan-out.** When a blood request is
  created or updated, publish to a Redis Pub/Sub channel (or a Stream if you
  want replay/history). Every connected admin dashboard subscribes and
  updates instantly, instead of polling Postgres.

- **Dashboard stat caching.** The stat cards (Code Red count, units needed,
  fulfillment rate) aggregate across `blood_requests`. Cache the computed
  values in Redis with a short TTL (5–10s) so multiple admins loading the
  dashboard don't all hit Postgres with the same aggregate query.

- **Login rate limiting.** Track failed login attempts per username/IP in
  Redis with `INCR` + `EXPIRE`, to slow down brute-force attempts against the
  admin account.

- **Appointment day-view cache (optional).** The Appointment View's
  left/right day navigation re-queries appointments per day; cache each day's
  result briefly since it's read far more often than it changes.

If a feature can tolerate hitting Postgres directly and doesn't need to be
faster or shared in real time across sessions, it doesn't need Redis — don't
add caching until there's an actual latency problem to solve.
