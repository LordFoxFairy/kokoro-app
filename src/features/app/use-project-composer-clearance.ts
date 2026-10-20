"use client"

import { useLayoutEffect, useRef } from "react"

/** The floating editor must not cover the final history row after draft growth. */
export function useProjectComposerClearance(overviewVisible: boolean) {
  const surfaceRef = useRef<HTMLElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const surface = surfaceRef.current
    const composer = composerRef.current
    if (!overviewVisible || !surface || !composer) return
    const measure = () => {
      surface.style.setProperty("--project-composer-height", `${composer.getBoundingClientRect().height}px`)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(composer)
    return () => {
      observer.disconnect()
      surface.style.removeProperty("--project-composer-height")
    }
  }, [overviewVisible])

  return { surfaceRef, composerRef }
}
