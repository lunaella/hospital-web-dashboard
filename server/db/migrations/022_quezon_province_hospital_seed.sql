-- Migration: fix hospital seed data to match the real geography this
-- project models.
--
-- The original seed data (St. Luke's Medical Center QC, Philippine General
-- Hospital Manila, Makati Medical Center) and an earlier "Quezon Chapter"
-- naming assumed Quezon CITY (Metro Manila). This project actually models
-- the Philippine Red Cross QUEZON PROVINCE chapter, headquartered in Lucena
-- City. This migration:
--   1. renames the three generic seed hospitals in place (UPDATE, not
--      delete+insert, so appointments/requests/inventory referencing their
--      hospital_id aren't orphaned) -- but ONLY when the target code isn't
--      already taken. A database where someone already added e.g. MMG-LC via
--      Settings > Add Hospital keeps both rows; the leftover placeholder can
--      then be deleted from the UI if it has no data attached.
--   2. sets real coordinates on the target hospitals and the PRC chapter
--      wherever they exist (hospitals added through the form can have NULL
--      coordinates, which silently breaks every distance calculation).
--
-- Names/codes match src/data/hospitalDirectory.js.
-- Coordinates are from public map listings, Oct 2026 -- approximate.
--
-- Run (from the server folder):
--   docker exec -i resq-postgres psql -U resq -d resq < db/migrations/022_quezon_province_hospital_seed.sql
--
-- Safe to run more than once.

BEGIN;

-- Coordinating hospital (see COORDINATING_HOSPITAL_NAME,
-- donorPortal.controller.js). Matches by name OR the directory's code, since
-- the exact stored name can differ slightly from the constant.
UPDATE hospitals
SET latitude = 13.929040, longitude = 121.614110
WHERE name = 'Philippine Red Cross - Quezon Chapter' OR code = 'PRC-QC';

-- Renames: skipped when the target code already exists.
UPDATE hospitals
SET code = 'QMC-LC', name = 'Quezon Medical Center', city = 'Lucena City',
    latitude = 13.942109, longitude = 121.612569
WHERE code = 'SLMC-QC'
  AND NOT EXISTS (SELECT 1 FROM hospitals WHERE code = 'QMC-LC');

UPDATE hospitals
SET code = 'MMG-LC', name = 'Lucena MMG General Hospital', city = 'Lucena City',
    latitude = 13.944940, longitude = 121.630930
WHERE code = 'PGH-MNL'
  AND NOT EXISTS (SELECT 1 FROM hospitals WHERE code = 'MMG-LC');

UPDATE hospitals
SET code = 'LUDH-LC', name = 'Lucena United Doctors Hospital and Medical Center', city = 'Lucena City',
    latitude = 13.946990, longitude = 121.585091
WHERE code = 'MMC-MKT'
  AND NOT EXISTS (SELECT 1 FROM hospitals WHERE code = 'LUDH-LC');

-- Coordinates for target hospitals that already existed under their final
-- code (e.g. added via the form with no lat/lng).
UPDATE hospitals SET latitude = 13.942109, longitude = 121.612569 WHERE code = 'QMC-LC';
UPDATE hospitals SET latitude = 13.944940, longitude = 121.630930 WHERE code = 'MMG-LC';
UPDATE hospitals SET latitude = 13.946990, longitude = 121.585091 WHERE code = 'LUDH-LC';

COMMIT;
