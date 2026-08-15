-- Migration: read/unread tracking on notifications, for an already-running
-- dev database.
--
-- The notifications table was purely a delivery log (channel, status,
-- provider_message_id, error_message) — there was no way to know whether a
-- donor had actually seen an alert in the mobile app's bell/notification
-- list. This adds a nullable read_at (NULL = unread, timestamp = when the
-- donor viewed it), which GET /api/donor/notifications and
-- PATCH /api/donor/notifications/read now use.
--
-- How to run it (container/user/db names per server/docker-compose.yml):
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/migrations/006_add_notification_read_tracking.sql
--
-- Safe to run more than once (ADD COLUMN IF NOT EXISTS, no data changes).

BEGIN;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

COMMIT;
