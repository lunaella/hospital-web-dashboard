// Resolves a client IP to a human-readable region for the Settings page's
// "Last login from {region}" line. Uses ip-api.com's free, no-API-key JSON
// endpoint — fine for this system's traffic volume (well under its rate
// limit), not something to lean on for a high-traffic production service.
//
// Loopback/private IPs (the normal case for local dev — 127.0.0.1, ::1,
// 192.168.x.x, etc.) can't be geolocated by definition, so those are
// short-circuited to "Local Network" without ever making a network call.
const LOOKUP_TIMEOUT_MS = 3000;
const LOOKUP_URL = "http://ip-api.com/json";

function normalizeIp(ip) {
  if (!ip) return null;
  // Express reports IPv4-mapped IPv6 addresses as "::ffff:1.2.3.4".
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

function isPrivateOrLoopback(ip) {
  if (ip === "::1" || ip === "127.0.0.1" || ip === "localhost") return true;
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) // link-local
  );
}

export async function resolveRegion(rawIp) {
  const ip = normalizeIp(rawIp);
  if (!ip) return null;
  if (isPrivateOrLoopback(ip)) return "Local Network";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const res = await fetch(`${LOOKUP_URL}/${ip}?fields=status,message,city,regionName,country`, {
      signal: controller.signal,
    });
    const data = await res.json();
    if (data.status !== "success") return null;

    return [data.city, data.regionName, data.country].filter(Boolean).join(", ") || null;
  } catch {
    // Network unreachable, API down, timed out, etc. — the login itself
    // must never fail because of this, so just fall back to no region.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
