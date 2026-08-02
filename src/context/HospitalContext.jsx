import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, getSelectedHospitalId, setSelectedHospitalId } from "../lib/apiClient";

const HospitalContext = createContext(null);

// Backs the super admin's hospital switcher. `hospitalId` is either "all"
// (aggregate across every hospital) or a specific hospital's uuid; it's
// kept in sync with localStorage (see apiClient.js) so every api.get() call
// picks up the current selection automatically, and in React state so
// pages can put `hospitalId` in their own fetch effects' dependency arrays
// to refetch live the moment the switcher changes, without every page
// needing to read localStorage directly.
export function HospitalProvider({ children }) {
  const [hospitalId, setHospitalIdState] = useState(() => getSelectedHospitalId());
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);

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
  }, []);

  const setHospitalId = useCallback((next) => {
    setSelectedHospitalId(next);
    setHospitalIdState(next);
  }, []);

  return (
    <HospitalContext.Provider value={{ hospitalId, setHospitalId, hospitals, hospitalsLoading: loading }}>
      {children}
    </HospitalContext.Provider>
  );
}

export function useHospital() {
  const ctx = useContext(HospitalContext);
  if (!ctx) throw new Error("useHospital must be used inside <HospitalProvider>");
  return ctx;
}
