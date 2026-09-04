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
        pinnedSkills: ["research"],
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
          pinned_skills: ["research"],
          project_ref: "project_1",
        },
      },
    ])
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

  it("把 resume 与 cancel 统一送入带 command identity 的 control adapter", async () => {
    const client = createFakeClient()
    const adapter = createExecutionAdapter({ client, scope: { kind: "direct" } })
    const decisions: ResumeDecision[] = [{ type: "approve", tool_id: "tool_1" }]

    await adapter.resumeRun({
      sessionId: "session_1",
      runId: "run_1",
      decisions,
      commandId: "command_resume",
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
          session_id: "session_1",
          decisions,
        },
      },
      {
        sessionId: "session_1",
        runId: "run_1",
        commandId: "command_cancel",
        body: { kind: "run.cancel", session_id: "session_1" },
      },
    ])
  })
})
