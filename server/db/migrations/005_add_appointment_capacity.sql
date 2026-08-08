-- Migration: per-hospital appointment slot capacity, for an already-running
-- dev database.
--
-- Previously nothing stopped two (or twenty) donors from being booked at
-- the exact same scheduled_at for the same hospital — appointments had no
-- unique constraint and createAppointment did no counting. This adds a
-- capacity column to hospitals (how many donors can share one time slot,
-- since a real donation site runs several stations/chairs in parallel, not
-- just one) and createAppointment now rejects a booking once that slot is
-- full. Existing hospitals default to 5, editable from Settings > Hospital
-- Network like every other hospital field.
--
-- How to run it (container/user/db names per server/docker-compose.yml):
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/migrations/005_add_appointment_capacity.sql
--
-- Safe to run more than once (ADD COLUMN IF NOT EXISTS, no data changes).

BEGIN;

ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS appointment_capacity INT NOT NULL DEFAULT 5;

COMMIT;
