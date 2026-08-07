// Shared between team.controller.js (managing other admins' access) and
// auth.controller.js's /me endpoint (reporting the logged-in admin's own
// access), so the two never drift out of sync with each other or with the
// permission_section/permission_level Postgres enums in schema.sql.
export const SECTIONS = ["dashboard", "donor_management", "reports", "broadcasts", "settings"];
export const LEVELS = ["none", "view", "edit"];

export function emptyPermissions() {
  return Object.fromEntries(SECTIONS.map((s) => [s, "none"]));
}
