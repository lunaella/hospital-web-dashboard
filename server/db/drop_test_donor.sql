-- Removes the one-off test donor created by seed_test_donor.sql.
-- How to run it:
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/drop_test_donor.sql

DELETE FROM donors WHERE donor_code = 'D-9999';
