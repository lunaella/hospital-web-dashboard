// The Red Cross hotline (GET /api/settings/red-cross-contact), fetched once
// per page load and shared by every "Call Red Cross" button instead of each
// one asking the server separately. Settings calls setRedCrossPhone after
// the super admin edits it so the cached value doesn't go stale.
import { api } from "./apiClient";

let cached = null;
const listeners = new Set();

export function loadRedCrossPhone() {
  if (!cached) {
    cached = api
      .get("/api/settings/red-cross-contact")
      .then((res) => res.phone ?? null)
      .catch(() => {
        cached = null; // retry on the next mount
        return null;
      });
  }
  return cached;
}

export function setRedCrossPhone(phone) {
  cached = Promise.resolve(phone);
  for (const listener of listeners) listener(phone);
}

export function subscribeRedCrossPhone(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function telHref(phone) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
