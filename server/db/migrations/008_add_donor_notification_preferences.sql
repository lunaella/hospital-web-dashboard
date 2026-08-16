-- Migration: per-channel notification opt-out for donors, for an
-- already-running dev database.
--
-- The checklist's Settings module lists a "Notification Preferences"
-- screen, but there was previously no backend support for it — every
-- eligible donor always got both SMS and email (when on file) with no way
-- to turn a channel off. Two plain booleans, not a JSONB bag like
-- health_screening: these aren't the mobile team's to redefine, they're a
-- fixed pair of channels this backend itself dispatches over
-- (notifications.service.js), so there's no reason to leave the shape open.
-- Default true on both so existing donors keep getting notified exactly as
-- before until they explicitly opt out.
--
-- How to run it (container/user/db names per server/docker-compose.yml):
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/migrations/008_add_donor_notification_preferences.sql
--
-- Safe to run more than once (ADD COLUMN IF NOT EXISTS, no data changes).

BEGIN;

ALTER TABLE donors ADD COLUMN IF NOT EXISTS notify_sms BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE donors ADD COLUMN IF NOT EXISTS notify_email BOOLEAN NOT NULL DEFAULT true;

COMMIT;
