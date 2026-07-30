import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import WebNav from "./WebNav";

const DESIGN_WIDTH = 1440;
const SIDEBAR_WIDTH = 296;

const NAV_VARIANT_BY_PATH = {
  "/dashboard": "DashboardNav",
  "/donor-management": "DMNav",
  "/view-broadcasts": "DMNav", // no dedicated sidebar item for broadcasts; grouped under Donor Management like before
  "/reports": "ReportsNav",
  "/settings": "SettingsNav",
};

// Pages using this shell no longer render their own <WebNav> inline — it's
// rendered once here, pinned to the real viewport via position:fixed, so it
// stays visible regardless of how tall the current page's content is or how
// far the page has scrolled. (Previously WebNav lived inside the same
// zoomed, scrolling 1440px canvas as the page content, so on any page taller
// than the window, reaching "Settings" at the bottom of the sidebar meant
// scrolling all the way to the bottom of the whole page first.)
//
// The sidebar's on-screen WIDTH tracks the same width-based zoom factor as
// the content (so it lines up with the blank 296px-wide column each page
// still reserves on its left edge), but its on-screen HEIGHT is always the
// real viewport height, independent of zoom — it's a fixed frame element,
// not part of the scrolling canvas. transform: scale() (not CSS zoom) is
// used here since we need precise, independently-computed width and height
// scaling, not just a uniform reflow.
export default function AppShell({ children }) {
  const location = useLocation();
  const [zoom, setZoom] = useState(() => (typeof window !== "undefined" ? window.innerWidth / DESIGN_WIDTH : 1));
  const [viewportHeight, setViewportHeight] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 0));

  useEffect(() => {
    function update() {
      setZoom(window.innerWidth / DESIGN_WIDTH);
      setViewportHeight(window.innerHeight);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const property1 = NAV_VARIANT_BY_PATH[location.pathname] || "DashboardNav";

  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: SIDEBAR_WIDTH * zoom,
          height: "100vh",
          overflow: "hidden",
          zIndex: 40,
        }}
      >
        <div
          style={{
            width: SIDEBAR_WIDTH,
            height: viewportHeight / zoom,
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
          }}
        >
          <WebNav property1={property1} />
        </div>
      </div>
      <div style={{ width: DESIGN_WIDTH, zoom }}>{children}</div>
    </>
  );
}
