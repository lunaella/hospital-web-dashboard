-- Migration: switch donor identity verification over to Didit (third-party
-- KYC — real ID authenticity checks, liveness, and face match), replacing
-- the on-device-only checks the app used to rely on (see 012/013's comments
-- for that history). Didit hosts the actual capture UI itself and stores
-- the photos on their end, so a donor_verifications row created for a Didit
-- session never has our own copies of the ID/face photos — only the local
-- (pre-Didit) flow ever populated those bytea columns, and it's kept around
-- unused rather than ripped out.
--
-- How to run it (same as 011/012/013):
--   psql "<connection string>" < server/db/migrations/014_didit_verification.sql
--
-- Safe to run more than once (guards on existing constraints/columns).

BEGIN;

ALTER TABLE donor_verifications
  ALTER COLUMN id_front DROP NOT NULL,
  ALTER COLUMN id_front_mime DROP NOT NULL,
  ALTER COLUMN face_front DROP NOT NULL,
  ALTER COLUMN face_front_mime DROP NOT NULL,
  ALTER COLUMN face_left DROP NOT NULL,
  ALTER COLUMN face_left_mime DROP NOT NULL,
  ALTER COLUMN face_right DROP NOT NULL,
  ALTER COLUMN face_right_mime DROP NOT NULL,
  ALTER COLUMN face_up DROP NOT NULL,
  ALTER COLUMN face_up_mime DROP NOT NULL,
  ALTER COLUMN face_down DROP NOT NULL,
  ALTER COLUMN face_down_mime DROP NOT NULL;

-- 'local' = the old on-device-checked submission (still functional, no
-- longer used by the app going forward); 'didit' = a session started via
-- startDiditVerification and settled by the /api/webhooks/didit handler.
ALTER TABLE donor_verifications
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'local' CHECK (source IN ('local', 'didit')),
  ADD COLUMN IF NOT EXISTS didit_session_id TEXT,
  ADD COLUMN IF NOT EXISTS didit_status TEXT; -- Didit's own raw status string (Approved/Declined/In Review/...), kept verbatim alongside our mapped `status`

CREATE UNIQUE INDEX IF NOT EXISTS idx_donor_verifications_didit_session_id
  ON donor_verifications(didit_session_id) WHERE didit_session_id IS NOT NULL;

-- Didit can flag a session for manual review, which the old pending/verified/
-- rejected vocabulary had no slot for.
ALTER TABLE donor_verifications DROP CONSTRAINT IF EXISTS donor_verifications_status_check;
ALTER TABLE donor_verifications
  ADD CONSTRAINT donor_verifications_status_check CHECK (status IN ('pending', 'in_review', 'verified', 'rejected'));

-- Didit retries webhook deliveries on anything but a fast 2xx, so the same
-- event can arrive more than once — this is just a seen-it-already set.
CREATE TABLE IF NOT EXISTS didit_webhook_events (
  event_id TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
