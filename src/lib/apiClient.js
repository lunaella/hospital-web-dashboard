// Thin fetch wrapper shared by every page: resolves the API base URL,
// attaches the stored auth token, parses JSON, and throws a normal Error
// with the server's message on non-2xx responses so callers can just
// try/catch instead of checking res.ok everywhere.

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
const TOKEN_KEY = "resq_admin_token";
const HOSPITAL_KEY = "resq_selected_hospital";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// The super admin's hospital switcher: "all" (the default) aggregates
// across every hospital, or a specific hospital's id scopes every
// hospital-aware endpoint to just that one. Read directly from localStorage
// here (rather than threaded through every page's props) so every GET call
// picks up whichever hospital is currently selected without every page
// having to know about it individually — HospitalContext just keeps this
// value and React state in sync when the switcher changes.
export function getSelectedHospitalId() {
  return localStorage.getItem(HOSPITAL_KEY) || "all";
}

export function setSelectedHospitalId(hospitalId) {
  localStorage.setItem(HOSPITAL_KEY, hospitalId);
}

function withHospitalParam(path) {
  const hospitalId = getSelectedHospitalId();
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}hospitalId=${encodeURIComponent(hospitalId)}`;
}

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error("Could not reach the ResQ server. Is the API running?");
  }

  // No-content responses (e.g. logout) never carry a JSON body.
  const body = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(body?.error || `Request failed with status ${res.status}`);
  }
  return body;
}

export const api = {
  // Every GET automatically carries the currently-selected hospital. Create/
  // update calls that need a hospital (new broadcasts, new appointments)
  // pass hospitalId explicitly in the body instead, since which hospital a
  // new record belongs to is a real field on it, not just a view filter.
  get: (path) => apiFetch(withHospitalParam(path), { method: "GET" }),
  post: (path, data) => apiFetch(path, { method: "POST", body: data ? JSON.stringify(data) : undefined }),
  patch: (path, data) => apiFetch(path, { method: "PATCH", body: data ? JSON.stringify(data) : undefined }),
  delete: (path) => apiFetch(path, { method: "DELETE" }),
};

// Multipart file upload (CSV/XLSX data import) — deliberately bypasses
// apiFetch's JSON Content-Type default. A FormData body needs the browser to
// set its own multipart boundary, which it can only do if Content-Type is
// left unset entirely.
export async function apiUploadFile(path, formData) {
  const token = getToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, { method: "POST", body: formData, headers });
  } catch {
    throw new Error("Could not reach the ResQ server. Is the API running?");
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error || `Request failed with status ${res.status}`);
  }
  return body;
}
