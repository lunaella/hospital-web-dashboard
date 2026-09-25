-- Migration: notify deferred donors too, but ask them to refer someone
-- instead of asking them to donate themselves.
--
-- notifyDonorsForRequest previously only ever matched donors who were both
-- blood-type-matched AND currently eligible (not in the 90-day deferral
-- window) -- a donor who's temporarily deferred got nothing at all for a
-- broadcast matching their own blood type, even though they might know
-- someone else who could help right now. This adds a second, distinct
-- notification path for exactly that donor: in-app bell + push only (no
-- SMS/email for this group, by design), with different "share this with a
-- friend" copy instead of "please come donate."
--
-- Two schema pieces:
--   1. 'in_app' as a new notification_channel value -- referral
--      notifications always get one of these logged so they show up in the
--      donor's bell (GET /api/donor/notifications), independent of whether
--      that donor also has a device registered for an actual push. Every
--      *other* channel (sms/email/push) only ever gets logged when the
--      underlying attempt is real (e.g. no email row if the donor has no
--      email on file) -- 'in_app' is the one exception, since the bell
--      itself has no other backing signal.
--   2. notifications.audience ('direct' | 'referral') -- lets
--      listMyNotifications and the admin delivery-status view tell "asked
--      to donate" and "asked to refer someone" apart. Existing rows are
--      all 'direct' by definition (this feature didn't exist before).
--
-- How to run it (container/user/db names per server/docker-compose.yml):
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/migrations/017_deferred_donor_referrals.sql
--
-- Safe to run more than once (guarded ADD VALUE / IF NOT EXISTS, no data
-- changes to existing rows beyond the new column's default).

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'direct';

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_audience_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_audience_check CHECK (audience IN ('direct', 'referral'));

-- ADD VALUE can't run inside a multi-statement transaction block on older
-- Postgres when the value might be used later in that same transaction
-- (same reason migration 015 kept 'push' in its own DO block) -- kept
-- separate here too, and this file has no BEGIN/COMMIT wrapping it for
-- that reason.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'notification_channel' AND e.enumlabel = 'in_app'
  ) THEN
    ALTER TYPE notification_channel ADD VALUE 'in_app';
  END IF;
END $$;
