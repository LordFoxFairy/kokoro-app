import { mergeFinalAnswerReference } from "./final-answer-reference"
// 事件折叠：event_id 幂等去重 + 批量折叠（可变草稿一次快照）+ never 穷尽守卫。

import { assertInteractionRevision, createSessionStreamState, normalizeRunTerminals } from "./state"
import type { MessagePart } from "@/contract/chat"

import type { ChatProjectionEvent } from "@/core/chat-projection-event"

import type {
  SessionStep,
  SessionStreamState,
  SessionToolCall,
  ToolStatus,
} from "./state"

type EventOf<K extends ChatProjectionEvent["kind"]> = Extract<ChatProjectionEvent, { kind: K }>

// 批内草稿：seenEventIds/messages/stepsByRun 顶层已复制；每个 run 的步骤数组首次触碰时复制一次。
type Draft = {
  state: SessionStreamState
  touchedRuns: Set<string>
}

function stepsOf(draft: Draft, runId: string): SessionStep[] {
  if (!draft.touchedRuns.has(runId)) {
    draft.state.stepsByRun[runId] = [...(draft.state.stepsByRun[runId] ?? [])]
    draft.touchedRuns.add(runId)
  }
  return draft.state.stepsByRun[runId] ?? []
}

// 按 (seq, 到达先后) 稳定就地插入：同 seq 追加在既有之后，保持 append 语义。
function insertOrdered(steps: SessionStep[], step: SessionStep): void {
  let index = steps.length
  while (index > 0 && BigInt(steps[index - 1]?.seq ?? 0) > BigInt(step.seq)) {
    index -= 1
  }
  steps.splice(index, 0, step)
}

function updateStep(
  steps: SessionStep[],
  predicate: (step: SessionStep) => boolean,
  updater: (step: SessionStep) => SessionStep,
): boolean {
  const index = steps.findIndex(predicate)
  if (index < 0) {
    return false
  }
  const existing = steps[index]
  if (existing !== undefined) {
    steps[index] = updater(existing)
  }
  return true
}

function closeSnapshotContinuation(draft: Draft, runId: string): void {
  for (const [index, message] of draft.state.messages.entries()) {
    if (message.runId === runId && message.awaitingTextSegment) {
      draft.state.messages[index] = { ...message, awaitingTextSegment: false }
    }
  }
}

function retainedByOrderedBaseline(state: SessionStreamState, event: EventOf<"message.delta"> | EventOf<"message.completed"> | EventOf<"activity.updated">): boolean {
  const ordered = Object.values(state.messageParts ?? {}).find((part) => part.runId === event.run_id && part.descriptor)
  if (!ordered) return false
  // Missing coordinates are not upgraded from Agent seq, even if it is huge.
  if (event.publicSequence === undefined) return true
  if (ordered.confirmedRevision !== undefined && BigInt(event.publicSequence) <= BigInt(ordered.confirmedRevision)) return true
  const identity = event.kind === "activity.updated" ? `activity:${event.payload.activity_id}` : `text:${event.payload.segment_id}`
  const confirmed = ordered.confirmedSlots?.[identity]
  return confirmed !== undefined && BigInt(event.publicSequence) <= BigInt(confirmed)
}
function stepPosition(event: { seq: number; publicSequence?: string | undefined }): number | string {
  if (event.publicSequence !== undefined) return event.publicSequence
  const legacyRenderAnchor = event.seq
  return legacyRenderAnchor
}

function applyAssistantText(
  draft: Draft,
  event: EventOf<"message.delta"> | EventOf<"message.completed">,
): void {
  if (retainedByOrderedBaseline(draft.state, event)) return
  const { messages } = draft.state
  const segmentId = event.payload.segment_id
  const incoming = event.kind === "message.completed" ? event.payload.content : event.payload.delta
  const boundary = event.kind === "message.delta" ? event.payload.text_boundary : undefined
  if (boundary === "start") {
    // A new segment is not a continuation of the pre-watermark prefix.
    closeSnapshotContinuation(draft, event.run_id)
  }
  let index = messages.findIndex((message) => message.role === "assistant" &&
    message.runId === event.run_id && !message.orderedContainer && message.id === segmentId)
  if (index < 0 && boundary !== "start" && draft.state.activeRunId === event.run_id) {
    const candidates = messages.flatMap((message, candidateIndex) =>
      message.role === "assistant" && message.runId === event.run_id && message.awaitingTextSegment
        ? [candidateIndex] : [])
    const candidateIndex = candidates.length === 1 ? candidates[0] : undefined
    const prefix = candidateIndex === undefined ? undefined : messages[candidateIndex]
    if (prefix !== undefined && candidateIndex !== undefined) {
      index = candidateIndex
      messages[index] = { ...prefix, id: segmentId, awaitingTextSegment: false }
      const steps = stepsOf(draft, event.run_id)
      updateStep(steps, (step) => step.kind === "text" && step.segmentId === prefix.id,
        (step) => ({ ...step, segmentId }))
    }
  }
  if (index >= 0) {
    const existing = messages[index]
    if (existing !== undefined) {
      // completed 覆盖累计增量（replay 后不残留半句）；delta 追加。
      const content =
        event.kind === "message.completed" ? incoming : `${existing.content}${incoming}`
      messages[index] = { ...existing, content, textState: event.kind === "message.completed" ? "completed" : "streaming", ...(existing.awaitingTextSegment ? { awaitingTextSegment: false } : {}) }
    }
    return
  }
  messages.push({
    id: segmentId,
    role: "assistant",
    content: incoming,
    textState: event.kind === "message.completed" ? "completed" : "streaming",
    runId: event.run_id,
  })
  // 文本步骤进入有序列表：标记「这一段文本在此 seq 出现」，渲染时与过程交错。
  const textSteps = stepsOf(draft, event.run_id)
  if (!textSteps.some((step) => step.kind === "text" && step.segmentId === segmentId)) insertOrdered(textSteps, {
    kind: "text", seq: stepPosition(event), segmentId,
  })
}

function applyThinkingDelta(draft: Draft, event: EventOf<"thinking.delta">): void {
  const steps = stepsOf(draft, event.run_id)
  const segmentId = event.payload.segment_id
  const updated = updateStep(
    steps,
    (step) => step.kind === "thinking" && step.segmentId === segmentId,
    (step) =>
      step.kind === "thinking" ? { ...step, text: `${step.text}${event.payload.delta}` } : step,
  )
  if (!updated) {
    insertOrdered(steps, {
      kind: "thinking",
      seq: stepPosition(event),
      segmentId,
      text: event.payload.delta,
    })
  }
}

function applyToolInvoked(draft: Draft, event: EventOf<"tool.invoked">): void {
  const steps = stepsOf(draft, event.run_id)
  const payload = event.payload
  // 审批后的 invoked 复用既有步（保留 awaiting 的 seq/segment）：一次工具调用恒为一个步，
  // 即便 agent 的 invoked/returned segment 与 awaiting 漂移（真栈走查抓获的重复渲染）。
  const updated = updateStep(
    steps,
    (step) => step.kind === "tool" && step.tool.id === payload.tool_id,
    (step) =>
      step.kind === "tool"
        ? { ...step, tool: { ...step.tool, args: payload.args, status: "running" } }
        : step,
  )
  if (!updated) {
    insertOrdered(steps, {
      kind: "tool",
      seq: stepPosition(event),
      segmentId: payload.segment_id,
      tool: {
        id: payload.tool_id,
        name: payload.name,
        args: payload.args,
        status: "running",
      },
    })
  }
}

function applyToolReturned(draft: Draft, event: EventOf<"tool.returned">): void {
  const steps = stepsOf(draft, event.run_id)
  const payload = event.payload
  // rejected（HITL 拒绝，含超时回退）→ rejected（replay 安全，区别于绿勾 done）；is_error → error。
  const returnedStatus: ToolStatus = payload.rejected
    ? "rejected"
    : payload.is_error
      ? "error"
      : "done"
  const resultFields = {
    result: payload.result,
    ...(payload.is_error ? { errorText: payload.result } : {}),
    ...(payload.reject_reason !== undefined ? { rejectReason: payload.reject_reason } : {}),
    ...(payload.responded !== undefined ? { responded: payload.responded } : {}),
  }
  const updated = updateStep(
    steps,
    (step) => step.kind === "tool" && step.tool.id === payload.tool_id,
    (step) =>
      step.kind === "tool"
        ? {
            ...step,
            tool: {
              ...step.tool,
              ...resultFields,
              // 已置 rejected 的工具：回流（is_error=false 的拒绝文案）不得把 rejected 降级为 done。
              status: step.tool.status === "rejected" ? "rejected" : returnedStatus,
            },
          }
        : step,
  )
  if (!updated) {
    // 无配对的 invoked（部分 replay）：仍记录已完成的结果，不丢事件。
    insertOrdered(steps, {
      kind: "tool",
      seq: stepPosition(event),
      segmentId: payload.segment_id,
      tool: { id: payload.tool_id, name: payload.name, args: {}, status: returnedStatus, ...resultFields },
    })
  }
}

function applySubagentStarted(draft: Draft, event: EventOf<"subagent.started">): void {
  insertOrdered(stepsOf(draft, event.run_id), {
    kind: "subagent",
    seq: stepPosition(event),
    segmentId: event.payload.segment_id,
    subagent: {
      id: event.payload.subagent_id,
      name: event.payload.name,
      description: event.payload.description,
      subagentType: event.payload.subagent_type,
      source: event.payload.source,
      status: "running",
    },
  })
}

function updateSubagent(
  draft: Draft,
  runId: string,
  subagentId: string,
  updater: (subagent: SessionStep & { kind: "subagent" }) => SessionStep,
): void {
  updateStep(
    stepsOf(draft, runId),
    (step) => step.kind === "subagent" && step.subagent.id === subagentId,
    (step) => (step.kind === "subagent" ? updater(step) : step),
  )
}

// run 终态时把悬挂工具置结构化 stale 状态：避免永久挂起的批准按钮，文案由渲染层生成。
function settleOpenTool(
  tool: SessionToolCall,
  close: (status: "running") => ToolStatus,
): SessionToolCall | null {
  if (tool.status !== "running") {
    return null
  }
  return { ...tool, status: close(tool.status) }
}

function closeOpenTools(
  steps: SessionStep[],
  close: (status: "running") => ToolStatus,
): SessionStep[] | null {
  let changed = false
  const next = steps.map((step) => {
    if (step.kind !== "tool") {
      return step
    }
    const settled = settleOpenTool(step.tool, close)
    if (!settled) {
      return step
    }
    changed = true
    return { ...step, tool: settled }
  })
  return changed ? next : null
}

function applyRunTerminal(
  draft: Draft,
  event: EventOf<"run.completed"> | EventOf<"run.failed"> | EventOf<"run.dispatch_failed">,
): void {
  delete draft.state.interactionsByRun[event.run_id]
  closeSnapshotContinuation(draft, event.run_id)
  const steps = stepsOf(draft, event.run_id)
  const cancelled = event.kind === "run.completed" && event.payload.status === "cancelled"
  draft.state.runTerminalsById = {
    ...draft.state.runTerminalsById,
    [event.run_id]: event.kind === "run.completed" ? event.payload.status : "failed",
  }
  if ("publicSequence" in event && event.publicSequence !== undefined) {
    draft.state.finalAnswersByRun = { ...draft.state.finalAnswersByRun, [event.run_id]: mergeFinalAnswerReference(draft.state.finalAnswersByRun?.[event.run_id], {
      revision: event.publicSequence, segmentId: event.kind === "run.completed" && !cancelled ? event.payload.final_segment_id ?? null : null,
    }) }
  }
  const failed = event.kind !== "run.completed"
  const closed = closeOpenTools(steps, () => cancelled ? "cancelled" : failed ? "error" : "stale-running")
  if (closed) {
    draft.state.stepsByRun[event.run_id] = closed
  }
  if (event.kind === "run.completed") {
    if (draft.state.runFailuresById[event.run_id] !== undefined) {
      const next = { ...draft.state.runFailuresById }
      delete next[event.run_id]
      draft.state.runFailuresById = next
    }
  } else {
    draft.state.runFailuresById = {
      ...draft.state.runFailuresById,
      [event.run_id]: event.kind === "run.failed"
        ? { failedRunId: event.run_id, kind: "agent", profile: event.payload.profile }
        : { failedRunId: event.run_id, kind: "dispatch" },
    }
  }
  // runStatus 只表达当前/最近机器相位。历史 run terminal 可进入其 exact 索引，
  // 但不得覆写当前在途 run 的全局相位。
  if (draft.state.activeRunId === null || draft.state.activeRunId === event.run_id) {
    draft.state.runStatus = event.kind === "run.completed" ? event.payload.status : "failed"
  }
  if (draft.state.activeRunId === event.run_id) {
    draft.state.activeRunId = null
    draft.state.executionHead = null
  }
}

function applyEvent(draft: Draft, event: ChatProjectionEvent): void {
  switch (event.kind) {
    case "session.created":
      // sessions 集合真实元数据投影：标题真源在服务端。
      draft.state.meta = {
        title: event.payload.title,
        ownerId: event.payload.owner_id,
      }
      break
    case "run.created":
      draft.state.executionProcess = { runId: event.run_id, todos: null, activities: [] }
      if (draft.state.activeRunId === null || (draft.state.activeRunId === event.run_id &&
        (draft.state.executionHead === null || draft.state.executionHead.state === "queued"))) {
        draft.state.activeRunId = event.run_id
        draft.state.executionHead = { run_id: event.run_id, state: "active", pending_pauses: [] }
      }
      break
    case "message.user": {
      // user 消息事件三态：id 命中 → 更新；本地 echo 尚未被 receipt 对齐（SSE 跑赢 HTTP
      // 回执，steer 路径常态）→ 就地吸收改 id；都没有（刷新回放）→ 新建。
      const { messages } = draft.state
      const index = messages.findIndex((m) => m.id === event.payload.message_id)
      if (index >= 0) {
        const existing = messages[index]
        if (existing !== undefined) {
          messages[index] = { ...existing, content: event.payload.content }
        }
        break
      }
      const echoIndex = messages.findLastIndex(
        (m) => m.role === "user" && m.id.startsWith("usr_") && m.content === event.payload.content,
      )
      const echo = echoIndex >= 0 ? messages[echoIndex] : undefined
      if (echo !== undefined) {
        messages[echoIndex] = { ...echo, id: event.payload.message_id, runId: event.run_id }
      } else {
        messages.push({
          id: event.payload.message_id,
          role: "user",
          content: event.payload.content,
          runId: event.run_id,
        })
      }
      break
    }
    case "message.delta":
    case "message.completed":
      applyAssistantText(draft, event)
      break
    case "thinking.delta":
      applyThinkingDelta(draft, event)
      break
    case "tool.invoked":
      applyToolInvoked(draft, event)
      break
    case "tool.output.delta":
      // 长执行工具增量：V1 不渲染（终值走 tool.returned）；canvas/终端视图（P1）再消费。
      break
    case "interaction.state": {
      assertInteractionRevision(draft.state.interactionsByRun[event.run_id], event.payload)
      draft.state.interactionsByRun[event.run_id] = event.payload
      if (draft.state.activeRunId === null || draft.state.activeRunId === event.run_id) {
        draft.state.activeRunId = event.run_id
        const state = event.payload.phase === "terminal" ? "active" : event.payload.phase
        draft.state.executionHead = { run_id: event.run_id, state,
          pending_pauses: state === "active" ? [] : [event.payload] }
      }
      break
    }
    case "run.queued":
      if (draft.state.activeRunId === null || (draft.state.activeRunId === event.run_id &&
        (draft.state.executionHead === null || draft.state.executionHead.state === "queued"))) {
        draft.state.activeRunId = event.run_id
        draft.state.executionHead = { run_id: event.run_id, state: "queued", pending_pauses: [] }
      }
      break
    case "tool.returned":
      applyToolReturned(draft, event)
      break
    case "todo.updated":
      // 整表替换：todo.updated 每次携带完整清单。
      draft.state.todos = event.payload.todos
      if (draft.state.executionProcess?.runId === event.run_id) draft.state.executionProcess.todos = event.payload.todos
      break
    case "activity.updated": {
      if (retainedByOrderedBaseline(draft.state, event)) break
      if (draft.state.executionProcess?.runId !== event.run_id) break
      const index = draft.state.executionProcess.activities.findIndex((item) => item.activity_id === event.payload.activity_id)
      const steps = stepsOf(draft, event.run_id)
      const anchored = updateStep(steps,
        (step) => step.kind === "activity" && step.activity.activity_id === event.payload.activity_id,
        (step) => step.kind === "activity" ? { ...step, activity: event.payload } : step)
      // Snapshot activities have no first-event anchor. A later update must not
      // pass its own sequence off as that activity's first position.
      if (!anchored && index === -1) insertOrdered(steps, {
        kind: "activity", seq: stepPosition(event), segmentId: `activity:${event.payload.activity_id}`, activity: event.payload,
      })
      if (index === -1) draft.state.executionProcess.activities.push(event.payload)
      else draft.state.executionProcess.activities[index] = event.payload
      break
    }
    case "subagent.started":
      applySubagentStarted(draft, event)
      break
    case "subagent.finished":
      updateSubagent(draft, event.run_id, event.payload.subagent_id, (step) => ({
        ...step,
        subagent: {
          ...step.subagent,
          status: event.payload.failed ? "failed" : "done",
          ...(event.payload.error !== undefined ? { error: event.payload.error } : {}),
        },
      }))
      break
    case "subagent.thinking.delta":
      // 穷尽 switch 须显式接收；子代理推理增量无消费视图，不参与状态归约。
      break
    case "subagent.text.delta":
      updateSubagent(draft, event.run_id, event.payload.subagent_id, (step) => ({
        ...step,
        subagent: {
          ...step.subagent,
          output: `${step.subagent.output ?? ""}${event.payload.text}`,
        },
      }))
      break
    case "subagent.text.completed":
      updateSubagent(draft, event.run_id, event.payload.subagent_id, (step) => ({
        ...step,
        subagent: { ...step.subagent, output: event.payload.text },
      }))
      break
    case "subagent.tool.invoked":
    case "subagent.tool.returned":
      // 穷尽 switch 须显式接收；当前无子代理详情视图消费此通道，不参与状态归约。
      break
    case "delivery.created": {
      // Replayed source IDs and snapshot entries converge on the owner binary key.
      const payload = event.payload
      if (draft.state.deliveries.some((d) => d.conversationId === event.session_id && d.artifactId === payload.artifact_id)) {
        break
      }
      draft.state.deliveries = [
        ...draft.state.deliveries,
        {
          conversationId: event.session_id,
          artifactId: payload.artifact_id,
          assetId: payload.asset_id,
          artifactKind: payload.artifact_kind,
          title: payload.title,
          mime: payload.mime,
          size: payload.size,
          runId: event.run_id,
          createdAt: event.timestamp,
          ...(payload.note !== undefined ? { note: payload.note } : {}),
        },
      ]
      break
    }
    case "run.completed":
    case "run.failed":
    case "run.dispatch_failed":
      applyRunTerminal(draft, event)
      break
    default: {
      // 穷尽保护：契约新增 kind 而未在此处理时编译期报错。
      const _exhaustive: never = event
      return _exhaustive
    }
  }
}

// 批量折叠：整批只做一次顶层快照，逐事件在可变草稿上折叠（修 replay O(n²)）；
// 全部重复（event_id 已见）时原样返回入参 state，保证幂等判定可用引用相等表达。
export function applyChatProjectionEvents(
  state: SessionStreamState,
  events: readonly ChatProjectionEvent[],
): SessionStreamState {
  state = normalizeRunTerminals(state)
  let draft: Draft | null = null
  for (const event of events) {
    const base = draft?.state ?? state
    if (base.seenEventIds.has(event.event_id)) {
      continue
    }
    if (!draft) {
      draft = {
        state: {
          seenEventIds: new Set(state.seenEventIds),
          messages: [...state.messages],
          ...(state.messageParts === undefined ? {} : { messageParts: state.messageParts }),
          todos: state.todos,
          executionProcess: state.executionProcess === null ? null : {
            ...state.executionProcess,
            todos: state.executionProcess.todos === null ? null : [...state.executionProcess.todos],
            activities: [...state.executionProcess.activities],
          },
          stepsByRun: { ...state.stepsByRun },
          files: state.files,
          deliveries: state.deliveries,
          deliveriesHasMore: state.deliveriesHasMore,
          runStatus: state.runStatus,
          runFailuresById: state.runFailuresById,
          runTerminalsById: state.runTerminalsById,
          finalAnswersByRun: state.finalAnswersByRun ?? {},
          unattributedFailure: state.unattributedFailure,
          activeRunId: state.activeRunId,
          executionHead: state.executionHead,
          interactionsByRun: { ...state.interactionsByRun },
          lastSeq: state.lastSeq,
          resumeCursor: state.resumeCursor,
          meta: state.meta,
        },
        touchedRuns: new Set(),
      }
    }
    draft.state.seenEventIds.add(event.event_id)
    if ("seq" in event && event.seq > draft.state.lastSeq) {
      draft.state.lastSeq = event.seq
    }
    applyEvent(draft, event)
  }
  return draft?.state ?? state
}

export function applyChatProjectionEvent(
  state: SessionStreamState,
  event: ChatProjectionEvent,
): SessionStreamState {
  return applyChatProjectionEvents(state, [event])
}

// —— 本地命令（非事件折叠）：用户动作驱动的纯状态迁移 ——

// 用户输入本地产生、不进 seenEventIds；复位 runStatus 并清空 todo，历史步骤保留。
export function appendUserMessage(
  state: SessionStreamState,
  message: { id: string; content: string },
): SessionStreamState {
  state = normalizeRunTerminals(state)
  return {
    ...state,
    messages: [
      ...state.messages,
      // 用户消息用自身 id 作 runId：投影据此把它与任一 assistant run 隔开，单独成行。
      { id: message.id, role: "user", content: message.content, runId: message.id },
    ],
    todos: [],
    runStatus: "idle",
  }
}

// 用户停止在途 run 的本地收口：悬挂工具置结构化 cancelled（停止即关流，后端终态来不及回流）。
export function markRunCancelled(
  state: SessionStreamState,
  runId: string,
): SessionStreamState {
  state = normalizeRunTerminals(state)
  const steps = state.stepsByRun[runId]
  if (!steps) {
    return state
  }
  const closed = closeOpenTools(steps, () => "cancelled")
  if (!closed) {
    return state
  }
  return { ...state, stepsByRun: { ...state.stepsByRun, [runId]: closed } }
}


// Exact public positions, not opaque transport cursor order. Baseline replacement
// is restricted to this owner Message; post-revision public events win by replay.
export function mergeMessageParts(state: SessionStreamState, read: {
  message_id: string; run_id: string; revision: string; final_segment_id?: string | undefined; items: readonly MessagePart[];
}, events: readonly ChatProjectionEvent[], complete: boolean): SessionStreamState {
  state = normalizeRunTerminals(state)
  const known = state.messageParts?.[read.message_id]
  if (!known || known.runId !== read.run_id || BigInt(read.revision) < BigInt(known.revision)) return state
  let fragment = createSessionStreamState()
  fragment.activeRunId = read.run_id
  fragment.executionProcess = { runId: read.run_id, todos: null, activities: [] }
  const heldTextSegments = new Set<string>()
  const confirmedSlots = { ...known.confirmedSlots }
  const oldById = new Map(state.messages.filter((item) => item.role === "assistant" && item.runId === read.run_id && !item.orderedContainer).map((item) => [item.id, item]))
  for (const part of read.items) {
    if (part.kind === "text") {
      const old = oldById.get(part.segment_id)
      const partialSlot = part.end !== part.total_scalars
      if (partialSlot && old) heldTextSegments.add(part.segment_id)
      // An incomplete scalar prefix is staged by the reader, not published as
      // a complete text baseline. Existing live text continues independently.
      // Once the slot is complete, its pure baseline replaces/replays once.
      if (!partialSlot) confirmedSlots[`text:${part.segment_id}`] = part.latest_sequence
      if (!partialSlot || old) fragment.messages.push({ id: part.segment_id, role: "assistant", content: partialSlot && old ? old.content : part.text, runId: read.run_id, snapshotMessageId: read.message_id, textState: !partialSlot && part.offset === "0" && part.completed ? "completed" : "streaming" })
      ;(fragment.stepsByRun[read.run_id] ??= []).push({ kind: "text", seq: part.first_sequence, segmentId: part.segment_id })
    } else {
      confirmedSlots[`activity:${part.activity.activity_id}`] = part.latest_sequence
      ;(fragment.stepsByRun[read.run_id] ??= []).push({ kind: "activity", seq: part.first_sequence, segmentId: `activity:${part.activity.activity_id}`, activity: part.activity })
      fragment.executionProcess.activities.push(part.activity)
    }
  }
  const newer = events.filter((event) => event.run_id === read.run_id && "publicSequence" in event && event.publicSequence !== undefined && BigInt(event.publicSequence) > BigInt(read.revision) &&
    (event.kind === "message.delta" || event.kind === "message.completed" || event.kind === "activity.updated") &&
    ((event.kind !== "message.delta" && event.kind !== "message.completed") || !heldTextSegments.has(event.payload.segment_id)))
  fragment = applyChatProjectionEvents(fragment, newer)
  let messages = [...fragment.messages]
  const steps = [...(fragment.stepsByRun[read.run_id] ?? [])]
  if (!complete) {
    const ids = new Set(messages.map((item) => item.id))
    messages = [...messages, ...[...oldById.values()].filter((item) => !ids.has(item.id))]
    const anchored = new Set(steps.map((item) => item.kind === "activity" ? `activity:${item.activity.activity_id}` : `${item.kind}:${item.segmentId}`))
    steps.push(...(state.stepsByRun[read.run_id] ?? []).filter((item) => !anchored.has(item.kind === "activity" ? `activity:${item.activity.activity_id}` : `${item.kind}:${item.segmentId}`)))
    steps.sort((a, b) => BigInt(a.seq) < BigInt(b.seq) ? -1 : BigInt(a.seq) > BigInt(b.seq) ? 1 : 0)
  }
  // Retain the durable owner marker even for a genuinely empty ordered Message.
  const marker = state.messages.find((item) => item.orderedContainer && item.snapshotMessageId === read.message_id)
  if (marker) messages.unshift(marker)
  const start = state.messages.findIndex((item) => item.runId === read.run_id && item.role === "assistant")
  const other = state.messages.filter((item) => item.runId !== read.run_id || item.role !== "assistant")
  other.splice(start < 0 ? other.length : Math.min(start, other.length), 0, ...messages)
  const knownVersion = { ...known }
  delete knownVersion.finalSegmentId
  const finalReference = mergeFinalAnswerReference(state.finalAnswersByRun?.[read.run_id], { segmentId: read.final_segment_id ?? null, revision: read.revision })
  return { ...state, finalAnswersByRun: { ...state.finalAnswersByRun, [read.run_id]: finalReference }, messages: other, stepsByRun: { ...state.stepsByRun, [read.run_id]: steps },
    messageParts: { ...state.messageParts, [read.message_id]: { ...knownVersion, ...(read.final_segment_id === undefined ? {} : { finalSegmentId: read.final_segment_id }), descriptor: true, confirmedSlots, partIds: [...new Set([...(known.partIds ?? []), ...read.items.map((part) => part.part_id)])], ...(complete ? { confirmedRevision: read.revision } : {}), revision: read.revision, status: complete ? "complete" : "partial" } } }
}

// A fresh private snapshot may omit all inline text. Keep confirmed visible
// slots until its asynchronous version-bound read replaces this exact Message.
export function preserveMessageParts(previous: SessionStreamState, next: SessionStreamState): SessionStreamState {
  previous = normalizeRunTerminals(previous)
  next = normalizeRunTerminals(next)
  let result = next
  for (const [runId, reference] of Object.entries(next.finalAnswersByRun ?? {})) {
    result = { ...result, finalAnswersByRun: { ...result.finalAnswersByRun, [runId]: mergeFinalAnswerReference(previous.finalAnswersByRun?.[runId], reference) } }
  }
  for (const value of Object.values(next.messageParts ?? {})) {
    const prior = previous.messageParts?.[value.messageId]
    if (!prior || prior.runId !== value.runId) continue
    const old = previous.messages.filter((message) => message.role === "assistant" && message.runId === value.runId && !message.orderedContainer)
    const markerIndex = result.messages.findIndex((message) => message.snapshotMessageId === value.messageId)
    const messages = [...result.messages]
    messages.splice(markerIndex + 1, 0, ...old)
    const retained = { ...prior }
    delete retained.cursor
    delete retained.watermark
    delete retained.finalSegmentId
    const newest = BigInt(value.revision) < BigInt(prior.revision) ? prior : value
    const finalReference = mergeFinalAnswerReference(previous.finalAnswersByRun?.[value.runId], { segmentId: value.finalSegmentId ?? null, revision: value.revision })
    result = { ...result, messages, finalAnswersByRun: { ...result.finalAnswersByRun, [value.runId]: finalReference },
      messageParts: { ...result.messageParts, [value.messageId]: { ...retained, ...newest,
        revision: BigInt(value.revision) < BigInt(prior.revision) ? prior.revision : value.revision,
        ...(prior.confirmedRevision === undefined ? {} : { confirmedRevision: prior.confirmedRevision }),
        ...(prior.confirmedSlots === undefined ? {} : { confirmedSlots: prior.confirmedSlots }),
        ...(prior.partIds === undefined ? {} : { partIds: prior.partIds }),
        ...(prior.status === "changed" ? { status: "changed" as const } : {}),
      } },
      stepsByRun: { ...result.stepsByRun, [value.runId]: previous.stepsByRun[value.runId] ?? [] } }
  }
  return result
}
