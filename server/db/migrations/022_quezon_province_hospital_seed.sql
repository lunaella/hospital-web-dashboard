-- Migration: fix hospital seed data to match the real geography this
-- project models.
--
-- The original seed data (St. Luke's Medical Center QC, Philippine General
-- Hospital Manila, Makati Medical Center) and an earlier "Quezon Chapter"
-- naming assumed Quezon CITY (Metro Manila). This project actually models
-- the Philippine Red Cross QUEZON PROVINCE chapter, headquartered in Lucena
-- City — a different place entirely. This migration renames the three
-- generic seed hospitals in place (UPDATE by existing code, not
-- delete+insert) so any dev-DB rows already referencing their hospital_id
-- (appointments, blood_requests, blood_inventory, donor_arrivals) aren't
-- orphaned, and corrects the coordinating hospital's own coordinates.
--
-- Names/codes match src/data/hospitalDirectory.js's existing, previously
-- researched Lucena City directory (used by the Settings > Add Hospital
-- form), so the DB and the UI's hospital picker now agree.
--
-- Coordinates sourced from public hospital directories/map listings, Oct
-- 2026 — real addresses, not surveyed by hand, so treat as approximate:
--   PRC Quezon-Lucena Chapter: Doña Victoria St, Capitol Compound, Lucena City
--   Quezon Medical Center: Barangay 11, Lucena City
--   Lucena MMG General Hospital: Maharlika Highway, Brgy. Ibabang Dupay, Lucena City
--   Lucena United Doctors Hospital and Medical Center: Old Manila South Rd, Lucena City
--
-- How to run it (container/user/db names per server/docker-compose.yml):
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/migrations/022_quezon_province_hospital_seed.sql
--
-- Safe to run more than once — every UPDATE below is a no-op if its target
-- row doesn't exist (e.g. already renamed, or the seed data was never
-- loaded in this database).

BEGIN;

-- The coordinating hospital (see COORDINATING_HOSPITAL_NAME,
-- donorPortal.controller.js) — created via Settings > Hospital Network in
-- the admin UI, not seeded here, so this only fixes its coordinates if a
-- row with this exact name already exists.
UPDATE hospitals
SET latitude = 13.929040, longitude = 121.614110
WHERE name = 'Philippine Red Cross - Quezon Chapter';

UPDATE hospitals
SET code = 'QMC-LC', name = 'Quezon Medical Center', city = 'Lucena City',
    latitude = 13.942109, longitude = 121.612569
WHERE code = 'SLMC-QC';

UPDATE hospitals
SET code = 'MMG-LC', name = 'Lucena MMG General Hospital', city = 'Lucena City',
    latitude = 13.944940, longitude = 121.630930
WHERE code = 'PGH-MNL';

UPDATE hospitals
SET code = 'LUDH-LC', name = 'Lucena United Doctors Hospital and Medical Center', city = 'Lucena City',
    latitude = 13.946990, longitude = 121.585091
WHERE code = 'MMC-MKT';

COMMIT;
