import { Link, useLocation } from "react-router-dom";
import resqLogo from "../assets/resq-logo.png";
import { IconUsers, IconChart, IconGrid, IconGear } from "./icons";
import { useAuth } from "../context/AuthContext";

// Nav icons render inline instead of via <img src="figma.com/api/mcp/asset/...">
// — those were ephemeral Figma design-tool links, not a real asset host, so
// every sidebar icon 404'd in a real browser.

// Which sidebar item should look "active" for a given path — /view-broadcasts
// has no dedicated sidebar item of its own, so it's grouped under Donor
// Management like before the Team Access rewrite.
const ACTIVE_PATH_OVERRIDES = { "/view-broadcasts": "/donor-management" };

// One row per top-list nav item. `section` gates visibility: an admin with
// 'none' on that section doesn't see the link at all, since navigating there
// would just 403 on every API call anyway. Settings is handled separately,
// pinned to the bottom — every logged-in admin can always reach it, since
// Account Credentials/session/logout are self-service regardless of section
// permissions (see server/src/routes/settings.routes.js).
const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: IconGrid, section: "dashboard" },
  { to: "/donor-management", label: "Donor Management", icon: IconUsers, section: "donor_management" },
  { to: "/reports", label: "Reports", icon: IconChart, section: "reports" },
];

const FIRST_ITEM_TOP = 129;
const ITEM_GAP = 56;

export default function WebNav({ className }) {
  const location = useLocation();
  const { permissions, profileError } = useAuth();

  const activePath = ACTIVE_PATH_OVERRIDES[location.pathname] || location.pathname;
  // On a genuine permissions restriction, hide the item — navigating there
  // would just 403 anyway. But if we couldn't even confirm the admin's
  // permissions (profileError — see AuthContext/SectionGuard), permissions
  // defaults to the same "none everywhere" shape as a real restriction
  // would. Showing every item in that case, rather than a near-empty
  // sidebar, keeps the admin able to navigate and retry from each page's
  // own SectionGuard instead of looking locked out of the whole app.
  const visibleItems = profileError
    ? NAV_ITEMS
    : NAV_ITEMS.filter((item) => permissions[item.section] !== "none");
  const activeIndex = visibleItems.findIndex((item) => item.to === activePath);
  const isSettingsActive = activePath === "/settings";

  return (
    <div className={className || "h-full overflow-clip relative w-[296px]"}>
      {/* #9B1B20 is the same red used on the login page's "Log in" button
          (and as the primary brand red everywhere else in the app) — swapped
          in here from the previous dark maroon #751423 so the sidebar
          matches. */}
      <div className="absolute bg-[#9B1B20] h-full left-0 top-0 w-[276px]" />

      <div className="absolute contents left-[36px] top-[36px]">
        <div className="absolute h-[41.558px] left-[36px] top-[36px] w-[54.481px]">
          <div className="absolute inset-[-1.21%_-0.92%_-1.2%_-0.92%]">
            <img alt="" className="block max-w-none size-full" src={resqLogo} />
          </div>
        </div>
        <div className="absolute bg-[rgba(255,255,255,0.25)] h-[38px] left-[100px] top-[38px] w-[1.5px]" />
        <p className="absolute font-poppins font-semibold leading-[normal] left-[112px] not-italic text-[13px] text-[rgba(255,255,255,0.85)] top-[48px] tracking-[0.2em] whitespace-nowrap">
          ADMIN
        </p>
      </div>

      {activeIndex >= 0 && (
        <div
          className="absolute bg-[rgba(217,217,217,0.25)] h-[47px] left-[10px] rounded-[15px] w-[257px]"
          style={{ top: FIRST_ITEM_TOP + activeIndex * ITEM_GAP - 9 }}
        />
      )}

      {visibleItems.map((item, i) => {
        const ItemIcon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            className="absolute contents left-[24px] cursor-pointer"
            style={{ top: FIRST_ITEM_TOP + i * ITEM_GAP }}
          >
            <div className="absolute left-[24px] flex items-center gap-3" style={{ top: FIRST_ITEM_TOP + i * ITEM_GAP }}>
              <ItemIcon className="w-[18px] h-[18px] text-white shrink-0" />
              <p className="font-poppins font-semibold leading-[normal] not-italic text-[17px] text-white whitespace-nowrap">
                {item.label}
              </p>
            </div>
          </Link>
        );
      })}

      <Link to="/settings" className="absolute left-0 bottom-0 w-[279px] h-[60px] cursor-pointer">
        {isSettingsActive && <div className="absolute bg-[rgba(217,217,217,0.25)] h-[47px] left-[11px] rounded-[15px] top-[6px] w-[257px]" />}
        {!isSettingsActive && <div className="absolute bg-[rgba(217,217,217,0.05)] inset-0" />}
        <div className="absolute left-[30px] top-0 h-[60px] flex items-center gap-3">
          <IconGear className="w-[19px] h-[19px] text-white shrink-0" />
          <p className="font-poppins font-semibold leading-[normal] not-italic text-[17px] text-white whitespace-nowrap">
            Settings
          </p>
        </div>
      </Link>
    </div>
  );
}
