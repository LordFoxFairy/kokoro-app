// 事件/快照工厂：经契约 parse 构造，天然验证与 wire 同形（零类型断言）。

import { parseSessionSnapshot, type SessionSnapshot } from "@/contract/http"
import type { InteractionState, InteractionItem } from "@/contract/control"
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

type InteractionFixtureInput = {
  tool_id?: string; name?: string; args?: Record<string, unknown>; description?: string;
  allowed_decisions?: InteractionItem["allowed_decisions"]; kind?: InteractionItem["kind"];
  editable?: boolean; input_schema?: Record<string, unknown>; result?: string;
  risk?: { level: string; source: string; reason: string }; segment_id?: string
}
// Historical test inputs are local descriptions, never legacy wire; the output is only public4.
export function makeInteractionState(itemId: string, itemIds: string[], overrides: InteractionFixtureInput = {}): InteractionState {
  const args = overrides.args ?? {}
  const description = typeof args["question"] === "string" ? args["question"] : typeof args["message"] === "string" ? args["message"] : overrides.description ?? "write a file"
  return {
    interaction_revision: ++autoSeq, pause_revision: 1, pause_ref: "pause_1", phase: "waiting", action_result: null,
    groups: [{ group_id: "group_1", items: itemIds.map((id) => ({
      item_id: id, request_id: `request:${id}`, kind: id === itemId ? overrides.kind ?? "tool_approval" : "tool_approval",
      allowed_decisions: id === itemId ? overrides.allowed_decisions ?? ["approve", "reject"] : ["approve", "reject"],
      display: { name: id === itemId ? overrides.name ?? "write_file" : "write_file", description,
        editable: id === itemId ? overrides.editable ?? false : false,
        input_schema: id === itemId ? overrides.input_schema ?? (Array.isArray(args["choices"]) ? { type: "object", properties: { response: { enum: args["choices"] } } } : {}) : {},
        ...(id === itemId && overrides.result !== undefined ? { result_preview: overrides.result, truncated: false, source: "tool" } : {}),
      },
      ...(id === itemId && typeof args["validation_error"] === "string" ? { validation: { code: "json_schema_invalid" as const, instance_path: ["otp"] } } : {}),
    })) }],
  }
}

type PauseFixture = InteractionFixtureInput & { run_id: string; tool_id: string; status: "pending" | "resolved" | "cancelled" | "expired"; tool_name?: string }
type SnapshotInput = {
  sessionId?: string
  title?: string
  featureKey?: string
  messages?: SessionSnapshot["messages"]
  activeRun?: { run_id: string; status: "queued" | "running" | "waiting_input" }
  pendingPauses?: PauseFixture[]
  files?: SessionSnapshot["files"]
  deliveries?: SessionSnapshot["deliveries"]
  deliveriesHasMore?: boolean
  eventWatermark?: EventCursor | null
}

export function makeSnapshot(input: SnapshotInput = {}): SessionSnapshot {
  const pauses = (input.pendingPauses ?? []).filter((pause) => pause.status === "pending" && (input.activeRun === undefined || pause.run_id === input.activeRun.run_id))
  const runId = input.activeRun?.run_id ?? pauses[0]?.run_id
  const pending = pauses.length ? {
    interaction_revision: 1, pause_revision: 1, pause_ref: "pause_1", phase: "waiting", action_result: null,
    groups: [{ group_id: "group_1", items: pauses.map((pause) => {
      const item = makeInteractionState(pause.tool_id, [pause.tool_id], { ...pause, name: pause.tool_name ?? pause.name ?? "write_file" }).groups[0]!.items[0]!
      return item
    }) }],
  } : null
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
    ...(runId !== undefined ? { execution_head: { run_id: runId, state: pending ? "waiting" : input.activeRun?.status === "queued" ? "queued" : "active", pending_pauses: pending ? [pending] : [] } } : {}),
    execution_process: null,
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

export function makePendingPause(overrides: Partial<PauseFixture> = {}): PauseFixture {
  return { run_id: "run_1", tool_id: "tool_1", tool_name: "write_file", kind: "tool_approval", description: "write a file",
    allowed_decisions: ["approve", "reject"], editable: false, status: "pending", ...overrides }
}


// R66 public4 fixtures: raw owner wire only; no compatibility fields or consumer bypass.
export type Public4InteractionFixture = {
  interaction_revision: number
  pause_revision: number
  pause_ref: string | null
  phase: "active" | "waiting" | "resuming" | "terminal"
  groups: Array<{
    group_id: string
    items: Array<{
      item_id: string
      request_id: string
      kind: "tool_approval" | "ask_user_question" | "result_review" | "input"
      allowed_decisions: Array<"approve" | "edit" | "reject" | "respond" | "submit">
      display: {
        name: string
        description: string
        editable: boolean
        input_schema: Record<string, unknown>
        result_preview?: string | null
        truncated?: boolean | null
        source?: string | null
      }
      validation?: { code: "json_schema_invalid"; instance_path: Array<string | number> } | null
    }>
  }>
  action_result: {
    command_id: string
    pause_revision: number
    kind: "accepted" | "unknown" | "native_consumed" | "validation_failed" | "cancelled"
  } | null
}

export function makePublic4Interaction(
  input: Partial<Public4InteractionFixture> = {},
): Public4InteractionFixture {
  const item = (
    id: string,
    kind: Public4InteractionFixture["groups"][number]["items"][number]["kind"],
    decision: Public4InteractionFixture["groups"][number]["items"][number]["allowed_decisions"][number],
  ) => ({
    item_id: id,
    request_id: `request_${id}`,
    kind,
    allowed_decisions: [decision],
    display: {
      name: `R66 ${decision}`,
      description: `R66 ${decision} request`,
      editable: decision === "edit",
      input_schema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: true,
      },
      ...(kind === "result_review"
        ? { result_preview: "R66 reviewed result", truncated: false, source: "R66 review source" }
        : {}),
    },
  })
  return {
    interaction_revision: 4,
    pause_revision: 2,
    pause_ref: "pause_r66_2",
    phase: "waiting",
    groups: [
      { group_id: "group_r66_a", items: [
        item("item_approve", "tool_approval", "approve"),
        item("item_edit", "tool_approval", "edit"),
      ] },
      { group_id: "group_r66_b", items: [
        item("item_reject", "result_review", "reject"),
        item("item_respond", "ask_user_question", "respond"),
        item("item_submit", "input", "submit"),
      ] },
    ],
    action_result: null,
    ...input,
  }
}

export function makePublic4Snapshot(input: {
  state?: "none" | "queued" | "active" | "waiting" | "resuming"
  sessionId?: string
  runId?: string
  watermark?: string | null
  interaction?: Public4InteractionFixture
  messages?: SessionSnapshot["messages"]
  deliveries?: SessionSnapshot["deliveries"]
} = {}): Record<string, unknown> {
  const state = input.state ?? "waiting"
  const runId = input.runId ?? "run_1"
  const pause = input.interaction ?? makePublic4Interaction(
    state === "resuming" ? {
      phase: "resuming",
      action_result: { command_id: "command_r66", pause_revision: 2, kind: "accepted" },
    } : {},
  )
  return {
    session: {
      session_id: input.sessionId ?? "conv_9",
      title: "R66 restored conversation",
      owner_id: "local-user",
      created_at: "2026-10-02T00:00:00Z",
      updated_at: "2026-10-02T00:00:01Z",
    },
    messages: input.messages ?? [
      { message_id: "r66_user", role: "user", content: "R66 original request",
        status: "completed", created_at: "2026-10-02T00:00:00Z", run_id: runId },
      { message_id: "r66_assistant", role: "assistant", content: "R66 durable prefix",
        status: state === "active" ? "streaming" : "completed",
        created_at: "2026-10-02T00:00:01Z", run_id: runId },
    ],
    ...(state === "none" ? {} : { execution_head: {
      run_id: runId, state,
      pending_pauses: state === "waiting" || state === "resuming" ? [pause] : [],
    } }),
    execution_process: state === "none" ? null : {
      run_id: runId,
      todos: null,
      activities: [],
      next_cursor: null,
    },
    files: [],
    deliveries: input.deliveries ?? [],
    deliveries_has_more: false,
    event_watermark: input.watermark === undefined
      ? "agui_00000000000000000000000000000014" : input.watermark,
  }
}

export function makePublic4Decisions() {
  return [
    { type: "approve", item_id: "item_approve", args: null },
    { type: "edit", item_id: "item_edit", args: { text: "edited", optional: null } },
    { type: "reject", item_id: "item_reject", reason: "No" },
    { type: "respond", item_id: "item_respond", response: "R66 answer" },
    { type: "submit", item_id: "item_submit", value: { text: "R66 input", optional: null } },
  ]
}

export function makePublic4Resume(
  pause: Public4InteractionFixture = makePublic4Interaction(),
) {
  return {
    kind: "run.resume",
    expected_pause_revision: pause.pause_revision,
    pause_ref: pause.pause_ref,
    decisions: makePublic4Decisions(),
  }
}

export function public4StagedDecisions(): Array<[string, Record<string, unknown>]> {
  return [
    ["item_approve", { type: "approve", args: null }],
    ["item_edit", { type: "edit", args: { text: "edited", optional: null } }],
    ["item_reject", { type: "reject", reason: "No" }],
    ["item_respond", { type: "respond", message: "R66 answer" }],
    ["item_submit", { type: "submit", value: { text: "R66 input", optional: null } }],
  ]
}

export function makePublic4Frame(
  fields: Record<string, unknown>,
  seq: number,
  runId = "run_1",
  sessionId = "conv_9",
): Record<string, unknown> {
  return {
    timestamp: Date.parse("2026-10-02T00:00:02Z"),
    metadata: { kokoro: {
      event_id: `r66_agent_${runId}_${seq}`, seq,
      session_id: sessionId, run_id: runId, timestamp: "2026-10-02T00:00:02Z",
    } },
    ...fields,
  }
}

export function makePublic4StateFrame(
  state: Public4InteractionFixture,
  seq = 21,
  runId = "run_1",
  sessionId = "conv_9",
) {
  return makePublic4Frame(
    { type: "CUSTOM", name: "kokoro.interaction.state", value: state },
    seq, runId, sessionId,
  )
}

export function makePublic4QueuedFrame(
  sequence = "9007199254740993123456789",
  runId = "run_1",
  sessionId = "conv_9",
) {
  return {
    type: "CUSTOM",
    name: "kokoro.run.queued",
    value: { run_id: runId, dispatch_sequence: sequence },
    timestamp: Date.parse("2026-10-02T00:00:02Z"),
    metadata: { kokoro: {
      event_id: `r66_bff_queued_${runId}`,
      seq: sequence, source_owner: "kokoro-bff",
      session_id: sessionId, run_id: runId, timestamp: "2026-10-02T00:00:02Z",
    } },
  }
}
