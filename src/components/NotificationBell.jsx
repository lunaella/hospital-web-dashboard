import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/apiClient";

// The bell used to be a static SVG with no onClick — decoration, not a
// feature. This wires it to the same broadcast data ViewBDPage shows,
// scoped to whichever hospital is currently selected (api.get() already
// carries that automatically). No separate "notifications" backend concept
// exists yet, and none is needed: a blood request broadcast *is* the
// notification-worthy event in this app, so the bell just surfaces the most
// recent ones instead of inventing a parallel read/unread system.

const PRIORITY_META = {
  EMERGENCY: { label: "EMERGENCY", dot: "bg-[#ad2b21]", text: "text-[#ad2b21]" },
  URGENT: { label: "Urgent", dot: "bg-[#c9a227]", text: "text-black" },
  NORMAL: { label: "Routine", dot: "bg-[#5b8a52]", text: "text-black" },
};

const STATUS_LABEL = {
  OPEN: "Open",
  PARTIALLY_FULFILLED: "Partially Fulfilled",
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
};

// Only OPEN/PARTIALLY_FULFILLED broadcasts still need someone's attention —
// FULFILLED and CANCELLED ones are resolved, so they don't count toward the
// badge even though they still show up in the list below.
const UNRESOLVED_STATUSES = new Set(["OPEN", "PARTIALLY_FULFILLED"]);
const POLL_MS = 30000;
const MAX_SHOWN = 8;

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

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const rows = await api.get("/api/requests");
        if (!cancelled) {
          setRequests(rows);
          setLoadError(null);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      }
    }

    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
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

  const unresolvedCount = requests.filter((r) => UNRESOLVED_STATUSES.has(r.status)).length;
  const shown = requests.slice(0, MAX_SHOWN);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative w-[20px] h-[22px] flex items-center justify-center cursor-pointer"
        aria-label={unresolvedCount > 0 ? `Notifications (${unresolvedCount} active broadcasts)` : "Notifications"}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="black" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unresolvedCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-[3px] rounded-full bg-[#ad2b21] flex items-center justify-center font-poppins font-bold text-[9px] text-white leading-none">
            {unresolvedCount > 9 ? "9+" : unresolvedCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+12px)] w-[360px] bg-white rounded-[12px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.15)] border border-[#ececec] overflow-hidden z-50">
          <div className="px-5 py-4 border-b border-[#ececec] flex items-center justify-between">
            <span className="font-poppins font-semibold text-[15px] text-black">Broadcasts</span>
            {unresolvedCount > 0 && (
              <span className="font-poppins font-medium text-[12px] text-[#ad2b21]">{unresolvedCount} active</span>
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
              <p className="px-5 py-6 font-poppins text-[13px] text-[#808080]">No broadcasts yet.</p>
            ) : (
              shown.map((r) => {
                const meta = PRIORITY_META[r.priority] ?? PRIORITY_META.NORMAL;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      navigate("/view-broadcasts", { state: { presetSearch: r.id } });
                    }}
                    className="w-full text-left px-5 py-3 flex items-start gap-3 border-b border-[#f5f4f3] last:border-b-0 hover:bg-[#faf8f8] cursor-pointer"
                  >
                    <span className={`mt-1.5 w-[7px] h-[7px] rounded-full shrink-0 ${meta.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-poppins font-semibold text-[13px] ${meta.text}`}>
                          {meta.label} · {r.bloodType}
                        </span>
                        <span className="font-poppins text-[11px] text-[#aaa4a0] shrink-0">
                          {formatElapsed(r.seconds_open)}
                        </span>
                      </div>
                      <p className="mt-0.5 font-poppins text-[12px] text-[#808080] truncate">
                        {r.ward} · {r.unitsFulfilled}/{r.unitsNeeded} units · {STATUS_LABEL[r.status] ?? r.status}
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
            className="w-full px-5 py-3 font-poppins font-semibold text-[13px] text-[#ad2b21] text-center border-t border-[#ececec] cursor-pointer hover:bg-[#faf8f8]"
          >
            View All Broadcasts
          </button>
        </div>
      )}
    </div>
  );
}
