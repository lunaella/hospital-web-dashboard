-- Migration: some ID types have no back to scan (a passport's data is all
-- on the photo page; a clearance/certificate is a single printed page, not
-- a two-sided card — see kNoIdBackTypes in the app's get_ver_view.dart), so
-- id_back/id_back_mime on donor_verifications can no longer be NOT NULL.
--
-- Also adds columns for the OCR cross-check now run on the ID Front photo
-- (name vs registered profile, birthdate vs registered age, both on-device
-- in the app before upload — see submitVerification's doc comment in
-- donorPortal.controller.js): extracted_birthdate and extracted_address are
-- best-effort values the app already computed, carried through for context
-- rather than re-parsed server-side.
--
-- How to run it (same as migration 011/012):
--   psql "<connection string>" < server/db/migrations/013_donor_verification_optional_back.sql
--
-- Safe to run more than once (guards on existing NULL constraint / column
-- presence, no data changes).

BEGIN;

ALTER TABLE donor_verifications ALTER COLUMN id_back DROP NOT NULL;
ALTER TABLE donor_verifications ALTER COLUMN id_back_mime DROP NOT NULL;

ALTER TABLE donor_verifications ADD COLUMN IF NOT EXISTS extracted_birthdate DATE;
ALTER TABLE donor_verifications ADD COLUMN IF NOT EXISTS extracted_address TEXT;

COMMIT;
