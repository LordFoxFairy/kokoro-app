"use client"
import { useEffectEvent, useLayoutEffect, useRef } from "react"
import type { SessionEngine } from "@/engine/engine-types"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { useT } from "@/i18n/context"
import { readCommunicationPreferences } from "@/ui/notifications/communication-preferences"
import { createTaskBrowserNotifications } from "@/ui/notifications/task-browser-notification"
import { playTaskCompletionSound, retireCompletionSound } from "@/ui/notifications/task-completion-sound"

export function useTaskNotifications(engine: SessionEngine | null, preview: boolean, boundary?: ProjectReadBoundary): void {
  const t = useT()
  const subject = !preview ? boundary?.subject ?? null : null
  const gate = useRef<{ admitted: boolean; subject: string | null; engine: SessionEngine | null }>({ admitted: false, subject: null, engine: null })
  const previousResource = useRef<{ subject: string | null; engine: SessionEngine | null } | null>(null)
  // Only a committed layout boundary grants delivery. Rechecks gate signals,
  // never turn stable subject identity into admission or erase its anchors.
  useLayoutEffect(() => {
    gate.current = { admitted: !preview && boundary?.admitted === true, subject, engine }
    return () => { gate.current = { admitted: false, subject: null, engine: null } }
  }, [engine, preview, subject, boundary?.admitted, boundary?.generation])
  useLayoutEffect(() => {
    const previous = previousResource.current
    if (previous && (previous.subject !== subject || previous.engine !== engine)) {
      previous.engine?.retireTaskNotifications?.()
    }
    previousResource.current = { subject, engine }
  }, [engine, subject])
  const translate = useEffectEvent(t)
  useLayoutEffect(() => {
    if (!engine || !subject || !engine.subscribeTaskNotifications) return
    const identity = JSON.stringify([subject])
    let browser = createTaskBrowserNotifications()
    let sessionId = engine.getSnapshot().store?.activeId ?? null
    const unsubscribeSession = engine.subscribe(() => {
      const next = engine.getSnapshot().store?.activeId ?? null
      if (next === sessionId) return
      browser.dispose(); browser = createTaskBrowserNotifications()
      if (sessionId !== null) retireCompletionSound(identity)
      sessionId = next
    })
    let live = true
    const unsubscribe = engine.subscribeTaskNotifications((signal) => {
      const committed = gate.current
      if (!live || !committed.admitted || committed.subject !== subject || committed.engine !== engine || engine.getSnapshot().store?.activeId !== signal.sessionId) return
      if (!document.hidden && document.hasFocus()) return
      const preferences = readCommunicationPreferences(subject)
      if (preferences.browser_notifications) browser.deliver(
        translate(signal.kind === "completed" ? "settings.taskCompletedTitle" : "hitl.notifyTitle"),
        translate(signal.kind === "completed" ? "settings.taskCompletedBody" : "hitl.notifyBody"),
      )
      if (signal.kind === "completed" && preferences.sound_notifications) playTaskCompletionSound(identity)
    })
    return () => { live = false; unsubscribe(); unsubscribeSession(); browser.dispose(); retireCompletionSound(identity) }
  }, [engine, subject])
}
