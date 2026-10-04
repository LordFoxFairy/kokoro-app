import type { SessionClient } from "@/engine/client"
import { ConversationMoveError } from "@/engine/conversation-move-error"

export type ConversationMoveIntent = Readonly<{
  sourceScopeKey: string
  sessionId: string
  targetProjectId: string | null
  commandId: string
  status: "pending" | "unknown"
}>

export type ConversationMoveResult = Readonly<{
  status: "confirmed" | "rejected" | "unknown" | "superseded"
  sourceScopeKey: string
  sessionId: string
  targetProjectId: string | null
  commandId: string
}>

export type ConversationMoveSnapshot = Readonly<{
  intent: ConversationMoveIntent | null
  scopeVersions: ReadonlyMap<string, number>
}>

type Slot = {
  identity: symbol
  epoch: number
  subject: string
  intent: ConversationMoveIntent
  controller: AbortController
  promise: Promise<ConversationMoveResult> | null
}

type CoordinatorDeps = Readonly<{
  client: Pick<SessionClient, "moveSession">
  evictSourceIndex: (scopeKey: string, sessionId: string) => void
  createCommandId?: () => string
}>

export type ConversationMoveCoordinator = ReturnType<typeof createConversationMoveCoordinator>

function targetScopeKey(targetProjectId: string | null): string {
  return targetProjectId === null ? "direct" : `project:${targetProjectId}`
}

function isClosedOwnerRejection(error: unknown): boolean {
  return error instanceof ConversationMoveError && error.details.kind === "owner" && (
    [400, 401, 403, 404].includes(error.details.status) ||
    (error.details.status === 409 && error.details.code === "idempotency_conflict")
  )
}

export function createConversationMoveCoordinator(deps: CoordinatorDeps) {
  let subject: string | null = null
  let suspended = false
  let epoch = 0
  let slot: Slot | null = null
  let revision = 0
  const versions = new Map<string, number>()
  const listeners = new Set<() => void>()
  let snapshot: ConversationMoveSnapshot = { intent: null, scopeVersions: versions }

  const publish = (): void => {
    snapshot = { intent: slot?.intent ?? null, scopeVersions: new Map(versions) }
    for (const listener of listeners) listener()
  }
  const result = (intent: ConversationMoveIntent, status: ConversationMoveResult["status"]): ConversationMoveResult => ({
    status,
    sourceScopeKey: intent.sourceScopeKey,
    sessionId: intent.sessionId,
    targetProjectId: intent.targetProjectId,
    commandId: intent.commandId,
  })
  const isCurrent = (candidate: Slot): boolean =>
    slot === candidate && slot.identity === candidate.identity && candidate.epoch === epoch && candidate.subject === subject
  const bumpScope = (scopeKey: string): void => {
    revision += 1
    versions.set(scopeKey, revision)
  }

  const execute = (candidate: Slot): Promise<ConversationMoveResult> => {
    const promise = deps.client.moveSession({
      sessionId: candidate.intent.sessionId,
      targetProjectId: candidate.intent.targetProjectId,
      commandId: candidate.intent.commandId,
      signal: candidate.controller.signal,
    }).then((receipt) => {
      if (!isCurrent(candidate)) return result(candidate.intent, "superseded")
      if (receipt.session_id !== candidate.intent.sessionId || receipt.project_ref !== candidate.intent.targetProjectId) {
        candidate.intent = { ...candidate.intent, status: "unknown" }
        publish()
        return result(candidate.intent, "unknown")
      }
      try {
        deps.evictSourceIndex(candidate.intent.sourceScopeKey, candidate.intent.sessionId)
      } catch {
        // The owner ACK is authoritative. A best-effort browser index failure
        // must not turn a confirmed binding into an unknown owner outcome.
      }
      versions.clear()
      bumpScope(candidate.intent.sourceScopeKey)
      bumpScope(targetScopeKey(candidate.intent.targetProjectId))
      slot = null
      publish()
      return result(candidate.intent, "confirmed")
    }).catch((error: unknown) => {
      if (!isCurrent(candidate)) return result(candidate.intent, "superseded")
      if (isClosedOwnerRejection(error)) {
        slot = null
        publish()
        return result(candidate.intent, "rejected")
      }
      candidate.intent = { ...candidate.intent, status: "unknown" }
      publish()
      return result(candidate.intent, "unknown")
    }).finally(() => {
      if (slot === candidate) candidate.promise = null
    })
    candidate.promise = promise
    return promise
  }

  return {
    getSnapshot: (): ConversationMoveSnapshot => snapshot,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    admitVerifiedSubject: (nextSubject: string): void => {
      if (subject !== null && subject !== nextSubject) {
        epoch += 1
        slot?.controller.abort()
        slot = null
        versions.clear()
      }
      subject = nextSubject
      suspended = false
      publish()
    },
    suspendVerifiedSubject: (expectedSubject: string | null): void => {
      if (subject === expectedSubject) suspended = true
    },
    revokeSubject: (): void => {
      epoch += 1
      subject = null
      suspended = false
      slot?.controller.abort()
      slot = null
      versions.clear()
      publish()
    },
    start: (input: Readonly<{
      sourceScopeKey: string
      sessionId: string
      targetProjectId: string | null
    }>): Promise<ConversationMoveResult> => {
      if (subject === null || suspended) {
        const intent = { ...input, commandId: "", status: "pending" as const }
        return Promise.resolve(result(intent, "rejected"))
      }
      if (slot !== null) {
        if (slot.intent.status === "pending" && slot.intent.sourceScopeKey === input.sourceScopeKey &&
          slot.intent.sessionId === input.sessionId && slot.intent.targetProjectId === input.targetProjectId &&
          slot.promise !== null) return slot.promise
        return Promise.resolve(result(slot.intent, "rejected"))
      }
      const candidate: Slot = {
        identity: Symbol("conversation-move"),
        epoch,
        subject,
        intent: {
          ...input,
          commandId: deps.createCommandId?.() ?? `move_${crypto.randomUUID()}`,
          status: "pending",
        },
        controller: new AbortController(),
        promise: null,
      }
      slot = candidate
      publish()
      return execute(candidate)
    },
    retry: (): Promise<ConversationMoveResult | null> => {
      if (subject === null || suspended || slot === null || slot.intent.status !== "unknown") {
        return Promise.resolve(null)
      }
      slot.intent = { ...slot.intent, status: "pending" }
      slot.controller = new AbortController()
      publish()
      return execute(slot)
    },
  }
}
