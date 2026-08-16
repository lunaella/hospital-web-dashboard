-- Migration: donor self-reported screening data, for an already-running
-- dev database.
--
-- The mobile app (resq_app, Flutter) does its own donor-eligibility
-- decision-tree classification client-side (lib/utils/algo/) — this is
-- NOT the backend re-implementing that logic. It just needed somewhere to
-- store the raw intake answers the decision tree runs on, which didn't
-- exist on `donors` at all before now. age/weight_kg are plain self-
-- reported values; health_screening is a JSONB bag rather than individual
-- boolean columns so the mobile team can add/change screening questions
-- without a new migration every time — this app isn't the one defining
-- what those questions are.
--
-- How to run it (container/user/db names per server/docker-compose.yml):
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/migrations/007_add_donor_screening_fields.sql
--
-- Safe to run more than once (ADD COLUMN IF NOT EXISTS, no data changes).

BEGIN;

ALTER TABLE donors ADD COLUMN IF NOT EXISTS age INT;
ALTER TABLE donors ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(5,2);
ALTER TABLE donors ADD COLUMN IF NOT EXISTS health_screening JSONB;

COMMIT;
