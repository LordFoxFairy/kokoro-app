import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"

import type { SessionEngine } from "@/engine/machine"
import { activeMode, type AgentMode } from "@/core/conversations"
import type { SkillCard } from "@/hub/schemas"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { skillTrialSourceRef } from "@/ui/skills/skills-card-model"

type TrialOwner = { context: object; active: boolean; engine: SessionEngine }
type TrialSelection = {
  owner: TrialOwner
  conversationId: string | null
  sourceRef: string
  name: string
  active: boolean
  draftRoute?: string
}
type DraftSubmission = { selection: TrialSelection; allocated: boolean }

const route = () => typeof window === "undefined" ? "" : `${window.location.pathname}${window.location.search}${window.location.hash}`
const actorMarker = () => {
  try { return typeof window === "undefined" ? undefined : window.localStorage.getItem("kokoro.web.auth-index-subject") }
  catch { return undefined }
}

/** The label and exact source belong to one committed actor/engine/conversation,
 * never to a display title, persisted pin, or a departing route's callback. */
export function useAppFrameSkillTrial({ engine, preview, boundary }: {
  engine: SessionEngine | null
  preview: boolean
  boundary: ProjectReadBoundary | undefined
}) {
  const admitted = boundary?.admitted === true && boundary.subject !== null
  const subject = boundary?.subject
  const generation = boundary?.generation
  const lifetime = useMemo(() => ({ engine, preview, admitted, subject, generation }), [engine, preview, admitted, subject, generation])
  const [routeEpoch, setRouteEpoch] = useState(0)
  const originRoute = route()
  const marker = actorMarker()
  const actionContext = useMemo(() => ({ lifetime, originRoute, marker, routeEpoch }), [lifetime, originRoute, marker, routeEpoch])
  const ownerRef = useRef<TrialOwner | null>(null)
  const actionRef = useRef<{ context: typeof actionContext; active: boolean } | null>(null)
  const selectionRef = useRef<TrialSelection | null>(null)
  const draftSubmissionRef = useRef<DraftSubmission | null>(null)
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
      const conversationId = engine.getSnapshot().store?.activeId ?? null
      if (current?.owner !== owner || conversationId === current.conversationId) return
      const submitting = draftSubmissionRef.current
      // Only this synchronous, explicit Send may carry the current draft into
      // its newly allocated conversation. Navigation never arms this fence.
      if (submitting?.selection === current && !submitting.allocated && conversationId !== null
        && owner.active && actorMarker() === subject
        && (current.draftRoute === undefined || route() === current.draftRoute)) {
        const next: TrialSelection = { owner, conversationId, sourceRef: current.sourceRef, name: current.name, active: true }
        current.active = false
        submitting.selection = next
        submitting.allocated = true
        selectionRef.current = next
        engine.setSelectedSkillSourceRefs([next.sourceRef])
        setSelection(next)
      } else retire(current)
    })
    return () => {
      owner.active = false
      unsubscribe()
      const current = selectionRef.current
      if (current?.owner === owner) retire(current)
      if (ownerRef.current === owner) ownerRef.current = null
    }
  }, [engine, lifetime, retire, subject])

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
    const current = selectionRef.current
    if (current?.draftRoute !== undefined && current.draftRoute !== actionContext.originRoute) retire(current)
    const action = { context: actionContext, active: true }
    actionRef.current = action
    const moved = () => {
      if (route() === actionContext.originRoute) return
      action.active = false
      setRouteEpoch(epoch => epoch + 1)
      const current = selectionRef.current
      if (current?.draftRoute !== undefined) retire(current)
    }
    window.addEventListener("popstate", moved)
    window.addEventListener("kokoro:surface-navigation", moved)
    return () => {
      action.active = false
      window.removeEventListener("popstate", moved)
      window.removeEventListener("kokoro:surface-navigation", moved)
    }
  }, [actionContext, retire])

  const actionIsCurrent = useCallback(() => {
    const action = actionRef.current
    return action?.active === true && action.context === actionContext && route() === originRoute
      && marker !== undefined && actorMarker() === marker
  }, [actionContext, marker, originRoute])

  const startTrial = useCallback((skill: SkillCard, prompt: string, handOffPrompt: (prompt: string) => void): boolean => {
    if (!actionIsCurrent()) return false
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
  }, [actionIsCurrent, admitted, lifetime, marker, preview, subject])

  const selectCurrentDraft = useCallback((skill: SkillCard): boolean => {
    const owner = ownerRef.current
    const sourceRef = skillTrialSourceRef(skill)
    if (preview || !actionIsCurrent() || !admitted || marker !== subject || !sourceRef
      || !owner?.active || owner.context !== lifetime) return false
    const snapshot = owner.engine.getSnapshot()
    if (!snapshot.canSubmitMessage || snapshot.hydrating || snapshot.hasPendingSubmission || snapshot.canRetryPendingSubmission) return false
    const current = selectionRef.current
    if (current) current.active = false
    const next = { owner, conversationId: snapshot.store?.activeId ?? null, sourceRef, name: skill.name, active: true, draftRoute: originRoute }
    owner.engine.setSelectedSkillSourceRefs([sourceRef])
    selectionRef.current = next
    setSelection(next)
    return true
  }, [actionIsCurrent, admitted, lifetime, marker, originRoute, preview, subject])

  /** The shell has already checked its route and Send admission. Allocation
   * stays synchronous so no old choice can be rebound by a later callback. */
  const submitCurrentDraft = useCallback((content: string, allocateProjectConversation = false,
    projectDraft?: { mode: AgentMode; model: string | null; selectedMcpConnectionIds: readonly string[]; isCurrent: () => boolean }): boolean => {
    const owner = ownerRef.current
    if (!engine || !owner || owner.context !== lifetime || owner.engine !== engine) return false
    const current = selectionRef.current
    if (current && (!owner.active || !actionIsCurrent() || actorMarker() !== subject || !current.active || current.owner !== owner)) return false
    const transfer = current && (allocateProjectConversation || current.conversationId === null)
      ? { selection: current, allocated: false } : null
    draftSubmissionRef.current = transfer
    try {
      if (allocateProjectConversation) {
        const before = engine.getSnapshot()
        const mode = before.store ? activeMode(before.store) : before.pendingMode
        engine.newConversation()
        if (engine.getSnapshot().store?.activeId === before.store?.activeId) return false
        if (projectDraft && !projectDraft.isCurrent()) return false
        engine.setMode(projectDraft?.mode ?? mode)
        if (projectDraft) {
          engine.setModel(projectDraft.model)
          engine.setSelectedMcpConnectionIds([...projectDraft.selectedMcpConnectionIds])
        }
        if (transfer && (selectionRef.current !== transfer.selection || !transfer.selection.active || !actionIsCurrent())) return false
      }
      return engine.submit(content)
    } finally {
      if (draftSubmissionRef.current === transfer) draftSubmissionRef.current = null
    }
  }, [actionIsCurrent, engine, lifetime, subject])

  const selectedSkill = selection?.active && selection.owner.context === lifetime
    && selection.owner.engine === engine && (engine.getSnapshot().store?.activeId ?? null) === selection.conversationId
    ? { name: selection.name, sourceRef: selection.sourceRef } : null
  const clearSelectedSkill = useCallback(() => {
    if (selection?.active && selection.owner.context === lifetime && ownerRef.current === selection.owner
      && (selection.owner.engine.getSnapshot().store?.activeId ?? null) === selection.conversationId) retire(selection, true)
  }, [lifetime, retire, selection])

  return { startTrial, selectCurrentDraft, submitCurrentDraft, selectedSkill, clearSelectedSkill }
}
