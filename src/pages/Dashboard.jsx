import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import WebNav from "../components/WebNav";
import PageHeader from "../components/PageHeader";
import { fuzzyMatchAny } from "../utils/fuzzySearch";

const imgVector2 = "https://www.figma.com/api/mcp/asset/3031f0bd-02ab-4d5b-94f5-783c80a61a0d";
const imgEllipse45 = "https://www.figma.com/api/mcp/asset/be8dbb9d-4acc-40d8-be2e-cddf289297e9";
const imgGroup2 = "https://www.figma.com/api/mcp/asset/7e89c5be-bb89-494a-b463-eda6645f3683";
const imgGroup3 = "https://www.figma.com/api/mcp/asset/31f5a4f4-6a54-4085-a2e8-91cb29cd8a82";
const imgVector3 = "https://www.figma.com/api/mcp/asset/518af209-2857-43ce-8694-fecc0a072019";
const imgGroup4 = "https://www.figma.com/api/mcp/asset/9377a367-4ddb-442a-bb36-bba125c218cb";
const imgGroup76 = "https://www.figma.com/api/mcp/asset/5ecc14d0-1141-4eca-b68a-2947878b6b09";
const imgVector4 = "https://www.figma.com/api/mcp/asset/980bd49b-a0ad-42eb-a870-e3a2a7f40138";
const imgGroup5 = "https://www.figma.com/api/mcp/asset/e9c12ea2-57c9-44c4-a47e-c97dc7b45920";
const imgGroup80 = "https://www.figma.com/api/mcp/asset/094c35f0-cb2f-4113-8279-cf8d030cc5af";
const imgVector5 = "https://www.figma.com/api/mcp/asset/8cd2576f-04fc-4e95-ae8a-882e3bc63461";
const imgVector6 = "https://www.figma.com/api/mcp/asset/71fd8a34-01c0-4ec1-8967-b69882dbee20";
const imgVector7 = "https://www.figma.com/api/mcp/asset/c9267afd-52e8-4fd9-8183-0646122a0258";
const imgImage6 = "https://www.figma.com/api/mcp/asset/3d4e57f6-114f-4932-af4e-04e248bf7b80";
const imgImage8 = "https://www.figma.com/api/mcp/asset/5a1065a1-defb-4c9c-a5f1-1d7c7d4dd085";
const imgGroup6 = "https://www.figma.com/api/mcp/asset/076c49a2-a805-4190-8147-7d8628802934";
const imgEllipse48 = "https://www.figma.com/api/mcp/asset/21919db4-248c-4476-b4da-52ca1f1bccce";
const imgGroup7 = "https://www.figma.com/api/mcp/asset/e1fec1d3-9a22-40f1-ad39-e6bd5dc0e2cc";

const statCards = [
  {
    icon: imgGroup4,
    accent: true,
    label: "CODE RED BROADCASTS",
    value: "04",
    sub: "Active emergency requests",
  },
  {
    icon: imgGroup76,
    trendIcon: imgVector4,
    trend: "+12% from yesterday",
    label: "Units Needed",
    value: "142",
    sub: "Total volume across all active broadcast",
  },
  {
    icon: imgGroup5,
    label: "Active Donors",
    value: "18",
    sub: "6 Arrived + 12 In-Transit",
  },
  {
    icon: imgGroup80,
    trendIcon: imgVector4,
    trend: "+2.4%",
    label: "Fulfillment Rate",
    value: "94.2%",
    sub: "Successful quotas met (Last 24h)",
  },
];

const monitoringRows = [
  { id: "REQ-9012", bloodType: "O-", priority: "EMERGENCY", ward: "ICU-4", units: "4/10 Units", pct: 40, time: "12m" },
  { id: "REQ-8843", bloodType: "A+", priority: "EMERGENCY", ward: "ER-A", units: "2/3 Units", pct: 67, time: "28m" },
  { id: "REQ-9104", bloodType: "B-", priority: "URGENT", ward: "Surgery-B", units: "1/5 Units", pct: 20, time: "45m" },
  { id: "REQ-8756", bloodType: "AB+", priority: "URGENT", ward: "General-2", units: "5/5 Units", pct: 100, time: "1h 05m" },
  { id: "REQ-9211", bloodType: "O+", priority: "NORMAL", ward: "Dialysis", units: "8/15 Units", pct: 53, time: "35m" },
];

const stockCriticality = [
  { type: "O-", status: "CRITICAL", statusColor: "text-[#b94842] bg-[#f5e8e7]", units: "12U" },
  { type: "AB-", status: "LOW", statusColor: "text-black", units: "12U" },
  { type: "A+", status: "STABLE", statusColor: "text-black", units: "12U" },
  { type: "O+", status: "STABLE", statusColor: "text-black", units: "12U" },
];

const recentArrivals = [
  { name: "Sarah Jenkins", time: "2m ago", bloodType: "O-", img: imgImage6 },
  { name: "Marcus Chen", time: "8m ago", bloodType: "A+", img: imgImage8 },
  { name: "Elena Rodriguez", time: "14m ago", bloodType: "B+", img: imgImage6 },
  { name: "David Smith", time: "21m ago", bloodType: "O+", img: imgImage6 },
];

function PriorityBadge({ priority }) {
  const colorMap = {
    EMERGENCY: "text-[#c26460]",
    URGENT: "text-black",
    NORMAL: "text-black",
  };
  return (
    <div className="flex items-center justify-center gap-1">
      {priority === "EMERGENCY" && (
        <img alt="" className="w-[16px] h-[14px]" src={imgEllipse45} />
      )}
      <span className={`font-poppins font-semibold text-[11px] tracking-wide ${colorMap[priority]}`}>{priority}</span>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  function openModal(path) {
    navigate(path, { state: { backgroundLocation: location } });
  }

  const filteredMonitoringRows = monitoringRows.filter((row) =>
    fuzzyMatchAny(searchQuery, [row.id, row.bloodType, row.ward, row.units, row.priority])
  );
  const filteredRecentArrivals = recentArrivals.filter((person) =>
    fuzzyMatchAny(searchQuery, [person.name, person.bloodType])
  );
  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="bg-white relative w-[1440px] h-[1335px] mx-auto">
      <WebNav property1="DashboardNav" className="absolute left-0 top-0 h-full w-[296px] overflow-clip" />

      {/* Top bar */}
      <PageHeader
        title="Hospital Overview"
        right={
          <div className="h-[40.62px] w-[293.783px] bg-[#f6f5f4] rounded-[13px] shadow-[0px_5px_5px_0px_rgba(0,0,0,0.09)] flex items-center gap-2 px-4">
            <img alt="" className="w-[16px] h-[16px] shrink-0" src={imgGroup7} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search donors or units..."
              className="bg-transparent outline-none font-poppins text-[15px] text-black placeholder:text-[#b3b3b3] w-full"
            />
          </div>
        }
      />

      {/* Main content */}
      <div className="absolute left-[312px] top-[-22px] w-[1086px]">
        <div className="absolute left-0 top-[142px] font-poppins font-bold text-[23px] text-black">
          System Status
        </div>
        <div className="absolute left-0 top-[199px] font-poppins font-semibold text-[17px] text-[#808080] w-[617px]">
          Real-time blood resource logistics for St. Jude Medical Center
        </div>

        <div className="absolute contents left-[578px] top-[138px]">
          <div className="absolute border-2 border-[#d9d9d9] h-[49px] left-[578px] rounded-[16px] top-[138px] w-[276px] flex items-center gap-2 px-6">
            <img alt="" className="w-[20px] h-[20px]" src={imgVector5} />
            <span className="font-poppins font-bold text-[17px] text-black">System Health: Optimal</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => openModal("/new-broadcast")}
          className="absolute bg-[#ad2b21] h-[49px] left-[871px] rounded-[16px] top-[138px] w-[215px] flex items-center justify-center gap-2 cursor-pointer hover:bg-[#8f2419] transition-colors"
        >
          <img alt="" className="w-[16px] h-[16px]" src={imgVector3} />
          <span className="font-poppins font-bold text-[17px] text-white">New Broadcast</span>
        </button>

        {/* Stat cards */}
        <div className="absolute left-0 top-[236px] w-full flex items-stretch gap-[27px]">
          {statCards.map((card, i) => (
            <div
              key={card.label}
              className={`relative w-[247px] min-h-[166px] rounded-[16px] flex flex-col ${
                i === 0 ? "bg-[#fbf3f3] border-l-[9px] border-l-[#ad2b21]" : "bg-white shadow-[0px_2px_5px_0px_rgba(0,0,0,0.1)]"
              } px-[19px] pt-[14px] pb-[10px]`}
            >
              <div className="bg-[#f1dddc] h-[30px] w-[33px] rounded-[8px] flex items-center justify-center shrink-0">
                <img alt="" className="w-[16px] h-[16px]" src={card.icon} />
              </div>
              {card.trend && (
                <div className="absolute top-[19px] right-[19px] flex items-center gap-1 text-[11px] font-poppins text-black">
                  {card.trendIcon && <img alt="" className="w-[8px] h-[8px]" src={card.trendIcon} />}
                  <span>{card.trend}</span>
                </div>
              )}
              <div className="mt-2 font-poppins font-bold text-[17px] text-[#808080] leading-snug">{card.label}</div>
              <div className="mt-2 font-poppins font-bold text-[35px] text-black leading-none">{card.value}</div>
              <div className="mt-2 font-poppins font-medium text-[13px] text-[#808080] leading-snug">{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Live Match Monitoring */}
        <div className="absolute left-[11px] top-[439px] w-[1072px] h-[432px] bg-white rounded-[6px] shadow-[0px_5px_5px_0px_rgba(0,0,0,0.09)]">
          <div className="flex items-center gap-2 pt-[22px] pl-[15px]">
            <img alt="" className="w-[16px] h-[16px]" src={imgGroup3} />
            <span className="font-poppins font-semibold text-[17px] text-black">Live Match Monitoring</span>
          </div>
          <div className="pl-[42px] font-poppins font-medium text-[11px] text-[#808080]">
            Live tracking of urgent blood request quotas
          </div>
          <button
            type="button"
            onClick={() => openModal("/bd-confirm")}
            className="absolute right-[15px] top-[36px] flex items-center gap-1 cursor-pointer"
          >
            <span className="font-poppins font-medium text-[13px] text-[#812a34]">View All Broadcasts</span>
            <img alt="" className="w-[6px] h-[10px]" src={imgVector2} />
          </button>

          <div className="mt-[19px] border-t border-[#d9d9d9]" />

          <div className="grid grid-cols-[140px_170px_170px_170px_260px_162px] items-center bg-[#fff5f5] h-[41px] px-[11px]">
            <span className="font-poppins font-semibold text-[13px] text-[#808080] text-center tracking-wide">REQUEST ID</span>
            <span className="font-poppins font-semibold text-[13px] text-[#808080] text-center tracking-wide">BLOOD TYPE</span>
            <span className="font-poppins font-semibold text-[13px] text-[#808080] text-center tracking-wide">PRIORITY LEVEL</span>
            <span className="font-poppins font-semibold text-[13px] text-[#808080] text-center tracking-wide">WARD/UNIT</span>
            <span className="font-poppins font-semibold text-[13px] text-[#808080] text-center tracking-wide">QUOTA PROGRESS</span>
            <span className="font-poppins font-semibold text-[13px] text-[#808080] text-center tracking-wide">TIME ELAPSED</span>
          </div>

          {filteredMonitoringRows.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-[140px_170px_170px_170px_260px_162px] items-center h-[62px] px-[11px] border border-[#c0bfbf] shadow-[0px_3px_6px_0px_rgba(0,0,0,0.1)]"
            >
              <span className="font-poppins font-semibold text-[13px] text-[#8f404b] text-center">{row.id}</span>
              <div className="flex justify-center">
                <div className="bg-[#f8f3f4] border-2 border-[#ebdfe1] rounded-[10px] h-[24px] w-[58px] flex items-center justify-center">
                  <span className="font-poppins font-semibold text-[11px] text-[#8f404b]">{row.bloodType}</span>
                </div>
              </div>
              <PriorityBadge priority={row.priority} />
              <span className="font-poppins font-semibold text-[11px] text-black text-center">{row.ward}</span>
              <div className="flex flex-col items-center gap-[3px]">
                <div className="flex justify-between w-[134px] text-[7.5px] font-poppins font-semibold">
                  <span className="text-black">{row.units}</span>
                  <span className="text-[#808080]">{row.pct}%</span>
                </div>
                <div className="bg-[#d9d9d9] h-[5px] rounded-[10px] w-[134px]">
                  <div className="bg-[#ad2b22] h-[5px] rounded-[10px]" style={{ width: `${row.pct}%` }} />
                </div>
              </div>
              <div className="flex items-center justify-center gap-1">
                <img alt="" className="w-[12px] h-[12px]" src={imgGroup2} />
                <span className="font-poppins font-medium text-[12px] text-[#aaa4a0]">{row.time}</span>
              </div>
            </div>
          ))}
          {isSearching && filteredMonitoringRows.length === 0 && (
            <div className="flex items-center justify-center h-[100px] text-[13px] text-[#aaa4a0] font-poppins font-medium">
              No broadcasts match "{searchQuery}".
            </div>
          )}
        </div>

        {/* Stock Criticality */}
        <div className="absolute left-[11px] top-[906px] w-[585px] h-[411px] bg-white rounded-[16px] shadow-[0px_2px_5px_0px_rgba(0,0,0,0.1)]">
          <div className="pt-[27px] pl-[63px] font-poppins font-bold text-[17px] text-black">Stock Criticality</div>
          <div className="mt-[16px] border-t border-[#d9d9d9]" />

          <div className="grid grid-cols-2 gap-[30px] px-[31px] pt-[26px]">
            {stockCriticality.map((item) => (
              <div key={item.type} className="border-[1.5px] border-[#d9d9d9] rounded-[10px] h-[90px] px-[14px] py-[10px] relative">
                <div className="flex items-center justify-between">
                  <span className="font-poppins font-semibold text-[25px] text-black">{item.type}</span>
                  <span className="font-poppins font-bold text-[10px] text-[#808080]">Available</span>
                </div>
                <div className="flex items-center justify-between mt-[2px]">
                  <span className={`font-poppins font-bold text-[10px] tracking-wide px-[8px] py-[2px] rounded-[5px] ${item.statusColor}`}>
                    {item.status}
                  </span>
                  <span className="font-poppins font-bold text-[20px] text-black">{item.units}</span>
                </div>
              </div>
            ))}
          </div>

          <Link to="/reports" className="absolute left-[85px] top-[325px] w-[438px] h-[51px] border-[2.5px] border-[#d9d9d9] rounded-[10px] flex items-center justify-center cursor-pointer">
            <span className="font-poppins font-bold text-[15px] text-[#808080]">Full Inventory Report</span>
            <img alt="" className="w-[8px] h-[13px] ml-2" src={imgVector6} />
          </Link>
        </div>

        {/* Recent Arrivals */}
        <div className="absolute left-[651px] top-[906px] w-[425px] h-[411px] bg-white rounded-[10px]">
          <div className="pt-[27px] pl-[71px] font-poppins font-bold text-[17px] text-black">Recent Arrivals</div>
          <div className="pl-[71px] pt-[1px] font-poppins font-medium text-[11px] text-[#808080]">
            Donors detected in facility geofence
          </div>
          <img alt="" className="absolute left-[20px] top-[26px] w-[24px] h-[24px]" src={imgVector7} />
          <div className="mt-[15px] border-t border-[#d9d9d9]" />

          <div className="flex flex-col gap-[13px] px-[25px] pt-[15px]">
            {filteredRecentArrivals.map((person) => (
              <div key={person.name} className="flex items-center gap-3">
                <img alt="" className="w-[45px] h-[45px] rounded-full object-cover" src={person.img} />
                <div className="flex-1">
                  <div className="font-poppins font-medium text-[15px] text-black">{person.name}</div>
                  <div className="flex items-center gap-1 font-poppins font-medium text-[12px] text-[#aaa4a0]">
                    <img alt="" className="w-[10px] h-[10px]" src={imgGroup6} />
                    <span>{person.time}</span>
                  </div>
                </div>
                <div className="relative w-[26px] h-[25px]">
                  <img alt="" className="absolute inset-0 size-full" src={imgEllipse48} />
                  <span className="absolute inset-0 flex items-center justify-center font-poppins font-medium text-[11px] text-black">
                    {person.bloodType}
                  </span>
                </div>
              </div>
            ))}
            {isSearching && filteredRecentArrivals.length === 0 && (
              <p className="text-[13px] text-[#aaa4a0] font-poppins font-medium">No donors match "{searchQuery}".</p>
            )}
          </div>

          <Link to="/donor-management" className="absolute left-[52px] top-[340px] w-[321px] h-[49px] bg-[#f6f5f4] rounded-[10px] shadow-[0px_2px_2px_0px_rgba(0,0,0,0.1)] flex items-center justify-center cursor-pointer">
            <span className="font-poppins font-bold text-[15px] text-[#808080]">View Full Donor Management</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
