-- Migration: let a donor register without knowing their blood type.
--
-- The app's registration wizard offers "I'm not sure" for blood type, but
-- donors.blood_type was NOT NULL, so complete-profile rejected those
-- signups (found in user testing). A NULL blood type now means "not on
-- file yet":
--   - the donor is left out of blood-type broadcasts (d.blood_type = $1
--     never matches NULL) and sees every open request in the app feed;
--   - staff must record the type before recording the donor's first
--     donation (POST /api/appointments/:id/complete takes bloodType),
--     which is when the blood bank types the unit anyway.

ALTER TABLE donors ALTER COLUMN blood_type DROP NOT NULL;
