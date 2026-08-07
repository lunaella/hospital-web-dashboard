-- Migration: raise the default critical/low stock thresholds for Rh-negative
-- blood types on an already-running dev database.
--
-- Rh-negative types are rare in the Filipino donor population (~1% combined,
-- vs ~15% in Western populations per Philippine Red Cross / PJNS frequency
-- studies) and much slower to restock than the common Rh-positive types, so
-- they now get a higher critical/low bar out of the box. O- is bumped
-- further above the other negatives on top of that, since it's also the
-- universal-donor type used in emergencies before a patient's own type is
-- confirmed. These are just sensible starting defaults, not a fixed rule —
-- admins can tune any hospital's thresholds per blood type from
-- Settings > Inventory Thresholds (PATCH /api/dashboard/stock/:bloodType),
-- which is the feature this migration was written alongside.
--
-- How to run it (container/user/db names per server/docker-compose.yml):
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/migrations/002_update_stock_thresholds.sql
--
-- Safe to run more than once (plain UPDATEs, no CREATE/ADD statements).

BEGIN;

UPDATE blood_inventory SET critical_threshold = 18, low_threshold = 30 WHERE blood_type = 'O-';
UPDATE blood_inventory SET critical_threshold = 15, low_threshold = 25 WHERE blood_type IN ('AB-', 'A-', 'B-');
UPDATE blood_inventory SET critical_threshold = 10, low_threshold = 15 WHERE blood_type IN ('A+', 'B+', 'O+', 'AB+');

COMMIT;
