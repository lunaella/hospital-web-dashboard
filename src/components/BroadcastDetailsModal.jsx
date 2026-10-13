// Full-detail popup for a single blood donation broadcast, opened by
// selecting a row on the All Broadcasts screen (ViewBDPage.jsx) — the row
// itself only has room for compact columns, this gives the admin a bigger
// view of everything about that one request: quota, priority, blood type,
// time elapsed, ward/unit, and request ID. Same overlay pattern as
// QrScannerModal.jsx (fixed backdrop + centered card), just bigger since
// there's more to show.
//
// Portaled to document.body — see FulfillmentLogModal.jsx's comment: every
// page renders inside AppShell's `transform: scale(...)` zoom wrapper,
// which breaks `position: fixed` centering/sizing for anything rendered
// inline instead of portaled out of it.
import { useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/apiClient";

const priorityTextClass = {
  EMERGENCY: "text-[#c26460]",
  URGENT: "text-black",
  NORMAL: "text-black",
};

const statusChipClass = {
  FULFILLED: "bg-[#eafaf0] text-[#1e7d32]",
  CANCELLED: "bg-[#f1f1f1] text-[#8a8a8a]",
  OPEN: "bg-[#fdecea] text-[#c26460]",
  WITHDRAWN: "bg-[#f1f1f1] text-[#8a8a8a]",
  PENDING_APPROVAL: "bg-[#fff7e6] text-[#8a5a00]",
  REJECTED: "bg-[#fdecea] text-[#b94842]",
};

const STATUS_LABEL = {
  PENDING_APPROVAL: "Awaiting approval",
  WITHDRAWN: "Withdrawn",
  PARTIALLY_FULFILLED: "Partially fulfilled",
};

function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[#f0eeee] last:border-b-0">
      <span className="text-[12px] font-semibold text-[#8a8a8a] tracking-wide uppercase">{label}</span>
      <span className="text-[14px] font-semibold text-black text-right">{value}</span>
    </div>
  );
}

// Requests a hospital can still call off: pending ones are withdrawn,
// live ones cancelled (see cancelRequest on the server).
const CANCELLABLE = new Set(["PENDING_APPROVAL", "OPEN", "PARTIALLY_FULFILLED"]);

export default function BroadcastDetailsModal({ broadcast, onClose, canCancel = false, startCancelling = false, onCancelled }) {
  if (!broadcast) return null;
  // Keyed so the cancel confirmation state resets per broadcast.
  return (
    <DetailsCard
      key={broadcast.id}
      b={broadcast}
      onClose={onClose}
      canCancel={canCancel}
      startCancelling={startCancelling}
      onCancelled={onCancelled}
    />
  );
}

function DetailsCard({ b, onClose, canCancel, startCancelling, onCancelled }) {
  const isPending = b.status === "PENDING_APPROVAL";
  const showCancel = canCancel && CANCELLABLE.has(b.status);
  const [confirming, setConfirming] = useState(startCancelling && showCancel);
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  async function handleCancel() {
    setCancelling(true);
    setCancelError(null);
    try {
      const updated = await api.post(`/api/requests/${b.id}/cancel`, { reason });
      onCancelled?.(updated);
    } catch (err) {
      setCancelError(err.message);
      setCancelling(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] font-poppins flex items-center justify-center p-6">
      <div className="absolute inset-0 backdrop-blur-[7.5px] bg-[rgba(217,217,217,0.85)]" onClick={onClose} />
      <div className="relative bg-white rounded-[16px] p-6 w-[460px] max-w-[92vw] shadow-xl flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-[#8a8a8a] tracking-wide uppercase">Broadcast Details</p>
            <h3 className="font-poppins font-bold text-[19px] text-[#9B1B20]">{b.id}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-[#808080] hover:text-black text-2xl leading-none"
            title="Close"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="flex items-center justify-between">
          <span
            className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1 rounded-full ${statusChipClass[b.status] ?? "bg-[#f1f1f1] text-[#8a8a8a]"}`}
          >
            {b.status ? STATUS_LABEL[b.status] ?? b.status.charAt(0) + b.status.slice(1).toLowerCase() : "—"}
          </span>
          <span className={`text-[12px] font-semibold ${priorityTextClass[b.priority] ?? "text-black"}`}>
            {b.priority} PRIORITY
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold">
            <span className="text-black">{b.units} requested</span>
            <span className="text-[#808080]">{b.percent}% fulfilled</span>
          </div>
          <div className="h-[8px] w-full bg-[#d9d9d9] rounded-[10px] overflow-hidden">
            <div className="h-full bg-[#9B1B20] rounded-[10px]" style={{ width: `${b.percent}%` }} />
          </div>
        </div>

        <div className="bg-[#fafafa] rounded-[12px] px-4">
          <DetailRow label="Request ID" value={b.id} />
          {b.hospitalName && <DetailRow label="Hospital" value={b.hospitalName} />}
          <DetailRow
            label="Hospital Contact"
            value={
              b.hospitalPhone ? (
                <a href={`tel:${b.hospitalPhone.replace(/[^\d+]/g, "")}`} className="text-[#9B1B20] underline">
                  Call · {b.hospitalPhone}
                </a>
              ) : (
                <span className="text-[#aaa4a0]">No number on file</span>
              )
            }
          />
          {b.intakeChannel === "phone" && (
            <DetailRow label="Received" value={b.callerName ? `By phone · ${b.callerName}` : "By phone"} />
          )}
          <DetailRow label="Blood Type" value={b.bloodType} />
          <DetailRow label="Ward / Unit" value={b.ward} />
          <DetailRow label="Quota" value={b.units} />
          <DetailRow label="Time Elapsed" value={b.time} />
          {b.status === "REJECTED" && b.rejectionReason && (
            <DetailRow label="Rejection Reason" value={b.rejectionReason} />
          )}
          {(b.status === "CANCELLED" || b.status === "WITHDRAWN") && b.cancelReason && (
            <DetailRow label="Cancel Reason" value={b.cancelReason} />
          )}
        </div>

        {showCancel &&
          (confirming ? (
            <div className="flex flex-col gap-2 rounded-[12px] border border-[#f0d0ce] bg-[#fdf6f6] p-4">
              <p className="text-[13px] font-semibold text-[#3d1116]">
                {isPending
                  ? "Withdraw this request? The Red Cross will stop being alerted and it will never go out to donors."
                  : "Cancel this request? It will be taken off the donor app, so no more donors will come in for it."}
              </p>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={300}
                placeholder="Reason (optional), e.g. blood sourced elsewhere"
                className="text-[12px] border border-[#d9d9d9] rounded-[6px] px-3 py-2 outline-none bg-white"
              />
              {cancelError && <p className="text-[12px] font-semibold text-[#d70b07]">{cancelError}</p>}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-[12px] font-semibold text-[#808080] px-3 py-1.5 cursor-pointer"
                >
                  Keep request
                </button>
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={handleCancel}
                  className="text-[12px] font-semibold text-white bg-[#9B1B20] rounded-full px-4 py-1.5 hover:bg-[#8B1218] disabled:opacity-50 cursor-pointer"
                >
                  {cancelling ? "..." : isPending ? "Withdraw request" : "Cancel request"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="self-end text-[12px] font-semibold text-[#9B1B20] border border-[#9B1B20] rounded-full px-4 py-1.5 hover:bg-[#fbeeec] cursor-pointer"
            >
              {isPending ? "Withdraw request" : "Cancel request"}
            </button>
          ))}
      </div>
    </div>,
    document.body
  );
}
