import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"

import type { SessionEngine } from "@/engine/machine"
import type { SkillCard } from "@/hub/schemas"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { skillTrialSourceRef } from "@/ui/skills/skills-card-model"

type TrialOwner = { context: object; active: boolean; engine: SessionEngine }
type TrialSelection = {
  owner: TrialOwner
  conversationId: string
  sourceRef: string
  name: string
  active: boolean
}

const route = () => typeof window === "undefined" ? "" : `${window.location.pathname}${window.location.search}${window.location.hash}`
const actorMarker = () => {
  try { return typeof window === "undefined" ? undefined : window.localStorage.getItem("kokoro.web.auth-index-subject") }
  catch { return undefined }
}

/** The label and exact source belong to one committed actor/engine/conversation,
 * never to a display title, persisted pin, or a departing route's callback. */
export function useAppFrameSkillTrial({ engine, preview, boundary, handOffPrompt }: {
  engine: SessionEngine | null
  preview: boolean
  boundary: ProjectReadBoundary | undefined
  handOffPrompt: (prompt: string) => void
}) {
  const admitted = boundary?.admitted === true && boundary.subject !== null
  const subject = boundary?.subject
  const generation = boundary?.generation
  const lifetime = useMemo(() => ({ engine, preview, admitted, subject, generation }), [engine, preview, admitted, subject, generation])
  const originRoute = route()
  const marker = actorMarker()
  const actionContext = useMemo(() => ({ lifetime, originRoute, marker }), [lifetime, originRoute, marker])
  const ownerRef = useRef<TrialOwner | null>(null)
  const actionRef = useRef<{ context: typeof actionContext; active: boolean } | null>(null)
  const selectionRef = useRef<TrialSelection | null>(null)
  const [selection, setSelection] = useState<TrialSelection | null>(null)

  const retire = useCallback((value: TrialSelection, explicitClear = false) => {
    value.active = false
    if (selectionRef.current !== value) return
    selectionRef.current = null
    value.owner.engine.setSelectedSkillSourceRefs(explicitClear ? [] : undefined)
    setSelection(null)
  }, [])

  useLayoutEffect(() => {
    if (!engine) return
    const owner = { context: lifetime, active: true, engine }
    ownerRef.current = owner
    const unsubscribe = engine.subscribe(() => {
      const current = selectionRef.current
      // Retire at the first mismatch, synchronously, even if A→B→A occurs
      // within a single React batch and no intermediate view is rendered.
      if (current?.owner === owner && engine.getSnapshot().store?.activeId !== current.conversationId) retire(current)
    })
    return () => {
      owner.active = false
      unsubscribe()
      const current = selectionRef.current
      if (current?.owner === owner) retire(current)
      if (ownerRef.current === owner) ownerRef.current = null
    }
  }, [engine, lifetime, retire])

  const retireForeignActor = useCallback(() => {
    if (preview || actorMarker() === subject) return
    const owner = ownerRef.current
    if (owner) owner.active = false
    const current = selectionRef.current
    if (current?.owner === owner) retire(current)
  }, [preview, retire, subject])

  useLayoutEffect(() => {
    // A cached UI marker is not admission. Cross-tab changes and a new render
    // snapshot must retire the old actor's future selection, never rebind it.
    retireForeignActor()
    window.addEventListener("storage", retireForeignActor)
    return () => window.removeEventListener("storage", retireForeignActor)
  }, [lifetime, marker, retireForeignActor])

  useLayoutEffect(() => {
    const action = { context: actionContext, active: true }
    actionRef.current = action
    const moved = () => { if (route() !== actionContext.originRoute) action.active = false }
    window.addEventListener("popstate", moved)
    window.addEventListener("kokoro:surface-navigation", moved)
    return () => {
      action.active = false
      window.removeEventListener("popstate", moved)
      window.removeEventListener("kokoro:surface-navigation", moved)
    }
  }, [actionContext])

  const startTrial = useCallback((skill: SkillCard, prompt: string): boolean => {
    const action = actionRef.current
    if (!action?.active || action.context !== actionContext || route() !== originRoute
      || marker === undefined || actorMarker() !== marker) return false
    if (preview) { handOffPrompt(prompt); return true }
    const owner = ownerRef.current
    const sourceRef = skillTrialSourceRef(skill)
    if (!admitted || marker !== subject || !owner?.active || owner.context !== lifetime || !sourceRef) return false
    const snapshot = owner.engine.getSnapshot()
    if (!snapshot.canSubmitMessage || snapshot.hydrating || snapshot.hasPendingSubmission || snapshot.canRetryPendingSubmission) return false
    handOffPrompt(prompt)
    const conversationId = owner.engine.getSnapshot().store?.activeId
    if (!conversationId || !owner.active || ownerRef.current !== owner) return false
    owner.engine.setSelectedSkillSourceRefs([sourceRef])
    const next = { owner, conversationId, sourceRef, name: skill.name, active: true }
    selectionRef.current = next
    setSelection(next)
    return true
  }, [actionContext, admitted, handOffPrompt, lifetime, marker, originRoute, preview, subject])

  const selectedSkill = selection?.owner.context === lifetime
    && selection.owner.engine === engine && engine.getSnapshot().store?.activeId === selection.conversationId
    ? { name: selection.name, sourceRef: selection.sourceRef } : null
  const clearSelectedSkill = useCallback(() => {
    if (selection?.active && selection.owner.context === lifetime && ownerRef.current === selection.owner
      && selection.owner.engine.getSnapshot().store?.activeId === selection.conversationId) retire(selection, true)
  }, [lifetime, retire, selection])

  return { startTrial, selectedSkill, clearSelectedSkill }
}
