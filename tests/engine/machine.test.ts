import { describe, expect, it, vi } from "vitest"

import { addConversation, type ConversationStore } from "@/core/conversations"
import {
  IDLE_MACHINE,
  createSessionEngine,
  transition,
  type MachineEvent,
  type MachineState,
} from "@/engine/machine"
import { ConversationMoveError } from "@/engine/conversation-move-error"

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

describe("R170 ACK-gated Conversation Move intent", () => {
  const conversationId = "conv_11111111-1111-4111-8111-111111111111"
  const projectA = "project_22222222-2222-4222-8222-222222222222"
  const projectB = "project_33333333-3333-4333-8333-333333333333"
  type MoveResult = Readonly<{
    status: "confirmed" | "rejected" | "unknown" | "superseded"
    sessionId: string
    targetProjectId: string | null
    commandId: string
  }>
  type MoveEngine = {
    moveConversation: (input: Readonly<{
      sessionId: string
      targetProjectId: string | null
    }>) => Promise<MoveResult>
    retryConversationMove: () => Promise<MoveResult | null>
  }

  function requiredMoveEngine(engine: ReturnType<typeof createSessionEngine>): MoveEngine {
    const candidate = engine as unknown as Partial<MoveEngine>
    expect(candidate.moveConversation).toBeTypeOf("function")
    expect(candidate.retryConversationMove).toBeTypeOf("function")
    return candidate as MoveEngine
  }

  it("keeps the active projection unchanged until one matching ACK confirms the frozen intent", async () => {
    const client = createFakeClient()
    const storage = createMemoryStorage<ConversationStore>(addConversation(null, conversationId, 1_000))
    let resolveMove: ((receipt: { session_id: string; project_ref: string | null }) => void) | undefined
    const moveSession = vi.fn<typeof client.moveSession>((input) => {
      void input
      return new Promise<{ session_id: string; project_ref: string | null }>((resolve) => {
        resolveMove = resolve
      })
    })
    client.moveSession = moveSession
    const engine = createSessionEngine({
      client,
      storage,
      scope: { kind: "direct" },
      now: () => 1_000,
      createId: () => "move:intent-fixed",
    })
    await settle()
    const before = engine.getSnapshot()
    const operation = requiredMoveEngine(engine).moveConversation({
      sessionId: conversationId,
      targetProjectId: projectA,
    })
    expect(moveSession).toHaveBeenCalledTimes(1)
    expect(moveSession).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: conversationId,
      targetProjectId: projectA,
      commandId: "move:intent-fixed",
    }))
    expect(engine.getSnapshot().store).toBe(before.store)
    expect(engine.getSnapshot().thread).toBe(before.thread)
    resolveMove?.({ session_id: conversationId, project_ref: projectA })
    await expect(operation).resolves.toMatchObject({ status: "confirmed", commandId: "move:intent-fixed" })
    expect(storage.read()?.activeId).toBe(conversationId)
    expect(storage.read()?.conversations.map((entry) => entry.id)).toContain(conversationId)
    engine.dispose()
    expect(storage.read()?.conversations.map((entry) => entry.id)).not.toContain(conversationId)
  })

  it("evicts a confirmed non-active Move from only the source-scope cache", async () => {
    const otherConversationId = "conv_44444444-4444-4444-8444-444444444444"
    const client = createFakeClient()
    const storage = createMemoryStorage<ConversationStore>(
      addConversation(addConversation(null, conversationId, 1_000), otherConversationId, 2_000),
    )
    client.moveSession = vi.fn().mockResolvedValue({ session_id: conversationId, project_ref: projectA })
    const engine = createSessionEngine({
      client,
      storage,
      now: () => 3_000,
      createId: () => "move:non-active",
    })
    await settle()

    await expect(requiredMoveEngine(engine).moveConversation({ sessionId: conversationId, targetProjectId: projectA }))
      .resolves.toMatchObject({ status: "confirmed", commandId: "move:non-active" })
    expect(storage.read()?.activeId).toBe(otherConversationId)
    expect(storage.read()?.conversations.map((entry) => entry.id)).toEqual([otherConversationId])
    engine.dispose()
  })

  it("keeps a matching non-active owner ACK confirmed when source-cache persistence throws", async () => {
    const otherConversationId = "conv_55555555-5555-4555-8555-555555555555"
    const initial = addConversation(addConversation(null, conversationId, 1_000), otherConversationId, 2_000)
    const persisted: ConversationStore | null = initial
    const client = createFakeClient()
    client.moveSession = vi.fn().mockResolvedValue({ session_id: conversationId, project_ref: projectA })
    const engine = createSessionEngine({
      client,
      storage: {
        read: () => persisted,
        write: () => { throw new Error("fixture source cache write failed") },
        subscribe: () => () => undefined,
      },
      now: () => 3_000,
      createId: () => "move:write-failure",
    })
    await settle()

    await expect(requiredMoveEngine(engine).moveConversation({ sessionId: conversationId, targetProjectId: projectA }))
      .resolves.toMatchObject({ status: "confirmed", commandId: "move:write-failure" })
    expect(engine.getSnapshot().conversationMove).toBeNull()
    await expect(requiredMoveEngine(engine).retryConversationMove()).resolves.toBeNull()
    expect(persisted?.conversations.map((entry) => entry.id)).toContain(conversationId)
    engine.dispose()
  })

  it("finishes disposal after an active confirmed Move even when source-cache persistence throws", async () => {
    const initial = addConversation(null, conversationId, 1_000)
    const unsubscribe = vi.fn()
    const client = createFakeClient()
    client.moveSession = vi.fn().mockResolvedValue({ session_id: conversationId, project_ref: projectA })
    const engine = createSessionEngine({
      client,
      storage: {
        read: () => initial,
        write: () => { throw new Error("fixture dispose cache write failed") },
        subscribe: () => unsubscribe,
      },
      now: () => 2_000,
      createId: () => "move:dispose-write-failure",
    })
    await settle()
    await expect(requiredMoveEngine(engine).moveConversation({ sessionId: conversationId, targetProjectId: projectA }))
      .resolves.toMatchObject({ status: "confirmed", commandId: "move:dispose-write-failure" })

    expect(() => engine.dispose()).not.toThrow()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    await expect(requiredMoveEngine(engine).moveConversation({ sessionId: conversationId, targetProjectId: projectA }))
      .resolves.toMatchObject({ status: "superseded" })
    expect(client.moveSession).toHaveBeenCalledTimes(1)
  })

  it("keeps an unknown intent and retries the exact body and key only when asked", async () => {
    const client = createFakeClient()
    const storage = createMemoryStorage<ConversationStore>(addConversation(null, conversationId, 1_000))
    const moveSession = vi.fn()
      .mockRejectedValueOnce(new ConversationMoveError({ kind: "network" }))
      .mockResolvedValueOnce({ session_id: conversationId, project_ref: null })
    client.moveSession = moveSession
    const engine = createSessionEngine({
      client,
      storage,
      scope: { kind: "project", projectRef: projectA },
      now: () => 1_000,
      createId: () => "move:retry-fixed",
    })
    await settle()
    const move = requiredMoveEngine(engine)
    await expect(move.moveConversation({ sessionId: conversationId, targetProjectId: null }))
      .resolves.toMatchObject({ status: "unknown", commandId: "move:retry-fixed" })
    expect(storage.read()?.conversations.map((entry) => entry.id)).toContain(conversationId)
    await expect(move.retryConversationMove())
      .resolves.toMatchObject({ status: "confirmed", commandId: "move:retry-fixed" })
    expect(moveSession).toHaveBeenCalledTimes(2)
    expect(moveSession.mock.calls[1]?.[0]).toEqual(moveSession.mock.calls[0]?.[0])
    engine.dispose()
  })

  it("coalesces repeated clicks and rejects a competing target without changing the frozen key", async () => {
    const client = createFakeClient()
    const storage = createMemoryStorage<ConversationStore>(addConversation(null, conversationId, 1_000))
    let resolveMove: ((receipt: { session_id: string; project_ref: string | null }) => void) | undefined
    const moveSession = vi.fn<typeof client.moveSession>((input) => {
      void input
      return new Promise<{ session_id: string; project_ref: string | null }>((resolve) => {
        resolveMove = resolve
      })
    })
    client.moveSession = moveSession
    const engine = createSessionEngine({ client, storage, createId: () => "move:singleflight" })
    await settle()
    const move = requiredMoveEngine(engine)
    const first = move.moveConversation({ sessionId: conversationId, targetProjectId: projectA })
    const repeated = move.moveConversation({ sessionId: conversationId, targetProjectId: projectA })
    const competing = move.moveConversation({ sessionId: conversationId, targetProjectId: projectB })
    expect(moveSession).toHaveBeenCalledTimes(1)
    resolveMove?.({ session_id: conversationId, project_ref: projectA })
    await expect(first).resolves.toMatchObject({ status: "confirmed", commandId: "move:singleflight" })
    await expect(repeated).resolves.toMatchObject({ status: "confirmed", commandId: "move:singleflight" })
    await expect(competing).resolves.toMatchObject({ status: "rejected" })
    expect(moveSession.mock.calls[0]?.[0]).toMatchObject({ commandId: "move:singleflight", targetProjectId: projectA })
    engine.dispose()
  })

  it("keeps owner rejection projection-neutral and never retries automatically", async () => {
    const client = createFakeClient()
    const storage = createMemoryStorage<ConversationStore>(addConversation(null, conversationId, 1_000))
    const moveSession = vi.fn().mockRejectedValue(new ConversationMoveError({
      kind: "owner",
      status: 409,
      code: "idempotency_conflict",
      retryable: false,
      requestId: "req_conflict",
      retryAfter: null,
    }))
    client.moveSession = moveSession
    const engine = createSessionEngine({ client, storage, createId: () => "move:rejected" })
    await settle()
    const before = engine.getSnapshot()
    await expect(requiredMoveEngine(engine).moveConversation({ sessionId: conversationId, targetProjectId: projectA }))
      .resolves.toMatchObject({ status: "rejected", commandId: "move:rejected" })
    expect(moveSession).toHaveBeenCalledTimes(1)
    expect(engine.getSnapshot().store).toBe(before.store)
    expect(engine.getSnapshot().thread).toBe(before.thread)
    expect(storage.read()?.conversations.map((entry) => entry.id)).toContain(conversationId)
    engine.dispose()
  })

  it("keeps a matching late ACK confirmed after an active switch and evicts only its source row", async () => {
    const otherConversation = "conv_22222222-2222-4222-8222-222222222222"
    const initial = addConversation(addConversation(null, conversationId, 1_000), otherConversation, 2_000)
    const storage = createMemoryStorage<ConversationStore>(initial)
    const client = createFakeClient()
    let resolveMove: ((receipt: { session_id: string; project_ref: string | null }) => void) | undefined
    client.moveSession = vi.fn<typeof client.moveSession>((input) => {
      void input
      return new Promise<{ session_id: string; project_ref: string | null }>((resolve) => { resolveMove = resolve })
    })
    const engine = createSessionEngine({ client, storage, createId: () => "move:late-active" })
    await settle()
    engine.selectConversation(conversationId)
    const operation = requiredMoveEngine(engine).moveConversation({ sessionId: conversationId, targetProjectId: projectA })
    engine.selectConversation(otherConversation)
    resolveMove?.({ session_id: conversationId, project_ref: projectA })

    await expect(operation).resolves.toMatchObject({ status: "confirmed", commandId: "move:late-active" })
    expect(engine.getSnapshot().store?.activeId).toBe(otherConversation)
    expect(engine.getSnapshot().store?.conversations.map((entry) => entry.id)).toContain(otherConversation)
    expect(engine.getSnapshot().store?.conversations.map((entry) => entry.id)).not.toContain(conversationId)
    expect(engine.getSnapshot().conversationMove).toBeNull()
    engine.dispose()
  })

  it("still fences a matching ACK after engine disposal", async () => {
    const client = createFakeClient()
    const storage = createMemoryStorage<ConversationStore>(addConversation(null, conversationId, 1_000))
    let resolveMove: ((receipt: { session_id: string; project_ref: string | null }) => void) | undefined
    client.moveSession = vi.fn<typeof client.moveSession>(() =>
      new Promise<{ session_id: string; project_ref: string | null }>((resolve) => { resolveMove = resolve }))
    const engine = createSessionEngine({ client, storage, createId: () => "move:late-disposed" })
    await settle()
    const before = engine.getSnapshot()
    const operation = requiredMoveEngine(engine).moveConversation({ sessionId: conversationId, targetProjectId: projectA })
    engine.dispose()
    resolveMove?.({ session_id: conversationId, project_ref: projectA })
    await expect(operation).resolves.toMatchObject({ status: "superseded", commandId: "move:late-disposed" })
    expect(engine.getSnapshot().store).toBe(before.store)
  })

  it.each([
    [503, "business_store_unavailable"],
    [503, "iam_admission_unavailable"],
    [409, "idempotency_in_progress"],
  ] as const)("keeps typed %s %s owner outcomes unknown with the original command", async (status, code) => {
    const client = createFakeClient()
    const storage = createMemoryStorage<ConversationStore>(addConversation(null, conversationId, 1_000))
    client.moveSession = vi.fn().mockRejectedValue(new ConversationMoveError({
      kind: "owner", status, code, retryable: true, requestId: `req-${status}-${code}`, retryAfter: null,
    }))
    const engine = createSessionEngine({ client, storage, createId: () => "move:typed-unknown" })
    await settle()
    await expect(requiredMoveEngine(engine).moveConversation({ sessionId: conversationId, targetProjectId: projectA }))
      .resolves.toMatchObject({ status: "unknown", commandId: "move:typed-unknown" })
    expect(engine.getSnapshot().conversationMove).toMatchObject({
      sessionId: conversationId, targetProjectId: projectA, commandId: "move:typed-unknown", status: "unknown",
    })
    engine.dispose()
  })

  it("retains an obsolete unknown result for an exact same-key retry without blocking the new active conversation", async () => {
    const otherConversation = "conv_22222222-2222-4222-8222-222222222222"
    const initial = addConversation(addConversation(null, conversationId, 1_000), otherConversation, 2_000)
    const storage = createMemoryStorage<ConversationStore>(initial)
    const client = createFakeClient()
    let rejectFirst: ((error: unknown) => void) | undefined
    const moveSession = vi.fn<typeof client.moveSession>((input) => {
      if (rejectFirst === undefined) {
        return new Promise((_resolve, reject) => { rejectFirst = reject })
      }
      return Promise.resolve({ session_id: input.sessionId, project_ref: input.targetProjectId })
    })
    client.moveSession = moveSession
    const engine = createSessionEngine({ client, storage, createId: () => "move:unknown-after-switch" })
    await settle()
    engine.selectConversation(conversationId)
    await settle()
    const move = requiredMoveEngine(engine)
    const operation = move.moveConversation({ sessionId: conversationId, targetProjectId: projectA })
    engine.selectConversation(otherConversation)
    rejectFirst?.(new ConversationMoveError({ kind: "network" }))

    await expect(operation).resolves.toMatchObject({ status: "superseded", commandId: "move:unknown-after-switch" })
    expect(engine.getSnapshot().store?.activeId).toBe(otherConversation)
    expect(engine.getSnapshot().conversationMove).toMatchObject({
      sessionId: conversationId,
      targetProjectId: projectA,
      commandId: "move:unknown-after-switch",
      status: "unknown",
    })
    await expect(move.retryConversationMove()).resolves.toMatchObject({ status: "confirmed" })
    expect(moveSession).toHaveBeenCalledTimes(2)
    expect(moveSession.mock.calls[1]?.[0]).toEqual(moveSession.mock.calls[0]?.[0])
    expect(engine.getSnapshot().store?.activeId).toBe(otherConversation)
    engine.dispose()
  })

  it("returns null when retry is requested without a retained unknown intent", async () => {
    const client = createFakeClient()
    client.moveSession = vi.fn(client.moveSession)
    const storage = createMemoryStorage<ConversationStore>(addConversation(null, conversationId, 1_000))
    const engine = createSessionEngine({ client, storage })
    await settle()
    await expect(requiredMoveEngine(engine).retryConversationMove()).resolves.toBeNull()
    expect(client.moveSession).not.toHaveBeenCalled()
    engine.dispose()
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
