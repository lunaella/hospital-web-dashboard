// Full scrollable view of the Completed Requests audit table, opened by
// "View All" on the Reports screen. Same fix as FulfillmentLogModal.jsx:
// "View All" used to just inline-expand the table, pushing the whole page
// taller the more fulfilled requests there were. This keeps the Reports
// page a fixed height and puts every row in one scrollable popup instead.
//
// Portaled to document.body — every page renders inside AppShell.jsx's
// transform: scale(zoom) wrapper, and position:fixed inside a transformed
// ancestor is positioned relative to THAT ancestor's box, not the real
// viewport (see FulfillmentLogModal.jsx's comment for the full
// explanation). Escaping via a portal sidesteps that entirely.
import { createPortal } from "react-dom";

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export default function CompletedRequestsModal({ open, rows, onClose }) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] font-poppins flex items-center justify-center p-6">
      <div className="absolute inset-0 backdrop-blur-[7.5px] bg-[rgba(217,217,217,0.85)]" onClick={onClose} />
      <div className="relative bg-white rounded-[16px] p-6 w-[1040px] max-w-[95vw] h-[80vh] max-h-[720px] shadow-xl flex flex-col gap-4">
        <div className="flex items-center justify-between shrink-0">
          <div>
            <p className="text-[11px] font-semibold text-[#8a8a8a] tracking-wide uppercase">Reports</p>
            <h3 className="font-poppins font-bold text-[19px] text-black">Completed Requests</h3>
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

        <div className="bg-[#fff5f5] border border-[#efeeed] w-full h-[44px] flex items-center px-3 text-[12px] font-poppins font-semibold text-[#808080] tracking-wide shrink-0">
          <span className="w-[100px] text-center">REQUEST ID</span>
          <span className="w-[170px] text-center">HOSPITAL</span>
          <span className="w-[80px] text-center">BLOOD TYPE</span>
          <span className="w-[80px] text-center">QUANTITY</span>
          <span className="w-[120px] text-center">REQUEST DATE</span>
          <span className="w-[120px] text-center">FULFILLMENT DATE</span>
          <span className="w-[240px] text-center">ASSIGNED DONOR(S)</span>
          <span className="w-[100px] text-center">STATUS</span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 pr-1">
          {rows.length === 0 && (
            <div className="flex items-center justify-center h-[80px] text-[13px] text-[#aaa4a0] font-medium">
              No fulfilled requests yet.
            </div>
          )}
          {rows.map((row) => (
            <div
              key={row.id}
              className="bg-white border border-[#c0bfbf] shadow-[0px_3px_6px_0px_rgba(0,0,0,0.1)] h-[56px] flex items-center px-3 rounded-[6px]"
            >
              <span className="w-[100px] text-center font-poppins font-semibold text-[13px] text-[#9B1B20]">
                {row.requestId}
              </span>
              <span
                className="w-[170px] text-center font-poppins font-medium text-[12px] text-black truncate px-1"
                title={row.hospital}
              >
                {row.hospital}
              </span>
              <div className="w-[80px] flex justify-center">
                <div className="border-2 border-[#c5c4c4] rounded-[10px] px-2 h-[24px] flex items-center justify-center">
                  <span className="font-poppins font-semibold text-[11px] text-[#868686]">{row.bloodType}</span>
                </div>
              </div>
              <span className="w-[80px] text-center font-poppins font-semibold text-[13px] text-[#868686]">
                {row.quantityRequested}
              </span>
              <span className="w-[120px] text-center font-poppins font-medium text-[12px] text-[#868686]">
                {formatDate(row.requestDate)}
              </span>
              <span className="w-[120px] text-center font-poppins font-medium text-[12px] text-[#868686]">
                {formatDate(row.fulfillmentDate)}
              </span>
              <span
                className="w-[240px] text-center font-poppins font-medium text-[12px] text-black truncate px-1"
                title={row.assignedDonors?.length ? row.assignedDonors.join(", ") : ""}
              >
                {row.assignedDonors?.length ? row.assignedDonors.join(", ") : "—"}
              </span>
              <div className="w-[100px] flex justify-center">
                <span className="border-2 border-[#c5c4c4] rounded-full px-3 h-[22px] flex items-center justify-center font-poppins font-semibold text-[11px] text-[#1e7d32] whitespace-nowrap">
                  {row.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
