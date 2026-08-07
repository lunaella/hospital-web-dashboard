import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, getSelectedHospitalId, setSelectedHospitalId } from "../lib/apiClient";
import { useAuth } from "./AuthContext";

const HospitalContext = createContext(null);

// Backs the hospital switcher. `hospitalId` is either "all" (aggregate
// across every hospital) or a specific hospital's uuid; it's kept in sync
// with localStorage (see apiClient.js) so every api.get() call picks up the
// current selection automatically, and in React state so pages can put
// `hospitalId` in their own fetch effects' dependency arrays to refetch
// live the moment the switcher changes, without every page needing to read
// localStorage directly.
//
// GET /api/hospitals is already scoped server-side to whichever hospitals
// the logged-in admin is allowed to see (see hospitals.controller.js) — a
// super admin or team manager gets every hospital, a hospital-scoped admin
// (Team Access > which hospitals can they access) only gets theirs. This
// provider just has to make sure the *selected* hospitalId stays valid
// against whatever that scoped list turns out to be.
export function HospitalProvider({ children }) {
  const { profile, loading: authLoading } = useAuth();
  const [hospitalId, setHospitalIdState] = useState(() => getSelectedHospitalId());
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);

  const refreshHospitals = useCallback(async () => {
    try {
      const rows = await api.get("/api/hospitals");
      setHospitals(rows);
    } catch {
      // Leave whatever list was already loaded rather than clearing it on a
      // transient refresh failure (e.g. right after adding one, if the
      // network hiccups) — Settings.jsx surfaces its own error from the
      // create/update call itself.
    }
  }, []);

  const setHospitalId = useCallback((next) => {
    setSelectedHospitalId(next);
    setHospitalIdState(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/hospitals")
      .then((rows) => {
        if (!cancelled) setHospitals(rows);
      })
      .catch(() => {
        if (!cancelled) setHospitals([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Re-fetch whenever the logged-in admin changes (login/logout, or their
    // hospital scope was just edited by a team manager) — otherwise a
    // restricted admin who logs in right after an unrestricted one in the
    // same tab would keep seeing the previous admin's cached hospital list.
  }, [profile?.id]);

  // Once we know for sure whether this admin is hospital-restricted and
  // their (already-scoped) hospital list has loaded, make sure the current
  // selection is actually one of theirs — reset to their first hospital if
  // it's "all" (restricted admins don't get an aggregate view — see
  // requireHospitalScope) or a hospital they no longer have access to.
  useEffect(() => {
    if (authLoading || loading || !profile?.hospitalRestricted) return;
    const stillValid = hospitals.some((h) => h.id === hospitalId);
    if ((hospitalId === "all" || !stillValid) && hospitals.length > 0) {
      setHospitalId(hospitals[0].id);
    }
  }, [authLoading, loading, profile?.hospitalRestricted, hospitals, hospitalId, setHospitalId]);

  return (
    <HospitalContext.Provider
      value={{
        hospitalId,
        setHospitalId,
        hospitals,
        hospitalsLoading: loading,
        refreshHospitals,
        hospitalRestricted: profile?.hospitalRestricted ?? false,
      }}
    >
      {children}
    </HospitalContext.Provider>
  );
}

export function useHospital() {
  const ctx = useContext(HospitalContext);
  if (!ctx) throw new Error("useHospital must be used inside <HospitalProvider>");
  return ctx;
}
