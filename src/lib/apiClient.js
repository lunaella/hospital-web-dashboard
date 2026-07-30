// Thin fetch wrapper shared by every page: resolves the API base URL,
// attaches the stored auth token, parses JSON, and throws a normal Error
// with the server's message on non-2xx responses so callers can just
// try/catch instead of checking res.ok everywhere.

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
const TOKEN_KEY = "resq_admin_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
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
  get: (path) => apiFetch(path, { method: "GET" }),
  post: (path, data) => apiFetch(path, { method: "POST", body: data ? JSON.stringify(data) : undefined }),
  patch: (path, data) => apiFetch(path, { method: "PATCH", body: data ? JSON.stringify(data) : undefined }),
};
