-- One-off: point the D-9999 test donor at a real, deliverable email so a
-- broadcast test actually lands somewhere you can check. Replace
-- YOUR_REAL_EMAIL_HERE below with an inbox you can open before running.
--
-- How to run it:
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/update_test_donor_email.sql

UPDATE donors SET email = 'YOUR_REAL_EMAIL_HERE', notify_email = true
WHERE donor_code = 'D-9999';
