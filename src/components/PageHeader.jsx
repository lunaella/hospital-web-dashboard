// Shared top header bar used by every main page (Dashboard, Donor Management,
// Reports, Settings) so the title placement, divider, and notification bell
// are pixel-identical across pages and never shift when navigating between
// them. `right` is an optional slot rendered before the divider (e.g. the
// dashboard's search box).
export default function PageHeader({ title, right }) {
  return (
    <div className="absolute left-[273px] top-0 w-[1167px] h-[93px] bg-white border-b border-[#ececec] flex items-center justify-between pl-10 pr-16">
      <h1 className="font-poppins font-medium text-[17px] text-black">{title}</h1>
      <div className="flex items-center gap-6">
        {right}
        <div className="h-[50px] w-px bg-[#d9d9d9]" />
        <button type="button" className="w-[20px] h-[22px] flex items-center justify-center cursor-pointer" aria-label="Notifications">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="black" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </button>
      </div>
    </div>
  );
}
