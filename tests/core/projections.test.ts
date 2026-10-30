import { beforeEach, describe, expect, it } from "vitest"

import { stateFromSnapshot } from "@/core/hydration"
import { buildThreadItems, currentRunProgressTodos, groupSegments } from "@/core/projections"
import { messagePartsPageSchema, parseSessionSnapshot } from "@/contract/http"
import { applyChatProjectionEvents, appendUserMessage, mergeMessageParts } from "@/core/reducer"
import { createSessionStreamState, type SessionStep } from "@/core/state"

import { AGENT_FAILURE_PROFILES, makeAgentFailureEvent, makeEvent, makePublic4Snapshot, makeSnapshot, resetFixtureSeq } from "./fixtures"

beforeEach(resetFixtureSeq)

describe("buildThreadItems", () => {
  it("用户消息单独成项，连续同 run assistant 段归并为一个 turn", () => {
    let state = appendUserMessage(createSessionStreamState(), { id: "usr_1", content: "hi" })
    state = applyChatProjectionEvents(state, [
      makeEvent("message.delta", { segment_id: "seg_1", delta: "a" }, { run_id: "run_1" }),
      makeEvent("message.delta", { segment_id: "seg_2", delta: "b" }, { run_id: "run_1" }),
    ])
    const items = buildThreadItems(state)
    expect(items.map((item) => item.kind)).toEqual(["user", "assistant-turn"])
    const turn = items[1]
    if (turn?.kind !== "assistant-turn") {
      throw new Error("expected assistant-turn")
    }
    expect(Object.keys(turn.messagesById).sort()).toEqual(["seg_1", "seg_2"])
  })

  it("仅有过程步骤、尚无文本的 run 作为无文本成形 turn", () => {
    const state = applyChatProjectionEvents(createSessionStreamState(), [
      makeEvent("thinking.delta", { segment_id: "seg_1", delta: "plan" }, { run_id: "run_x" }),
    ])
    const items = buildThreadItems(state)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: "assistant-turn", runId: "run_x" })
  })

  it("持久化快照缺 text 步骤时按 message 合成渲染锚点", () => {
    let state = applyChatProjectionEvents(createSessionStreamState(), [
      makeEvent("message.completed", { segment_id: "seg_1", content: "answer" }),
    ])
    // 模拟旧落盘丢失 text 步骤。
    state = { ...state, stepsByRun: { ...state.stepsByRun, run_1: [] } }
    const items = buildThreadItems(state)
    const turn = items[0]
    if (turn?.kind !== "assistant-turn") {
      throw new Error("expected assistant-turn")
    }
    expect(turn.steps.some((step) => step.kind === "text" && step.segmentId === "seg_1")).toBe(
      true,
    )
  })

  it("同 run 出现多个 assistant 组时只把失败交给最后一组", () => {
    const profile = AGENT_FAILURE_PROFILES[0]!
    const state = {
      ...createSessionStreamState(),
      messages: [
        { id: "a1", role: "assistant" as const, content: "part one", runId: "run_a" },
        { id: "u1", role: "user" as const, content: "owner fact", runId: "u1" },
        { id: "a2", role: "assistant" as const, content: "part two", runId: "run_a" },
      ],
      stepsByRun: { run_a: [
        { kind: "text" as const, seq: 1, segmentId: "a1" },
        { kind: "text" as const, seq: 2, segmentId: "a2" },
      ] },
      runFailuresById: {
        run_a: { failedRunId: "run_a", kind: "agent" as const, profile },
      },
    }
    const turns = buildThreadItems(state).filter((item) => item.kind === "assistant-turn")
    expect(turns).toHaveLength(2)
    expect(turns.map((turn) => turn.anchorId)).toEqual([
      "assistant:run_a:turn:0",
      "assistant:run_a:turn:1",
    ])
    expect(buildThreadItems(state).filter((item) => item.kind === "assistant-turn").map((turn) => turn.anchorId))
      .toEqual(turns.map((turn) => turn.anchorId))
    expect(turns[0]).not.toHaveProperty("failure")
    expect(turns[1]).toMatchObject({ failure: { failedRunId: "run_a", kind: "agent", profile } })
  })

  it("thinking/tool-only failed run exactly once preserves process and footer", () => {
    const profile = AGENT_FAILURE_PROFILES[0]!
    const state = {
      ...createSessionStreamState(),
      stepsByRun: {
        run_process: [{ kind: "thinking" as const, seq: 1, segmentId: "thinking_1", text: "working" }],
      },
      runFailuresById: {
        run_process: { failedRunId: "run_process", kind: "agent" as const, profile },
      },
    }
    const turns = buildThreadItems(state).filter((item) => item.kind === "assistant-turn")
    expect(turns).toHaveLength(1)
    expect(turns[0]).toMatchObject({
      anchorId: "assistant:run_process:turn:0",
      runId: "run_process",
      steps: [{ kind: "thinking", segmentId: "thinking_1", text: "working" }],
      failure: { failedRunId: "run_process", kind: "agent", profile },
    })
  })
})

describe("groupSegments", () => {
  it("interleaves live safe activity groups with every real text item without moving updated activities", () => {
    const tool = { activity: "tool" as const, activity_id: `act_${"1".repeat(64)}`, segment_id: `seg_${"2".repeat(64)}`, status: "running" as const, display_code: "tool.execution" as const }
    const nextTool = { ...tool, activity_id: `act_${"3".repeat(64)}`, segment_id: `seg_${"4".repeat(64)}` }
    const skill = { activity: "skill" as const, activity_id: `act_${"5".repeat(64)}`, preflight_id: `spf_${"6".repeat(64)}`, source_refs: ["skill:alpha"], phase: "loading" as const }
    const subagent = { activity: "subagent" as const, activity_id: `act_${"7".repeat(64)}`, segment_id: `seg_${"8".repeat(64)}`, status: "running" as const, display_code: "subagent.execution" as const }
    const first = applyChatProjectionEvents(createSessionStreamState(), [
      makeEvent("run.created", { run_id: "run_1" }, { seq: 1 }),
      makeEvent("message.delta", { segment_id: "text_a", delta: "A" }, { seq: 2 }),
      makeEvent("activity.updated", tool, { seq: 3 }),
      makeEvent("activity.updated", nextTool, { seq: 4 }),
      makeEvent("message.delta", { segment_id: "text_b", delta: "B" }, { seq: 5 }),
      makeEvent("activity.updated", skill, { seq: 6 }),
      makeEvent("activity.updated", subagent, { seq: 7 }),
      makeEvent("message.delta", { segment_id: "text_c", delta: "C" }, { seq: 8 }),
    ])
    const updated = applyChatProjectionEvents(first, [
      makeEvent("activity.updated", { ...tool, status: "completed" }, { seq: 9 }),
      makeEvent("activity.updated", { ...skill, preflight_id: `spf_${"9".repeat(64)}`, phase: "ready" }, { seq: 10 }),
    ])
    const turn = buildThreadItems(updated)[0]
    const oldTurn = buildThreadItems(first)[0]
    if (turn?.kind !== "assistant-turn" || oldTurn?.kind !== "assistant-turn") throw new Error("expected assistant turn")
    const segments = groupSegments(turn.steps, updated.executionProcess?.activities)
    expect(segments.map((segment) => turn.messagesById[segment.segmentId]?.content ?? segment.activities.map((activity) => activity.activity).join(","))).toEqual([
      "A", "tool,tool", "B", "skill,subagent", "C",
    ])
    expect(segments.map((segment) => segment.segmentId)).toEqual(groupSegments(oldTurn.steps, first.executionProcess?.activities).map((segment) => segment.segmentId))
    expect(segments.flatMap((segment) => segment.activities)).toEqual(updated.executionProcess?.activities)
    expect(groupSegments(turn.steps)).toEqual(segments)
  })

  it("keeps unanchored snapshot activities on the original legacy fallback path", () => {
    const tool = { activity: "tool" as const, activity_id: `act_${"a".repeat(64)}`, segment_id: `seg_${"b".repeat(64)}`, status: "completed" as const, display_code: "tool.execution" as const }
    const skill = { activity: "skill" as const, activity_id: `act_${"c".repeat(64)}`, preflight_id: `spf_${"d".repeat(64)}`, source_refs: ["skill:alpha"], phase: "ready" as const }
    const snapshot = {
      ...makeSnapshot({ messages: [{ message_id: "durable", role: "assistant", run_id: "run_1", content: "legacy text", status: "completed", created_at: "2026-07-02T00:00:00Z" }] }),
      execution_process: { run_id: "run_1", todos: null, activities: [tool, skill], next_cursor: null },
    }
    const restored = stateFromSnapshot(snapshot)
    expect(groupSegments(restored.stepsByRun.run_1 ?? [], restored.executionProcess?.activities)).toMatchObject([
      { segmentId: "durable", activities: [] },
      { segmentId: tool.segment_id, activities: [tool] },
      { segmentId: `skill:${skill.preflight_id}`, activities: [skill] },
    ])
  })

  it("按 segmentId 聚合并保持首次出现顺序", () => {
    const steps: SessionStep[] = [
      { kind: "thinking", seq: 1, segmentId: "seg_1", text: "think " },
      {
        kind: "tool",
        seq: 2,
        segmentId: "seg_1",
        tool: { id: "tool_1", name: "search", args: {}, status: "done" },
      },
      { kind: "text", seq: 3, segmentId: "seg_1" },
      { kind: "thinking", seq: 4, segmentId: "seg_2", text: "more" },
      { kind: "thinking", seq: 5, segmentId: "seg_1", text: "late" },
    ]
    const segments = groupSegments(steps)
    expect(segments.map((segment) => segment.segmentId)).toEqual(["seg_1", "seg_2"])
    expect(segments[0]?.thinking).toBe("think late")
    expect(segments[0]?.tools.map((tool) => tool.id)).toEqual(["tool_1"])
    expect(segments[0]?.legacySteps.map((step) => step.kind)).toEqual(["thinking", "tool", "thinking"])
  })

  it.each([
    ["空步骤", [] as SessionStep[], 0],
    ["仅 text 步骤", [{ kind: "text", seq: 1, segmentId: "seg_1" }] as SessionStep[], 1],
  ])("%s → %d 段", (_label, steps, expected) => {
    expect(groupSegments(steps)).toHaveLength(expected)
  })
})


it("keeps snapshot text then post-watermark tool and new text segments in real order", () => {
  const initial = stateFromSnapshot(makeSnapshot({
    activeRun: { run_id: "run_1", status: "running" },
    messages: [{ message_id: "durable", role: "assistant", run_id: "run_1", content: "earlier",
      status: "streaming", created_at: "2026-07-02T00:00:00Z" }],
  }))
  const state = applyChatProjectionEvents(initial, [
    makeEvent("tool.invoked", { segment_id: "tool_seg", tool_id: "tool", name: "search", args: {} }, { seq: 11 }),
    makeEvent("message.delta", { segment_id: "new_seg", delta: "", text_boundary: "start" }, { seq: 12 }),
    makeEvent("message.delta", { segment_id: "new_seg", delta: "later" }, { seq: 13 }),
    makeEvent("tool.returned", { segment_id: "tool_seg", tool_id: "tool", name: "search", result: "done", is_error: false }, { seq: 14 }),
  ])
  const turn = buildThreadItems(state)[0]
  if (turn?.kind !== "assistant-turn") throw new Error("expected assistant turn")
  const segments = groupSegments(turn.steps)
  expect(segments.map((segment) => segment.segmentId)).toEqual(["durable", "tool_seg", "new_seg"])
  expect(segments.map((segment) => turn.messagesById[segment.segmentId]?.content ?? "")).toEqual(["earlier", "", "later"])
  expect(segments[1]?.tools[0]?.status).toBe("done")
})


describe("currentRunProgressTodos", () => {
  const todos = [{ content: "original current plan", status: "in_progress" as const }, { content: "original remaining plan", status: "pending" as const }]
  const started = (runId = "run_1") => applyChatProjectionEvents(createSessionStreamState(), [
    makeEvent("run.created", { run_id: runId }, { run_id: runId }),
    makeEvent("todo.updated", { todos }, { run_id: runId }),
  ])

  it.each(["active", "waiting", "resuming"] as const)("keeps exact %s process progress after snapshot hydration even with idle runStatus and no global todos", state => {
    const snapshot = parseSessionSnapshot({ ...makePublic4Snapshot({ state, runId: "run_current" }),
      execution_process: { run_id: "run_current", todos, activities: [], next_cursor: null } })
    const thread = stateFromSnapshot(snapshot)
    expect(thread.runStatus).toBe("idle")
    expect(thread.todos).toEqual([])
    expect(currentRunProgressTodos(thread)).toBe(thread.executionProcess?.todos)
    expect(currentRunProgressTodos(thread)).toEqual(todos)
  })

  it.each(["completed", "failed", "cancelled"] as const)("retires exact %s progress without rewriting pending plan or selected process", terminal => {
    const active = started()
    const ended = applyChatProjectionEvents(active, [terminal === "failed"
      ? makeAgentFailureEvent(AGENT_FAILURE_PROFILES[0]!)
      : makeEvent("run.completed", { status: terminal, token_usage: null })])
    expect(currentRunProgressTodos(ended)).toEqual([])
    expect(ended.todos).toEqual(todos)
    expect(ended.executionProcess?.todos).toEqual(todos)
    expect(ended.executionProcess?.runId).toBe("run_1")
  })

  it("does not attribute a historical selected process to a queued successor or show a queued same-Run as active", () => {
    const snapshot = parseSessionSnapshot({ ...makePublic4Snapshot({ state: "queued", runId: "run_b" }),
      execution_process: { run_id: "run_a", todos, activities: [], next_cursor: null } })
    const thread = stateFromSnapshot(snapshot)
    expect(currentRunProgressTodos(thread)).toEqual([])
    expect(currentRunProgressTodos({ ...thread, executionProcess: { runId: "run_b", todos, activities: [] } })).toEqual([])
    expect(thread.executionProcess?.todos).toEqual(todos)
  })

  it("an old terminal cannot retire another exact current Run's progress", () => {
    const current = started("run_b")
    const afterOldTerminal = applyChatProjectionEvents(current, [makeEvent("run.completed", { status: "completed", token_usage: null }, { run_id: "run_a" })])
    expect(currentRunProgressTodos(afterOldTerminal)).toEqual(todos)
    expect(afterOldTerminal.executionHead?.run_id).toBe("run_b")
  })

  it("requires exact head/process identity and never falls back to global stale todos", () => {
    const current = started("run_b")
    expect(currentRunProgressTodos({ ...current, executionProcess: { runId: "run_b_old", todos, activities: [] } })).toEqual([])
    expect(currentRunProgressTodos({ ...current, executionProcess: null })).toEqual([])
    expect(currentRunProgressTodos({ ...current, executionProcess: { runId: "run_b", todos: null, activities: [] } })).toEqual([])
    expect(currentRunProgressTodos({ ...current, executionHead: null })).toEqual([])
    expect(current.todos).toEqual(todos)
  })

  it("does not infer Run terminal from a fully completed plan", () => {
    const current = started()
    const completedPlan = [{ content: "a finished planning item", status: "completed" as const }]
    const updated = applyChatProjectionEvents(current, [makeEvent("todo.updated", { todos: completedPlan })])
    expect(currentRunProgressTodos(updated)).toEqual(completedPlan)
    expect(updated.executionHead?.state).toBe("active")
  })
})


describe("native tool rounds and authoritative empty text boundaries", () => {
  const activity = (letter: string) => ({ activity: "tool" as const, activity_id: `act_${letter.repeat(64)}`, segment_id: `seg_${letter.repeat(64)}`, status: "completed" as const, display_code: "tool.execution" as const })
  function readState(emptyCompleted: boolean, emptyBody = "", tailOnly = false) {
    const initial = stateFromSnapshot(parseSessionSnapshot({ ...makeSnapshot(), messages: [{ message_id: "owner", role: "assistant", run_id: "run", content: null, status: "completed", created_at: "now", rendering: { mode: "ordered", format_version: 1, revision: "5", event_watermark: null, parts_cursor: "opaque" } }] }))
    const text = (segment: string, body: string, position: string, completed = true) => ({ kind: "text", part_id: `opaque-${segment}`, segment_id: segment, first_sequence: position, latest_sequence: position, text: body, offset: "0", end: String(Array.from(body).length), total_scalars: String(Array.from(body).length), completed })
    const process = (letter: string, position: string) => ({ kind: "activity", part_id: `opaque-${letter}`, first_sequence: position, latest_sequence: position, activity: activity(letter) })
    const page = messagePartsPageSchema.parse({ session_id: "session", message_id: "owner", run_id: "run", format_version: 1, revision: "5", event_watermark: null, next_cursor: null, items: [process("a", "1"), (tailOnly ? { ...text("empty", "", "2", emptyCompleted), offset: "1", end: "1", total_scalars: "1" } : text("empty", emptyBody, "2", emptyCompleted)), process("b", "3"), text("visible", "public answer", "4"), process("c", "5")] })
    return mergeMessageParts(initial, page, [], true)
  }
  function groups(state: ReturnType<typeof readState>) {
    const turn = buildThreadItems(state)[0]
    if (turn?.kind !== "assistant-turn") throw new Error("missing owner turn")
    return groupSegments(turn.steps, [], turn.messagesById)
  }
  it("joins activities across an owner-proven completed empty slot but never across public text", () => {
    const segments = groups(readState(true))
    expect(segments.map((segment) => segment.activities.length)).toEqual([2, 0, 1])
    expect(segments.some((segment) => segment.segmentId === "empty")).toBe(false)
    expect(segments[1]?.segmentId).toBe("visible")
    const corrected = applyChatProjectionEvents(readState(true), [makeEvent("message.completed", { segment_id: "empty", content: "late owner body" }, { run_id: "run", publicSequence: "6" })])
    expect(groups(corrected).map((segment) => segment.activities.length)).toEqual([1, 0, 1, 0, 1])
    expect(corrected.messages.find((message) => message.id === "empty")?.content).toBe("late owner body")
  })
  it("keeps unfinished or missing-body empty slots as conservative boundaries", () => {
    const state = readState(false)
    expect(groups(state).map((segment) => segment.activities.length)).toEqual([1, 0, 1, 0, 1])
    expect(groups(readState(true, "", true)).map((segment) => segment.activities.length)).toEqual([1, 0, 1, 0, 1])
    const turn = buildThreadItems(state)[0]
    if (turn?.kind !== "assistant-turn") throw new Error("missing owner turn")
    const withoutBody = Object.fromEntries(Object.entries(turn.messagesById).filter(([id]) => id !== "empty"))
    expect(groupSegments(turn.steps, [], withoutBody).map((segment) => segment.activities.length)).toEqual([1, 0, 1, 0, 1])
  })
  it("does not infer a completed empty body from START/END and honors later authoritative content", () => {
    const state = applyChatProjectionEvents(createSessionStreamState(), [
      makeEvent("run.created", { run_id: "run" }, { run_id: "run" }),
      makeEvent("activity.updated", activity("a"), { run_id: "run" }),
      makeEvent("message.delta", { segment_id: "empty", delta: "", text_boundary: "start" }, { run_id: "run" }),
      makeEvent("message.delta", { segment_id: "empty", delta: "", text_boundary: "end" }, { run_id: "run" }),
      makeEvent("activity.updated", activity("b"), { run_id: "run" }),
    ])
    expect(groups(state).map((segment) => segment.activities.length)).toEqual([1, 0, 1])
    const corrected = applyChatProjectionEvents(state, [makeEvent("message.completed", { segment_id: "empty", content: "owner corrected body" }, { run_id: "run" })])
    expect(groups(corrected).map((segment) => segment.activities.length)).toEqual([1, 0, 1])
    expect(corrected.messages.find((message) => message.id === "empty")?.content).toBe("owner corrected body")
    expect(groups(readState(true, "late public content")).map((segment) => segment.activities.length)).toEqual([1, 0, 1, 0, 1])
  })
  it("does not upgrade END-only to a known empty body, but accepts an explicit empty whole-body completion", () => {
    const state = applyChatProjectionEvents(createSessionStreamState(), [
      makeEvent("run.created", { run_id: "run" }, { run_id: "run" }),
      makeEvent("activity.updated", activity("a"), { run_id: "run" }),
      makeEvent("message.delta", { segment_id: "empty", delta: "", text_boundary: "end" }, { run_id: "run" }),
      makeEvent("activity.updated", activity("b"), { run_id: "run" }),
    ])
    expect(groups(state).map((segment) => segment.activities.length)).toEqual([1, 0, 1])
    const confirmed = applyChatProjectionEvents(state, [makeEvent("message.completed", { segment_id: "empty", content: "" }, { run_id: "run" })])
    expect(groups(confirmed).map((segment) => segment.activities.length)).toEqual([2])
  })

})
