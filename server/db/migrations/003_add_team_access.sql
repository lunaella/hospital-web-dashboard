-- Migration: Team Access (multi-admin support with per-section permissions)
-- for an already-running dev database.
--
-- Adds:
--   - admins.can_manage_team — lets the super admin delegate "add/edit/
--     remove team members" to a trusted account without granting them a
--     second super admin's blanket edit access to every section.
--   - admin_permissions table — one row per (admin, section) an admin has
--     been granted access to (none/view/edit); a missing row means 'none'.
--     Super admins (clearance = FULL_ROOT_ACCESS_LEVEL_5) skip this table
--     entirely and always have edit access everywhere.
--
-- The existing seeded 'admin' account (FULL_ROOT_ACCESS_LEVEL_5) becomes the
-- super admin automatically — no data migration needed for it, since super
-- admins bypass admin_permissions. Any other existing admin accounts you've
-- created get no rows here (i.e. 'none' on every section) until whoever
-- manages the team grants them access from Settings > Team Access.
--
-- How to run it (container/user/db names per server/docker-compose.yml):
--   docker exec -i resq-postgres psql -U resq -d resq < server/db/migrations/003_add_team_access.sql
--
-- Safe to run more than once — every statement below is guarded
-- (IF NOT EXISTS / DO block with a catalog check).

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'permission_section') THEN
    CREATE TYPE permission_section AS ENUM ('dashboard', 'donor_management', 'reports', 'broadcasts', 'settings');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'permission_level') THEN
    CREATE TYPE permission_level AS ENUM ('none', 'view', 'edit');
  END IF;
END $$;

ALTER TABLE admins ADD COLUMN IF NOT EXISTS can_manage_team BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS admin_permissions (
  admin_id          UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  section           permission_section NOT NULL,
  level             permission_level NOT NULL DEFAULT 'none',
  PRIMARY KEY (admin_id, section)
);

COMMIT;
