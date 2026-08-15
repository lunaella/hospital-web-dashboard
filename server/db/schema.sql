-- ResQ Hospital Blood Donation System — PostgreSQL Schema
-- Models the entities backing the admin dashboard: hospitals, donors, blood
-- inventory, requests/broadcasts, appointments, fulfillment history, admin
-- accounts, sessions, and system health metrics.

-- Note: gen_random_uuid() is built into PostgreSQL core since v13, so no
-- extension (e.g. uuid-ossp/pgcrypto) needs to be enabled.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE blood_type AS ENUM ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-');

CREATE TYPE request_priority AS ENUM ('EMERGENCY', 'URGENT', 'NORMAL');

CREATE TYPE request_status AS ENUM ('OPEN', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED');

CREATE TYPE stock_status AS ENUM ('CRITICAL', 'LOW', 'STABLE');

CREATE TYPE appointment_status AS ENUM ('confirmed', 'pending', 'cancelled', 'completed', 'no_show');

CREATE TYPE fulfillment_rating AS ENUM ('Optimal', 'Good', 'Acceptable', 'Poor');

CREATE TYPE clearance_level AS ENUM ('FULL_ROOT_ACCESS_LEVEL_5', 'ADMIN', 'VIEWER');

-- Team Access (Settings page): FULL_ROOT_ACCESS_LEVEL_5 is the super admin —
-- always has edit access to every section and can manage the team, no row
-- in admin_permissions needed. Every other admin's actual access is defined
-- entirely by their admin_permissions rows below, one per section, each
-- independently set to none/view/edit by whoever manages the team.
CREATE TYPE permission_section AS ENUM ('dashboard', 'donor_management', 'reports', 'broadcasts', 'settings');
CREATE TYPE permission_level AS ENUM ('none', 'view', 'edit');

CREATE TYPE notification_channel AS ENUM ('sms', 'email');

CREATE TYPE notification_status AS ENUM ('sent', 'failed');

-- ---------------------------------------------------------------------------
-- Hospitals — this web app is a super-admin surface overseeing multiple
-- hospitals; the donor-facing mobile app recommends the nearest hospital to
-- a donor via geolocation per appointment, so donors themselves stay
-- hospital-agnostic (a shared pool below) while everything that actually
-- happens at a hospital (inventory, requests/broadcasts, appointments,
-- arrivals) is scoped to one. latitude/longitude are here so the app's
-- nearest-hospital matching has something to query against.
-- ---------------------------------------------------------------------------

CREATE TABLE hospitals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  VARCHAR(20) UNIQUE NOT NULL, -- e.g. "SLMC-QC"
  name                  VARCHAR(150) NOT NULL,
  city                  VARCHAR(100),
  address               TEXT,
  latitude              NUMERIC(9,6),
  longitude             NUMERIC(9,6),
  -- How many donors can be booked into the exact same scheduled_at at this
  -- hospital (multiple donation stations/chairs run in parallel, so this is
  -- deliberately not 1). Enforced in createAppointment; see
  -- server/src/controllers/donors.controller.js.
  appointment_capacity  INT NOT NULL DEFAULT 5,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Admin accounts & sessions (System Settings page)
-- ---------------------------------------------------------------------------

CREATE TABLE admins (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username          VARCHAR(50) UNIQUE NOT NULL,
  email             VARCHAR(255) UNIQUE NOT NULL,
  password_hash     TEXT NOT NULL,
  clearance         clearance_level NOT NULL DEFAULT 'ADMIN',
  -- Lets the super admin delegate "add/edit/remove team members and their
  -- section permissions" to a trusted account without making them a second
  -- super admin (i.e. without giving them edit access to every section too).
  can_manage_team   BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per (admin, section) an admin has been explicitly granted access
-- to; a missing row means 'none'. Super admins (clearance =
-- FULL_ROOT_ACCESS_LEVEL_5) skip this table entirely — they always have
-- edit access everywhere regardless of what's stored here.
CREATE TABLE admin_permissions (
  admin_id          UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  section           permission_section NOT NULL,
  level             permission_level NOT NULL DEFAULT 'none',
  PRIMARY KEY (admin_id, section)
);

-- Which hospitals an admin can see/act on at all (independent of what
-- sections they can access within those hospitals). No rows for an admin
-- means unrestricted — they can pick any hospital from the switcher, which
-- is also what every admin created before this table existed keeps doing
-- with no migration needed for their data. One row per hospital an admin
-- has been scoped to; an admin can have more than one (e.g. a regional
-- supervisor over a few branches), not just the "one admin per hospital"
-- common case. Super admins and delegated team managers always bypass this
-- entirely and see every hospital, regardless of any rows here.
CREATE TABLE admin_hospital_assignments (
  admin_id          UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  hospital_id       UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  PRIMARY KEY (admin_id, hospital_id)
);

-- One row per active/past login session. Mirrors the "Active Terminal
-- Session" card (engine, system, network IP, region) and backs JWT
-- invalidation on logout.
CREATE TABLE admin_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id          UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  session_code      VARCHAR(50) NOT NULL, -- e.g. "VTX-992-KLA"
  engine            TEXT,                 -- raw User-Agent string; unbounded since real UAs run 100-300+ chars
  system            VARCHAR(100),         -- e.g. "Windows 11"
  ip_address        INET,
  region            VARCHAR(100),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at        TIMESTAMPTZ
);

CREATE INDEX idx_admin_sessions_admin_id ON admin_sessions(admin_id);
CREATE INDEX idx_admin_sessions_active ON admin_sessions(is_active) WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- Blood inventory & requests (Dashboard / Stock Criticality) — created before
-- donors/appointments since donor_arrivals references blood_requests.
-- ---------------------------------------------------------------------------

-- One row per (hospital, blood type); units_available drives the Stock
-- Criticality card for whichever hospital is currently selected.
CREATE TABLE blood_inventory (
  hospital_id       UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  blood_type        blood_type NOT NULL,
  units_available   INT NOT NULL DEFAULT 0,
  critical_threshold INT NOT NULL DEFAULT 10,
  low_threshold     INT NOT NULL DEFAULT 20,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, blood_type)
);

CREATE VIEW blood_stock_status AS
SELECT
  hospital_id,
  blood_type,
  units_available,
  CASE
    WHEN units_available <= critical_threshold THEN 'CRITICAL'
    WHEN units_available <= low_threshold THEN 'LOW'
    ELSE 'STABLE'
  END::stock_status AS status
FROM blood_inventory;

-- Code Red broadcasts / blood requests (Live Match Monitoring, Recent
-- Fulfillment Log, and Reports KPIs all derive from this table). Each
-- request is raised by one specific hospital.
CREATE TABLE blood_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id       UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  request_code      VARCHAR(20) UNIQUE NOT NULL, -- e.g. "REQ-9012"
  blood_type        blood_type NOT NULL,
  priority          request_priority NOT NULL,
  ward              VARCHAR(100) NOT NULL,
  units_needed      INT NOT NULL,
  units_fulfilled   INT NOT NULL DEFAULT 0,
  status            request_status NOT NULL DEFAULT 'OPEN',
  system_rating     fulfillment_rating,   -- set once resolved
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ
);

CREATE INDEX idx_blood_requests_status ON blood_requests(status);
CREATE INDEX idx_blood_requests_priority ON blood_requests(priority);
CREATE INDEX idx_blood_requests_created_at ON blood_requests(created_at);
CREATE INDEX idx_blood_requests_hospital_id ON blood_requests(hospital_id);

-- Response time (minutes) is derived, not stored, to avoid drift:
-- EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60

-- ---------------------------------------------------------------------------
-- Donors (Donor Management page) — a single shared pool across every
-- hospital. Which hospital a donor actually visits is decided per
-- appointment (the app recommends the nearest one via geolocation), not
-- fixed to the donor record.
-- ---------------------------------------------------------------------------

CREATE TABLE donors (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_code        VARCHAR(20) UNIQUE NOT NULL, -- e.g. "D-8821"
  name              VARCHAR(150) NOT NULL,
  phone             VARCHAR(30) NOT NULL,
  email             VARCHAR(255),         -- optional; SMS is the primary channel since every donor has a phone
  blood_type        blood_type NOT NULL,
  avatar_url        TEXT,
  last_donation_at  TIMESTAMPTZ,          -- drives the DOH 90-day cooling rule
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_donors_blood_type ON donors(blood_type);

-- Convenience view: eligibility computed from the DOH 90-day rule rather
-- than stored redundantly.
CREATE VIEW donor_eligibility AS
SELECT
  id,
  donor_code,
  name,
  blood_type,
  last_donation_at,
  CASE
    WHEN last_donation_at IS NULL THEN true
    WHEN now() - last_donation_at >= INTERVAL '90 days' THEN true
    ELSE false
  END AS is_eligible,
  GREATEST(0, 90 - EXTRACT(DAY FROM now() - last_donation_at)::int) AS days_until_eligible
FROM donors;

-- Scheduled donation appointments — each tied to the hospital the donor
-- was matched to for that visit.
CREATE TABLE appointments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id          UUID NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
  hospital_id       UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  scheduled_at      TIMESTAMPTZ NOT NULL,
  status            appointment_status NOT NULL DEFAULT 'pending',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_appointments_scheduled_at ON appointments(scheduled_at);
CREATE INDEX idx_appointments_donor_id ON appointments(donor_id);
CREATE INDEX idx_appointments_hospital_id ON appointments(hospital_id);

-- Donor arrival events, feeding "Recent Arrivals" and "Live Match Monitoring"
CREATE TABLE donor_arrivals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id          UUID NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
  hospital_id       UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  request_id        UUID REFERENCES blood_requests(id) ON DELETE SET NULL,
  arrived_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_donor_arrivals_arrived_at ON donor_arrivals(arrived_at DESC);
CREATE INDEX idx_donor_arrivals_hospital_id ON donor_arrivals(hospital_id);

-- Delivery log for donor-facing SMS/email alerts sent when a broadcast goes
-- out. One row per attempted send (not per donor) — a donor with both a
-- phone and an email produces two rows, one per channel. Kept even for
-- failed attempts so admins can see who wasn't reached and why. Which
-- hospital this belongs to is inferred via request_id -> blood_requests
-- rather than duplicated here.
CREATE TABLE notifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id            UUID NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
  request_id          UUID REFERENCES blood_requests(id) ON DELETE SET NULL,
  channel             notification_channel NOT NULL,
  recipient           TEXT NOT NULL,   -- the phone number or email address actually used
  status              notification_status NOT NULL,
  provider_message_id TEXT,            -- Semaphore/Resend's own id, for support lookups
  error_message        TEXT,
  read_at             TIMESTAMPTZ,     -- NULL = unread; set when the donor views it in-app (see migration 006)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_request_id ON notifications(request_id);
CREATE INDEX idx_notifications_donor_id ON notifications(donor_id);

-- ---------------------------------------------------------------------------
-- System health (Reports > System Health card)
-- ---------------------------------------------------------------------------

CREATE TABLE system_health_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  min_heap_latency_ms INT NOT NULL,
  db_sync_status    VARCHAR(50) NOT NULL DEFAULT 'Real-time',
  overall_status    VARCHAR(20) NOT NULL DEFAULT 'STABLE'
);

CREATE INDEX idx_system_health_recorded_at ON system_health_snapshots(recorded_at DESC);

-- ---------------------------------------------------------------------------
-- Seed data (mirrors current frontend mock data, for local dev only)
-- ---------------------------------------------------------------------------

-- Three hospitals so the super admin's hospital switcher has something real
-- to switch between, with deliberately different stock situations per
-- hospital (see blood_inventory below) instead of identical numbers
-- everywhere.
INSERT INTO hospitals (code, name, city, latitude, longitude) VALUES
  ('SLMC-QC', 'St. Luke''s Medical Center', 'Quezon City', 14.6091, 121.0223),
  ('PGH-MNL', 'Philippine General Hospital', 'Manila', 14.5778, 120.9860),
  ('MMC-MKT', 'Makati Medical Center', 'Makati', 14.5648, 121.0247);

-- Default dev login: username "admin", password "1234"
-- Change this (via PATCH /api/settings/password) before this ever touches
-- a real deployment.
INSERT INTO admins (username, email, password_hash, clearance) VALUES
  ('admin', 'admin.root@email.com', '$2b$12$mp/fGqajsql3goX7QsX3Y.SE5MLXlbBZ9tbZiE8zlNFSLKJ7Ja3/u', 'FULL_ROOT_ACCESS_LEVEL_5');

-- Thresholds intentionally vary by blood type, not just a flat number: Rh-
-- negative types (O-, AB- here) are rare in the Filipino donor population
-- (~1% combined, vs ~15% in Western populations per Philippine Red Cross /
-- PJNS frequency studies) and much slower to restock, so they get a higher
-- critical/low bar than the common Rh-positive types. O- is bumped further
-- above the other negatives on top of that, since it's also the universal-
-- donor type used in emergencies before a patient's own type is confirmed —
-- rarity and demand both cut the same direction for it. These are sensible
-- starting defaults, not a fixed rule; admins can tune per hospital via
-- Settings > Inventory Thresholds (PATCH /api/dashboard/stock/:bloodType).
INSERT INTO blood_inventory (hospital_id, blood_type, units_available, critical_threshold, low_threshold)
SELECT id, 'O-', 12, 18, 30 FROM hospitals WHERE code = 'SLMC-QC'
UNION ALL SELECT id, 'AB-', 12, 15, 25 FROM hospitals WHERE code = 'SLMC-QC'
UNION ALL SELECT id, 'A+', 12, 10, 15 FROM hospitals WHERE code = 'SLMC-QC'
UNION ALL SELECT id, 'O+', 12, 10, 15 FROM hospitals WHERE code = 'SLMC-QC'
UNION ALL SELECT id, 'O-', 6, 18, 30 FROM hospitals WHERE code = 'PGH-MNL'
UNION ALL SELECT id, 'AB-', 20, 15, 25 FROM hospitals WHERE code = 'PGH-MNL'
UNION ALL SELECT id, 'A+', 30, 10, 15 FROM hospitals WHERE code = 'PGH-MNL'
UNION ALL SELECT id, 'O+', 9, 10, 15 FROM hospitals WHERE code = 'PGH-MNL'
UNION ALL SELECT id, 'O-', 40, 18, 30 FROM hospitals WHERE code = 'MMC-MKT'
UNION ALL SELECT id, 'AB-', 8, 15, 25 FROM hospitals WHERE code = 'MMC-MKT'
UNION ALL SELECT id, 'A+', 18, 10, 15 FROM hospitals WHERE code = 'MMC-MKT'
UNION ALL SELECT id, 'O+', 22, 10, 15 FROM hospitals WHERE code = 'MMC-MKT';

INSERT INTO donors (donor_code, name, phone, blood_type, last_donation_at) VALUES
  ('D-8821', 'Sarah Jenkins', '+63 9956782915', 'O-', NULL),
  ('D-9012', 'Marcus Chen', '+63 9992345726', 'A+', now() - INTERVAL '64 days'),
  ('D-7742', 'Elena Rodriguez', '+63 9286563214', 'B+', NULL),
  ('D-3321', 'David Smith', '+63 9295436851', 'O+', now() - INTERVAL '71 days'),
  ('D-1109', 'Lisa Domingo', '+63 9284529522', 'AB-', NULL),
  ('D-4456', 'Jose Pablo Dela Cruz', '+63 9763548249', 'B-', NULL),
  ('D-8652', 'Theresita Ambrosio', '+63 9088563463', 'AB+', now() - INTERVAL '35 days');

INSERT INTO blood_requests (hospital_id, request_code, blood_type, priority, ward, units_needed, units_fulfilled, status, created_at, resolved_at)
SELECT id, 'REQ-9012', 'O-', 'EMERGENCY', 'ICU-4', 10, 4, 'PARTIALLY_FULFILLED', now() - INTERVAL '12 minutes', NULL FROM hospitals WHERE code = 'SLMC-QC'
UNION ALL SELECT id, 'REQ-8843', 'A+', 'EMERGENCY', 'ER-A', 3, 2, 'PARTIALLY_FULFILLED', now() - INTERVAL '28 minutes', NULL FROM hospitals WHERE code = 'PGH-MNL'
UNION ALL SELECT id, 'REQ-9104', 'B-', 'URGENT', 'Surgery-B', 5, 1, 'PARTIALLY_FULFILLED', now() - INTERVAL '45 minutes', NULL FROM hospitals WHERE code = 'MMC-MKT'
UNION ALL SELECT id, 'REQ-8756', 'AB+', 'URGENT', 'General-2', 5, 5, 'FULFILLED', now() - INTERVAL '65 minutes', now() - INTERVAL '12 minutes' FROM hospitals WHERE code = 'SLMC-QC'
UNION ALL SELECT id, 'REQ-9211', 'O+', 'NORMAL', 'Dialysis', 15, 8, 'PARTIALLY_FULFILLED', now() - INTERVAL '35 minutes', NULL FROM hospitals WHERE code = 'PGH-MNL';

-- Scheduled relative to "today" (the day the DB is first initialized) so the
-- Appointment View has something to show immediately on a fresh setup.
INSERT INTO appointments (donor_id, hospital_id, scheduled_at, status)
SELECT d.id, h.id, date_trunc('day', now()) + INTERVAL '9 hours 30 minutes', 'confirmed'::appointment_status
  FROM donors d, hospitals h WHERE d.donor_code = 'D-8821' AND h.code = 'SLMC-QC'
UNION ALL
SELECT d.id, h.id, date_trunc('day', now()) + INTERVAL '10 hours 15 minutes', 'pending'::appointment_status
  FROM donors d, hospitals h WHERE d.donor_code = 'D-9012' AND h.code = 'PGH-MNL'
UNION ALL
SELECT d.id, h.id, date_trunc('day', now()) + INTERVAL '11 hours', 'pending'::appointment_status
  FROM donors d, hospitals h WHERE d.donor_code = 'D-3321' AND h.code = 'MMC-MKT';

INSERT INTO system_health_snapshots (min_heap_latency_ms, db_sync_status, overall_status) VALUES
  (12, 'Real-time', 'STABLE');

INSERT INTO donor_arrivals (donor_id, hospital_id, arrived_at)
SELECT d.id, h.id, now() - INTERVAL '2 minutes' FROM donors d, hospitals h WHERE d.donor_code = 'D-8821' AND h.code = 'SLMC-QC'
UNION ALL
SELECT d.id, h.id, now() - INTERVAL '8 minutes' FROM donors d, hospitals h WHERE d.donor_code = 'D-9012' AND h.code = 'PGH-MNL'
UNION ALL
SELECT d.id, h.id, now() - INTERVAL '14 minutes' FROM donors d, hospitals h WHERE d.donor_code = 'D-7742' AND h.code = 'SLMC-QC'
UNION ALL
SELECT d.id, h.id, now() - INTERVAL '21 minutes' FROM donors d, hospitals h WHERE d.donor_code = 'D-3321' AND h.code = 'MMC-MKT';
