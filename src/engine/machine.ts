// 显式会话状态机 + 引擎：snapshot-first 水合 / 流句柄 / in-flight 守卫 / runId 锚定收束单点持有。

import type { ChatProjectionEvent } from "@/core/chat-projection-event"
import type { EventCursor } from "@/contract/agui-events"

import {
  activeMode,
  addConversation,
  conversationTitle,
  removeConversation,
  selectConversation as selectConversationOp,
  setActiveMode,
  touchActive,
  type AgentMode,
  type ConversationStore,
} from "@/core/conversations"
import { deliveryFromSnapshot, stateFromSnapshot } from "@/core/hydration"
import {
  appendUserMessage,
  markRunCancelled,
  markToolRejected,
} from "@/core/reducer"
import { createSessionStreamState, type SessionStreamState } from "@/core/state"

import { SessionClientError } from "./client"
import { reconcileUserMessageId, reduceProjectionEvents } from "./event-reducer"
import {
  createExecutionAdapter,
  type MessageExecutionOptions,
} from "./execution-adapter"
import {
  type EngineDeps,
  type EngineSnapshot,
  type NoticeSpec,
  type SessionEngine,
} from "./engine-types"
import { IDLE_MACHINE, transition, type MachineState } from "./machine-state"
import { DIRECT_SESSION_SCOPE } from "./session-scope"
import {
  buildResumeDecisions,
  pendingToolIdsOf,
  rejectedToolIds,
  stageDecision,
  type StagedDecisions,
  type ToolDecision,
} from "./hitl-staging"
import { REATTACH_TIMEOUT_MS, reattachPlanFromSnapshot } from "./reattach"

// 状态机实现位于独立纯模块；这里保留原入口 re-export，避免下游 UI/test 改变 import 契约。
export {
  IDLE_MACHINE,
  transition,
  type MachineEvent,
  type MachinePhase,
  type MachineState,
} from "./machine-state"
export {
  SERVER_ENGINE_SNAPSHOT,
  type EngineDeps,
  type EngineSnapshot,
  type SessionEngine,
} from "./engine-types"

// —— 引擎（浏览器 I/O 唯一编排者，framework-free）——

function defaultCreateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

// control 撞终态的冲突码（session 契约 409/410）：暂停失效信号，触发 snapshot 对账。
const STALE_CONTROL_ERRORS = new Set(["run_not_active", "no_pending_pause", "session_deleted"])

// session 越权码（403）：activeId 指向的会话不属于当前用户——跨用户切换后 localStorage 残留了
// 他人会话 id，或本地缓存陈旧。与 404/410（无此会话→空态即真）语义不同：这是「坏 id」，
// 必须从本地索引驱逐，绝不 fail-loud 卡死，也绝不留着它去 POST（必再 403）。
const SESSION_FORBIDDEN = "session_forbidden"

function isSessionForbidden(error: unknown): boolean {
  return error instanceof SessionClientError && error.message === SESSION_FORBIDDEN
}

function describeUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createSessionEngine(deps: EngineDeps): SessionEngine {
  const now = deps.now ?? (() => Date.now())
  const createId = deps.createId ?? defaultCreateId
  const reattachTimeoutMs = deps.reattachTimeoutMs ?? REATTACH_TIMEOUT_MS
  const scope = deps.scope ?? DIRECT_SESSION_SCOPE
  const execution = createExecutionAdapter({ client: deps.client, scope })

  let machine: MachineState = IDLE_MACHINE
  let store: ConversationStore | null = deps.storage.read()
  let thread: SessionStreamState = createSessionStreamState()
  // An existing persisted session is hydrated as soon as the engine is made;
  // expose that work in the first snapshot instead of making the shell infer
  // it from an empty thread.
  let hydrating = store !== null
  let pendingMode: AgentMode = "fast"
  const staging = new Map<string, StagedDecisions>()
  // resume 的幂等 command_id：control 失败重试复用同一 id，防双击/网络重试造成二次 resume。
  const resumeCommandIds = new Map<string, string>()
  // React 的 disabled 是渲染态，连续点击可能在一次提交前同时进入 engine。
  // 以 run 为粒度加同步闸门，保证同一暂停帧始终只有一个 resume 请求在途。
  const resumeInFlight = new Set<string>()
  // 最近一次未获回执的提交：POST 失败重试复用同一 idempotency_key（服务端命中即重放 receipt）。
  let pendingSubmission: { content: string; idempotencyKey: string } | null = null
  // Stop can arrive after POST has started but before its receipt. Remember
  // those keys so an accepted late run is cancelled instead of being
  // resurrected by the delayed response.
  const cancelledSubmissions = new Map<string, string>()
  let notice: NoticeSpec | null = null
  // 固定技能（UI 偏好，shell 持久化后经 setPinnedSkills 注入）：非空即随 messageCreate 上 wire。
  let pinnedSkills: string[] = []
  // 选中模型（MODEL-UX，shell 注入）：非 null 即随首条 messageCreate 上 wire 为 model（首条锁语义在 UI 层）。
  let selectedModel: string | null = null
  // 选中 agent（AGENT-PRESET，shell 注入）：非 null 即随首条 messageCreate 上 wire 为 agent
  // （null=用 profile 缺省 general，不上 wire；首条锁语义与 model 同在 UI 层）。
  let selectedAgent: string | null = null

  // 水合代际守卫：切会话后迟到的 snapshot 一律丢弃。
  let hydrateGeneration = 0
  // 文件同步代际守卫：同会话连续 run 收尾的乱序 snapshot 回来，只认最新一次。
  let filesSyncGeneration = 0
  let reattachTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  // 多 tab 实时同步：订阅会话 store 的跨 tab 变更（persisted-store 的 storage 事件）。
  let unsubscribeStore: (() => void) | null = null

  const listeners = new Set<() => void>()
  let snapshot: EngineSnapshot = buildSnapshot()

  function buildSnapshot(): EngineSnapshot {
    const stagingView: Record<string, Record<string, ToolDecision>> = {}
    for (const [runId, decisions] of staging) {
      stagingView[runId] = Object.fromEntries(decisions)
    }
    return { machine, notice, store, thread, pendingMode, staging: stagingView, hydrating }
  }

  function notify(): void {
    snapshot = buildSnapshot()
    for (const listener of listeners) {
      listener()
    }
  }

  function commitStore(next: ConversationStore): void {
    store = next
    deps.storage.write(next)
  }

  // 索引同步：标题（服务端 meta 优先，回退首条用户消息派生）+ 更新时间落盘。
  function syncActiveEntry(): void {
    if (!store) {
      return
    }
    const title = thread.meta?.title ?? conversationTitle(thread.messages)
    commitStore(touchActive(store, title, now()))
  }

  function clearReattachTimer(): void {
    if (reattachTimer !== null) {
      clearTimeout(reattachTimer)
      reattachTimer = null
    }
  }

  function closeStream(): void {
    execution.closeStream()
  }

  function handleStreamEvents(events: readonly ChatProjectionEvent[]): void {
    if (disposed) {
      return
    }
    const reduction = reduceProjectionEvents({ thread, machine, events })
    thread = reduction.thread
    machine = reduction.machine
    if (machine.phase === "awaiting-hitl" || machine.phase === "streaming") {
      // 待批帧：用户决策不设时限；streaming：reattach 已收到 live 事件即证明 run 活着。
      // 两者都撤 90s 兜底——否则长 run（>90s 工具执行）会被 TIMEOUT 误切流，UI 与真态撕裂。
      clearReattachTimer()
    }
    if (reduction.settledRunId !== null) {
      // 本轮终态收束：关流、清该 run 的决策暂存与幂等 id。
      staging.delete(reduction.settledRunId)
      resumeCommandIds.delete(reduction.settledRunId)
      resumeInFlight.delete(reduction.settledRunId)
      closeStream()
      clearReattachTimer()
      // 活工作区（Manus 心智）：run 收尾即重读工作区文件清单，任何工具建的文件都进文件树，免手动刷新。
      if (store) {
        syncWorkspaceFiles(store.activeId)
      }
    }
    syncActiveEntry()
    notify()
  }

  function openStream(sessionId: string, resumeCursor: EventCursor | null): void {
    execution.openStream(sessionId, resumeCursor, {
      onCursor: (cursor) => {
        if (disposed) {
          return
        }
        // Cursor belongs to the durable AG-UI ledger, not to the reducer seq.
        // Preserve it even when a partial tool-args frame has no projection.
        thread = { ...thread, resumeCursor: cursor }
      },
      onEvents: handleStreamEvents,
      onStreamError: (error) => {
        if (disposed) {
          return
        }
        clearReattachTimer()
        machine = transition(machine, { type: "FAIL", error: error.message })
        notify()
      },
    })
  }

  // run 收尾后重同步文件/成果面：只吸收 snapshot.files 与 snapshot.deliveries（线程已由
  // 事件流实时构好，不重建），读的是工作区真相 → 覆盖一切建文件/deliver 的工具，非只认某个工具事件。
  function syncWorkspaceFiles(sessionId: string): void {
    filesSyncGeneration += 1
    const generation = filesSyncGeneration
    execution
      .fetchSnapshot(sessionId)
      .then((sessionSnapshot) => {
        if (
          disposed ||
          generation !== filesSyncGeneration ||
          store?.activeId !== sessionId ||
          sessionSnapshot === null
        ) {
          return
        }
        thread = {
          ...thread,
          files: sessionSnapshot.files,
          // 成果=内容寻址的服务端读模型：整表替换即对账（live 事件先行入账的条目同 hash 同形）。
          deliveries: sessionSnapshot.deliveries.map(deliveryFromSnapshot),
        }
        notify()
      })
      .catch(() => {
        // 文件面同步失败不动主线程：下次 run 收尾/刷新/切会话再对齐。
      })
  }

  // 在途 run 的统一放弃路径：本地立即收口（结构化 cancelled），取消 POST 尽力而为。
  function abandonActiveRun(): void {
    const runId = machine.runId
    if (!runId || !store) {
      return
    }
    const sessionId = store.activeId
    closeStream()
    clearReattachTimer()
    staging.delete(runId)
    resumeCommandIds.delete(runId)
    resumeInFlight.delete(runId)
    machine = transition(machine, { type: "RESET" })
    thread = markRunCancelled(thread, runId)
    syncActiveEntry()
    execution
      .cancelRun({ sessionId, runId, commandId: createId("command") })
      .catch(() => {
        // 后端取消失败不回滚本地停止：终态收口与租约回收负责最终一致。
      })
  }

  function cancelPendingSubmission(): void {
    if (machine.phase !== "submitting" || !store || pendingSubmission === null) {
      return
    }
    cancelledSubmissions.set(pendingSubmission.idempotencyKey, store.activeId)
    pendingSubmission = null
  }

  // snapshot-first 水合：GET /sessions/:sid → 当前读模型 + opaque AG-UI watermark 续流。
  function hydrate(sessionId: string): void {
    hydrateGeneration += 1
    const generation = hydrateGeneration
    if (!hydrating) {
      hydrating = true
      notify()
    }
    execution
      .fetchSnapshot(sessionId)
      .then((sessionSnapshot) => {
        if (disposed || generation !== hydrateGeneration || store?.activeId !== sessionId) {
          return
        }
        if (sessionSnapshot === null) {
          // 服务端无此会话（本地新建未开聊）：空线程即真态。
          hydrating = false
          notify()
          return
        }
        thread = stateFromSnapshot(sessionSnapshot)
        syncActiveEntry()
        // Snapshot 与 event_watermark 同事务视图；只续 watermark 之后的 durable
        // AG-UI frame，避免刷新时双读完整事件史。
        openStream(sessionId, thread.resumeCursor)
        const plan = reattachPlanFromSnapshot(sessionSnapshot)
        if (plan) {
          const before = machine
          machine = transition(machine, {
            type: "REATTACH",
            runId: plan.runId,
            awaiting: plan.awaiting,
          })
          if (machine !== before) {
            clearReattachTimer()
            if (!plan.awaiting) {
              // 兜底窗口耗尽仍无终态：放弃续传，不永久卡在 streaming。待批帧不设时限。
              reattachTimer = setTimeout(() => {
                reattachTimer = null
                const timedOut = transition(machine, { type: "TIMEOUT" })
                if (timedOut === machine) {
                  return
                }
                machine = timedOut
                closeStream()
                notify()
              }, reattachTimeoutMs)
            }
          }
        }
        hydrating = false
        notify()
      })
      .catch((error: unknown) => {
        if (disposed || generation !== hydrateGeneration || store?.activeId !== sessionId) {
          return
        }
        if (isSessionForbidden(error)) {
          // activeId 越权（跨用户残留 / 陈旧本地缓存）：驱逐它、回退空态，绝不 fail-loud 卡死，
          // 也绝不留着它供 submit 去 POST（必再 403）。
          evictActiveConversation()
          return
        }
        // fail-loud：水合失败进状态机错误态，不渲染半真半假的本地线程。
        hydrating = false
        machine = transition(machine, { type: "FAIL", error: describeUnknown(error) })
        notify()
      })
  }

  function messageExecutionOptions(mode: AgentMode): MessageExecutionOptions {
    return {
      mode,
      model: selectedModel,
      agent: selectedAgent,
      pinnedSkills,
    }
  }

  // POST messages 并处理回执/失败（submit 与 retry 共用的开跑尾段）。
  function beginRun(sessionId: string, content: string, idempotencyKey: string): void {
    pendingSubmission = { content, idempotencyKey }
    // 模式意图上 wire：thinking 档=true（后端各 provider 翻成原生推理开关），fast=false 显式关。
    const mode = store ? activeMode(store) : pendingMode
    execution
      .createMessage({
        sessionId,
        content,
        idempotencyKey,
        options: messageExecutionOptions(mode),
      })
      .then((receipt) => {
        const cancelledSessionId = cancelledSubmissions.get(idempotencyKey)
        if (cancelledSessionId === sessionId) {
          cancelledSubmissions.delete(idempotencyKey)
          void execution
            .cancelRun({
              sessionId,
              runId: receipt.run_id,
              commandId: createId("command"),
            })
            .catch(() => {
              // Local cancellation already settled the UI; the backend cancel
              // is best effort for a receipt that arrived after the stop.
            })
          return
        }
        // 回执落地前用户已重置/切换：丢弃迟到回执，不复活旧轮。
        if (disposed || machine.phase !== "submitting" || store?.activeId !== sessionId) {
          return
        }
        pendingSubmission = null
        thread = reconcileUserMessageId(thread, receipt.user_message_id)
        machine = transition(machine, { type: "RECEIPT", runId: receipt.run_id })
        openStream(sessionId, thread.resumeCursor)
        notify()
      })
      .catch((error: unknown) => {
        cancelledSubmissions.delete(idempotencyKey)
        if (disposed || machine.phase !== "submitting") {
          return
        }
        machine = transition(machine, { type: "FAIL", error: describeUnknown(error) })
        notify()
      })
  }

  function submit(content: string): void {
    const trimmed = content.trim()
    if (disposed || !trimmed) {
      return
    }
    notice = null
    if (
      store !== null &&
      (machine.phase === "streaming" ||
        machine.phase === "awaiting-hitl" ||
        machine.phase === "reattaching")
    ) {
      // 运行中插话：同端点再 POST（服务端识别活跃 run 转 run.steer）；
      // 不动状态机、不重开事件流——回执 run_id 即当前 run，无新可锚定物。
      thread = appendUserMessage(thread, { id: createId("usr"), content: trimmed })
      notify()
      // 回执/失败必须锚回发起时的会话：POST 在途时切走 → 迟到回调不得落在别的会话线程上
      // （否则 adopt 会改/删 T 的乐观气泡、notice 串到 T）。与 beginRun 回执守卫对齐。
      const steerSessionId = store.activeId
      execution
        .createMessage({
          sessionId: steerSessionId,
          content: trimmed,
          idempotencyKey: createId("idem"),
          options: messageExecutionOptions(activeMode(store)),
        })
        .then((receipt) => {
          if (disposed || store?.activeId !== steerSessionId) {
            return
          }
          thread = reconcileUserMessageId(thread, receipt.user_message_id)
          notify()
        })
        .catch((error: unknown) => {
          if (disposed || store?.activeId !== steerSessionId) {
            return
          }
          // 插话投递失败必须可见：瞬态通知（不打断相位），下次提交自动清。
          notice = { key: "steer.sendFailed", vars: { detail: describeUnknown(error) } }
          notify()
        })
      return
    }
    const before = machine
    machine = transition(machine, { type: "SUBMIT" })
    if (machine === before) {
      // 同步双发守卫：submitting 相位（回执未归）的提交直接拒绝。
      return
    }
    if (!store) {
      store = addConversation(null, createId("conv"), now(), pendingMode)
    }
    thread = appendUserMessage(thread, { id: createId("usr"), content: trimmed })
    syncActiveEntry()
    notify()
    beginRun(store.activeId, trimmed, createId("idem"))
  }

  function retry(): void {
    if (disposed || !store) {
      return
    }
    const lastUser = [...thread.messages].reverse().find((message) => message.role === "user")
    if (!lastUser) {
      return
    }
    const before = machine
    machine = transition(machine, { type: "SUBMIT" })
    if (machine === before) {
      return
    }
    // 复位上一轮 run.failed 留下的终态标记；消息与历史步骤原样保留。
    if (thread.runStatus !== "idle") {
      thread = { ...thread, runStatus: "idle" }
    }
    notify()
    // 未获回执的同文重试复用 idempotency_key（服务端命中即重放 receipt，不造重复 run）；
    // 已回执后的失败重试换新 key（上一 run 已真实存在并失败）。
    const reuseKey =
      pendingSubmission !== null && pendingSubmission.content === lastUser.content
        ? pendingSubmission.idempotencyKey
        : createId("idem")
    beginRun(store.activeId, lastUser.content, reuseKey)
  }

  function stageToolDecision(runId: string, toolId: string, decision: ToolDecision): void {
    if (disposed || !store || machine.phase !== "awaiting-hitl" || machine.runId !== runId) {
      return
    }
    const sessionId = store.activeId
    const pendingIds = pendingToolIdsOf(thread.stepsByRun[runId] ?? [])
    // 迟到的旧卡片/切会话后的点击不能污染当前暂停帧，也不能制造永远凑不齐的 staging。
    if (!pendingIds.includes(toolId) || resumeInFlight.has(runId)) {
      return
    }
    const staged = stageDecision(staging.get(runId) ?? new Map(), toolId, decision)
    staging.set(runId, staged)
    notify()

    const decisions = buildResumeDecisions(staged, pendingIds)
    if (!decisions) {
      // 同帧仍有工具未决：等凑齐后统一提交一条 resume。
      return
    }
    // 同一帧的重试复用同一 command_id：服务端据此幂等，双击/网络重试不会二次 resume。
    const commandId = resumeCommandIds.get(runId) ?? createId("command")
    resumeCommandIds.set(runId, commandId)
    resumeInFlight.add(runId)
    execution
      .resumeRun({ sessionId, runId, decisions, commandId })
      .then(() => {
        if (disposed) {
          return
        }
        machine = transition(machine, { type: "RESUME_SENT" })
        const rejected = rejectedToolIds(staged, pendingIds)
        if (rejected.length > 0) {
          thread = markToolRejected(thread, runId, rejected)
        }
        staging.delete(runId)
        resumeCommandIds.delete(runId)
        resumeInFlight.delete(runId)
        notify()
      })
      .catch((error: unknown) => {
        if (disposed) {
          return
        }
        // 网络失败允许重试，但在下一次点击前必须解除在途闸门。
        resumeInFlight.delete(runId)
        const detail = describeUnknown(error)
        // 终态冲突码=这个暂停已经失效（run 已收口/被取消/会话已删）：按 snapshot
        // 对账重建真态并清暂存，绝不把用户卡死在 awaiting-hitl（审计缺口④）。
        if (STALE_CONTROL_ERRORS.has(detail) && store) {
          staging.delete(runId)
          resumeCommandIds.delete(runId)
          closeStream()
          clearReattachTimer()
          machine = transition(machine, { type: "RESET" })
          hydrate(store.activeId)
          notify()
          return
        }
        // 其余失败（网络抖动等）：暂存保留可重试；仅记录错误，不离开 awaiting-hitl。
        machine = transition(machine, { type: "CONTROL_FAILED", error: detail })
        notify()
      })
  }

  // 切换活跃会话的公共尾段：清流/清相位/清暂存，换空线程后按 snapshot 重新水合。
  function activateConversation(next: ConversationStore, shouldHydrate = true): void {
    closeStream()
    clearReattachTimer()
    machine = transition(machine, { type: "RESET" })
    staging.clear()
    resumeCommandIds.clear()
    resumeInFlight.clear()
    pendingSubmission = null
    thread = createSessionStreamState()
    hydrating = shouldHydrate
    commitStore(next)
    notify()
    if (shouldHydrate) {
      hydrate(next.activeId)
    }
  }

  // 驱逐当前 activeId（越权/陈旧 id）：从本地索引移除并回退。
  // 不发 deleteSession（会话不属于当前用户，无权也不该删服务端）。没有可回退的已知会话时，
  // removeConversation 会创建一个只存在于本地的新会话；它不需要再请求 snapshot，避免服务端
  // 连续返回 session_forbidden 时递归生成 fallback。
  function evictActiveConversation(): void {
    if (!store) {
      return
    }
    const fallbackId = createId("conv")
    const next = removeConversation(store, store.activeId, fallbackId, now())
    activateConversation(next, next.activeId !== fallbackId)
  }

  function selectConversation(id: string): void {
    if (disposed || !store || id === store.activeId) {
      return
    }
    // 切换不取消在途 run：服务端 run 照跑，切回时 snapshot 精确续传。
    activateConversation(selectConversationOp(store, id))
  }

  // 打开服务端清单里的会话（SESS-LIST）：本地索引已有即普通切换；未见则先纳入本地缓存
  // （active/mode 编排用）再按 snapshot 水合。清单本体由服务端权威，本地索引只是访问缓存。
  function openConversation(id: string): void {
    if (disposed) {
      return
    }
    if (store && store.activeId === id) {
      return
    }
    if (store && store.conversations.some((entry) => entry.id === id)) {
      activateConversation(selectConversationOp(store, id))
      return
    }
    const entry = { id, title: "", updatedAt: now(), mode: "fast" as AgentMode }
    const next: ConversationStore = store
      ? { activeId: id, conversations: [entry, ...store.conversations] }
      : { activeId: id, conversations: [entry] }
    activateConversation(next)
  }

  function newConversation(): void {
    if (disposed) {
      return
    }
    // Starting a fresh chat abandons a POST whose receipt has not arrived yet.
    // Preserve the idempotency key so a late receipt can cancel the server run.
    cancelPendingSubmission()
    abandonActiveRun()
    const next = addConversation(store, createId("conv"), now(), store ? "fast" : pendingMode)
    closeStream()
    clearReattachTimer()
    machine = transition(machine, { type: "RESET" })
    staging.clear()
    resumeCommandIds.clear()
    resumeInFlight.clear()
    pendingSubmission = null
    thread = createSessionStreamState()
    hydrating = false
    commitStore(next)
    notify()
    // 新会话本地新建、服务端必然不存在：不发无谓的 snapshot 请求。
  }

  function deleteConversation(id: string): void {
    if (disposed || !store) {
      return
    }
    if (id === store.activeId) {
      abandonActiveRun()
    }
    // 服务端软删除 fire-and-forget：本地移除不等网络（失败仅记日志；
    // 服务端残留由 P1 会话列表服务端化对账——technical/16 入册边界）。
    void execution.deleteSession(id).catch((error: unknown) => {
      console.error("session soft-delete failed", id, error)
    })
    activateConversation(removeConversation(store, id, createId("conv"), now()))
  }

  function setMode(mode: AgentMode): void {
    if (disposed) {
      return
    }
    if (!store) {
      pendingMode = mode
      notify()
      return
    }
    // 已开聊即锁定：忽略切换。
    if (thread.messages.length > 0) {
      return
    }
    commitStore(setActiveMode(store, mode))
    notify()
  }

  function cancelRun(): void {
    if (disposed) {
      return
    }
    if (machine.phase === "submitting" && pendingSubmission !== null) {
      cancelPendingSubmission()
      machine = transition(machine, { type: "RESET" })
      notify()
      return
    }
    abandonActiveRun()
    notify()
  }

  function setPinnedSkills(names: readonly string[]): void {
    if (disposed) {
      return
    }
    pinnedSkills = [...names]
  }

  function setModel(model: string | null): void {
    if (disposed) {
      return
    }
    selectedModel = model
  }

  function setAgent(agent: string | null): void {
    if (disposed) {
      return
    }
    selectedAgent = agent
  }

  function dispose(): void {
    disposed = true
    closeStream()
    clearReattachTimer()
    unsubscribeStore?.()
    listeners.clear()
  }

  // 另一 tab 写会话 store（新建/删除/改名/切换）→ 本 tab 吸收列表变化。
  function onExternalStore(): void {
    if (disposed) {
      return
    }
    const external = deps.storage.read()
    // persisted-store 缓存稳定引用：与当前相等即无外部变更（含本 tab 自写后的重入），跳过。
    if (external === store) {
      return
    }
    const myActive = store?.activeId ?? null
    if (
      external !== null &&
      myActive !== null &&
      external.conversations.some((entry) => entry.id === myActive)
    ) {
      // 本 tab 激活会话仍在：只吸收列表，保留本 tab 激活视图与在途线程，不重水合、不打断流。
      store = { ...external, activeId: myActive }
      notify()
      return
    }
    // 本 tab 无激活或激活会话被别处删了：跟随外部激活并重水合（无激活则回空线程）。
    // 必须先收束在途 run（与 activateConversation 一致）：否则本 tab 正流式时被删，
    // machine 卡在旧 streaming 相位、runId 指向已删 run，hydrate 的 REATTACH 被守卫拒、不自愈。
    // 清空 storage 没有新的 session 可供 hydrate；递增代际使旧 snapshot 的 then/catch
    // 都失效，且必须同步结束 loading，否则旧请求永远悬挂在 hydrating=true。
    hydrateGeneration += 1
    hydrating = false
    closeStream()
    clearReattachTimer()
    machine = transition(machine, { type: "RESET" })
    staging.clear()
    resumeCommandIds.clear()
    resumeInFlight.clear()
    pendingSubmission = null
    thread = createSessionStreamState()
    store = external
    if (external?.activeId) {
      hydrate(external.activeId)
    }
    notify()
  }
  unsubscribeStore = deps.storage.subscribe(onExternalStore)

  // 启动即水合：活跃会话从服务端 snapshot 恢复消息/在途 run/暂停点。
  if (store) {
    hydrate(store.activeId)
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    submit,
    retry,
    cancelRun,
    stageToolDecision,
    selectConversation,
    openConversation,
    newConversation,
    deleteConversation,
    setMode,
    setPinnedSkills,
    setModel,
    setAgent,
    dispose,
  }
}
