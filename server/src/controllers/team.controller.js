import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { SECTIONS, LEVELS, emptyPermissions } from "../utils/permissionSections.js";

const HASH_ROUNDS = 12;

async function loadPermissionsMap(adminIds) {
  if (adminIds.length === 0) return {};
  const { rows } = await pool.query(
    "SELECT admin_id AS \"adminId\", section, level FROM admin_permissions WHERE admin_id = ANY($1)",
    [adminIds]
  );
  const map = Object.fromEntries(adminIds.map((id) => [id, emptyPermissions()]));
  for (const row of rows) {
    map[row.adminId][row.section] = row.level;
  }
  return map;
}

// The hospital(s) *the caller themselves* is assigned to — [] means
// unrestricted (a real super admin, or a "global" team manager with no
// hospital rows, same pre-existing case as any admin created before per-
// hospital team scoping existed). A team manager who *does* have specific
// hospital rows is a "hospital admin": someone a super admin scoped down to
// running Team Access for just their own hospital(s), not the whole org.
async function myHospitalIds(adminId) {
  const { rows } = await pool.query("SELECT hospital_id AS id FROM admin_hospital_assignments WHERE admin_id = $1", [
    adminId,
  ]);
  return rows.map((r) => r.id);
}

// Whether `targetAdminId` is assigned to at least one hospital in
// `callerHospitalIds` — used to gate update/delete for a hospital-scoped
// caller so they can only ever touch accounts within their own hospital(s).
async function sharesHospitalWith(targetAdminId, callerHospitalIds) {
  const { rows } = await pool.query(
    "SELECT 1 FROM admin_hospital_assignments WHERE admin_id = $1 AND hospital_id = ANY($2) LIMIT 1",
    [targetAdminId, callerHospitalIds]
  );
  return rows.length > 0;
}

// Empty array = unrestricted (every hospital) — same convention as the
// admin_hospital_assignments table itself.
async function loadHospitalIdsMap(adminIds) {
  if (adminIds.length === 0) return {};
  const { rows } = await pool.query(
    `SELECT admin_id AS "adminId", hospital_id AS "hospitalId" FROM admin_hospital_assignments WHERE admin_id = ANY($1)`,
    [adminIds]
  );
  const map = Object.fromEntries(adminIds.map((id) => [id, []]));
  for (const row of rows) map[row.adminId].push(row.hospitalId);
  return map;
}

function shapeAdmin(row, permissions, hospitalIds) {
  const isSuperAdmin = row.clearance === "FULL_ROOT_ACCESS_LEVEL_5";
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    clearance: row.clearance,
    isSuperAdmin,
    canManageTeam: row.canManageTeam,
    createdAt: row.createdAt,
    // Super admins bypass admin_permissions entirely and always have edit
    // access everywhere — reflect that in the payload so the UI can just
    // show "Full Access" instead of a permissions grid that would otherwise
    // misleadingly read "none" for a super admin with no stored rows.
    permissions: isSuperAdmin ? Object.fromEntries(SECTIONS.map((s) => [s, "edit"])) : permissions,
    // Same idea for hospital scope: super admins always see every hospital,
    // so this is always [] (unrestricted) for them regardless of what's
    // actually stored in admin_hospital_assignments.
    hospitalIds: isSuperAdmin ? [] : hospitalIds ?? [],
  };
}

function validatePermissions(input) {
  if (input == null) return {};
  if (typeof input !== "object") throw badRequest("permissions must be an object.");
  for (const [section, level] of Object.entries(input)) {
    if (!SECTIONS.includes(section)) throw badRequest(`Unknown section: ${section}.`);
    if (!LEVELS.includes(level)) throw badRequest(`Invalid level for ${section}: ${level}.`);
  }
  return input;
}

function validateHospitalIds(input) {
  if (input === undefined) return undefined; // not provided — leave assignments untouched (PATCH only)
  if (input === null) return [];
  if (!Array.isArray(input) || input.some((v) => typeof v !== "string")) {
    throw badRequest("hospitalIds must be an array of hospital ids.");
  }
  return input;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// GET /api/team — a real super admin (or a "global" team manager with no
// hospital assignment rows of their own — see myHospitalIds) sees the full
// roster, same as before. A hospital-scoped team manager only sees their
// own row plus admins assigned to at least one of their own hospital(s) —
// other hospitals' teams (and unrestricted accounts like the super admin)
// stay invisible to them, so "the team" a hospital admin sees really is
// just their hospital's team.
export const listTeam = asyncHandler(async (req, res) => {
  const callerHospitalIds = req.admin.isSuperAdmin ? [] : await myHospitalIds(req.admin.id);

  const { rows } =
    callerHospitalIds.length === 0
      ? await pool.query(
          `SELECT id, username, email, clearance, can_manage_team AS "canManageTeam", created_at AS "createdAt"
           FROM admins ORDER BY created_at ASC`
        )
      : await pool.query(
          `SELECT DISTINCT a.id, a.username, a.email, a.clearance, a.can_manage_team AS "canManageTeam", a.created_at AS "createdAt"
           FROM admins a
           LEFT JOIN admin_hospital_assignments aha ON aha.admin_id = a.id
           WHERE a.id = $1 OR aha.hospital_id = ANY($2)
           ORDER BY a.created_at ASC`,
          [req.admin.id, callerHospitalIds]
        );

  const ids = rows.map((r) => r.id);
  const [permissionsMap, hospitalIdsMap] = await Promise.all([loadPermissionsMap(ids), loadHospitalIdsMap(ids)]);
  res.json(rows.map((row) => shapeAdmin(row, permissionsMap[row.id], hospitalIdsMap[row.id])));
});

// POST /api/team — creates a new admin account with a super-admin- or
// team-manager-chosen temporary password and starting permissions. Only a
// real super admin (not just a delegated team manager) may grant
// can_manage_team or FULL_ROOT_ACCESS_LEVEL_5 to the new account — a
// delegate can staff the team but can't create more delegates or super
// admins, keeping a clear chain of authority.
export const createTeamMember = asyncHandler(async (req, res) => {
  const { username, email, tempPassword, canManageTeam, makeSuperAdmin } = req.body;
  const permissions = validatePermissions(req.body.permissions);
  let hospitalIds = validateHospitalIds(req.body.hospitalIds) ?? [];

  if (!username || !email || !tempPassword) {
    return res.status(400).json({ error: "username, email, and tempPassword are required." });
  }
  if (tempPassword.length < 8) {
    return res.status(400).json({ error: "Temporary password must be at least 8 characters." });
  }
  if ((canManageTeam || makeSuperAdmin) && !req.admin.isSuperAdmin) {
    return res.status(403).json({ error: "Only the super admin can grant team management or super admin access." });
  }

  // A hospital-scoped team manager can only ever staff their own
  // hospital(s) — whatever hospitalIds the request asked for is replaced
  // with the caller's own assignment, so there's no way to request a new
  // account scoped to (or unrestricted across) a hospital you don't
  // yourself administer. A real super admin, or a "global" team manager
  // with no hospital rows of their own, keeps choosing hospitalIds freely.
  if (!req.admin.isSuperAdmin) {
    const callerHospitalIds = await myHospitalIds(req.admin.id);
    if (callerHospitalIds.length > 0) hospitalIds = callerHospitalIds;
  }

  const passwordHash = await bcrypt.hash(tempPassword, HASH_ROUNDS);
  const clearance = makeSuperAdmin ? "FULL_ROOT_ACCESS_LEVEL_5" : "ADMIN";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let inserted;
    try {
      const { rows } = await client.query(
        `INSERT INTO admins (username, email, password_hash, clearance, can_manage_team)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, username, email, clearance, can_manage_team AS "canManageTeam", created_at AS "createdAt"`,
        [username, email, passwordHash, clearance, Boolean(canManageTeam)]
      );
      inserted = rows[0];
    } catch (err) {
      await client.query("ROLLBACK");
      if (err.code === "23505") {
        // Only username is unique now (see migration 020) — email is
        // meant to be shared across a hospital's whole team.
        return res.status(409).json({ error: "That username is already in use." });
      }
      throw err;
    }

    if (!makeSuperAdmin) {
      for (const section of SECTIONS) {
        const level = permissions[section] ?? "none";
        if (level === "none") continue; // no row needed; 'none' is the implicit default
        await client.query(
          `INSERT INTO admin_permissions (admin_id, section, level) VALUES ($1, $2, $3)`,
          [inserted.id, section, level]
        );
      }

      try {
        for (const hospitalId of hospitalIds) {
          await client.query(`INSERT INTO admin_hospital_assignments (admin_id, hospital_id) VALUES ($1, $2)`, [
            inserted.id,
            hospitalId,
          ]);
        }
      } catch (err) {
        await client.query("ROLLBACK");
        if (err.code === "23503") {
          return res.status(400).json({ error: "One of the selected hospitals doesn't exist." });
        }
        throw err;
      }
    }

    await client.query("COMMIT");
    const permissionsMap = await loadPermissionsMap([inserted.id]);
    const hospitalIdsMap = await loadHospitalIdsMap([inserted.id]);
    res.status(201).json(shapeAdmin(inserted, permissionsMap[inserted.id], hospitalIdsMap[inserted.id]));
  } finally {
    client.release();
  }
});

// PATCH /api/team/:id — updates an existing admin's email, permissions,
// team-manager delegation, super admin status, or resets their password.
// A delegate (can_manage_team but not a real super admin) can only touch
// ordinary accounts: not super admins, and can't grant super admin or
// team-manager status to anyone.
export const updateTeamMember = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { email, canManageTeam, makeSuperAdmin, resetPassword } = req.body;
  const permissions = validatePermissions(req.body.permissions);
  let hospitalIds = validateHospitalIds(req.body.hospitalIds); // undefined = leave assignments untouched

  const { rows: targetRows } = await pool.query(
    `SELECT id, username, email, clearance, can_manage_team AS "canManageTeam" FROM admins WHERE id = $1`,
    [id]
  );
  const target = targetRows[0];
  if (!target) return res.status(404).json({ error: "Admin not found." });

  const targetIsSuperAdmin = target.clearance === "FULL_ROOT_ACCESS_LEVEL_5";
  if (targetIsSuperAdmin && !req.admin.isSuperAdmin) {
    return res.status(403).json({ error: "Only the super admin can modify another super admin's account." });
  }

  // A hospital-scoped team manager can only touch accounts within their own
  // hospital(s) — anything else (another hospital's team, or an
  // unrestricted account like the super admin) 404s exactly like a
  // nonexistent id would, rather than a 403 that would confirm some other
  // hospital's team member exists. If they do send hospitalIds, it's
  // forced back to their own set — same reasoning as createTeamMember: no
  // way to reassign someone to a hospital you don't administer yourself.
  if (!req.admin.isSuperAdmin) {
    const callerHospitalIds = await myHospitalIds(req.admin.id);
    if (callerHospitalIds.length > 0) {
      const allowed = id === req.admin.id || (await sharesHospitalWith(id, callerHospitalIds));
      if (!allowed) return res.status(404).json({ error: "Admin not found." });
      if (hospitalIds !== undefined) hospitalIds = callerHospitalIds;
    }
  }

  if ((canManageTeam !== undefined || makeSuperAdmin !== undefined) && !req.admin.isSuperAdmin) {
    return res.status(403).json({ error: "Only the super admin can grant team management or super admin access." });
  }
  if (makeSuperAdmin === false && targetIsSuperAdmin) {
    const { rows: superAdmins } = await pool.query(
      "SELECT COUNT(*)::int AS count FROM admins WHERE clearance = 'FULL_ROOT_ACCESS_LEVEL_5'"
    );
    if (superAdmins[0].count <= 1) {
      return res.status(400).json({ error: "There must always be at least one super admin." });
    }
  }
  if (resetPassword !== undefined && resetPassword.length < 8) {
    return res.status(400).json({ error: "New temporary password must be at least 8 characters." });
  }

  const updates = [];
  const values = [];
  let paramIndex = 1;

  if (email !== undefined) {
    updates.push(`email = $${paramIndex++}`);
    values.push(email);
  }
  if (canManageTeam !== undefined) {
    updates.push(`can_manage_team = $${paramIndex++}`);
    values.push(Boolean(canManageTeam));
  }
  if (makeSuperAdmin !== undefined) {
    updates.push(`clearance = $${paramIndex++}`);
    values.push(makeSuperAdmin ? "FULL_ROOT_ACCESS_LEVEL_5" : "ADMIN");
  }
  if (resetPassword !== undefined) {
    updates.push(`password_hash = $${paramIndex++}`);
    values.push(await bcrypt.hash(resetPassword, HASH_ROUNDS));
  }

  try {
    if (updates.length > 0) {
      updates.push(`updated_at = now()`);
      values.push(id);
      await pool.query(`UPDATE admins SET ${updates.join(", ")} WHERE id = $${paramIndex}`, values);
    }

    for (const [section, level] of Object.entries(permissions)) {
      await pool.query(
        `INSERT INTO admin_permissions (admin_id, section, level) VALUES ($1, $2, $3)
         ON CONFLICT (admin_id, section) DO UPDATE SET level = $3`,
        [id, section, level]
      );
    }

    // hospitalIds undefined means the caller didn't touch hospital scope at
    // all — leave existing assignments alone. A super admin target never
    // has assignments that matter (they always bypass), so skip writing any
    // even if the caller sent some.
    if (hospitalIds !== undefined && !targetIsSuperAdmin) {
      await pool.query("DELETE FROM admin_hospital_assignments WHERE admin_id = $1", [id]);
      for (const hospitalId of hospitalIds) {
        await pool.query(`INSERT INTO admin_hospital_assignments (admin_id, hospital_id) VALUES ($1, $2)`, [
          id,
          hospitalId,
        ]);
      }
    }
  } catch (err) {
    // email is no longer unique (see migration 020), so this UPDATE (which
    // only ever touches email/can_manage_team/clearance/password_hash, none
    // else unique) shouldn't actually hit 23505 anymore — kept as a
    // defensive fallback rather than assumed unreachable.
    if (err.code === "23505") {
      return res.status(409).json({ error: "That update conflicts with an existing account." });
    }
    if (err.code === "23503") {
      return res.status(400).json({ error: "One of the selected hospitals doesn't exist." });
    }
    throw err;
  }

  const { rows: finalRows } = await pool.query(
    `SELECT id, username, email, clearance, can_manage_team AS "canManageTeam", created_at AS "createdAt"
     FROM admins WHERE id = $1`,
    [id]
  );
  const permissionsMap = await loadPermissionsMap([id]);
  const hospitalIdsMap = await loadHospitalIdsMap([id]);
  res.json(shapeAdmin(finalRows[0], permissionsMap[id], hospitalIdsMap[id]));
});

// DELETE /api/team/:id — removes an admin account entirely (cascades to
// their admin_permissions and admin_sessions rows). You can never remove
// your own account this way (avoids accidentally locking yourself out —
// use another team manager, or just edit your own permissions instead), and
// only a real super admin can remove another super admin, and never the
// last one.
export const deleteTeamMember = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (id === req.admin.id) {
    return res.status(400).json({ error: "You can't remove your own account." });
  }

  const { rows: targetRows } = await pool.query("SELECT clearance FROM admins WHERE id = $1", [id]);
  const target = targetRows[0];
  if (!target) return res.status(404).json({ error: "Admin not found." });

  const targetIsSuperAdmin = target.clearance === "FULL_ROOT_ACCESS_LEVEL_5";
  if (targetIsSuperAdmin) {
    if (!req.admin.isSuperAdmin) {
      return res.status(403).json({ error: "Only the super admin can remove another super admin." });
    }
    const { rows: superAdmins } = await pool.query(
      "SELECT COUNT(*)::int AS count FROM admins WHERE clearance = 'FULL_ROOT_ACCESS_LEVEL_5'"
    );
    if (superAdmins[0].count <= 1) {
      return res.status(400).json({ error: "There must always be at least one super admin." });
    }
  }

  // Same hospital-scoping as updateTeamMember: a hospital-scoped team
  // manager can only remove accounts within their own hospital(s).
  if (!req.admin.isSuperAdmin) {
    const callerHospitalIds = await myHospitalIds(req.admin.id);
    if (callerHospitalIds.length > 0 && !(await sharesHospitalWith(id, callerHospitalIds))) {
      return res.status(404).json({ error: "Admin not found." });
    }
  }

  await pool.query("DELETE FROM admins WHERE id = $1", [id]);
  res.status(204).send();
});
