-- Migration: optional password login for donors, for an already-running
-- dev database.
--
-- Donor auth was OTP-only (phone + SMS code) up to this point. Adding a
-- password as a second, faster way to log back in — not replacing OTP,
-- which still verifies the phone number at signup and remains a valid
-- login path on its own. Nullable: donors created before this migration,
-- and donors an admin creates directly as a walk-in (donors.controller.js
-- createDonor), have no password until they set one — via
-- complete-profile at signup, or PATCH /api/donor/me afterward.
--
-- How to run it (container/user/db names per server/docker-compose.yml):
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/migrations/009_add_donor_password.sql
--
-- Safe to run more than once (ADD COLUMN IF NOT EXISTS, no data changes).

BEGIN;

ALTER TABLE donors ADD COLUMN IF NOT EXISTS password_hash TEXT;

COMMIT;
