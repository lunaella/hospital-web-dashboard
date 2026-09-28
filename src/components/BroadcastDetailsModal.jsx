// Full-detail popup for a single blood donation broadcast, opened by
// selecting a row on the All Broadcasts screen (ViewBDPage.jsx) — the row
// itself only has room for compact columns, this gives the admin a bigger
// view of everything about that one request: quota, priority, blood type,
// time elapsed, ward/unit, and request ID. Same overlay pattern as
// QrScannerModal.jsx (fixed backdrop + centered card), just bigger since
// there's more to show.
const priorityTextClass = {
  EMERGENCY: "text-[#c26460]",
  URGENT: "text-black",
  NORMAL: "text-black",
};

const statusChipClass = {
  FULFILLED: "bg-[#eafaf0] text-[#1e7d32]",
  CANCELLED: "bg-[#f1f1f1] text-[#8a8a8a]",
  OPEN: "bg-[#fdecea] text-[#c26460]",
};

function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[#f0eeee] last:border-b-0">
      <span className="text-[12px] font-semibold text-[#8a8a8a] tracking-wide uppercase">{label}</span>
      <span className="text-[14px] font-semibold text-black text-right">{value}</span>
    </div>
  );
}

export default function BroadcastDetailsModal({ broadcast, onClose }) {
  if (!broadcast) return null;
  const b = broadcast;

  return (
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
            {b.status ? b.status.charAt(0) + b.status.slice(1).toLowerCase() : "—"}
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
          <DetailRow label="Blood Type" value={b.bloodType} />
          <DetailRow label="Ward / Unit" value={b.ward} />
          <DetailRow label="Quota" value={b.units} />
          <DetailRow label="Time Elapsed" value={b.time} />
        </div>
      </div>
    </div>
  );
}
