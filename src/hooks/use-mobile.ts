import * as React from "react"

// User Web keeps its full desktop workbench through the compact browser widths
// used by a 2K/Retina window. The rail must not turn into a Sheet merely
// because browser chrome reduces the CSS viewport; only the actual phone
// breakpoint switches to the mobile surface.
const MOBILE_BREAKPOINT = 767

export function useIsMobile() {
  return React.useSyncExternalStore(
    (onStoreChange) => {
      // Keep the JS breakpoint aligned with the shared mobile CSS boundary.
      // Desktop Web remains a fixed, resizable workbench above this point.
      // Browser zoom reduces CSS pixels, but it does not turn a desktop
      // pointer/keyboard surface into a phone. Using coarse pointer as the
      // second signal prevents a zoomed 2K desktop from silently switching
      // to the Sheet/mobile composition.
      const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px), (pointer: coarse)`)
      const onChange = () => onStoreChange()
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.innerWidth <= MOBILE_BREAKPOINT && window.matchMedia("(pointer: coarse)").matches,
    () => false,
  )
}
