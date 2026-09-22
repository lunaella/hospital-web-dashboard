-- Migration: push notifications (donor devices + push as a notification
-- channel + appointment reminder tracking), for an already-running dev
-- database.
--
-- The donor app has no way to reach a donor when it's closed — SMS/email
-- were the only channels. This adds:
--   1. donor_devices: one row per FCM registration token a donor's phone has
--      handed us (a donor can have more than one device — old phone, new
--      phone, a tablet — so this isn't a column on donors).
--   2. 'push' as a value on the existing notification_channel enum, so
--      broadcast-triggered pushes get logged into the notifications table
--      the same way SMS/email attempts already are.
--   3. appointments.reminder_sent_at, so the reminder cron job (see
--      src/jobs/appointmentReminders.js) has a way to avoid double-sending
--      a reminder for the same appointment on every run.
--
-- How to run it (container/user/db names per server/docker-compose.yml):
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/migrations/015_push_notifications.sql
--
-- Note: ALTER TYPE ... ADD VALUE cannot run in the same transaction as a
-- statement that *uses* the new value, so this file deliberately never
-- references 'push' as a literal below the ALTER TYPE line. Application
-- code (a separate connection, run afterward) is free to use it right away.
--
-- Safe to run more than once (IF NOT EXISTS / guarded ADD VALUE, no data
-- changes to existing rows).

BEGIN;

CREATE TABLE IF NOT EXISTS donor_devices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id      UUID NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
  fcm_token     TEXT NOT NULL UNIQUE,
  platform      TEXT NOT NULL DEFAULT 'android',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_donor_devices_donor_id ON donor_devices(donor_id);

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

COMMIT;

-- ADD VALUE can't run inside the BEGIN/COMMIT block above on older Postgres
-- when the value might be used later in that same transaction, so it's kept
-- in its own implicit transaction here (also makes the whole file safe to
-- re-run: the DO block below no-ops if 'push' is already present).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'notification_channel' AND e.enumlabel = 'push'
  ) THEN
    ALTER TYPE notification_channel ADD VALUE 'push';
  END IF;
END $$;
