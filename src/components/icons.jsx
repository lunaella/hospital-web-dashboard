// Shared inline SVG icon set.
//
// Every icon in this app used to be an <img src="https://www.figma.com/api/mcp/asset/...">
// reference — those URLs are ephemeral Figma design-tool session links, not a
// real asset host, so every single one of them 404s in an actual browser
// (the whole app rendered as broken-image placeholders). These components
// replace them with self-contained SVGs that need no network request at all.
//
// Convention: every icon accepts `className` for sizing/color (stroke uses
// currentColor unless a fixed brand color makes more sense) and forwards any
// other prop, so callers can size them with the same `w-4 h-4`-style classes
// the old <img> tags used.

function Base({ children, viewBox = "0 0 24 24", className, ...rest }) {
  return (
    <svg
      viewBox={viewBox}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function IconGrid(props) {
  return (
    <Base {...props}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </Base>
  );
}

export function IconUsers(props) {
  return (
    <Base {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c0-3.5 2.9-6 6.5-6s6.5 2.5 6.5 6" />
      <circle cx="17" cy="8.5" r="2.6" />
      <path d="M15.5 14.2c2.9.4 5 2.6 5 5.8" />
    </Base>
  );
}

export function IconChart(props) {
  return (
    <Base {...props}>
      <path d="M3 20V4M3 20h18" />
      <path d="M7.5 16v-4M12.5 16V8M17.5 16v-7" />
    </Base>
  );
}

export function IconGear(props) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </Base>
  );
}

export function IconChevronRight(props) {
  return (
    <Base viewBox="0 0 12 20" {...props}>
      <polyline points="2 2 10 10 2 18" />
    </Base>
  );
}

export function IconClock(props) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 2" />
    </Base>
  );
}

// Small filled alert marker used next to EMERGENCY priority labels.
export function IconAlert({ className, ...rest }) {
  return (
    <svg viewBox="0 0 16 14" className={className} fill="currentColor" {...rest}>
      <path d="M8 0.6 15.3 13H0.7L8 0.6Z" />
      <rect x="7.1" y="4.5" width="1.8" height="4.4" rx="0.9" fill="white" />
      <circle cx="8" cy="10.6" r="1" fill="white" />
    </svg>
  );
}

export function IconMegaphone(props) {
  return (
    <Base {...props}>
      <path d="M3 10v4a1 1 0 0 0 1 1h2l1.2 4.4a1 1 0 0 0 1 .6H10l-1-5" />
      <path d="M6 10 17 5v14L6 14V10Z" />
      <path d="M20 9.5v5" />
    </Base>
  );
}

export function IconDroplet(props) {
  return (
    <Base {...props}>
      <path d="M12 3c3.5 4.2 6 7.6 6 10.5a6 6 0 1 1-12 0C6 10.6 8.5 7.2 12 3Z" />
    </Base>
  );
}

export function IconCheckCircle(props) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="8 12.5 10.8 15.3 16 9.5" />
    </Base>
  );
}

export function IconCheck(props) {
  return (
    <Base viewBox="0 0 16 16" {...props}>
      <polyline points="3 8.5 6.3 12 13 4.5" />
    </Base>
  );
}

export function IconSearch(props) {
  return (
    <Base {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.3-4.3" />
    </Base>
  );
}

export function IconMapPin(props) {
  return (
    <Base {...props}>
      <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.4" />
    </Base>
  );
}

export function IconFilter(props) {
  return (
    <Base {...props}>
      <path d="M3 4.5h18l-7 8.2V19l-4 2v-8.3L3 4.5Z" />
    </Base>
  );
}

export function IconDownload(props) {
  return (
    <Base {...props}>
      <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4 19.5h16" />
    </Base>
  );
}

export function IconCalendar(props) {
  return (
    <Base {...props}>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9.5h18M8 3v3M16 3v3" />
    </Base>
  );
}

export function IconLock(props) {
  return (
    <Base viewBox="0 0 16 16" {...props}>
      <rect x="3" y="7" width="10" height="7" rx="1.6" />
      <path d="M5.2 7V5a2.8 2.8 0 0 1 5.6 0v2" />
    </Base>
  );
}

export function IconPlus(props) {
  return (
    <Base {...props}>
      <path d="M12 5v14M5 12h14" />
    </Base>
  );
}

export function IconShield(props) {
  return (
    <Base {...props}>
      <path d="M12 3.5 19 6.3v5.4c0 4.6-3 7.9-7 9.3-4-1.4-7-4.7-7-9.3V6.3L12 3.5Z" />
    </Base>
  );
}

export function IconInfoCircle(props) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconArrowUp(props) {
  return (
    <Base {...props}>
      <path d="M12 19V6M6 11l6-6 6 6" />
    </Base>
  );
}

export function IconArrowDown(props) {
  return (
    <Base {...props}>
      <path d="M12 5v13M6 13l6 6 6-6" />
    </Base>
  );
}

export function IconIdCard(props) {
  return (
    <Base {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="11" r="2" />
      <path d="M5.5 16c.6-1.6 1.8-2.4 3-2.4s2.4.8 3 2.4M14 10h5M14 13.5h5" />
    </Base>
  );
}

export function IconTerminal(props) {
  return (
    <Base {...props}>
      <rect x="3" y="4.5" width="18" height="14" rx="2" />
      <path d="M6.5 9.5 9.5 12l-3 2.5M12.5 14.5h5" />
    </Base>
  );
}

export function IconCpu(props) {
  return (
    <Base {...props}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <rect x="10" y="10" width="4" height="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.6 4.6l2 2M17.4 17.4l2 2M4.6 19.4l2-2M17.4 6.6l2-2" />
    </Base>
  );
}

export function IconMonitor(props) {
  return (
    <Base {...props}>
      <rect x="3" y="4.5" width="18" height="12" rx="1.8" />
      <path d="M8.5 20.5h7M12 16.5v4" />
    </Base>
  );
}

export function IconWifi(props) {
  return (
    <Base {...props}>
      <path d="M3.5 8.5a13 13 0 0 1 17 0" />
      <path d="M6.5 12.2a8.5 8.5 0 0 1 11 0" />
      <path d="M9.7 15.8a4 4 0 0 1 4.6 0" />
      <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconStethoscope(props) {
  return (
    <Base {...props}>
      <path d="M6 3v6a4.5 4.5 0 0 0 9 0V3" />
      <path d="M10.5 13v2a5 5 0 0 0 10 0v-2.3" />
      <circle cx="20.5" cy="10.5" r="1.6" />
    </Base>
  );
}

export function IconLogout(props) {
  return (
    <Base {...props}>
      <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </Base>
  );
}

export function IconX(props) {
  return (
    <Base {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Base>
  );
}
