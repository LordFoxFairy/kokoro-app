import { describe, expect, it } from "vitest"

import { addConversation, type ConversationStore } from "@/core/conversations"
import {
  IDLE_MACHINE,
  createSessionEngine,
  transition,
  type MachineEvent,
  type MachineState,
} from "@/engine/machine"

import { AGENT_FAILURE_PROFILES, makeFailedSnapshot, makeSnapshot } from "../core/fixtures"
import { createFakeClient, createMemoryStorage, settle } from "./fakes"

function state(partial: Partial<MachineState>): MachineState {
  return { ...IDLE_MACHINE, ...partial }
}

describe("transition 全迁移矩阵", () => {
  it.each<[string, MachineState, MachineEvent, Partial<MachineState> | "identity"]>([
    // 提交链路
    ["idle 提交", IDLE_MACHINE, { type: "SUBMIT" }, { phase: "submitting" }],
    ["error 可重新提交", state({ phase: "error", error: "x" }), { type: "SUBMIT" }, { phase: "submitting", error: null }],
    ["submitting 双发被拒", state({ phase: "submitting" }), { type: "SUBMIT" }, "identity"],
    ["streaming 双发被拒", state({ phase: "streaming", runId: "r1" }), { type: "SUBMIT" }, "identity"],
    ["waiting 双发被拒", state({ phase: "waiting", runId: "r1" }), { type: "SUBMIT" }, "identity"],
    ["回执仅锚定 admission runId", state({ phase: "submitting" }), { type: "RECEIPT", runId: "r1" }, { phase: "queued", runId: "r1" }],
    ["非 submitting 的迟到回执被拒", state({ phase: "streaming", runId: "r1" }), { type: "RECEIPT", runId: "r2" }, "identity"],
    // 重连链路
    ["idle 进入重连", IDLE_MACHINE, { type: "REATTACH", runId: "r1", state: "active" }, { phase: "streaming", runId: "r1" }],
    ["snapshot 带 pending pause：重连直接落 waiting", IDLE_MACHINE, { type: "REATTACH", runId: "r1", state: "waiting" }, { phase: "waiting", runId: "r1" }],
    ["流式中不可重连", state({ phase: "streaming", runId: "r1" }), { type: "REATTACH", runId: "r2", state: "active" }, "identity"],
    ["连接恢复不替代 owner execution phase", state({ phase: "streaming", runId: "r1" }), { type: "STREAM_EVENT", runId: "r1", kind: "message.delta" }, "identity"],
    ["重连中历史 run 事件不退出重连", state({ phase: "streaming", runId: "r1" }), { type: "STREAM_EVENT", runId: "r_old", kind: "message.delta" }, "identity"],
    ["连接兜底超时不制造 owner 终态", state({ phase: "streaming", runId: "r1" }), { type: "TIMEOUT" }, "identity"],
    ["idle 忽略超时", IDLE_MACHINE, { type: "TIMEOUT" }, "identity"],
    // runId 锚定收束
    ["本轮终态收束", state({ phase: "streaming", runId: "r1" }), { type: "STREAM_EVENT", runId: "r1", kind: "run.completed" }, { phase: "idle", runId: null }],
    ["历史 run 终态不收束", state({ phase: "streaming", runId: "r1" }), { type: "STREAM_EVENT", runId: "r_old", kind: "run.completed" }, "identity"],
    ["run.failed 同样收束", state({ phase: "streaming", runId: "r1" }), { type: "STREAM_EVENT", runId: "r1", kind: "run.failed" }, { phase: "idle" }],
    ["waiting 的本轮终态强制收束", state({ phase: "waiting", runId: "r1" }), { type: "STREAM_EVENT", runId: "r1", kind: "run.completed" }, { phase: "idle" }],
    // HITL
    ["待批事件进入 waiting", state({ phase: "streaming", runId: "r1" }), { type: "STREAM_EVENT", runId: "r1", kind: "interaction.state", interactionPhase: "waiting" }, { phase: "waiting", runId: "r1" }],
    ["重连直接落在待批帧", state({ phase: "streaming", runId: "r1" }), { type: "STREAM_EVENT", runId: "r1", kind: "interaction.state", interactionPhase: "waiting" }, { phase: "waiting" }],
    ["重复待批事件保持相位", state({ phase: "waiting", runId: "r1" }), { type: "STREAM_EVENT", runId: "r1", kind: "interaction.state", interactionPhase: "waiting" }, "identity"],
    ["resume HTTP receipt 保持 waiting", state({ phase: "waiting", runId: "r1" }), { type: "RESUME_SENT" }, "identity"],
    ["非待批相位忽略 resume", state({ phase: "streaming", runId: "r1" }), { type: "RESUME_SENT" }, "identity"],
    ["control 失败原相位记错误", state({ phase: "waiting", runId: "r1" }), { type: "CONTROL_FAILED", error: "500" }, { phase: "waiting", runId: "r1", error: "500" }],
    // 错误与复位
    ["任意相位失败进错误态", state({ phase: "streaming", runId: "r1" }), { type: "FAIL", error: "boom" }, { phase: "error", runId: null, error: "boom" }],
    ["复位回 idle", state({ phase: "error", error: "boom" }), { type: "RESET" }, { phase: "idle", error: null }],
    ["idle 复位返回同一引用", IDLE_MACHINE, { type: "RESET" }, "identity"],
    ["idle 相位忽略流事件", IDLE_MACHINE, { type: "STREAM_EVENT", runId: "r1", kind: "message.delta" }, "identity"],
  ])("%s", (_label, before, event, expected) => {
    const after = transition(before, event)
    if (expected === "identity") {
      expect(after).toBe(before)
      return
    }
    expect(after).toMatchObject(expected)
  })

  it("同步双发守卫：第二次 SUBMIT 返回入参引用", () => {
    const first = transition(IDLE_MACHINE, { type: "SUBMIT" })
    const second = transition(first, { type: "SUBMIT" })
    expect(first.phase).toBe("submitting")
    expect(second).toBe(first)
  })
})

describe("failed snapshot hydration", () => {
  const cursor = "agui_0000000000000000000000000000002a"

  it.each(AGENT_FAILURE_PROFILES)(
    "keeps $code retryable=$retryable identical across same-watermark reload without resubmitting user text",
    async (profile) => {
    const client = createFakeClient()
    const storage = createMemoryStorage<ConversationStore>(addConversation(null, "conv_1", 1_000))
    client.nextSnapshot = () => Promise.resolve(makeFailedSnapshot(profile, { eventWatermark: cursor }))
    const first = createSessionEngine({ client, storage, now: () => 1_000, createId: (prefix) => `${prefix}_first` })
    await settle()
    expect(first.getSnapshot().thread).toMatchObject({
      runStatus: "failed",
      runFailuresById: { run_failed: { failedRunId: "run_failed", kind: "agent", profile } },
      resumeCursor: cursor,
    })
    expect(client.createCalls).toHaveLength(0)
    expect(first.getSnapshot().connection).toEqual({ status: "connected" })
    expect(client.streams).toHaveLength(0)
    first.dispose()

    const second = createSessionEngine({ client, storage, now: () => 2_000, createId: (prefix) => `${prefix}_second` })
    await settle()
    expect(second.getSnapshot().thread).toMatchObject({
      runStatus: "failed",
      runFailuresById: { run_failed: { failedRunId: "run_failed", kind: "agent", profile } },
      resumeCursor: cursor,
    })
    expect(client.createCalls).toHaveLength(0)
    second.retry()
    await settle()
    expect(client.createCalls).toHaveLength(0)
    second.dispose()
    },
  )

  it("does not resubmit the original user for a generic failed snapshot", async () => {
    const client = createFakeClient()
    const storage = createMemoryStorage<ConversationStore>(addConversation(null, "conv_1", 1_000))
    client.nextSnapshot = () => Promise.resolve(makeFailedSnapshot(null, { eventWatermark: cursor }))
    const engine = createSessionEngine({ client, storage, now: () => 1_000,
      createId: (prefix) => `${prefix}_generic_user` })
    await settle()
    expect(engine.getSnapshot().thread).toMatchObject({
      runStatus: "failed",
      runFailuresById: { run_failed: { failedRunId: "run_failed", kind: "generic" } },
      resumeCursor: cursor,
    })
    expect(engine.getSnapshot().thread.messages).toContainEqual(expect.objectContaining({
      role: "user", content: "retry me",
    }))
    engine.retry()
    await settle()
    expect(client.createCalls).toHaveLength(0)
    engine.dispose()
  })

  it("does not fabricate a retry prompt when failed history has no user message", async () => {
    const client = createFakeClient()
    const storage = createMemoryStorage<ConversationStore>(addConversation(null, "conv_1", 1_000))
    client.nextSnapshot = () => Promise.resolve(makeSnapshot({
      messages: [{ message_id: "assistant_1", role: "assistant", run_id: "run_failed", content: "partial",
        status: "failed", created_at: "2026-07-02T00:00:01Z" }], eventWatermark: cursor,
    }))
    const engine = createSessionEngine({ client, storage, now: () => 1_000,
      createId: (prefix) => `${prefix}_missing_user` })
    await settle()
    expect(engine.getSnapshot().thread.runFailuresById.run_failed).toEqual({
      failedRunId: "run_failed", kind: "generic",
    })
    expect(client.createCalls).toHaveLength(0)
    engine.retry()
    await settle()
    expect(client.createCalls).toHaveLength(0)
    engine.dispose()
  })
})
