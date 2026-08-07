-- Migration: per-admin hospital scoping (Team Access > which hospitals can
-- this person see) for an already-running dev database.
--
-- Adds admin_hospital_assignments — one row per hospital an admin has been
-- explicitly scoped to. No rows for an admin means unrestricted (they can
-- pick any hospital from the switcher), which is exactly the behavior every
-- existing admin account already has today — nothing needs to be backfilled
-- for them. An admin can have more than one row (e.g. a regional supervisor
-- over a few branches), not just the "one admin per hospital" common case.
-- Super admins and delegated team managers always bypass this table
-- entirely and see every hospital regardless of what's stored here.
--
-- How to run it (container/user/db names per server/docker-compose.yml):
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/migrations/004_add_hospital_assignments.sql
--
-- Safe to run more than once (CREATE TABLE IF NOT EXISTS, no data changes).

BEGIN;

CREATE TABLE IF NOT EXISTS admin_hospital_assignments (
  admin_id          UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  hospital_id       UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  PRIMARY KEY (admin_id, hospital_id)
);

COMMIT;
