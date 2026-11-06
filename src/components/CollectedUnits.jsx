import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/apiClient";
import { connectRealtime } from "../lib/realtime";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

// Blood collected at this hospital that hasn't been issued yet
// (server/src/controllers/donationUnits.controller.js). Recording a donation
// only creates a "collected" unit; it reaches inventory when staff release
// it after testing (with the lab's blood typing), and counts toward a
// request only when a released unit is issued to that request.
export default function CollectedUnits({ hospitalId, onMessage }) {
  const [units, setUnits] = useState([]);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [labType, setLabType] = useState({}); // unitId -> chosen lab blood type
  const [issueTo, setIssueTo] = useState({}); // unitId -> chosen request code
  const [discarding, setDiscarding] = useState(null); // {id, reason}

  const load = useCallback(async () => {
    try {
      const data = await api.get("/api/donation-units?status=collected,released");
      setUnits(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
    // Open requests for the Issue dropdown. Staff without Broadcasts access
    // can still issue to the request the unit was credited to.
    try {
      const reqs = await api.get("/api/requests");
      setRequests(reqs.filter((r) => r.status === "OPEN" || r.status === "PARTIALLY_FULFILLED"));
    } catch {
      setRequests([]);
    }
  }, []);

  useEffect(() => {
    load();
    const disconnect = connectRealtime((event) => {
      if (!["appointment_completed", "inventory_updated", "broadcast_updated"].includes(event.type)) return;
      if (hospitalId !== "all" && event.hospitalId && event.hospitalId !== hospitalId) return;
      load();
    });
    return disconnect;
  }, [hospitalId, load]);

  async function run(unitId, action, body, successMessage) {
    setBusyId(unitId);
    try {
      const result = await api.post(`/api/donation-units/${unitId}/${action}`, body);
      onMessage?.({ type: "success", message: successMessage(result) });
      await load();
    } catch (err) {
      onMessage?.({ type: "error", message: err.message });
    } finally {
      setBusyId(null);
    }
  }

  const collected = units.filter((u) => u.status === "collected");
  const released = units.filter((u) => u.status === "released");

  return (
    <section className="bg-white rounded-[10px] border border-[#ececec] shadow-[0px_6px_4px_0px_rgba(0,0,0,0.05),0px_3px_3px_0px_rgba(0,0,0,0.09)] p-6">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-[17px] font-semibold text-black">Collected Units</h2>
        <button type="button" onClick={load} className="text-[12px] font-medium text-[#9B1B20] hover:underline cursor-pointer">
          Refresh
        </button>
      </div>
      <p className="text-[12px] text-[#808080] mb-4">
        A recorded donation is not usable blood yet. Release a unit after it passes testing to add it to inventory, then
        issue it to a request to count it toward that request.
      </p>
      {error && <p className="text-[13px] text-[#d70b07] mb-3">Couldn't load units: {error}</p>}

      <div className="grid grid-cols-2 gap-6">
        <div>
          <h3 className="text-[12px] font-semibold text-[#8a8a8a] tracking-wide uppercase mb-2">
            Awaiting testing ({collected.length})
          </h3>
          {collected.length === 0 && <p className="text-[13px] text-[#aaa4a0]">No units awaiting testing.</p>}
          <ul className="space-y-2">
            {collected.map((u) => (
              <li key={u.id} className="border border-[#f1dddc] bg-[#fbf8f8] rounded-[8px] p-3 text-[13px]">
                <div className="flex justify-between">
                  <span className="font-semibold">{u.unitCode}</span>
                  <span className="text-[#808080]">{new Date(u.collectedAt).toLocaleString()}</span>
                </div>
                <p className="text-[#555]">
                  {u.donorName ?? "Deleted donor"} · on file: {u.bloodType ?? "unknown"}
                  {u.creditedRequestCode ? ` · responded to ${u.creditedRequestCode}` : ""}
                </p>
                {u.screeningOverride && (
                  <p className="text-[11px] text-[#8a5a00]">Recorded with a screening override: {u.screeningNote}</p>
                )}
                {discarding?.id === u.id ? (
                  <div className="flex gap-2 mt-2">
                    <input
                      autoFocus
                      value={discarding.reason}
                      onChange={(e) => setDiscarding({ id: u.id, reason: e.target.value })}
                      placeholder="Reason (e.g. reactive on TTI screening)"
                      className="flex-1 border border-[#d9d9d9] rounded-[4px] px-2 h-[28px] text-[12px]"
                    />
                    <button
                      type="button"
                      disabled={busyId === u.id || !discarding.reason.trim()}
                      onClick={() =>
                        run(u.id, "discard", { reason: discarding.reason }, (r) => `${r.unitCode} discarded.`).then(() =>
                          setDiscarding(null)
                        )
                      }
                      className="h-[28px] px-3 rounded-[4px] bg-[#d70b07] text-white text-[12px] disabled:opacity-50 cursor-pointer"
                    >
                      Discard
                    </button>
                    <button type="button" onClick={() => setDiscarding(null)} className="text-[12px] text-[#808080] cursor-pointer">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-2">
                    <label className="text-[12px] text-[#808080]" htmlFor={`lab-${u.id}`}>
                      Lab typing
                    </label>
                    <select
                      id={`lab-${u.id}`}
                      value={labType[u.id] ?? u.bloodType ?? ""}
                      onChange={(e) => setLabType((prev) => ({ ...prev, [u.id]: e.target.value }))}
                      className="border border-[#d9d9d9] rounded-[4px] h-[28px] text-[12px] px-1"
                    >
                      <option value="" disabled>
                        Select
                      </option>
                      {BLOOD_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={busyId === u.id || !(labType[u.id] ?? u.bloodType)}
                      onClick={() =>
                        run(
                          u.id,
                          "release",
                          { bloodType: labType[u.id] ?? u.bloodType },
                          (r) =>
                            `${r.unitCode} released to inventory as ${r.bloodType}.` +
                            (r.bloodTypeCorrected ? " The donor's blood type on file was corrected to match the lab." : "")
                        )
                      }
                      className="h-[28px] px-3 rounded-[4px] bg-[#9B1B20] text-white text-[12px] disabled:opacity-50 cursor-pointer"
                    >
                      Passed testing · Release
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscarding({ id: u.id, reason: "" })}
                      className="h-[28px] px-3 rounded-[4px] border border-[#d9d9d9] text-[12px] text-[#808080] cursor-pointer"
                    >
                      Discard
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-[12px] font-semibold text-[#8a8a8a] tracking-wide uppercase mb-2">
            Released, in inventory ({released.length})
          </h3>
          {released.length === 0 && <p className="text-[13px] text-[#aaa4a0]">No released units waiting to be issued.</p>}
          <ul className="space-y-2">
            {released.map((u) => {
              const matching = requests.filter((r) => r.bloodType === u.bloodType);
              const chosen = issueTo[u.id] ?? u.creditedRequestCode ?? matching[0]?.id ?? "";
              return (
                <li key={u.id} className="border border-[#e3e3e3] rounded-[8px] p-3 text-[13px]">
                  <div className="flex justify-between">
                    <span className="font-semibold">
                      {u.unitCode} · {u.bloodType}
                    </span>
                    <span className="text-[#808080]">released {new Date(u.releasedAt).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <label className="text-[12px] text-[#808080]" htmlFor={`issue-${u.id}`}>
                      Issue to
                    </label>
                    <select
                      id={`issue-${u.id}`}
                      value={chosen}
                      onChange={(e) => setIssueTo((prev) => ({ ...prev, [u.id]: e.target.value }))}
                      className="border border-[#d9d9d9] rounded-[4px] h-[28px] text-[12px] px-1 max-w-[220px]"
                    >
                      {!chosen && <option value="">No open {u.bloodType} request</option>}
                      {u.creditedRequestCode && !matching.some((r) => r.id === u.creditedRequestCode) && (
                        <option value={u.creditedRequestCode}>{u.creditedRequestCode}</option>
                      )}
                      {matching.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.id} · {r.ward} · {r.unitsFulfilled}/{r.unitsNeeded}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={busyId === u.id || !chosen}
                      onClick={() =>
                        run(
                          u.id,
                          "issue",
                          { requestCode: chosen },
                          (r) =>
                            `${r.unitCode} issued to ${r.request.requestCode} (${r.request.unitsFulfilled}/${r.request.unitsNeeded}).`
                        )
                      }
                      className="h-[28px] px-3 rounded-[4px] bg-[#9B1B20] text-white text-[12px] disabled:opacity-50 cursor-pointer"
                    >
                      Issue
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
