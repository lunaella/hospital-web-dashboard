-- One-off test seed, NOT a migration — creates/updates a single donor with
-- a known password so you can test POST /api/donor-auth/login without
-- going through the OTP flow. Safe to run more than once (upserts by
-- donor_code). Delete this donor (or this file) whenever you're done
-- testing; it's not meant to be permanent.
--
-- Login with:
--   identifier: test@example.com   (or phone: +639171234567)
--   password:   TestPass123
--
-- How to run it:
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/seed_test_donor.sql

INSERT INTO donors (donor_code, name, phone, blood_type, email, password_hash)
VALUES (
  'D-9999',
  'Test Donor',
  '+639171234567',
  'O+',
  'test@example.com',
  '$2a$12$1ljvDSK4l843hRuEHam0CepDbNo.YqoleeZoc/joEaxitHy0QBkk2'
)
ON CONFLICT (donor_code) DO UPDATE SET password_hash = EXCLUDED.password_hash;
