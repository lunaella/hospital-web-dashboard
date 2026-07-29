import { useNavigate } from "react-router-dom";

const imgLiveIcon = "https://www.figma.com/api/mcp/asset/bc30bb5d-aade-46dd-a46e-824f75ff259d";
const imgCloseIcon = "https://www.figma.com/api/mcp/asset/28986d1b-8167-4132-9376-3a210ef9295a";
const imgPriorityDot = "https://www.figma.com/api/mcp/asset/a3d0e452-49cd-4dc5-91c4-73688758a3bd";
const imgClockIcon = "https://www.figma.com/api/mcp/asset/b505bc02-d8d9-4111-a8e9-4a53f6dbec91";

const requests = [
  { id: "REQ-6782", bloodType: "AB-", priority: "EMERGENCY", ward: "OR-2", units: "0/10 Units", percent: 0, time: "1m" },
  { id: "REQ-9012", bloodType: "O-", priority: "EMERGENCY", ward: "ICU-4", units: "4/10 Units", percent: 40, time: "12m" },
  { id: "REQ-8843", bloodType: "A+", priority: "EMERGENCY", ward: "ER-A", units: "2/3 Units", percent: 67, time: "28m" },
  { id: "REQ-9104", bloodType: "B-", priority: "URGENT", ward: "Surgery-B", units: "1/5 Units", percent: 20, time: "45m" },
  { id: "REQ-8756", bloodType: "AB+", priority: "URGENT", ward: "DR-5", units: "5/5 Units", percent: 100, time: "1h 05m" },
  { id: "REQ-9211", bloodType: "O+", priority: "NORMAL", ward: "Dialysis", units: "8/15 Units", percent: 53, time: "35m" },
  { id: "REQ-3671", bloodType: "B+", priority: "NORMAL", ward: "General - 3", units: "10/15 Units", percent: 67, time: "47m" },
  { id: "REQ-5231", bloodType: "A-", priority: "NORMAL", ward: "Oncology", units: "5/15 Units", percent: 33, time: "20m" },
  { id: "REQ-8834", bloodType: "AB+", priority: "NORMAL", ward: "Pre-Op Prep", units: "3/10 Units", percent: 30, time: "13m" },
  { id: "REQ-5767", bloodType: "O-", priority: "NORMAL", ward: "General - 5", units: "1/5 Units", percent: 20, time: "28m" },
  { id: "REQ-8534", bloodType: "O+", priority: "NORMAL", ward: "Dialysis", units: "2/15 Units", percent: 13, time: "3m" },
  { id: "REQ-9341", bloodType: "O+", priority: "NORMAL", ward: "General - 1", units: "4/4 Units", percent: 100, time: "1h 25m" },
  { id: "REQ-3671", bloodType: "AB-", priority: "NORMAL", ward: "Oncology", units: "2/6 Units", percent: 33, time: "47m" },
];

const priorityStyles = {
  EMERGENCY: "text-[#c26460]",
  URGENT: "text-black",
  NORMAL: "text-black",
};

export default function BDConfirm() {
  const navigate = useNavigate();

  function handleClose() {
    navigate(-1);
  }

  return (
    <div className="fixed inset-0 z-50 font-poppins flex items-center justify-center p-4">
      {/* Dimmed backdrop representing the Broadcast Dashboard behind the modal */}
      <div className="absolute inset-0 bg-black/20" onClick={handleClose} aria-hidden="true" />

      {/* Modal */}
      <div className="relative bg-white rounded-[10px] shadow-[0px_18px_11px_0px_rgba(0,0,0,0.05),0px_8px_8px_0px_rgba(0,0,0,0.09),0px_2px_4px_0px_rgba(0,0,0,0.1)] w-[1072px] max-w-full h-[775px] max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="relative shrink-0 px-[40px] pt-[20px] pb-[16px]">
          <div className="flex items-center gap-2">
            <img alt="" className="w-[25px] h-[25px]" src={imgLiveIcon} />
            <h2 className="font-bold text-[23px] text-black leading-normal">Live Match Monitoring</h2>
          </div>
          <p className="mt-1 text-[15px] font-medium text-[#aaa4a0]">Live tracking of urgent blood request quotas</p>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="absolute right-[40px] top-[21px] w-[20px] h-[20px] cursor-pointer"
          >
            <img alt="" className="block max-w-none size-full" src={imgCloseIcon} />
          </button>
        </div>

        {/* Table header */}
        <div className="shrink-0 border-t border-b border-[#c0bfbf] border-solid bg-[#fff5f5] h-[41px] flex items-center px-[40px] text-[#808080] text-[13px] font-semibold tracking-wide">
          <div className="w-[120px]">REQUEST ID</div>
          <div className="w-[130px]">BLOOD TYPE</div>
          <div className="w-[170px]">PRIORITY LEVEL</div>
          <div className="w-[170px]">WARD/UNIT</div>
          <div className="flex-1">QUOTA PROGRESS</div>
          <div className="w-[100px]">TIME ELAPSED</div>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto">
          {requests.map((req, idx) => (
            <div
              key={`${req.id}-${idx}`}
              className="flex items-center border-b border-[#c0bfbf] border-solid h-[62px] px-[40px]"
            >
              <div className="w-[120px] text-[13px] font-semibold text-[#8f404b]">{req.id}</div>
              <div className="w-[130px]">
                <span className="bg-[#f8f3f4] border-2 border-[#ebdfe1] border-solid rounded-[10px] h-[24px] w-[58px] flex items-center justify-center text-[11px] font-semibold text-[#8f404b]">
                  {req.bloodType}
                </span>
              </div>
              <div className={`w-[170px] flex items-center gap-1.5 text-[11px] font-semibold tracking-wide ${priorityStyles[req.priority]}`}>
                {req.priority === "EMERGENCY" && <img alt="" className="w-[16px] h-[14px]" src={imgPriorityDot} />}
                {req.priority}
              </div>
              <div className="w-[170px] text-[11px] font-semibold text-black">{req.ward}</div>
              <div className="flex-1 pr-6">
                <div className="flex items-center justify-between text-[7.5px] font-semibold mb-1">
                  <span className="text-black">{req.units}</span>
                  <span className="text-[#808080]">{req.percent}%</span>
                </div>
                <div className="bg-[#d9d9d9] h-[5px] rounded-[10px] w-full">
                  <div
                    className="bg-[#ad2b22] h-[5px] rounded-[10px]"
                    style={{ width: `${req.percent}%` }}
                  />
                </div>
              </div>
              <div className="w-[100px] flex items-center gap-1 text-[12px] font-medium text-[#aaa4a0]">
                <img alt="" className="w-[13px] h-[12px]" src={imgClockIcon} />
                {req.time}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
