"use client"

import { useCallback, useEffect, useRef, useState } from "react"

function focusable(target: HTMLElement | null): target is HTMLElement {
  if (!target || !target.isConnected || target.hasAttribute("disabled")) return false
  const style = window.getComputedStyle(target)
  return style.display !== "none" && style.visibility !== "hidden"
}

/** Keep a controlled Radix overlay mounted while its exit animation renders. */
export function useOverlayClose(onClose: () => void, durationMs = 220) {
  const [open, setOpen] = useState(true)
  const closingRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  // Controlled Dialogs have no Radix Trigger. Capture the actual opener once
  // so standalone panels return focus to the rail action instead of body.
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document !== "undefined"
      && document.activeElement instanceof HTMLElement
      && document.activeElement !== document.body
      ? document.activeElement
      : null,
  )

  useEffect(() => {
    if (returnFocusRef.current !== null) return
    const active = document.activeElement
    if (active instanceof HTMLElement && active !== document.body) {
      returnFocusRef.current = active
    }
  }, [])

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }, [])

  const requestClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setOpen(false)
    const reducedMotion = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const delay = reducedMotion ? 0 : durationMs
    if (delay === 0) {
      onClose()
      return
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      onClose()
    }, delay)
  }, [durationMs, onClose])

  const onCloseAutoFocus = useCallback((event: Event) => {
    const target = returnFocusRef.current
    if (!focusable(target)) return
    event.preventDefault()
    window.requestAnimationFrame(() => target.focus())
  }, [])

  return { open, requestClose, onCloseAutoFocus, returnFocusRef }
}
