import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import WebNav from "../components/WebNav";

const imgEmergencyDot = "https://www.figma.com/api/mcp/asset/d8471049-5af6-4108-9373-e40b77e11f4e";
const imgClockIcon = "https://www.figma.com/api/mcp/asset/5d062be4-82ce-4311-bdc6-a66e7875acc6";

// Data mirrors the "View All Broadcasts" table (Frame 123 / node 559:832) from the
// ViewBDPage Figma frame (node 554:3214). Rows are modeled as data rather than
// individually absolutely-positioned nodes since they are visually identical templates.
const broadcasts = [
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

const priorityTextClass = {
  EMERGENCY: "text-[#c26460]",
  URGENT: "text-black",
  NORMAL: "text-black",
};

export default function ViewBDPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState("");

  const filtered = broadcasts.filter(
    (b) =>
      b.id.toLowerCase().includes(search.toLowerCase()) ||
      b.ward.toLowerCase().includes(search.toLowerCase()) ||
      b.bloodType.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative w-[1440px] min-h-[1024px] bg-white font-poppins">
      <WebNav property1="DMNav" className="absolute left-0 top-0 h-full w-[296px] overflow-clip" />

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
          <div className="grid grid-cols-[110px_100px_150px_150px_1fr_90px] items-center px-6 py-3 text-[11px] font-semibold text-[#8a8a8a] tracking-wide uppercase">
            <span>Request ID</span>
            <span>Blood Type</span>
            <span>Priority Level</span>
            <span>Ward/Unit</span>
            <span>Quota Progress</span>
            <span className="text-right">Time Elapsed</span>
          </div>

          {/* Rows */}
          <div className="border border-[#c0bfbf] rounded-[6px] overflow-hidden divide-y divide-[#ececec] shadow-[0px_3px_6px_0px_rgba(0,0,0,0.1)]">
            {filtered.map((b, i) => (
              <div
                key={`${b.id}-${i}`}
                className="grid grid-cols-[110px_100px_150px_150px_1fr_90px] items-center px-6 py-4 bg-white"
              >
                <span className="text-[13px] font-semibold text-[#8f404b]">{b.id}</span>

                <span className="inline-flex items-center justify-center w-[58px] h-[24px] bg-[#f8f3f4] border-2 border-[#ebdfe1] rounded-[10px] text-[11px] font-semibold text-[#8f404b]">
                  {b.bloodType}
                </span>

                <span className={`flex items-center gap-1.5 text-[11px] font-semibold ${priorityTextClass[b.priority]}`}>
                  {b.priority === "EMERGENCY" && (
                    <img src={imgEmergencyDot} alt="" className="w-[16px] h-[14px]" />
                  )}
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
                  <img src={imgClockIcon} alt="" className="w-[13px] h-[13px]" />
                  {b.time}
                </span>
              </div>
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
