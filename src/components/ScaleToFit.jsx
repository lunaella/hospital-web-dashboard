import { useEffect, useState } from "react";

const DESIGN_WIDTH = 1440;

// Every page in this app was built from Figma frames at a fixed 1440px canvas
// width, using absolute pixel positioning throughout. That's fine at 1440px,
// but on any narrower (or wider) window it either gets cropped or leaves a
// huge gutter — there's no fluid reflow to fall back on without rebuilding
// every page's layout from scratch.
//
// ScaleToFit is a pragmatic middle ground: it uses CSS `zoom` (not
// `transform: scale`) to shrink/grow the whole 1440px canvas so it always
// exactly fills the viewport's width. Unlike `transform`, `zoom` changes
// actual layout, not just paint — so the browser computes the resulting
// height on its own and the page only ever scrolls vertically. No manual
// height measuring, no wrapper-height sync bugs, no horizontal scroll.
export default function ScaleToFit({ children }) {
  const [zoom, setZoom] = useState(() => (typeof window !== "undefined" ? window.innerWidth / DESIGN_WIDTH : 1));

  useEffect(() => {
    function update() {
      setZoom(window.innerWidth / DESIGN_WIDTH);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return <div style={{ width: DESIGN_WIDTH, zoom }}>{children}</div>;
}
