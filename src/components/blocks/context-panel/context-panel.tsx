"use client"

import { useCallback, useEffect, useRef } from "react"

import { CanvasPanel, type CanvasPanelProps } from "@/ui/canvas/canvas-panel"
import { useOverlayClose } from "@/ui/shell/use-overlay-close"

import styles from "./context-panel.module.css"

function canReturnFocus(target: HTMLElement | null, scope: ParentNode): target is HTMLElement {
  if (!target?.isConnected || !scope.contains(target) || target.matches(":disabled") || target.closest('[hidden], [inert], [aria-hidden="true"], [data-slot="context-panel"]')) return false
  for (let element: HTMLElement | null = target; element; element = element.parentElement) {
    const style = window.getComputedStyle(element)
    if (style.display === "none" || style.visibility === "hidden") return false
  }
  return target.matches('button, input, textarea, select, a[href], [tabindex]')
}

function getCanvasOpener(scope: ParentNode = document) {
  return Array.from(scope.querySelectorAll<HTMLElement>('[data-canvas-opener="true"]'))
    .filter(target => canReturnFocus(target, scope)).at(-1) ?? null
}

function getFocusableReturnTarget(scope: ParentNode = document) {
  const active = document.activeElement
  if (active instanceof HTMLElement && canReturnFocus(active, scope)) return active
  return getCanvasOpener(scope) ?? scope.querySelector<HTMLElement>('[data-sidebar="trigger"]')
}

function resolveReturnTarget(scope: ParentNode, recorded: HTMLElement | null, activityId: string | null) {
  // Resolve again after closing: the main surface may replace the original DOM
  // node. Never use a tool label, source order or a different activity as identity.
  if (activityId) {
    const exact = Array.from(scope.querySelectorAll<HTMLElement>('[data-canvas-opener="true"][data-activity-id]'))
      .find(target => target.dataset.activityId === activityId && canReturnFocus(target, scope))
    if (exact) return exact
  }
  if (canReturnFocus(recorded, scope) && (!activityId || recorded.dataset.activityId === activityId)) return recorded
  if (!activityId) {
    const opener = getCanvasOpener(scope)
    if (opener) return opener
  }
  // A collapsed/retired action is not focusable. Stay in this shell rather than
  // jumping to an unrelated same-named tool or to a hidden Canvas element.
  return Array.from(scope.querySelectorAll<HTMLElement>('[data-settings-return-target="composer"], [data-sidebar="trigger"]'))
    .find(target => canReturnFocus(target, scope)) ?? null
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
  const activityKey = props.content.kind === "activity" ? JSON.stringify([props.sessionId, props.content.runId, props.content.activityId]) : null
  const activityId = props.content.kind === "activity" ? props.content.activityId : null
  const previousActivityKey = useRef(activityKey)
  useEffect(() => {
    if (previousActivityKey.current === activityKey) return
    previousActivityKey.current = activityKey
    const active = document.activeElement
    if (activityKey && active instanceof HTMLElement && active.matches('[data-canvas-opener="true"]') && (focusScopeRef?.current ?? document).contains(active)) returnFocusRef.current = active
  }, [activityKey, focusScopeRef])
  const focusReturnTimerRef = useRef<number | null>(null)
  const closingRef = useRef(false)
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
    if (!closingRef.current && focusReturnTimerRef.current !== null) {
      window.clearTimeout(focusReturnTimerRef.current)
    }
  }, [])
  const completeClose = useCallback(() => {
    closingRef.current = true
    onClose()
    const recorded = pendingDesktopTargetRef.current
    pendingDesktopTargetRef.current = null
    focusReturnTimerRef.current = window.setTimeout(() => {
      focusReturnTimerRef.current = null
      if (focusScopeRef && !focusScopeRef.current) return
      resolveReturnTarget(focusScopeRef?.current ?? document, recorded, activityId)?.focus({ preventScroll: true })
    }, 0)
  }, [activityId, focusScopeRef, onClose])
  const { open, requestClose } = useOverlayClose(completeClose, 220)

  const handleClose = () => {
    if (focusReturnTimerRef.current !== null) {
      window.clearTimeout(focusReturnTimerRef.current)
      focusReturnTimerRef.current = null
    }
    pendingDesktopTargetRef.current = resolveReturnTarget(focusScopeRef?.current ?? document, returnFocusRef.current, activityId)
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
