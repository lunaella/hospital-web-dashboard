-- Migration: drop the UNIQUE constraint on admins.email.
--
-- Hospital teams commonly route every account through one shared inbox
-- (e.g. makatimed@gov.ph) rather than each person having their own email,
-- so the "Add Person" form now locks the email field to the hospital
-- admin's own email for every team member they create — meaning several
-- admins rows legitimately share the exact same email address.
--
-- Verified before writing this: admin email is not used anywhere for
-- login (auth.controller.js looks up strictly by username) or any
-- password-reset flow (none exists for admins), so it carries no
-- functional uniqueness requirement — it was only ever a DB-level
-- constraint with no code depending on it. username remains UNIQUE and is
-- still the real identifier.
--
-- How to run it (container/user/db names per server/docker-compose.yml):
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/migrations/020_admin_email_not_unique.sql
--
-- Safe to run more than once (IF EXISTS).

BEGIN;

ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_email_key;

COMMIT;
