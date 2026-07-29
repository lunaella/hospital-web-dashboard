import { useState } from "react";
import WebNav from "../components/WebNav";
import PageHeader from "../components/PageHeader";

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

const initialDonors = [
  { id: "D-8821", name: "Sarah Jenkins", phone: "+63 9956782915", bloodType: "O-", avatar: imgImage7, status: { type: "eligible" } },
  { id: "D-9012", name: "Marcus Chen", phone: "+63 9992345726", bloodType: "A+", avatar: imgImage9, status: { type: "locked", days: 64 } },
  { id: "D-7742", name: "Elena Rodriguez", phone: "+63 9286563214", bloodType: "B+", avatar: imgImage10, status: { type: "eligible" } },
  { id: "D-3321", name: "David Smith", phone: "+63 9295436851", bloodType: "O+", avatar: imgImage11, status: { type: "locked", days: 71 } },
  { id: "D-1109", name: "Lisa Domingo", phone: "+63 9284529522", bloodType: "AB-", avatar: imgImage12, status: { type: "eligible" } },
  { id: "D-4456", name: "Jose Pablo Dela Cruz", phone: "+63 9763548249", bloodType: "B-", avatar: imgImage13, status: { type: "eligible" } },
  { id: "D-8652", name: "Theresita Ambrosio", phone: "+63 9088563463", bloodType: "AB+", avatar: imgImage14, status: { type: "locked", days: 35 } },
];

const initialAppointments = [
  { time: "09:30 am", name: "Sarah Jenkins", bloodType: "O-", avatar: imgImage7, status: "confirmed" },
  { time: "10:15 am", name: "Marcus Chen", bloodType: "A+", avatar: imgImage9, status: "pending" },
  { time: "11:00 am", name: "David Smith", bloodType: "O+", avatar: imgImage11, status: "pending" },
];

const REFERENCE_DATE = new Date(2026, 3, 8);

export default function DonorManagement() {
  const [donors, setDonors] = useState(initialDonors);
  const [appointments, setAppointments] = useState(initialAppointments);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [bloodTypeFilter, setBloodTypeFilter] = useState([]);
  const [eligibilityFilter, setEligibilityFilter] = useState("all");
  const [viewDate, setViewDate] = useState(() => new Date(REFERENCE_DATE));
  const [openRowMenu, setOpenRowMenu] = useState(null);
  const [page, setPage] = useState(0);

  const filteredDonors = donors.filter((d) => {
    const matchesBlood = bloodTypeFilter.length === 0 || bloodTypeFilter.includes(d.bloodType);
    const matchesEligibility = eligibilityFilter === "all" || d.status.type === eligibilityFilter;
    return matchesBlood && matchesEligibility;
  });

  const PAGE_SIZE = 5;
  const totalPages = Math.max(1, Math.ceil(filteredDonors.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pagedDonors = filteredDonors.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const rangeStart = filteredDonors.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const rangeEnd = Math.min((safePage + 1) * PAGE_SIZE, filteredDonors.length);

  function goToPrevPage() {
    setPage((p) => Math.max(0, p - 1));
  }

  function goToNextPage() {
    setPage((p) => Math.min(totalPages - 1, p + 1));
  }

  const isToday = viewDate.toDateString() === REFERENCE_DATE.toDateString();
  const formattedViewDate = viewDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "2-digit",
    year: "numeric",
  });

  function toggleBloodTypeFilter(type) {
    setBloodTypeFilter((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  function clearFilters() {
    setBloodTypeFilter([]);
    setEligibilityFilter("all");
  }

  function toggleDonorLock(id) {
    setDonors((prev) =>
      prev.map((d) =>
        d.id === id
          ? { ...d, status: d.status.type === "eligible" ? { type: "locked", days: 90 } : { type: "eligible" } }
          : d
      )
    );
    setOpenRowMenu(null);
  }

  function exportCsv() {
    const header = ["ID", "Name", "Phone", "Blood Type", "Status"];
    const rows = donors.map((d) => [
      d.id,
      d.name,
      d.phone,
      d.bloodType,
      d.status.type === "eligible" ? "Eligible" : `${d.status.days} Days Lock`,
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
  }

  function confirmArrival(idx) {
    setAppointments((prev) => prev.map((a, i) => (i === idx ? { ...a, status: "confirmed" } : a)));
  }

  function addWalkIn() {
    setAppointments((prev) => [
      ...prev,
      {
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).toLowerCase(),
        name: "Walk-in Donor",
        bloodType: "O+",
        avatar: imgImage7,
        status: "pending",
      },
    ]);
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
      <WebNav className="absolute h-full left-0 overflow-clip top-0 w-[296px]" property1="DMNav" />

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
        {filteredDonors.length === 0 && (
          <div className="flex items-center justify-center h-[100px] text-[13px] text-[#aaa4a0] font-medium border border-[#c0bfbf] border-t-0">
            No donors match the selected filters.
          </div>
        )}
        {pagedDonors.map((donor, idx) => (
          <div
            key={donor.id}
            className={`relative flex items-center border border-[#c0bfbf] border-solid h-[58px] ${
              idx === pagedDonors.length - 1 ? "bg-[#f0f0ef] rounded-bl-[10px] rounded-br-[10px]" : "bg-white"
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
                    onClick={() => toggleDonorLock(donor.id)}
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
        Showing {rangeStart}-{rangeEnd} of {filteredDonors.length} registered donors
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
      <div className="absolute bg-white border border-[#d9d9d9] border-solid h-[659px] left-[1021px] rounded-[10px] shadow-[0px_9px_5px_0px_rgba(0,0,0,0.05),0px_4px_4px_0px_rgba(0,0,0,0.09),0px_1px_2px_0px_rgba(0,0,0,0.1)] top-[225px] w-[352px]" />
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

      {appointments.map((apt, idx) => {
        const top = 313 + idx * 173;
        return (
          <div
            key={apt.time + apt.name + idx}
            className="absolute rounded-[10px] w-[290px] h-[148px] left-[1056px] bg-[#f8f3f4] border-[1.5px] border-[#f1dddc] border-solid"
            style={{ top }}
          >
            <span className="absolute bg-[#eadbdd] border-2 border-[#ebdfe1] border-solid rounded-[10px] h-[24px] w-[58px] flex items-center justify-center text-[11px] font-semibold text-[#8f404b] left-[219px] top-[11px]">
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
            {apt.status === "confirmed" ? (
              <div className="absolute border border-[#d9d9d9] border-solid h-[28px] left-[31px] rounded-[4px] top-[104px] w-[228px] flex items-center justify-center gap-1">
                <div className="w-[13px] h-[13px]">
                  <img alt="" className="block max-w-none size-full" src={imgVector8} />
                </div>
                <span className="text-[13px] font-medium text-black">Arrived &amp; Verified</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => confirmArrival(idx)}
                className="absolute bg-[#ad2b21] h-[28px] left-[31px] rounded-[4px] top-[104px] w-[228px] flex items-center justify-center cursor-pointer hover:bg-[#8f2419] transition-colors"
              >
                <span className="text-[13px] font-medium text-white">Confirm Arrival</span>
              </button>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={addWalkIn}
        className="absolute border border-[#d9d9d9] border-solid h-[28px] left-[1057px] rounded-[4px] top-[825px] w-[289px] flex items-center justify-center gap-2 cursor-pointer hover:bg-[#f6f5f4] transition-colors"
      >
        <div className="w-[15px] h-[15px]">
          <img alt="" className="block max-w-none size-full" src={imgVector9} />
        </div>
        <span className="text-[13px] font-medium text-[#808080]">Add Manual Walk-in</span>
      </button>

      <div className="absolute bg-[#fbfaf9] border border-[#d9d9d9] border-solid h-[75px] left-[1027px] rounded-[10px] shadow-[0px_6px_4px_0px_rgba(0,0,0,0.05),0px_3px_3px_0px_rgba(0,0,0,0.09),0px_1px_2px_0px_rgba(0,0,0,0.1)] top-[899px] w-[350px]" />
      <p className="absolute font-semibold leading-[normal] left-[1116.25px] not-italic text-[#808080] text-[13px] text-center top-[908px] w-[144.5px]">
        STATION CAPACITY
      </p>
      <div className="absolute bg-[#d9d9d9] h-[5px] left-[1054px] rounded-[10px] top-[941px] w-[292px]" />
      <div className="absolute bg-[#ad2b22] h-[5px] left-[1054px] rounded-[10px] top-[941px] w-[224px]" />
      <p className="absolute font-semibold leading-[normal] left-[1334.5px] not-italic text-[#808080] text-[7.5px] text-center top-[930px] w-[23px]">
        72%
      </p>
      <p className="absolute font-medium leading-[normal] left-[1091px] not-italic text-[#aaa4a0] text-[11px] top-[950px] w-[212px]">
        4 of 6 extraction beds currently in use
      </p>
    </div>
  );
}
