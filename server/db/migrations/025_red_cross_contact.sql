-- Migration: Red Cross contact number for hospitals.
--
-- Hospitals can call the Red Cross (super admin) the same way the Red
-- Cross can call them (migration 024): every hospital admin sees a "Call
-- Red Cross" button, most importantly next to a broadcast still awaiting
-- approval. The Red Cross isn't a hospitals row (it oversees them), so its
-- number lives in a small app-wide key/value table instead, edited by the
-- super admin in Settings. Key used: 'red_cross_phone'.
--
-- How to run it (container/user/db names per server/docker-compose.yml):
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/migrations/025_red_cross_contact.sql
--
-- Safe to run more than once (IF NOT EXISTS).

BEGIN;

CREATE TABLE IF NOT EXISTS app_settings (
  key         VARCHAR(50) PRIMARY KEY,
  value       TEXT,
  updated_by  UUID REFERENCES admins(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
