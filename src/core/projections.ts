// thread/segment 归组投影：纯派生，渲染层唯一的读取模型。

import type {
  AttributedRunFailure,
  SessionMessage,
  SessionStep,
  SessionStreamState,
  SessionSubagent,
  SessionToolCall,
} from "./state"
import type { RunProcessActivity } from "@/contract/chat"

// 线程渲染项：连续同 runId 的 assistant 消息归并为一个 turn；用户消息单独成项。
export type ThreadItem =
  | { kind: "user"; message: SessionMessage }
  | {
      kind: "assistant-turn"
      anchorId: string
      runId: string
      steps: SessionStep[]
      messagesById: Record<string, SessionMessage>
      failure?: AttributedRunFailure
    }

// 防御性恢复：若持久化快照缺少 text 步骤，按 assistant message 补齐渲染锚点。
function withRestoredTextSteps(
  steps: SessionStep[],
  messagesById: Record<string, SessionMessage>,
): SessionStep[] {
  const covered = new Set(
    steps.filter((step) => step.kind === "text").map((step) => step.segmentId),
  )
  const missing = Object.keys(messagesById).filter((id) => !covered.has(id))
  if (missing.length === 0) {
    return steps
  }
  let nextSeq = steps.reduce((max, step) => Math.max(max, step.seq), 0)
  const synthetic: SessionStep[] = missing.map((segmentId) => {
    nextSeq += 1
    return { kind: "text", seq: nextSeq, segmentId }
  })
  return [...steps, ...synthetic]
}

export function buildThreadItems(state: SessionStreamState): ThreadItem[] {
  const items: ThreadItem[] = []
  const renderedRuns = new Set<string>()
  let i = 0

  while (i < state.messages.length) {
    const message = state.messages[i]
    if (message === undefined) {
      break
    }

    if (message.role === "user") {
      items.push({ kind: "user", message })
      i += 1
      continue
    }

    // 收拢连续的同 runId assistant 消息，组成一个 turn 的文本段索引。
    const runId = message.runId
    const anchorId = `assistant:${runId}:message:${message.id}`
    const messagesById: Record<string, SessionMessage> = {}
    while (i < state.messages.length) {
      const candidate = state.messages[i]
      if (candidate === undefined || candidate.role !== "assistant" || candidate.runId !== runId) {
        break
      }
      messagesById[candidate.id] = candidate
      i += 1
    }

    renderedRuns.add(runId)
    items.push({
      kind: "assistant-turn",
      anchorId,
      runId,
      steps: withRestoredTextSteps(state.stepsByRun[runId] ?? [], messagesById),
      messagesById,
    })
  }

  // 仅有过程步骤、尚无任何 assistant 文本的 run（首 token 未到）：作为无文本的成形 turn。
  for (const runId of new Set([...Object.keys(state.stepsByRun), ...Object.keys(state.interactionsByRun), ...(state.executionProcess === null ? [] : [state.executionProcess.runId])])) {
    if (renderedRuns.has(runId)) {
      continue
    }
    const steps = state.stepsByRun[runId] ?? []
    const firstSegmentId = steps[0]?.segmentId ?? "process"
    items.push({
      kind: "assistant-turn",
      anchorId: `assistant:${runId}:step:${firstSegmentId}`,
      runId,
      steps,
      messagesById: {},
    })
    renderedRuns.add(runId)
  }
  // RUN_ERROR may arrive before the first text/process frame. Preserve the
  // exact run as an empty assistant turn so its terminal footer has a truthful
  // owner rather than falling back to a thread-level alert.
  for (const runId of Object.keys(state.runFailuresById)) {
    if (renderedRuns.has(runId)) continue
    renderedRuns.add(runId)
    items.push({
      kind: "assistant-turn",
      anchorId: `assistant:${runId}:failure`,
      runId,
      steps: [],
      messagesById: {},
    })
  }

  const lastTurnByRun = new Map<string, number>()
  for (const [index, item] of items.entries()) {
    if (item.kind === "assistant-turn") lastTurnByRun.set(item.runId, index)
  }
  return items.map((item, index) => {
    if (item.kind !== "assistant-turn" || lastTurnByRun.get(item.runId) !== index) return item
    const failure = state.runFailuresById[item.runId]
    return failure === undefined ? item : { ...item, failure }
  })
}

// 一个 turn 内按 segmentId 聚合的视图段：过程归到「催生其后那段答案」的段下。
export type Segment = {
  segmentId: string
  thinking: string
  tools: SessionToolCall[]
  subagents: SessionSubagent[]
  activities: RunProcessActivity[]
}

// 按 segmentId 把有序步骤分段，保持首次出现顺序（即真实发生时序）。
export function groupSegments(steps: SessionStep[], activities: readonly RunProcessActivity[] = []): Segment[] {
  // ordered 保留首次出现顺序；byId 仅做去重定位，二者指向同一对象。
  const ordered: Segment[] = []
  const byId = new Map<string, Segment>()
  const segmentFor = (id: string): Segment => {
    const existing = byId.get(id)
    if (existing) {
      return existing
    }
    const created: Segment = { segmentId: id, thinking: "", tools: [], subagents: [], activities: [] }
    byId.set(id, created)
    ordered.push(created)
    return created
  }
  for (const step of steps) {
    const segment = segmentFor(step.segmentId)
    if (step.kind === "thinking") {
      segment.thinking += step.text
    } else if (step.kind === "tool") {
      segment.tools.push(step.tool)
    } else if (step.kind === "subagent") {
      segment.subagents.push(step.subagent)
    }
    // text 步骤只标记该段存在；正文从 messagesById 取。
  }
  for (const activity of activities) {
    const segmentId = activity.activity === "skill" ? `skill:${activity.preflight_id}` : activity.segment_id
    segmentFor(segmentId).activities.push(activity)
  }
  return ordered
}
