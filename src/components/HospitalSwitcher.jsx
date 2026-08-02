import { useHospital } from "../context/HospitalContext";

// Lets the super admin pick which hospital's data every page shows, or
// aggregate across all of them. Rendered fixed in the top-right corner by
// AppShell (outside the scaled 1440px content canvas, like the sidebar),
// so it's always in the same real screen position regardless of which
// page is showing or how tall that page's content is.
export default function HospitalSwitcher() {
  const { hospitalId, setHospitalId, hospitals, hospitalsLoading } = useHospital();

  return (
    <select
      value={hospitalId}
      onChange={(e) => setHospitalId(e.target.value)}
      disabled={hospitalsLoading}
      aria-label="Select hospital"
      className="font-poppins font-semibold text-[13px] text-[#5a1410] bg-white border border-[#ad2b21] rounded-[10px] pl-3 pr-2 py-2 shadow-[0px_2px_8px_0px_rgba(0,0,0,0.12)] outline-none cursor-pointer disabled:opacity-60 disabled:cursor-wait"
    >
      <option value="all">All Hospitals</option>
      {hospitals.map((h) => (
        <option key={h.id} value={h.id}>
          {h.name}
        </option>
      ))}
    </select>
  );
}
