-- Migration: donor profile photo storage.
--
-- The mobile app's Profile screen (EditableAvatar) has always called
-- POST /api/donor/me/photo expecting to upload a new photo and get back a
-- hosted URL, but that endpoint never existed server-side — the donors
-- table's unused `avatar_url` column was never wired to anything, so every
-- upload attempt failed and no photo was ever actually stored.
--
-- Follows the same pattern as donor_verifications (migration 012): the
-- image is stored as bytea directly in Postgres rather than on disk or in
-- external object storage, since this project has neither a persistent
-- disk nor an S3-compatible bucket configured. A profile photo is small
-- (client-side picker already caps it at 800px wide, ~85% JPEG quality —
-- see editable_avatar.dart) so this stays cheap.
--
-- photo_updated_at exists purely to cache-bust the serving URL
-- (/api/donor-photos/:id?v=<timestamp>) so a donor who replaces their
-- photo doesn't keep seeing a stale cached image on their own or anyone
-- else's device.
--
-- How to run it (container/user/db names per server/docker-compose.yml):
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/migrations/016_donor_profile_photo.sql
--
-- Safe to run more than once (IF NOT EXISTS, no data changes to existing
-- rows).

BEGIN;

ALTER TABLE donors ADD COLUMN IF NOT EXISTS photo BYTEA;
ALTER TABLE donors ADD COLUMN IF NOT EXISTS photo_mime_type TEXT;
ALTER TABLE donors ADD COLUMN IF NOT EXISTS photo_updated_at TIMESTAMPTZ;

COMMIT;
