-- Digital Health Card (the physical-style "Blood donor ID" front/back
-- design) needs a real birth date and an emergency contact — neither
-- existed before (donors only ever stored a self-reported `age` integer,
-- and there was no emergency-contact field anywhere). Both nullable: a
-- donor who registered before this migration simply shows "Not set" on the
-- card until they fill these in from Settings.
BEGIN;

ALTER TABLE donors
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;

COMMIT;
