import { useLayoutEffect, useMemo, useSyncExternalStore } from "react"
import type { SessionEngine } from "@/engine/engine-types"
import { sessionScopeKey, type SessionScope } from "@/engine/session-scope"
import { createAnswerActionsClient, type AnswerActionsClient } from "@/engine/answer-actions-client"
import { sessionBaseUrl } from "@/engine/config"
import { normalizeRunTerminals } from "@/core/state"
import type { AnswerActionTarget } from "./answer-action-target"
export type AnswerActionBoundary = {
  actorId: string; sessionId: string; scope: SessionScope; epoch: object; readEpoch?: object
  engine: SessionEngine; client: AnswerActionsClient; isCurrent: () => boolean
  regenerations: Set<{ getState: () => { kind: string } }>; changed: () => void
}
const noSubscribe = () => () => {}
const zeroSnapshot = () => 0
export function useAnswerActionScope(input: {
  engine: SessionEngine | null | undefined; actorId: string | null; sessionId: string | null
  scope: SessionScope; identity: string; admitted: boolean; preview: boolean
}): AnswerActionBoundary | undefined {
  const client = useMemo(() => createAnswerActionsClient({ baseUrl: sessionBaseUrl() }), [])
  const scopeKey = sessionScopeKey(input.scope)
  const boundary = useMemo(() => {
    if (!input.engine || !input.actorId || !input.sessionId || input.preview) return undefined
    const actorId = input.actorId, sessionId = input.sessionId, engine = input.engine
    const lifetime = { active: true, admitted: false, identity: "", readEpoch: {} }
    let revision = 0
    const listeners = new Set<() => void>()
    const changed = () => { revision++; for (const listener of listeners) listener() }
    return { actorId, sessionId, engine, scope: scopeKey === "direct" ? { kind: "direct" as const } : { kind: "project" as const, projectRef: scopeKey.slice(8) }, epoch: {}, client, regenerations: new Set<{ getState: () => { kind: string } }>(),
      changed, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }, getSnapshot: () => revision,
      get readEpoch() { return lifetime.readEpoch },
      observeAdmission: (admitted: boolean, identity: string) => {
        if (lifetime.admitted === admitted && lifetime.identity === identity) return false
        lifetime.admitted = admitted; lifetime.identity = identity; lifetime.readEpoch = {}; changed(); return true
      },
      isCurrent: () => {
        if (!lifetime.admitted || !lifetime.active || engine.getSnapshot().store?.activeId !== sessionId) return false
        try { return window.localStorage.getItem("kokoro.web.auth-index-subject") === actorId }
        catch { return false }
      }, activate: () => { lifetime.active = true }, retire: () => { lifetime.active = false },
    }
  }, [input.engine, input.actorId, input.sessionId, input.preview, scopeKey, client])
  useSyncExternalStore(boundary?.subscribe ?? noSubscribe, boundary?.getSnapshot ?? zeroSnapshot, zeroSnapshot)
  useLayoutEffect(() => { boundary?.activate(); return () => boundary?.retire() }, [boundary])
  useLayoutEffect(() => { boundary?.observeAdmission(input.admitted, input.identity) }, [boundary, input.admitted, input.identity])
  return boundary
}
export function canRegenerateAnswer(boundary: AnswerActionBoundary, target: AnswerActionTarget, checkOtherIntents = true): boolean {
  if (!boundary.isCurrent() || !boundary.engine.regenerateAnswer) return false
  const snapshot = boundary.engine.getSnapshot(), thread = normalizeRunTerminals(snapshot.thread)
  const tail = thread.messages.at(-1)
  return snapshot.ownerConfirmedSessionId === target.sessionId && !snapshot.hydrating && snapshot.connection.status === "connected" &&
    snapshot.machine.phase === "idle" && thread.executionHead === null && thread.activeRunId === null &&
    !snapshot.hasPendingSubmission && !snapshot.canRetryPendingSubmission &&
    thread.runTerminalsById[target.runId] !== undefined && tail?.role === "assistant" && tail.runId === target.runId &&
    (!checkOtherIntents || ![...boundary.regenerations].some(controller => ["pending", "unknown"].includes(controller.getState().kind)))
}
