// Snapshot hydration establishes the current read model; the durable AG-UI
// watermark then resumes only frames committed after that snapshot.

import type { Delivery, SessionSnapshot } from "@/contract/http"
import {
  createSessionStreamState,
  type SessionDelivery,
  type SessionStep,
  type SessionStreamState,
} from "./state"

// snake→camel 的成果投影：live 事件与 snapshot 双源共用同一领域形状。
export function deliveryFromSnapshot(delivery: Delivery): SessionDelivery {
  return {
    contentHash: delivery.content_hash,
    path: delivery.path,
    title: delivery.title,
    mime: delivery.mime,
    size: delivery.size,
    createdAt: delivery.created_at,
  }
}

export function stateFromSnapshot(snapshot: SessionSnapshot): SessionStreamState {
  const messages = (snapshot.messages ?? []).map((message) => ({
    id: message.message_id,
    role: message.role,
    content: message.content,
    runId: message.run_id ?? message.message_id,
  }))
  const pending = snapshot.pending_pauses.filter((pause) => pause.status === "pending")
  const pendingIdsByRun = new Map<string, string[]>()
  for (const pause of pending) {
    const ids = pendingIdsByRun.get(pause.run_id) ?? []
    ids.push(pause.tool_id)
    pendingIdsByRun.set(pause.run_id, ids)
  }
  const stepsByRun: Record<string, SessionStep[]> = {}
  for (const [index, pause] of pending.entries()) {
    const steps = stepsByRun[pause.run_id] ?? []
    steps.push({
      kind: "tool",
      seq: index + 1,
      segmentId: pause.segment_id,
      tool: {
        id: pause.tool_id,
        name: pause.tool_name,
        args: pause.args,
        status: "awaiting",
        description: pause.description,
        allowedDecisions: [...pause.allowed_decisions],
        awaitingKind: pause.kind,
        editable: pause.editable,
        pendingToolIds: [...(pendingIdsByRun.get(pause.run_id) ?? [])],
        ...(pause.risk === undefined ? {} : { risk: pause.risk }),
        ...(pause.input_schema === undefined ? {} : { inputSchema: pause.input_schema }),
        ...(pause.result === undefined ? {} : { result: pause.result }),
      },
    })
    stepsByRun[pause.run_id] = steps
  }

  return {
    ...createSessionStreamState(),
    // run 锚点与终态清空语义依赖 activeRunId（状态而非线程内容）：水合保留。
    activeRunId: snapshot.active_run?.run_id ?? null,
    messages,
    stepsByRun,
    files: snapshot.files,
    deliveries: snapshot.deliveries.map(deliveryFromSnapshot),
    meta: {
      title: snapshot.session.title,
      ownerId: snapshot.session.owner_id,
    },
    resumeCursor: snapshot.event_watermark,
  }
}
