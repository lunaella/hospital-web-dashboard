// Human-readable label for the sidebar badge under the RQ logo (see
// WebNav.jsx) — previously always read "ADMIN" no matter who was logged
// in, which didn't distinguish a super admin (full edit on every section,
// unrestricted across every hospital — see team.controller.js's
// shapeAdmin()) from a team member deliberately given only a sliver of
// access (e.g. dashboard-only).
//
// Section keys/labels mirror TeamAccessCard.jsx's SECTION_META, so the
// wording an admin sees about their own access matches what a super admin
// sees when granting it.
const SECTION_LABELS = {
  dashboard: "DASHBOARD",
  donor_management: "DONOR MGMT",
  reports: "REPORTS",
  broadcasts: "BROADCASTS",
  settings: "SETTINGS",
};

export function roleLabel({ isSuperAdmin, permissions } = {}) {
  if (isSuperAdmin) return "SUPER ADMIN";

  const entries = Object.entries(permissions || {});
  const accessible = entries.filter(([, level]) => level && level !== "none");

  // Not flagged super admin, but effectively functions like one day-to-day
  // (edit access almost everywhere) — a super admin can grant this to a
  // trusted delegate without handing over the unrestricted root account.
  const editCount = accessible.filter(([, level]) => level === "edit").length;
  if (entries.length > 0 && editCount >= entries.length - 1) return "ADMIN";

  if (accessible.length === 0) return "NO ACCESS";
  if (accessible.length === 1) {
    const [section] = accessible[0];
    return SECTION_LABELS[section] ?? "LIMITED ACCESS";
  }
  return "LIMITED ACCESS";
}
