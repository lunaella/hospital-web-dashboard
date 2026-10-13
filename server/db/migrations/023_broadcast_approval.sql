-- Migration: super admin approval for hospital broadcasts.
--
-- A broadcast raised by any admin other than the super admin no longer goes
-- straight out to donors. It's saved as PENDING_APPROVAL, and only once a
-- super admin approves it (POST /api/requests/:code/approve) does it flip
-- to OPEN and fire the donor SMS/email/push alerts. A rejected one
-- (POST /api/requests/:code/reject) ends as REJECTED and never reaches a
-- donor. Super admins' own broadcasts skip the queue and go live at once.
--
-- created_at keeps meaning "when this went live" (every response-time and
-- fulfillment metric is measured from it), so approval resets it to the
-- approval time; submitted_at keeps the original submission time.
--
-- How to run it (container/user/db names per server/docker-compose.yml):
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/migrations/023_broadcast_approval.sql
--
-- Safe to run more than once (IF NOT EXISTS throughout).

ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'REJECTED';

BEGIN;

ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES admins(id) ON DELETE SET NULL;
ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES admins(id) ON DELETE SET NULL;
ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

UPDATE blood_requests SET submitted_at = created_at WHERE submitted_at IS NULL;
ALTER TABLE blood_requests ALTER COLUMN submitted_at SET DEFAULT now();
ALTER TABLE blood_requests ALTER COLUMN submitted_at SET NOT NULL;

COMMIT;
