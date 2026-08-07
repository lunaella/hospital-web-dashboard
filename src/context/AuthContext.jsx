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

  const refreshProfile = useCallback(async () => {
    if (!getToken()) {
      setProfile(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.get("/api/auth/me");
      setProfile(me);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const value = {
    profile,
    loading,
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
