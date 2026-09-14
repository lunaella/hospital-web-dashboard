import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, getToken } from "../lib/apiClient";

const AuthContext = createContext(null);

const EMPTY_PERMISSIONS = {
  dashboard: "none",
  donor_management: "none",
  reports: "none",
  broadcasts: "none",
  settings: "none",
};

// Backs Team Access: fetches the logged-in admin's own profile (including
// their permissions map from GET /api/auth/me) once on mount, so the sidebar
// nav, page guards, and action buttons across the whole app can all read
// "what can this admin see and do" from one place instead of each page
// fetching /me independently. Login.jsx calls refreshProfile() again right
// after a successful login (the initial fetch on app mount runs before a
// token exists yet, so it can't pick up who just logged in on its own).
export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  // True only when the /me fetch itself failed (network blip, backend
  // restart, etc.) — distinct from "the admin genuinely has no access".
  // SectionGuard/WebNav need this distinction: without it, a single
  // transient failure right after login permanently looks identical to a
  // real permissions restriction (everything defaults to EMPTY_PERMISSIONS
  // either way), and there was no way to tell the two apart or recover
  // short of a manual hard refresh.
  const [profileError, setProfileError] = useState(false);

  const refreshProfile = useCallback(async () => {
    if (!getToken()) {
      setProfile(null);
      setProfileError(false);
      setLoading(false);
      return;
    }
    // Retries with backoff before giving up — covers everything from a
    // one-off hiccup (dev server hot-reloading, a dropped connection) to a
    // backend that just resumed from a suspend (e.g. Render's Redis/Key
    // Value instance) and can stay briefly flaky for a few seconds after it
    // reports itself back up. A single 600ms retry used to be shorter than
    // that recovery window, so a login right after an outage could still
    // fail both attempts and strand the admin in a fully "restricted" UI
    // with no indication anything had gone wrong.
    const delaysMs = [500, 1200, 2500, 4000];
    for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
      try {
        const me = await api.get("/api/auth/me");
        setProfile(me);
        setProfileError(false);
        setLoading(false);
        return;
      } catch {
        if (attempt < delaysMs.length) await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
      }
    }
    setProfile(null);
    setProfileError(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const value = {
    profile,
    loading,
    profileError,
    refreshProfile,
    isSuperAdmin: profile?.isSuperAdmin ?? false,
    canManageTeam: profile?.canManageTeam ?? false,
    // A super admin or team manager still needs `permissions` to reflect
    // full edit access for section gating elsewhere (SectionGuard, nav) —
    // the backend's /me response already bakes that in for super admins,
    // so this is really just the not-logged-in-yet fallback.
    permissions: profile?.permissions ?? EMPTY_PERMISSIONS,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
