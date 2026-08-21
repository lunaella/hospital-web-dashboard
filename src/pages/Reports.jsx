import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { api } from "../lib/apiClient";
import { useHospital } from "../context/HospitalContext";
import {
  IconDownload,
  IconCalendar,
  IconFilter,
  IconClock,
  IconUsers,
  IconCheckCircle,
  IconArrowUp,
  IconArrowDown,
  IconDroplet,
  IconAlert,
  IconStethoscope,
} from "../components/icons";

// Static per-card chrome; value/trend come from the API.
const KPI_META = {
  meanResponseTimeMinutes: { key: "response-time", left: "left-[277px]", label: "Mean Response Time", badgeIcon: IconClock },
  activeDonorsReach: { key: "active-donors", left: "left-[554px]", label: "Active Donors Reach", badgeIcon: IconUsers },
};

function priorityColorFor(priority) {
  return priority === "EMERGENCY" ? "text-[#c26460]" : "text-[#868686]";
}

// Same three states/colors as the Dashboard pill (kept in sync since both
// read from the same live-checked GET .../system-health payload).
const SYSTEM_HEALTH_BADGE = {
  OPTIMAL: { label: "Optimal", border: "border-[#bfe3c8]", text: "text-[#1e7d32]" },
  DEGRADED: { label: "Degraded", border: "border-[#f0dfa8]", text: "text-[#8a6d1f]" },
  CRITICAL: { label: "Disconnected", border: "border-[#eec3c1]", text: "text-[#b94842]" },
};

function formatTrend(trendPct) {
  if (trendPct == null) return "--";
  return `${trendPct > 0 ? "+" : ""}${trendPct}%`;
}

// Was previously a hardcoded up arrow on every KPI card (and a hardcoded
// down arrow, separately, on Units Processed) regardless of which way the
// number actually moved. Now the icon/color follow the real sign: up +
// black for an increase, down + red for a decrease, and no icon at all
// when there's no prior-window data to compare against (trendPct null —
// the "--" case), since there's nothing to point up or down about yet.
function TrendBadge({ trendPct }) {
  if (trendPct == null) {
    return <span className="font-poppins font-medium text-[11px] text-[#aaa4a0]">--</span>;
  }
  const isDown = trendPct < 0;
  const Arrow = isDown ? IconArrowDown : IconArrowUp;
  const colorClass = isDown ? "text-[#c46865]" : "text-black";
  return (
    <>
      <Arrow className={`w-4 h-4 ${colorClass}`} />
      <span className={`font-poppins font-medium text-[11px] ${colorClass}`}>{formatTrend(trendPct)}</span>
    </>
  );
}

const DATE_RANGES = ["Last 7 days", "Last 30 days", "Last 90 days"];
const PRIORITY_FILTERS = ["all", "EMERGENCY", "URGENT", "NORMAL"];

// Same red/gold/green identity as before, just brighter and more saturated
// versions — the muted brick/mustard/sage tones read flat next to the
// login page's vivid gradient red (#d94636), so this brings the donut in
// line with that punchier feel instead of a desaturated earth-tone set.
const BREAKDOWN_META = [
  { key: "emergency", label: "Emergency", color: "#d94636" },
  { key: "urgent", label: "Urgent", color: "#e8b923" },
  { key: "normal", label: "Normal", color: "#43a047" },
];

const chartYAxis = ["24", "18", "12", "6", "0"];

// Plot geometry: 248px-tall plot area maps value range [0, 24] to y range [248, 0].
const CHART_MAX = 24;
const CHART_PLOT_HEIGHT = 248;
const valueToY = (value) => ((CHART_MAX - Math.min(value, CHART_MAX)) / CHART_MAX) * CHART_PLOT_HEIGHT;
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

const chartGridYs = [0, 62, 124, 186, 248];

export default function Reports() {
  const navigate = useNavigate();
  const { hospitalId } = useHospital();
  const [dateRange, setDateRange] = useState("Last 30 days");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [openLogMenu, setOpenLogMenu] = useState(null);

  const [kpis, setKpis] = useState(null);
  const [fulfillmentRatePct, setFulfillmentRatePct] = useState(null);
  const [responseTimeSeries, setResponseTimeSeries] = useState([]);
  const [fulfillmentLog, setFulfillmentLog] = useState([]);
  const [breakdown, setBreakdown] = useState(null);
  const [systemHealth, setSystemHealth] = useState(null);
  const [demandForecast, setDemandForecast] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [kpisData, dashboardStats, series, log, breakdownData, health, forecast] = await Promise.all([
          api.get("/api/reports/kpis"),
          api.get("/api/dashboard/stats"),
          api.get("/api/reports/response-time"),
          api.get("/api/reports/fulfillment-log?limit=20"),
          api.get("/api/reports/fulfillment-breakdown"),
          api.get("/api/reports/system-health"),
          api.get("/api/reports/demand-forecast"),
        ]);
        if (cancelled) return;

        setKpis(kpisData);
        setFulfillmentRatePct(dashboardStats.fulfillmentRatePct);
        setResponseTimeSeries(series);
        setFulfillmentLog(log);
        setBreakdown(breakdownData);
        setSystemHealth(health);
        setDemandForecast(forecast);
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [hospitalId]);

  function cycleDateRange() {
    setDateRange((prev) => {
      const idx = DATE_RANGES.indexOf(prev);
      return DATE_RANGES[(idx + 1) % DATE_RANGES.length];
    });
  }

  const visibleRows = (
    priorityFilter === "all" ? fulfillmentLog : fulfillmentLog.filter((r) => r.priority === priorityFilter)
  ).slice(0, showAllLogs ? undefined : 4);
  const extraRowCount = Math.max(0, visibleRows.length - 4);
  const logCardHeight = 446 + extraRowCount * 62;
  const rootHeight = 1350 + extraRowCount * 62;

  // Chart geometry derived from the fetched 7-day series.
  const chartPoints = responseTimeSeries.map((d, i) => ({ x: 22 + i * 86, y: valueToY(d.avgMinutes ?? 0) }));
  const chartLinePath = buildSmoothPath(chartPoints);
  const chartAreaPath =
    chartPoints.length > 1
      ? `${chartLinePath} L ${chartPoints[chartPoints.length - 1].x} ${CHART_PLOT_HEIGHT} L ${chartPoints[0].x} ${CHART_PLOT_HEIGHT} Z`
      : "";
  const chartXAxis = responseTimeSeries.map((d) =>
    new Date(d.date).toLocaleDateString("en-US", { day: "2-digit", month: "short" })
  );

  const kpiCards = kpis
    ? [
        { ...KPI_META.meanResponseTimeMinutes, value: `${kpis.meanResponseTimeMinutes.value} min`, trendPct: kpis.meanResponseTimeMinutes.trendPct },
        { ...KPI_META.activeDonorsReach, value: String(kpis.activeDonorsReach.value), trendPct: kpis.activeDonorsReach.trendPct },
      ]
    : [];

  const fulfillmentBreakdown = breakdown
    ? BREAKDOWN_META.map((meta) => ({ ...meta, value: `${breakdown[meta.key]}%`, pct: breakdown[meta.key] }))
    : [];
  // conic-gradient stop percentages accumulate across the three segments.
  const breakdownStops = fulfillmentBreakdown.reduce((acc, item) => {
    const start = acc.length ? acc[acc.length - 1].end : 0;
    acc.push({ ...item, start, end: start + item.pct });
    return acc;
  }, []);

  // System Health card level bars. 200ms mirrors DB_DEGRADED_MS in
  // server/src/utils/systemHealth.js — used only to scale the latency bar
  // visually, not to re-derive the OPTIMAL/DEGRADED/CRITICAL classification
  // (the badge above already reflects the server's own verdict on that).
  const MAX_EXPECTED_LATENCY_MS = 200;
  const latencyLevelPct = systemHealth
    ? Math.min(100, Math.round((systemHealth.broadcastLatencyMs / MAX_EXPECTED_LATENCY_MS) * 100))
    : 0;
  const SYNC_LEVEL_BY_STATUS = { OPTIMAL: 100, DEGRADED: 55, CRITICAL: 8 };
  const syncLevelPct = SYNC_LEVEL_BY_STATUS[systemHealth?.overallStatus] ?? 0;
  const healthBarFillClass =
    systemHealth?.overallStatus === "CRITICAL" ? "bg-[#b94842]" : "bg-[#9B1B20]";

  // Demand Forecast card copy, derived from the real 48h-trend payload
  // (see server getDemandForecast) instead of hardcoded text.
  const forecastHeadline = (() => {
    if (!demandForecast) return "Loading demand trends...";
    const h = demandForecast.headline;
    if (!h) return "Demand across all blood types has stayed steady over the past 48 hours — no significant shifts detected.";
    if (h.kind === "new") {
      return `New demand has emerged for ${h.bloodType} over the past 48 hours (${h.units} units requested), with no prior baseline to compare against.`;
    }
    return `Based on the past 48 hours, ${h.bloodType} demand rose ${h.pctChange}% compared to the prior 48 hours — expect continued elevated need if the trend holds.`;
  })();

  const advisoryText = (() => {
    if (!demandForecast) return "Checking current stock levels...";
    const types = demandForecast.advisoryTypes;
    if (!types?.length) return "No blood types currently require pre-emptive donor outreach.";
    const list = types.length === 2 ? `${types[0]} and ${types[1]}` : types[0];
    return `Recommend pre-emptive alerts to scheduled donors for ${list} type${types.length > 1 ? "s" : ""}.`;
  })();

  return (
    <div className="bg-white relative w-[1440px] mx-auto font-poppins" style={{ height: rootHeight }}>

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

        {loadError && (
          <p className="absolute left-0 top-[155px] font-poppins font-medium text-[12px] text-[#d70b07]">
            Couldn't load report data: {loadError}
          </p>
        )}

        {/* Action buttons */}
        <button
          type="button"
          onClick={() => window.print()}
          className="absolute left-[899px] top-[109px] bg-[#9B1B20] rounded-[16px] w-[166px] h-[49px] flex items-center justify-center gap-2 cursor-pointer hover:bg-[#8B1218] transition-colors"
        >
          <span className="font-poppins font-bold text-[17px] text-white">Export PDF</span>
          <IconDownload className="w-4 h-4 text-white" />
        </button>
        <button
          type="button"
          onClick={cycleDateRange}
          className="absolute left-[573px] top-[109px] border-2 border-[#d9d9d9] rounded-[16px] w-[180px] h-[49px] flex items-center justify-center gap-2 cursor-pointer"
        >
          <IconCalendar className="w-4 h-4 text-black" />
          <span className="font-poppins font-bold text-[17px] text-black whitespace-nowrap">{dateRange}</span>
        </button>
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className={`absolute left-[763px] top-[109px] border-2 rounded-[16px] w-[126px] h-[49px] flex items-center justify-center gap-2 cursor-pointer ${
            filtersOpen ? "border-[#9B1B20] bg-[#fbf3f3]" : "border-[#d9d9d9]"
          }`}
        >
          <IconFilter className="w-4 h-4 text-black" />
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
                    priorityFilter === p ? "bg-[#9B1B20] text-white" : "text-[#808080] hover:bg-[#fbf3f3]"
                  }`}
                >
                  {p === "all" ? "All Priorities" : p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* KPI cards — top-[193px] matches the other three cards below;
            this one was previously top-[186px], a 7px offset that made the
            row look uneven. */}
        <div className="absolute left-[3px] top-[193px] bg-white rounded-[16px] shadow-[0px_2px_5px_0px_rgba(0,0,0,0.1)] w-[247px] h-[149px]">
          <div className="absolute left-[26px] top-[21px] bg-[#f1dddc] rounded-[8px] w-[33px] h-[30px] flex items-center justify-center">
            <IconCheckCircle className="w-3.5 h-3.5 text-[#9B1B20]" />
          </div>
          <p className="absolute left-[25px] top-[59px] font-poppins font-bold text-[35px] text-black">
            {fulfillmentRatePct != null ? `${fulfillmentRatePct}%` : "--"}
          </p>
          <p className="absolute left-[25px] top-[104px] font-poppins font-bold text-[17px] text-[#808080]">Avg Fulfillment Rate</p>
        </div>

        {kpiCards.map((card) => {
          const BadgeIcon = card.badgeIcon;
          return (
            <div key={card.key} className={`absolute ${card.left} top-[193px] bg-white rounded-[16px] shadow-[0px_2px_5px_0px_rgba(0,0,0,0.1)] w-[247px] h-[149px]`}>
              <div className="absolute left-[19px] top-[14px] bg-[#f1dddc] rounded-[8px] w-[33px] h-[30px] flex items-center justify-center">
                <BadgeIcon className="w-3.5 h-3.5 text-[#9B1B20]" />
              </div>
              <div className="absolute top-[14px] right-[19px] flex items-center gap-1.5">
                <TrendBadge trendPct={card.trendPct} />
              </div>
              <p className="absolute left-[20px] top-[98px] font-poppins font-bold text-[35px] text-black">{card.value}</p>
              <p className="absolute left-[20px] top-[68px] font-poppins font-bold text-[17px] text-[#808080]">{card.label}</p>
            </div>
          );
        })}

        <div className="absolute left-[831px] top-[193px] bg-white rounded-[16px] shadow-[0px_2px_5px_0px_rgba(0,0,0,0.1)] w-[247px] h-[149px]">
          <div className="absolute left-[20px] top-[14px] bg-[#f1dddc] rounded-[8px] w-[33px] h-[30px] flex items-center justify-center">
            <IconDroplet className="w-3.5 h-3.5 text-[#9B1B20]" />
          </div>
          <div className="absolute top-[14px] right-[19px] flex items-center gap-1.5">
            <TrendBadge trendPct={kpis ? kpis.unitsProcessed.trendPct : null} />
          </div>
          <p className="absolute left-[20px] top-[98px] font-poppins font-bold text-[35px] text-black">
            {kpis ? kpis.unitsProcessed.value : "--"}
          </p>
          <p className="absolute left-[20px] top-[68px] font-poppins font-bold text-[17px] text-[#808080]">Units Processed</p>
        </div>

        {/* Donor Response Time chart */}
        <div className="absolute left-[15px] top-[370px] bg-white rounded-[10px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.1)] w-[725px] h-[446px]">
          {/* Genuinely true: broadcast dispatch (server/src/services/notifications.service.js
              -> rankDonorsByResponseTime) ranks matching donors with a real
              binary min-heap keyed on their historical average response
              time, and contacts the fastest-typical responders first. */}
          <div className="absolute left-[543px] top-[18px] bg-[rgba(173,43,33,0.1)] rounded-[10px] w-[145px] h-[19px] flex items-center justify-center">
            <span className="font-poppins font-bold text-[10px] text-[#9B1B20]">Min-Heap Optimized</span>
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
              <path d={chartLinePath} fill="none" stroke="#9B1B20" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {/* Data point markers */}
              {chartPoints.map((p) => (
                <circle key={p.x} cx={p.x} cy={p.y} r="6" fill="#9B1B20" />
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
            <span className="w-[14px] h-[14px] rounded-[5px] bg-[#9B1B20] shrink-0" />
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
              background: breakdownStops.length
                ? `conic-gradient(${breakdownStops.map((s) => `${s.color} ${s.start}% ${s.end}%`).join(", ")})`
                : "#f0f0f0",
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
              <span className="font-poppins font-semibold text-[13px] text-[#9B1B20]">{row.reqId}</span>
            </div>
            <div className="w-[110px] flex justify-center">
              <div className="border-2 border-[#c5c4c4] rounded-[10px] px-2 h-[24px] flex items-center justify-center">
                <span className="font-poppins font-semibold text-[11px] text-[#868686]">{row.blood}</span>
              </div>
            </div>
            <div className="w-[95px] flex items-center justify-center gap-1">
              {row.hasEllipse ? (
                <>
                  <IconAlert className="w-[16px] h-[14px] text-[#c26460]" />
                  <span className={`font-poppins font-semibold text-[11px] tracking-wide ${priorityColorFor(row.priority)}`}>{row.priority}</span>
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
                {row.rating ?? "Pending"}
              </span>
            </div>
            <div className="w-[95px] flex justify-center relative">
              <button
                type="button"
                onClick={() => setOpenLogMenu((v) => (v === `${row.reqId}-${i}` ? null : `${row.reqId}-${i}`))}
                className="flex flex-col items-center gap-[2px] cursor-pointer"
                aria-label="Row actions"
              >
                <span className="w-[3px] h-[3px] rounded-full bg-[#808080]" />
                <span className="w-[3px] h-[3px] rounded-full bg-[#808080]" />
                <span className="w-[3px] h-[3px] rounded-full bg-[#808080]" />
              </button>
              {openLogMenu === `${row.reqId}-${i}` && (
                <div className="absolute right-0 top-[24px] w-[190px] bg-white rounded-[10px] border border-[#d9d9d9] shadow-[0px_8px_8px_0px_rgba(0,0,0,0.09)] py-1 z-30">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenLogMenu(null);
                      navigate("/view-broadcasts", { state: { presetSearch: row.reqId } });
                    }}
                    className="w-full text-left px-3 py-2 text-[12px] font-poppins font-medium text-black hover:bg-[#fbf3f3] cursor-pointer whitespace-nowrap"
                  >
                    View Broadcast Details
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenLogMenu(null)}
                    className="w-full text-left px-3 py-2 text-[12px] font-poppins font-medium text-[#808080] hover:bg-[#fbf3f3] cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* System Health card */}
        <div className="absolute left-[778px] top-[813px] bg-white rounded-tr-[10px] rounded-br-[10px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1)] w-[305px] h-[172px]">
          <div className="absolute left-0 top-0 w-[3px] h-full bg-[#9B1B20] rounded-tr-[3px] rounded-br-[3px]" />
          <div className="pl-[22px] pr-[22px] pt-[16px] pb-[28px] flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="font-poppins font-bold text-[15px] text-[#808080] tracking-wide">SYSTEM HEALTH</span>
              {(() => {
                const badge = SYSTEM_HEALTH_BADGE[systemHealth?.overallStatus] ?? null;
                return (
                  <span
                    className={`border rounded-full px-3 h-[22px] flex items-center justify-center font-poppins font-bold text-[10px] tracking-wide transition-colors ${
                      badge ? `${badge.border} ${badge.text}` : "border-[#b3b3b3] text-[#868686]"
                    }`}
                  >
                    {badge ? badge.label.toUpperCase() : "--"}
                  </span>
                );
              })()}
            </div>
            <div className="flex items-center justify-between">
              <span className="font-poppins font-medium text-[12px] text-[#868686]">Broadcast Latency</span>
              <span className="font-poppins font-bold text-[12px] text-black">
                {systemHealth ? `${systemHealth.broadcastLatencyMs}ms` : "--"}
              </span>
            </div>
            <div className="w-full h-[3px] bg-[#f1dddc] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${healthBarFillClass}`}
                style={{ width: `${latencyLevelPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="font-poppins font-medium text-[12px] text-[#868686]">Database Sync</span>
              <span className="font-poppins font-bold text-[12px] text-black">{systemHealth?.dbSyncStatus ?? "--"}</span>
            </div>
            <div className="w-full h-[3px] bg-[#f1dddc] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${healthBarFillClass}`}
                style={{ width: `${syncLevelPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Demand Forecast card */}
        <div className="absolute left-[778px] top-[1010px] bg-[rgba(255,245,245,0.85)] rounded-[10px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1)] w-[305px] h-[215px]">
          <p className="absolute left-[19px] top-[13px] font-poppins font-semibold text-[15px] text-[#9B1B20] tracking-wide">DEMAND FORECAST</p>
          {/* line-clamp keeps this within its allotted 50px (top-42 to
              top-92) no matter how long the live-computed sentence is, so it
              can never grow into the MEDTECH ADVISORY box below it. */}
          <p className="absolute left-[19px] top-[42px] font-poppins font-medium text-[10px] text-[#868686] w-[265px] leading-[1.4] line-clamp-3">
            {forecastHeadline}
          </p>
          <div className="absolute left-[19px] top-[92px] bg-white rounded-[10px] w-[265px] h-[67px]">
            <IconStethoscope className="absolute left-[9px] top-[9px] w-[16px] h-[16px] text-[#9B1B20]" />
            <p className="absolute left-[33px] top-[9px] font-poppins font-semibold text-[12px] text-[#9B1B20] tracking-wide">MEDTECH ADVISORY</p>
            <p className="absolute left-[9px] top-[27px] font-poppins font-medium text-[9px] text-[#868686] w-[242px] leading-[1.4] line-clamp-2">
              {advisoryText}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/donor-management")}
            className="absolute left-[19px] top-[168px] bg-[#9B1B20] rounded-[16px] w-[265px] h-[37px] flex items-center justify-center cursor-pointer hover:bg-[#8B1218] transition-colors"
          >
            <span className="font-poppins font-bold text-[15px] text-white">Review Prep List</span>
          </button>
        </div>
      </div>
    </div>
  );
}
