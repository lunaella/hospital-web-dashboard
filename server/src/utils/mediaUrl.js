// Builds absolute URLs to the public GET /api/donor-photos/:id and
// GET /api/donor-signatures/:id routes (see app.js) from whatever host a
// request actually came in on, rather than a hardcoded/env-configured base
// — works the same in local dev, Render, and behind a custom domain
// without a separate env var (trust proxy is already enabled in app.js, so
// req.protocol/req.get("host") resolve to the real public host even behind
// Render's proxy). The ?v= timestamp is a cache-buster: the URL is
// otherwise identical before and after a donor replaces their photo/
// signature, and NetworkImage/browsers/the admin portal's <img> tags would
// otherwise keep showing the old cached bytes.
//
// Shared by donorPortal.controller.js (the donor's own profile) and
// donors.controller.js (the admin-facing donor list/profile), so both
// sides of the app build the exact same URL shape for the same donor.
export function buildPhotoUrl(req, donorId, photoUpdatedAt) {
  const base = `${req.protocol}://${req.get("host")}`;
  const version = photoUpdatedAt ? new Date(photoUpdatedAt).getTime() : 0;
  return `${base}/api/donor-photos/${donorId}?v=${version}`;
}

export function buildSignatureUrl(req, donorId, signatureUpdatedAt) {
  const base = `${req.protocol}://${req.get("host")}`;
  const version = signatureUpdatedAt ? new Date(signatureUpdatedAt).getTime() : 0;
  return `${base}/api/donor-signatures/${donorId}?v=${version}`;
}
