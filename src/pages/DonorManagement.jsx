import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import PageHeader from "../components/PageHeader";
import { api } from "../lib/apiClient";

const imgVector2 = "https://www.figma.com/api/mcp/asset/7e6479a9-3801-4be0-9486-c10bebbe2e5a";
const imgLine29 = "https://www.figma.com/api/mcp/asset/41954495-73df-427e-aa68-f516adeb5bd9";
const imgGroup4 = "https://www.figma.com/api/mcp/asset/670ee25d-4d79-4f53-a568-706188f4ca5a";
const imgVector6 = "https://www.figma.com/api/mcp/asset/2d623c58-918e-4593-aa8d-60490168e6be";
const imgVector8 = "https://www.figma.com/api/mcp/asset/0648a58f-1fcf-4aa1-8485-65ec04679647";
const imgVector9 = "https://www.figma.com/api/mcp/asset/e4cbf09a-a973-4c90-ac39-1e92a2719eaa";
const imgGroup5 = "https://www.figma.com/api/mcp/asset/acbaab8d-ca79-4bf0-b10e-fb600613c84e";
const imgGroup145 = "https://www.figma.com/api/mcp/asset/dd596e6b-0e0a-4340-a410-f2d1e125f6a7";
const imgVector3 = "https://www.figma.com/api/mcp/asset/acb1ae2a-534f-4612-9286-1ce9ff717148";
const imgImage7 = "https://www.figma.com/api/mcp/asset/633319c7-e0a6-465d-a5a8-58972c81fc99";
const imgImage9 = "https://www.figma.com/api/mcp/asset/f84b9a89-8483-402a-9e85-e46e3e9f198c";
const imgImage10 = "https://www.figma.com/api/mcp/asset/2df25c8e-ebe5-4f2d-8dca-56eda6ce9b55";
const imgImage11 = "https://www.figma.com/api/mcp/asset/1373d634-7ef5-4784-a0d1-085df4192b93";
const imgImage12 = "https://www.figma.com/api/mcp/asset/c7fd08ae-3178-456a-a0ea-d7a130ec0428";
const imgImage13 = "https://www.figma.com/api/mcp/asset/604f5194-9e34-4047-88fa-45ce2b7a53cf";
const imgImage14 = "https://www.figma.com/api/mcp/asset/0adc5e49-d15c-4063-8137-6eb68c9ff20c";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const FALLBACK_AVATARS = [imgImage7, imgImage9, imgImage10, imgImage11, imgImage12, imgImage13, imgImage14];
function avatarFor(seedString, explicitUrl) {
  if (explicitUrl) return explicitUrl;
  const idx = [...(seedString || "")].reduce((sum, c) => sum + c.charCodeAt(0), 0) % FALLBACK_AVATARS.length;
  return FALLBACK_AVATARS[idx];
}

function mapDonor(d) {
  return {
    dbId: d.id,
    id: d.donorCode,
    name: d.name,
    phone: d.phone,
    bloodType: d.bloodType,
    avatar: avatarFor(d.donorCode, d.avatar),
    status: d.isEligible ? { type: "eligible" } : { type: "locked", days: d.daysUntilEligible },
  };
}

function mapAppointment(a) {
  const scheduled = new Date(a.scheduledAt);
  return {
    id: a.id,
    time: scheduled.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).toLowerCase(),
    name: a.name,
    bloodType: a.bloodType,
    avatar: avatarFor(a.name, a.avatar),
    status: a.status,
  };
}

// Local date (not UTC) as YYYY-MM-DD — matches what the API's `date` query
// param expects, without the timezone-shift risk of toISOString().
function toDateParam(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const PAGE_SIZE = 5;

export default function DonorManagement() {
  const [donors, setDonors] = useState([]);
  const [totalDonors, setTotalDonors] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [donorsError, setDonorsError] = useState(null);

  const [appointments, setAppointments] = useState([]);
  const [appointmentsError, setAppointmentsError] = useState(null);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [bloodTypeFilter, setBloodTypeFilter] = useState([]);
  const [eligibilityFilter, setEligibilityFilter] = useState("all");
  const [viewDate, setViewDate] = useState(() => new Date());
  const [openRowMenu, setOpenRowMenu] = useState(null);
  const [page, setPage] = useState(0);

  // Donor list: server-paginated/filtered, refetched whenever the filters or
  // page change.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const params = new URLSearchParams({ page: String(page + 1), pageSize: String(PAGE_SIZE) });
        bloodTypeFilter.forEach((t) => params.append("bloodType", t));
        if (eligibilityFilter !== "all") params.set("eligibility", eligibilityFilter);

        const data = await api.get(`/api/donors?${params.toString()}`);
        if (cancelled) return;
        setDonors(data.donors.map(mapDonor));
        setTotalDonors(data.total);
        setTotalPages(data.totalPages);
        setDonorsError(null);
      } catch (err) {
        if (!cancelled) setDonorsError(err.message);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [page, bloodTypeFilter, eligibilityFilter]);

  // Appointment View: refetched whenever the viewed day changes.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await api.get(`/api/appointments?date=${toDateParam(viewDate)}`);
        if (cancelled) return;
        setAppointments(data.map(mapAppointment));
        setAppointmentsError(null);
      } catch (err) {
        if (!cancelled) setAppointmentsError(err.message);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [viewDate]);

  const rangeStart = totalDonors === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, totalDonors);
  const safePage = page;

  function goToPrevPage() {
    setPage((p) => Math.max(0, p - 1));
  }

  function goToNextPage() {
    setPage((p) => Math.min(totalPages - 1, p + 1));
  }

  const today = new Date();
  const isToday = viewDate.toDateString() === today.toDateString();
  const formattedViewDate = viewDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "2-digit",
    year: "numeric",
  });

  function toggleBloodTypeFilter(type) {
    setPage(0);
    setBloodTypeFilter((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  function clearFilters() {
    setPage(0);
    setBloodTypeFilter([]);
    setEligibilityFilter("all");
  }

  async function toggleDonorLock(donor) {
    setOpenRowMenu(null);
    try {
      await api.patch(`/api/donors/${donor.dbId}/eligibility`, { eligible: donor.status.type !== "eligible" });
      setDonors((prev) =>
        prev.map((d) =>
          d.dbId === donor.dbId
            ? { ...d, status: d.status.type === "eligible" ? { type: "locked", days: 90 } : { type: "eligible" } }
            : d
        )
      );
    } catch (err) {
      setDonorsError(err.message);
    }
  }

  async function exportCsv() {
    try {
      const allDonors = await api.get("/api/donors/export");
      const header = ["ID", "Name", "Phone", "Blood Type", "Status"];
      const rows = allDonors.map((d) => [
        d.donorCode,
        d.name,
        d.phone,
        d.bloodType,
        d.isEligible ? "Eligible" : `${d.daysUntilEligible} Days Lock`,
      ]);
      const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "donor-database.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setDonorsError(err.message);
    }
  }

  async function confirmArrival(appointmentId) {
    try {
      await api.patch(`/api/appointments/${appointmentId}`, { status: "confirmed" });
      setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? { ...a, status: "confirmed" } : a)));
    } catch (err) {
      setAppointmentsError(err.message);
    }
  }

  // Closes the loop on a confirmed appointment: logs the arrival, starts the
  // donor's 90-day cooling period, and bumps inventory server-side. Refetches
  // the donor list afterward since this donor's eligibility just changed.
  async function recordDonation(appointmentId) {
    try {
      await api.post(`/api/appointments/${appointmentId}/complete`);
      setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? { ...a, status: "completed" } : a)));

      const params = new URLSearchParams({ page: String(page + 1), pageSize: String(PAGE_SIZE) });
      bloodTypeFilter.forEach((t) => params.append("bloodType", t));
      if (eligibilityFilter !== "all") params.set("eligibility", eligibilityFilter);
      const data = await api.get(`/api/donors?${params.toString()}`);
      setDonors(data.donors.map(mapDonor));
      setTotalDonors(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      setAppointmentsError(err.message);
    }
  }

  // --- Add Manual Walk-in modal ---
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInMode, setWalkInMode] = useState("search"); // "search" | "new"
  const [walkInQuery, setWalkInQuery] = useState("");
  const [walkInResults, setWalkInResults] = useState([]);
  const [walkInSelected, setWalkInSelected] = useState(null);
  const [walkInNewName, setWalkInNewName] = useState("");
  const [walkInNewPhone, setWalkInNewPhone] = useState("");
  const [walkInNewEmail, setWalkInNewEmail] = useState("");
  const [walkInNewBloodType, setWalkInNewBloodType] = useState("O+");
  const [walkInSubmitting, setWalkInSubmitting] = useState(false);
  const [walkInError, setWalkInError] = useState(null);

  function openWalkInModal() {
    setWalkInOpen(true);
    setWalkInMode("search");
    setWalkInQuery("");
    setWalkInResults([]);
    setWalkInSelected(null);
    setWalkInNewName("");
    setWalkInNewPhone("");
    setWalkInNewEmail("");
    setWalkInNewBloodType("O+");
    setWalkInError(null);
  }

  function closeWalkInModal() {
    if (walkInSubmitting) return;
    setWalkInOpen(false);
  }

  // Debounced live search against the real donor list as the admin types.
  useEffect(() => {
    if (!walkInOpen || walkInMode !== "search") return;
    if (!walkInQuery.trim()) {
      setWalkInResults([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const data = await api.get(`/api/donors?q=${encodeURIComponent(walkInQuery)}&pageSize=6`);
        if (!cancelled) setWalkInResults(data.donors.map(mapDonor));
      } catch (err) {
        if (!cancelled) setWalkInError(err.message);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [walkInQuery, walkInMode, walkInOpen]);

  async function refreshAppointmentsIfToday(scheduledAtIso) {
    if (toDateParam(new Date(scheduledAtIso)) === toDateParam(viewDate)) {
      const data = await api.get(`/api/appointments?date=${toDateParam(viewDate)}`);
      setAppointments(data.map(mapAppointment));
    }
  }

  async function submitWalkIn(e) {
    e.preventDefault();
    setWalkInError(null);

    if (walkInMode === "search" && !walkInSelected) {
      setWalkInError("Search for and select a donor first.");
      return;
    }
    if (walkInMode === "new" && (!walkInNewName.trim() || !walkInNewPhone.trim())) {
      setWalkInError("Name and phone are required for a new donor.");
      return;
    }

    setWalkInSubmitting(true);
    try {
      let donorId = walkInSelected?.dbId;
      if (walkInMode === "new") {
        const newDonor = await api.post("/api/donors", {
          name: walkInNewName,
          phone: walkInNewPhone,
          email: walkInNewEmail.trim() || undefined,
          bloodType: walkInNewBloodType,
        });
        donorId = newDonor.id;
      }

      const created = await api.post("/api/appointments", {
        donorId,
        scheduledAt: new Date().toISOString(),
      });
      await refreshAppointmentsIfToday(created.scheduledAt);
      setWalkInOpen(false);
    } catch (err) {
      setWalkInError(err.message);
    } finally {
      setWalkInSubmitting(false);
    }
  }

  function shiftAppointmentDay(delta) {
    setViewDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + delta);
      return next;
    });
  }

  return (
    <div className="bg-white relative w-[1440px] h-[1050px] mx-auto font-poppins">

      {/* Top bar */}
      <PageHeader title="Partner Profiles" />

      {/* Page header */}
      <div className="absolute left-[312px] top-[120px] flex flex-col gap-2 w-[617px]">
        <h1 className="font-poppins font-bold text-[23px] text-black">Donor Management</h1>
        <p className="font-poppins font-semibold text-[17px] text-[#808080]">
          Manage donor eligibility tracking and daily donation appointments.
        </p>
      </div>

      <button
        type="button"
        onClick={exportCsv}
        className="absolute bg-[#ad2b21] h-[49px] left-[1207px] rounded-[16px] top-[136px] w-[170px] flex items-center justify-center cursor-pointer hover:bg-[#8f2419] transition-colors"
      >
        <span className="font-bold text-[17px] text-white">Export CSV</span>
      </button>
      <button
        type="button"
        onClick={() => setFiltersOpen((v) => !v)}
        className={`absolute border-2 h-[49px] left-[958px] rounded-[16px] top-[136px] w-[216px] flex items-center justify-center gap-2 cursor-pointer ${
          filtersOpen ? "border-[#ad2b21] bg-[#fbf3f3]" : "border-[#d9d9d9]"
        }`}
      >
        <div className="w-[16px] h-[13px]">
          <img alt="" className="block max-w-none size-full" src={imgVector2} />
        </div>
        <span className="font-bold text-[17px] text-black">Advanced Filters</span>
      </button>

      {filtersOpen && (
        <div className="absolute left-[958px] top-[190px] w-[300px] bg-white rounded-[12px] border border-[#d9d9d9] shadow-[0px_8px_8px_0px_rgba(0,0,0,0.09)] p-4 z-20">
          <p className="font-poppins font-bold text-[11px] text-[#808080] tracking-wide mb-2">BLOOD TYPE</p>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {BLOOD_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => toggleBloodTypeFilter(type)}
                className={`h-[30px] rounded-[8px] border text-[12px] font-poppins font-semibold cursor-pointer ${
                  bloodTypeFilter.includes(type)
                    ? "bg-[#8f404b] border-[#8f404b] text-white"
                    : "bg-[#f8f3f4] border-[#ebdfe1] text-[#8f404b]"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
          <p className="font-poppins font-bold text-[11px] text-[#808080] tracking-wide mb-2">ELIGIBILITY STATUS</p>
          <div className="flex gap-2 mb-4">
            {[
              { key: "all", label: "All" },
              { key: "eligible", label: "Eligible" },
              { key: "locked", label: "Locked" },
            ].map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setEligibilityFilter(opt.key)}
                className={`h-[30px] px-3 rounded-full border text-[12px] font-poppins font-semibold cursor-pointer ${
                  eligibilityFilter === opt.key
                    ? "bg-[#ad2b21] border-[#ad2b21] text-white"
                    : "bg-white border-[#d9d9d9] text-[#808080]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={clearFilters}
            className="w-full h-[32px] rounded-[8px] border border-[#d9d9d9] text-[12px] font-poppins font-semibold text-[#808080] cursor-pointer"
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* Donor Database card */}
      <div className="absolute bg-white h-[577px] left-[320px] rounded-[10px] shadow-[0px_18px_11px_0px_rgba(0,0,0,0.05),0px_8px_8px_0px_rgba(0,0,0,0.09),0px_2px_4px_0px_rgba(0,0,0,0.1)] top-[215px] w-[672px]" />
      <p className="absolute font-semibold leading-[normal] left-[415.5px] not-italic text-[17px] text-black text-center top-[238px] -translate-x-1/2 whitespace-nowrap">
        Donor Database
      </p>
      <div className="absolute h-0 left-[321px] top-[285px] w-[671px]">
        <img alt="" className="block max-w-none size-full" src={imgLine29} />
      </div>

      <div className="absolute left-[320px] top-[285px] w-[672px]">
        {/* Table header */}
        <div className="bg-[#fff5f5] border border-[#efeeed] border-solid h-[43px] flex items-center text-[13px] font-semibold text-[#808080] tracking-wide">
          <div className="w-[80px] text-center">ID</div>
          <div className="w-[224px] text-center">DONOR INFORMATION</div>
          <div className="w-[128px] text-center">TYPE</div>
          <div className="w-[176px] text-center">ELIGIBILITY STATUS</div>
          <div className="w-[64px] text-center">ACTIONS</div>
        </div>

        {/* Table rows */}
        {donorsError && (
          <div className="flex items-center justify-center h-[100px] text-[13px] text-[#d70b07] font-medium border border-[#c0bfbf] border-t-0">
            Couldn't load donors: {donorsError}
          </div>
        )}
        {!donorsError && donors.length === 0 && (
          <div className="flex items-center justify-center h-[100px] text-[13px] text-[#aaa4a0] font-medium border border-[#c0bfbf] border-t-0">
            No donors match the selected filters.
          </div>
        )}
        {donors.map((donor, idx) => (
          <div
            key={donor.id}
            className={`relative flex items-center border border-[#c0bfbf] border-solid h-[58px] ${
              idx === donors.length - 1 ? "bg-[#f0f0ef] rounded-bl-[10px] rounded-br-[10px]" : "bg-white"
            }`}
          >
            <div className="w-[80px] text-center text-[11px] font-medium text-[#aaa4a0]">{donor.id}</div>
            <div className="w-[224px] flex items-center gap-3 pl-2">
              <img alt="" className="w-[45px] h-[45px] rounded-full object-cover" src={donor.avatar} />
              <div>
                <p className="text-[13px] font-medium text-black leading-tight">{donor.name}</p>
                <p className="text-[10px] font-medium text-[#aaa4a0] leading-tight">{donor.phone}</p>
              </div>
            </div>
            <div className="w-[128px] flex items-center justify-center">
              <span className="bg-[#f8f3f4] border-2 border-[#ebdfe1] border-solid rounded-[10px] h-[24px] w-[58px] flex items-center justify-center text-[11px] font-semibold text-[#8f404b]">
                {donor.bloodType}
              </span>
            </div>
            <div className="w-[176px] flex items-center justify-center">
              {donor.status.type === "eligible" ? (
                <span className="border-2 border-[#d9d9d9] border-solid rounded-[10px] h-[24px] w-[120px] flex items-center justify-center gap-1 text-[10px] font-semibold tracking-wide text-black">
                  <img alt="" className="w-[10px] h-[10px]" src={imgGroup145} />
                  ELIGIBLE
                </span>
              ) : (
                <span className="border-2 border-[#d9d9d9] border-solid rounded-[10px] h-[24px] w-[120px] flex items-center justify-center gap-1 text-[10px] font-semibold tracking-wide text-[#808080]">
                  <img alt="" className="w-[10px] h-[10px]" src={imgVector3} />
                  {donor.status.days} DAYS LOCK
                </span>
              )}
            </div>
            <div className="w-[64px] flex items-center justify-center">
              <button
                type="button"
                onClick={() => setOpenRowMenu((v) => (v === donor.id ? null : donor.id))}
                className="flex flex-col items-center gap-[2px] cursor-pointer"
                aria-label="Row actions"
              >
                <span className="w-[3px] h-[3px] rounded-full bg-[#808080]" />
                <span className="w-[3px] h-[3px] rounded-full bg-[#808080]" />
                <span className="w-[3px] h-[3px] rounded-full bg-[#808080]" />
              </button>
              {openRowMenu === donor.id && (
                <div className="absolute right-2 top-[52px] w-[170px] bg-white rounded-[10px] border border-[#d9d9d9] shadow-[0px_8px_8px_0px_rgba(0,0,0,0.09)] py-1 z-30">
                  <button
                    type="button"
                    onClick={() => toggleDonorLock(donor)}
                    className="w-full text-left px-3 py-2 text-[12px] font-poppins font-medium text-black hover:bg-[#fbf3f3] cursor-pointer"
                  >
                    {donor.status.type === "eligible" ? "Lock for 90 Days" : "Mark Eligible"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenRowMenu(null)}
                    className="w-full text-left px-3 py-2 text-[12px] font-poppins font-medium text-[#808080] hover:bg-[#fbf3f3] cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="absolute font-medium leading-[normal] left-[429px] not-italic text-[#aaa4a0] text-[11px] text-center top-[754px] -translate-x-1/2 whitespace-nowrap">
        Showing {rangeStart}-{rangeEnd} of {totalDonors} registered donors
      </p>
      <button
        type="button"
        disabled={safePage === 0}
        onClick={goToPrevPage}
        className={`absolute bg-white border-[#aaa4a0] border-[1.5px] border-solid h-[32px] left-[843px] rounded-[5px] top-[747px] w-[36px] flex items-center justify-center ${
          safePage === 0 ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-[#f6f5f4]"
        }`}
        aria-label="Previous page"
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <button
        type="button"
        disabled={safePage >= totalPages - 1}
        onClick={goToNextPage}
        className={`absolute bg-white border-[#aaa4a0] border-[1.5px] border-solid h-[32px] left-[892px] rounded-[5px] top-[746px] w-[36px] flex items-center justify-center ${
          safePage >= totalPages - 1 ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-[#f6f5f4]"
        }`}
        aria-label="Next page"
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {/* DOH 90-Day Cooling Rule card */}
      <div className="absolute bg-white border border-[#d9d9d9] border-solid h-[113px] left-[321px] rounded-[10px] shadow-[0px_9px_6px_0px_rgba(0,0,0,0.05),0px_4px_4px_0px_rgba(0,0,0,0.09),0px_1px_2px_0px_rgba(0,0,0,0.1)] top-[823px] w-[671px]" />
      <div className="absolute w-[28px] h-[28px] left-[355px] top-[845px]">
        <img alt="" className="block max-w-none size-full" src={imgGroup4} />
      </div>
      <div className="absolute left-[405px] top-[846px] w-[565px] flex flex-col gap-2">
        <p className="font-poppins font-bold text-[17px] text-black">DOH 90-Day Cooling Rule</p>
        <p className="font-poppins font-medium text-[11px] text-[#aaa4a0]">
          Donors are automatically locked for 90 days following a successful whole blood donation. Plasma and Platelet
          donations follow different cycles. Contact System Admin to override for emergency triage.
        </p>
      </div>

      {/* Appointment View card */}
      <div className="absolute bg-white border border-[#d9d9d9] border-solid left-[1021px] rounded-[10px] shadow-[0px_9px_5px_0px_rgba(0,0,0,0.05),0px_4px_4px_0px_rgba(0,0,0,0.09),0px_1px_2px_0px_rgba(0,0,0,0.1)] top-[225px] w-[352px] h-[659px]" />
      <div className="absolute left-[1049px] top-[238px] w-[303px] h-[22px] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img alt="" className="w-4 h-4" src={imgVector6} />
          <p className="font-poppins font-bold text-[17px] text-black whitespace-nowrap">Appointment View</p>
        </div>
        {isToday && (
          <div className="bg-[#ac271d] h-[19px] rounded-[10px] px-3 flex items-center justify-center shrink-0">
            <p className="font-poppins font-bold text-[10px] text-white leading-[normal] whitespace-nowrap">Today</p>
          </div>
        )}
      </div>
      <div className="absolute left-[1035px] top-[271px] w-[340px] flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftAppointmentDay(-1)}
          className="w-[20px] h-[20px] flex items-center justify-center cursor-pointer hover:opacity-60 transition-opacity"
          aria-label="Previous day"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <p className="font-poppins font-semibold text-[13px] text-black whitespace-nowrap">{formattedViewDate}</p>
        <button
          type="button"
          onClick={() => shiftAppointmentDay(1)}
          className="w-[20px] h-[20px] flex items-center justify-center cursor-pointer hover:opacity-60 transition-opacity"
          aria-label="Next day"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {appointmentsError && (
        <p className="absolute left-[1049px] top-[300px] w-[303px] font-poppins text-[12px] text-[#d70b07]">
          Couldn't load appointments: {appointmentsError}
        </p>
      )}

      {/* Fixed-height viewport: the list scrolls internally instead of
          growing the card (and everything below it) as appointments are
          added. Sized to show ~3 cards at a time, matching the original
          design's assumed default. */}
      <div className="absolute left-[1056px] top-[313px] w-[290px] max-h-[500px] overflow-y-auto flex flex-col gap-[25px] pr-1">
        {appointments.map((apt) => (
          <div
            key={apt.id}
            className="relative shrink-0 rounded-[10px] w-[280px] h-[148px] bg-[#f8f3f4] border-[1.5px] border-[#f1dddc] border-solid"
          >
            <span className="absolute bg-[#eadbdd] border-2 border-[#ebdfe1] border-solid rounded-[10px] h-[24px] w-[58px] flex items-center justify-center text-[11px] font-semibold text-[#8f404b] left-[209px] top-[11px]">
              {apt.bloodType}
            </span>
            <p className="absolute left-[17px] top-[15px] flex items-center gap-1 text-[12px] font-medium text-[#aaa4a0]">
              <img alt="" className="w-[10px] h-[10px]" src={imgGroup5} />
              {apt.time}
            </p>
            <img
              alt=""
              className="absolute left-[17px] top-[47px] w-[45px] h-[45px] rounded-full object-cover"
              src={apt.avatar}
            />
            <div className="absolute left-[71px] top-[47px]">
              <p className="text-[13px] font-medium text-black leading-tight">{apt.name}</p>
              <p className="text-[10px] font-medium text-[#aaa4a0] leading-tight">Regular Donor</p>
            </div>
            {apt.status === "completed" ? (
              <div className="absolute border border-[#d9d9d9] border-solid h-[28px] left-[26px] rounded-[4px] top-[104px] w-[228px] flex items-center justify-center gap-1">
                <div className="w-[13px] h-[13px]">
                  <img alt="" className="block max-w-none size-full" src={imgVector8} />
                </div>
                <span className="text-[13px] font-medium text-black">Donation Recorded</span>
              </div>
            ) : apt.status === "confirmed" ? (
              <button
                type="button"
                onClick={() => recordDonation(apt.id)}
                className="absolute bg-[#ad2b21] h-[28px] left-[26px] rounded-[4px] top-[104px] w-[228px] flex items-center justify-center gap-1 cursor-pointer hover:bg-[#8f2419] transition-colors"
              >
                <div className="w-[13px] h-[13px]">
                  <img alt="" className="block max-w-none size-full" src={imgVector8} />
                </div>
                <span className="text-[13px] font-medium text-white">Record Donation</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => confirmArrival(apt.id)}
                className="absolute bg-[#ad2b21] h-[28px] left-[26px] rounded-[4px] top-[104px] w-[228px] flex items-center justify-center cursor-pointer hover:bg-[#8f2419] transition-colors"
              >
                <span className="text-[13px] font-medium text-white">Confirm Arrival</span>
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={openWalkInModal}
        className="absolute border border-[#d9d9d9] border-solid h-[28px] left-[1057px] top-[825px] rounded-[4px] w-[289px] flex items-center justify-center gap-2 cursor-pointer hover:bg-[#f6f5f4] transition-colors"
      >
        <div className="w-[15px] h-[15px]">
          <img alt="" className="block max-w-none size-full" src={imgVector9} />
        </div>
        <span className="text-[13px] font-medium text-[#808080]">Add Manual Walk-in</span>
      </button>

      {/* Card height increased from the original 75px: at 11px font the
          caption below wraps to two lines, which pushed a couple pixels
          past the old fixed box height and read as overlap against the
          border below it. Everything else on the page ends above top-899,
          so growing this card downward is safe. */}
      <div className="absolute top-[899px] bg-[#fbfaf9] border border-[#d9d9d9] border-solid h-[92px] left-[1027px] rounded-[10px] shadow-[0px_6px_4px_0px_rgba(0,0,0,0.05),0px_3px_3px_0px_rgba(0,0,0,0.09),0px_1px_2px_0px_rgba(0,0,0,0.1)] w-[350px]" />
      <p className="absolute top-[908px] font-semibold leading-[normal] left-[1116.25px] not-italic text-[#808080] text-[13px] text-center w-[144.5px]">
        STATION CAPACITY
      </p>
      <p className="absolute top-[926px] font-semibold leading-[normal] left-[1334.5px] not-italic text-[#808080] text-[7.5px] text-center w-[23px]">
        72%
      </p>
      <div className="absolute top-[941px] bg-[#d9d9d9] h-[5px] left-[1054px] rounded-[10px] w-[292px]" />
      <div className="absolute top-[941px] bg-[#ad2b22] h-[5px] left-[1054px] rounded-[10px] w-[224px]" />
      <p className="absolute top-[953px] font-medium leading-[1.4] left-[1091px] not-italic text-[#aaa4a0] text-[11px] w-[230px]">
        4 of 6 extraction beds currently in use
      </p>

      {walkInOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 font-poppins">
          <div
            className="absolute inset-0 backdrop-blur-[7.5px] bg-[rgba(217,217,217,0.85)]"
            onClick={closeWalkInModal}
            aria-hidden="true"
          />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-[20px] w-[480px] max-w-[92vw] max-h-[90vh] overflow-y-auto shadow-[0px_17px_38px_0px_rgba(0,0,0,0.1)] p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-poppins font-bold text-[22px] text-black">Add Manual Walk-in</h2>
              <button type="button" onClick={closeWalkInModal} aria-label="Close" className="cursor-pointer text-[#808080] hover:text-black text-xl leading-none">
                &times;
              </button>
            </div>

            <div className="flex gap-2 mb-6">
              <button
                type="button"
                onClick={() => {
                  setWalkInMode("search");
                  setWalkInError(null);
                }}
                className={`flex-1 h-[38px] rounded-[10px] text-[13px] font-poppins font-semibold cursor-pointer ${
                  walkInMode === "search" ? "bg-[#ad2b21] text-white" : "bg-[#f6f5f4] text-[#808080]"
                }`}
              >
                Existing Donor
              </button>
              <button
                type="button"
                onClick={() => {
                  setWalkInMode("new");
                  setWalkInError(null);
                }}
                className={`flex-1 h-[38px] rounded-[10px] text-[13px] font-poppins font-semibold cursor-pointer ${
                  walkInMode === "new" ? "bg-[#ad2b21] text-white" : "bg-[#f6f5f4] text-[#808080]"
                }`}
              >
                New Donor
              </button>
            </div>

            <form onSubmit={submitWalkIn} className="flex flex-col gap-5">
              {walkInMode === "search" ? (
                <div className="flex flex-col gap-2">
                  <label className="font-poppins font-medium text-[13px] text-black">Search by name, ID, or phone</label>
                  <input
                    type="text"
                    autoFocus
                    value={walkInQuery}
                    onChange={(e) => {
                      setWalkInQuery(e.target.value);
                      setWalkInSelected(null);
                    }}
                    placeholder="e.g. Sarah Jenkins or D-8821"
                    className="border border-[#aaa4a0] rounded-[10px] h-[42px] px-4 font-poppins text-[14px] text-black outline-none"
                  />

                  {walkInSelected ? (
                    <div className="flex items-center justify-between border-2 border-[#ad2b21] bg-[#fbf3f3] rounded-[10px] px-4 py-3 mt-1">
                      <div>
                        <p className="font-poppins font-medium text-[14px] text-black">{walkInSelected.name}</p>
                        <p className="font-poppins text-[11px] text-[#808080]">{walkInSelected.id} &middot; {walkInSelected.bloodType}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setWalkInSelected(null)}
                        className="text-[12px] font-poppins font-semibold text-[#808080] hover:text-black cursor-pointer"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    walkInQuery.trim() && (
                      <div className="flex flex-col gap-1 mt-1 max-h-[220px] overflow-y-auto">
                        {walkInResults.length === 0 && (
                          <p className="text-[12px] font-poppins text-[#aaa4a0] px-1">No donors match "{walkInQuery}".</p>
                        )}
                        {walkInResults.map((d) => (
                          <button
                            key={d.dbId}
                            type="button"
                            onClick={() => setWalkInSelected(d)}
                            className="flex items-center justify-between border border-[#d9d9d9] rounded-[10px] px-4 py-2 hover:bg-[#f6f5f4] cursor-pointer text-left"
                          >
                            <span className="font-poppins text-[13px] text-black">{d.name}</span>
                            <span className="font-poppins text-[11px] text-[#808080]">{d.id} &middot; {d.bloodType}</span>
                          </button>
                        ))}
                      </div>
                    )
                  )}
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    <label className="font-poppins font-medium text-[13px] text-black">Full Name</label>
                    <input
                      type="text"
                      autoFocus
                      value={walkInNewName}
                      onChange={(e) => setWalkInNewName(e.target.value)}
                      className="border border-[#aaa4a0] rounded-[10px] h-[42px] px-4 font-poppins text-[14px] text-black outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="font-poppins font-medium text-[13px] text-black">Phone Number</label>
                    <input
                      type="tel"
                      value={walkInNewPhone}
                      onChange={(e) => setWalkInNewPhone(e.target.value)}
                      placeholder="+63 9XX XXX XXXX"
                      className="border border-[#aaa4a0] rounded-[10px] h-[42px] px-4 font-poppins text-[14px] text-black outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="font-poppins font-medium text-[13px] text-black">
                      Email <span className="text-[#aaa4a0] font-normal">(optional — enables email alerts)</span>
                    </label>
                    <input
                      type="email"
                      value={walkInNewEmail}
                      onChange={(e) => setWalkInNewEmail(e.target.value)}
                      placeholder="donor@email.com"
                      className="border border-[#aaa4a0] rounded-[10px] h-[42px] px-4 font-poppins text-[14px] text-black outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="font-poppins font-medium text-[13px] text-black">Blood Type</label>
                    <div className="grid grid-cols-4 gap-2">
                      {BLOOD_TYPES.map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setWalkInNewBloodType(type)}
                          className={`h-[36px] rounded-[8px] border text-[13px] font-poppins font-semibold cursor-pointer ${
                            walkInNewBloodType === type
                              ? "bg-[#8f404b] border-[#8f404b] text-white"
                              : "bg-[#f8f3f4] border-[#ebdfe1] text-[#8f404b]"
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {walkInError && <p className="font-poppins text-[13px] text-[#d70b07]">{walkInError}</p>}

              <div className="flex justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={closeWalkInModal}
                  className="border-2 border-[#d9d9d9] rounded-[16px] px-6 h-[44px] font-poppins font-semibold text-[14px] text-black cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={walkInSubmitting}
                  className="bg-[#ad2b21] rounded-[16px] px-6 h-[44px] font-poppins font-bold text-[14px] text-white cursor-pointer hover:bg-[#8f2419] transition-colors disabled:cursor-wait disabled:opacity-70"
                >
                  {walkInSubmitting ? "Booking..." : "Book Walk-in"}
                </button>
              </div>
            </form>
          </div>
          </div>,
          document.body
        )}
    </div>
  );
}
