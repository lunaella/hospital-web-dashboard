// Shared helper for the super admin's hospital switcher: every list/
// aggregate endpoint that touches hospital-scoped tables (blood_inventory,
// blood_requests, appointments, donor_arrivals) accepts a ?hospitalId=<uuid>
// query param to scope to one hospital. Omitting it (or passing the literal
// string "all") aggregates across every hospital instead.
export function hospitalIdParam(req) {
  const raw = req.query.hospitalId;
  if (!raw || raw === "all") return null;
  return raw;
}
