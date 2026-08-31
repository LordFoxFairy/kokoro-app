import { useCallback, useEffect, useRef, useState } from "react"

import { WORKSPACE_MAIN_MIN } from "@/ui/shell/layout-constraints"

// The actual pointer/keyboard protocol belongs to shadcn's Resizable
// primitive. This module only owns the user's pixel preference and translates
// the primitive's percentage layout callback into the Canvas width used by
// the surrounding shell.
export const CANVAS_MIN = 320
export const CANVAS_MAX = 760
const CANVAS_DEFAULT = 480

export function snapCanvasWidth(raw: number): number {
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1
  return Math.round(raw * dpr) / dpr
}

export function clampCanvas(raw: number, containerWidth: number): number {
  const max = Math.min(CANVAS_MAX, Math.max(0, containerWidth - WORKSPACE_MAIN_MIN))
  const min = Math.min(CANVAS_MIN, max)
  return snapCanvasWidth(Math.max(min, Math.min(raw, max)))
}

export function clampPreferredCanvas(raw: number): number {
  return snapCanvasWidth(Math.max(CANVAS_MIN, Math.min(raw, CANVAS_MAX)))
}

/** Convert the resizable primitive's percentage layout into a clamped pixel width. */
export function canvasWidthFromLayout(
  layoutValue: number,
  containerWidth: number,
): number {
  if (!Number.isFinite(layoutValue) || !Number.isFinite(containerWidth) || containerWidth <= 0) {
    return 0
  }
  return clampCanvas(containerWidth * layoutValue / 100, containerWidth)
}

export function useCanvasResize(containerRef: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(CANVAS_DEFAULT)
  const preferredWidthRef = useRef(CANVAS_DEFAULT)

  // A rail drag changes the available group width. The resizable Canvas panel
  // uses preserve-pixel-size, so this observer only reconciles the reported
  // width and never competes with the active pointer gesture.
  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === "undefined") return

    const fit = () => {
      const available = container.getBoundingClientRect().width
      if (available <= 0) return
      setWidth((current) => {
        const next = clampCanvas(preferredWidthRef.current, available)
        return next === current ? current : next
      })
    }

    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(container)
    return () => observer.disconnect()
  }, [containerRef])

  const onLayoutChange = useCallback(
    (layout: Record<string, number>) => {
      const container = containerRef.current
      if (!container) return
      const available = container.getBoundingClientRect().width
      const next = canvasWidthFromLayout(layout.canvas ?? 0, available)
      if (next <= 0) return
      preferredWidthRef.current = clampPreferredCanvas(next)
      setWidth(next)
    },
    [containerRef],
  )

  return { width, onLayoutChange }
}
