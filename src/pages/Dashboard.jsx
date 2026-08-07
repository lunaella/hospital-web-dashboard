import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { fuzzyMatchAny } from "../utils/fuzzySearch";
import { api } from "../lib/apiClient";
import { useHospital } from "../context/HospitalContext";
import Avatar from "../components/Avatar";
import {
  IconChevronRight,
  IconAlert,
  IconClock,
  IconMegaphone,
  IconDroplet,
  IconUsers,
  IconCheckCircle,
  IconMapPin,
  IconSearch,
  IconChart,
} from "../components/icons";

// Static per-card chrome (icon/label/copy) — only the numbers underneath
// come from the API. Trend badges only render for metrics the backend
// actually computes a day-over-day comparison for; fabricating a percentage
// for the others would be worse than just not showing one.
const STAT_CARD_META = {
  codeRed: { icon: IconMegaphone, accent: true, label: "CODE RED BROADCASTS", sub: "Active emergency requests" },
  unitsNeeded: { icon: IconDroplet, label: "Units Needed", sub: "Total volume across all active broadcast" },
  activeDonors: { icon: IconUsers, label: "Active Donors" },
  fulfillmentRate: { icon: IconCheckCircle, label: "Fulfillment Rate", sub: "Successful quotas met (Last 24h)" },
};

function formatElapsed(seconds) {
  if (seconds == null) return "--";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h ${String(rem).padStart(2, "0")}m`;
}

function formatRelativeTime(isoString) {
  if (!isoString) return "--";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.max(0, Math.round(diffMs / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function stockStatusColor(status) {
  return status === "CRITICAL" ? "text-[#b94842] bg-[#f5e8e7]" : "text-black";
}

// Three distinct visual states for the System Health pill, driven by
// GET /api/dashboard/health (live DB/Redis reachability + latency check —
// see server/src/utils/systemHealth.js).
const SYSTEM_HEALTH_META = {
  OPTIMAL: {
    label: "System Health: Optimal",
    border: "border-[#bfe3c8]",
    bg: "bg-[#f0faf3]",
    text: "text-[#1e7d32]",
    dot: "bg-[#1e7d32]",
  },
  DEGRADED: {
    label: "System Health: Degraded",
    border: "border-[#f0dfa8]",
    bg: "bg-[#fdf8ea]",
    text: "text-[#8a6d1f]",
    dot: "bg-[#c9992a]",
  },
  CRITICAL: {
    label: "System Health: Disconnected",
    border: "border-[#eec3c1]",
    bg: "bg-[#fbeeed]",
    text: "text-[#b94842]",
    dot: "bg-[#b94842]",
  },
};

function PriorityBadge({ priority }) {
  const colorMap = {
    EMERGENCY: "text-[#c26460]",
    URGENT: "text-black",
    NORMAL: "text-black",
  };
  return (
    <div className="flex items-center justify-center gap-1">
      {priority === "EMERGENCY" && <IconAlert className="w-[16px] h-[14px] text-[#c26460]" />}
      <span className={`font-poppins font-semibold text-[11px] tracking-wide ${colorMap[priority]}`}>{priority}</span>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { hospitalId, hospitals } = useHospital();
  const selectedHospitalName = hospitals.find((h) => h.id === hospitalId)?.name;
  const hospitalScopeLabel = hospitalId === "all" ? "all hospitals" : selectedHospitalName || "the selected hospital";
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState(null);
  const [monitoringRows, setMonitoringRows] = useState([]);
  const [stockCriticality, setStockCriticality] = useState([]);
  const [recentArrivals, setRecentArrivals] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [systemHealth, setSystemHealth] = useState(null);

  // Fetched independently from the rest of the dashboard data: if the API
  // can't be reached at all, that failure IS the "Critical/Disconnected"
  // state, so it needs its own catch instead of failing alongside (and
  // being masked by) the other Promise.all calls below.
  useEffect(() => {
    let cancelled = false;

    async function loadHealth() {
      try {
        const health = await api.get("/api/dashboard/health");
        if (!cancelled) setSystemHealth(health);
      } catch {
        if (!cancelled) setSystemHealth({ overallStatus: "CRITICAL" });
      }
    }

    loadHealth();
    const interval = setInterval(loadHealth, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [statsData, monitoring, stock, arrivals] = await Promise.all([
          api.get("/api/dashboard/stats"),
          api.get("/api/dashboard/monitoring"),
          api.get("/api/dashboard/stock"),
          api.get("/api/dashboard/arrivals"),
        ]);
        if (cancelled) return;

        setStats(statsData);
        setMonitoringRows(
          monitoring.map((row) => ({
            id: row.id,
            bloodType: row.bloodType,
            priority: row.priority,
            ward: row.ward,
            units: `${row.unitsFulfilled}/${row.unitsNeeded} Units`,
            pct: row.pct,
            time: formatElapsed(row.seconds_open),
          }))
        );
        setStockCriticality(
          stock.map((item) => ({
            type: item.type,
            status: item.status,
            statusColor: stockStatusColor(item.status),
            units: `${item.units}U`,
          }))
        );
        setRecentArrivals(
          arrivals.map((person) => ({
            name: person.name,
            bloodType: person.bloodType,
            time: formatRelativeTime(person.arrivedAt),
          }))
        );
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [hospitalId]);

  const statCards = stats
    ? [
        { ...STAT_CARD_META.codeRed, value: String(stats.codeRedBroadcasts).padStart(2, "0") },
        { ...STAT_CARD_META.unitsNeeded, value: String(stats.unitsNeeded) },
        {
          ...STAT_CARD_META.activeDonors,
          value: String(stats.activeDonors.arrived + stats.activeDonors.inTransit),
          sub: `${stats.activeDonors.arrived} Arrived + ${stats.activeDonors.inTransit} In-Transit`,
        },
        { ...STAT_CARD_META.fulfillmentRate, value: `${stats.fulfillmentRatePct}%` },
      ]
    : [];

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

  // The Recent Arrivals card and its "View Full Donor Management" button
  // were laid out assuming exactly 3 rows; real data can return more (up to
  // the /api/dashboard/arrivals limit), so both need to grow with the list
  // instead of the button sitting fixed and overlapping row 3+.
  const EXTRA_ARRIVALS = Math.max(0, filteredRecentArrivals.length - 3);
  const ARRIVALS_SHIFT = EXTRA_ARRIVALS * 58; // 45px avatar + 13px row gap

  return (
    <div className="bg-white relative w-[1440px] mx-auto" style={{ height: 1335 + ARRIVALS_SHIFT }}>

      {/* Top bar */}
      <PageHeader
        title="Hospital Overview"
        right={
          <div className="h-[40.62px] w-[293.783px] bg-[#f6f5f4] rounded-[13px] shadow-[0px_5px_5px_0px_rgba(0,0,0,0.09)] flex items-center gap-2 px-4">
            <IconSearch className="w-[16px] h-[16px] shrink-0 text-[#b3b3b3]" />
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
          Real-time blood resource logistics for {hospitalScopeLabel}
        </div>

        {loadError && (
          <div className="absolute left-0 top-[228px] font-poppins font-medium text-[12px] text-[#d70b07]">
            Couldn't load live data: {loadError}
          </div>
        )}

        {(() => {
          const health = SYSTEM_HEALTH_META[systemHealth?.overallStatus] ?? null;
          return (
            <div className="absolute contents left-[578px] top-[138px]">
              <div
                className={`absolute border-2 h-[49px] left-[578px] rounded-[16px] top-[138px] flex items-center gap-2 px-5 whitespace-nowrap transition-colors ${
                  health ? `${health.border} ${health.bg}` : "border-[#d9d9d9]"
                }`}
              >
                <span
                  className={`w-[8px] h-[8px] rounded-full shrink-0 ${health ? health.dot : "bg-[#b3b3b3]"}`}
                />
                <span className={`font-poppins font-bold text-[14px] whitespace-nowrap ${health ? health.text : "text-black"}`}>
                  {health ? health.label : "System Health: Checking..."}
                </span>
              </div>
            </div>
          );
        })()}

        <button
          type="button"
          onClick={() => openModal("/new-broadcast")}
          className="absolute bg-[#ad2b21] h-[49px] left-[871px] rounded-[16px] top-[138px] w-[215px] flex items-center justify-center gap-2 cursor-pointer hover:bg-[#8f2419] transition-colors"
        >
          <IconMegaphone className="w-5 h-5 text-white" strokeWidth="2.2" />
          <span className="font-poppins font-bold text-[17px] text-white">New Broadcast</span>
        </button>

        {/* Stat cards */}
        <div className="absolute left-0 top-[236px] w-full flex items-stretch gap-[27px]">
          {statCards.map((card, i) => {
            const CardIcon = card.icon;
            return (
              <div
                key={card.label}
                className={`relative w-[247px] min-h-[166px] rounded-[16px] flex flex-col ${
                  i === 0 ? "bg-[#fbf3f3] border-l-[9px] border-l-[#ad2b21]" : "bg-white shadow-[0px_2px_5px_0px_rgba(0,0,0,0.1)]"
                } px-[19px] pt-[14px] pb-[10px]`}
              >
                <div className="bg-[#f1dddc] h-[30px] w-[33px] rounded-[8px] flex items-center justify-center shrink-0">
                  <CardIcon className="w-[16px] h-[16px] text-[#ad2b21]" />
                </div>
                <div className="mt-2 font-poppins font-bold text-[17px] text-[#808080] leading-snug">{card.label}</div>
                <div className="mt-2 font-poppins font-bold text-[35px] text-black leading-none">{card.value}</div>
                <div className="mt-2 font-poppins font-medium text-[13px] text-[#808080] leading-snug">{card.sub}</div>
              </div>
            );
          })}
        </div>

        {/* Live Match Monitoring */}
        <div className="absolute left-[11px] top-[439px] w-[1072px] h-[432px] bg-white rounded-[6px] shadow-[0px_5px_5px_0px_rgba(0,0,0,0.09)]">
          <div className="flex items-center gap-2 pt-[22px] pl-[15px]">
            <IconChart className="w-[16px] h-[16px] text-[#ad2b21]" />
            <span className="font-poppins font-semibold text-[17px] text-black">Live Match Monitoring</span>
          </div>
          <div className="pl-[42px] font-poppins font-medium text-[11px] text-[#808080]">
            Live tracking of urgent blood request quotas
          </div>
          <button
            type="button"
            onClick={() => navigate("/view-broadcasts")}
            className="absolute right-[15px] top-[36px] flex items-center gap-1 cursor-pointer"
          >
            <span className="font-poppins font-medium text-[13px] text-[#812a34]">View All Broadcasts</span>
            <IconChevronRight className="w-[6px] h-[10px] text-[#812a34]" />
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

          {/* Fixed-height scroll region: the card itself stays a constant
              432px (so Stock Criticality / Recent Arrivals below it never
              move), but the row list can hold more than the original ~5-row
              design assumption without spilling out and overlapping those
              cards. Same pattern used for Donor Management's Appointment View. */}
          <div className="max-h-[310px] overflow-y-auto">
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
                  <IconClock className="w-[12px] h-[12px] text-[#aaa4a0]" />
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
        </div>

        {/* Stock Criticality */}
        <div className="absolute left-[11px] top-[906px] w-[585px] h-[411px] bg-white rounded-[16px] shadow-[0px_2px_5px_0px_rgba(0,0,0,0.1)]">
          <div className="pt-[27px] pl-[27px] flex items-center gap-2 font-poppins font-bold text-[17px] text-black">
            <IconDroplet className="w-[16px] h-[16px] text-[#ad2b21] shrink-0" />
            <span>Stock Criticality</span>
          </div>
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
            <IconChevronRight className="w-[8px] h-[13px] ml-2 text-[#808080]" />
          </Link>
        </div>

        {/* Recent Arrivals */}
        <div
          className="absolute left-[651px] top-[906px] w-[425px] bg-white rounded-[10px]"
          style={{ height: 411 + ARRIVALS_SHIFT }}
        >
          <div className="pt-[27px] pl-[71px] font-poppins font-bold text-[17px] text-black">Recent Arrivals</div>
          <div className="pl-[71px] pt-[1px] font-poppins font-medium text-[11px] text-[#808080]">
            Donors detected in facility geofence
          </div>
          <IconMapPin className="absolute left-[20px] top-[26px] w-[24px] h-[24px] text-[#ad2b21]" />
          <div className="mt-[15px] border-t border-[#d9d9d9]" />

          <div className="flex flex-col gap-[13px] px-[25px] pt-[15px]">
            {filteredRecentArrivals.map((person) => (
              <div key={person.name} className="flex items-center gap-3">
                <Avatar name={person.name} size={45} />
                <div className="flex-1">
                  <div className="font-poppins font-medium text-[15px] text-black">{person.name}</div>
                  <div className="flex items-center gap-1 font-poppins font-medium text-[12px] text-[#aaa4a0]">
                    <IconClock className="w-[10px] h-[10px]" />
                    <span>{person.time}</span>
                  </div>
                </div>
                <div className="relative w-[26px] h-[25px]">
                  <div className="absolute inset-0 rounded-full bg-[#f1dddc]" />
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

          <Link
            to="/donor-management"
            style={{ top: 340 + ARRIVALS_SHIFT }}
            className="absolute left-[52px] w-[321px] h-[49px] bg-[#f6f5f4] rounded-[10px] shadow-[0px_2px_2px_0px_rgba(0,0,0,0.1)] flex items-center justify-center cursor-pointer"
          >
            <span className="font-poppins font-bold text-[15px] text-[#808080]">View Full Donor Management</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
