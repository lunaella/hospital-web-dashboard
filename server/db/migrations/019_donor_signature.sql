-- Migration: donor digital signature storage.
--
-- The Digital Health Card's "Signature · Lagda" box was static placeholder
-- text — tapping it does nothing. This adds real storage for a donor-drawn
-- signature so it can persist and show on the card going forward.
--
-- Same pattern as the profile photo (migration 016): bytea directly on the
-- donors row, no disk/object storage configured for this project. The
-- client draws the signature as strokes on a canvas and exports it as a
-- small PNG (transparent background) before uploading — see
-- signature_pad_view.dart.
--
-- signature_updated_at exists purely to cache-bust the serving URL
-- (/api/donor-signatures/:id?v=<timestamp>), same reasoning as
-- photo_updated_at.
--
-- How to run it (container/user/db names per server/docker-compose.yml):
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/migrations/019_donor_signature.sql
--
-- Safe to run more than once (IF NOT EXISTS, no data changes to existing
-- rows).

BEGIN;

ALTER TABLE donors ADD COLUMN IF NOT EXISTS signature BYTEA;
ALTER TABLE donors ADD COLUMN IF NOT EXISTS signature_mime_type TEXT;
ALTER TABLE donors ADD COLUMN IF NOT EXISTS signature_updated_at TIMESTAMPTZ;

COMMIT;
