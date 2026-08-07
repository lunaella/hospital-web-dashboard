import { useLocation, useNavigate } from "react-router-dom";
import { Fragment, useEffect, useState } from "react";
import { api } from "../lib/apiClient";
import { useHospital } from "../context/HospitalContext";
import { IconAlert, IconClock } from "../components/icons";

const priorityTextClass = {
  EMERGENCY: "text-[#c26460]",
  URGENT: "text-black",
  NORMAL: "text-black",
};

function formatElapsed(seconds) {
  if (seconds == null) return "--";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${String(mins % 60).padStart(2, "0")}m`;
}

export default function ViewBDPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { hospitalId } = useHospital();
  // Reports' Fulfillment Log "View Broadcast Details" action lands here with
  // a specific request code to jump straight to, instead of just dropping
  // the admin on the unfiltered full list.
  const [search, setSearch] = useState(location.state?.presetSearch || "");
  const [broadcasts, setBroadcasts] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [unitsInput, setUnitsInput] = useState({});
  const [fulfillingId, setFulfillingId] = useState(null);
  const [fulfillError, setFulfillError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [notifications, setNotifications] = useState({}); // code -> { loading, error, summary, attempts }

  function mapBroadcast(r) {
    return {
      id: r.id,
      bloodType: r.bloodType,
      priority: r.priority,
      ward: r.ward,
      unitsNeeded: r.unitsNeeded,
      unitsFulfilled: r.unitsFulfilled,
      units: `${r.unitsFulfilled}/${r.unitsNeeded} Units`,
      percent: r.pct,
      status: r.status,
      time: formatElapsed(r.seconds_open),
    };
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await api.get("/api/requests");
        if (cancelled) return;
        setBroadcasts(data.map(mapBroadcast));
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [hospitalId]);

  // Adds units toward a broadcast's quota. The server auto-resolves the
  // request (status -> FULFILLED, rating computed) once the quota is met.
  async function handleFulfill(code) {
    const raw = unitsInput[code];
    const units = Number(raw);
    if (!Number.isInteger(units) || units < 1) {
      setFulfillError("Enter a whole number of units (1 or more).");
      return;
    }
    setFulfillingId(code);
    setFulfillError(null);
    try {
      const updated = await api.patch(`/api/requests/${code}/fulfill`, { units });
      setBroadcasts((prev) =>
        prev.map((b) =>
          b.id === code
            ? {
                ...b,
                unitsFulfilled: updated.unitsFulfilled,
                units: `${updated.unitsFulfilled}/${updated.unitsNeeded} Units`,
                percent: Math.round((updated.unitsFulfilled / updated.unitsNeeded) * 100),
                status: updated.status,
              }
            : b
        )
      );
      setUnitsInput((prev) => ({ ...prev, [code]: "" }));
    } catch (err) {
      setFulfillError(err.message);
    } finally {
      setFulfillingId(null);
    }
  }

  // Shows who was actually notified (real SMS/email delivery attempts) for
  // a broadcast, fetched on demand rather than for every row up front.
  async function toggleNotifications(code) {
    if (expandedId === code) {
      setExpandedId(null);
      return;
    }
    setExpandedId(code);
    if (notifications[code] && !notifications[code].error) return; // already loaded

    setNotifications((prev) => ({ ...prev, [code]: { loading: true, error: null, summary: null, attempts: [] } }));
    try {
      const data = await api.get(`/api/requests/${code}/notifications`);
      setNotifications((prev) => ({ ...prev, [code]: { loading: false, error: null, ...data } }));
    } catch (err) {
      setNotifications((prev) => ({ ...prev, [code]: { loading: false, error: err.message, summary: null, attempts: [] } }));
    }
  }

  const filtered = broadcasts.filter(
    (b) =>
      b.id.toLowerCase().includes(search.toLowerCase()) ||
      b.ward.toLowerCase().includes(search.toLowerCase()) ||
      b.bloodType.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative w-[1440px] min-h-[1024px] bg-white font-poppins">
      <div className="absolute left-[314px] top-0 w-[1086px] pb-16">
        {/* Page header */}
        <div className="relative h-[93px] border-b border-[#ececec] flex items-center justify-between px-8">
          <div>
            <h1 className="text-[26px] font-semibold text-[#3d1116]">All Broadcasts</h1>
            <p className="text-[13px] text-[#8a8a8a]">Live tracking of all blood donation broadcasts</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 bg-[#f5f5f5] rounded-full px-4 py-2.5 w-[280px]">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search donors or requests..."
                className="bg-transparent outline-none text-[13px] text-[#3d1116] placeholder:text-[#aaaaaa] w-full"
              />
            </div>
            <button
              type="button"
              aria-label="Notifications"
              className="w-[30px] h-[30px] rounded-full bg-[#f8f3f4] flex items-center justify-center text-[#8f404b] text-[15px]"
            >
              &#128276;
            </button>
          </div>
        </div>

        <div className="px-8 py-8">
          {loadError && (
            <p className="mb-4 text-[13px] font-semibold text-[#d70b07]">Couldn't load broadcasts: {loadError}</p>
          )}
          {fulfillError && (
            <p className="mb-4 text-[13px] font-semibold text-[#d70b07]">{fulfillError}</p>
          )}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[20px] font-semibold text-[#3d1116]">Blood Donation Broadcasts</h2>
              <p className="text-[13px] text-[#8a8a8a]">{filtered.length} requests across all wards</p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/new-broadcast", { state: { backgroundLocation: location } })}
              className="bg-[#ad2b22] text-white text-[13px] font-semibold px-5 py-2.5 rounded-full hover:bg-[#8f221b] transition-colors"
            >
              + New Broadcast
            </button>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[100px_90px_130px_130px_1fr_80px_190px] items-center px-6 py-3 text-[11px] font-semibold text-[#8a8a8a] tracking-wide uppercase">
            <span>Request ID</span>
            <span>Blood Type</span>
            <span>Priority Level</span>
            <span>Ward/Unit</span>
            <span>Quota Progress</span>
            <span className="text-right">Time Elapsed</span>
            <span className="text-right">Action</span>
          </div>

          {/* Rows */}
          <div className="border border-[#c0bfbf] rounded-[6px] overflow-hidden divide-y divide-[#ececec] shadow-[0px_3px_6px_0px_rgba(0,0,0,0.1)]">
            {filtered.map((b, i) => (
              <Fragment key={`${b.id}-${i}`}>
              <div
                className="grid grid-cols-[100px_90px_130px_130px_1fr_80px_190px] items-center px-6 py-4 bg-white"
              >
                <button
                  type="button"
                  onClick={() => toggleNotifications(b.id)}
                  className="text-left text-[13px] font-semibold text-[#8f404b] underline decoration-dotted cursor-pointer"
                  title="View donor notification status"
                >
                  {b.id}
                </button>

                <span className="inline-flex items-center justify-center w-[58px] h-[24px] bg-[#f8f3f4] border-2 border-[#ebdfe1] rounded-[10px] text-[11px] font-semibold text-[#8f404b]">
                  {b.bloodType}
                </span>

                <span className={`flex items-center gap-1.5 text-[11px] font-semibold ${priorityTextClass[b.priority]}`}>
                  {b.priority === "EMERGENCY" && <IconAlert className="w-[16px] h-[14px] text-[#c26460]" />}
                  {b.priority}
                </span>

                <span className="text-[11px] font-semibold text-black">{b.ward}</span>

                <div className="flex flex-col gap-1 pr-8">
                  <div className="flex items-center justify-between text-[7.5px] font-semibold">
                    <span className="text-black">{b.units}</span>
                    <span className="text-[#808080]">{b.percent}%</span>
                  </div>
                  <div className="h-[5px] w-full bg-[#d9d9d9] rounded-[10px] overflow-hidden">
                    <div
                      className="h-full bg-[#ad2b22] rounded-[10px]"
                      style={{ width: `${b.percent}%` }}
                    />
                  </div>
                </div>

                <span className="flex items-center justify-end gap-1 text-[12px] text-[#aaa4a0]">
                  <IconClock className="w-[13px] h-[13px]" />
                  {b.time}
                </span>

                <div className="flex items-center justify-end gap-1.5">
                  {b.status === "FULFILLED" || b.status === "CANCELLED" ? (
                    <span className="text-[11px] font-semibold text-[#8a8a8a] capitalize">
                      {b.status.toLowerCase()}
                    </span>
                  ) : (
                    <>
                      <input
                        type="number"
                        min="1"
                        value={unitsInput[b.id] ?? ""}
                        onChange={(e) => setUnitsInput((prev) => ({ ...prev, [b.id]: e.target.value }))}
                        placeholder="Units"
                        className="w-[56px] text-[12px] border border-[#d9d9d9] rounded-[4px] px-2 py-1 outline-none"
                      />
                      <button
                        type="button"
                        disabled={fulfillingId === b.id}
                        onClick={() => handleFulfill(b.id)}
                        className="text-[11px] font-semibold text-white bg-[#ad2b22] rounded-full px-3 py-1.5 hover:bg-[#8f221b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {fulfillingId === b.id ? "..." : "Add"}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {expandedId === b.id && (
                <div className="px-6 py-4 bg-[#fafafa]">
                  {notifications[b.id]?.loading && (
                    <p className="text-[12px] text-[#8a8a8a]">Loading notification status...</p>
                  )}
                  {notifications[b.id]?.error && (
                    <p className="text-[12px] text-[#d70b07]">Couldn't load notifications: {notifications[b.id].error}</p>
                  )}
                  {notifications[b.id]?.summary && (
                    <>
                      <p className="text-[12px] font-semibold text-[#3d1116] mb-2">
                        SMS: {notifications[b.id].summary.smsSent} sent
                        {notifications[b.id].summary.smsFailed > 0 && `, ${notifications[b.id].summary.smsFailed} failed`}
                        {" · "}
                        Email: {notifications[b.id].summary.emailSent} sent
                        {notifications[b.id].summary.emailFailed > 0 && `, ${notifications[b.id].summary.emailFailed} failed`}
                      </p>
                      {notifications[b.id].attempts.length === 0 ? (
                        <p className="text-[12px] text-[#8a8a8a]">
                          No eligible donors matched this blood type, or notifications haven't gone out yet.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto">
                          {notifications[b.id].attempts.map((a, idx) => (
                            <div key={idx} className="flex items-center justify-between text-[12px] px-2 py-1 bg-white rounded-[4px]">
                              <span className="text-black">
                                {a.donorName} <span className="text-[#aaa4a0]">({a.donorCode})</span>
                              </span>
                              <span className="text-[#808080] uppercase text-[10px] font-semibold">{a.channel}</span>
                              <span
                                className={`text-[11px] font-semibold ${a.status === "sent" ? "text-[#1e7d32]" : "text-[#b94842]"}`}
                                title={a.errorMessage || ""}
                              >
                                {a.status === "sent" ? "Sent" : `Failed${a.errorMessage ? `: ${a.errorMessage}` : ""}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              </Fragment>
            ))}

            {filtered.length === 0 && (
              <div className="px-6 py-10 text-center text-[13px] text-[#8a8a8a]">
                No broadcasts match your search.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
