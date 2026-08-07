import { pool } from "../db/pool.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getAllowedHospitalIds } from "../utils/hospitalScope.js";

const LEVEL_RANK = { none: 0, view: 1, edit: 2 };

// Gates a route behind a Team Access section permission. Super admins
// (clearance = FULL_ROOT_ACCESS_LEVEL_5) always pass — they never need rows
// in admin_permissions. Everyone else needs a row for this exact section
// whose level meets or exceeds minLevel; a missing row means 'none'.
//
// Must run after requireAuth (reads req.admin.id / req.admin.isSuperAdmin).
export function requireSection(section, minLevel = "view") {
  return asyncHandler(async (req, res, next) => {
    if (req.admin.isSuperAdmin) return next();

    const { rows } = await pool.query(
      "SELECT level FROM admin_permissions WHERE admin_id = $1 AND section = $2",
      [req.admin.id, section]
    );
    const level = rows[0]?.level ?? "none";

    if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) {
      return res.status(403).json({ error: "You don't have permission to do that." });
    }
    next();
  });
}

// Gates a route behind the requesting admin's assigned hospitals. Super
// admins and team managers always pass (they see every hospital). Everyone
// else: no assignment rows means unrestricted (pass through unchanged —
// this is what every pre-existing admin account has); if they do have
// assignment rows, the target hospital on this request must be one of them.
// 'all' is rejected for a scoped admin: there's no single query today that
// aggregates across an arbitrary subset of hospitals, so a scoped admin
// picks one specific hospital from their list at a time instead of an "all"
// option (see HospitalSwitcher, which hides "All Hospitals" for them).
//
// By default the target hospital is read straight off the request
// (query.hospitalId for GETs, body.hospitalId for POST/PATCH — matching how
// the frontend already sends it). Some actions instead identify their
// target by its own id/code (e.g. "update appointment :id") with no
// hospitalId anywhere on the request — for those, pass an async
// `resolveHospitalId(req)` that looks up the target row's hospital_id
// itself.
//
// Must run after requireAuth.
export function requireHospitalScope(resolveHospitalId) {
  return asyncHandler(async (req, res, next) => {
    if (req.admin.isSuperAdmin || req.admin.canManageTeam) return next();

    const allowed = await getAllowedHospitalIds(req.admin.id);
    if (allowed.length === 0) return next(); // unrestricted

    const requestedHospitalId = resolveHospitalId
      ? await resolveHospitalId(req)
      : req.query.hospitalId ?? req.body?.hospitalId;

    if (!requestedHospitalId || requestedHospitalId === "all" || !allowed.includes(requestedHospitalId)) {
      return res.status(403).json({ error: "Select one of your assigned hospitals." });
    }
    next();
  });
}

// Gates the Team Access endpoints themselves: only the super admin, or
// someone the super admin has explicitly delegated team management to via
// admins.can_manage_team, may view/add/edit/remove other admin accounts.
export function requireTeamManager(req, res, next) {
  if (req.admin.isSuperAdmin || req.admin.canManageTeam) return next();
  return res.status(403).json({ error: "Only the super admin or a delegated team manager can do that." });
}
