import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { addConversation, type ConversationStore } from "@/core/conversations"
import { SessionClientError } from "@/engine/client"
import { createSessionEngine, type SessionEngine } from "@/engine/machine"
import type { SessionScope } from "@/engine/session-scope"
import type { RunControlReceipt } from "@/contract/http"

import {
  AGENT_FAILURE_PROFILES,
  makeInteractionState,
  makeAgentFailureEvent,
  makeEvent,
  makeDispatchFailureEvent,
  makeDeliveryPayload,
  makePendingPause,
  makeSnapshot,
  makeSnapshotDelivery,
  resetFixtureSeq,
} from "../core/fixtures"
import {
  createFakeClient,
  createMemoryStorage,
  makeReceipt,
  settle,
  type FakeClient,
} from "./fakes"

let client: FakeClient
let storage: ReturnType<typeof createMemoryStorage<ConversationStore>>
let engine: SessionEngine

const CURSOR_3 = "agui_00000000000000000000000000000003"
const CURSOR_7 = "agui_00000000000000000000000000000007"
const CURSOR_12 = "agui_0000000000000000000000000000000c"
const CURSOR_20 = "agui_00000000000000000000000000000014"
const CURSOR_30 = "agui_0000000000000000000000000000001e"

function buildEngine(initial: ConversationStore | null = null, reattachTimeoutMs?: number, scope?: SessionScope) {
  client = createFakeClient()
  storage = createMemoryStorage<ConversationStore>(initial)
  let idCounter = 0
  engine = createSessionEngine({
    client,
    storage,
    now: () => 1_000,
    createId: (prefix) => `${prefix}_${(idCounter += 1)}`,
    ...(reattachTimeoutMs !== undefined ? { reattachTimeoutMs } : {}),
    ...(scope !== undefined ? { scope } : {}),
  })
  return engine
}

beforeEach(resetFixtureSeq)
afterEach(() => {
  engine.dispose()
})

function thread() {
  return engine.getSnapshot().thread
}

function activeEntry() {
  const store = engine.getSnapshot().store
  if (!store) {
    throw new Error("no store")
  }
  const entry = store.conversations.find((candidate) => candidate.id === store.activeId)
  if (!entry) {
    throw new Error("no active entry")
  }
  return entry
}

describe("提交链路", () => {
  it("首次提交：建会话、POST 契约体（idempotency_key）、回执锚定、事件折叠、终态收束", async () => {
    buildEngine()
    engine.submit("  hello agent  ")
    // 用户消息即时落地（不等回执）。
    expect(thread().messages).toMatchObject([{ role: "user", content: "hello agent" }])
    await settle()

    expect(client.createCalls).toHaveLength(1)
    expect(client.createCalls[0]).toEqual({
      sessionId: "conv_1",
      body: { idempotency_key: "idem_3", content: "hello agent", thinking: false, selected_skill_source_refs: [] },
    })
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "queued", runId: "run_1" })
    expect(client.lastStream()).toMatchObject({ sessionId: "conv_1", resumeCursor: null })

    client.lastStream().emit([
      makeEvent("run.created", { run_id: "run_1" }),
      makeEvent("message.delta", { segment_id: "seg_1", delta: "hi " }),
      makeEvent("message.delta", { segment_id: "seg_1", delta: "there" }),
      makeEvent("run.completed", { status: "completed" }),
    ])
    await settle()

    expect(engine.getSnapshot().machine.phase).toBe("idle")
    expect(thread().messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "hi there",
    })
    expect(client.lastStream().closed).toBe(true)
    // 列表索引落盘（标题回退派生自首条用户消息）。
    expect(storage.writes.length).toBeGreaterThan(0)
    expect(activeEntry()).toMatchObject({ id: "conv_1", title: "hello agent" })
  })

  it("uses the terminal AG-UI cursor when opening the next run", async () => {
    buildEngine()
    engine.submit("first")
    await settle()
    client.lastStream().emit(
      [makeEvent("run.created", { run_id: "run_1" }), makeEvent("run.completed", { status: "completed" })],
      [CURSOR_3, CURSOR_7],
    )
    await settle()

    engine.submit("second")
    await settle()

    expect(client.lastStream()).toMatchObject({
      sessionId: "conv_1",
      resumeCursor: CURSOR_7,
    })
  })

  it("A 提交取消后 B 正在提交时，A 的迟到拒绝不污染 B", async () => {
    buildEngine()
    let rejectA!: (reason?: unknown) => void
    let resolveB!: (receipt: ReturnType<typeof makeReceipt>) => void
    client.nextCreate = () => new Promise((resolve, reject) => {
      if (client.createCalls.length === 1) {
        rejectA = reject
      } else {
        resolveB = resolve
      }
    })

    engine.submit("submission A")
    engine.newConversation()
    engine.submit("submission B")
    const bSessionId = client.createCalls[1]?.sessionId
    expect(engine.getSnapshot().machine.phase).toBe("submitting")

    rejectA(new Error("late A rejection"))
    await settle()

    expect(engine.getSnapshot().machine.phase).toBe("submitting")
    expect(engine.getSnapshot().machine.error).toBeNull()
    expect(thread().messages.at(-1)).toMatchObject({ role: "user", content: "submission B" })

    resolveB(makeReceipt("run_b"))
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "queued", runId: "run_b" })
    expect(client.lastStream().sessionId).toBe(bSessionId)
  })

  it("同会话 A cancelRun 后 B 正在提交时，A 的迟到拒绝不污染 B", async () => {
    buildEngine()
    let rejectA!: (reason?: unknown) => void
    let resolveB!: (receipt: ReturnType<typeof makeReceipt>) => void
    client.nextCreate = () => new Promise((resolve, reject) => {
      if (client.createCalls.length === 1) {
        rejectA = reject
      } else {
        resolveB = resolve
      }
    })

    engine.submit("submission A")
    engine.cancelRun()
    engine.submit("submission B")
    expect(client.createCalls[0]?.sessionId).toBe(client.createCalls[1]?.sessionId)
    expect(engine.getSnapshot().machine.phase).toBe("submitting")

    rejectA(new Error("late A rejection"))
    await settle()

    expect(engine.getSnapshot().machine.phase).toBe("submitting")
    expect(engine.getSnapshot().machine.error).toBeNull()
    expect(thread().messages.at(-1)).toMatchObject({ role: "user", content: "submission B" })

    resolveB(makeReceipt("run_b"))
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "queued", runId: "run_b" })
    expect(client.lastStream()).toMatchObject({ sessionId: client.createCalls[1]?.sessionId })
  })

  it("同会话 A 回执跨 S→T→S 迟到时，不得清除 B 或开启 A 的流", async () => {
    buildEngine({
      activeId: "session_s",
      conversations: [
        { id: "session_s", title: "S", updatedAt: 2, mode: "fast" },
        { id: "session_t", title: "T", updatedAt: 1, mode: "fast" },
      ],
    })
    await settle()
    let resolveA!: (receipt: ReturnType<typeof makeReceipt>) => void
    let resolveB!: (receipt: ReturnType<typeof makeReceipt>) => void
    client.nextCreate = () => new Promise((resolve) => {
      if (client.createCalls.length === 1) {
        resolveA = resolve
      } else {
        resolveB = resolve
      }
    })

    engine.submit("submission A")
    engine.selectConversation("session_t")
    await settle()
    engine.selectConversation("session_s")
    await settle()
    engine.submit("submission B")
    expect(engine.getSnapshot().machine.phase).toBe("submitting")

    resolveA(makeReceipt("run_a"))
    await settle()

    expect(engine.getSnapshot().machine.phase).toBe("submitting")
    expect(client.streams).toHaveLength(0)
    expect(thread().messages.at(-1)).toMatchObject({ role: "user", content: "submission B" })

    resolveB(makeReceipt("run_b"))
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "queued", runId: "run_b" })
    expect(client.lastStream()).toMatchObject({ sessionId: "session_s" })
  })

  it("专案会话的每次消息均携带不透明 project_ref", async () => {
    buildEngine(null, undefined, { kind: "project", projectRef: "project_kokoro" })
    engine.submit("梳理专案需求")
    await settle()
    expect(client.createCalls[0]!.body).toMatchObject({
      content: "梳理专案需求",
      project_ref: "project_kokoro",
    })
  })

  it("session.created 的服务端标题盖过本地派生标题", async () => {
    buildEngine()
    engine.submit("local words")
    await settle()
    client.lastStream().emit([
      makeEvent("session.created", { title: "server title", owner_id: "local-user" }),
      makeEvent("run.completed", { status: "completed" }),
    ])
    await settle()
    expect(activeEntry().title).toBe("server title")
  })

  it("同步双发守卫：连续两次 submit 只发一条 POST", async () => {
    buildEngine()
    engine.submit("first")
    engine.submit("second")
    await settle()
    expect(client.createCalls).toHaveLength(1)
    expect(thread().messages).toHaveLength(1)
  })

  it("MODEL-UX：setModel 后首条 POST 带 model 选择子（首条锁的 wire 值）", async () => {
    buildEngine()
    engine.setModel("openai:gpt-5")
    engine.submit("hi")
    await settle()
    expect(client.createCalls[0]!.body).toMatchObject({ content: "hi", model: "openai:gpt-5" })
  })

  it("MODEL-UX：selectedModel=null（缺省）不带 model 字段（服务端用 profile 缺省）", async () => {
    buildEngine()
    engine.setModel(null)
    engine.submit("hi")
    await settle()
    expect(client.createCalls[0]!.body).not.toHaveProperty("model")
  })

  it("AGENT-PRESET：setAgent 后首条 POST 带 agent 名（首条锁的 wire 值）", async () => {
    buildEngine()
    engine.setAgent("poet")
    engine.submit("hi")
    await settle()
    expect(client.createCalls[0]!.body).toMatchObject({ content: "hi", agent: "poet" })
  })

  it("AGENT-PRESET：selectedAgent=null（缺省 general）不带 agent 字段（服务端用 profile 缺省）", async () => {
    buildEngine()
    engine.setAgent(null)
    engine.submit("hi")
    await settle()
    expect(client.createCalls[0]!.body).not.toHaveProperty("agent")
  })

  it.each([["   "], [""]])("空白输入 %j 不触发任何副作用", async (input) => {
    buildEngine()
    engine.submit(input)
    await settle()
    expect(client.createCalls).toHaveLength(0)
    expect(engine.getSnapshot().machine.phase).toBe("idle")
  })

  it("POST 失败进错误态，无本地假回复（零静默降级）", async () => {
    buildEngine()
    client.nextCreate = () => Promise.reject(new SessionClientError("http", "status 500"))
    engine.submit("hello")
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "error", error: "status 500" })
    expect(thread().messages.every((message) => message.role === "user")).toBe(true)
    expect(client.streams).toHaveLength(0)
  })

  it("活跃 run 409（session_run_active）显式进错误态", async () => {
    buildEngine()
    client.nextCreate = () =>
      Promise.reject(new SessionClientError("http", "session_run_active"))
    engine.submit("hello")
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({
      phase: "error",
      error: "session_run_active",
    })
  })

  it("错误态可重新提交（错误即清）", async () => {
    buildEngine()
    client.nextCreate = () => Promise.reject(new SessionClientError("network", "down"))
    engine.submit("hello")
    await settle()
    client.nextCreate = () => Promise.resolve(makeReceipt("run_retry"))
    engine.submit("hello again")
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "queued", runId: "run_retry" })
  })

  it("SSE 入站未过契约 → fail closed 为连接不可用且不伪造 run terminal", async () => {
    buildEngine()
    engine.submit("hello")
    await settle()
    client.lastStream().fail(new SessionClientError("parse", "SSE payload rejected by contract"))
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "queued", runId: "run_1" })
    expect(engine.getSnapshot().connection).toEqual({ status: "unavailable", reason: "parse" })
    expect(thread().runFailuresById).toEqual({})
  })

  it("reconnecting/unavailable 窗口拒绝新消息但保留 active Stop/cancel", async () => {
    buildEngine()
    engine.submit("active work")
    await settle()
    client.lastStream().emit([makeEvent("run.created", { run_id: "run_1" })])
    await settle()
    const stream = client.lastStream()
    const createCount = client.createCalls.length
    const messageCount = thread().messages.length

    stream.reconnecting()
    expect(engine.submit("must remain a draft")).toBe(false)
    expect(client.createCalls).toHaveLength(createCount)
    expect(thread().messages).toHaveLength(messageCount)

    stream.fail(new SessionClientError("http", "status 429"))
    expect(engine.submit("still blocked")).toBe(false)
    expect(client.createCalls).toHaveLength(createCount)
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "streaming", runId: "run_1" })

    engine.cancelRun()
    await settle()
    expect(client.controlCalls.at(-1)).toMatchObject({ runId: "run_1", body: { kind: "run.cancel" } })
    expect(engine.getSnapshot().machine.phase).toBe("cancelling")
  })

  it("unavailable 窗口也拒绝 pre-receipt retry 并保留原冻结意图", async () => {
    const seeded = addConversation(null, "conv_retry_gate", 500)
    client = createFakeClient()
    storage = createMemoryStorage<ConversationStore>(seeded)
    let resolveInitialSnapshot!: (snapshot: ReturnType<typeof makeSnapshot>) => void
    client.nextSnapshot = () => new Promise((resolve) => { resolveInitialSnapshot = resolve })
    engine = createSessionEngine({ client, storage, now: () => 1_000 })

    let rejectCreate!: (reason: Error) => void
    client.nextCreate = () => new Promise((_resolve, reject) => { rejectCreate = reject })
    expect(engine.submit("unknown pre-receipt")).toBe(true)
    resolveInitialSnapshot(makeSnapshot({
      sessionId: "conv_retry_gate",
      eventWatermark: CURSOR_7,
      activeRun: { run_id: "run_snapshot_active", status: "running" },
    }))
    await settle()

    client.lastStream().fail(new SessionClientError("http", "status 429"))
    rejectCreate(new Error("create rejected"))
    await settle()
    expect(engine.getSnapshot()).toMatchObject({
      machine: { phase: "error" },
      connection: { status: "unavailable" },
      canRetryPendingSubmission: false,
    })
    const createCount = client.createCalls.length

    engine.retry()
    await settle()

    expect(client.createCalls).toHaveLength(createCount)
    client.nextSnapshot = () => Promise.resolve(makeSnapshot({
      sessionId: "conv_retry_gate",
      eventWatermark: CURSOR_20,
    }))
    engine.reconnect()
    await settle()
    expect(engine.getSnapshot()).toMatchObject({
      machine: { phase: "error", error: "create rejected" },
      connection: { status: "connected" },
      canRetryPendingSubmission: true,
    })
    expect(thread().messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "user", content: "unknown pre-receipt" }),
    ]))

    client.nextCreate = () => Promise.resolve(makeReceipt("run_recovered_retry"))
    engine.retry()
    await settle()
    expect(client.createCalls).toHaveLength(createCount + 1)
    expect(client.createCalls.at(-1)).toEqual(client.createCalls[0])
    expect(thread().messages).toMatchObject([
      { id: "run_recovered_retry:user", role: "user", content: "unknown pre-receipt" },
    ])
  })
})

describe("HITL 凑帧与部分拒绝", () => {
  async function enterAwaitingFrame() {
    buildEngine()
    engine.submit("do work")
    await settle()
    client.lastStream().emit([
      makeEvent("run.created", { run_id: "run_1" }),
      makeEvent("tool.invoked", { segment_id: "seg_1", tool_id: "tool_1", name: "a", args: {} }),
      makeEvent("tool.invoked", { segment_id: "seg_1", tool_id: "tool_2", name: "b", args: {} }),
      makeEvent("interaction.state", makeInteractionState("tool_2", ["tool_1", "tool_2"], { name: "b", kind: "ask_user_question", allowed_decisions: ["respond", "reject"] })),
    ])
    await settle()
    expect(engine.getSnapshot().machine.phase).toBe("waiting")
  }

  it("nonconnected 窗口不发送 resume 且保留已暂存 decision", async () => {
    await enterAwaitingFrame()
    engine.stageToolDecision("run_1", "tool_1", { type: "approve" })
    expect(engine.getSnapshot().staging.run_1).toEqual({ tool_1: { type: "approve" } })

    client.lastStream().reconnecting()
    engine.stageToolDecision("run_1", "tool_2", { type: "respond", message: "blocked while reconnecting" })
    expect(client.controlCalls).toHaveLength(0)
    expect(engine.getSnapshot().staging.run_1).toEqual({ tool_1: { type: "approve" } })

    client.lastStream().connected()
    client.lastStream().fail(new SessionClientError("http", "status 429"))
    engine.stageToolDecision("run_1", "tool_2", { type: "respond", message: "blocked while unavailable" })
    expect(client.controlCalls).toHaveLength(0)
    expect(engine.getSnapshot().staging.run_1).toEqual({ tool_1: { type: "approve" } })
  })

  it("未凑齐不提交；凑齐后一次 resume 携带 command identity 与同帧全部决策", async () => {
    await enterAwaitingFrame()
    engine.stageToolDecision("run_1", "tool_1", { type: "approve" })
    await settle()
    expect(client.controlCalls).toHaveLength(0)
    expect(engine.getSnapshot().staging["run_1"]).toEqual({ tool_1: { type: "approve" } })

    engine.stageToolDecision("run_1", "tool_2", { type: "reject" })
    await settle()
    expect(client.controlCalls).toHaveLength(1)
    expect(client.controlCalls[0]).toMatchObject({
      sessionId: "conv_1",
      runId: "run_1",
      body: {
        kind: "run.resume",
        decisions: [
          { type: "approve", item_id: "tool_1" },
          { type: "reject", item_id: "tool_2" },
        ],
      },
    })
    expect(client.controlCalls[0]?.commandId.length).toBeGreaterThan(0)
    expect(client.controlCalls[0]?.body).toMatchObject({ kind: "run.resume", expected_pause_revision: 1, pause_ref: "pause_1" })
    // 部分拒绝：被拒工具本地置 rejected（防回流翻绿勾），批准的保持 awaiting 等 agent 恢复。
    const steps = thread().stepsByRun["run_1"] ?? []
    const statusById = new Map(
      steps.flatMap((step) => (step.kind === "tool" ? [[step.tool.id, step.tool.status]] : [])),
    )
    expect(statusById.get("tool_1")).toBe("running")
    expect(statusById.get("tool_2")).toBe("running")
    expect(engine.getSnapshot().machine.phase).toBe("waiting")
    expect(engine.getSnapshot().staging["run_1"]).toEqual({ tool_1: { type: "approve" }, tool_2: { type: "reject" } })
    expect(thread().interactionsByRun.run_1?.groups[0]?.items).toHaveLength(2)
  })

  it("resume 撞 409 no_pending_pause：清暂存 + snapshot 对账，不卡 awaiting-hitl（审计缺口④）", async () => {
    await enterAwaitingFrame()
    const snapshotsBefore = client.snapshotCalls.length
    client.nextControl = () => Promise.reject(new SessionClientError("http", "no_pending_pause"))
    engine.stageToolDecision("run_1", "tool_1", { type: "approve" })
    engine.stageToolDecision("run_1", "tool_2", { type: "respond", message: "ok" })
    await settle()
    // 对账：暂存清空、相位离开 awaiting-hitl、按 snapshot 重建（多一次 snapshot 拉取）。
    expect(engine.getSnapshot().staging["run_1"]).toBeUndefined()
    expect(engine.getSnapshot().machine.phase).not.toBe("waiting")
    expect(client.snapshotCalls.length).toBeGreaterThan(snapshotsBefore)
  })

  it("resume POST 失败：暂存保留可重试，重试复用同一 command identity", async () => {
    await enterAwaitingFrame()
    client.nextControl = () => Promise.reject(new SessionClientError("http", "status 502"))
    engine.stageToolDecision("run_1", "tool_1", { type: "approve" })
    engine.stageToolDecision("run_1", "tool_2", { type: "respond", message: "use plan b" })
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({
      phase: "waiting",
      error: "status 502",
    })
    expect(engine.getSnapshot().staging["run_1"]).toEqual({
      tool_1: { type: "approve" },
      tool_2: { type: "respond", message: "use plan b" },
    })

    client.nextControl = () => Promise.resolve({
      run_id: "run_1",
      command_id: "command_retry",
      request_digest: "sha256:control-retry",
      status: "succeeded",
      replayed: false,
    })
    // 重试：重按同一决策（暂存仍在），第二次提交必须复用同一 command identity（幂等）。
    engine.stageToolDecision("run_1", "tool_2", { type: "respond", message: "use plan b" })
    await settle()
    expect(client.controlCalls).toHaveLength(2)
    const [first, second] = client.controlCalls
    if (first?.body.kind !== "run.resume" || second?.body.kind !== "run.resume") {
      throw new Error("expected two resume calls")
    }
    expect(second.commandId).toBe(first.commandId)
    expect(engine.getSnapshot().machine.phase).toBe("waiting")
  })

  it("resume 在途时忽略迟到/重复点击，不覆盖已提交的决策", async () => {
    await enterAwaitingFrame()
    let resolveControl: ((value: RunControlReceipt) => void) | undefined
    client.nextControl = () => new Promise((resolve) => {
      resolveControl = resolve
    })

    engine.stageToolDecision("run_1", "tool_1", { type: "approve" })
    engine.stageToolDecision("run_1", "tool_2", { type: "reject" })
    expect(client.controlCalls).toHaveLength(1)

    // 第二次点击不能发第二个 resume，也不能把已发出的 reject 改成 respond。
    engine.stageToolDecision("run_1", "tool_2", { type: "respond", message: "late" })
    expect(client.controlCalls).toHaveLength(1)
    expect(engine.getSnapshot().staging["run_1"]).toEqual({
      tool_1: { type: "approve" },
      tool_2: { type: "reject" },
    })

    resolveControl?.({
      run_id: "run_1",
      command_id: "command_in_flight",
      request_digest: "sha256:control-in-flight",
      status: "succeeded",
      replayed: false,
    })
    await settle()
    expect(engine.getSnapshot().machine.phase).toBe("waiting")
  })

  it("忽略不属于当前暂停帧的迟到工具决策", async () => {
    await enterAwaitingFrame()
    engine.stageToolDecision("run_1", "tool_old", { type: "approve" })
    expect(client.controlCalls).toHaveLength(0)
    expect(engine.getSnapshot().staging["run_1"]).toBeUndefined()
  })

  it("respond 决策映射为契约 respond(response)", async () => {
    await enterAwaitingFrame()
    engine.stageToolDecision("run_1", "tool_1", { type: "approve" })
    engine.stageToolDecision("run_1", "tool_2", { type: "respond", message: "answer" })
    await settle()
    expect(client.controlCalls[0]?.body).toMatchObject({
      kind: "run.resume",
      decisions: [
        { type: "approve", item_id: "tool_1" },
        { type: "respond", item_id: "tool_2", response: "answer" },
      ],
    })
  })
})

describe("停止与放弃", () => {
  it("首个 POST 回执未返回时点击停止：立即回到 idle，并在迟到回执后取消已创建 run", async () => {
    buildEngine()
    let release!: (receipt: ReturnType<typeof makeReceipt>) => void
    client.nextCreate = () => new Promise((resolve) => { release = resolve })

    engine.submit("pending job")
    expect(engine.getSnapshot().machine.phase).toBe("submitting")
    engine.cancelRun()
    expect(engine.getSnapshot().machine.phase).toBe("idle")
    expect(client.controlCalls).toHaveLength(0)

    release(makeReceipt("run_late"))
    await settle()

    expect(client.controlCalls).toMatchObject([{
      sessionId: "conv_1",
      runId: "run_late",
      body: { kind: "run.cancel" },
    }])
    expect(client.streams).toHaveLength(0)
    expect(engine.getSnapshot().machine.phase).toBe("idle")
  })

  it("新建会话发生在首个 POST 回执未返回时，也会取消迟到创建的旧 run", async () => {
    buildEngine()
    let release!: (receipt: ReturnType<typeof makeReceipt>) => void
    client.nextCreate = () => new Promise((resolve) => { release = resolve })

    engine.submit("abandoned draft")
    engine.newConversation()
    expect(engine.getSnapshot().machine.phase).toBe("idle")
    expect(engine.getSnapshot().thread.messages).toHaveLength(0)

    release(makeReceipt("run_late_new_chat"))
    await settle()

    expect(client.controlCalls).toMatchObject([{
      sessionId: "conv_1",
      runId: "run_late_new_chat",
      body: { kind: "run.cancel" },
    }])
    expect(engine.getSnapshot().machine.phase).toBe("idle")
  })

  it("cancelRun：等待 owner 终态收口、cancel POST 带 command identity 尽力而为", async () => {
    buildEngine()
    engine.submit("long job")
    await settle()
    client.lastStream().emit([
      makeEvent("run.created", { run_id: "run_1" }),
      makeEvent("tool.invoked", { segment_id: "seg_1", tool_id: "tool_1", name: "a", args: {} }),
    ])
    await settle()
    engine.cancelRun()
    await settle()
    expect(client.controlCalls).toHaveLength(1)
    expect(client.controlCalls[0]).toMatchObject({
      sessionId: "conv_1",
      runId: "run_1",
      body: { kind: "run.cancel" },
    })
    expect(client.controlCalls[0]?.commandId.length).toBeGreaterThan(0)
    expect(client.controlCalls[0]?.body).toEqual({ kind: "run.cancel" })
    expect(engine.getSnapshot().machine.phase).toBe("cancelling")
    const step = (thread().stepsByRun["run_1"] ?? [])[0]
    expect(step?.kind === "tool" ? step.tool.status : null).toBe("running")
    expect(client.lastStream().closed).toBe(false)
    client.lastStream().emit([makeEvent("run.completed", { status: "cancelled" })])
    await settle()
    expect(engine.getSnapshot().machine.phase).toBe("idle")
    expect(client.lastStream().closed).toBe(true)
  })

  it("新建会话放弃在途 run（发 cancel）并置新会话为活跃、清空线程", async () => {
    buildEngine()
    engine.submit("job in conv A")
    await settle()
    const firstConvId = engine.getSnapshot().store?.activeId
    engine.newConversation()
    await settle()
    expect(client.controlCalls.at(-1)?.body).toMatchObject({ kind: "run.cancel" })
    expect(engine.getSnapshot().store?.activeId).not.toBe(firstConvId)
    expect(thread().messages).toHaveLength(0)
    // 本地新建的会话服务端必然不存在：不发无谓 snapshot 请求。
    expect(client.snapshotCalls).toHaveLength(0)
  })
})

describe("snapshot-first 水合与中断恢复", () => {
  const SEEDED = addConversation(null, "conv_9", 500)

  it.each([
    { historyStatus: "completed" as const, snapshotHasReceiptTerminal: false },
    { historyStatus: "completed" as const, snapshotHasReceiptTerminal: true },
    { historyStatus: "failed" as const, snapshotHasReceiptTerminal: false },
    { historyStatus: "failed" as const, snapshotHasReceiptTerminal: true },
  ])(
    "initial $historyStatus history with receipt-first and terminal=$snapshotHasReceiptTerminal preserves owner snapshot before opening a stream",
    async ({ historyStatus, snapshotHasReceiptTerminal }) => {
      client = createFakeClient()
      storage = createMemoryStorage<ConversationStore>(SEEDED)
      let resolveSnapshot!: (snapshot: ReturnType<typeof makeSnapshot>) => void
      client.nextSnapshot = () => new Promise((resolve) => { resolveSnapshot = resolve })
      const receipt = makeReceipt("run_receipt_first")
      client.nextCreate = () => Promise.resolve(receipt)
      engine = createSessionEngine({
        client,
        storage,
        now: () => 1_000,
        createId: (prefix) => `${prefix}_receipt_first`,
      })

      expect(engine.submit("new request while hydrating")).toBe(true)
      await settle()
      expect(client.createCalls).toHaveLength(1)
      expect(client.streams).toHaveLength(0)

      resolveSnapshot(makeSnapshot({
        sessionId: "conv_9",
        eventWatermark: CURSOR_20,
        messages: [
          {
            message_id: "user_old",
            role: "user",
            content: "old request",
            status: "completed",
            created_at: "2026-07-02T00:00:00Z",
          },
          {
            message_id: "assistant_old",
            role: "assistant",
            run_id: "run_old",
            content: historyStatus === "failed" ? "old partial body" : "old completed body",
            status: historyStatus,
            created_at: "2026-07-02T00:00:01Z",
          },
          ...(snapshotHasReceiptTerminal
            ? [
                {
                  message_id: receipt.user_message_id,
                  role: "user" as const,
                  content: "new request while hydrating",
                  status: "completed" as const,
                  created_at: "2026-07-02T00:00:02Z",
                },
                {
                  message_id: receipt.assistant_message_id,
                  role: "assistant" as const,
                  run_id: receipt.run_id,
                  content: "owner already completed receipt run",
                  status: "completed" as const,
                  created_at: "2026-07-02T00:00:03Z",
                },
              ]
            : []),
        ],
      }))
      await settle()

      expect(thread().messages).toContainEqual(expect.objectContaining({
        id: "assistant_old",
        content: historyStatus === "failed" ? "old partial body" : "old completed body",
      }))
      expect(thread().messages.filter((message) => message.id === receipt.user_message_id)).toEqual([
        expect.objectContaining({ role: "user", content: "new request while hydrating" }),
      ])
      expect(thread().messages.filter((message) => message.role === "user" && message.id.startsWith("usr_"))).toHaveLength(0)
      expect(thread().runFailuresById.run_old).toEqual(
        historyStatus === "failed"
          ? { failedRunId: "run_old", kind: "generic" }
          : undefined,
      )
      if (snapshotHasReceiptTerminal) {
        expect(thread().messages).toContainEqual(expect.objectContaining({
          id: receipt.assistant_message_id,
          content: "owner already completed receipt run",
        }))
        expect(engine.getSnapshot().machine).toMatchObject({ phase: "idle", runId: null })
        expect(client.streams).toHaveLength(0)
      } else {
        expect(engine.getSnapshot().machine).toMatchObject({ phase: "queued", runId: receipt.run_id })
        expect(client.streams).toHaveLength(1)
        expect(client.lastStream()).toMatchObject({ sessionId: "conv_9", resumeCursor: CURSOR_20 })
      }
    },
  )

  it("initial receipt-first snapshot 的 exact active run 只按 owner watermark 开一个流", async () => {
    client = createFakeClient()
    storage = createMemoryStorage<ConversationStore>(SEEDED)
    let resolveSnapshot!: (snapshot: ReturnType<typeof makeSnapshot>) => void
    client.nextSnapshot = () => new Promise((resolve) => { resolveSnapshot = resolve })
    const receipt = makeReceipt("run_receipt_active")
    client.nextCreate = () => Promise.resolve(receipt)
    engine = createSessionEngine({
      client,
      storage,
      now: () => 1_000,
      createId: (prefix) => `${prefix}_receipt_active`,
    })

    expect(engine.submit("active while hydrating")).toBe(true)
    await settle()
    expect(client.streams).toHaveLength(0)

    resolveSnapshot(makeSnapshot({
      sessionId: "conv_9",
      eventWatermark: CURSOR_20,
      activeRun: { run_id: receipt.run_id, status: "running" },
      messages: [
        {
          message_id: receipt.user_message_id,
          role: "user",
          content: "active while hydrating",
          status: "completed",
          created_at: "2026-07-02T00:00:00Z",
        },
        {
          message_id: receipt.assistant_message_id,
          role: "assistant",
          run_id: receipt.run_id,
          content: "owner partial",
          status: "streaming",
          created_at: "2026-07-02T00:00:01Z",
        },
      ],
    }))
    await settle()

    expect(engine.getSnapshot().machine).toMatchObject({ phase: "streaming", runId: receipt.run_id })
    expect(thread().messages.filter((message) => message.id === receipt.user_message_id)).toHaveLength(1)
    expect(thread().messages).toContainEqual(expect.objectContaining({
      id: receipt.assistant_message_id,
      content: "owner partial",
    }))
    expect(client.streams).toHaveLength(1)
    expect(client.lastStream()).toMatchObject({ sessionId: "conv_9", resumeCursor: CURSOR_20 })
  })

  async function pendingCreateWithActiveHydration(content: string) {
    client = createFakeClient()
    storage = createMemoryStorage<ConversationStore>(SEEDED)
    let resolveInitialSnapshot!: (snapshot: ReturnType<typeof makeSnapshot>) => void
    client.nextSnapshot = () => new Promise((resolve) => { resolveInitialSnapshot = resolve })
    engine = createSessionEngine({ client, storage, now: () => 1_000 })
    let resolveCreate!: (receipt: ReturnType<typeof makeReceipt>) => void
    client.nextCreate = () => new Promise((resolve) => { resolveCreate = resolve })
    expect(engine.submit(content)).toBe(true)
    resolveInitialSnapshot(makeSnapshot({
      sessionId: "conv_9",
      eventWatermark: CURSOR_7,
      activeRun: { run_id: "run_snapshot_active", status: "running" },
    }))
    await settle()
    expect(engine.getSnapshot().machine.phase).toBe("submitting")
    return { resolveCreate, stream: client.lastStream() }
  }

  it("GC 410 only: refetches the owner snapshot and resumes its new watermark", async () => {
    buildEngine(SEEDED)
    client.snapshotCalls.length = 0
    let watermark = CURSOR_7
    client.nextSnapshot = () => Promise.resolve(makeSnapshot({
      sessionId: "conv_9", eventWatermark: watermark, deliveriesHasMore: true,
      activeRun: { run_id: "run_active", status: "running" },
      deliveries: [makeSnapshotDelivery({ conversation_id: "conv_9", artifact_id: "artifact_1" })],
    }))
    engine.dispose()
    engine = createSessionEngine({ client, storage, now: () => 1_000 })
    await settle()
    expect(client.lastStream().resumeCursor).toBe(CURSOR_7)
    expect(thread().deliveriesHasMore).toBe(true)
    watermark = CURSOR_12
    client.lastStream().fail(new SessionClientError("http", "410", "event_cursor_expired"))
    await settle()
    expect(client.snapshotCalls).toEqual(["conv_9", "conv_9"])
    expect(client.lastStream().resumeCursor).toBe(CURSOR_12)
    expect(thread().deliveries.map((item) => item.artifactId)).toEqual(["artifact_1"])

    client.lastStream().fail(new SessionClientError("http", "410 other"))
    await settle()
    expect(client.snapshotCalls).toHaveLength(2)
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "streaming", runId: "run_active" })
    expect(engine.getSnapshot().connection).toEqual({ status: "unavailable", reason: "http" })
  })

  it("post-hydration hard error is connection-only and explicit reconnect is snapshot-first", async () => {
    buildEngine(SEEDED)
    client.nextSnapshot = () => Promise.resolve(makeSnapshot({
      sessionId: "conv_9",
      eventWatermark: CURSOR_7,
      activeRun: { run_id: "run_active", status: "running" },
    }))
    engine.dispose()
    engine = createSessionEngine({ client, storage, now: () => 1_000 })
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "streaming", runId: "run_active" })

    client.lastStream().fail(new SessionClientError("http", "status 429"))
    await settle()

    expect(engine.getSnapshot().connection).toEqual({ status: "unavailable", reason: "http" })
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "streaming", runId: "run_active" })
    expect(engine.getSnapshot().thread.runFailuresById).toEqual({})
    const createCount = client.createCalls.length
    const snapshotCount = client.snapshotCalls.length
    client.nextSnapshot = () => Promise.resolve(makeSnapshot({
      sessionId: "conv_9",
      eventWatermark: CURSOR_20,
      activeRun: { run_id: "run_active", status: "running" },
    }))

    engine.reconnect()
    expect(engine.getSnapshot().connection.status).toBe("reconnecting")
    await settle()

    expect(client.snapshotCalls).toHaveLength(snapshotCount + 1)
    expect(client.createCalls).toHaveLength(createCount)
    expect(client.lastStream().resumeCursor).toBe(CURSOR_20)
    client.lastStream().connected()
    expect(engine.getSnapshot().connection.status).toBe("connected")
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "streaming", runId: "run_active" })
  })

  it("transient reconnect preserves partial active run and clears on connected", async () => {
    buildEngine()
    engine.submit("work")
    await settle()
    client.lastStream().emit([
      makeEvent("run.created", { run_id: "run_1" }),
      makeEvent("message.delta", { segment_id: "seg_1", delta: "partial answer" }),
    ], [CURSOR_3, CURSOR_7])
    await settle()

    client.lastStream().reconnecting()
    expect(engine.getSnapshot().connection.status).toBe("reconnecting")
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "streaming", runId: "run_1" })
    expect(thread().messages.at(-1)).toMatchObject({ role: "assistant", content: "partial answer" })
    expect(thread().runFailuresById).toEqual({})

    client.lastStream().connected()
    expect(engine.getSnapshot().connection.status).toBe("connected")
    expect(client.lastStream().resumeCursor).toBeNull()
  })

  it("expired-cursor snapshot failure keeps confirmed content and becomes unavailable", async () => {
    buildEngine()
    engine.submit("work")
    await settle()
    client.lastStream().emit([
      makeEvent("run.created", { run_id: "run_1" }),
      makeEvent("message.delta", { segment_id: "seg_1", delta: "confirmed partial" }),
    ])
    await settle()
    client.nextSnapshot = () => Promise.reject(new SessionClientError("network", "snapshot unavailable"))

    client.lastStream().fail(new SessionClientError("http", "410", "event_cursor_expired"))
    await settle()

    expect(engine.getSnapshot().connection).toEqual({ status: "unavailable", reason: "network" })
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "streaming", runId: "run_1" })
    expect(thread().messages.at(-1)).toMatchObject({ content: "confirmed partial" })
    expect(thread().runFailuresById).toEqual({})
  })

  it("GC 410 terminal snapshot closes the old subscription and the next receipt opens a fresh one", async () => {
    buildEngine()
    engine.submit("work")
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "queued", runId: "run_1" })
    client.nextSnapshot = () => Promise.resolve(makeSnapshot({ sessionId: "conv_1", eventWatermark: CURSOR_12 }))

    client.lastStream().fail(new SessionClientError("http", "410", "event_cursor_expired"))
    await settle()

    expect(engine.getSnapshot().machine).toMatchObject({ phase: "idle", runId: null })
    expect(engine.getSnapshot().connection).toEqual({ status: "connected" })
    expect(client.streams).toHaveLength(1)

    expect(engine.submit("next after recovered terminal")).toBe(true)
    await settle()
    expect(client.createCalls).toHaveLength(2)
    expect(client.streams).toHaveLength(2)
    expect(client.lastStream()).toMatchObject({ sessionId: "conv_1", resumeCursor: CURSOR_12 })
  })

  it("GC 410 replaces an obsolete awaiting run with the new owner run", async () => {
    buildEngine()
    engine.submit("work")
    await settle()
    client.lastStream().emit([makeEvent("interaction.state", makeInteractionState("tool_1", ["tool_1"]))])
    await settle()
    expect(engine.getSnapshot().machine.phase).toBe("waiting")
    client.nextSnapshot = () => Promise.resolve(makeSnapshot({
      sessionId: "conv_1", eventWatermark: CURSOR_20,
      activeRun: { run_id: "run_2", status: "running" },
    }))

    client.lastStream().fail(new SessionClientError("http", "410", "event_cursor_expired"))
    await settle()

    expect(engine.getSnapshot().machine).toMatchObject({ phase: "streaming", runId: "run_2" })
    expect(client.lastStream().resumeCursor).toBe(CURSOR_20)
  })

  it("ignores a previous run's late resume receipt after GC reattaches a new approval", async () => {
    buildEngine()
    engine.submit("work")
    await settle()
    client.lastStream().emit([makeEvent("interaction.state", makeInteractionState("tool_1", ["tool_1"]))])
    await settle()
    let resolveControl: ((value: RunControlReceipt) => void) | undefined
    client.nextControl = () => new Promise((resolve) => { resolveControl = resolve })
    engine.stageToolDecision("run_1", "tool_1", { type: "approve" })
    expect(client.controlCalls).toHaveLength(1)
    client.nextSnapshot = () => Promise.resolve(makeSnapshot({
      sessionId: "conv_1", eventWatermark: CURSOR_20,
      activeRun: { run_id: "run_2", status: "waiting_input" },
      pendingPauses: [makePendingPause({ run_id: "run_2", tool_id: "tool_2" })],
    }))
    client.lastStream().fail(new SessionClientError("http", "410", "event_cursor_expired"))
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "waiting", runId: "run_2" })

    resolveControl?.({ run_id: "run_1", command_id: "old", request_digest: "sha256:old", status: "succeeded", replayed: false })
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "waiting", runId: "run_2" })
  })

  it("ignores a previous run's late stale-control failure after GC reattaches a new approval", async () => {
    buildEngine()
    engine.submit("work")
    await settle()
    client.lastStream().emit([makeEvent("interaction.state", makeInteractionState("tool_1", ["tool_1"]))])
    await settle()
    let rejectControl: ((reason: Error) => void) | undefined
    client.nextControl = () => new Promise((_resolve, reject) => { rejectControl = reject })
    engine.stageToolDecision("run_1", "tool_1", { type: "approve" })
    client.nextSnapshot = () => Promise.resolve(makeSnapshot({
      sessionId: "conv_1", eventWatermark: CURSOR_20,
      activeRun: { run_id: "run_2", status: "waiting_input" },
      pendingPauses: [makePendingPause({ run_id: "run_2", tool_id: "tool_2" })],
    }))
    client.lastStream().fail(new SessionClientError("http", "410", "event_cursor_expired"))
    await settle()
    const stream = client.lastStream()
    const snapshotCount = client.snapshotCalls.length

    rejectControl?.(new Error("no_pending_pause"))
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "waiting", runId: "run_2" })
    expect(client.lastStream()).toBe(stream)
    expect(client.snapshotCalls).toHaveLength(snapshotCount)
  })

  it("freezes old run submit and approval actions while a 410 snapshot is pending", async () => {
    buildEngine()
    engine.submit("work")
    await settle()
    client.lastStream().emit([makeEvent("interaction.state", makeInteractionState("tool_1", ["tool_1"]))])
    await settle()
    let resolveSnapshot: ((value: ReturnType<typeof makeSnapshot>) => void) | undefined
    client.nextSnapshot = () => new Promise((resolve) => { resolveSnapshot = resolve })
    client.lastStream().fail(new SessionClientError("http", "410", "event_cursor_expired"))
    await settle()

    engine.submit("stale steer")
    engine.stageToolDecision("run_1", "tool_1", { type: "approve" })
    expect(client.createCalls).toHaveLength(1)
    expect(client.controlCalls).toHaveLength(0)

    resolveSnapshot?.(makeSnapshot({ sessionId: "conv_1", eventWatermark: CURSOR_20 }))
    await settle()
    expect(engine.getSnapshot().machine.phase).toBe("idle")
  })

  it("410 recovery pending 时旧 create receipt 不重开 stale stream，owner snapshot 最终获胜", async () => {
    const { resolveCreate, stream: streamBeforeRecovery } = await pendingCreateWithActiveHydration("pending before GC")
    let resolveSnapshot!: (snapshot: ReturnType<typeof makeSnapshot>) => void
    client.nextSnapshot = () => new Promise((resolve) => { resolveSnapshot = resolve })
    streamBeforeRecovery.fail(new SessionClientError("http", "410", "event_cursor_expired"))
    const streamCountDuringRecovery = client.streams.length

    resolveCreate(makeReceipt("run_old_receipt"))
    await settle()
    expect(client.streams).toHaveLength(streamCountDuringRecovery)
    expect(engine.getSnapshot().connection.status).toBe("reconnecting")

    resolveSnapshot(makeSnapshot({
      sessionId: "conv_9",
      eventWatermark: CURSOR_20,
      activeRun: { run_id: "run_owner", status: "running" },
    }))
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "streaming", runId: "run_owner" })
    expect(client.lastStream().resumeCursor).toBe(CURSOR_20)
  })

  it("410 recovery 的 settled snapshot 在 deferred exact receipt 落地后才开新流", async () => {
    const { resolveCreate, stream } = await pendingCreateWithActiveHydration("receipt before settled snapshot")
    let resolveSnapshot!: (snapshot: ReturnType<typeof makeSnapshot>) => void
    client.nextSnapshot = () => new Promise((resolve) => { resolveSnapshot = resolve })
    stream.fail(new SessionClientError("http", "410", "event_cursor_expired"))
    const streamCountDuringRecovery = client.streams.length

    resolveCreate(makeReceipt("run_deferred_after_idle"))
    await settle()
    expect(client.streams).toHaveLength(streamCountDuringRecovery)

    resolveSnapshot(makeSnapshot({ sessionId: "conv_9", eventWatermark: CURSOR_20 }))
    await settle()

    expect(engine.getSnapshot().machine).toMatchObject({ phase: "queued", runId: "run_deferred_after_idle" })
    expect(client.streams).toHaveLength(streamCountDuringRecovery + 1)
    expect(client.lastStream()).toMatchObject({ sessionId: "conv_9", resumeCursor: CURSOR_20 })
  })

  it("410 recovery 的 null snapshot 先返回时，late accepted receipt 只取消原 session run", async () => {
    const { resolveCreate, stream } = await pendingCreateWithActiveHydration("pending before disappeared snapshot")
    client.nextSnapshot = () => Promise.resolve(null)
    stream.fail(new SessionClientError("http", "410", "event_cursor_expired"))
    await settle()

    const fallbackSessionId = engine.getSnapshot().store?.activeId
    expect(fallbackSessionId).not.toBe("conv_9")
    expect(thread().messages).toHaveLength(0)
    resolveCreate(makeReceipt("run_late_after_null"))
    await settle()

    expect(client.createCalls).toHaveLength(1)
    expect(client.controlCalls).toEqual([
      expect.objectContaining({
        sessionId: "conv_9",
        runId: "run_late_after_null",
        body: { kind: "run.cancel" },
      }),
    ])
    expect(engine.getSnapshot().store?.activeId).toBe(fallbackSessionId)
    expect(engine.getSnapshot().machine.phase).toBe("idle")
    expect(thread().messages).toHaveLength(0)
  })

  it("410 recovery 已暂存 receipt 后 null snapshot 立即取消该 run", async () => {
    const { resolveCreate, stream } = await pendingCreateWithActiveHydration("receipt before disappeared snapshot")
    let resolveSnapshot!: (snapshot: ReturnType<typeof makeSnapshot> | null) => void
    client.nextSnapshot = () => new Promise((resolve) => { resolveSnapshot = resolve })
    stream.fail(new SessionClientError("http", "410", "event_cursor_expired"))

    resolveCreate(makeReceipt("run_deferred_before_null"))
    await settle()
    expect(client.controlCalls).toHaveLength(0)

    resolveSnapshot(null)
    await settle()

    expect(client.createCalls).toHaveLength(1)
    expect(client.controlCalls).toEqual([
      expect.objectContaining({
        sessionId: "conv_9",
        runId: "run_deferred_before_null",
        body: { kind: "run.cancel" },
      }),
    ])
    expect(engine.getSnapshot().store?.activeId).not.toBe("conv_9")
    expect(engine.getSnapshot().machine.phase).toBe("idle")
    expect(thread().messages).toHaveLength(0)
  })

  it("切会话后丢弃旧 reconnect snapshot 与 cancel 回调", async () => {
    let seeded = addConversation(null, "conv_a", 100)
    seeded = addConversation(seeded, "conv_b", 200)
    buildEngine(seeded)
    client.nextSnapshot = (sessionId) => Promise.resolve(makeSnapshot({
      sessionId,
      eventWatermark: CURSOR_7,
      activeRun: { run_id: sessionId === "conv_b" ? "run_b" : "run_a", status: "running" },
    }))
    engine.dispose()
    engine = createSessionEngine({ client, storage, now: () => 1_000 })
    await settle()
    engine.submit("run in B")
    await settle()
    client.lastStream().fail(new SessionClientError("http", "status 429"))

    let resolveReconnect!: (snapshot: ReturnType<typeof makeSnapshot>) => void
    client.nextSnapshot = (sessionId) => sessionId === "conv_b"
      ? new Promise((resolve) => { resolveReconnect = resolve })
      : Promise.resolve(makeSnapshot({
          sessionId: "conv_a",
          eventWatermark: CURSOR_20,
          activeRun: { run_id: "run_a", status: "running" },
        }))
    engine.reconnect()
    let rejectCancel!: (reason: Error) => void
    client.nextControl = () => new Promise((_resolve, reject) => { rejectCancel = reject })
    engine.cancelRun()
    engine.selectConversation("conv_a")
    await settle()
    expect(engine.getSnapshot().store?.activeId).toBe("conv_a")

    resolveReconnect(makeSnapshot({
      sessionId: "conv_b",
      eventWatermark: CURSOR_30,
      activeRun: { run_id: "run_stale", status: "running" },
    }))
    rejectCancel(new Error("late cancel failure"))
    await settle()

    expect(engine.getSnapshot().store?.activeId).toBe("conv_a")
    expect(engine.getSnapshot().machine.runId).not.toBe("run_stale")
    expect(client.lastStream()).toMatchObject({ sessionId: "conv_a", resumeCursor: CURSOR_20 })
  })

  it("GC 410 evicts a disappeared conversation rather than retaining private delivery metadata", async () => {
    buildEngine()
    engine.submit("work")
    await settle()
    client.lastStream().emit([makeEvent("delivery.created", makeDeliveryPayload(), { session_id: "conv_1" })])
    await settle()
    expect(thread().deliveries).toHaveLength(1)
    client.nextSnapshot = () => Promise.resolve(null)

    client.lastStream().fail(new SessionClientError("http", "410", "event_cursor_expired"))
    await settle()

    expect(thread().deliveries).toHaveLength(0)
    expect(engine.getSnapshot().machine.phase).toBe("idle")
    expect(engine.getSnapshot().store?.activeId).not.toBe("conv_1")
  })

  it("separate active GC windows recover after each snapshot advances its watermark", async () => {
    buildEngine(SEEDED)
    let watermark = CURSOR_7
    client.nextSnapshot = () => Promise.resolve(makeSnapshot({
      sessionId: "conv_9",
      eventWatermark: watermark,
      activeRun: { run_id: "run_active", status: "running" },
    }))
    engine.dispose()
    engine = createSessionEngine({ client, storage, now: () => 1_000 })
    await settle()

    for (const next of [CURSOR_12, CURSOR_20, CURSOR_30]) {
      watermark = next
      client.lastStream().fail(new SessionClientError("http", "410", "event_cursor_expired"))
      await settle()
      expect(client.lastStream().resumeCursor).toBe(next)
      expect(engine.getSnapshot().machine).toMatchObject({ phase: "streaming", runId: "run_active" })
    }
  })

  it("stops a broken owner that repeatedly returns the same expired watermark", async () => {
    buildEngine(SEEDED)
    client.snapshotCalls.length = 0
    client.nextSnapshot = () => Promise.resolve(makeSnapshot({
      sessionId: "conv_9",
      eventWatermark: CURSOR_7,
      activeRun: { run_id: "run_active", status: "running" },
    }))
    engine.dispose()
    engine = createSessionEngine({ client, storage, now: () => 1_000 })
    await settle()

    for (let attempt = 0; attempt < 3; attempt += 1) {
      client.lastStream().fail(new SessionClientError("http", "410", "event_cursor_expired"))
      await settle()
    }
    expect(client.snapshotCalls).toHaveLength(3)
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "streaming", runId: "run_active" })
    expect(engine.getSnapshot().connection).toEqual({ status: "unavailable", reason: "http" })
  })

  it("启动即 GET snapshot；无服务端会话（null）停留空态，不开流", async () => {
    buildEngine(SEEDED)
    await settle()
    expect(client.snapshotCalls).toEqual(["conv_9"])
    expect(engine.getSnapshot().machine.phase).toBe("idle")
    expect(client.streams).toHaveLength(0)
  })

  it("settled 历史 snapshot 直接重建线程且零 SSE，下一条 receipt 才打开新流", async () => {
    buildEngine(SEEDED)
    client.nextSnapshot = () =>
      Promise.resolve(
        makeSnapshot({
          sessionId: "conv_9",
          title: "restored title",
          messages: [
            {
              message_id: "msg_u",
              role: "user",
              content: "old ask",
              status: "completed",
              created_at: "2026-07-02T00:00:00Z",
            },
            {
              message_id: "msg_a",
              role: "assistant",
              content: "old answer",
              status: "completed",
              created_at: "2026-07-02T00:00:01Z",
              run_id: "run_old",
            },
          ],
          eventWatermark: CURSOR_7,
        }),
      )
    // 重建引擎以套用编程后的 snapshot。
    engine.dispose()
    engine = createSessionEngine({ client, storage, now: () => 1_000 })
    await settle()
    expect(thread().messages.map((message) => [message.role, message.content])).toEqual([
      ["user", "old ask"],
      ["assistant", "old answer"],
    ])
    expect(activeEntry().title).toBe("restored title")
    expect(engine.getSnapshot().machine.phase).toBe("idle")
    expect(engine.getSnapshot().connection).toEqual({ status: "connected" })
    expect(client.streams).toHaveLength(0)

    expect(engine.submit("continue from history")).toBe(true)
    await settle()
    expect(client.createCalls).toHaveLength(1)
    expect(client.streams).toHaveLength(1)
    expect(client.lastStream()).toMatchObject({ sessionId: "conv_9", resumeCursor: CURSOR_7 })
    expect(thread().messages.map((message) => message.content)).toEqual([
      "old ask",
      "old answer",
      "continue from history",
    ])
  })

  it("resumes a nonempty snapshot prefix once, advances the cursor, and keeps terminal text", async () => {
    buildEngine(SEEDED)
    client.nextSnapshot = () => Promise.resolve(makeSnapshot({
      sessionId: "conv_9", activeRun: { run_id: "run_9", status: "running" }, eventWatermark: CURSOR_12,
      messages: [{ message_id: "durable", role: "assistant", run_id: "run_9", content: "Hello! How can ",
        status: "streaming", created_at: "2026-07-02T00:00:00Z" }],
    }))
    engine.dispose()
    engine = createSessionEngine({ client, storage, now: () => 1_000 })
    await settle()
    expect(client.lastStream().resumeCursor).toBe(CURSOR_12)
    const content = makeEvent("message.delta", { segment_id: "wire", delta: "I assist you today?" }, { run_id: "run_9", seq: 13 })
    client.lastStream().emit([content, content])
    await settle()
    expect(thread().messages).toHaveLength(1)
    expect(thread().messages[0]?.content).toBe("Hello! How can I assist you today?")
    client.lastStream().emit([
      makeEvent("message.delta", { segment_id: "wire", delta: "", text_boundary: "end" }, { run_id: "run_9", seq: 14 }),
      makeEvent("run.completed", { status: "completed" }, { run_id: "run_9", seq: 20 }),
    ])
    await settle()
    expect(engine.getSnapshot().machine.phase).toBe("idle")
    expect(thread().resumeCursor).toBe(CURSOR_20)
    expect(thread().messages).toHaveLength(1)
    expect(thread().messages[0]).toMatchObject({ snapshotMessageId: "durable", content: "Hello! How can I assist you today?" })
  })

  it("快照带在途 run：锚定重连并从 opaque watermark 续流", async () => {
    buildEngine(SEEDED)
    client.nextSnapshot = () =>
      Promise.resolve(
        makeSnapshot({
          sessionId: "conv_9",
          activeRun: { run_id: "run_9", status: "running" },
          eventWatermark: CURSOR_12,
        }),
      )
    engine.dispose()
    engine = createSessionEngine({ client, storage, now: () => 1_000 })
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "streaming", runId: "run_9" })
    expect(client.lastStream()).toMatchObject({ sessionId: "conv_9", resumeCursor: CURSOR_12 })

    // 历史 run 的 replay 终态不收束本轮。
    client.lastStream().emit([
      makeEvent("run.completed", { status: "completed" }, { run_id: "run_old", seq: 13 }),
    ])
    await settle()
    expect(engine.getSnapshot().machine.phase).toBe("streaming")

    client.lastStream().emit([
      makeEvent("message.delta", { segment_id: "seg_1", delta: "resumed" }, { run_id: "run_9", seq: 14 }),
    ])
    await settle()
    expect(engine.getSnapshot().machine.phase).toBe("streaming")

    client.lastStream().emit([
      makeEvent("run.completed", { status: "completed" }, { run_id: "run_9", seq: 15 }),
    ])
    await settle()
    expect(engine.getSnapshot().machine.phase).toBe("idle")
  })

  it("刷新场景规格：带 pending pause 的快照水合后审批帧直接可操作", async () => {
    buildEngine(SEEDED)
    client.nextSnapshot = () =>
      Promise.resolve(
        makeSnapshot({
          sessionId: "conv_9",
          activeRun: { run_id: "run_9", status: "waiting_input" },
          pendingPauses: [
            makePendingPause({ run_id: "run_9", tool_id: "tool_1" }),
          ],
          eventWatermark: CURSOR_20,
        }),
      )
    engine.dispose()
    engine = createSessionEngine({ client, storage, now: () => 1_000 })
    await settle()
    // 相位与审批卡都由同一 snapshot 直落，无需双读旧事件。
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "waiting", runId: "run_9" })
    expect(thread().interactionsByRun.run_9?.groups[0]?.items[0]?.item_id).toBe("tool_1")
    expect(thread().stepsByRun.run_9 ?? []).toEqual([])

    engine.stageToolDecision("run_9", "tool_1", { type: "approve" })
    await settle()
    expect(client.controlCalls).toHaveLength(1)
    expect(client.controlCalls[0]).toMatchObject({
      sessionId: "conv_9",
      runId: "run_9",
      body: { kind: "run.resume", decisions: [{ type: "approve", item_id: "tool_1" }] },
    })
    expect(engine.getSnapshot().machine.phase).toBe("waiting")
  })

  it("水合失败（非 404）fail-loud 进错误态", async () => {
    buildEngine(SEEDED)
    client.nextSnapshot = () => Promise.reject(new SessionClientError("http", "status 500"))
    engine.dispose()
    engine = createSessionEngine({ client, storage, now: () => 1_000 })
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "error", error: "status 500" })
  })

  it("外部清空 storage 发生在水合中：结束 loading 并丢弃迟到 snapshot", async () => {
    buildEngine(null)
    let resolveSnapshot!: (value: ReturnType<typeof makeSnapshot> | null) => void
    client.nextSnapshot = () => new Promise((resolve) => { resolveSnapshot = resolve })

    engine.openConversation("conv_hydrating")
    expect(engine.getSnapshot().hydrating).toBe(true)

    storage.clear()
    expect(engine.getSnapshot().store).toBeNull()
    expect(engine.getSnapshot().hydrating).toBe(false)
    expect(engine.getSnapshot().machine.phase).toBe("idle")

    resolveSnapshot(makeSnapshot({ sessionId: "conv_hydrating", eventWatermark: CURSOR_3 }))
    await settle()

    expect(engine.getSnapshot().store).toBeNull()
    expect(engine.getSnapshot().hydrating).toBe(false)
    expect(client.streams).toHaveLength(0)
  })

  it("外部清空 storage 后旧水合请求失败：不污染空态错误", async () => {
    buildEngine(null)
    let rejectSnapshot!: (error: unknown) => void
    client.nextSnapshot = () => new Promise((_resolve, reject) => { rejectSnapshot = reject })

    engine.openConversation("conv_hydrating")
    storage.clear()
    rejectSnapshot(new SessionClientError("network", "late hydration failure"))
    await settle()

    expect(engine.getSnapshot().store).toBeNull()
    expect(engine.getSnapshot().hydrating).toBe(false)
    expect(engine.getSnapshot().machine).toEqual({ phase: "idle", runId: null, error: null })
  })

  it("水合撞 403 session_forbidden：驱逐越权 activeId、回退空态，不 fail-loud 也不拿坏 id 开跑", async () => {
    // 陈旧/越权 activeId（跨用户切换后 localStorage 残留了他人会话 id）：hydrate 撞
    // session_forbidden。不得 fail-loud 卡死，也不得留着这个 id 供 submit 去 POST（必再 403）。
    buildEngine(SEEDED) // activeId=conv_9
    let idCounter = 100
    client.nextSnapshot = (sessionId) =>
      sessionId === "conv_9"
        ? Promise.reject(new SessionClientError("http", "session_forbidden"))
        : Promise.resolve(null) // 驱逐后新建的 fallback 会话：服务端 404→null（空态即真）
    engine.dispose()
    engine = createSessionEngine({
      client,
      storage,
      now: () => 1_000,
      createId: (prefix) => `${prefix}_evict_${(idCounter += 1)}`,
    })
    await settle()
    const store = engine.getSnapshot().store
    expect(engine.getSnapshot().machine.phase).toBe("idle")
    // 越权 id 已被驱逐、不再是活跃项、不再留在本地索引。
    expect(store?.activeId).not.toBe("conv_9")
    expect(store?.conversations.some((c) => c.id === "conv_9")).toBe(false)
    // 驱逐不发 deleteSession（不属于当前用户，无权也不该删服务端）。
    expect(client.deleteCalls).not.toContain("conv_9")
    // 回退后在干净的新会话上开跑：POST 用新 id，正常进 streaming。
    engine.submit("hello")
    await settle()
    expect(client.createCalls.at(-1)?.sessionId).toBe(store?.activeId)
    expect(engine.getSnapshot().machine.phase).toBe("queued")
  })

  it("连续 session_forbidden：新建本地 fallback 后收束，不继续无界水合", async () => {
    buildEngine(SEEDED)
    const requested: string[] = []
    client.nextSnapshot = (sessionId) => {
      requested.push(sessionId)
      return requested.length <= 2
        ? Promise.reject(new SessionClientError("http", "session_forbidden"))
        : Promise.resolve(null)
    }
    engine.dispose()
    engine = createSessionEngine({
      client,
      storage,
      now: () => 1_000,
      createId: (prefix) => `${prefix}_evict_${requested.length}`,
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(requested).toEqual(["conv_9"])
    expect(engine.getSnapshot().store?.activeId).not.toBe("conv_9")
    expect(engine.getSnapshot().store?.conversations).toHaveLength(1)
    expect(engine.getSnapshot().hydrating).toBe(false)
    expect(engine.getSnapshot().machine).toEqual({ phase: "idle", runId: null, error: null })
  })

  it("切会话即重新水合目标会话", async () => {
    let store = addConversation(null, "conv_a", 100)
    store = addConversation(store, "conv_b", 200)
    buildEngine(store)
    await settle()
    expect(client.snapshotCalls).toEqual(["conv_b"])
    engine.selectConversation("conv_a")
    await settle()
    expect(client.snapshotCalls).toEqual(["conv_b", "conv_a"])
    expect(engine.getSnapshot().store?.activeId).toBe("conv_a")
  })

  it("90s reattach 观察窗耗尽只标记连接不可用，并由后继 owner snapshot 收口", async () => {
    vi.useFakeTimers()
    try {
      buildEngine(SEEDED)
      client.nextSnapshot = () =>
        Promise.resolve(
          makeSnapshot({
            sessionId: "conv_9",
            activeRun: { run_id: "run_9", status: "running" },
            messages: [{
              message_id: "assistant_partial", role: "assistant", run_id: "run_9",
              content: "confirmed partial", status: "streaming", created_at: "2026-07-02T00:00:01Z",
            }],
          }),
        )
      engine.dispose()
      engine = createSessionEngine({ client, storage, now: () => 1_000 })
      await vi.advanceTimersByTimeAsync(0)
      expect(engine.getSnapshot().machine.phase).toBe("streaming")
      await vi.advanceTimersByTimeAsync(90_000)
      expect(engine.getSnapshot().machine).toMatchObject({ phase: "streaming", runId: "run_9" })
      expect(engine.getSnapshot().connection).toEqual({ status: "unavailable", reason: "timeout" })
      expect(thread().messages.at(-1)).toMatchObject({ content: "confirmed partial", runId: "run_9" })
      expect(client.lastStream().closed).toBe(true)

      client.nextSnapshot = () => Promise.resolve(makeSnapshot({
        sessionId: "conv_9",
        eventWatermark: CURSOR_20,
        messages: [{
          message_id: "assistant_done", role: "assistant", run_id: "run_9",
          content: "owner completed", status: "completed", created_at: "2026-07-02T00:00:02Z",
        }],
      }))
      engine.reconnect()
      await vi.advanceTimersByTimeAsync(0)
      expect(engine.getSnapshot().machine).toMatchObject({ phase: "idle", runId: null })
      expect(thread().messages.at(-1)).toMatchObject({ content: "owner completed", runId: "run_9" })
      expect(engine.getSnapshot().connection).toEqual({ status: "connected" })
      expect(client.streams).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it("水合落在待批帧时不设兜底超时（用户决策不限时）", async () => {
    vi.useFakeTimers()
    try {
      buildEngine(SEEDED)
      client.nextSnapshot = () =>
        Promise.resolve(
          makeSnapshot({
            sessionId: "conv_9",
            activeRun: { run_id: "run_9", status: "waiting_input" },
            pendingPauses: [makePendingPause({ run_id: "run_9" })],
          }),
        )
      engine.dispose()
      engine = createSessionEngine({ client, storage, now: () => 1_000 })
      await vi.advanceTimersByTimeAsync(0)
      expect(engine.getSnapshot().machine.phase).toBe("waiting")
      await vi.advanceTimersByTimeAsync(90_000)
      expect(engine.getSnapshot().machine.phase).toBe("waiting")
    } finally {
      vi.useRealTimers()
    }
  })

  it("落盘漂移：storage 读出 null 时引擎从空态启动，不水合不开流", async () => {
    buildEngine(null)
    await settle()
    expect(engine.getSnapshot().store).toBeNull()
    expect(engine.getSnapshot().machine.phase).toBe("idle")
    expect(client.snapshotCalls).toHaveLength(0)
    expect(client.streams).toHaveLength(0)
  })
})

describe("失败重试", () => {
  it("POST 失败后 retry：复用同一 idempotency_key（服务端命中即重放 receipt）", async () => {
    buildEngine()
    client.nextCreate = () => Promise.reject(new SessionClientError("http", "status 500"))
    engine.submit("hello")
    await settle()
    expect(engine.getSnapshot()).toMatchObject({
      machine: { phase: "error" },
      canRetryPendingSubmission: true,
    })

    client.nextCreate = () => Promise.resolve(makeReceipt("run_retry"))
    engine.retry()
    await settle()
    expect(client.createCalls).toHaveLength(2)
    expect(client.createCalls[1]).toEqual(client.createCalls[0])
    expect(client.createCalls[0]?.body).toEqual({
      idempotency_key: expect.any(String), content: "hello", thinking: false, selected_skill_source_refs: [],
    })
    expect(thread().messages).toHaveLength(1)
    expect(engine.getSnapshot()).toMatchObject({
      machine: { phase: "queued", runId: "run_retry" },
      canRetryPendingSubmission: false,
    })
  })

  it("未获回执重试冻结首发完整意图，偏好变化不改变同 key 的请求摘要", async () => {
    buildEngine()
    engine.setMode("thinking")
    engine.setModel("model_original")
    engine.setAgent("agent_original")
    engine.setSelectedSkillSourceRefs(["skill:original.v1"])
    client.nextCreate = () => Promise.reject(new SessionClientError("network", "unknown commit"))
    engine.submit("hello")
    await settle()
    expect(engine.getSnapshot().machine.phase).toBe("error")

    engine.setMode("fast")
    engine.setModel("model_new")
    engine.setAgent("agent_new")
    engine.setSelectedSkillSourceRefs(["skill:new.v1"])
    client.nextCreate = () => Promise.resolve(makeReceipt("run_retry"))
    engine.retry()
    await settle()

    expect(client.createCalls).toHaveLength(2)
    expect(client.createCalls[1]).toEqual(client.createCalls[0])
    expect(client.createCalls[0]?.body).toMatchObject({
      idempotency_key: expect.any(String), content: "hello", thinking: true,
      model: "model_original", agent: "agent_original", selected_skill_source_refs: ["skill:original.v1"],
    })
  })

  it.each([
    AGENT_FAILURE_PROFILES.find((profile) => profile.code === "internal_error")!,
    AGENT_FAILURE_PROFILES.find((profile) => profile.code === "model_unavailable" && profile.retryable)!,
  ])("Agent terminal $code retryable=$retryable 后 retry 不重发原 user", async (profile) => {
    buildEngine()
    engine.submit("job")
    await settle()
    client.lastStream().emit([
      makeEvent("run.created", { run_id: "run_1" }),
      makeAgentFailureEvent(profile),
    ])
    await settle()
    expect(thread().runStatus).toBe("failed")
    expect(thread().runFailuresById.run_1).toEqual({ failedRunId: "run_1", kind: "agent", profile })
    expect(engine.getSnapshot()).toMatchObject({
      machine: { phase: "idle" },
      canRetryPendingSubmission: false,
    })

    engine.retry()
    await settle()
    expect(client.createCalls).toHaveLength(1)
    expect(thread().runFailuresById.run_1).toEqual({ failedRunId: "run_1", kind: "agent", profile })
  })

  it("BFF dispatch terminal 后 retry 不重发原 user", async () => {
    buildEngine()
    engine.submit("job")
    await settle()
    client.lastStream().emit([
      makeDispatchFailureEvent("9007199254740993123456789", {
        event_id: CURSOR_7, session_id: "conv_1", run_id: "run_1",
      }),
    ], [CURSOR_7])
    await settle()
    expect(thread().runStatus).toBe("failed")
    expect(thread().runFailuresById.run_1).toEqual({ failedRunId: "run_1", kind: "dispatch" })

    engine.retry()
    await settle()
    expect(client.createCalls).toHaveLength(1)
  })

  it.each([
    ["无用户消息", () => {}],
    ["流式中（双发守卫）", (target: SessionEngine) => target.submit("go")],
  ])("retry 边界：%s 时不产生额外 POST", async (_label, arrange) => {
    buildEngine()
    arrange(engine)
    await settle()
    const callsBefore = client.createCalls.length
    engine.retry()
    await settle()
    expect(client.createCalls.length).toBe(callsBefore)
  })
})

describe("typed Skill 选择的会话边界", () => {
  const twoConversations: ConversationStore = {
    activeId: "conv_a",
    conversations: [
      { id: "conv_a", title: "A", updatedAt: 2, mode: "fast" },
      { id: "conv_b", title: "B", updatedAt: 1, mode: "fast" },
    ],
  }

  it("新建或切换到不同会话时清空上一会话选择", async () => {
    buildEngine(twoConversations)
    await settle()
    engine.setSelectedSkillSourceRefs(["skill:a.v1"])
    engine.selectConversation("conv_b")
    await settle()
    engine.submit("from B")
    await settle()
    expect(client.createCalls.at(-1)?.body.selected_skill_source_refs).toEqual([])

    engine.setSelectedSkillSourceRefs(["skill:b.v1"])
    engine.newConversation()
    engine.submit("from new")
    await settle()
    expect(client.createCalls.at(-1)?.body.selected_skill_source_refs).toEqual([])
  })

  it("删除非活跃会话保留当前选择，删除活跃会话则清空", async () => {
    buildEngine(twoConversations)
    await settle()
    engine.setSelectedSkillSourceRefs(["skill:a.v1"])
    engine.deleteConversation("conv_b")
    engine.submit("still A")
    await settle()
    expect(client.createCalls.at(-1)?.body.selected_skill_source_refs).toEqual(["skill:a.v1"])

    engine.deleteConversation("conv_a")
    engine.submit("fallback")
    await settle()
    expect(client.createCalls.at(-1)?.body.selected_skill_source_refs).toEqual([])
  })
})

describe("模式驱动 wire（thinking）", () => {
  it("空首屏选 thinking：落 pendingMode、首会话承接、thinking=true 随 POST 上 wire、开聊锁定", async () => {
    buildEngine()
    engine.setMode("thinking")
    expect(engine.getSnapshot().pendingMode).toBe("thinking")
    engine.submit("go")
    await settle()
    expect(activeEntry().mode).toBe("thinking")
    // 模式进 wire：thinking 档 → thinking=true（后端各 provider 翻成原生推理开关）。
    expect(client.createCalls[0]?.body.thinking).toBe(true)
    // 已开聊锁定：切换被忽略。
    engine.setMode("fast")
    expect(activeEntry().mode).toBe("thinking")
  })

  it("fast 会话 submit：thinking=false 显式上 wire（后端关推理）", async () => {
    buildEngine()
    engine.submit("go")
    await settle()
    expect(activeEntry().mode).toBe("fast")
    expect(client.createCalls[0]?.body.thinking).toBe(false)
  })
})

describe("运行中插话（steer）", () => {
  it("streaming 相位提交：消息即时落地、同端点再 POST、状态机与事件流不被打断", async () => {
    buildEngine()
    engine.submit("hello")
    await settle()
    client.lastStream().emit([makeEvent("run.created", { run_id: "run_1" })])
    await settle()
    expect(engine.getSnapshot().machine.phase).toBe("streaming")
    const streamsBefore = client.streams.length

    expect(engine.submit("改成国内市场")).toBe(true)
    expect(thread().messages.filter((m) => m.role === "user").map((m) => m.content)).toEqual([
      "hello",
      "改成国内市场",
    ])
    expect(engine.getSnapshot().machine.phase).toBe("streaming")
    await settle()
    expect(client.createCalls).toHaveLength(2)
    expect(client.createCalls[1]!.body.content).toBe("改成国内市场")
    expect(client.streams.length).toBe(streamsBefore) // 不重开事件流
  })

  it("submitting 相位（未获回执）双发仍被拒：不误当插话", async () => {
    buildEngine()
    expect(engine.submit("hello")).toBe(true)
    expect(engine.submit("过早的第二条")).toBe(false)
    expect(thread().messages.filter((m) => m.role === "user")).toHaveLength(1)
    await settle()
    expect(client.createCalls).toHaveLength(1)
  })

  it("同步前置条件拒绝时明确返回 false 且不创建请求", () => {
    buildEngine()
    expect(engine.submit("   ")).toBe(false)
    engine.dispose()
    expect(engine.submit("disposed submission")).toBe(false)
    expect(client.createCalls).toHaveLength(0)
  })

  it("expired cursor 正在重新水合时拒绝提交且不创建请求", async () => {
    const seeded = addConversation(null, "conv_recovering", 500)
    buildEngine(seeded)
    client.nextSnapshot = () => Promise.resolve(makeSnapshot({
      sessionId: "conv_recovering",
      eventWatermark: CURSOR_7,
      activeRun: { run_id: "run_active", status: "running" },
    }))
    engine.dispose()
    engine = createSessionEngine({ client, storage, now: () => 1_000 })
    await settle()
    expect(client.streams).toHaveLength(1)

    client.nextSnapshot = () => new Promise(() => {})
    client.lastStream().fail(new SessionClientError("http", "410", "event_cursor_expired"))
    const callsBefore = client.createCalls.length
    expect(engine.submit("must wait for snapshot recovery")).toBe(false)
    expect(client.createCalls).toHaveLength(callsBefore)
  })

  it("SSE message.user 先于插话回执到达：吸收本地 echo，无同 id 双份（真栈走查回归）", async () => {
    buildEngine()
    engine.submit("hello")
    await settle()
    client.lastStream().emit([makeEvent("run.created", { run_id: "run_1" })])
    await settle()
    // 挂起回执：publishLive 先于 HTTP 返回是 steer 常态。
    let release!: (receipt: ReturnType<typeof makeReceipt>) => void
    client.nextCreate = () => new Promise((resolve) => { release = resolve })
    engine.submit("顺便注意编码")
    client.lastStream().emit([
      makeEvent("message.user", { message_id: "msg_steer_k9", content: "顺便注意编码" }),
    ])
    release({ run_id: "run_1", user_message_id: "msg_steer_k9", assistant_message_id: "run_1:assistant" })
    await settle()
    const ids = thread().messages.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(thread().messages.filter((m) => m.role === "user").map((m) => m.content)).toEqual([
      "hello",
      "顺便注意编码",
    ])
  })
})

  it("插话投递失败 → 瞬态 notice 可见；下次提交自动清空", async () => {
    buildEngine()
    engine.submit("hello")
    await settle()
    client.lastStream().emit([makeEvent("run.created", { run_id: "run_1" })])
    await settle()
    const okStart = client.nextCreate
    client.nextCreate = () => Promise.reject(new SessionClientError("http", "boom"))
    engine.submit("插话一")
    await settle()
    expect(engine.getSnapshot().notice?.key).toBe("steer.sendFailed")
    client.nextCreate = okStart
    engine.submit("插话二")
    expect(engine.getSnapshot().notice).toBeNull()
  })

describe("会话软删除（technical/16 SD-W1）", () => {
  it("deleteConversation：本地立即移除 + 服务端软删除 fire-and-forget", async () => {
    buildEngine()
    engine.submit("将要被删除的会话")
    await settle()
    const doomed = engine.getSnapshot().store?.activeId
    if (doomed === undefined || doomed === null) throw new Error("active conversation expected")
    engine.deleteConversation(doomed)
    const remaining = engine.getSnapshot().store?.conversations ?? []
    expect(remaining.some((entry) => entry.id === doomed)).toBe(false)
    expect(client.deleteCalls).toEqual([doomed])
  })
})

describe("openConversation：打开服务端清单会话（SESS-LIST）", () => {
  it("本地索引未见的 id：纳入缓存 + 置为活跃 + 按 snapshot 水合", async () => {
    buildEngine()
    engine.openConversation("ses_server_1")
    await settle()
    const store = engine.getSnapshot().store
    expect(store?.activeId).toBe("ses_server_1")
    expect(store?.conversations.some((entry) => entry.id === "ses_server_1")).toBe(true)
    // 采纳后按 snapshot 水合：向服务端取该会话快照。
    expect(client.snapshotCalls).toContain("ses_server_1")
  })

  it("已在本地索引的 id：普通切换，不重复追加条目", async () => {
    buildEngine()
    engine.submit("first")
    await settle()
    const firstId = engine.getSnapshot().store?.activeId
    if (!firstId) throw new Error("expected active id")
    engine.openConversation("ses_other")
    await settle()
    engine.openConversation(firstId)
    await settle()
    const store = engine.getSnapshot().store
    expect(store?.activeId).toBe(firstId)
    expect(store?.conversations.filter((entry) => entry.id === firstId)).toHaveLength(1)
  })
})


import {
  makePublic4Frame as r66Frame, makePublic4Interaction as r66Interaction,
  makePublic4Snapshot as r66Snapshot, makePublic4QueuedFrame as r66Queued,
  makePublic4StateFrame as r66StateFrame, makePublic4Resume as r66Resume,
  public4StagedDecisions as r66Staged,
} from "../core/fixtures"
import { createPublic4HttpFixture as r66HttpFixture } from "./fakes"

function r66BuildHttpEngine(snapshot: Record<string, unknown>) {
  const http = r66HttpFixture(snapshot)
  vi.spyOn(globalThis, "fetch").mockImplementation(http.fetcher)
  storage = createMemoryStorage<ConversationStore>(addConversation(null, "conv_9", 500))
  let id = 0
  engine = createSessionEngine({
    client: http.client, storage, now: () => 1_000,
    createId: (prefix) => "r66_" + prefix + "_" + ++id,
  })
  return http
}

function r66Stage(items = r66Staged()) {
  for (const [itemId, decision] of items) {
    Reflect.apply(engine.stageToolDecision, engine, ["run_1", itemId, decision])
  }
}

describe("R66 public4 real HTTP admission/FIFO/reload/HITL", () => {
  afterEach(() => vi.restoreAllMocks())

  it("does not turn a create admission receipt into RUN_STARTED", async () => {
    buildEngine()
    engine.submit("R66 receipt is admission")
    await settle()
    expect(client.createCalls).toHaveLength(1)
    expect(thread().messages.filter((message) => message.role === "user")).toHaveLength(1)
    expect(engine.getSnapshot().machine.phase).not.toBe("streaming")
  })

  it.each(["queued", "active", "waiting", "resuming"] as const)(
    "reloads %s from the complete snapshot at its nonzero cursor without a new POST",
    async (state) => {
      const http = r66BuildHttpEngine(r66Snapshot({ state }))
      await settle()
      expect(http.streams).toHaveLength(1)
      expect(http.streams[0]?.headers.get("last-event-id")).toBe(CURSOR_20)
      expect(engine.getSnapshot().machine).toMatchObject({
        phase: state === "active" ? "streaming" : state, runId: "run_1",
      })
      expect(thread().messages.map(({ id, content }) => ({ id, content }))).toEqual([
        { id: "r66_user", content: "R66 original request" },
        { id: "r66_assistant", content: "R66 durable prefix" },
      ])
      expect(http.requests.filter((request) => request.method === "POST")).toHaveLength(0)
    },
  )

  it("drains A terminal and B queued in separate batches and ignores a late A terminal", async () => {
    const http = r66BuildHttpEngine(r66Snapshot({ state: "active" }))
    await settle()
    expect(http.streams).toHaveLength(1)
    const history = [
      { message_id: "r66_user", role: "user" as const, content: "R66 original request", status: "completed" as const,
        created_at: "2026-10-02T00:00:00Z", run_id: "run_1" },
      { message_id: "r66_assistant", role: "assistant" as const, content: "R66 durable prefix", status: "completed" as const,
        created_at: "2026-10-02T00:00:01Z", run_id: "run_1" },
      { message_id: "r66_b_user", role: "user" as const, content: "R66 second request", status: "completed" as const,
        created_at: "2026-10-02T00:00:02Z", run_id: "run_2" },
      { message_id: "r66_b_assistant", role: "assistant" as const, content: "", status: "pending" as const,
        created_at: "2026-10-02T00:00:03Z", run_id: "run_2" },
    ]
    http.setSnapshot(r66Snapshot({ state: "queued", runId: "run_2", watermark: CURSOR_30, messages: history }))
    http.emit(CURSOR_30, r66Frame({ type: "RUN_FINISHED", threadId: "conv_9",
      runId: "run_1", status: "completed", outcome: { type: "success" } }, 30))
    await settle()
    expect(http.streams.at(-1)?.closed).toBe(false)
    http.emit("agui_0000000000000000000000000000001f", r66Queued(undefined, "run_2"))
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "queued", runId: "run_2" })
    http.emit("agui_00000000000000000000000000000020", r66Frame({
      type: "RUN_STARTED", threadId: "conv_9", runId: "run_2",
    }, 1, "run_2"))
    http.emit("agui_00000000000000000000000000000021", r66Frame({
      type: "TEXT_MESSAGE_START", messageId: "r66_b_assistant", role: "assistant",
    }, 2, "run_2"))
    http.emit("agui_00000000000000000000000000000022", r66Frame({
      type: "TEXT_MESSAGE_CONTENT", messageId: "r66_b_assistant", delta: "R66 second answer",
    }, 3, "run_2"))
    await settle()
    http.emit("agui_00000000000000000000000000000023", r66Frame({
      type: "RUN_FINISHED", threadId: "conv_9", runId: "run_1",
    }, 31))
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "streaming", runId: "run_2" })
    expect(thread().messages.some((message) => message.content === "R66 second answer")).toBe(true)
    const completed = history.map((message) => message.message_id === "r66_b_assistant"
      ? { ...message, content: "R66 second answer", status: "completed" as const } : message)
    http.setSnapshot(r66Snapshot({ state: "none", watermark: "agui_00000000000000000000000000000024", messages: completed }))
    http.emit("agui_00000000000000000000000000000024", r66Frame({
      type: "RUN_FINISHED", threadId: "conv_9", runId: "run_2",
      status: "completed", outcome: { type: "success" },
    }, 4, "run_2"))
    await settle()
    expect(engine.getSnapshot().machine.phase).toBe("idle")
    expect(http.streams.at(-1)?.closed).toBe(true)
    expect(thread().messages.map(({ id, content }) => ({ id, content }))).toEqual(
      completed.map(({ message_id, content }) => ({ id: message_id, content })),
    )
    expect(http.requests.filter((request) => request.method === "POST")).toHaveLength(0)
  })

  it("recovers one GC410 snapshot-first and reopens only at the fresh owner watermark", async () => {
    const http = r66HttpFixture(r66Snapshot({ state: "active" }))
    http.expireNextStream()
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).includes("/events")) http.setSnapshot(r66Snapshot({ state: "active", watermark: CURSOR_30 }))
      return http.fetcher(input, init)
    })
    storage = createMemoryStorage<ConversationStore>(addConversation(null, "conv_9", 500))
    engine = createSessionEngine({ client: http.client, storage, now: () => 1_000 })
    await settle()
    expect(http.requests.filter((request) => request.method === "GET" && /\/sessions\/[^/]+$/u.test(request.path))).toHaveLength(2)
    expect(http.streams).toHaveLength(1)
    expect(http.streams[0]?.headers.get("last-event-id")).toBe(CURSOR_30)
    expect(http.requests.filter((request) => request.method === "POST")).toHaveLength(0)
  })

  it("sends one whole pause and retains ACK/accepted/unknown until native consumption and a fresh validation pause", async () => {
    const http = r66BuildHttpEngine(r66Snapshot())
    await settle()
    expect(http.streams).toHaveLength(1)
    r66Stage([["extra_item", { type: "approve" }]])
    r66Stage([["item_approve", { type: "submit", value: {} }]])
    expect(http.controls).toHaveLength(0)
    r66Stage(r66Staged().slice(0, 1))
    r66Stage(r66Staged().slice(0, 1))
    expect(http.controls).toHaveLength(0)
    r66Stage(r66Staged().slice(1))
    await settle()
    expect(http.controls).toHaveLength(1)
    expect(http.controls[0]?.body).toEqual(r66Resume())
    expect(engine.getSnapshot().machine.phase).toBe("waiting")
    r66Stage()
    expect(http.controls).toHaveLength(1)
    const key = http.controls[0]!.key
    expect(key).toBeTruthy()
    const action = { command_id: key, pause_revision: 2, kind: "accepted" as const }
    http.emit("agui_00000000000000000000000000000015", r66StateFrame(r66Interaction({
      interaction_revision: 5, phase: "resuming", action_result: action,
    }), 21))
    await settle()
    expect(engine.getSnapshot().machine.phase).toBe("resuming")
    r66Stage()
    expect(http.controls).toHaveLength(1)
    http.emit("agui_00000000000000000000000000000016", r66StateFrame(r66Interaction({
      interaction_revision: 6, phase: "resuming", action_result: { ...action, kind: "unknown" },
    }), 22))
    await settle()
    r66Stage()
    expect(http.controls).toHaveLength(1)
    http.emit("agui_00000000000000000000000000000017", r66StateFrame(r66Interaction({
      interaction_revision: 7, phase: "active", groups: [],
      action_result: { ...action, kind: "native_consumed" },
    }), 23))
    await settle()
    expect(engine.getSnapshot().machine.phase).toBe("streaming")
    const next = r66Interaction({
      interaction_revision: 8, pause_revision: 3, pause_ref: "pause_r66_3",
      action_result: { ...action, kind: "validation_failed" },
    })
    next.groups[0]!.items[0]!.validation = { code: "json_schema_invalid", instance_path: ["text"] }
    http.emit("agui_00000000000000000000000000000018", r66StateFrame(next, 24))
    await settle()
    expect(engine.getSnapshot().machine.phase).toBe("waiting")
    expect(http.controls).toHaveLength(1)
    r66Stage()
    await settle()
    expect(http.controls).toHaveLength(2)
    expect(http.controls[1]?.body).toEqual({ ...r66Resume(), expected_pause_revision: 3, pause_ref: "pause_r66_3" })
    expect(http.controls[1]?.key).not.toBe(key)
  })

  it("does not let an old pause ACK clear a new pause's partial decisions", async () => {
    const http = r66BuildHttpEngine(r66Snapshot())
    let resolveAck: (response: Response) => void = () => {}
    http.controlReply = () => new Promise<Response>((resolve) => { resolveAck = resolve })
    await settle()
    expect(http.streams).toHaveLength(1)
    r66Stage()
    await settle()
    expect(http.controls).toHaveLength(1)
    const old = http.controls[0]!
    http.emit("agui_00000000000000000000000000000015", r66StateFrame(r66Interaction({
      interaction_revision: 5, pause_revision: 3, pause_ref: "pause_r66_3",
    }), 21))
    await settle()
    r66Stage(r66Staged().slice(0, 1))
    const staged = structuredClone(engine.getSnapshot().staging)
    resolveAck(new Response(JSON.stringify({ run_id: "run_1", command_id: old.key, request_digest: "sha256:r66",
        status: "succeeded", replayed: false }), { status: 202, headers: { "content-type": "application/json" } }))
    await settle()
    expect(engine.getSnapshot().machine.phase).toBe("waiting")
    expect(engine.getSnapshot().staging).toEqual(staged)
    r66Stage(r66Staged().slice(1))
    await settle()
    expect(http.controls).toHaveLength(2)
    expect(http.controls[1]?.body).toEqual({ ...r66Resume(), expected_pause_revision: 3, pause_ref: "pause_r66_3" })
    expect(http.controls[1]?.key).not.toBe(old.key)
  })
})


describe("R66 public4 snapshot-seeded revision and collection guard", () => {
  afterEach(() => vi.restoreAllMocks())

  it.each(["regression", "presence", "locator"] as const)(
    "rejects %s against snapshot state before the first live state cursor",
    async (variant) => {
      const http = r66BuildHttpEngine(r66Snapshot())
      await settle()
      expect(http.streams).toHaveLength(1)
      const bad = r66Interaction()
      if (variant === "regression") bad.interaction_revision = 3
      if (variant === "presence") bad.groups[0]!.items[0]!.validation = null
      if (variant === "locator") { bad.interaction_revision = 5; bad.pause_ref = "wrong_same_pause" }
      http.emit("agui_00000000000000000000000000000015", r66StateFrame(bad, 21))
      await settle()
      expect(thread().resumeCursor).toBe(CURSOR_20)
      expect(engine.getSnapshot().connection.status).toBe("unavailable")
      expect(engine.getSnapshot().machine.phase).toBe("waiting")
      expect(http.controls).toHaveLength(0)
    },
  )

  it("replaces the whole collection and discards earlier staging even with the same pause locator", async () => {
    const http = r66BuildHttpEngine(r66Snapshot())
    await settle()
    expect(http.streams).toHaveLength(1)
    r66Stage(r66Staged().slice(0, 1))
    const next = r66Interaction({ interaction_revision: 5 })
    next.groups = next.groups.slice(0, 1)
    http.emit("agui_00000000000000000000000000000015", r66StateFrame(next, 21))
    await settle()
    r66Stage(r66Staged().slice(1, 2))
    expect(http.controls).toHaveLength(0)
    r66Stage(r66Staged().slice(0, 1))
    await settle()
    expect(http.controls).toHaveLength(1)
    expect(http.controls[0]?.body).toEqual({
      ...r66Resume(), decisions: r66Resume().decisions.slice(0, 2),
    })
  })
})


describe("R66 public4 frozen unknown control intent", () => {
  afterEach(() => vi.restoreAllMocks())

  it("retries an unknown HTTP outcome with the original key/body rather than edited same-key semantics", async () => {
    const http = r66BuildHttpEngine(r66Snapshot())
    const success = http.controlReply
    let calls = 0
    http.controlReply = (call) => ++calls === 1
      ? Promise.reject(new TypeError("R66 simulated network outcome unknown")) : success(call)
    await settle()
    expect(http.streams).toHaveLength(1)
    r66Stage()
    await settle()
    expect(http.controls).toHaveLength(1)
    expect(engine.getSnapshot().machine.phase).toBe("waiting")
    r66Stage([["item_edit", { type: "edit", args: { text: "different intent" } }]])
    await settle()
    expect(http.controls).toHaveLength(1)
    r66Stage(r66Staged().slice(0, 1))
    await settle()
    expect(http.controls).toHaveLength(2)
    expect(http.controls[1]).toEqual(http.controls[0])
    expect(http.controls[1]?.body).toEqual(r66Resume())
  })
})

// R70 readonly review findings: admission cannot replace durable pause state.
describe("R70 monotonic head and explicit frozen resume retry", () => {
  afterEach(() => vi.restoreAllMocks())

  it("does not downgrade a waiting head on late queued or RUN_STARTED admission", async () => {
    const http = r66BuildHttpEngine(r66Snapshot())
    await settle()
    const before = structuredClone(thread().interactionsByRun.run_1)
    http.emit("agui_00000000000000000000000000000015", r66Queued())
    http.emit("agui_00000000000000000000000000000016", r66Frame({ type: "RUN_STARTED", threadId: "conv_9", runId: "run_1" }, 22))
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "waiting", runId: "run_1" })
    expect(thread().executionHead).toMatchObject({ state: "waiting", pending_pauses: [before] })
    expect(thread().interactionsByRun.run_1).toEqual(before)
    expect(http.controls).toHaveLength(0)
    expect(http.streams[0]?.closed).toBe(false)
  })

  it("clears the interaction pause on terminal state without inventing a Run terminal", async () => {
    const http = r66BuildHttpEngine(r66Snapshot())
    await settle()
    http.emit("agui_00000000000000000000000000000015", r66StateFrame(r66Interaction({
      interaction_revision: 5, phase: "terminal", groups: [], action_result: null,
    }), 21))
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "streaming", runId: "run_1" })
    expect(thread().executionHead).toEqual({ run_id: "run_1", state: "active", pending_pauses: [] })
    expect(thread().interactionsByRun.run_1?.groups).toEqual([])
    expect(http.streams[0]?.closed).toBe(false)
    expect(http.controls).toHaveLength(0)
  })

  it("explicitly retries durable unknown using the existing key and immutable body, not fresh decisions", async () => {
    const http = r66BuildHttpEngine(r66Snapshot())
    await settle()
    r66Stage()
    await settle()
    const first = structuredClone(http.controls[0]!)
    http.emit("agui_00000000000000000000000000000015", r66StateFrame(r66Interaction({
      interaction_revision: 5, phase: "resuming",
      action_result: { command_id: first.key, pause_revision: 2, kind: "unknown" },
    }), 21))
    await settle()
    expect(engine.getSnapshot().canRetryResume).toBe(true)
    r66Stage()
    expect(http.controls).toHaveLength(1)
    engine.retryResume()
    engine.retryResume()
    await settle()
    expect(http.controls).toHaveLength(2)
    expect(http.controls[1]).toEqual(first)
    expect(engine.getSnapshot().machine.phase).toBe("resuming")
    expect(engine.getSnapshot().canRetryResume).toBe(false)
    expect(thread().interactionsByRun.run_1?.groups).toHaveLength(2)
  })
})

// R70 terminal reconciliation follows owner facts, never lexical cursor order.
describe("R70 terminal snapshot and late admission boundaries", () => {
  afterEach(() => vi.restoreAllMocks())
  it("accepts a new owner head whose opaque watermark is lexically smaller", async () => {
    const http = r66BuildHttpEngine(r66Snapshot({ state: "active" }))
    await settle()
    const cursor = "agui_00000000000000000000000000000001"
    http.setSnapshot(r66Snapshot({ state: "queued", runId: "run_2", watermark: cursor }))
    http.emit(CURSOR_30, r66Frame({ type: "RUN_FINISHED", threadId: "conv_9", runId: "run_1", status: "completed" }, 30))
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "queued", runId: "run_2" })
    expect(http.streams[0]?.closed).toBe(true)
    expect(http.streams).toHaveLength(2)
    expect(http.streams[1]?.closed).toBe(false)
    expect(http.streams[1]?.headers.get("last-event-id")).toBe(cursor)
  })
  it("reopens for a late B admission receipt after A terminal reconciles to no head", async () => {
    buildEngine()
    engine.submit("A")
    await settle()
    client.lastStream().emit([makeEvent("run.created", { run_id: "run_1" })])
    await settle()
    let release!: (receipt: ReturnType<typeof makeReceipt>) => void
    client.nextCreate = () => new Promise((resolve) => { release = resolve })
    expect(engine.submit("B")).toBe(true)
    const original = client.lastStream()
    original.emit([makeEvent("run.completed", { status: "completed" })], [CURSOR_30])
    await settle()
    expect(engine.getSnapshot().machine.phase).toBe("idle")
    expect(original.closed).toBe(true)
    release(makeReceipt("run_2"))
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "queued", runId: "run_2" })
    expect(client.streams).toHaveLength(2)
    expect(client.lastStream()).toMatchObject({ closed: false, resumeCursor: CURSOR_30 })
    expect(thread().messages.filter((message) => message.role === "user").map((message) => message.content)).toEqual(["A", "B"])
    expect(client.createCalls).toHaveLength(2)
  })
  it("cancel failure and wrong-run terminal retain cancelling and confirmed partial text", async () => {
    buildEngine()
    engine.submit("A")
    await settle()
    client.lastStream().emit([makeEvent("run.created", { run_id: "run_1" }), makeEvent("message.delta", { segment_id: "partial", delta: "confirmed" })])
    await settle()
    client.nextControl = () => Promise.reject(new SessionClientError("network", "cancel outcome unknown"))
    engine.cancelRun()
    await settle()
    expect(engine.getSnapshot().machine.phase).toBe("cancelling")
    expect(thread().messages.at(-1)?.content).toBe("confirmed")
    expect(client.lastStream().closed).toBe(false)
    client.lastStream().emit([makeEvent("run.completed", { status: "cancelled" }, { run_id: "other" })])
    await settle()
    expect(engine.getSnapshot().machine.phase).toBe("cancelling")
    expect(client.lastStream().closed).toBe(false)
    client.lastStream().emit([makeEvent("run.completed", { status: "cancelled" })])
    await settle()
    expect(engine.getSnapshot().machine.phase).toBe("idle")
    expect(thread().messages.at(-1)?.content).toBe("confirmed")
  })
})

it("R70 late admitted B receipt does not resurrect an already observed B terminal", async () => {
  buildEngine()
  engine.submit("A")
  await settle()
  client.lastStream().emit([makeEvent("run.created", { run_id: "run_1" })])
  await settle()
  let release!: (receipt: ReturnType<typeof makeReceipt>) => void
  client.nextCreate = () => new Promise((resolve) => { release = resolve })
  engine.submit("B")
  client.lastStream().emit([
    makeEvent("run.completed", { status: "completed" }),
    makeEvent("run.created", { run_id: "run_2" }, { run_id: "run_2" }),
    makeEvent("run.completed", { status: "completed" }, { run_id: "run_2" }),
  ])
  await settle()
  expect(engine.getSnapshot().machine.phase).toBe("idle")
  release(makeReceipt("run_2"))
  await settle()
  expect(engine.getSnapshot().machine.phase).toBe("idle")
  expect(client.streams).toHaveLength(1)
  expect(client.lastStream().closed).toBe(true)
})

it("R70 hydrate generation discards a pending successor receipt after clearing terminal evidence", async () => {
  buildEngine({ activeId: "session_s", conversations: [
    { id: "session_s", title: "S", updatedAt: 2, mode: "fast" },
    { id: "session_t", title: "T", updatedAt: 1, mode: "fast" },
  ] })
  await settle()
  engine.submit("A")
  await settle()
  client.lastStream().emit([makeEvent("run.created", { run_id: "run_1" })])
  await settle()
  let release!: (receipt: ReturnType<typeof makeReceipt>) => void
  client.nextCreate = () => new Promise((resolve) => { release = resolve })
  engine.submit("B")
  client.lastStream().emit([makeEvent("run.completed", { status: "completed" })])
  await settle()
  engine.selectConversation("session_t")
  await settle()
  engine.openConversation("session_s")
  await settle()
  const streams = client.streams.length
  release(makeReceipt("run_2"))
  await settle()
  expect(engine.getSnapshot().machine.phase).toBe("idle")
  expect(client.streams).toHaveLength(streams)
  expect(thread().messages).toHaveLength(0)
})

// R74: RR snapshot, watermark, and mapper baseline must replace one generation.
import type { OpenEventsArgs as R74OpenEventsArgs } from "@/engine/client"

const R74_W3 = "agui_00000000000000000000000000000028"
const R74_OLD = "agui_0000000000000000000000000000001f"
const R74_NEXT = "agui_00000000000000000000000000000029"
function r74Snapshot(state: "waiting" | "active") {
  return r66Snapshot({ state, runId: "run_2", watermark: R74_W3,
    interaction: r66Interaction({ interaction_revision: 3 }),
    messages: [
      { message_id: "a_user", role: "user", run_id: "run_1", content: "A request", status: "completed", created_at: "2026-10-02T00:00:00Z" },
      { message_id: "a_assistant", role: "assistant", run_id: "run_1", content: "A answer", status: "completed", created_at: "2026-10-02T00:00:01Z" },
      { message_id: "b_user", role: "user", run_id: "run_2", content: "B request", status: "completed", created_at: "2026-10-02T00:00:02Z" },
      { message_id: "b_assistant", role: "assistant", run_id: "run_2", content: "B full prefix", status: "streaming", created_at: "2026-10-02T00:00:03Z" },
    ],
  })
}
function r74CaptureSubscriptions(http: ReturnType<typeof r66BuildHttpEngine>) {
  const subscriptions: R74OpenEventsArgs[] = []
  const open = http.client.openEvents
  vi.spyOn(http.client, "openEvents").mockImplementation((args) => {
    subscriptions.push(args)
    return open(args)
  })
  return subscriptions
}
async function r74Terminal(http: ReturnType<typeof r66BuildHttpEngine>, state: "waiting" | "active") {
  http.setSnapshot(r74Snapshot(state))
  http.emit(CURSOR_30, r66Frame({ type: "RUN_FINISHED", threadId: "conv_9", runId: "run_1", status: "completed" }, 30))
  await settle()
}

describe("R74 atomic terminal RR snapshot takeover", () => {
  afterEach(() => vi.restoreAllMocks())

  it("replaces the old subscription at W3 with B waiting rev3 baseline and rejects old callbacks", async () => {
    const http = r66BuildHttpEngine(r66Snapshot({ state: "active" }))
    const subscriptions = r74CaptureSubscriptions(http)
    await settle()
    const old = http.streams[0]!
    const oldCallbacks = subscriptions[0]!
    await r74Terminal(http, "waiting")
    expect(http.streams).toHaveLength(2)
    expect(old.closed).toBe(true)
    expect(http.streams[1]?.headers.get("last-event-id")).toBe(R74_W3)
    expect(subscriptions[1]?.interactionBaselines?.run_2).toEqual(r66Interaction({ interaction_revision: 3 }))
    expect(thread().resumeCursor).toBe(R74_W3)
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "waiting", runId: "run_2" })

    // The primary path above uses real HTTP/SSE. These retained callbacks also
    // prove a non-cooperative old producer cannot bypass the adapter generation.
    oldCallbacks.onCursor(R74_OLD)
    for (const revision of [1, 2]) {
      oldCallbacks.onEvent(makeEvent("interaction.state", r66Interaction({ interaction_revision: revision,
        pause_revision: revision, pause_ref: `old_pause_${revision}` }), { run_id: "run_2", seq: revision }))
    }
    oldCallbacks.onReconnecting?.(R74_OLD)
    oldCallbacks.onStreamError(new SessionClientError("parse", "obsolete subscription"))
    await settle()
    expect(thread().resumeCursor).toBe(R74_W3)
    expect(thread().interactionsByRun.run_2?.interaction_revision).toBe(3)
    expect(engine.getSnapshot().connection.status).toBe("connected")
    expect(thread().messages.filter((message) => message.runId === "run_2" && message.role === "assistant")).toHaveLength(1)
  })

  it("claims the complete B active prefix on the new subscription and appends each post-W3 delta once", async () => {
    const http = r66BuildHttpEngine(r66Snapshot({ state: "active" }))
    const subscriptions = r74CaptureSubscriptions(http)
    await settle()
    const oldCallbacks = subscriptions[0]!
    await r74Terminal(http, "active")
    http.emit(R74_NEXT, r66Frame({ type: "TEXT_MESSAGE_CONTENT", messageId: "b_wire", delta: " plus tail" }, 4, "run_2"))
    http.emit(R74_NEXT, r66Frame({ type: "TEXT_MESSAGE_CONTENT", messageId: "b_wire", delta: " plus tail" }, 4, "run_2"))
    await settle()
    const answers = thread().messages.filter((message) => message.runId === "run_2" && message.role === "assistant")
    expect(answers).toHaveLength(1)
    expect(answers[0]).toMatchObject({ snapshotMessageId: "b_assistant", content: "B full prefix plus tail" })
    expect(http.streams).toHaveLength(2)
    expect(http.streams[1]?.headers.get("last-event-id")).toBe(R74_W3)
    expect(thread().lastSeq).toBe(4)
    oldCallbacks.onCursor(R74_OLD)
    oldCallbacks.onEvent(makeEvent("message.delta", { segment_id: "b_wire", delta: " obsolete" }, { run_id: "run_2", seq: 2 }))
    await settle()
    expect(thread().resumeCursor).toBe(R74_NEXT)
    expect(thread().messages.find((message) => message.snapshotMessageId === "b_assistant")?.content).toBe("B full prefix plus tail")
  })

  it("validates new-stream interaction frames against the RR revision before acknowledging their cursor", async () => {
    const http = r66BuildHttpEngine(r66Snapshot({ state: "active" }))
    await settle()
    await r74Terminal(http, "waiting")
    expect(thread().resumeCursor).toBe(R74_W3)
    http.emit(R74_NEXT, r66StateFrame(r66Interaction({ interaction_revision: 2 }), 2, "run_2"))
    await settle()
    expect(engine.getSnapshot().connection).toEqual({ status: "unavailable", reason: "parse" })
    expect(thread().resumeCursor).toBe(R74_W3)
    expect(thread().interactionsByRun.run_2?.interaction_revision).toBe(3)
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "waiting", runId: "run_2" })
  })
})

function r74BuildAdmissionEngine() {
  const http = r66HttpFixture(r66Snapshot({ state: "active" }))
  const releases: Array<(response: Response) => void> = []
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const response = await http.fetcher(input, init)
    if (init?.method === "POST" && String(input).endsWith("/messages")) {
      return new Promise<Response>((resolve) => { releases.push(resolve) })
    }
    return response
  })
  storage = createMemoryStorage<ConversationStore>(addConversation(null, "conv_9", 500))
  let id = 0
  engine = createSessionEngine({ client: http.client, storage, now: () => 1_000,
    createId: (prefix) => `${prefix}_${++id}` })
  return {
    http,
    receipt: (index: number, label: "b" | "c") => releases[index]!(new Response(JSON.stringify({
      run_id: `run_${label === "b" ? 2 : 3}`, user_message_id: `${label}_canonical`,
      assistant_message_id: `${label}_answer`,
    }), { status: 202, headers: { "content-type": "application/json" } })),
  }
}
function r74UserFrame(id: string, content: string, seq: number, runId = "run_2") {
  return r66Frame({ type: "CUSTOM", name: "kokoro.message.user", value: { message_id: id, content } }, seq, runId)
}

describe("R74 exact concurrent admission identity", () => {
  afterEach(() => vi.restoreAllMocks())
  for (const order of ["normal", "reverse", "SSE-first"] as const) {
    it(`reconciles only the frozen B/C optimistic IDs in ${order} receipt order`, async () => {
      const { http, receipt } = r74BuildAdmissionEngine()
      await settle()
      engine.submit("B request")
      const bId = thread().messages.at(-1)!.id
      engine.submit("C request")
      const cId = thread().messages.at(-1)!.id
      await settle()
      if (order === "SSE-first") {
        http.emit(R74_OLD, r74UserFrame("b_canonical", "B request", 31))
        await settle()
      }
      const first = order === "reverse" ? "c" : "b"
      receipt(first === "b" ? 0 : 1, first)
      await settle()
      expect(thread().messages.find((message) => message.id === `${first}_canonical`)?.content).toBe(first === "b" ? "B request" : "C request")
      expect(thread().messages.find((message) => message.id === (first === "b" ? cId : bId))?.content).toBe(first === "b" ? "C request" : "B request")
      receipt(first === "b" ? 1 : 0, first === "b" ? "c" : "b")
      await settle()
      expect(thread().messages.filter((message) => message.role === "user" && message.id !== "r66_user").map((message) => [message.id, message.content])).toEqual([
        ["b_canonical", "B request"], ["c_canonical", "C request"],
      ])
      expect(engine.getSnapshot().machine).toMatchObject({ phase: "streaming", runId: "run_1" })
      expect(http.streams).toHaveLength(1)
      expect(http.requests.filter((request) => request.method === "POST")).toHaveLength(2)
    })
  }

  it("does not infer pending admission identity from equal user content in SSE", async () => {
    const { http, receipt } = r74BuildAdmissionEngine()
    await settle()
    engine.submit("same content")
    const bId = thread().messages.at(-1)!.id
    engine.submit("same content")
    const cId = thread().messages.at(-1)!.id
    await settle()
    http.emit(R74_OLD, r74UserFrame("b_canonical", "same content", 31))
    await settle()
    expect(thread().messages.some((message) => message.id === bId)).toBe(true)
    expect(thread().messages.some((message) => message.id === cId)).toBe(true)
    receipt(0, "b")
    await settle()
    expect(thread().messages.some((message) => message.id === cId)).toBe(true)
    receipt(1, "c")
    await settle()
    expect(thread().messages.filter((message) => message.role === "user" && message.id !== "r66_user").map((message) => message.id)).toEqual(["b_canonical", "c_canonical"])
  })

  for (const alreadyReceived of [false, true]) {
    it(`retains exact local admissions across atomic RR takeover (B received=${alreadyReceived})`, async () => {
      const { http, receipt } = r74BuildAdmissionEngine()
      await settle()
      engine.submit("B request")
      engine.submit("C request")
      const cId = thread().messages.at(-1)!.id
      await settle()
      if (alreadyReceived) { receipt(0, "b"); await settle() }
      await r74Terminal(http, "waiting")
      expect(http.streams).toHaveLength(2)
      expect(thread().messages.find((message) => message.id === cId)?.content).toBe("C request")
      if (!alreadyReceived) { receipt(0, "b"); await settle() }
      expect(thread().messages.find((message) => message.id === "b_canonical")?.content).toBe("B request")
      receipt(1, "c")
      await settle()
      expect(thread().messages.find((message) => message.id === "c_canonical")?.content).toBe("C request")
      expect(thread().messages.some((message) => message.id === cId)).toBe(false)
      expect(engine.getSnapshot().machine).toMatchObject({ phase: "waiting", runId: "run_2" })
      expect(thread().resumeCursor).toBe(R74_W3)
      expect(http.streams).toHaveLength(2)
    })
  }
})

function r74FailedControl(call: { runId: string; key: string }, errorCode = "interaction_conflict") {
  return new Response(JSON.stringify({ run_id: call.runId, command_id: call.key, request_digest: "sha256:r74",
    status: "failed", error_code: errorCode, replayed: true }), { status: 202, headers: { "content-type": "application/json" } })
}
function r74SnapshotReads(http: ReturnType<typeof r66BuildHttpEngine>) {
  return http.requests.filter((request) => request.method === "GET" && /\/sessions\/[^/]+$/u.test(request.path)).length
}

describe("R74 durable failed resume receipt", () => {
  afterEach(() => vi.restoreAllMocks())

  it("releases the lock and reconciles owner cards without an automatic POST or changed key/body", async () => {
    const http = r66BuildHttpEngine(r66Snapshot())
    http.controlReply = async (call) => r74FailedControl(call)
    await settle()
    r66Stage()
    await settle()
    const first = structuredClone(http.controls[0]!)
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "waiting", runId: "run_1", error: "interaction_conflict" })
    expect(thread().interactionsByRun.run_1?.groups).toHaveLength(2)
    expect(r74SnapshotReads(http)).toBe(2)
    expect(http.controls).toHaveLength(1)
    r66Stage([["item_edit", { type: "edit", args: { text: "mutated intent" } }]])
    await settle()
    expect(http.controls).toHaveLength(1)
    r66Stage(r66Staged().slice(0, 1))
    await settle()
    expect(http.controls).toHaveLength(2)
    expect(http.controls[1]).toEqual(first)
    expect(engine.getSnapshot().machine.error).toBe("interaction_conflict")
    expect(thread().interactionsByRun.run_1?.groups).toHaveLength(2)
  })

  it("invalidates an old intent only when owner reconciliation supplies a different pause", async () => {
    const http = r66BuildHttpEngine(r66Snapshot())
    await settle()
    http.controlReply = async (call) => {
      http.setSnapshot(r66Snapshot({ interaction: r66Interaction({ interaction_revision: 5, pause_revision: 3, pause_ref: "new_owner_pause" }) }))
      return r74FailedControl(call)
    }
    r66Stage()
    await settle()
    const first = structuredClone(http.controls[0]!)
    expect(r74SnapshotReads(http)).toBe(2)
    expect(thread().interactionsByRun.run_1).toMatchObject({ interaction_revision: 5, pause_revision: 3, pause_ref: "new_owner_pause" })
    expect(engine.getSnapshot().staging.run_1).toBeUndefined()
    expect(http.controls).toHaveLength(1)
    r66Stage(r66Staged().slice(0, 1))
    await settle()
    expect(http.controls).toHaveLength(1)
    r66Stage(r66Staged().slice(1))
    await settle()
    expect(http.controls).toHaveLength(2)
    expect(http.controls[1]?.key).not.toBe(first.key)
    expect(http.controls[1]?.body).toMatchObject({ expected_pause_revision: 3, pause_ref: "new_owner_pause" })
  })

  it("ignores a failed old receipt after a new owner pause and partial new decisions", async () => {
    const http = r66BuildHttpEngine(r66Snapshot())
    let release!: (response: Response) => void
    http.controlReply = () => new Promise<Response>((resolve) => { release = resolve })
    await settle()
    r66Stage()
    await settle()
    const first = http.controls[0]!
    http.emit(R74_OLD, r66StateFrame(r66Interaction({ interaction_revision: 5, pause_revision: 3, pause_ref: "new_owner_pause" }), 31))
    await settle()
    r66Stage(r66Staged().slice(0, 1))
    release(r74FailedControl(first))
    await settle()
    expect(r74SnapshotReads(http)).toBe(1)
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "waiting", error: null })
    expect(Object.keys(engine.getSnapshot().staging.run_1 ?? {})).toHaveLength(1)
    expect(thread().interactionsByRun.run_1?.pause_ref).toBe("new_owner_pause")
  })

  it("uses a stable safe error for an unrecognized durable failure code", async () => {
    const http = r66BuildHttpEngine(r66Snapshot())
    http.controlReply = async (call) => r74FailedControl(call, "provider-secret-token/raw-trace")
    await settle()
    r66Stage()
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "waiting", error: "control_failed" })
    expect(JSON.stringify(engine.getSnapshot())).not.toContain("provider-secret-token")
    expect(http.controls).toHaveLength(1)
    expect(r74SnapshotReads(http)).toBe(2)
  })
})

function r74HoldNextSnapshot(http: ReturnType<typeof r66BuildHttpEngine>) {
  let held = false
  let release!: () => void
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const response = await http.fetcher(input, init)
    if (!held && (init?.method ?? "GET") === "GET" && /\/sessions\/[^/]+$/u.test(new URL(String(input)).pathname)) {
      held = true
      return new Promise<Response>((resolve) => { release = () => resolve(response) })
    }
    return response
  })
  return () => release()
}

describe("R74 snapshot reconciliation races", () => {
  afterEach(() => vi.restoreAllMocks())

  it("takes over a new RR head even when delivery-only frames advanced the old cursor", async () => {
    const http = r66BuildHttpEngine(r66Snapshot({ state: "active" }))
    await settle()
    const release = r74HoldNextSnapshot(http)
    http.setSnapshot(r74Snapshot("waiting"))
    http.emit(CURSOR_30, r66Frame({ type: "RUN_FINISHED", threadId: "conv_9", runId: "run_1", status: "completed" }, 30))
    await settle()
    http.emit(R74_OLD, r66Frame({ type: "CUSTOM", name: "kokoro.delivery.created", value: makeDeliveryPayload({ artifact_id: "live_delivery" }) }, 31))
    await settle()
    expect(thread().deliveries.some((delivery) => delivery.artifactId === "live_delivery")).toBe(true)
    release()
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "waiting", runId: "run_2" })
    expect(thread().resumeCursor).toBe(R74_W3)
    expect(http.streams).toHaveLength(2)
    expect(thread().interactionsByRun.run_2?.interaction_revision).toBe(3)
    expect(thread().deliveries.some((delivery) => delivery.artifactId === "live_delivery")).toBe(true)
  })

  it("keeps cancelling after an earlier failed resume's delayed owner read returns", async () => {
    const http = r66BuildHttpEngine(r66Snapshot())
    await settle()
    const release = r74HoldNextSnapshot(http)
    http.controlReply = async (call) => r74FailedControl(call)
    r66Stage()
    await settle()
    engine.cancelRun()
    await settle()
    expect(engine.getSnapshot().machine.phase).toBe("cancelling")
    release()
    await settle()
    expect(engine.getSnapshot().machine.phase).toBe("cancelling")
    expect(http.streams).toHaveLength(1)
    expect(thread().interactionsByRun.run_1?.groups).toHaveLength(2)
  })

  it("does not let an earlier failed resume's delayed read overwrite a retried identical intent", async () => {
    const http = r66BuildHttpEngine(r66Snapshot())
    const succeeded = http.controlReply
    await settle()
    const release = r74HoldNextSnapshot(http)
    let calls = 0
    http.controlReply = async (call) => ++calls === 1 ? r74FailedControl(call) : succeeded(call)
    r66Stage()
    await settle()
    r66Stage(r66Staged().slice(0, 1))
    await settle()
    expect(http.controls).toHaveLength(2)
    expect(http.controls[1]).toEqual(http.controls[0])
    release()
    await settle()
    expect(engine.getSnapshot().machine.error).toBeNull()
    expect(http.streams).toHaveLength(1)
    r66Stage()
    await settle()
    expect(http.controls).toHaveLength(2)
  })

  it("retains the known owner revision when a failed receipt's RR read is older", async () => {
    const http = r66BuildHttpEngine(r66Snapshot())
    await settle()
    http.setSnapshot(r66Snapshot({ interaction: r66Interaction({ interaction_revision: 3 }) }))
    http.controlReply = async (call) => r74FailedControl(call)
    r66Stage()
    await settle()
    expect(thread().interactionsByRun.run_1?.interaction_revision).toBe(4)
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "waiting", error: "interaction_conflict" })
    expect(http.streams).toHaveLength(1)
  })

  it("retains pending receipt cards without treating admission as native execution", async () => {
    const http = r66BuildHttpEngine(r66Snapshot())
    http.controlReply = async (call) => new Response(JSON.stringify({ run_id: call.runId, command_id: call.key,
      request_digest: "sha256:r74", status: "pending", replayed: false }), { status: 202, headers: { "content-type": "application/json" } })
    await settle()
    r66Stage()
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "waiting", error: null })
    expect(thread().interactionsByRun.run_1?.groups).toHaveLength(2)
    expect(r74SnapshotReads(http)).toBe(1)
    r66Stage()
    await settle()
    expect(http.controls).toHaveLength(1)
  })
})

it("R74 does not resurrect a successor terminal observed while its stale RR head read was in flight", async () => {
  const http = r66BuildHttpEngine(r66Snapshot({ state: "active" }))
  try {
    await settle()
    const release = r74HoldNextSnapshot(http)
    http.setSnapshot(r74Snapshot("waiting"))
    http.emit(CURSOR_30, r66Frame({ type: "RUN_FINISHED", threadId: "conv_9", runId: "run_1", status: "completed" }, 30))
    await settle()
    http.emit(R74_OLD, r66Frame({ type: "RUN_FINISHED", threadId: "conv_9", runId: "run_2", status: "completed" }, 5, "run_2"))
    await settle()
    release()
    await settle()
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "idle", runId: null })
    expect(http.streams).toHaveLength(1)
    expect(http.streams[0]?.closed).toBe(true)
    expect(thread().executionHead).toBeNull()
  } finally { vi.restoreAllMocks() }
})

it("R74 failed resume snapshot preserves confirmed ordinary tool activity without reconstructing HITL", async () => {
  const http = r66BuildHttpEngine(r66Snapshot())
  try {
    await settle()
    http.emit("agui_00000000000000000000000000000015", r66Frame({ type: "TOOL_CALL_START", toolCallId: "ordinary_tool", toolCallName: "search" }, 21))
    http.emit("agui_00000000000000000000000000000016", r66Frame({ type: "TOOL_CALL_ARGS", toolCallId: "ordinary_tool", delta: "{}" }, 22))
    http.emit("agui_00000000000000000000000000000017", r66Frame({ type: "TOOL_CALL_END", toolCallId: "ordinary_tool" }, 23))
    http.emit("agui_00000000000000000000000000000018", r66Frame({ type: "TOOL_CALL_RESULT", toolCallId: "ordinary_tool", messageId: "tool_result", content: "confirmed result", role: "tool" }, 24))
    await settle()
    expect(thread().stepsByRun.run_1?.find((step) => step.kind === "tool" && step.tool.id === "ordinary_tool")).toMatchObject({ tool: { status: "done", result: "confirmed result" } })
    http.controlReply = async (call) => r74FailedControl(call)
    r66Stage()
    await settle()
    expect(thread().stepsByRun.run_1?.find((step) => step.kind === "tool" && step.tool.id === "ordinary_tool")).toMatchObject({ tool: { status: "done", result: "confirmed result" } })
    expect(thread().interactionsByRun.run_1?.groups).toHaveLength(2)
    expect(thread().messages.filter((message) => message.role === "assistant")).toHaveLength(1)
  } finally { vi.restoreAllMocks() }
})

it("R74 preserves ordinary subagent activity once when the new RR stream replays a known process frame", async () => {
  const http = r66BuildHttpEngine(r66Snapshot({ state: "active" }))
  try {
    await settle()
    const release = r74HoldNextSnapshot(http)
    http.setSnapshot(r74Snapshot("waiting"))
    http.emit(CURSOR_30, r66Frame({ type: "RUN_FINISHED", threadId: "conv_9", runId: "run_1", status: "completed" }, 30))
    await settle()
    const cursor = "agui_0000000000000000000000000000002a"
    const frame = r66Frame({ type: "CUSTOM", name: "kokoro.subagent.started", value: {
      segment_id: "sub_segment", subagent_id: "sub_exact", name: "research", description: "ordinary process",
      subagent_type: "research", source: "built-in",
    } }, 31)
    http.emit(cursor, frame)
    await settle()
    release()
    await settle()
    expect(http.streams).toHaveLength(2)
    http.emit(cursor, frame)
    await settle()
    expect(thread().stepsByRun.run_1?.filter((step) => step.kind === "subagent" && step.subagent.id === "sub_exact")).toHaveLength(1)
    expect(thread().resumeCursor).toBe(cursor)
    expect(thread().messages.filter((message) => message.runId === "run_2" && message.role === "assistant")).toHaveLength(1)
  } finally { vi.restoreAllMocks() }
})
