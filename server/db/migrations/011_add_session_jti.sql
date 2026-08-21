-- Migration: track each admin session's full JWT id, for an already-running
-- dev database.
--
-- admin_sessions previously only stored a truncated, display-only
-- session_code (jti.slice(0,8).toUpperCase()) — not enough to reconstruct
-- the real Redis key (`session:{jti}`) for a given row. Needed so login can
-- look up and revoke a super admin's *other* active sessions by their real
-- jti (see auth.controller.js login/logout) — single-session enforcement
-- for FULL_ROOT_ACCESS_LEVEL_5 accounts only; regular team members can
-- still be logged in from multiple places at once.
--
-- How to run it (container/user/db names per server/docker-compose.yml):
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/migrations/011_add_session_jti.sql
--
-- Safe to run more than once (ADD COLUMN IF NOT EXISTS, no data changes).
-- Existing rows are left with session_jti = NULL — there's no way to
-- recover the real jti for a session created before this migration, so
-- old rows simply won't be matched/revocable by the new logic; only
-- sessions created after this migration participate in it.

BEGIN;

ALTER TABLE admin_sessions ADD COLUMN IF NOT EXISTS session_jti TEXT;

COMMIT;
