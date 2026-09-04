import { describe, expect, it } from "vitest"

import { createSessionStreamState } from "@/core/state"
import { IDLE_MACHINE } from "@/engine/machine-state"
import {
  reconcileUserMessageId,
  reduceProjectionEvents,
} from "@/engine/event-reducer"

import { makeEvent } from "../core/fixtures"

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
