import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

import {
  RAIL_COLLAPSED_WIDTH,
  RAIL_MAX,
  RAIL_MIN,
  useRailResize,
} from "@/ui/rail/use-rail-resize"
import { CANVAS_MAX, CANVAS_MIN, useCanvasResize } from "@/ui/canvas/use-canvas-resize"
import { WORKSPACE_MAIN_MIN } from "@/ui/shell/layout-constraints"

import { isFocusTargetAvailable, readRailCollapsedCookie, useCompactDesktopRail } from "./app-frame-helpers"

export type AppFrameLayoutOptions = {
  desktopRailCollapsed: boolean
  canvasOpen: boolean
}

/** Owns rail/canvas geometry, resize transactions, and shell focus recovery. */
export function useAppFrameLayout({
  desktopRailCollapsed,
  canvasOpen,
}: AppFrameLayoutOptions) {
  const compactDesktopRail = useCompactDesktopRail()

  // The server cannot read the sidebar cookie. Start from the server-provided
  // default so hydration has an identical tree, then reconcile the persisted
  // preference in a layout effect before the first painted frame. Reading
  // the cookie inside the state initializer made a returning user render a
  // different rail tree on the client, triggering a hydration rebuild and the
  // visible dev "Issues" pill.
  const [railCollapsed, setRailCollapsed] = useState(desktopRailCollapsed)
  const railPreferenceReadRef = useRef(false)
  useLayoutEffect(() => {
    // The route adapter can change its default while this AppFrame stays
    // mounted. Cookie reconciliation is a first-mount concern only; reading
    // it again during mounted-surface navigation would submit a second rail
    // state in the same transition and bring back the one-frame flash.
    if (railPreferenceReadRef.current) return
    railPreferenceReadRef.current = true
    let active = true
    // Queue after the layout effect so the server/client tree stays identical
    // while still reconciling before the next user interaction. The async
    // callback also avoids a synchronous cascading render in React's effect
    // lint rule.
    queueMicrotask(() => {
      if (!active) return
      const persistedCollapsed = readRailCollapsedCookie()
      if (persistedCollapsed !== null) setRailCollapsed(persistedCollapsed)
    })
    return () => {
      active = false
    }
  }, [])

  const [compactRailOpen, setCompactRailOpen] = useState(false)
  const resolvedRailCollapsed = compactDesktopRail ? !compactRailOpen : railCollapsed
  const railHidden = compactDesktopRail && resolvedRailCollapsed

  // A compact expansion belongs only to the current narrow-window session.
  // Clear it after crossing back to the wide layout so a later shrink always
  // starts from the reference's automatic 52px command rail instead of
  // reviving an expanded rail from an earlier window size.
  useEffect(() => {
    if (compactDesktopRail) return
    let active = true
    queueMicrotask(() => {
      if (active) setCompactRailOpen(false)
    })
    return () => {
      active = false
    }
  }, [compactDesktopRail])

  const railBeforeCanvasRef = useRef<boolean | null>(null)
  const compactRailBeforeCanvasRef = useRef<boolean | null>(null)
  const { width: railWidth, isResizing, shellRef, onResizeStart, onResizeKeyDown } = useRailResize()
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const { width: canvasWidth, onLayoutChange: onCanvasLayoutChange } = useCanvasResize(workspaceRef)

  const canvasResizeCleanupRef = useRef<(() => void) | null>(null)
  const onCanvasResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const shell = shellRef.current
    if (!shell || shell.dataset.railResizing === "true") {
      return
    }

    // Resizable owns the pointer protocol. The shell only publishes a
    // transaction marker so the rail handle cannot start a competing drag in
    // the same frame, which was the remaining source of split-speed seams.
    shell.dataset.canvasResizing = "true"
    shell.dataset.resizing = "true"
    const handle = event.currentTarget
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    // Keep the page interaction contract identical to the rail drag. The
    // panel primitive owns the width math, while the shell owns the global
    // drag lock and guarantees that a cancelled gesture cannot leave the
    // workbench in a permanent `col-resize` state.
    handle.setPointerCapture?.(event.pointerId)
    const end = () => {
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointercancel", end)
      window.removeEventListener("blur", end)
      handle.removeEventListener("lostpointercapture", end)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      if (handle.hasPointerCapture?.(event.pointerId)) {
        handle.releasePointerCapture?.(event.pointerId)
      }
      if (document.activeElement === handle) {
        handle.blur()
      }
      delete shell.dataset.canvasResizing
      if (shell.dataset.railResizing !== "true") {
        delete shell.dataset.resizing
      }
      if (canvasResizeCleanupRef.current === end) {
        canvasResizeCleanupRef.current = null
      }
    }
    canvasResizeCleanupRef.current?.()
    canvasResizeCleanupRef.current = end
    window.addEventListener("pointerup", end)
    window.addEventListener("pointercancel", end)
    window.addEventListener("blur", end)
    handle.addEventListener("lostpointercapture", end)
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }, [shellRef])

  useEffect(() => () => {
    canvasResizeCleanupRef.current?.()
  }, [])

  // Narrow desktop windows still use the Web workbench, but an expanded rail
  // plus the main and Canvas minimums cannot fit at the same time. Manus-like
  // workbenches prioritize the active document: collapse only the rail while
  // Canvas is open, then restore the user's previous rail preference on close.
  // Keep the rail and Canvas constraints in one Web layout transaction.
  useLayoutEffect(() => {
    if (typeof window === "undefined") return
    const reconcileRailForCanvas = () => {
      const shellWidth = shellRef.current?.getBoundingClientRect().width ?? window.innerWidth
      const availableMainAndCanvas = shellWidth - railWidth
      const requiredMainAndCanvas = WORKSPACE_MAIN_MIN + CANVAS_MIN + 1

      if (canvasOpen && !resolvedRailCollapsed && availableMainAndCanvas < requiredMainAndCanvas) {
        if (compactDesktopRail) {
          // Compact desktop derives visibility from compactRailOpen; changing
          // railCollapsed alone cannot restore an automatically hidden rail.
          compactRailBeforeCanvasRef.current = true
        } else {
          railBeforeCanvasRef.current = false
        }
        setRailCollapsed(true)
        setCompactRailOpen(false)
        return
      }

      if (!canvasOpen && compactRailBeforeCanvasRef.current === true) {
        compactRailBeforeCanvasRef.current = null
        setCompactRailOpen(true)
      }
      if (!canvasOpen && railBeforeCanvasRef.current === false) {
        railBeforeCanvasRef.current = null
        setRailCollapsed(false)
      }
    }

    reconcileRailForCanvas()
    window.addEventListener("resize", reconcileRailForCanvas)
    const observer = shellRef.current && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(reconcileRailForCanvas)
      : null
    if (observer && shellRef.current) observer.observe(shellRef.current)

    return () => {
      window.removeEventListener("resize", reconcileRailForCanvas)
      observer?.disconnect()
    }
  }, [canvasOpen, compactDesktopRail, railWidth, resolvedRailCollapsed, shellRef])

  // Canvas is controlled by the shell rather than a trigger-owned Dialog.
  // Restore focus at the shell boundary after the panel unmounts; this also
  // covers virtualized/content-visibility message items whose opener was not
  // the browser's active element when the Canvas mounted.
  const canvasWasOpenRef = useRef(false)
  useEffect(() => {
    const wasOpen = canvasWasOpenRef.current
    canvasWasOpenRef.current = canvasOpen
    if (!wasOpen || canvasOpen) return
    const frame = window.requestAnimationFrame(() => {
      // ContextPanel captures the actual opener (not merely the last matching
      // button) and restores it when its controlled surface closes.  This
      // shell fallback is only for virtualized openers that disappeared from
      // the DOM.  Do not let a broad querySelector steal focus from a
      // successful panel-level restoration when several Canvas actions exist.
      const active = document.activeElement
      if (
        active instanceof HTMLElement
        && active !== document.body
        && isFocusTargetAvailable(active)
      ) {
        return
      }
      // The shell owns the Canvas instance. Keep the fallback inside this
      // workspace so an embedded site or a shared-thread preview cannot steal
      // focus from another mounted AppFrame.
      shellRef.current
        ?.querySelector<HTMLElement>('[data-canvas-opener="true"]:not([disabled])')
        ?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [canvasOpen, shellRef])

  return {
    compactDesktopRail,
    railCollapsed,
    setRailCollapsed,
    compactRailOpen,
    setCompactRailOpen,
    resolvedRailCollapsed,
    railHidden,
    railWidth,
    isResizing,
    shellRef,
    onResizeStart,
    onResizeKeyDown,
    workspaceRef,
    canvasWidth,
    onCanvasLayoutChange,
    onCanvasResizeStart,
    railMin: RAIL_MIN,
    railMax: RAIL_MAX,
    railCollapsedWidth: RAIL_COLLAPSED_WIDTH,
    canvasMin: CANVAS_MIN,
    canvasMax: CANVAS_MAX,
  }
}
