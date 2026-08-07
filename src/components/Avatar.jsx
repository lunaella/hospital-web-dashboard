// Donor/appointment "photo" placeholder. The app has no real donor photos —
// the previous version pointed avatars at a handful of Figma design-tool
// asset URLs (https://www.figma.com/api/mcp/asset/...), which are ephemeral
// session links, not a real image host, so every avatar rendered as a broken
// image in an actual browser. This renders initials on a deterministic
// color instead, so it never depends on the network and always looks
// intentional rather than broken.

const PALETTE = ["#ad2b21", "#8f404b", "#751423", "#5b6f8f", "#5b8a52", "#a3782f"];

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

export default function Avatar({ name, size = 45, className = "" }) {
  return (
    <div
      className={`rounded-full shrink-0 flex items-center justify-center font-poppins font-semibold text-white ${className}`}
      style={{ width: size, height: size, background: colorFor(name), fontSize: size * 0.36 }}
    >
      {initialsFor(name)}
    </div>
  );
}
