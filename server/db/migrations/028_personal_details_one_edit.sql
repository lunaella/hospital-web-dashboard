-- Migration: donors get one self-service edit of their personal details.
--
-- Settings > Edit Personal Details (name, phone, email, birth date,
-- emergency contact) used to be editable any number of times. A donor now
-- gets a single save; after that the app shows the details read-only and
-- PATCH /api/donor/me rejects further changes to them (updateMyProfile,
-- donorPortal.controller.js). Staff can still correct them from Donor
-- Management. The health screening answers stay editable at any time.
--
-- personal_details_edited_at: when the donor used their one edit (NULL =
-- not used yet).
--
-- How to run it (container/user/db names per server/docker-compose.yml):
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/migrations/028_personal_details_one_edit.sql
--
-- ---------------------------------------------------------------------------

ALTER TABLE donors ADD COLUMN IF NOT EXISTS personal_details_edited_at TIMESTAMPTZ;
