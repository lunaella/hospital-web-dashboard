import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import WebNav from "./WebNav";

const DESIGN_WIDTH = 1440;
const SIDEBAR_WIDTH = 296;
// Below this zoom, text/buttons start getting genuinely hard to read/tap
// (e.g. an 11px hint label rendering at a few physical pixels on a phone).
// Rather than keep shrinking to exactly fit narrow screens, zoom stops here
// and the app becomes wider than the viewport instead — the person pans
// sideways to see the rest, like a desktop site on mobile, but nothing ever
// renders smaller than this floor.
const MIN_ZOOM = 0.9;

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
//
// The main content used to use CSS `zoom` here too (like ScaleToFit uses for
// the login pages), which avoids the height-measuring dance below — but zoom
// actually re-lays-out text at the zoomed size instead of just repainting
// scaled pixels, and browsers round glyph widths differently at odd
// fractional zoom levels (e.g. a 1320px-wide window gives zoom = 0.9167).
// That rounding accumulates across a sentence and can push text onto an
// extra line at some window widths but not others, which is exactly the
// "looks fine maximized, breaks when I shrink the window" bug reported:
// names/labels that fit on one line at zoom 1 would wrap at zoom 0.9-ish
// even though nothing about the content changed. transform: scale() lays
// out every page once at its native 1440px width — text wrapping is
// computed a single time regardless of window size — and then uniformly
// resizes the already-final pixels, so wrapping can never differ by zoom
// level. The tradeoff `zoom` was chosen to avoid (transform doesn't affect
// layout, so the wrapper needs to be told the scaled height manually) is
// handled below with a ResizeObserver on the unscaled content.
export default function AppShell({ children }) {
  const location = useLocation();
  const [naturalZoom, setNaturalZoom] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth / DESIGN_WIDTH : 1
  );
  // Whether the viewport is narrow enough that MIN_ZOOM is actively clamping
  // (i.e. the canvas is deliberately wider than the screen right now) — see
  // the sidebar's position toggle below for why this needs to be known.
  const isNarrow = naturalZoom < MIN_ZOOM;
  const zoom = Math.max(naturalZoom, MIN_ZOOM);
  const [viewportHeight, setViewportHeight] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 0));
  const contentRef = useRef(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    function update() {
      setNaturalZoom(window.innerWidth / DESIGN_WIDTH);
      setViewportHeight(window.innerHeight);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Tracks the content's real (unscaled) height — which varies per page and,
  // on pages like Reports/Dashboard, per how much live data they're showing
  // — so the outer wrapper can reserve the correct *scaled* height in the
  // document's normal flow. Without this the page would either clip content
  // or leave a leftover gap sized for the wrong page after switching routes.
  useEffect(() => {
    const el = contentRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      setContentHeight(entries[0].contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [location.pathname]);

  return (
    // Below MIN_ZOOM the canvas is deliberately wider than the viewport (see
    // MIN_ZOOM above) — `overflowX: auto` is what lets the person pan
    // sideways to reach the rest of it instead of it just clipping off the
    // edge of the screen. `position: relative` gives the sidebar something
    // to scroll *with* in that case — see the position toggle just below.
    <div style={{ position: "relative", overflowX: isNarrow ? "auto" : "visible" }}>
      <div
        style={{
          // Fixed (pinned to the real viewport, ignoring all scrolling) is
          // correct at normal zoom, where the canvas never exceeds the
          // viewport width — that's what keeps the sidebar visible while
          // scrolling down a tall page. But once the canvas is deliberately
          // wider than the viewport (isNarrow) and the person pans sideways,
          // a viewport-fixed sidebar would stay glued to the screen's left
          // edge while the actual page content scrolls out from under it —
          // so past a small amount of panning, real content would slide in
          // underneath the still-pinned sidebar instead of appearing beside
          // it. `absolute` (positioned against this wrapper, which pans
          // normally) keeps the sidebar correctly aligned with its own
          // reserved blank column in the canvas at every scroll position,
          // at the cost of it no longer staying put while scrolling down a
          // tall page — an acceptable trade in a mode people already expect
          // to scroll around in.
          position: isNarrow ? "absolute" : "fixed",
          top: 0,
          left: 0,
          width: SIDEBAR_WIDTH * zoom,
          height: isNarrow ? contentHeight * zoom : "100vh",
          overflow: "hidden",
          zIndex: 40,
        }}
      >
        <div
          style={{
            width: SIDEBAR_WIDTH,
            height: (isNarrow ? contentHeight * zoom : viewportHeight) / zoom,
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
          }}
        >
          <WebNav />
        </div>
      </div>
      <div style={{ width: DESIGN_WIDTH * zoom, height: contentHeight * zoom, overflow: "hidden" }}>
        <div ref={contentRef} style={{ width: DESIGN_WIDTH, transform: `scale(${zoom})`, transformOrigin: "top left" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
