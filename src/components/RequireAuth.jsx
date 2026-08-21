import { Navigate, useLocation } from "react-router-dom";
import { getToken } from "../lib/apiClient";

// Wraps a route that should never be reachable without a token at all —
// distinct from SectionGuard, which only gates *which* sections a logged-in
// admin can see. Without this, someone with no token (a shared link, a stale
// bookmark, a deep link opened cold in an in-app browser like Messenger's)
// hit SectionGuard directly: permissions default to "none" whether you're
// logged out or logged in with zero access, so they saw a confusing "Access
// Restricted — ask your team manager" message instead of landing on the
// actual login page.
export default function RequireAuth({ children }) {
  const location = useLocation();

  if (!getToken()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
