import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/apiClient";
import { connectRealtime } from "../lib/realtime";
import { playAlertSound, unlockAlertSound } from "../lib/alertSound";
import { IconAlert } from "./icons";

// Super admin only (rendered by AppShell). The Red Cross won't sit
// watching a dashboard, so a hospital's broadcast waiting on their
// approval has to come to them, the way a phone call would:
//   - a bar pinned to the top of every page while anything is pending,
//     with Approve / Reject / Call hospital right there (no need to switch
//     to that hospital first);
//   - an alert sound, scaled by priority (alertSound.js), that repeats
//     while an EMERGENCY or URGENT one is still waiting, until silenced;
//   - a desktop notification (if allowed), which also reaches them when
//     this tab is in the background or minimized;
//   - the pending count in the browser tab title.

const POLL_MS = 30000;
// How often an unreviewed request rings again. NORMAL only alerts once.
const REMIND_MS = { EMERGENCY: 30000, URGENT: 120000 };
const PRIORITY_RANK = { EMERGENCY: 0, URGENT: 1, NORMAL: 2 };
const NOTIFY_PROMPT_DISMISSED_KEY = "resq_desktop_alerts_prompt_dismissed";

const PRIORITY_STYLE = {
  EMERGENCY: "text-[#9B1B20]",
  URGENT: "text-[#8a5a00]",
  NORMAL: "text-[#3d3d3d]",
};

function formatWaiting(seconds) {
  const mins = Math.floor((seconds ?? 0) / 60);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m waiting`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m waiting`;
}

function notificationPermission() {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

function readPromptDismissed() {
  try {
    return localStorage.getItem(NOTIFY_PROMPT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function showDesktopNotification(request) {
  if (notificationPermission() !== "granted") return;
  try {
    const n = new Notification(`${request.priority} blood request awaiting approval`, {
      body: `${request.hospitalName ?? "A hospital"} needs ${request.unitsNeeded} unit${request.unitsNeeded === 1 ? "" : "s"} of ${request.bloodType} (${request.ward}).`,
      tag: request.id,
      requireInteraction: request.priority === "EMERGENCY",
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker —
    // the sound and the pinned bar still cover it.
  }
}

export default function PendingApprovalAlerts() {
  const [pending, setPending] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [silenced, setSilenced] = useState(false);
  const [permission, setPermission] = useState(notificationPermission);
  const [promptDismissed, setPromptDismissed] = useState(readPromptDismissed);
  const [reviewingId, setReviewingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionError, setActionError] = useState(null);
  // Request codes already alerted for, so a poll or a reconnect doesn't
  // ring again for the same request. null until the first load — requests
  // already waiting when the page opens don't ring as "new" (the reminder
  // timer below still rings for an EMERGENCY/URGENT one).
  const seenIdsRef = useRef(null);
  const lastRungRef = useRef({});

  const load = useCallback(async () => {
    let rows;
    try {
      rows = await api.get("/api/requests/pending");
    } catch {
      return; // keep showing the last known list; the next poll retries
    }
    const firstLoad = seenIdsRef.current === null;
    const seen = seenIdsRef.current ?? new Set();
    const fresh = firstLoad ? [] : rows.filter((r) => !seen.has(r.id));
    seenIdsRef.current = new Set(rows.map((r) => r.id));
    setPending(rows);

    if (fresh.length > 0) {
      const mostUrgent = [...fresh].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])[0];
      playAlertSound(mostUrgent.priority);
      const now = Date.now();
      for (const r of fresh) {
        lastRungRef.current[r.id] = now;
        showDesktopNotification(r);
      }
      setSilenced(false); // a new request always rings, even after "Silence"
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_MS);
    const disconnect = connectRealtime((event) => {
      if (event.type === "broadcast_pending_approval" || event.type === "broadcast_reviewed") load();
    });
    return () => {
      clearInterval(interval);
      disconnect();
    };
  }, [load]);

  useEffect(() => {
    window.addEventListener("pointerdown", unlockAlertSound, { once: true });
    window.addEventListener("keydown", unlockAlertSound, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAlertSound);
      window.removeEventListener("keydown", unlockAlertSound);
    };
  }, []);

  // Keeps ringing for EMERGENCY/URGENT requests nobody has acted on yet.
  useEffect(() => {
    if (silenced) return;
    const timer = setInterval(() => {
      const now = Date.now();
      const due = pending.filter((r) => {
        const every = REMIND_MS[r.priority];
        if (!every) return false;
        const last = lastRungRef.current[r.id] ?? 0;
        return now - last >= every;
      });
      if (due.length === 0) return;
      due.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
      playAlertSound(due[0].priority);
      for (const r of due) lastRungRef.current[r.id] = now;
    }, 5000);
    return () => clearInterval(timer);
  }, [pending, silenced]);

  useEffect(() => {
    const base = "RESQ Portal";
    document.title = pending.length > 0 ? `(${pending.length}) Pending approval · ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [pending.length]);

  async function enableDesktopAlerts() {
    if (typeof Notification === "undefined") return;
    try {
      setPermission(await Notification.requestPermission());
    } catch {
      setPermission(notificationPermission());
    }
  }

  function dismissPrompt() {
    setPromptDismissed(true);
    try {
      localStorage.setItem(NOTIFY_PROMPT_DISMISSED_KEY, "1");
    } catch {
      // per-browser convenience only
    }
  }

  async function review(code, action) {
    setReviewingId(code);
    setActionError(null);
    try {
      await api.post(`/api/requests/${code}/${action}`, action === "reject" ? { reason: rejectReason } : {});
      setRejectingId(null);
      setRejectReason("");
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setReviewingId(null);
    }
  }

  const showPrompt = permission === "default" && !promptDismissed;
  if (pending.length === 0 && !showPrompt) return null;

  if (pending.length === 0) {
    return (
      <div className="ml-[296px] w-[1144px] h-[40px] px-10 flex items-center justify-between bg-[#f6f5f4] border-b border-[#ececec] font-poppins">
        <span className="text-[12px] font-semibold text-[#808080]">
          Turn on desktop alerts so a hospital's broadcast reaches you even when this tab isn't open in front of you.
        </span>
        <span className="flex items-center gap-3">
          <button
            type="button"
            onClick={enableDesktopAlerts}
            className="text-[12px] font-semibold text-white bg-[#9B1B20] rounded-full px-4 py-1 hover:bg-[#8B1218] cursor-pointer"
          >
            Turn on desktop alerts
          </button>
          <button type="button" onClick={dismissPrompt} className="text-[12px] font-semibold text-[#808080] cursor-pointer">
            Not now
          </button>
        </span>
      </div>
    );
  }

  const hasEmergency = pending.some((r) => r.priority === "EMERGENCY");

  return (
    <div
      className={`ml-[296px] w-[1144px] font-poppins border-b ${
        hasEmergency ? "bg-[#fbeeec] border-[#e9c3c1]" : "bg-[#fff7e6] border-[#f0d9a8]"
      }`}
    >
      <div className="h-[48px] px-10 flex items-center justify-between">
        <button type="button" onClick={() => setExpanded((v) => !v)} className="flex items-center gap-2 cursor-pointer">
          <IconAlert className={`w-[17px] h-[15px] ${hasEmergency ? "text-[#9B1B20] animate-pulse" : "text-[#8a5a00]"}`} />
          <span className={`text-[14px] font-bold ${hasEmergency ? "text-[#9B1B20]" : "text-[#8a5a00]"}`}>
            Pending Approvals ({pending.length})
          </span>
          <span className="text-[12px] font-semibold text-[#808080]">
            {hasEmergency ? "· includes an EMERGENCY · donors aren't notified until you approve" : "· donors aren't notified until you approve"}
          </span>
          <span className="text-[12px] font-semibold text-[#9B1B20] underline ml-1">{expanded ? "Hide" : "Review"}</span>
        </button>
        <span className="flex items-center gap-4">
          {permission === "default" && (
            <button type="button" onClick={enableDesktopAlerts} className="text-[12px] font-semibold text-[#9B1B20] cursor-pointer">
              Turn on desktop alerts
            </button>
          )}
          {!silenced && pending.some((r) => REMIND_MS[r.priority]) && (
            <button
              type="button"
              onClick={() => setSilenced(true)}
              className="text-[12px] font-semibold text-[#808080] cursor-pointer"
              title="Stop the repeating alert sound until a new request comes in"
            >
              Silence
            </button>
          )}
        </span>
      </div>

      {expanded && (
        <div className="px-10 pb-4 flex flex-col gap-2">
          {actionError && <p className="text-[12px] font-semibold text-[#d70b07]">{actionError}</p>}
          {pending.map((r) => (
            <div key={r.id} className="bg-white rounded-[8px] border border-[#ececec] px-4 py-2.5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`text-[12px] font-bold w-[78px] shrink-0 ${PRIORITY_STYLE[r.priority]}`}>{r.priority}</span>
                  <span className="inline-flex items-center justify-center w-[44px] h-[22px] bg-[#f8f3f4] border-2 border-[#ebdfe1] rounded-[8px] text-[11px] font-semibold text-[#9B1B20] shrink-0">
                    {r.bloodType}
                  </span>
                  <span className="text-[13px] font-semibold text-black truncate">
                    {r.hospitalName} · {r.unitsNeeded} unit{r.unitsNeeded === 1 ? "" : "s"} · {r.ward}
                  </span>
                  <span className="text-[11px] text-[#aaa4a0] shrink-0">
                    {r.id} · {formatWaiting(r.secondsWaiting)}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.hospitalPhone ? (
                    <a
                      href={`tel:${r.hospitalPhone.replace(/[^\d+]/g, "")}`}
                      className="text-[11px] font-semibold text-[#3d1116] border border-[#d9d9d9] rounded-full px-3 py-1.5 hover:bg-[#f6f5f4]"
                      title={`Call ${r.hospitalName} at ${r.hospitalPhone}`}
                    >
                      Call hospital · {r.hospitalPhone}
                    </a>
                  ) : (
                    <span className="text-[11px] text-[#aaa4a0]" title="Add a contact number in Settings > Hospital Network">
                      No hospital number on file
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={reviewingId === r.id}
                    onClick={() => review(r.id, "approve")}
                    className="text-[11px] font-semibold text-white bg-[#1e7d32] rounded-full px-3 py-1.5 hover:bg-[#17652a] disabled:opacity-50 cursor-pointer"
                  >
                    {reviewingId === r.id && rejectingId !== r.id ? "..." : "Approve"}
                  </button>
                  <button
                    type="button"
                    disabled={reviewingId === r.id}
                    onClick={() => {
                      setRejectingId(rejectingId === r.id ? null : r.id);
                      setRejectReason("");
                    }}
                    className="text-[11px] font-semibold text-[#9B1B20] border border-[#9B1B20] rounded-full px-3 py-1.5 hover:bg-[#fbeeec] disabled:opacity-50 cursor-pointer"
                  >
                    Reject
                  </button>
                </div>
              </div>
              {rejectingId === r.id && (
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Reason for rejecting (optional, shown to the hospital)"
                    className="flex-1 text-[12px] border border-[#d9d9d9] rounded-[4px] px-3 py-1.5 outline-none"
                  />
                  <button
                    type="button"
                    disabled={reviewingId === r.id}
                    onClick={() => review(r.id, "reject")}
                    className="text-[11px] font-semibold text-white bg-[#9B1B20] rounded-full px-4 py-1.5 hover:bg-[#8B1218] disabled:opacity-50 cursor-pointer"
                  >
                    {reviewingId === r.id ? "..." : "Confirm Reject"}
                  </button>
                  <button type="button" onClick={() => setRejectingId(null)} className="text-[11px] font-semibold text-[#808080] cursor-pointer">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
