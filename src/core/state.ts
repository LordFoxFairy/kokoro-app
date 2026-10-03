// 纯状态模型：零 I/O 零 React；内部投影类型与 AG-UI wire DTO 分离。

import type { InteractionState } from "@/contract/control"
import type { ExecutionHead, RunProcessActivity } from "@/contract/chat"
import type { EventCursor } from "@/contract/agui-events"
import type { AgentFailureProfile } from "@/contract/agent-failure"
import type { ChatProjectionEvent } from "@/core/chat-projection-event"

type EventOf<K extends ChatProjectionEvent["kind"]> = Extract<ChatProjectionEvent, { kind: K }>

export type SessionTodo = EventOf<"todo.updated">["payload"]["todos"][number]
type SubagentSource = EventOf<"subagent.started">["payload"]["source"]
type RunCompletedStatus = EventOf<"run.completed">["payload"]["status"]

export type RunFailure =
  | { kind: "agent"; profile: AgentFailureProfile }
  | { kind: "dispatch" }
  | { kind: "generic" }

export type AttributedRunFailure = RunFailure & { failedRunId: string }

export type SessionMessage = {
  id: string
  role: "assistant" | "user"
  content: string
  // 该消息所属 run；用于把同一 run 的连续 assistant 段归并到一个 turn（用户消息以自身 id 充当）。
  runId: string
  // id is the local render anchor. A resumed segment may rebind that anchor;
  // retain the distinct durable BFF identity rather than rewriting the wire DTO.
  snapshotMessageId?: string
  // Only the unique assistant prefix of an active snapshot run can be claimed.
  awaitingTextSegment?: boolean
}

// 结构化终态收口：stale-*（run 终态时仍悬挂）与 cancelled（用户停止）零 UI 文案，人话由渲染层生成。
export type ToolStatus =
  | "running"
  | "rejected"
  | "done"
  | "error"
  | "stale-running"
  | "cancelled"

export type SessionToolCall = {
  id: string
  name: string
  args: Record<string, unknown>
  result?: string
  status: ToolStatus
  // 仅真实工具失败（is_error=true）时携带，与合成收口状态严格分离。
  errorText?: string
  rejectReason?: string
  responded?: boolean

}

export type SessionSubagent = {
  id: string
  name: string
  description: string
  subagentType: string
  source: SubagentSource
  output?: string
  status: "running" | "done" | "failed"
  error?: string
}

// 有序 Step：过程与文本按 session 落定的 seq 排成一列，而非按 kind 归桶。
export type SessionStep =
  | { kind: "thinking"; seq: number; segmentId: string; text: string }
  | { kind: "tool"; seq: number; segmentId: string; tool: SessionToolCall }
  | { kind: "subagent"; seq: number; segmentId: string; subagent: SessionSubagent }
  | { kind: "text"; seq: number; segmentId: string }

// session.created 投影：sessions 集合的真实元数据（标题真源在服务端）。
type SessionMeta = {
  title: string
  ownerId: string
}

export type WorkspaceFileEntry = {
  path: string
  mime: string
  bytes: number
}

// Delivery is an in-memory view of BFF's owner-scoped Conversation↔Artifact association.
export type SessionDelivery = {
  conversationId: string
  artifactId: string
  assetId: string
  artifactKind: "document" | "code" | "image" | "audio" | "video" | "data" | "archive" | "other"
  title: string
  mime: string
  size: number
  runId: string
  // ISO 时间：live 事件取信封 timestamp，snapshot 水合取 created_at。
  createdAt: string
  note?: string
}

export type SessionStreamState = {
  executionHead: ExecutionHead | null
  interactionsByRun: Record<string, InteractionState>
  // 工作区文件清单（snapshot 水合；终态后重拉刷新）。
  files: WorkspaceFileEntry[]
  // Durable owner snapshot and live/replay frames share the binary identity.
  deliveries: SessionDelivery[]
  deliveriesHasMore: boolean
  // 内存去重 Set：event_id 幂等（本页生命周期内；权威历史由 snapshot 水位截断）。
  seenEventIds: Set<string>
  messages: SessionMessage[]
  todos: SessionTodo[]
  executionProcess: { runId: string; todos: SessionTodo[] | null; activities: RunProcessActivity[] } | null
  stepsByRun: Record<string, SessionStep[]>
  runStatus: "idle" | RunCompletedStatus | "failed"
  // 已验证的安全失败按 owner run identity 索引；不保存 producer message、exception 或 stack。
  runFailuresById: Record<string, AttributedRunFailure>
  // public snapshot 允许 failed assistant 没有 run_id；保留真失败但不伪造轮级归属。
  unattributedFailure: RunFailure | null
  // 在途 run 显式字段：snapshot 水合置位、匹配终态清空。
  activeRunId: string | null
  // Internal source order is retained for deterministic projection only; it is
  // never sent as Last-Event-ID.
  lastSeq: number
  // Durable BFF AG-UI cursor. This is the sole network resume position.
  resumeCursor: EventCursor | null
  meta: SessionMeta | null
}

export function createSessionStreamState(): SessionStreamState {
  return {
    executionHead: null,
    interactionsByRun: {},
    files: [],
    deliveries: [],
    deliveriesHasMore: false,
    seenEventIds: new Set(),
    messages: [],
    todos: [],
    executionProcess: null,
    stepsByRun: {},
    runStatus: "idle",
    runFailuresById: {},
    unattributedFailure: null,
    activeRunId: null,
    lastSeq: 0,
    resumeCursor: null,
    meta: null,
  }
}

// Structural equality preserves nullable/omitted fields; this is not an owner digest protocol.
function canonicalState(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonicalState).join(",") + "]"
  if (value !== null && typeof value === "object") return "{" + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ":" + canonicalState(item)).join(",") + "}"
  return JSON.stringify(value)
}
export function sameInteractionState(left: InteractionState, right: InteractionState): boolean {
  return canonicalState(left) === canonicalState(right)
}
export function assertInteractionRevision(previous: InteractionState | undefined, next: InteractionState): void {
  if (!previous) return
  if (next.interaction_revision < previous.interaction_revision || next.pause_revision < previous.pause_revision ||
    (next.pause_revision === previous.pause_revision && next.pause_ref !== previous.pause_ref) ||
    (next.interaction_revision === previous.interaction_revision && !sameInteractionState(previous, next))) throw new Error("Interaction revision conflict")
}
