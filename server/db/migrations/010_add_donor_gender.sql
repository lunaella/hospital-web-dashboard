-- Migration: donor gender, for an already-running dev database.
--
-- Reading the mobile app's actual repo (resq_app, Flutter) directly —
-- not just its README this time — shows its DonorProfModel carries a
-- required `gender` (BioSex: male/female) alongside blood type/weight/age.
-- It feeds the client-side eligibility decision tree (pregnancy/nursing
-- questions only apply to female donors, high-risk-exposure questions
-- only to male donors — see registration_wiz_view.dart step 3), so it's
-- part of the same "raw screening intake" this backend already stores in
-- age/weight_kg/health_screening (migration 007), not a new kind of field.
--
-- Binary enum, matching BioSex exactly as modeled client-side — this
-- isn't the backend's own decision to make broader than that.
--
-- How to run it (container/user/db names per server/docker-compose.yml):
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/migrations/010_add_donor_gender.sql
--
-- Safe to run more than once (guarded CREATE TYPE, ADD COLUMN IF NOT EXISTS).

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'donor_gender') THEN
    CREATE TYPE donor_gender AS ENUM ('male', 'female');
  END IF;
END $$;

ALTER TABLE donors ADD COLUMN IF NOT EXISTS gender donor_gender;

COMMIT;
