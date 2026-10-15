import * as React from "react"

// The navigation composition is selected from the rendered canvas width. At a
// narrow viewport, keeping the desktop rail in the flex layout squeezes the
// active page; use the same overlay surface for touch and narrow desktop panes.
// 768px is the first compact desktop width. Keeping this boundary one pixel
// below the rail's compact breakpoint made the two compositions disagree at
// exactly 768px: the page hid the rail track, then reopened a desktop rail
// that pushed the content instead of using the overlay. The compact route is
// part of the Sheet range, so the main surface never inherits a stale gap.
const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  return React.useSyncExternalStore(
    (onStoreChange) => {
      // Keep the JS breakpoint aligned with the shared mobile CSS boundary.
      // Pointer capability does not change the available layout width, so it
      // must not keep a desktop rail in-flow once the canvas is compact.
      const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)
      const onChange = () => onStoreChange()
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.innerWidth <= MOBILE_BREAKPOINT,
    () => false,
  )
}
