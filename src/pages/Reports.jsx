import { useState } from "react";
import { useNavigate } from "react-router-dom";
import WebNav from "../components/WebNav";
import PageHeader from "../components/PageHeader";

const imgGroup3 = "https://www.figma.com/api/mcp/asset/b0075d24-ad2e-470c-aa96-18af8ab5b2d2";
const imgVector2 = "https://www.figma.com/api/mcp/asset/64db5e91-cefa-4b4c-85d0-d07947182c3f";
const imgVector3 = "https://www.figma.com/api/mcp/asset/624866ec-d57c-4b3b-981e-53850dd34056";
const imgGroup4 = "https://www.figma.com/api/mcp/asset/f3c698c3-ad79-4f2a-94d3-8de1edbf29ba";
const imgVector4 = "https://www.figma.com/api/mcp/asset/73a54cf5-9b97-451f-832a-c68d57a8aa0c";
const imgGroup5 = "https://www.figma.com/api/mcp/asset/20e5b6f6-4c62-41be-ba3d-5f074da50ebb";
const imgVector5 = "https://www.figma.com/api/mcp/asset/a6aef71d-665b-46b1-a811-0258a3d0c87d";
const imgVector6 = "https://www.figma.com/api/mcp/asset/f0ebdcbc-9c4e-4fcf-bb56-35f76deeefa9";
const imgGroup153 = "https://www.figma.com/api/mcp/asset/a087c384-4181-4f05-9187-278e41d19a8c";
const imgEllipse45 = "https://www.figma.com/api/mcp/asset/888899df-726b-418a-a4f4-a78fcc549846";
const imgLine35 = "https://www.figma.com/api/mcp/asset/4528ae71-95a4-4296-9330-f5bea7018979";
const imgGroup6 = "https://www.figma.com/api/mcp/asset/7a145b6b-5f40-4483-9c33-bfe3c4a1e596";

const kpiCards = [
  {
    key: "response-time",
    left: "left-[277px]",
    value: "14.2 min",
    label: "Mean Response Time",
    trendText: "-4.1m",
    trendColor: "text-black",
    badgeIcon: imgGroup4,
  },
  {
    key: "active-donors",
    left: "left-[554px]",
    value: "18",
    label: "Active Donors Reach",
    trendText: "+124",
    trendColor: "text-black",
    badgeIcon: imgGroup5,
  },
];

const fulfillmentRows = [
  { reqId: "REQ-8821", priority: "EMERGENCY", priorityColor: "text-[#c26460]", blood: "O-", hasEllipse: true, time: "12 m", rating: "Optimal" },
  { reqId: "REQ-8819", priority: "URGENT", priorityColor: "text-[#868686]", blood: "A+", hasEllipse: false, time: "12 m", rating: "Good" },
  { reqId: "REQ-8815", priority: "EMERGENCY", priorityColor: "text-[#c26460]", blood: "B-", hasEllipse: true, time: "12 m", rating: "Acceptable" },
  { reqId: "REQ-8795", priority: "NORMAL", priorityColor: "text-[#868686]", blood: "AB+", hasEllipse: false, time: "12 m", rating: "Optimal" },
];

const extraFulfillmentRows = [
  { reqId: "REQ-8790", priority: "NORMAL", priorityColor: "text-[#868686]", blood: "B+", hasEllipse: false, time: "18 m", rating: "Good" },
  { reqId: "REQ-8788", priority: "URGENT", priorityColor: "text-[#868686]", blood: "O-", hasEllipse: false, time: "9 m", rating: "Optimal" },
  { reqId: "REQ-8781", priority: "EMERGENCY", priorityColor: "text-[#c26460]", blood: "A-", hasEllipse: true, time: "22 m", rating: "Acceptable" },
];

const DATE_RANGES = ["Last 7 days", "Last 30 days", "Last 90 days"];
const PRIORITY_FILTERS = ["all", "EMERGENCY", "URGENT", "NORMAL"];

const fulfillmentBreakdown = [
  { label: "Emergency", value: "94%", color: "#ad2b21" },
  { label: "Urgent", value: "88%", color: "#c9a227" },
  { label: "Normal", value: "76%", color: "#5b8a52" },
];

const chartYAxis = ["24", "18", "12", "6", "0"];
const chartXAxis = ["01 March", "05 March", "10 March", "15 March", "20 March", "25 March", "31 March"];

// Plot geometry: 248px-tall plot area maps value range [0, 24] to y range [248, 0].
const CHART_MAX = 24;
const CHART_PLOT_HEIGHT = 248;
const valueToY = (value) => ((CHART_MAX - value) / CHART_MAX) * CHART_PLOT_HEIGHT;

const chartValues = [17.8, 16, 21.5, 13.5, 12.3, 10.8, 8.8];
const chartPoints = chartValues.map((value, i) => ({ x: 22 + i * 86, y: valueToY(value) }));
const SLA_TARGET_Y = valueToY(20.5);

// Catmull-Rom -> cubic Bezier smoothing so the line reads as a smooth curve
// instead of sharp straight segments between data points.
function buildSmoothPath(points) {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

const chartLinePath = buildSmoothPath(chartPoints);
const chartAreaPath = `${chartLinePath} L ${chartPoints[chartPoints.length - 1].x} ${CHART_PLOT_HEIGHT} L ${chartPoints[0].x} ${CHART_PLOT_HEIGHT} Z`;
const chartGridYs = [0, 62, 124, 186, 248];

export default function Reports() {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState("Last 30 days");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [showAllLogs, setShowAllLogs] = useState(false);

  function cycleDateRange() {
    setDateRange((prev) => {
      const idx = DATE_RANGES.indexOf(prev);
      return DATE_RANGES[(idx + 1) % DATE_RANGES.length];
    });
  }

  const allRows = showAllLogs ? [...fulfillmentRows, ...extraFulfillmentRows] : fulfillmentRows;
  const visibleRows = priorityFilter === "all" ? allRows : allRows.filter((r) => r.priority === priorityFilter);
  const extraRowCount = Math.max(0, visibleRows.length - 4);
  const logCardHeight = 446 + extraRowCount * 62;
  const rootHeight = 1350 + extraRowCount * 62;

  return (
    <div className="bg-white relative w-[1440px] mx-auto font-poppins" style={{ height: rootHeight }}>
      <WebNav property1="ReportsNav" className="absolute left-0 top-0 h-full w-[296px] overflow-clip" />

      {/* Header bar */}
      <PageHeader title="Analytical Overview" />

      {/* Main content */}
      <div className="absolute left-[312px] top-[27px] w-[1083px]">
        <div className="absolute left-0 top-[93px] flex flex-col gap-2 w-[507px]">
          <h1 className="font-poppins font-bold text-[23px] text-black">Analytics Hub</h1>
          <p className="font-poppins font-semibold text-[17px] text-[#808080]">
            Strategic performance monitoring and efficiency metrics.
          </p>
        </div>

        {/* Action buttons */}
        <button
          type="button"
          onClick={() => window.print()}
          className="absolute left-[899px] top-[109px] bg-[#ad2b21] rounded-[16px] w-[166px] h-[49px] flex items-center justify-center gap-2 cursor-pointer hover:bg-[#8f2419] transition-colors"
        >
          <span className="font-poppins font-bold text-[17px] text-white">Export PDF</span>
          <img alt="" className="w-4 h-4" src={imgGroup3} />
        </button>
        <button
          type="button"
          onClick={cycleDateRange}
          className="absolute left-[573px] top-[109px] border-2 border-[#d9d9d9] rounded-[16px] w-[180px] h-[49px] flex items-center justify-center gap-2 cursor-pointer"
        >
          <img alt="" className="w-4 h-4" src={imgVector2} />
          <span className="font-poppins font-bold text-[17px] text-black whitespace-nowrap">{dateRange}</span>
        </button>
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className={`absolute left-[763px] top-[109px] border-2 rounded-[16px] w-[126px] h-[49px] flex items-center justify-center gap-2 cursor-pointer ${
            filtersOpen ? "border-[#ad2b21] bg-[#fbf3f3]" : "border-[#d9d9d9]"
          }`}
        >
          <img alt="" className="w-4 h-4" src={imgVector3} />
          <span className="font-poppins font-bold text-[17px] text-black">Filters</span>
        </button>

        {filtersOpen && (
          <div className="absolute left-[763px] top-[164px] w-[220px] bg-white rounded-[12px] border border-[#d9d9d9] shadow-[0px_8px_8px_0px_rgba(0,0,0,0.09)] p-3 z-20">
            <p className="font-poppins font-bold text-[11px] text-[#808080] tracking-wide mb-2">PRIORITY</p>
            <div className="flex flex-col gap-1">
              {PRIORITY_FILTERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriorityFilter(p)}
                  className={`text-left px-2 py-1.5 rounded-[6px] text-[12px] font-poppins font-semibold cursor-pointer ${
                    priorityFilter === p ? "bg-[#ad2b21] text-white" : "text-[#808080] hover:bg-[#fbf3f3]"
                  }`}
                >
                  {p === "all" ? "All Priorities" : p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* KPI cards */}
        <div className="absolute left-[3px] top-[186px] bg-white rounded-[16px] shadow-[0px_2px_5px_0px_rgba(0,0,0,0.1)] w-[247px] h-[149px]">
          <div className="absolute left-[26px] top-[21px] bg-[#f1dddc] rounded-[8px] w-[33px] h-[30px] flex items-center justify-center">
            <img alt="" className="w-3.5 h-3.5" src={imgVector5} />
          </div>
          <span className="absolute left-[192px] top-[16px] font-poppins font-medium text-[11px] text-black">+2.4%</span>
          <p className="absolute left-[25px] top-[59px] font-poppins font-bold text-[35px] text-black">89.4%</p>
          <p className="absolute left-[25px] top-[104px] font-poppins font-bold text-[17px] text-[#808080]">Avg Fulfillment Rate</p>
        </div>

        {kpiCards.map((card) => (
          <div key={card.key} className={`absolute ${card.left} top-[193px] bg-white rounded-[16px] shadow-[0px_2px_5px_0px_rgba(0,0,0,0.1)] w-[247px] h-[149px]`}>
            <div className="absolute left-[19px] top-[14px] bg-[#f1dddc] rounded-[8px] w-[33px] h-[30px] flex items-center justify-center">
              <img alt="" className="w-3.5 h-3.5" src={card.badgeIcon} />
            </div>
            <div className="absolute top-[14px] right-[19px] flex items-center gap-1.5">
              <img alt="" className="w-4 h-4" src={imgVector4} />
              <span className={`font-poppins font-medium text-[11px] ${card.trendColor}`}>{card.trendText}</span>
            </div>
            <p className="absolute left-[20px] top-[98px] font-poppins font-bold text-[35px] text-black">{card.value}</p>
            <p className="absolute left-[20px] top-[68px] font-poppins font-bold text-[17px] text-[#808080]">{card.label}</p>
          </div>
        ))}

        <div className="absolute left-[831px] top-[193px] bg-white rounded-[16px] shadow-[0px_2px_5px_0px_rgba(0,0,0,0.1)] w-[247px] h-[149px]">
          <div className="absolute left-[20px] top-[14px] w-[33px] h-[30px]">
            <img alt="" className="block max-w-none size-full" src={imgGroup153} />
          </div>
          <div className="absolute top-[14px] right-[19px] flex items-center gap-1.5">
            <img alt="" className="w-4 h-4 rotate-180 -scale-x-100" src={imgVector6} />
            <span className="font-poppins font-medium text-[11px] text-[#c46865]">-12%</span>
          </div>
          <p className="absolute left-[20px] top-[98px] font-poppins font-bold text-[35px] text-black">428</p>
          <p className="absolute left-[20px] top-[68px] font-poppins font-bold text-[17px] text-[#808080]">Units Processed</p>
        </div>

        {/* Donor Response Time chart */}
        <div className="absolute left-[15px] top-[370px] bg-white rounded-[10px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.1)] w-[725px] h-[446px]">
          <div className="absolute left-[543px] top-[18px] bg-[rgba(173,43,33,0.1)] rounded-[10px] w-[145px] h-[19px] flex items-center justify-center">
            <span className="font-poppins font-bold text-[10px] text-[#8f404b]">Min-Heap Optimized</span>
          </div>
          <p className="absolute left-[22px] top-[36px] font-poppins font-semibold text-[20px] text-black">Donor Response Time</p>
          <p className="absolute left-[22px] top-[66px] font-poppins font-semibold text-[15px] text-[#808080] w-[600px] whitespace-nowrap">
            Average minutes from request broadcast to donor confirmation
          </p>

          <div className="absolute left-[75px] top-[110px] w-[575px] h-[280px]">
            {/* Y axis labels */}
            {chartYAxis.map((label, i) => (
              <span
                key={label}
                className="absolute -translate-x-1/2 font-poppins font-bold text-[11px] text-[#8d8d8d]"
                style={{ left: 1, top: i * 62 - 6 }}
              >
                {label}
              </span>
            ))}

            <svg className="absolute left-[12px] top-0" width="551" height={CHART_PLOT_HEIGHT} viewBox={`0 0 575 ${CHART_PLOT_HEIGHT}`}>
              {/* Dotted horizontal gridlines at each y-axis tick */}
              {chartGridYs.map((y) => (
                <line key={y} x1="0" y1={y} x2="575" y2={y} stroke="#d9d9d9" strokeWidth="1.5" strokeDasharray="2 5" strokeLinecap="round" />
              ))}
              {/* Dashed SLA target line */}
              <line x1="0" y1={SLA_TARGET_Y} x2="575" y2={SLA_TARGET_Y} stroke="#aaaaaa" strokeWidth="1.5" strokeDasharray="7 5" />
              {/* Area fill under the curve */}
              <path d={chartAreaPath} fill="#f1dddc" opacity="0.7" />
              {/* Response time line */}
              <path d={chartLinePath} fill="none" stroke="#8f404b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {/* Data point markers */}
              {chartPoints.map((p) => (
                <circle key={p.x} cx={p.x} cy={p.y} r="6" fill="#8f404b" />
              ))}
            </svg>

            {/* X axis labels */}
            {chartXAxis.map((label, i) => (
              <span
                key={label}
                className="absolute -translate-x-1/2 font-poppins font-bold text-[11px] text-[#8d8d8d] whitespace-nowrap"
                style={{ left: 22 + i * 86, top: 258 }}
              >
                {label}
              </span>
            ))}
          </div>

          <div className="absolute left-[131px] top-[410px] flex items-center gap-2">
            <span className="w-[14px] h-[14px] rounded-[5px] bg-[#8f404b] shrink-0" />
            <span className="font-poppins font-bold text-[11px] text-black whitespace-nowrap">Avg Response (min)</span>
          </div>
          <div className="absolute left-[333px] top-[410px] flex items-center gap-2">
            <span className="w-[14px] h-[14px] rounded-[5px] bg-[#b3b3b3] shrink-0" />
            <span className="font-poppins font-bold text-[11px] text-black whitespace-nowrap">SLA Target</span>
          </div>
        </div>

        {/* Fulfillment Rate donut */}
        <div className="absolute left-[778px] top-[370px] bg-white rounded-[10px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.1)] w-[305px] h-[433px]">
          <p className="absolute left-[19px] top-[19px] font-poppins font-semibold text-[20px] text-black">Fulfillment Rate</p>
          <p className="absolute left-[19px] top-[49px] font-poppins font-medium text-[11px] text-[#868686] w-[265px]">
            Quota met within required windows
          </p>
          <div
            className="absolute left-[73px] top-[95px] w-[160px] h-[160px] rounded-full flex items-center justify-center"
            style={{
              background: `conic-gradient(${fulfillmentBreakdown[0].color} 0% 35%, ${fulfillmentBreakdown[1].color} 35% 65%, ${fulfillmentBreakdown[2].color} 65% 100%)`,
            }}
          >
            <div className="w-[96px] h-[96px] rounded-full bg-white" />
          </div>
          <div className="absolute left-[19px] top-[280px] flex flex-col gap-[12px] w-[267px]">
            {fulfillmentBreakdown.map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-[10px] h-[10px] rounded-full" style={{ background: item.color }} />
                  <span className="font-poppins font-medium text-[13px] text-black">{item.label}</span>
                </div>
                <span className="font-poppins font-bold text-[13px] text-black">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Fulfillment Log */}
        <div
          className="absolute left-[15px] top-[855px] bg-white rounded-[10px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.1)] w-[725px]"
          style={{ height: logCardHeight }}
        />
        <p className="absolute left-[22px] top-[878px] font-poppins font-semibold text-[20px] text-black">Recent Fulfillment Log</p>
        <p className="absolute left-[22px] top-[908px] font-poppins font-semibold text-[15px] text-[#808080] w-[420px]">
          Detailed audit of the last {visibleRows.length} high-priority requests.
        </p>
        <button
          type="button"
          onClick={() => setShowAllLogs((v) => !v)}
          className="absolute left-[520px] top-[881px] border-2 border-[#d9d9d9] rounded-[16px] w-[191px] h-[49px] flex items-center justify-center cursor-pointer hover:bg-[#f6f5f4] transition-colors"
        >
          <span className="font-poppins font-medium text-[17px] text-black whitespace-nowrap">
            {showAllLogs ? "Show Less" : "View Detailed Log"}
          </span>
        </button>

        <div className="absolute left-[42px] top-[962px] bg-[#fff5f5] border border-[#efeeed] w-[672px] h-[54px] flex items-center px-4 text-[13px] font-poppins font-semibold text-[#808080] tracking-wide">
          <span className="w-[135px] text-center">REQUEST ID</span>
          <span className="w-[110px] text-center">TYPE</span>
          <span className="w-[95px] text-center">PRIORITY</span>
          <span className="w-[120px] text-center">TIME TO CONFIRM</span>
          <span className="w-[110px] text-center">SYSTEM RATING</span>
          <span className="w-[95px] text-center">ACTION</span>
        </div>

        {visibleRows.length === 0 && (
          <div className="absolute left-[42px] top-[1016px] w-[672px] h-[62px] flex items-center justify-center text-[13px] text-[#aaa4a0] font-medium border border-[#c0bfbf]">
            No requests match this priority.
          </div>
        )}

        {visibleRows.map((row, i) => (
          <div
            key={`${row.reqId}-${i}`}
            className="absolute left-[42px] bg-white border border-[#c0bfbf] shadow-[0px_3px_6px_0px_rgba(0,0,0,0.1)] w-[672px] h-[62px] flex items-center px-4"
            style={{ top: 1016 + i * 62 }}
          >
            <div className="w-[135px] flex justify-center">
              <span className="font-poppins font-semibold text-[13px] text-[#8f404b]">{row.reqId}</span>
            </div>
            <div className="w-[110px] flex justify-center">
              <div className="border-2 border-[#c5c4c4] rounded-[10px] px-2 h-[24px] flex items-center justify-center">
                <span className="font-poppins font-semibold text-[11px] text-[#868686]">{row.blood}</span>
              </div>
            </div>
            <div className="w-[95px] flex items-center justify-center gap-1">
              {row.hasEllipse ? (
                <>
                  <img alt="" className="w-[16px] h-[14px]" src={imgEllipse45} />
                  <span className={`font-poppins font-semibold text-[11px] tracking-wide ${row.priorityColor}`}>{row.priority}</span>
                </>
              ) : (
                <span className="font-poppins font-medium text-[13px] text-[#868686]">
                  {row.priority.charAt(0) + row.priority.slice(1).toLowerCase()}
                </span>
              )}
            </div>
            <span className="w-[120px] text-center font-poppins font-semibold text-[13px] text-[#868686]">{row.time}</span>
            <div className="w-[110px] flex justify-center">
              <span className="border-2 border-[#c5c4c4] rounded-full px-3 h-[24px] flex items-center justify-center font-poppins font-semibold text-[13px] text-[#868686] whitespace-nowrap">
                {row.rating}
              </span>
            </div>
            <div className="w-[95px] flex justify-center">
              <button type="button" className="flex flex-col items-center gap-[2px] cursor-pointer" aria-label="Row actions">
                <span className="w-[3px] h-[3px] rounded-full bg-[#808080]" />
                <span className="w-[3px] h-[3px] rounded-full bg-[#808080]" />
                <span className="w-[3px] h-[3px] rounded-full bg-[#808080]" />
              </button>
            </div>
          </div>
        ))}

        {/* System Health card */}
        <div className="absolute left-[778px] top-[813px] bg-white rounded-tr-[10px] rounded-br-[10px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1)] w-[305px] h-[172px]">
          <div className="absolute left-0 top-0 w-[3px] h-full bg-[#ad2b21] rounded-tr-[3px] rounded-br-[3px]">
            <img alt="" className="hidden" src={imgLine35} />
          </div>
          <div className="pl-[22px] pr-[22px] pt-[16px] pb-[28px] flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="font-poppins font-bold text-[15px] text-[#808080] tracking-wide">SYSTEM HEALTH</span>
              <span className="border border-[#b3b3b3] rounded-full px-3 h-[22px] flex items-center justify-center font-poppins font-bold text-[10px] text-[#868686] tracking-wide">
                STABLE
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-poppins font-medium text-[12px] text-[#868686]">Min-Heap Latency</span>
              <span className="font-poppins font-bold text-[12px] text-black">12ms</span>
            </div>
            <div className="w-full h-[3px] bg-[#f1dddc] rounded-full" />
            <div className="flex items-center justify-between">
              <span className="font-poppins font-medium text-[12px] text-[#868686]">Database Sync</span>
              <span className="font-poppins font-bold text-[12px] text-black">Real-time</span>
            </div>
            <div className="w-full h-[3px] bg-[#f1dddc] rounded-full" />
          </div>
        </div>

        {/* Demand Forecast card */}
        <div className="absolute left-[778px] top-[1010px] bg-[rgba(255,245,245,0.85)] rounded-[10px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1)] w-[305px] h-[215px]">
          <p className="absolute left-[19px] top-[13px] font-poppins font-semibold text-[15px] text-[#ad2b21] tracking-wide">DEMAND FORECAST</p>
          <p className="absolute left-[19px] top-[42px] font-poppins font-medium text-[10px] text-[#868686] w-[265px]">
            Based on historical trends, we anticipate 15% increase in O- and demand over the next 48 hours.
          </p>
          <div className="absolute left-[19px] top-[92px] bg-white rounded-[10px] w-[265px] h-[67px]">
            <img alt="" className="absolute left-[9px] top-[9px] w-[16px] h-[16px]" src={imgGroup6} />
            <p className="absolute left-[33px] top-[9px] font-poppins font-semibold text-[12px] text-[#ad2b21] tracking-wide">MEDTECH ADVISORY</p>
            <p className="absolute left-[9px] top-[27px] font-poppins font-medium text-[9px] text-[#868686] w-[242px]">
              Recommend pre-emptive alerts to scheduled donors for O- and B- types.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/donor-management")}
            className="absolute left-[19px] top-[168px] bg-[#ad2b21] rounded-[16px] w-[265px] h-[37px] flex items-center justify-center cursor-pointer hover:bg-[#8f2419] transition-colors"
          >
            <span className="font-poppins font-bold text-[15px] text-white">Review Prep List</span>
          </button>
        </div>
      </div>
    </div>
  );
}
