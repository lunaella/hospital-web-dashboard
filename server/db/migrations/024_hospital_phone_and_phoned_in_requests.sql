-- Migration: hospital contact numbers + phoned-in broadcasts.
--
-- The Red Cross (super admin) still settles urgent requests by phone. This
-- keeps the phone call part of the process instead of outside it:
--
-- 1. hospitals.contact_phone — shown with each Pending Approval broadcast
--    as a "Call hospital" button, so the super admin can confirm a request
--    with the hospital before approving it.
--
-- 2. blood_requests.intake_channel / caller_name — a request a hospital
--    phones in can be logged by the super admin as "received by phone"
--    (who called), so it still goes through the system and gets recorded
--    instead of living only in someone's call log. 'portal' = submitted by
--    the hospital itself through the admin app.
--
-- How to run it (container/user/db names per server/docker-compose.yml):
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/migrations/024_hospital_phone_and_phoned_in_requests.sql
--
-- Safe to run more than once (IF NOT EXISTS throughout).

BEGIN;

ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(30);

ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS intake_channel VARCHAR(10) NOT NULL DEFAULT 'portal';
ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS caller_name VARCHAR(100);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blood_requests_intake_channel_check') THEN
    ALTER TABLE blood_requests
      ADD CONSTRAINT blood_requests_intake_channel_check CHECK (intake_channel IN ('portal', 'phone'));
  END IF;
END $$;

COMMIT;
