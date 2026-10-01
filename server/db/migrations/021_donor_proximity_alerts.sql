-- Migration: donor last-known location + proximity notification dedup.
--
-- Powers "notify a donor when they move near a hospital that has an open
-- broadcast matching their blood type" even when that donor has never been
-- registered with that specific hospital. Two pieces:
--
-- 1. donors.last_lat/last_lng/last_location_at — a single most-recent
--    position per donor (not per-device: a donor can have more than one
--    registered device, but physically stands in one place at a time, so
--    "whichever device last reported" is the only position that means
--    anything). Updated by the mobile app's background location stream
--    (see LocationService) via PATCH /api/donor/location — NOT by the
--    one-shot read already used for GET /api/donor/requests?lat=&lng=,
--    which is request-scoped and never persisted.
--
-- 2. donor_request_notifications — dedup so a donor who lingers near (or
--    repeatedly passes) a hospital with a still-open request doesn't get
--    re-pushed for that same request on every position update.
--    notifyDonorsForRequest (new-broadcast path) and the proximity push
--    path both insert here before sending, and both check it first.
--
-- How to run it (container/user/db names per server/docker-compose.yml):
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/migrations/021_donor_proximity_alerts.sql
--
-- Safe to run more than once (IF NOT EXISTS / IF EXISTS throughout).

BEGIN;

ALTER TABLE donors ADD COLUMN IF NOT EXISTS last_lat NUMERIC(9,6);
ALTER TABLE donors ADD COLUMN IF NOT EXISTS last_lng NUMERIC(9,6);
ALTER TABLE donors ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS donor_request_notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id      UUID NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
  request_id    UUID NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
  notified_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (donor_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_donor_request_notifications_request_id
  ON donor_request_notifications(request_id);

COMMIT;
