// Full scrollable view of the Recent Fulfillment Log, opened by "View
// Detailed Log" on the Reports screen. Previously "View Detailed Log" just
// expanded the inline table in place, which pushed the whole page taller
// the more rows there were — this keeps the Reports page a fixed height and
// puts every row in one scrollable popup instead. Same overlay pattern as
// BroadcastDetailsModal.jsx/DonorProfileModal.jsx.
import { IconAlert } from "./icons";

function priorityColorFor(priority) {
  return priority === "EMERGENCY" ? "text-[#c26460]" : "text-[#868686]";
}

export default function FulfillmentLogModal({ open, rows, onClose, onViewBroadcast }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] font-poppins flex items-center justify-center p-6">
      <div className="absolute inset-0 backdrop-blur-[7.5px] bg-[rgba(217,217,217,0.85)]" onClick={onClose} />
      <div className="relative bg-white rounded-[16px] p-6 w-[760px] max-w-[92vw] h-[80vh] max-h-[720px] shadow-xl flex flex-col gap-4">
        <div className="flex items-center justify-between shrink-0">
          <div>
            <p className="text-[11px] font-semibold text-[#8a8a8a] tracking-wide uppercase">Reports</p>
            <h3 className="font-poppins font-bold text-[19px] text-black">Recent Fulfillment Log</h3>
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

        <div className="bg-[#fff5f5] border border-[#efeeed] w-full h-[44px] flex items-center px-4 text-[12px] font-poppins font-semibold text-[#808080] tracking-wide shrink-0">
          <span className="w-[130px] text-center">REQUEST ID</span>
          <span className="w-[95px] text-center">TYPE</span>
          <span className="w-[90px] text-center">PRIORITY</span>
          <span className="w-[110px] text-center">TIME TO CONFIRM</span>
          <span className="w-[100px] text-center">RATING</span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 pr-1">
          {rows.length === 0 && (
            <div className="flex items-center justify-center h-[80px] text-[13px] text-[#aaa4a0] font-medium">
              No requests match this priority.
            </div>
          )}
          {rows.map((row, i) => (
            <button
              key={`${row.reqId}-${i}`}
              type="button"
              onClick={() => onViewBroadcast(row.reqId)}
              title="View broadcast details"
              className="w-full text-left bg-white border border-[#c0bfbf] shadow-[0px_3px_6px_0px_rgba(0,0,0,0.1)] h-[56px] flex items-center px-4 rounded-[6px] hover:bg-[#fafafa] transition-colors cursor-pointer"
            >
              <span className="w-[130px] text-center font-poppins font-semibold text-[13px] text-[#9B1B20]">
                {row.reqId}
              </span>
              <div className="w-[95px] flex justify-center">
                <div className="border-2 border-[#c5c4c4] rounded-[10px] px-2 h-[24px] flex items-center justify-center">
                  <span className="font-poppins font-semibold text-[11px] text-[#868686]">{row.blood}</span>
                </div>
              </div>
              <div className="w-[90px] flex items-center justify-center gap-1">
                {row.hasEllipse ? (
                  <>
                    <IconAlert className="w-[14px] h-[12px] text-[#c26460]" />
                    <span className={`font-poppins font-semibold text-[11px] tracking-wide ${priorityColorFor(row.priority)}`}>
                      {row.priority}
                    </span>
                  </>
                ) : (
                  <span className="font-poppins font-medium text-[12px] text-[#868686]">
                    {row.priority.charAt(0) + row.priority.slice(1).toLowerCase()}
                  </span>
                )}
              </div>
              <span className="w-[110px] text-center font-poppins font-semibold text-[12px] text-[#868686]">
                {row.time}
              </span>
              <div className="w-[100px] flex justify-center">
                <span className="border-2 border-[#c5c4c4] rounded-full px-3 h-[22px] flex items-center justify-center font-poppins font-semibold text-[12px] text-[#868686] whitespace-nowrap">
                  {row.rating ?? "Pending"}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
