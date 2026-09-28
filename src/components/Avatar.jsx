// Donor/appointment photo. Donors can upload a real profile photo (stored
// server-side as donors.photo, served publicly at GET /api/donor-photos/:id
// — see mediaUrl.js) — when the API includes a photoUrl for a given donor,
// this renders it. Otherwise (no upload yet, or the image fails to load —
// e.g. a stale/broken URL) it falls back to initials on a deterministic
// color, so it never depends on the network and always looks intentional
// rather than broken.

import { useState } from "react";

const PALETTE = ["#9B1B20", "#8f404b", "#751423", "#5b6f8f", "#5b8a52", "#a3782f"];

function colorFor(seed) {
  const s = seed || "?";
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function initialsFor(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

export default function Avatar({ name, photoUrl, size = 45, className = "" }) {
  const [failed, setFailed] = useState(false);

  if (photoUrl && !failed) {
    return (
      <img
        src={photoUrl}
        alt={name || "Donor photo"}
        onError={() => setFailed(true)}
        className={`rounded-full shrink-0 object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={`rounded-full shrink-0 flex items-center justify-center font-poppins font-semibold text-white ${className}`}
      style={{ width: size, height: size, background: colorFor(name), fontSize: size * 0.36 }}
    >
      {initialsFor(name)}
    </div>
  );
}
