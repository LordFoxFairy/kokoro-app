import * as React from "react"

import { WORKSPACE_DESKTOP_MIN_WIDTH } from "@/ui/shell/layout-constraints"

// The navigation composition is selected from the rendered canvas width. At a
// narrow viewport, keeping the desktop rail in the flex layout squeezes the
// active page; use the same overlay surface for touch and narrow desktop panes.
// The overlay and compact rail must switch together below the desktop minimum.
// At exactly 768px, retain the desktop composition rather than hiding its track.

export function useIsMobile() {
  return React.useSyncExternalStore(
    (onStoreChange) => {
      // Keep the JS breakpoint aligned with the shared mobile CSS boundary.
      // Pointer capability does not change the available layout width, so it
      // must not keep a desktop rail in-flow once the canvas is compact.
      const mql = window.matchMedia(`(width < ${WORKSPACE_DESKTOP_MIN_WIDTH}px)`)
      const onChange = () => onStoreChange()
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.matchMedia(`(width < ${WORKSPACE_DESKTOP_MIN_WIDTH}px)`).matches,
    () => false,
  )
}
