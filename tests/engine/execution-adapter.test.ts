import { describe, expect, it } from "vitest"

import type { ResumeDecision } from "@/contract/control"
import { createExecutionAdapter } from "@/engine/execution-adapter"

import { makeEvent } from "../core/fixtures"
import { createFakeClient, settle } from "./fakes"

describe("session execution adapter", () => {
  it("集中构造消息执行 wire，并保留 scope 与可选执行设置", async () => {
    const client = createFakeClient()
    const adapter = createExecutionAdapter({
      client,
      scope: { kind: "project", projectRef: "project_1" },
    })

    await adapter.createMessage({
      sessionId: "session_1",
      content: "整理计划",
      idempotencyKey: "idem_1",
      options: {
        mode: "thinking",
        model: "openai:gpt-5",
        agent: "planner",
        selectedSkillSourceRefs: ["skill:research.v1"],
      },
    })

    expect(client.createCalls).toEqual([
      {
        sessionId: "session_1",
        body: {
          idempotency_key: "idem_1",
          content: "整理计划",
          thinking: true,
          model: "openai:gpt-5",
          agent: "planner",
          selected_skill_source_refs: ["skill:research.v1"],
          project_ref: "project_1",
        },
      },
    ])
  })

  it("always sends an explicit empty typed Skill selection", async () => {
    const client = createFakeClient()
    const adapter = createExecutionAdapter({ client, scope: { kind: "direct" } })

    await adapter.createMessage({
      sessionId: "session_1",
      content: "hello",
      idempotencyKey: "idem_empty",
      options: { mode: "fast", model: null, agent: null, selectedSkillSourceRefs: [] },
    })

    expect(client.createCalls[0]?.body.selected_skill_source_refs).toEqual([])
  })

  it("关闭旧流后丢弃其迟到事件，只交付新流批次", async () => {
    const client = createFakeClient()
    const adapter = createExecutionAdapter({ client, scope: { kind: "direct" } })
    const batches: string[][] = []

    adapter.openStream("session_1", null, {
      onCursor: () => {},
      onEvents: (events) => {
        batches.push(events.map((event) => event.event_id))
      },
      onStreamError: () => {},
    })
    const oldStream = client.lastStream()
    oldStream.emit([makeEvent("message.delta", { segment_id: "seg_old", delta: "old" })])
    adapter.closeStream()

    adapter.openStream("session_1", null, {
      onCursor: () => {},
      onEvents: (events) => {
        batches.push(events.map((event) => event.event_id))
      },
      onStreamError: () => {},
    })
    oldStream.emit([makeEvent("message.delta", { segment_id: "seg_late", delta: "late" })])
    const newEvent = makeEvent("message.delta", { segment_id: "seg_new", delta: "new" })
    client.lastStream().emit([newEvent])
    await settle()

    expect(batches).toHaveLength(1)
    expect(batches[0]).toEqual([newEvent.event_id])
  })

  it("只把当前流的 reconnecting/connected 生命周期交给 engine", () => {
    const client = createFakeClient()
    const adapter = createExecutionAdapter({ client, scope: { kind: "direct" } })
    const lifecycle: string[] = []

    adapter.openStream("session_1", null, {
      onCursor: () => {},
      onEvents: () => {},
      onReconnecting: () => lifecycle.push("old-reconnecting"),
      onConnected: () => lifecycle.push("old-connected"),
      onStreamError: () => {},
    })
    const oldStream = client.lastStream()
    adapter.openStream("session_2", null, {
      onCursor: () => {},
      onEvents: () => {},
      onReconnecting: () => lifecycle.push("new-reconnecting"),
      onConnected: () => lifecycle.push("new-connected"),
      onStreamError: () => {},
    })

    oldStream.reconnecting()
    oldStream.connected()
    client.lastStream().reconnecting()
    client.lastStream().connected()

    expect(lifecycle).toEqual(["new-reconnecting", "new-connected"])
  })

  it("把 resume 与 cancel 统一送入带 command identity 的 control adapter", async () => {
    const client = createFakeClient()
    const adapter = createExecutionAdapter({ client, scope: { kind: "direct" } })
    const decisions: ResumeDecision[] = [{ type: "approve", item_id: "tool_1" }]

    await adapter.resumeRun({
      sessionId: "session_1",
      runId: "run_1",
      decisions,
      commandId: "command_resume",
      expectedPauseRevision: 1, pauseRef: "pause_1",
    })
    await adapter.cancelRun({
      sessionId: "session_1",
      runId: "run_1",
      commandId: "command_cancel",
    })

    expect(client.controlCalls).toEqual([
      {
        sessionId: "session_1",
        runId: "run_1",
        commandId: "command_resume",
        body: {
          kind: "run.resume",
          expected_pause_revision: 1, pause_ref: "pause_1",
          decisions,
        },
      },
      {
        sessionId: "session_1",
        runId: "run_1",
        commandId: "command_cancel",
        body: { kind: "run.cancel" },
      },
    ])
  })
})


import {
  makePublic4Decisions as r66Decisions,
  makePublic4Resume as r66Resume,
} from "../core/fixtures"

describe("R66 public4 exact control adapter", () => {
  it("sends all five item decisions with exact pause locators and no public session_id", async () => {
    const client = createFakeClient()
    const adapter = createExecutionAdapter({ client, scope: { kind: "direct" } })
    // Reflect invokes the current runtime export with legal future-shaped input.
    // It avoids importing a new type/export, not the HTTP behavior being asserted.
    await Reflect.apply(adapter.resumeRun, adapter, [{
      sessionId: "conv_9", runId: "run_1", commandId: "command_r66",
      expectedPauseRevision: 2, pauseRef: "pause_r66_2", decisions: r66Decisions(),
    }])
    expect(client.controlCalls).toHaveLength(1)
    expect(client.controlCalls[0]).toEqual({
      sessionId: "conv_9", runId: "run_1", commandId: "command_r66", body: r66Resume(),
    })
  })

  it("keeps Stop's trusted path identity outside the kind-only public cancel body", async () => {
    const client = createFakeClient()
    const adapter = createExecutionAdapter({ client, scope: { kind: "direct" } })
    await adapter.cancelRun({ sessionId: "conv_9", runId: "run_1", commandId: "cancel_r66" })
    expect(client.controlCalls[0]).toEqual({
      sessionId: "conv_9", runId: "run_1", commandId: "cancel_r66",
      body: { kind: "run.cancel" },
    })
  })
})
