// 显式会话状态机 + 引擎：snapshot-first 水合 / 流句柄 / in-flight 守卫 / runId 锚定收束单点持有。

import type { ChatProjectionEvent } from "@/core/chat-projection-event"
import type { EventCursor } from "@/contract/agui-events"
import { resumeDecisionSchema } from "@/contract/control"
import type { ResumeRunArgs } from "./execution-adapter"

import type { MessageCreateReceipt, SessionSnapshot } from "@/contract/http"

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
} from "@/core/reducer"
import { sameInteractionState, createSessionStreamState, type SessionStreamState, type SessionMessage } from "@/core/state"

import { SessionClientError } from "./client"
import { reconcileUserMessageId, reduceProjectionEvents } from "./event-reducer"
import {
  createExecutionAdapter,
  type CreateMessageArgs,
  type MessageExecutionOptions,
} from "./execution-adapter"
import {
  type EngineDeps,
  type EngineSnapshot,
  type ConnectionAvailability,
  type NoticeSpec,
  type SessionEngine,
} from "./engine-types"
import { IDLE_MACHINE, transition, type MachineState } from "./machine-state"
import { DIRECT_SESSION_SCOPE } from "./session-scope"
import {
  buildResumeDecisions,
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
const SAFE_CONTROL_FAILURES = new Set(["interaction_conflict", "run_control_conflict", "run_not_active", "no_pending_pause", "invalid_run_control"])

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

function connectionFailure(error: unknown): ConnectionAvailability {
  return {
    status: "unavailable",
    reason: error instanceof SessionClientError ? error.reason : "network",
  }
}

// Web-only delivery intent. The optimistic id never crosses the adapter; it
// lets snapshot-first recovery restore the exact local user message until the
// owner receipt supplies its canonical message id.
type PendingSubmission = CreateMessageArgs & { optimisticUserId: string }

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
  let connection: ConnectionAvailability = { status: "connected" }
  let pendingMode: AgentMode = "fast"
  const staging = new Map<string, StagedDecisions>()
  // resume 的幂等 command_id：control 失败重试复用同一 id，防双击/网络重试造成二次 resume。
  const resumeCommandIds = new Map<string, string>()
  // React 的 disabled 是渲染态，连续点击可能在一次提交前同时进入 engine。
  // 以 run 为粒度加同步闸门，保证同一暂停帧始终只有一个 resume 请求在途。
  const resumeInFlight = new Set<string>()
  const frozenResumes = new Map<string, ResumeRunArgs>()
  const resumeAttempts = new Map<string, symbol>()
  // 最近一次未获回执的完整提交意图：重试复用同一 key 与业务 body，保持 BFF digest 不变。
  let pendingSubmission: PendingSubmission | null = null
  // create 回执可能与 expired-cursor snapshot recovery 并发；recovery 期间先暂存，
  // 由 owner snapshot 建立新真态后再按 exact run identity 吸收，绝不抢开 stale stream。
  let recoveredSubmission: PendingSubmission | null = null
  let recoveredSubmissionError: string | null = null
  let deferredCreateReceipt: { submission: PendingSubmission; receipt: MessageCreateReceipt } | null = null
  // Stop can arrive after POST has started but before its receipt. Remember
  // those keys so an accepted late run is cancelled instead of being
  // resurrected by the delayed response.
  const cancelledSubmissions = new Map<string, string>()
  const observedTerminalRuns = new Set<string>()
  const pendingSteerReceipts = new Map<symbol, PendingSubmission>()
  // Exact acknowledged local rows not yet observed in the durable projection.
  // Snapshot/live canonical identity confirms and removes these bounded intents.
  const unprojectedAdmissions = new Map<string, SessionMessage>()
  const processEventIds = new Set<string>()
  let notice: NoticeSpec | null = null
  // 当前会话 exact source refs：只在内存中保存，不从 browser store 恢复。
  let selectedSkillSourceRefs: string[] = []
  // 选中模型（MODEL-UX，shell 注入）：非 null 即随首条 messageCreate 上 wire 为 model（首条锁语义在 UI 层）。
  let selectedModel: string | null = null
  // 选中 agent（AGENT-PRESET，shell 注入）：非 null 即随首条 messageCreate 上 wire 为 agent
  // （null=用 profile 缺省 general，不上 wire；首条锁语义与 model 同在 UI 层）。
  let selectedAgent: string | null = null

  // 水合代际守卫：切会话后迟到的 snapshot 一律丢弃。
  let hydrateGeneration = 0
  let cursorResetAttempts = 0
  let recoveringExpiredCursor = false
  // 文件同步代际守卫：同会话连续 run 收尾的乱序 snapshot 回来，只认最新一次。
  let filesSyncGeneration = 0
  let pendingTerminalRead: { generation: number; runs: Set<string> } | null = null
  let reattachTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  // 多 tab 实时同步：订阅会话 store 的跨 tab 变更（persisted-store 的 storage 事件）。
  let unsubscribeStore: (() => void) | null = null

  const listeners = new Set<() => void>()
  let snapshot: EngineSnapshot = buildSnapshot()

  function canSubmitMessage(): boolean {
    if (disposed || recoveringExpiredCursor || connection.status !== "connected") return false
    if (machine.phase === "idle" || machine.phase === "error") return true
    return store !== null && (
      machine.phase === "streaming" || machine.phase === "queued" ||
      machine.phase === "resuming" || machine.phase === "waiting"
    )
  }

  function canRetryPendingSubmission(): boolean {
    return connection.status === "connected" &&
      machine.phase === "error" && machine.error !== null && pendingSubmission !== null &&
      store?.activeId === pendingSubmission.sessionId
  }

  function buildSnapshot(): EngineSnapshot {
    const stagingView: Record<string, Record<string, ToolDecision>> = {}
    for (const [runId, decisions] of staging) {
      stagingView[runId] = Object.fromEntries(decisions)
    }
    return {
      machine,
      notice,
      store,
      thread,
      pendingMode,
      staging: stagingView,
      hydrating,
      connection,
      canSubmitMessage: canSubmitMessage(),
      canRetryPendingSubmission: canRetryPendingSubmission(),
      canRetryResume: retryableResume() !== null,
    }
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
    const optimisticUserIds = new Set([...pendingSteerReceipts.values()].map((intent) => intent.optimisticUserId))
    if (pendingSubmission) optimisticUserIds.add(pendingSubmission.optimisticUserId)
    const reduction = reduceProjectionEvents({ thread, machine, events, optimisticUserIds })
    for (const event of events) {
      if ((event.kind.startsWith("tool.") || event.kind.startsWith("thinking.") || event.kind.startsWith("subagent.")) &&
        reduction.thread.seenEventIds.has(event.event_id)) processEventIds.add(event.event_id)
      if (event.kind === "message.user") unprojectedAdmissions.delete(event.payload.message_id)
      if (event.kind === "run.completed" || event.kind === "run.failed" || event.kind === "run.dispatch_failed") {
        pendingTerminalRead?.runs.add(event.run_id)
        if (store && pendingSteerReceipts.size > 0) observedTerminalRuns.add(JSON.stringify([store.activeId, event.run_id]))
      }
      if (event.kind !== "interaction.state") continue
      const previous = thread.interactionsByRun[event.run_id]
      const next = event.payload
      if (next.phase === "resuming" && next.action_result?.kind === "unknown") resumeInFlight.delete(event.run_id)
      const collectionChanged = previous !== undefined &&
        (previous.pause_revision !== next.pause_revision || previous.pause_ref !== next.pause_ref ||
          !sameInteractionState({ ...previous, interaction_revision: next.interaction_revision, phase: next.phase, action_result: next.action_result }, next))
      if (collectionChanged || next.phase === "active" || next.phase === "terminal") {
        staging.delete(event.run_id)
        resumeCommandIds.delete(event.run_id)
        resumeInFlight.delete(event.run_id)
        frozenResumes.delete(event.run_id)
        resumeAttempts.delete(event.run_id)
      }
    }
    thread = reduction.thread
    machine = reduction.machine
    if (machine.phase === "waiting" || machine.phase === "streaming") {
      // 待批帧：用户决策不设时限；streaming：reattach 已收到 live 事件即证明 run 活着。
      // 两者都撤 90s 兜底——否则长 run（>90s 工具执行）会被 TIMEOUT 误切流，UI 与真态撕裂。
      clearReattachTimer()
    }
    if (reduction.settledRunId !== null) {
      // 本轮终态收束：关流、清该 run 的决策暂存与幂等 id。
      staging.delete(reduction.settledRunId)
      resumeCommandIds.delete(reduction.settledRunId)
      resumeInFlight.delete(reduction.settledRunId)
      frozenResumes.delete(reduction.settledRunId)
      resumeAttempts.delete(reduction.settledRunId)
      clearReattachTimer()
      // 活工作区（Manus 心智）：run 收尾即重读工作区文件清单，任何工具建的文件都进文件树，免手动刷新。
      if (store) {
        syncWorkspaceFiles(store.activeId, reduction.settledRunId, new Set(events.filter((event) =>
          event.kind === "run.completed" || event.kind === "run.failed" || event.kind === "run.dispatch_failed").map((event) => event.run_id)))
      }
    }
    syncActiveEntry()
    notify()
  }

  function openStream(sessionId: string, resumeCursor: EventCursor | null): void {
    execution.openStream(sessionId, resumeCursor, {
      interactionBaselines: thread.interactionsByRun,
      onCursor: (cursor) => {
        if (disposed) {
          return
        }
        // Cursor belongs to the durable AG-UI ledger, not to the reducer seq.
        // Preserve it even when a partial tool-args frame has no projection.
        thread = { ...thread, resumeCursor: cursor }
        cursorResetAttempts = 0
      },
      onEvents: handleStreamEvents,
      onReconnecting: () => {
        if (disposed || store?.activeId !== sessionId) {
          return
        }
        connection = { status: "reconnecting" }
        notify()
      },
      onConnected: () => {
        if (disposed || store?.activeId !== sessionId) {
          return
        }
        connection = { status: "connected" }
        notify()
      },
      onStreamError: (error) => {
        if (disposed) {
          return
        }
        clearReattachTimer()
        if (error.code === "event_cursor_expired" && cursorResetAttempts < 2 && store?.activeId === sessionId) {
          cursorResetAttempts += 1
          recoveringExpiredCursor = true
          if (machine.phase === "submitting" && pendingSubmission !== null) {
            recoveredSubmission = pendingSubmission
            recoveredSubmissionError = null
          }
          connection = { status: "reconnecting" }
          notify()
          hydrate(sessionId, true)
          return
        }
        connection = connectionFailure(error)
        notify()
      },
    })
  }

  function adoptOwnerSnapshot(
    sessionId: string,
    sessionSnapshot: SessionSnapshot,
    liveDeliveries?: Pick<SessionStreamState, "deliveries" | "deliveriesHasMore">,
  ): void {
    const previous = thread
    const hydrated = stateFromSnapshot(sessionSnapshot)
    // RR cannot regress an already known interaction baseline, even when the
    // snapshot and current cursor happen to be equal opaque values.
    for (const [runId, next] of Object.entries(hydrated.interactionsByRun)) {
      const before = previous.interactionsByRun[runId]
      if (before && (next.interaction_revision < before.interaction_revision ||
        (next.interaction_revision === before.interaction_revision && !sameInteractionState(before, next)))) return
    }
    if (liveDeliveries) Object.assign(hydrated, liveDeliveries)
    // RR owns canonical text, not the already observed ordinary process log.
    // Preserve real tool/thinking/subagent facts; snapshot text uses local render
    // positions after them, never an owner seq or a second approval protocol.
    for (const [runId, steps] of Object.entries(previous.stepsByRun)) {
      const process = steps.filter((step) => step.kind !== "text")
      if (process.length === 0) continue
      const lastPosition = Math.max(...process.map((step) => step.seq))
      const text = (hydrated.stepsByRun[runId] ?? []).map((step, index) => ({ ...step, seq: lastPosition + index + 1 }))
      hydrated.stepsByRun[runId] = [...process, ...text]
    }
    for (const [id, message] of unprojectedAdmissions) {
      if (hydrated.messages.some((row) => row.id === id)) unprojectedAdmissions.delete(id)
      else hydrated.messages.push(message)
    }
    const pending = [...pendingSteerReceipts.values(), ...(pendingSubmission ? [pendingSubmission] : [])]
    for (const intent of pending) {
      const echo = previous.messages.find((message) => message.id === intent.optimisticUserId)
      if (echo && !hydrated.messages.some((message) => message.id === echo.id)) hydrated.messages.push(echo)
    }
    for (const [runId] of frozenResumes) {
      const before = previous.interactionsByRun[runId]
      const next = hydrated.interactionsByRun[runId]
      const changed = !before || !next || next.phase === "active" || next.phase === "terminal" ||
        before.pause_revision !== next.pause_revision || before.pause_ref !== next.pause_ref ||
        !sameInteractionState({ ...before, interaction_revision: next.interaction_revision, phase: next.phase, action_result: next.action_result }, next)
      if (changed) {
        staging.delete(runId); frozenResumes.delete(runId); resumeAttempts.delete(runId); resumeCommandIds.delete(runId); resumeInFlight.delete(runId)
      }
    }
    // Preserved process facts carry ONLY their exact dedupe identities. Text and
    // interaction frames still replay from W3 against the fresh snapshot; an
    // already observed delta/subagent start must not append a second time.
    hydrated.seenEventIds = new Set(processEventIds)
    // closeStream invalidates callbacks AND queued adapter batches. The mapper
    // created by openStream receives this exact snapshot's interaction baseline.
    closeStream()
    clearReattachTimer()
    thread = hydrated
    machine = transition(machine, { type: "RESET" })
    const head = sessionSnapshot.execution_head
    if (head) {
      machine = transition(machine, { type: "REATTACH", runId: head.run_id, state: head.state })
      openStream(sessionId, hydrated.resumeCursor)
      if (head.state === "queued" || head.state === "active") {
        reattachTimer = setTimeout(() => {
          reattachTimer = null
          if (machine.runId !== head.run_id || machine.phase === "waiting" || machine.phase === "resuming") return
          closeStream()
          connection = { status: "unavailable", reason: "timeout" }
          notify()
        }, reattachTimeoutMs)
      }
    } else connection = { status: "connected" }
    syncActiveEntry()
  }

  // After terminal, files/deliveries may merge into a newer live generation.
  // A quiet successor head instead takes over the complete RR snapshot + cursor.
  function syncWorkspaceFiles(sessionId: string, settledRunId: string, terminalRuns: Set<string>): void {
    filesSyncGeneration += 1
    const generation = filesSyncGeneration
    const terminalRead = { generation, runs: terminalRuns }
    pendingTerminalRead = terminalRead
    const sessionGeneration = hydrateGeneration
    const cursorAtStart = thread.resumeCursor
    execution.fetchSnapshot(sessionId).then((sessionSnapshot) => {
      if (disposed || generation !== filesSyncGeneration || sessionGeneration !== hydrateGeneration || store?.activeId !== sessionId) return
      if (sessionSnapshot === null) {
        if (machine.phase === "idle" && thread.resumeCursor === cursorAtStart) closeStream()
        return
      }
      const snapshotDeliveries = sessionSnapshot.deliveries.map(deliveryFromSnapshot)
      const liveAdvanced = thread.resumeCursor !== cursorAtStart
      thread = {
        ...thread, files: sessionSnapshot.files,
        deliveries: liveAdvanced
          ? [...new Map([...snapshotDeliveries, ...thread.deliveries].map((item) => [JSON.stringify([item.conversationId, item.artifactId]), item])).values()]
          : snapshotDeliveries,
        deliveriesHasMore: liveAdvanced ? thread.deliveriesHasMore || sessionSnapshot.deliveries_has_more : sessionSnapshot.deliveries_has_more,
      }
      if (machine.phase === "idle") {
        // Never revive the exact observed terminal head from a stale RR view.
        if (!sessionSnapshot.execution_head || sessionSnapshot.execution_head.run_id === settledRunId ||
          terminalRead.runs.has(sessionSnapshot.execution_head.run_id) ||
          observedTerminalRuns.has(JSON.stringify([sessionId, sessionSnapshot.execution_head.run_id]))) {
          if (!liveAdvanced || sessionSnapshot.execution_head) closeStream()
        } else adoptOwnerSnapshot(sessionId, sessionSnapshot, liveAdvanced
          ? { deliveries: thread.deliveries, deliveriesHasMore: thread.deliveriesHasMore } : undefined)
      }
      notify()
    }).catch(() => {
      // A failed read leaves confirmed owner events intact; refresh can reconcile.
    }).finally(() => {
      if (pendingTerminalRead === terminalRead) pendingTerminalRead = null
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

  function cancelAcceptedSubmission(sessionId: string, runId: string): void {
    void execution
      .cancelRun({ sessionId, runId, commandId: createId("command") })
      .catch(() => {
        // The local conversation has already been abandoned. Cancellation is
        // best effort and must not resurrect its run or mutate the new thread.
      })
  }

  function abandonPendingSubmission(): void {
    const submission = pendingSubmission
    if (submission === null) {
      return
    }
    const deferred = deferredCreateReceipt
    if (deferred !== null && deferred.submission === submission) {
      cancelledSubmissions.delete(submission.idempotencyKey)
      cancelAcceptedSubmission(submission.sessionId, deferred.receipt.run_id)
    } else if (recoveredSubmissionError === null) {
      // The create outcome is still unknown. Its promise callback consumes
      // this exact key/session marker and cancels an accepted late receipt.
      cancelledSubmissions.set(submission.idempotencyKey, submission.sessionId)
    }
    pendingSubmission = null
    recoveredSubmission = null
    recoveredSubmissionError = null
    deferredCreateReceipt = null
  }

  function cancelPendingSubmission(): void {
    if (machine.phase !== "submitting" || !store || pendingSubmission === null) {
      return
    }
    abandonPendingSubmission()
  }

  // snapshot-first 水合：GET /sessions/:sid → 当前读模型 + opaque AG-UI watermark 续流。
  function hydrate(sessionId: string, afterExpiredCursor = false): void {
    hydrateGeneration += 1
    observedTerminalRuns.clear()
    pendingSteerReceipts.clear()
    unprojectedAdmissions.clear()
    processEventIds.clear()
    const generation = hydrateGeneration
    if (!afterExpiredCursor && !hydrating) {
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
          if (afterExpiredCursor) {
            // A stream existed before GC; a subsequent missing snapshot means
            // the conversation is gone, not a newly created local draft. A
            // concurrent create may still produce a late accepted receipt;
            // cancel it against its original session without reviving this UI.
            abandonPendingSubmission()
            evictActiveConversation()
            return
          }
          // 服务端无此会话（本地新建未开聊）：空线程即真态。
          hydrating = false
          notify()
          return
        }
        if (afterExpiredCursor) {
          // The owner snapshot supersedes the old stream's run and approvals.
          // Otherwise REATTACH rejects a changed run while streaming/HITL.
          closeStream()
          clearReattachTimer()
          machine = transition(machine, { type: "RESET" })
          staging.clear()
          resumeCommandIds.clear()
          resumeInFlight.clear()
    frozenResumes.clear(); resumeAttempts.clear()
        }
        const previousCursor = thread.resumeCursor
        const deferred = deferredCreateReceipt !== null && deferredCreateReceipt.submission === pendingSubmission
          ? deferredCreateReceipt
          : null
        const deferredRunSettled = deferred !== null && (sessionSnapshot.messages ?? []).some(
          (message) => message.role === "assistant" &&
            message.run_id === deferred.receipt.run_id &&
            (message.status === "completed" || message.status === "failed"),
        )
        thread = stateFromSnapshot(sessionSnapshot)
        const submissionToRestore = afterExpiredCursor ? recoveredSubmission : pendingSubmission
        if (
          submissionToRestore !== null &&
          submissionToRestore === pendingSubmission &&
          !thread.messages.some((message) => message.id === submissionToRestore.optimisticUserId) &&
          (deferred === null || !thread.messages.some((message) => message.id === deferred.receipt.user_message_id))
        ) {
          thread = appendUserMessage(thread, {
            id: submissionToRestore.optimisticUserId,
            content: submissionToRestore.content,
          })
        }
        // A different owner watermark proves this was a new GC window. Keep
        // the retry cap only when the owner repeats the same expired cursor.
        if (afterExpiredCursor && thread.resumeCursor !== previousCursor) {
          cursorResetAttempts = 0
        }
        syncActiveEntry()
        // A receipt can win the race against the initial snapshot. Reset the
        // optimistic submitting phase so owner active/terminal state is
        // applied first; the exact receipt is reconciled below without opening
        // a pre-snapshot stream.
        if (!afterExpiredCursor && deferred !== null) {
          machine = transition(machine, { type: "RESET" })
        }
        const plan = reattachPlanFromSnapshot(sessionSnapshot)
        if (plan) {
          const before = machine
          machine = transition(machine, {
            type: "REATTACH",
            runId: plan.runId,
            state: plan.state,
          })
          if (machine !== before) {
            clearReattachTimer()
            if (plan.state === "queued" || plan.state === "active") {
              // 兜底窗口耗尽仍无终态：放弃续传，不永久卡在 streaming。待批帧不设时限。
              reattachTimer = setTimeout(() => {
                reattachTimer = null
                if (machine.runId !== plan.runId || machine.phase === "waiting" || machine.phase === "resuming") {
                  return
                }
                closeStream()
                connection = { status: "unavailable", reason: "timeout" }
                notify()
              }, reattachTimeoutMs)
            }
          }
        }
        if (afterExpiredCursor) {
          recoveringExpiredCursor = false
        }
        if (deferred !== null) {
          applyRecoveredReceipt(deferred.submission, deferred.receipt, deferredRunSettled)
        } else if (afterExpiredCursor) {
          if (
            recoveredSubmission !== null &&
            recoveredSubmission === pendingSubmission &&
            recoveredSubmissionError !== null &&
            machine.phase === "idle"
          ) {
            machine = transition(machine, { type: "FAIL", error: recoveredSubmissionError })
          }
        }
        // Snapshot 与 event_watermark 同事务视图。只有 owner active identity
        // 或本页 exact receipt identity 才需要从 watermark 继续 durable AG-UI；
        // terminal/idle head 会合法 EOF，不建立空闲重连轮询。
        if (plan !== null || machine.runId !== null) {
          openStream(sessionId, thread.resumeCursor)
        } else {
          closeStream()
          clearReattachTimer()
          connection = { status: "connected" }
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
        if (afterExpiredCursor) {
          // 已有可信 read model 的 replay/snapshot 恢复失败只改变连接可用性；
          // 保留正文、active identity、Stop 与 owner terminal，等待显式 snapshot-first 恢复。
          recoveringExpiredCursor = false
          connection = connectionFailure(error)
          notify()
          return
        }
        // 首次水合失败仍 fail-loud：尚无可信线程，不渲染半真半假的本地内容。
        hydrating = false
        machine = transition(machine, { type: "FAIL", error: describeUnknown(error) })
        notify()
      })
  }

  function reconnect(): void {
    if (
      disposed ||
      recoveringExpiredCursor ||
      connection.status !== "unavailable" ||
      store === null
    ) {
      return
    }
    recoveringExpiredCursor = true
    if (pendingSubmission !== null) {
      recoveredSubmission = pendingSubmission
      recoveredSubmissionError = machine.phase === "error" ? machine.error : null
    }
    connection = { status: "reconnecting" }
    closeStream()
    clearReattachTimer()
    notify()
    // 只读恢复：owner snapshot 决定 active/terminal/read model，再从其 watermark 续流。
    hydrate(store.activeId, true)
  }

  function messageExecutionOptions(mode: AgentMode): MessageExecutionOptions {
    return {
      mode,
      model: selectedModel,
      agent: selectedAgent,
      selectedSkillSourceRefs: [...selectedSkillSourceRefs],
    }
  }

  function applyRecoveredReceipt(
    submission: PendingSubmission,
    receipt: MessageCreateReceipt,
    ownerAlreadySettled = false,
  ): void {
    if (pendingSubmission !== submission || store?.activeId !== submission.sessionId) {
      return
    }
    pendingSubmission = null
    recoveredSubmission = null
    recoveredSubmissionError = null
    deferredCreateReceipt = null
    thread = reconcileUserMessageId(thread, receipt.user_message_id, submission.optimisticUserId)
    // Snapshot is authoritative when it already contains an active or settled
    // assistant run. An otherwise idle snapshot may precede the accepted POST;
    // anchor that exact receipt before hydrate decides whether to open a stream.
    if (
      machine.phase === "idle" &&
      !ownerAlreadySettled
    ) {
      machine = transition(machine, { type: "SUBMIT" })
      machine = transition(machine, { type: "RECEIPT", runId: receipt.run_id })
    }
  }

  // POST messages 并处理回执/失败（submit 与 retry 共用的开跑尾段）。
  function beginRun(args: PendingSubmission): void {
    const submission = {
      ...args,
      options: { ...args.options, selectedSkillSourceRefs: [...args.options.selectedSkillSourceRefs] },
    }
    pendingSubmission = submission
    recoveredSubmission = null
    recoveredSubmissionError = null
    deferredCreateReceipt = null
    const { sessionId, idempotencyKey } = submission
    execution
      .createMessage(submission)
      .then((receipt) => {
        const cancelledSessionId = cancelledSubmissions.get(idempotencyKey)
        if (cancelledSessionId === sessionId) {
          cancelledSubmissions.delete(idempotencyKey)
          cancelAcceptedSubmission(sessionId, receipt.run_id)
          return
        }
        // 回执落地前用户已重置/切换：丢弃迟到回执，不复活旧轮。
        if (
          disposed ||
          pendingSubmission !== submission ||
          store?.activeId !== sessionId
        ) {
          return
        }
        if (hydrating || recoveringExpiredCursor || connection.status !== "connected") {
          deferredCreateReceipt = { submission, receipt }
          return
        }
        if (machine.phase !== "submitting") {
          if (recoveredSubmission === submission) {
            applyRecoveredReceipt(submission, receipt)
            notify()
          }
          return
        }
        pendingSubmission = null
        recoveredSubmission = null
        recoveredSubmissionError = null
        deferredCreateReceipt = null
        thread = reconcileUserMessageId(thread, receipt.user_message_id, submission.optimisticUserId)
        machine = transition(machine, { type: "RECEIPT", runId: receipt.run_id })
        openStream(sessionId, thread.resumeCursor)
        notify()
      })
      .catch((error: unknown) => {
        cancelledSubmissions.delete(idempotencyKey)
        if (
          disposed ||
          pendingSubmission !== submission ||
          machine.phase !== "submitting" ||
          store?.activeId !== sessionId
        ) {
          return
        }
        const detail = describeUnknown(error)
        if (recoveringExpiredCursor || connection.status !== "connected") {
          recoveredSubmission = submission
          recoveredSubmissionError = detail
        }
        machine = transition(machine, { type: "FAIL", error: detail })
        notify()
      })
  }

  function submit(content: string): boolean {
    const trimmed = content.trim()
    if (!trimmed || !canSubmitMessage()) {
      return false
    }
    notice = null
    if (
      store !== null &&
      (machine.phase === "streaming" || machine.phase === "queued" || machine.phase === "resuming" ||
        machine.phase === "waiting")
    ) {
      // 运行中再次提交：沿现有 create-message 路径，不动状态机、不重开事件流。
      // 新 admission 不覆盖当前 execution head；FIFO 由 owner durable events/snapshot 接管。
      const optimisticUserId = createId("usr")
      thread = appendUserMessage(thread, { id: optimisticUserId, content: trimmed })
      notify()
      // 回执/失败必须锚回发起时的会话：POST 在途时切走 → 迟到回调不得落在别的会话线程上
      // （否则 adopt 会改/删 T 的乐观气泡、notice 串到 T）。与 beginRun 回执守卫对齐。
      const steerSessionId = store.activeId
      const steerGeneration = hydrateGeneration
      const receiptToken = Symbol("pending-steer-receipt")
      const submission: PendingSubmission = {
        sessionId: steerSessionId, content: trimmed, idempotencyKey: createId("idem"),
        options: messageExecutionOptions(activeMode(store)), optimisticUserId,
      }
      pendingSteerReceipts.set(receiptToken, submission)
      execution.createMessage(submission)
        .then((receipt) => {
          if (disposed || store?.activeId !== steerSessionId || hydrateGeneration !== steerGeneration) {
            return
          }
          const alreadyProjected = thread.messages.some((message) => message.id === receipt.user_message_id)
          thread = reconcileUserMessageId(thread, receipt.user_message_id, submission.optimisticUserId)
          const admitted = thread.messages.find((message) => message.id === receipt.user_message_id)
          if (!alreadyProjected && admitted) unprojectedAdmissions.set(receipt.user_message_id, { ...admitted, runId: receipt.run_id })
          if (machine.phase === "idle" && !observedTerminalRuns.has(JSON.stringify([steerSessionId, receipt.run_id]))) {
            // This POST may be admitted after the prior run settled. Its receipt
            // admits a queued successor, not START, and reuses the durable cursor.
            filesSyncGeneration += 1
            machine = transition(transition(machine, { type: "SUBMIT" }), { type: "RECEIPT", runId: receipt.run_id })
            openStream(steerSessionId, thread.resumeCursor)
          }
          notify()
        })
        .catch((error: unknown) => {
          if (disposed || store?.activeId !== steerSessionId || hydrateGeneration !== steerGeneration) {
            return
          }
          // 插话投递失败必须可见：瞬态通知（不打断相位），下次提交自动清。
          notice = { key: "steer.sendFailed", vars: { detail: describeUnknown(error) } }
          notify()
        })
        .finally(() => {
          // Terminal evidence exists only while an outstanding receipt can
          // still name it; settled long-lived sessions retain no run-ID cache.
          pendingSteerReceipts.delete(receiptToken)
          if (pendingSteerReceipts.size === 0) observedTerminalRuns.clear()
        })
      return true
    }
    const before = machine
    machine = transition(machine, { type: "SUBMIT" })
    if (machine === before) {
      // 同步双发守卫：submitting 相位（回执未归）的提交直接拒绝。
      return false
    }
    if (!store) {
      store = addConversation(null, createId("conv"), now(), pendingMode)
    }
    const optimisticUserId = createId("usr")
    thread = appendUserMessage(thread, { id: optimisticUserId, content: trimmed })
    syncActiveEntry()
    notify()
    // 模式意图上 wire：thinking 档=true，fast=false 显式关。
    beginRun({
      sessionId: store.activeId,
      content: trimmed,
      idempotencyKey: createId("idem"),
      options: messageExecutionOptions(activeMode(store)),
      optimisticUserId,
    })
    return true
  }

  function retry(): void {
    if (
      disposed ||
      recoveringExpiredCursor ||
      connection.status !== "connected" ||
      !store ||
      !canRetryPendingSubmission()
    ) {
      return
    }
    const pending = pendingSubmission
    if (pending === null) return
    const before = machine
    machine = transition(machine, { type: "SUBMIT" })
    if (machine === before) {
      return
    }
    notify()
    // 未获回执的恢复只复用原始冻结意图；不根据消息历史合成新 key/body。
    beginRun(pending)
  }

  function stageToolDecision(runId: string, itemId: string, decision: ToolDecision): void {
    if (disposed || recoveringExpiredCursor || connection.status !== "connected" || !store || machine.phase !== "waiting" || machine.runId !== runId) return
    const interaction = thread.interactionsByRun[runId]
    if (!interaction || interaction.phase !== "waiting" || !interaction.pause_ref) return
    const items = interaction.groups.flatMap((group) => group.items)
    const item = items.find((candidate) => candidate.item_id === itemId)
    if (!item || !item.allowed_decisions.includes(decision.type) || resumeInFlight.has(runId)) return
    const wireDecision = decision.type === "respond" ? { type: decision.type, item_id: itemId, response: decision.message } : { ...decision, item_id: itemId }
    if (!resumeDecisionSchema.safeParse(wireDecision).success) return
    const frozen = frozenResumes.get(runId)
    // An unknown outcome can retry only the exact frozen intent, never edit the digest.
    if (frozen && JSON.stringify(staging.get(runId)?.get(itemId)) !== JSON.stringify(decision)) return
    const staged = frozen ? staging.get(runId)! : stageDecision(staging.get(runId) ?? new Map(), itemId, decision)
    staging.set(runId, staged)
    const decisions = buildResumeDecisions(staged, items)
    if (!decisions) { notify(); return }
    const intent = frozen ?? {
      sessionId: store.activeId, runId, expectedPauseRevision: interaction.pause_revision,
      pauseRef: interaction.pause_ref, decisions: structuredClone(decisions), commandId: createId("command"),
    }
    frozenResumes.set(runId, intent)
    resumeCommandIds.set(runId, intent.commandId)
    resumeInFlight.add(runId)
    machine = { ...machine, error: null }
    notify()
    sendResumeIntent(intent)
  }

  function retryableResume(): ResumeRunArgs | null {
    if (disposed || recoveringExpiredCursor || connection.status !== "connected" || machine.phase !== "resuming" || !store || !machine.runId) return null
    const intent = frozenResumes.get(machine.runId)
    const interaction = thread.interactionsByRun[machine.runId]
    return intent && interaction?.action_result?.kind === "unknown" &&
      interaction.action_result.command_id === intent.commandId && intent.sessionId === store.activeId &&
      interaction.pause_revision === intent.expectedPauseRevision && interaction.pause_ref === intent.pauseRef &&
      !resumeInFlight.has(machine.runId) ? intent : null
  }

  function retryResume(): void {
    const intent = retryableResume()
    if (intent) sendResumeIntent(intent)
  }

  function sendResumeIntent(intent: ResumeRunArgs): void {
    const { runId } = intent
    resumeInFlight.add(runId)
    machine = { ...machine, error: null }
    notify()
    const generation = hydrateGeneration
    const attempt = Symbol("resume-attempt")
    resumeAttempts.set(runId, attempt)
    const current = () => !disposed && store?.activeId === intent.sessionId && hydrateGeneration === generation &&
      frozenResumes.get(runId) === intent && resumeAttempts.get(runId) === attempt &&
      machine.runId === runId && machine.phase !== "cancelling" &&
      thread.interactionsByRun[runId]?.pause_revision === intent.expectedPauseRevision &&
      thread.interactionsByRun[runId]?.pause_ref === intent.pauseRef
    execution.resumeRun(intent).then((receipt) => {
      if (!current()) return
      if (receipt.status === "failed") {
        resumeInFlight.delete(runId)
        const error = receipt.error_code && SAFE_CONTROL_FAILURES.has(receipt.error_code) ? receipt.error_code : "control_failed"
        machine = transition(machine, { type: "CONTROL_FAILED", error })
        const cursor = thread.resumeCursor
        // A definitive failed command releases the lock, but only owner facts
        // replace cards/pause. Never synthesize consumption or issue another POST.
        void execution.fetchSnapshot(intent.sessionId).then((owner) => {
          if (!current() || owner === null || thread.resumeCursor !== cursor) return
          adoptOwnerSnapshot(intent.sessionId, owner)
          if (frozenResumes.get(runId) === intent && machine.runId === runId) machine = { ...machine, error }
          notify()
        }).catch(() => { /* Retain the safe failure and last confirmed cards. */ })
      }
      // pending/succeeded acknowledge admission only; native events own phase.
      notify()
    }).catch((error: unknown) => {
      if (!current()) return
      resumeInFlight.delete(runId)
      const detail = describeUnknown(error)
      if (STALE_CONTROL_ERRORS.has(detail)) {
        closeStream()
        machine = transition(machine, { type: "RESET" })
        staging.clear(); frozenResumes.clear(); resumeAttempts.clear(); resumeCommandIds.clear(); resumeInFlight.clear()
        hydrate(intent.sessionId)
      } else machine = transition(machine, { type: "CONTROL_FAILED", error: detail })
      notify()
    })
  }

  // 切换活跃会话的公共尾段：清流/清相位/清暂存，换空线程后按 snapshot 重新水合。
  function activateConversation(next: ConversationStore, shouldHydrate = true): void {
    const previousSessionId = store?.activeId ?? null
    recoveringExpiredCursor = false
    connection = { status: "connected" }
    closeStream()
    clearReattachTimer()
    machine = transition(machine, { type: "RESET" })
    staging.clear()
    resumeCommandIds.clear()
    resumeInFlight.clear()
    frozenResumes.clear(); resumeAttempts.clear()
    pendingSubmission = null
    recoveredSubmission = null
    recoveredSubmissionError = null
    deferredCreateReceipt = null
    if (previousSessionId !== next.activeId) {
      selectedSkillSourceRefs = []
    }
    thread = createSessionStreamState()
    observedTerminalRuns.clear()
    pendingSteerReceipts.clear()
    unprojectedAdmissions.clear()
    processEventIds.clear()
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
    frozenResumes.clear(); resumeAttempts.clear()
    pendingSubmission = null
    recoveredSubmission = null
    recoveredSubmissionError = null
    deferredCreateReceipt = null
    connection = { status: "connected" }
    selectedSkillSourceRefs = []
    thread = createSessionStreamState()
    observedTerminalRuns.clear()
    pendingSteerReceipts.clear()
    unprojectedAdmissions.clear()
    processEventIds.clear()
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
    if (!store || !machine.runId || machine.phase === "cancelling") return
    const runId = machine.runId
    const sessionId = store.activeId
    const generation = hydrateGeneration
    machine = transition(machine, { type: "CANCEL" })
    notify()
    execution.cancelRun({ sessionId, runId, commandId: createId("command") }).catch((error: unknown) => {
      if (disposed || store?.activeId !== sessionId || generation !== hydrateGeneration || machine.runId !== runId) return
      machine = transition(machine, { type: "CONTROL_FAILED", error: describeUnknown(error) })
      notify()
    })
  }

  function setSelectedSkillSourceRefs(sourceRefs: readonly string[]): void {
    if (disposed) {
      return
    }
    selectedSkillSourceRefs = [...sourceRefs]
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
    snapshot = buildSnapshot()
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
    recoveringExpiredCursor = false
    connection = { status: "connected" }
    closeStream()
    clearReattachTimer()
    machine = transition(machine, { type: "RESET" })
    staging.clear()
    resumeCommandIds.clear()
    resumeInFlight.clear()
    frozenResumes.clear(); resumeAttempts.clear()
    pendingSubmission = null
    recoveredSubmission = null
    recoveredSubmissionError = null
    deferredCreateReceipt = null
    selectedSkillSourceRefs = []
    thread = createSessionStreamState()
    observedTerminalRuns.clear()
    pendingSteerReceipts.clear()
    unprojectedAdmissions.clear()
    processEventIds.clear()
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
    retryResume,
    reconnect,
    cancelRun,
    stageToolDecision,
    selectConversation,
    openConversation,
    newConversation,
    deleteConversation,
    setMode,
    setSelectedSkillSourceRefs,
    setModel,
    setAgent,
    dispose,
  }
}
