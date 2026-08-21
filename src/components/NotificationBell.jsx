import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/apiClient";
import { connectRealtime } from "../lib/realtime";

// The bell used to be a static SVG with no onClick — decoration, not a
// feature. This wires it to the same broadcast data ViewBDPage shows,
// scoped to whichever hospital is currently selected (api.get() already
// carries that automatically), plus GET /api/appointments/recent so a donor
// booking or cancelling an appointment through the app also shows up here —
// no separate "notifications" backend concept exists for either, both just
// read off data that already exists instead of a parallel read/unread system.

const PRIORITY_META = {
  EMERGENCY: { label: "EMERGENCY", dot: "bg-[#9B1B20]", text: "text-[#9B1B20]" },
  URGENT: { label: "Urgent", dot: "bg-[#c9a227]", text: "text-black" },
  NORMAL: { label: "Routine", dot: "bg-[#5b8a52]", text: "text-black" },
};

const STATUS_LABEL = {
  OPEN: "Open",
  PARTIALLY_FULFILLED: "Partially Fulfilled",
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
};

// Still used for the small "N active" label inside the dropdown — a
// separate signal from the unread badge below (a broadcast can be long
// resolved and still be the thing you haven't looked at yet).
const UNRESOLVED_STATUSES = new Set(["OPEN", "PARTIALLY_FULFILLED"]);
const POLL_MS = 30000;
const MAX_SHOWN = 8;

// Persisted so "seen" survives page navigation (this component remounts on
// every route change) and browser refreshes, not just this mount.
const LAST_SEEN_KEY = "resq_notifications_last_seen";

function readLastSeen() {
  const raw = localStorage.getItem(LAST_SEEN_KEY);
  if (raw) return Number(raw);
  // First time this has ever run on this browser — don't retroactively
  // flag every broadcast that already existed before this feature shipped
  // as "unread". Only broadcasts created from here on count.
  const now = Date.now();
  localStorage.setItem(LAST_SEEN_KEY, String(now));
  return now;
}

// GET /api/requests is gated behind the 'broadcasts' section (see
// requests.routes.js) — an admin with no access there gets exactly this
// message back. That's not a real failure worth alarming them with in red;
// it just means this particular admin doesn't have broadcasts in their
// Team Access grant, so the dropdown says so plainly instead.
const PERMISSION_DENIED_MESSAGE = "You don't have permission to do that.";

function formatElapsed(seconds) {
  if (seconds == null) return "--";
  const mins = Math.floor(seconds / 60);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${String(mins % 60).padStart(2, "0")}m ago`;
}

// Appointment events (booked/cancelled) render distinctly from broadcasts —
// a calendar-style dot rather than the priority-colored one, and their own
// one-line label instead of ward/units text.
const APPOINTMENT_META = {
  booked: { label: "New Appointment", dot: "bg-[#3b7dd8]" },
  cancelled: { label: "Appointment Cancelled", dot: "bg-[#aaa4a0]" },
};

function formatApptTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState([]);
  const [appointmentEvents, setAppointmentEvents] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [lastSeenAt, setLastSeenAt] = useState(readLastSeen);
  const containerRef = useRef(null);
  // Snapshot of lastSeenAt taken the moment the dropdown opens, before it's
  // bumped to "now" — used only to mark which rows in *this* viewing were
  // the ones that just piled up, so opening the dropdown doesn't instantly
  // erase the "these are new" markers before you've actually seen them.
  const viewingSinceRef = useRef(lastSeenAt);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const rows = await api.get("/api/requests");
        if (!cancelled) {
          // /api/requests only returns seconds_open (relative), not an
          // absolute timestamp — reconstruct one so "created since I last
          // looked" can be compared against lastSeenAt.
          setRequests(rows.map((r) => ({ ...r, createdAtMs: Date.now() - (r.seconds_open ?? 0) * 1000 })));
          setLoadError(null);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      }

      // Kept as a separate try/catch from the broadcasts fetch above: a
      // permissions gap or a transient failure on one shouldn't blank out
      // the other, since they're unrelated data sources shown side by side.
      try {
        const events = await api.get("/api/appointments/recent");
        if (!cancelled) setAppointmentEvents(events);
      } catch {
        // Silently skipped — most likely this admin just doesn't have
        // donor_management access, same reasoning as broadcasts' own
        // permission-denied handling, but appointments aren't the bell's
        // primary content so it's not worth a second error message.
      }
    }

    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Real-time: a donor booking/cancelling through the app pushes here
  // immediately (server/src/realtime) instead of waiting up to POLL_MS for
  // the next scheduled fetch above. Prepended directly rather than
  // triggering a full re-fetch — the push payload already has everything
  // this dropdown shows for an appointment row.
  useEffect(() => {
    const disconnect = connectRealtime((event) => {
      if (event.type !== "appointment_booked" && event.type !== "appointment_cancelled") return;
      const eventType = event.type === "appointment_cancelled" ? "cancelled" : "booked";
      setAppointmentEvents((prev) => [
        {
          id: event.appointment.id,
          eventType,
          eventAt: new Date().toISOString(),
          donorName: event.appointment.donorName,
          bloodType: event.appointment.bloodType,
          scheduledAt: event.appointment.scheduledAt,
        },
        // Drop any earlier event for this same appointment+type so a
        // reconnect replaying the same push (or this event later also
        // arriving via the regular poll) doesn't duplicate the row.
        ...prev.filter((e) => !(e.id === event.appointment.id && e.eventType === eventType)),
      ]);
    });
    return disconnect;
  }, []);

  // Close on outside click — the only click-outside dropdown in the app so
  // far, so this is written locally rather than pulled from a shared hook
  // that doesn't exist yet.
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function toggleOpen() {
    setOpen((wasOpen) => {
      const willOpen = !wasOpen;
      if (willOpen) {
        // Opening = "viewed". Remember what counted as new up to this
        // point (for the row markers below), then immediately clear the
        // badge by bumping lastSeenAt to now — anything created after this
        // instant is what piles up toward the next unread count.
        viewingSinceRef.current = lastSeenAt;
        const now = Date.now();
        setLastSeenAt(now);
        localStorage.setItem(LAST_SEEN_KEY, String(now));
      }
      return willOpen;
    });
  }

  // Broadcasts and appointment events are two different shapes coming from
  // two different endpoints — normalized into one list here (kind +
  // eventAtMs) purely so they can share one chronological feed, one unseen
  // count, and one MAX_SHOWN cutoff instead of the dropdown juggling two
  // separate lists.
  const events = [
    ...requests.map((r) => ({ kind: "broadcast", eventAtMs: r.createdAtMs, data: r })),
    ...appointmentEvents.map((e) => ({
      kind: e.eventType === "cancelled" ? "appointment_cancelled" : "appointment_booked",
      eventAtMs: new Date(e.eventAt).getTime(),
      data: e,
    })),
  ].sort((a, b) => b.eventAtMs - a.eventAtMs);

  const unresolvedCount = requests.filter((r) => UNRESOLVED_STATUSES.has(r.status)).length;
  const unseenCount = events.filter((e) => e.eventAtMs > lastSeenAt).length;
  const shown = events.slice(0, MAX_SHOWN);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        className="relative w-[20px] h-[22px] flex items-center justify-center cursor-pointer"
        aria-label={unseenCount > 0 ? `Notifications (${unseenCount} unviewed)` : "Notifications"}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="black" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unseenCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-[3px] rounded-full bg-[#9B1B20] flex items-center justify-center font-poppins font-bold text-[9px] text-white leading-none">
            {unseenCount > 9 ? "9+" : unseenCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+12px)] w-[360px] bg-white rounded-[12px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.15)] border border-[#ececec] overflow-hidden z-50">
          <div className="px-5 py-4 border-b border-[#ececec] flex items-center justify-between">
            <span className="font-poppins font-semibold text-[15px] text-black">Notifications</span>
            {unresolvedCount > 0 && (
              <span className="font-poppins font-medium text-[12px] text-[#9B1B20]">{unresolvedCount} active</span>
            )}
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {loadError === PERMISSION_DENIED_MESSAGE ? (
              <p className="px-5 py-6 font-poppins text-[13px] text-[#808080]">
                You don't have access to broadcasts.
              </p>
            ) : loadError ? (
              <p className="px-5 py-6 font-poppins text-[13px] text-[#d70b07]">Couldn't load: {loadError}</p>
            ) : shown.length === 0 ? (
              <p className="px-5 py-6 font-poppins text-[13px] text-[#808080]">No notifications yet.</p>
            ) : (
              shown.map((item) => {
                const isNew = item.eventAtMs > viewingSinceRef.current;

                if (item.kind === "broadcast") {
                  const r = item.data;
                  const meta = PRIORITY_META[r.priority] ?? PRIORITY_META.NORMAL;
                  return (
                    <button
                      key={`broadcast-${r.id}`}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        navigate("/view-broadcasts", { state: { presetSearch: r.id } });
                      }}
                      className={`w-full text-left px-5 py-3 flex items-start gap-3 border-b border-[#f5f4f3] last:border-b-0 hover:bg-[#faf8f8] cursor-pointer ${
                        isNew ? "bg-[#fbf3f3]" : ""
                      }`}
                    >
                      <span className={`mt-1.5 w-[7px] h-[7px] rounded-full shrink-0 ${meta.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`font-poppins font-semibold text-[13px] ${meta.text}`}>
                            {meta.label} · {r.bloodType}
                          </span>
                          <span className="flex items-center gap-1.5 shrink-0">
                            {isNew && <span className="w-[6px] h-[6px] rounded-full bg-[#9B1B20]" aria-label="New" />}
                            <span className="font-poppins text-[11px] text-[#aaa4a0]">{formatElapsed(r.seconds_open)}</span>
                          </span>
                        </div>
                        <p className="mt-0.5 font-poppins text-[12px] text-[#808080] truncate">
                          {r.ward} · {r.unitsFulfilled}/{r.unitsNeeded} units · {STATUS_LABEL[r.status] ?? r.status}
                        </p>
                      </div>
                    </button>
                  );
                }

                // appointment_booked / appointment_cancelled
                const e = item.data;
                const meta = APPOINTMENT_META[e.eventType] ?? APPOINTMENT_META.booked;
                return (
                  <button
                    key={`appointment-${e.id}-${e.eventType}`}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      navigate("/donor-management");
                    }}
                    className={`w-full text-left px-5 py-3 flex items-start gap-3 border-b border-[#f5f4f3] last:border-b-0 hover:bg-[#faf8f8] cursor-pointer ${
                      isNew ? "bg-[#fbf3f3]" : ""
                    }`}
                  >
                    <span className={`mt-1.5 w-[7px] h-[7px] rounded-full shrink-0 ${meta.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-poppins font-semibold text-[13px] text-black">
                          {meta.label} · {e.bloodType}
                        </span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          {isNew && <span className="w-[6px] h-[6px] rounded-full bg-[#9B1B20]" aria-label="New" />}
                        </span>
                      </div>
                      <p className="mt-0.5 font-poppins text-[12px] text-[#808080] truncate">
                        {e.donorName} · {formatApptTime(e.scheduledAt)}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/view-broadcasts");
            }}
            className="w-full px-5 py-3 font-poppins font-semibold text-[13px] text-[#9B1B20] text-center border-t border-[#ececec] cursor-pointer hover:bg-[#faf8f8]"
          >
            View All Broadcasts
          </button>
        </div>
      )}
    </div>
  );
}
