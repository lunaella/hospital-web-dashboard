-- Migration: donor identity verification submissions ("Get Verified" flow
-- in the mobile app — lib/views/profile/get_ver_view.dart).
--
-- Stores the donor's chosen ID type plus the 2 ID photos and 5 guided
-- face-angle photos directly as bytea, not on local disk — this server has
-- no persistent disk or cloud storage (S3/Cloudinary/etc.) configured, and
-- Render's default web service filesystem is wiped on every deploy/restart,
-- so anything written to disk here would quietly vanish the next time this
-- service redeploys. Postgres itself is the one thing on this stack that's
-- actually durable, so that's where these live for now. Revisit if/when a
-- real object storage bucket gets added — swapping these bytea columns for
-- stored URLs later is a mechanical change, not a data-model rewrite.
--
-- One row per submission attempt (not one row per donor) — a rejected
-- donor can resubmit, and keeping the history means a rejection reason
-- doesn't get silently overwritten. "Current" status for a donor is
-- whichever row has the latest submitted_at (see getMyProfile).
--
-- How to run it (container/user/db names per server/docker-compose.yml):
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/migrations/012_add_donor_verification.sql
-- Against the deployed Render Postgres instance, run it with psql pointed
-- at that instance's connection string instead.
--
-- Safe to run more than once (CREATE TABLE IF NOT EXISTS, no data changes).

BEGIN;

CREATE TABLE IF NOT EXISTS donor_verifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id          UUID NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
  id_type           TEXT NOT NULL, -- e.g. "Philippine Passport issued by the Department of Foreign Affairs (DFA)" — free text from the app's fixed primary/secondary ID list, not an enum, so the list can change without a migration
  id_front          BYTEA NOT NULL,
  id_front_mime     TEXT NOT NULL,
  id_back           BYTEA NOT NULL,
  id_back_mime      TEXT NOT NULL,
  face_front        BYTEA NOT NULL,
  face_front_mime   TEXT NOT NULL,
  face_left         BYTEA NOT NULL,
  face_left_mime    TEXT NOT NULL,
  face_right        BYTEA NOT NULL,
  face_right_mime   TEXT NOT NULL,
  face_up           BYTEA NOT NULL,
  face_up_mime      TEXT NOT NULL,
  face_down         BYTEA NOT NULL,
  face_down_mime    TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  rejection_reason  TEXT,
  reviewed_by       UUID REFERENCES admins(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_donor_verifications_donor_id ON donor_verifications(donor_id);
CREATE INDEX IF NOT EXISTS idx_donor_verifications_submitted_at ON donor_verifications(submitted_at DESC);

COMMIT;
