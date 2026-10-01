// 事件/快照工厂：经契约 parse 构造，天然验证与 wire 同形（零类型断言）。

import { parseSessionSnapshot, type SessionSnapshot } from "@/contract/http"
import type { EventCursor } from "@/contract/agui-events"
import { parseChatProjectionEvent, type ChatProjectionEvent } from "@/core/chat-projection-event"
import {
  BFF_AGENT_FAILURE_TUPLES,
  type BffAgentFailureTuple,
} from "@/generated/bff-agent-failure"
import { zh } from "@/i18n/messages"

export const AGENT_FAILURE_PROFILES = BFF_AGENT_FAILURE_TUPLES
export type AgentFailureProfile = BffAgentFailureTuple
export type AgentFailureCode = AgentFailureProfile["code"]

export const AGENT_FAILURE_MESSAGE_KEYS = {
  token_budget_exceeded: "fail.tokenBudget",
  recursion_limit_exceeded: "fail.recursion",
  assembly_failed: "fail.assembly",
  enqueue_failed: "fail.enqueue",
  dispatch_exhausted: "fail.dispatch",
  contract_incompatible: "fail.contract",
  internal_error: "fail.internal",
  model_unavailable: "fail.modelUnavailable",
  dependency_unavailable: "fail.dependencyUnavailable",
  model_access_denied: "fail.modelAccessDenied",
} satisfies Record<AgentFailureCode, string>

export function expectedZhCopy(key: string): string {
  const entry = Object.entries(zh).find(([candidate]) => candidate === key)
  if (entry === undefined) throw new Error(`missing zh safe copy: ${key}`)
  return entry[1]
}

export function expectedAgentFailureZhCopy(code: AgentFailureCode): string {
  return expectedZhCopy(AGENT_FAILURE_MESSAGE_KEYS[code])
}

type PayloadOf<K extends ChatProjectionEvent["kind"]> = Extract<ChatProjectionEvent, { kind: K }>["payload"]

export type EnvelopeOverrides = Partial<{
  event_id: string
  seq: number
  run_id: string
  session_id: string
  timestamp: string
}>

let autoSeq = 0

export function resetFixtureSeq(): void {
  autoSeq = 0
}

export function makeEvent<K extends ChatProjectionEvent["kind"]>(
  kind: K,
  payload: PayloadOf<K>,
  overrides: EnvelopeOverrides = {},
): ChatProjectionEvent {
  const seq = overrides.seq ?? (autoSeq += 1)
  return parseChatProjectionEvent({
    kind,
    payload,
    event_id: overrides.event_id ?? `evt_${kind}_${seq}`,
    seq,
    session_id: overrides.session_id ?? "ses_1",
    run_id: overrides.run_id ?? "run_1",
    timestamp: overrides.timestamp ?? "2026-07-02T00:00:00Z",
  })
}

export function makeAgentFailureEvent(
  profile: AgentFailureProfile,
  overrides: EnvelopeOverrides = {},
): ChatProjectionEvent {
  const seq = overrides.seq ?? (autoSeq += 1)
  return parseChatProjectionEvent({
    kind: "run.failed",
    payload: { profile },
    event_id: overrides.event_id ?? `evt_run.failed_${seq}`,
    seq,
    session_id: overrides.session_id ?? "ses_1",
    run_id: overrides.run_id ?? "run_1",
    timestamp: overrides.timestamp ?? "2026-07-02T00:00:00Z",
  })
}

export function makeDispatchFailureEvent(
  sourceSequence: string,
  overrides: Omit<EnvelopeOverrides, "seq"> = {},
): ChatProjectionEvent {
  return parseChatProjectionEvent({
    kind: "run.dispatch_failed",
    payload: {},
    event_id: overrides.event_id ?? "evt_run.dispatch_failed",
    sourceSequence,
    session_id: overrides.session_id ?? "ses_1",
    run_id: overrides.run_id ?? "run_1",
    timestamp: overrides.timestamp ?? "2026-07-02T00:00:00Z",
  })
}

export function awaitingPayload(
  toolId: string,
  pendingToolIds: string[],
  overrides: Partial<PayloadOf<"tool.awaiting_approval">> = {},
): PayloadOf<"tool.awaiting_approval"> {
  return {
    segment_id: "seg_1",
    tool_id: toolId,
    name: "write_file",
    args: { path: "/tmp/a" },
    description: "write a file",
    allowed_decisions: ["approve", "reject"],
    kind: "tool_approval",
    editable: false,
    pending_tool_ids: pendingToolIds,
    ...overrides,
  }
}

type SnapshotInput = {
  sessionId?: string
  title?: string
  featureKey?: string
  messages?: SessionSnapshot["messages"]
  activeRun?: SessionSnapshot["active_run"]
  pendingPauses?: SessionSnapshot["pending_pauses"]
  files?: SessionSnapshot["files"]
  deliveries?: SessionSnapshot["deliveries"]
  deliveriesHasMore?: boolean
  eventWatermark?: EventCursor | null
}

export function makeSnapshot(input: SnapshotInput = {}): SessionSnapshot {
  return parseSessionSnapshot({
    session: {
      session_id: input.sessionId ?? "conv_1",
      title: input.title ?? "server title",
      owner_id: "local-user",
      created_at: "2026-07-02T00:00:00Z",
      updated_at: "2026-07-02T00:00:01Z",
      ...(input.featureKey !== undefined ? { feature_key: input.featureKey } : {}),
    },
    messages: input.messages ?? [],
    ...(input.activeRun !== undefined ? { active_run: input.activeRun } : {}),
    pending_pauses: input.pendingPauses ?? [],
    files: input.files ?? [],
    deliveries: input.deliveries ?? [],
    deliveries_has_more: input.deliveriesHasMore ?? false,
    event_watermark: input.eventWatermark ?? null,
  })
}

export function makeFailedSnapshot(
  profile: AgentFailureProfile | null,
  input: { content?: string; eventWatermark?: EventCursor | null; includeUser?: boolean } = {},
): SessionSnapshot {
  const base = makeSnapshot({ eventWatermark: input.eventWatermark ?? null })
  return parseSessionSnapshot({
    ...base,
    messages: [
      ...(input.includeUser === false ? [] : [{
        message_id: "user_1", role: "user", content: "retry me", status: "completed",
        created_at: "2026-07-02T00:00:00Z",
      }]),
      {
        message_id: "assistant_1", role: "assistant", run_id: "run_failed",
        content: input.content ?? "partial", status: "failed", created_at: "2026-07-02T00:00:01Z",
        ...(profile === null ? {} : { failure: profile }),
      },
    ],
  })
}

export function makeSnapshotDelivery(
  overrides: Partial<SessionSnapshot["deliveries"][number]> = {},
): SessionSnapshot["deliveries"][number] {
  return {
    conversation_id: "conv_1",
    artifact_id: "artifact_1",
    asset_id: "asset_1",
    artifact_kind: "document",
    title: "调研报告",
    mime: "text/markdown",
    size: 2048,
    run_id: "run_1",
    created_at: "2026-07-02T00:00:02Z",
    ...overrides,
  }
}

export function makeDeliveryPayload(
  overrides: Partial<PayloadOf<"delivery.created">> = {},
): PayloadOf<"delivery.created"> {
  return {
    artifact_id: "artifact_1",
    asset_id: "asset_1",
    artifact_kind: "document",
    tool_call_id: "tool_1",
    path: "out/report.md",
    title: "调研报告",
    mime: "text/markdown",
    size: 2048,
    content_hash: "a".repeat(64),
    ...overrides,
  }
}

export function makePendingPause(
  overrides: Partial<SessionSnapshot["pending_pauses"][number]> = {},
): SessionSnapshot["pending_pauses"][number] {
  return {
    pause_id: "pause_1",
    run_id: "run_1",
    tool_id: "tool_1",
    segment_id: "seg_1",
    tool_name: "write_file",
    kind: "tool_approval",
    args: { path: "/tmp/a" },
    description: "write a file",
    allowed_decisions: ["approve", "reject"],
    editable: false,
    status: "pending",
    created_at: "2026-07-02T00:00:00Z",
    ...overrides,
  }
}
