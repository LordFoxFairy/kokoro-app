"use client"

import { useCallback, useEffect, useRef } from "react"

import { CanvasPanel, type CanvasPanelProps } from "@/ui/canvas/canvas-panel"
import { useOverlayClose } from "@/ui/shell/use-overlay-close"

import styles from "./context-panel.module.css"

function getCanvasOpener(scope: ParentNode = document) {
  return Array.from(
    scope.querySelectorAll<HTMLElement>('[data-canvas-opener="true"]:not([disabled])'),
  ).at(-1) ?? null
}

function getFocusableReturnTarget(scope: ParentNode = document) {
  const active = document.activeElement
  if (active instanceof HTMLElement && active !== document.body && active.isConnected) {
    return active
  }

  // The opener can disappear when the active conversation is replaced. Prefer
  // the still-mounted Canvas action, then keep focus inside the stable shell
  // instead of letting Radix fall back to body.
  return getCanvasOpener(scope) ?? scope.querySelector<HTMLElement>('[data-sidebar="trigger"]')
}

/** Optional second view of a site workspace, rendered as a side-by-side Web panel. */
export function ContextPanel(props: CanvasPanelProps) {
  const { onClose } = props
  // AppFrame can be embedded more than once on a host page. Keep all fallback
  // focus recovery inside that shell; document-wide queries can otherwise
  // return another site's canvas opener or sidebar trigger.
  const { focusScopeRef, ...canvasProps } = props
  // Canvas is controlled by the shell and has no trigger of its own. Capture
  // the invoking control before the panel opens so closing it restores focus.
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const previousSessionIdRef = useRef(props.sessionId)
  const focusReturnTimerRef = useRef<number | null>(null)
  const pendingDesktopTargetRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (returnFocusRef.current || typeof document === "undefined") return
    returnFocusRef.current = getFocusableReturnTarget(focusScopeRef?.current ?? document)
  }, [focusScopeRef, props.sessionId])
  useEffect(() => {
    if (previousSessionIdRef.current === props.sessionId) return
    previousSessionIdRef.current = props.sessionId
    // Switching conversations can keep a Canvas mounted while replacing its
    // content. The original opener may have been unmounted with the old
    // thread, so capture the current navigation action instead of focusing a
    // detached element when the new Canvas closes.
    returnFocusRef.current = getFocusableReturnTarget(focusScopeRef?.current ?? document)
  }, [focusScopeRef, props.sessionId])
  useEffect(() => () => {
    if (focusReturnTimerRef.current !== null) {
      window.clearTimeout(focusReturnTimerRef.current)
    }
  }, [])
  const completeClose = useCallback(() => {
    onClose()
    if (pendingDesktopTargetRef.current) {
      const desktopTarget = pendingDesktopTargetRef.current
      pendingDesktopTargetRef.current = null
      focusReturnTimerRef.current = window.setTimeout(() => {
        focusReturnTimerRef.current = null
        const target = desktopTarget.isConnected
          ? desktopTarget
          : getCanvasOpener(focusScopeRef?.current ?? document) ?? getFocusableReturnTarget(focusScopeRef?.current ?? document)
        target?.focus()
      }, 0)
    }
  }, [focusScopeRef, onClose])
  const { open, requestClose } = useOverlayClose(completeClose, 220)

  const handleClose = () => {
    if (focusReturnTimerRef.current !== null) {
      window.clearTimeout(focusReturnTimerRef.current)
      focusReturnTimerRef.current = null
    }
    // Resolve the target before the controlled Canvas unmounts. The opener can
    // be inside a virtualized/content-visibility region and disappear from
    // the active element during the close commit, even though it remains in
    // the document for the next frame.
    // The active opener is authoritative. `getCanvasOpener(scope)` is only a
    // fallback: several delivery/tool buttons can coexist in the thread, and
    // choosing the last DOM match would return focus to a different action
    // than the one that opened this Canvas.
    const desktopTarget = (returnFocusRef.current?.isConnected ? returnFocusRef.current : null)
      ?? getCanvasOpener(focusScopeRef?.current ?? document)
      ?? getFocusableReturnTarget(focusScopeRef?.current ?? document)
    pendingDesktopTargetRef.current = desktopTarget
    requestClose()
  }

  // CanvasPanel already owns the semantic aside and its content-specific
  // accessible name. Avoid nesting a second landmark around it; nested asides
  // make screen-reader landmark navigation announce the same surface twice.
  return (
    <div
      className={styles.desktopHost}
      data-slot="context-panel"
      data-desktop-web="true"
      data-state={open ? "open" : "closed"}
      aria-hidden={!open}
      // A closed desktop Canvas stays mounted for the exit transition and
      // focus hand-off. It must not remain discoverable by screen readers or
      // keyboard navigation while it is visually gone.
      inert={!open ? true : undefined}
    >
      <CanvasPanel {...canvasProps} onClose={handleClose} />
    </div>
  )
}
