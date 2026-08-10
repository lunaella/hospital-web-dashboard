import HospitalSwitcher from "./HospitalSwitcher";
import NotificationBell from "./NotificationBell";

// Shared top header bar used by every main page (Dashboard, Donor Management,
// Reports, Settings) so the title placement, divider, and notification bell
// are pixel-identical across pages and never shift when navigating between
// them. `right` is an optional slot rendered before the divider (e.g. the
// dashboard's search box).
//
// The hospital switcher lives here (rather than floating fixed in a
// viewport corner) so it's just another item in this row's existing
// `gap-6` flex layout — it gets real spacing from its neighbors for free
// and scales with the rest of the header instead of a separately-tuned
// fixed position that can drift into whatever a page happens to put in
// its own `right` slot (it collided with the search box before).
export default function PageHeader({ title, right }) {
  return (
    <div className="absolute left-[273px] top-0 w-[1167px] h-[93px] bg-white border-b border-[#ececec] flex items-center justify-between pl-10 pr-16">
      <h1 className="font-poppins font-medium text-[17px] text-black">{title}</h1>
      <div className="flex items-center gap-6">
        {right}
        <HospitalSwitcher />
        <div className="h-[50px] w-px bg-[#d9d9d9]" />
        <NotificationBell />
      </div>
    </div>
  );
}
