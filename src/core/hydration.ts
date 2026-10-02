// Snapshot hydration establishes the current read model; the durable AG-UI
// watermark then resumes only frames committed after that snapshot.

import type { Delivery, SessionSnapshot } from "@/contract/http"
import {
  createSessionStreamState,
  type AttributedRunFailure,
  type RunFailure,
  type SessionDelivery,
  type SessionMessage,
  type SessionStep,
  type SessionStreamState,
} from "./state"

// snake→camel 的成果投影：live 事件与 snapshot 双源共用同一领域形状。
export function deliveryFromSnapshot(delivery: Delivery): SessionDelivery {
  return {
    conversationId: delivery.conversation_id,
    artifactId: delivery.artifact_id,
    assetId: delivery.asset_id,
    artifactKind: delivery.artifact_kind,
    title: delivery.title,
    mime: delivery.mime,
    size: delivery.size,
    runId: delivery.run_id,
    createdAt: delivery.created_at,
  }
}

export function stateFromSnapshot(snapshot: SessionSnapshot): SessionStreamState {
  const snapshotMessages = snapshot.messages ?? []
  const tailMessage = snapshotMessages.at(-1)
  const activeAssistants = snapshotMessages.filter((message) => message.role === "assistant" &&
    message.run_id !== undefined && message.run_id === snapshot.execution_head?.run_id &&
    (message.status === "pending" || message.status === "streaming"))
  const candidate = activeAssistants.length === 1 ? activeAssistants[0] : undefined
  const messages: SessionMessage[] = snapshotMessages.map((message) => ({
    id: message.message_id,
    role: message.role,
    content: message.content,
    runId: message.run_id ?? message.message_id,
    ...(message.role === "assistant" ? { snapshotMessageId: message.message_id } : {}),
    ...(message === candidate ? { awaitingTextSegment: true } : {}),
  }))
  const head = snapshot.execution_head
  const pending = head?.pending_pauses ?? []
  const restoresFailedRun = tailMessage?.role === "assistant" && tailMessage.status === "failed" && head === undefined
  const stepsByRun: Record<string, SessionStep[]> = {}
  const finalAssistantByRun = new Map<string, NonNullable<SessionSnapshot["messages"]>[number]>()
  let unattributedFailure: RunFailure | null = null
  for (const message of snapshotMessages) {
    if (message.role !== "assistant") continue
    if (message.run_id === undefined) {
      if (message.status === "failed") unattributedFailure = { kind: "generic" }
      continue
    }
    finalAssistantByRun.set(message.run_id, message)
  }
  const runFailuresById: Record<string, AttributedRunFailure> = {}
  for (const [runId, message] of finalAssistantByRun) {
    if (message.status !== "failed") continue
    if (snapshot.execution_head?.run_id === runId || (head?.run_id === runId && pending.length > 0)) continue
    runFailuresById[runId] = message.failure === undefined
      ? { failedRunId: runId, kind: "generic" }
      : { failedRunId: runId, kind: "agent", profile: message.failure }
  }
  // Snapshot text precedes all post-watermark frames. These negative local
  // positions are render anchors, not fabricated owner event sequence/cursors.
  for (const [index, message] of messages.entries()) {
    if (message.role !== "assistant") continue
    const steps = stepsByRun[message.runId] ?? []
    steps.push({ kind: "text", seq: index - messages.length, segmentId: message.id })
    stepsByRun[message.runId] = steps
  }

  return {
    ...createSessionStreamState(),
    ...(restoresFailedRun
      ? {
          runStatus: "failed" as const,
        }
      : {}),
    // run 锚点与终态清空语义依赖 activeRunId（状态而非线程内容）：水合保留。
    activeRunId: head?.run_id ?? null,
    executionHead: head ?? null,
    interactionsByRun: head && pending[0] ? { [head.run_id]: pending[0] } : {},
    messages,
    stepsByRun,
    runFailuresById,
    unattributedFailure,
    files: snapshot.files,
    deliveries: snapshot.deliveries.map(deliveryFromSnapshot),
    deliveriesHasMore: snapshot.deliveries_has_more,
    meta: {
      title: snapshot.session.title,
      ownerId: snapshot.session.owner_id,
    },
    resumeCursor: snapshot.event_watermark,
  }
}
