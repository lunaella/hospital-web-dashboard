-- Migration: separate the donation stages, log changes to donor details,
-- and add database-level safeguards (thesis revision matrix, Nov 2026).
--
-- 1. Donation stages. Recording a donation used to add a unit to
--    blood_inventory and count it toward an open request in one step, so a
--    check-in/collection looked like usable blood. The stages are now:
--      appointment pending   = reserved
--      appointment confirmed = arrived (checked_in_at, a donor_arrivals row)
--      appointment completed = blood collected (a donation_units row,
--                              status 'collected', NOT in inventory)
--      unit 'released'       = passed testing, blood type confirmed by the
--                              lab; only now added to blood_inventory
--      unit 'discarded'      = failed testing / unusable; never in inventory
--      unit 'issued'         = released unit issued to a request; only now
--                              does the request's units_fulfilled go up
--    Donations recorded before this migration keep their old effect (they
--    were already added to inventory) and get no donation_units row.
--
-- 2. donor_change_log: who changed which donor detail, from what to what.
--    Blood type can only change through lab typing at release or a staff
--    correction with a reason; donors can never change it themselves.
--    blood_type_confirmed_at marks a blood type confirmed by lab typing
--    (NULL = self-reported at registration).
--
-- 3. One active (pending/confirmed) appointment per donor, and unique
--    phone / email per donor account (both were app-level checks only).
--    Checked on the live database before writing this: no duplicates.
--
-- How to run it (container/user/db names per server/docker-compose.yml):
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/migrations/029_donation_stages_and_safeguards.sql
-- ---------------------------------------------------------------------------

BEGIN;

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;

ALTER TABLE donor_arrivals ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_donor_arrivals_appointment
  ON donor_arrivals(appointment_id) WHERE appointment_id IS NOT NULL;

DO $$ BEGIN
  CREATE TYPE donation_unit_status AS ENUM ('collected', 'released', 'discarded', 'issued');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS donation_units (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_code         TEXT NOT NULL UNIQUE,
  appointment_id    UUID UNIQUE REFERENCES appointments(id) ON DELETE SET NULL,
  -- SET NULL, not CASCADE: a unit already in the blood bank stays on record
  -- even if the donor later deletes their account.
  donor_id          UUID REFERENCES donors(id) ON DELETE SET NULL,
  hospital_id       UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  -- Provisional (the donor's type on file) until the lab confirms it at release.
  blood_type        blood_type,
  -- The open request this donation was credited to by the min-heap at
  -- collection (response tracking). It only counts toward that request's
  -- units_fulfilled once the unit is issued.
  request_id        UUID REFERENCES blood_requests(id) ON DELETE SET NULL,
  status            donation_unit_status NOT NULL DEFAULT 'collected',
  screening_override BOOLEAN NOT NULL DEFAULT false,
  screening_note    TEXT,
  collected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  collected_by      UUID REFERENCES admins(id) ON DELETE SET NULL,
  released_at       TIMESTAMPTZ,
  released_by       UUID REFERENCES admins(id) ON DELETE SET NULL,
  discarded_at      TIMESTAMPTZ,
  discarded_by      UUID REFERENCES admins(id) ON DELETE SET NULL,
  discard_reason    TEXT,
  issued_at         TIMESTAMPTZ,
  issued_by         UUID REFERENCES admins(id) ON DELETE SET NULL,
  issued_request_id UUID REFERENCES blood_requests(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_donation_units_hospital_status ON donation_units(hospital_id, status);
CREATE INDEX IF NOT EXISTS idx_donation_units_donor ON donation_units(donor_id);

ALTER TABLE donors ADD COLUMN IF NOT EXISTS blood_type_confirmed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS donor_change_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id      UUID NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
  field         TEXT NOT NULL,
  old_value     TEXT,
  new_value     TEXT,
  changed_by    TEXT NOT NULL CHECK (changed_by IN ('donor', 'staff', 'lab')),
  admin_id      UUID REFERENCES admins(id) ON DELETE SET NULL,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_donor_change_log_donor ON donor_change_log(donor_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_appointment_per_donor
  ON appointments(donor_id) WHERE status IN ('pending', 'confirmed');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_donors_phone ON donors(phone);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_donors_email ON donors(lower(email)) WHERE email IS NOT NULL;

COMMIT;
