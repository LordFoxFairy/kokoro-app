type MountedSurfaceMouseEvent = {
  defaultPrevented: boolean
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  preventDefault: () => void
}

/**
 * Change between the already-mounted User Web surfaces without asking Next
 * for a second RSC document. The route pages under /app are intentionally
 * empty shells; KokoroAppSurface projects the address bar into the active
 * surface and keeps the rail, composer, and cached data mounted.
 */
export function navigateMountedSurface(href: string): void {
  if (typeof window === "undefined") return
  const next = new URL(href, window.location.href)
  const target = `${next.pathname}${next.search}${next.hash}`
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (target === current) return
  window.history.pushState(window.history.state, "", target)
  window.dispatchEvent(new Event("kokoro:surface-navigation"))
}

/**
 * Preserve normal link behavior for modified clicks and new tabs, while
 * making an ordinary same-shell click commit the URL and surface in one
 * interaction frame.
 */
export function interceptMountedSurfaceNavigation(event: MountedSurfaceMouseEvent, href: string): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return
  }
  event.preventDefault()
  navigateMountedSurface(href)
}
