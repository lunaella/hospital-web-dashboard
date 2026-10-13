-- Migration: text the Red Cross about pending broadcasts + let hospitals
-- cancel a request.
--
-- 1. SMS/email alerts for PENDING_APPROVAL broadcasts, so a hospital's
--    request reaches the Red Cross (super admin) even when nobody has the
--    dashboard open. services/approvalAlerts.service.js sends the first
--    alert as soon as the request is submitted, and
--    jobs/approvalEscalation.js re-alerts (adding the backup numbers) if
--    it's still pending after 5 / 15 / 60 min for EMERGENCY / URGENT /
--    NORMAL, at most 3 times. Nothing is ever auto-approved.
--      - blood_requests.approval_alert_count / last_approval_alert_at:
--        how many alerts went out and when the last one did.
--      - approval_alerts: one row per send attempt (who, which channel,
--        whether it went through) so "did the Red Cross get texted?" has
--        an answer.
--    Recipients live in app_settings (migration 025):
--      red_cross_alert_numbers  — mobiles texted for every new request
--      red_cross_backup_numbers — mobiles added once it escalates
--    plus an email to every super admin account.
--
-- 2. Hospitals can cancel their own request (POST /api/requests/:code/cancel):
--      - one still awaiting approval ends as WITHDRAWN (it never went live,
--        so it's left out of every metric, like REJECTED);
--      - one already live ends as CANCELLED (the existing status), which
--        takes it off the donor app.
--    cancelled_by / cancelled_at / cancel_reason record who and why.
--
-- How to run it (container/user/db names per server/docker-compose.yml):
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/migrations/026_approval_alerts_and_cancel.sql
--
-- Safe to run more than once (IF NOT EXISTS throughout).

ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'WITHDRAWN';

BEGIN;

ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS approval_alert_count INT NOT NULL DEFAULT 0;
ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS last_approval_alert_at TIMESTAMPTZ;
ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES admins(id) ON DELETE SET NULL;
ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- Requests already pending when this ships count as already alerted once,
-- so the escalation job doesn't immediately text about a backlog the
-- dashboard has been showing all along.
UPDATE blood_requests
SET approval_alert_count = 1, last_approval_alert_at = now()
WHERE status = 'PENDING_APPROVAL' AND approval_alert_count = 0;

CREATE TABLE IF NOT EXISTS approval_alerts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     UUID NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
  attempt        INT NOT NULL,            -- 1 = first alert, 2+ = escalations
  channel        notification_channel NOT NULL,
  recipient      VARCHAR(255) NOT NULL,
  status         notification_status NOT NULL,
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_alerts_request_id ON approval_alerts(request_id);
CREATE INDEX IF NOT EXISTS idx_blood_requests_pending_alerts
  ON blood_requests(last_approval_alert_at) WHERE status = 'PENDING_APPROVAL';

COMMIT;
