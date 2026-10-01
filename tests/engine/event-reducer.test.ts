import { describe, expect, it } from "vitest"

import { createSessionStreamState } from "@/core/state"
import { IDLE_MACHINE } from "@/engine/machine-state"
import {
  reconcileUserMessageId,
  reduceProjectionEvents,
} from "@/engine/event-reducer"

import { makeDispatchFailureEvent, makeEvent } from "../core/fixtures"

describe("engine event reducer", () => {
  it("按 event_id 幂等折叠，并保留乱序事件的 seq 顺序", () => {
    const late = makeEvent(
      "thinking.delta",
      { segment_id: "seg_late", delta: "late" },
      { seq: 7, event_id: "evt_late" },
    )
    const early = makeEvent(
      "thinking.delta",
      { segment_id: "seg_early", delta: "early" },
      { seq: 3, event_id: "evt_early" },
    )
    const duplicate = makeEvent(
      "thinking.delta",
      { segment_id: "seg_late", delta: "duplicate" },
      { seq: 7, event_id: "evt_late" },
    )

    const result = reduceProjectionEvents({
      thread: createSessionStreamState(),
      machine: { ...IDLE_MACHINE, phase: "streaming", runId: "run_1" },
      events: [late, early, duplicate],
    })

    expect(result.thread.seenEventIds).toEqual(new Set(["evt_late", "evt_early"]))
    expect(result.thread.lastSeq).toBe(7)
    expect(result.thread.stepsByRun.run_1?.map((step) => step.seq)).toEqual([3, 7])
    expect(result.machine.phase).toBe("streaming")
    expect(result.settledRunId).toBeNull()
  })

  it("只用当前 run 的终态收束重连相位", () => {
    const historicalTerminal = makeEvent(
      "run.completed",
      { status: "completed", token_usage: null },
      { run_id: "run_old", seq: 1, event_id: "evt_old_terminal" },
    )
    const activeTerminal = makeEvent(
      "run.completed",
      { status: "completed", token_usage: null },
      { run_id: "run_1", seq: 2, event_id: "evt_active_terminal" },
    )

    const result = reduceProjectionEvents({
      thread: createSessionStreamState(),
      machine: { ...IDLE_MACHINE, phase: "reattaching", runId: "run_1" },
      events: [historicalTerminal, activeTerminal],
    })

    expect(result.machine).toEqual(IDLE_MACHINE)
    expect(result.settledRunId).toBe("run_1")
  })

  it("BFF dispatch 终态保留任意精度 sourceSequence 且不推进 Agent lastSeq", () => {
    const sourceSequence = "9007199254740993123456789"
    const openTool = makeEvent(
      "tool.invoked",
      { segment_id: "seg_1", tool_id: "tool_1", name: "search", args: {} },
      { seq: 7, event_id: "evt_open_tool", session_id: "session-1", run_id: "run_1" },
    )
    const dispatchTerminal = makeDispatchFailureEvent(sourceSequence, {
      event_id: "agui_00000000000000000000000000000009",
      session_id: "session-1", run_id: "run_1", timestamp: "2026-09-02T12:00:00.000Z",
    })
    const result = reduceProjectionEvents({
      thread: createSessionStreamState(),
      machine: { ...IDLE_MACHINE, phase: "reattaching", runId: "run_1" },
      events: [openTool, dispatchTerminal],
    })
    expect(result.thread.lastSeq).toBe(7)
    expect(result.thread.runStatus).toBe("failed")
    expect(result.thread.runError).toEqual({ kind: "dispatch" })
    expect(result.machine).toEqual(IDLE_MACHINE)
    expect(result.settledRunId).toBe("run_1")
    expect(dispatchTerminal).toMatchObject({ sourceSequence })
    expect(result.thread.stepsByRun["run_1"]).toContainEqual(expect.objectContaining({
      kind: "tool",
      tool: expect.objectContaining({ id: "tool_1", status: "error" }),
    }))
  })

  it("历史 dispatch 终态不覆写当前 run 锚点、phase 或 failure", () => {
    const dispatchTerminal = makeDispatchFailureEvent("9007199254740993123456790", {
      event_id: "agui_0000000000000000000000000000000a",
      session_id: "session-1", run_id: "run_old", timestamp: "2026-09-02T12:00:00.000Z",
    })
    const result = reduceProjectionEvents({
      thread: { ...createSessionStreamState(), activeRunId: "run_new", lastSeq: 11 },
      machine: { ...IDLE_MACHINE, phase: "reattaching", runId: "run_new" },
      events: [dispatchTerminal],
    })
    expect(result.thread).toMatchObject({
      activeRunId: "run_new", lastSeq: 11, runStatus: "idle", runError: null,
    })
    expect(result.machine).toMatchObject({ phase: "reattaching", runId: "run_new" })
    expect(result.settledRunId).toBeNull()
  })

  it("把服务端回执 id 对齐到最后一个本地用户 echo", () => {
    const state = {
      ...createSessionStreamState(),
      messages: [
        { id: "msg_existing", role: "user" as const, content: "old", runId: "run_old" },
        { id: "usr_1", role: "user" as const, content: "hello", runId: "usr_1" },
      ],
    }

    const result = reconcileUserMessageId(state, "msg_new")

    expect(result.messages.map((message) => message.id)).toEqual(["msg_existing", "msg_new"])
    expect(result.messages[1]?.content).toBe("hello")
  })
})
