-- Migration: add multi-hospital support to an already-running dev database.
--
-- There's no migration runner in this project (no node-pg-migrate/knex/etc.
-- in package.json) — schema.sql only ever applies automatically to a brand
-- new, empty Postgres data volume (Postgres's docker-entrypoint-initdb.d
-- behavior). This file is meant to be run by hand, once, against the
-- existing dev database so you don't lose whatever test data is already in
-- it. schema.sql itself has already been updated to match this end state,
-- so a *fresh* `docker compose down -v && docker compose up -d` also works
-- and doesn't need this file at all — only run this against a database you
-- want to keep the existing rows in.
--
-- How to run it (container/user/db names per server/docker-compose.yml):
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/migrations/001_add_hospitals.sql
--
-- Every pre-existing row in blood_inventory/blood_requests/appointments/
-- donor_arrivals gets backfilled onto the first seeded hospital
-- (SLMC-QC) below, since there's no way to know which real-world hospital
-- your existing test rows were meant to represent. Reassign specific rows
-- afterward with a plain UPDATE if you want them split across hospitals
-- instead.

BEGIN;

CREATE TABLE IF NOT EXISTS hospitals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              VARCHAR(20) UNIQUE NOT NULL,
  name              VARCHAR(150) NOT NULL,
  city              VARCHAR(100),
  address           TEXT,
  latitude          NUMERIC(9,6),
  longitude         NUMERIC(9,6),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO hospitals (code, name, city, latitude, longitude)
VALUES
  ('SLMC-QC', 'St. Luke''s Medical Center', 'Quezon City', 14.6091, 121.0223),
  ('PGH-MNL', 'Philippine General Hospital', 'Manila', 14.5778, 120.9860),
  ('MMC-MKT', 'Makati Medical Center', 'Makati', 14.5648, 121.0247)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- blood_inventory: was PRIMARY KEY (blood_type) for a single implicit
-- hospital. Becomes PRIMARY KEY (hospital_id, blood_type).
-- ---------------------------------------------------------------------------

ALTER TABLE blood_inventory ADD COLUMN IF NOT EXISTS hospital_id UUID;

UPDATE blood_inventory
SET hospital_id = (SELECT id FROM hospitals WHERE code = 'SLMC-QC')
WHERE hospital_id IS NULL;

ALTER TABLE blood_inventory ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE blood_inventory
  ADD CONSTRAINT blood_inventory_hospital_id_fkey
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE;

ALTER TABLE blood_inventory DROP CONSTRAINT IF EXISTS blood_inventory_pkey;
ALTER TABLE blood_inventory ADD PRIMARY KEY (hospital_id, blood_type);

-- blood_stock_status is a view over blood_inventory and must be recreated
-- to expose the new hospital_id column.
DROP VIEW IF EXISTS blood_stock_status;
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

-- ---------------------------------------------------------------------------
-- blood_requests / appointments / donor_arrivals: add hospital_id, backfill,
-- then require it.
-- ---------------------------------------------------------------------------

ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS hospital_id UUID;
UPDATE blood_requests
SET hospital_id = (SELECT id FROM hospitals WHERE code = 'SLMC-QC')
WHERE hospital_id IS NULL;
ALTER TABLE blood_requests ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE blood_requests
  ADD CONSTRAINT blood_requests_hospital_id_fkey
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_blood_requests_hospital_id ON blood_requests(hospital_id);

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS hospital_id UUID;
UPDATE appointments
SET hospital_id = (SELECT id FROM hospitals WHERE code = 'SLMC-QC')
WHERE hospital_id IS NULL;
ALTER TABLE appointments ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_hospital_id_fkey
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_appointments_hospital_id ON appointments(hospital_id);

ALTER TABLE donor_arrivals ADD COLUMN IF NOT EXISTS hospital_id UUID;
UPDATE donor_arrivals
SET hospital_id = (SELECT id FROM hospitals WHERE code = 'SLMC-QC')
WHERE hospital_id IS NULL;
ALTER TABLE donor_arrivals ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE donor_arrivals
  ADD CONSTRAINT donor_arrivals_hospital_id_fkey
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_donor_arrivals_hospital_id ON donor_arrivals(hospital_id);

COMMIT;

-- Sanity check after running: every row below should show 0.
-- SELECT
--   (SELECT count(*) FROM blood_inventory WHERE hospital_id IS NULL) AS bi,
--   (SELECT count(*) FROM blood_requests WHERE hospital_id IS NULL) AS br,
--   (SELECT count(*) FROM appointments WHERE hospital_id IS NULL) AS ap,
--   (SELECT count(*) FROM donor_arrivals WHERE hospital_id IS NULL) AS da;
