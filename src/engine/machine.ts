import { readMessageParts, type MessagePartsRead } from "./message-parts-reader"
import { mergeMessageParts, preserveMessageParts } from "@/core/reducer"
import { selectedMcpConnectionIdsSchema } from "@/contract/chat"
// 显式会话状态机 + 引擎：snapshot-first 水合 / 流句柄 / in-flight 守卫 / runId 锚定收束单点持有。

import type { ChatProjectionEvent } from "@/core/chat-projection-event"
import type { EventCursor } from "@/contract/agui-events"
import { resumeDecisionSchema } from "@/contract/control"
import type { ResumeRunArgs } from "./execution-adapter"
import type { PendingSubmission } from "./submission-recovery"

import type { MessageCreateReceipt, SessionSnapshot } from "@/contract/http"

import {
  activeMode,
  activeIsLocalDraft,
  retireLocalDraft,
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
  buildMessageCreateParams,
  createExecutionAdapter,
  type MessageExecutionOptions,
} from "./execution-adapter"
import {
  type EngineDeps,
  type EngineSnapshot,
  type ConnectionAvailability,
  type MessagePartsReadTarget,
  type NoticeSpec,
  type SessionEngine,
} from "./engine-types"
import { IDLE_MACHINE, transition, type MachineState } from "./machine-state"
import { DIRECT_SESSION_SCOPE, sessionScopeKey } from "./session-scope"
import {
  buildResumeDecisions,
  stageDecision,
  type StagedDecisions,
  type ToolDecision,
} from "./hitl-staging"
import { createTaskNotifications } from "./task-notification"
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

export function createSessionEngine(deps: EngineDeps): SessionEngine {
  const now = deps.now ?? (() => Date.now())
  const createId = deps.createId ?? defaultCreateId
  const reattachTimeoutMs = deps.reattachTimeoutMs ?? REATTACH_TIMEOUT_MS
  const scope = deps.scope ?? DIRECT_SESSION_SCOPE
  const execution = createExecutionAdapter({ client: deps.client, scope })
  const taskNotifications = createTaskNotifications()
  const notificationAdmissions = new WeakMap<PendingSubmission, number>()

  function canRestoreDraft(candidate: ConversationStore | null): boolean {
    if (!candidate || !activeIsLocalDraft(candidate)) return false
    try { return deps.draftLifecycle?.isUnsubmitted(candidate.activeId) === true }
    catch { return false }
  }

  let machine: MachineState = IDLE_MACHINE
  let store: ConversationStore | null = deps.storage.read()
  // One transition uses one external-storage observation; a later read may change.
  const restoringInitialDraft = canRestoreDraft(store)
  let thread: SessionStreamState = createSessionStreamState()
  // An existing persisted session is hydrated as soon as the engine is made;
  // expose that work in the first snapshot instead of making the shell infer
  // it from an empty thread.
  let hydrating = store !== null && !restoringInitialDraft
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
  // Prepared before POST: a failed write/read-back must not silently regenerate its identity.
  let preparedSubmission: PendingSubmission | null = null
  let submissionRecoveryUnavailable = false
  // Exact receipts whose local retirement could not be saved. Retry only the local write, never POST.
  const unsavedReceipts = new Map<string, { submission: PendingSubmission; receipt: MessageCreateReceipt }>()
  // create 回执可能与 expired-cursor snapshot recovery 并发；recovery 期间先暂存，
  // 由 owner snapshot 建立新真态后再按 exact run identity 吸收，绝不抢开 stale stream。
  let recoveredSubmission: PendingSubmission | null = null
  let recoveredSubmissionError: string | null = null
  let deferredCreateReceipt: { submission: PendingSubmission; receipt: MessageCreateReceipt } | null = null
  // Stop can arrive after POST has started but before its receipt. Remember
  // those keys so an accepted late run is cancelled instead of being
  // resurrected by the delayed response.
  const cancelledSubmissions = new Map<string, string>()
  const createInFlight = new Map<string, number>()
  const observedTerminalRuns = new Set<string>()
  const pendingSteerReceipts = new Map<symbol, PendingSubmission>()
  // Exact acknowledged local rows not yet observed in the durable projection.
  // Snapshot/live canonical identity confirms and removes these bounded intents.
  const unprojectedAdmissions = new Map<string, SessionMessage>()
  let notice: NoticeSpec | null = null
  // 当前会话 exact source refs：只在内存中保存，不从 browser store 恢复。
  let selectedSkillSourceRefs: string[] | undefined = scope.kind === "project" ? undefined : []
  // 选中模型（MODEL-UX，shell 注入）：非 null 即随首条 messageCreate 上 wire 为 model（首条锁语义在 UI 层）。
  let selectedMcpConnectionIds: readonly string[] = Object.freeze([])
  let selectedModel: string | null = null

  // 水合代际守卫：切会话后迟到的 snapshot 一律丢弃。
  let hydrateGeneration = 0
  let cursorResetAttempts = 0
  let recoveringExpiredCursor = false
  // 文件同步代际守卫：同会话连续 run 收尾的乱序 snapshot 回来，只认最新一次。
  let filesSyncGeneration = 0
  let pendingTerminalRead: { generation: number; runs: Set<string> } | null = null
  let reattachTimer: ReturnType<typeof setTimeout> | null = null
  let locallyCreatedSessionId: string | undefined = restoringInitialDraft ? store?.activeId : undefined
  let ownerConfirmedSessionId: string | undefined
  let missingSessionId: string | undefined
  let disposed = false
  let deleteIntentGeneration = 0
  let deleteIntent: { targetId: string; generation: number; promise: Promise<boolean> } | null = null
  // 多 tab 实时同步：订阅会话 store 的跨 tab 变更（persisted-store 的 storage 事件）。
  let unsubscribeStore: (() => void) | null = null

  // Omission is only for framework-free engine callers; browser factory always closes this boundary explicitly.
  let messagePartsReadTarget = deps.messagePartsReadTarget
  const partsReads = new Map<string, { controller: AbortController; fresh: boolean }>()
  const queuedPartsReads = new Map<string, { fresh: boolean; sessionId: string; generation: number; retainJournal?: boolean }>()
  const partsJournals = new Map<string, { events: ChatProjectionEvent[]; bytes: number; overflow: boolean }>()
  const endedPartsRuns = new Set<string>()
  const cancelledPartsRuns = new Set<string>()
  let cancelIntent: { sessionId: string; runId: string; generation: number; commandId: string; inFlight: boolean } | null = null

  function retireMessageParts(): void {
    cancelIntent = null
    for (const read of partsReads.values()) read.controller.abort()
    partsReads.clear(); queuedPartsReads.clear(); partsJournals.clear(); endedPartsRuns.clear(); cancelledPartsRuns.clear()
  }
  function retireRunMessageParts(runId: string): void {
    cancelledPartsRuns.add(runId)
    for (const part of Object.values(thread.messageParts ?? {})) {
      if (part.runId !== runId) continue
      partsReads.get(part.messageId)?.controller.abort()
      partsReads.delete(part.messageId)
      queuedPartsReads.delete(part.messageId)
      if (part.status === "loading" || part.status === "unread") setPartsStatus(part.messageId, "partial")
    }
    partsJournals.delete(runId); endedPartsRuns.delete(runId)
  }
  function setPartsStatus(messageId: string, status: "loading" | "partial" | "complete" | "changed" | "failed"): void {
    const part = thread.messageParts?.[messageId]
    if (part) thread = { ...thread, messageParts: { ...thread.messageParts, [messageId]: { ...part, status } } }
  }
  function messagePartsReadable(sessionId = store?.activeId): boolean {
    return messagePartsReadTarget === undefined || (messagePartsReadTarget !== null &&
      messagePartsReadTarget.conversationId === sessionId && sessionScopeKey(messagePartsReadTarget.scope) === sessionScopeKey(scope))
  }
  function setMessagePartsReadTarget(target: MessagePartsReadTarget | null): void {
    if (disposed) return
    if (messagePartsReadTarget === target || (messagePartsReadTarget != null && target !== null &&
      messagePartsReadTarget.conversationId === target.conversationId && sessionScopeKey(messagePartsReadTarget.scope) === sessionScopeKey(target.scope))) return
    messagePartsReadTarget = target === null ? null : { conversationId: target.conversationId, scope: { ...target.scope } }
    if (!messagePartsReadable()) {
      for (const [messageId, read] of partsReads) {
        read.controller.abort()
        if (store) queuedPartsReads.set(messageId, { fresh: read.fresh, sessionId: store.activeId, generation: hydrateGeneration, retainJournal: true })
      }
      partsReads.clear()
      for (const [messageId, queued] of queuedPartsReads) {
        queued.retainJournal = true
        if (thread.messageParts?.[messageId]?.status === "loading") setPartsStatus(messageId, "partial")
      }
    } else {
      drainPartsQueue()
      readSnapshotParts()
    }
    notify()
  }
  function drainPartsQueue(): void {
    if (disposed || !messagePartsReadable()) return
    while (partsReads.size < 3 && queuedPartsReads.size > 0) {
      const entries = [...queuedPartsReads.entries()]
      const [messageId, queued] = entries.find(([, entry]) => entry.fresh) ?? entries[0]!
      queuedPartsReads.delete(messageId)
      if (queued.sessionId !== store?.activeId || queued.generation !== hydrateGeneration) continue
      startMessagePartsRead(messageId, queued.fresh, queued.retainJournal)
    }
  }
  function fetchOrderedMessage(messageId: string, fresh = false): void {
    if (disposed || !store || !thread.messageParts?.[messageId]) return
    if (partsReads.has(messageId)) {
      if (!fresh) return
      partsReads.get(messageId)?.controller.abort(); partsReads.delete(messageId)
    }
    queuedPartsReads.set(messageId, { fresh: fresh || queuedPartsReads.get(messageId)?.fresh === true, sessionId: store.activeId, generation: hydrateGeneration,
      retainJournal: !messagePartsReadable() || queuedPartsReads.get(messageId)?.retainJournal === true })
    if (messagePartsReadable()) {
      setPartsStatus(messageId, "loading")
      drainPartsQueue()
    }
  }
  function startMessagePartsRead(messageId: string, fresh: boolean, retainJournal = false): void {
    const known = thread.messageParts?.[messageId]
    const sessionId = store?.activeId
    if (!known || !sessionId || disposed || !messagePartsReadable(sessionId)) return
    partsReads.get(messageId)?.controller.abort()
    const controller = new AbortController(), generation = hydrateGeneration
    partsReads.set(messageId, { controller, fresh })
    if ((fresh && !retainJournal) || !partsJournals.has(known.runId)) partsJournals.set(known.runId, { events: [], bytes: 0, overflow: false })
    const journal = partsJournals.get(known.runId)!
    const recoverUnauthorized = deps.captureMessagePartsReadRecheck?.()
    const current = () => !disposed && messagePartsReadable(sessionId) && !controller.signal.aborted && partsReads.get(messageId)?.controller === controller && hydrateGeneration === generation && store?.activeId === sessionId && thread.messageParts?.[messageId]?.runId === known.runId
    setPartsStatus(messageId, "loading")
    const merge = (read: MessagePartsRead, complete: boolean) => {
      if (!current()) return
      if (journal.overflow) { controller.abort(); partsReads.delete(messageId); setPartsStatus(messageId, "partial"); drainPartsQueue(); readSnapshotParts(); notify(); return }
      thread = mergeMessageParts(thread, read, journal.events, complete)
      if (!complete) setPartsStatus(messageId, "loading")
      notify()
    }
    void readMessageParts({ client: deps.client, sessionId, messageId, runId: known.runId, scope,
      ...(recoverUnauthorized === undefined ? {} : { recoverUnauthorized }),
      minimumRevision: known.revision,
      ...(known.partIds === undefined ? {} : { retainedPartIds: known.partIds }),
      ...(fresh || known.cursor === undefined ? {} : { cursor: known.cursor, ...(known.watermark === undefined ? {} : { expected: { revision: known.revision, event_watermark: known.watermark } }) }), signal: controller.signal,
      onProgress: (read) => merge(read, false),
    }).then((read) => merge(read, true)).catch((error: unknown) => {
      if (!current()) return
      setPartsStatus(messageId, error instanceof SessionClientError && error.status === 409 && error.code === "message_parts_changed" ? "changed" : "failed")
      notify()
    }).finally(() => {
      if (partsReads.get(messageId)?.controller === controller) { partsReads.delete(messageId); drainPartsQueue(); readSnapshotParts() }
    })
  }
  function readSnapshotParts(): void {
    if (disposed) return
    // Hidden run delivery remains owned: preserve its bounded suffix journal before opening SSE,
    // even though the historical body is not yet admitted by a visible route.
    const runId = thread.activeRunId
    if (runId && !partsJournals.has(runId) && Object.values(thread.messageParts ?? {}).some(part => part.runId === runId))
      partsJournals.set(runId, { events: [], bytes: 0, overflow: false })
    if (!messagePartsReadable()) return
    // Prioritize the visible tail. Historical Messages never fan out an entire
    // snapshot into 100 simultaneous body reads or delay the live stream.
    for (const part of Object.values(thread.messageParts ?? {}).reverse()) {
      if (partsReads.size >= 3) break
      if (part.status === "unread" && cancelledPartsRuns.has(part.runId)) setPartsStatus(part.messageId, "partial")
      else if (part.status === "unread") fetchOrderedMessage(part.messageId)
    }
  }
  function registerMessagePartsReceipt(sessionId: string, receipt: MessageCreateReceipt): void {
    if (disposed || store?.activeId !== sessionId) return
    thread = { ...thread, messageParts: { ...thread.messageParts, [receipt.assistant_message_id]: thread.messageParts?.[receipt.assistant_message_id] ?? {
      messageId: receipt.assistant_message_id, runId: receipt.run_id, revision: "0", status: "unread",
    } } }
    if (!partsJournals.has(receipt.run_id)) partsJournals.set(receipt.run_id, { events: [], bytes: 0, overflow: false })
    if (endedPartsRuns.has(receipt.run_id) && thread.messageParts?.[receipt.assistant_message_id]?.status !== "changed" && !cancelledPartsRuns.has(receipt.run_id)) fetchOrderedMessage(receipt.assistant_message_id, true)
  }
  function retryMessageParts(messageId: string): void {
    if (!messagePartsReadable()) return
    if (!thread.messageParts?.[messageId] || partsReads.has(messageId) || queuedPartsReads.has(messageId)) return
    cancelledPartsRuns.delete(thread.messageParts[messageId]!.runId)
    fetchOrderedMessage(messageId, true)
    notify()
  }

  function restoreSubmission(sessionId: string): boolean | null {
    if (!deps.submissionRecovery) return false
    try {
      const restored = deps.submissionRecovery.read(sessionId)
      submissionRecoveryUnavailable = false
      if (!restored) return false
      pendingSubmission = restored.submission
      thread = appendUserMessage(thread, { id: restored.submission.optimisticUserId, content: restored.submission.content })
      machine = transition(machine, { type: "FAIL", error: restored.failureCode ?? "submission_outcome_unknown" })
      return true
    } catch {
      // An unreadable record is not absence or proof that the request never left.
      submissionRecoveryUnavailable = true
      connection = { status: "unavailable", reason: "parse" }
      machine = transition(machine, { type: "FAIL", error: "local_recovery_unavailable" })
      notice = { key: "chat.submissionRecoveryFailed" }
      return null
    }
  }

  const restoredInitialSubmission = store !== null && restoreSubmission(store.activeId)
  if (restoredInitialSubmission) hydrating = true
  else if (restoredInitialSubmission === null) hydrating = false
  const listeners = new Set<() => void>()
  let snapshot: EngineSnapshot = buildSnapshot()

  function canSubmitMessage(): boolean {
    if (disposed || recoveringExpiredCursor || submissionRecoveryUnavailable || connection.status !== "connected") return false
    if (machine.phase === "idle" || machine.phase === "error") return !deps.submissionRecovery || pendingSubmission === null
    return store !== null && (
      machine.phase === "streaming" || machine.phase === "queued" ||
      machine.phase === "resuming" || machine.phase === "waiting"
    )
  }

  function canRetryPendingSubmission(): boolean {
    return !hydrating && !submissionRecoveryUnavailable && connection.status === "connected" &&
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
      ...(ownerConfirmedSessionId !== undefined && ownerConfirmedSessionId === store?.activeId ? { ownerConfirmedSessionId } : {}),
      ...(locallyCreatedSessionId !== undefined && locallyCreatedSessionId === store?.activeId ? {locallyCreatedSessionId} : {}),
      ...(missingSessionId !== undefined && missingSessionId === store?.activeId ? { missingSessionId } : {}),
      notice,
      store,
      thread,
      pendingMode,
      selectedMcpConnectionIds,
      staging: stagingView,
      hydrating,
      connection,
      canSubmitMessage: canSubmitMessage(),
      canRetryPendingSubmission: canRetryPendingSubmission(),
      hasPendingSubmission: pendingSubmission !== null || preparedSubmission !== null,
      canRetryResume: retryableResume() !== null,
    }
  }

  function reconcileConversationCache(sessionId: string): void {
    if (!store?.conversations.some((entry) => entry.id === sessionId)) return
    const next = removeConversation(store, sessionId, createId("conv"), now())
    store = next
    deps.storage.write(next)
    notify()
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
    const completedTextRuns = new Set<string>()
    for (const event of events) {
      if (event.kind === "message.delta" && event.payload.text_boundary === "end") { completedTextRuns.add(event.run_id); endedPartsRuns.add(event.run_id) }
      if (event.kind !== "message.delta" && event.kind !== "message.completed" && event.kind !== "activity.updated") continue
      const journal = partsJournals.get(event.run_id)
      if (!journal) continue
      if (event.publicSequence === undefined) { journal.overflow = true; continue }
      const bytes = new TextEncoder().encode(JSON.stringify(event)).byteLength
      if (journal.bytes + bytes > 1_048_576) journal.overflow = true
      else { journal.events.push(event); journal.bytes += bytes }
    }
    const optimisticUserIds = new Set([...pendingSteerReceipts.values()].map((intent) => intent.optimisticUserId))
    if (pendingSubmission) optimisticUserIds.add(pendingSubmission.optimisticUserId)
    const reduction = reduceProjectionEvents({ thread, machine, events, optimisticUserIds })
    for (const event of events) {
      if (event.kind === "message.user") unprojectedAdmissions.delete(event.payload.message_id)
      if (event.kind === "run.completed" || event.kind === "run.failed" || event.kind === "run.dispatch_failed") {
        pendingTerminalRead?.runs.add(event.run_id)
        if (store && (pendingSteerReceipts.size > 0 || pendingSubmission !== null)) observedTerminalRuns.add(JSON.stringify([store.activeId, event.run_id]))
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
    for (const event of events) {
      if (event.kind !== "run.completed" || event.payload.status !== "cancelled") continue
      // Stop retired only the in-flight body read, not the body itself. A real
      // terminal permits one existing bounded read to reconcile its exact parts.
      if (cancelledPartsRuns.delete(event.run_id)) {
        for (const part of Object.values(thread.messageParts ?? {})) {
          if (part.runId === event.run_id && part.status !== "complete" && part.status !== "changed") fetchOrderedMessage(part.messageId, true)
        }
      }
    }
    for (const runId of completedTextRuns) {
      const part = Object.values(thread.messageParts ?? {}).find((item) => item.runId === runId)
      if (part && part.status !== "changed" && !cancelledPartsRuns.has(runId)) fetchOrderedMessage(part.messageId, true)
    }
    exposeUnconfirmedSubmission()
    taskNotifications.observe(events)
    if (machine.phase === "waiting" || machine.phase === "streaming") {
      // 待批帧：用户决策不设时限；streaming：reattach 已收到 live 事件即证明 run 活着。
      // 两者都撤 90s 兜底——否则长 run（>90s 工具执行）会被 TIMEOUT 误切流，UI 与真态撕裂。
      clearReattachTimer()
    }
    if (reduction.settledRunId !== null) {
      if (cancelIntent?.runId === reduction.settledRunId) cancelIntent = null
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
    notificationGeneration = taskNotifications.generation(),
  ): void {
    for (const read of partsReads.values()) read.controller.abort()
    partsReads.clear()
    queuedPartsReads.clear()
    const previous = thread
    const hydrated = preserveMessageParts(previous, stateFromSnapshot(sessionSnapshot))
    missingSessionId = undefined
    ownerConfirmedSessionId = sessionId
    if (locallyCreatedSessionId === sessionId) locallyCreatedSessionId = undefined
    // RR cannot regress an already known interaction baseline, even when the
    // snapshot and current cursor happen to be equal opaque values.
    for (const [runId, next] of Object.entries(hydrated.interactionsByRun)) {
      const before = previous.interactionsByRun[runId]
      if (before && (next.interaction_revision < before.interaction_revision ||
        (next.interaction_revision === before.interaction_revision && !sameInteractionState(before, next)))) return
    }
    if (liveDeliveries) Object.assign(hydrated, liveDeliveries)
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
    // closeStream invalidates callbacks AND queued adapter batches. The mapper
    // created by openStream receives this exact snapshot's interaction baseline.
    closeStream()
    clearReattachTimer()
    taskNotifications.anchorSnapshot(sessionId, sessionSnapshot, notificationGeneration)
    thread = hydrated
    readSnapshotParts()
    observeSnapshotTerminals(sessionId, sessionSnapshot)
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
    exposeUnconfirmedSubmission()
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
    const notificationGeneration = taskNotifications.generation()
    const cursorAtStart = thread.resumeCursor
    execution.fetchSnapshot(sessionId).then((sessionSnapshot) => {
      if (disposed || generation !== filesSyncGeneration || sessionGeneration !== hydrateGeneration || store?.activeId !== sessionId) return
      if (sessionSnapshot === null) {
        if (machine.phase === "idle" && thread.resumeCursor === cursorAtStart) closeStream()
        return
      }
      observeSnapshotTerminals(sessionId, sessionSnapshot)
      const snapshotDeliveries = sessionSnapshot.deliveries.map(deliveryFromSnapshot)
      const liveAdvanced = thread.resumeCursor !== cursorAtStart
      thread = {
        ...thread, files: sessionSnapshot.files,
        deliveries: liveAdvanced
          ? [...new Map([...snapshotDeliveries, ...thread.deliveries].map((item) => [JSON.stringify([item.conversationId, item.artifactId]), item])).values()]
          : snapshotDeliveries,
        deliveriesHasMore: liveAdvanced ? thread.deliveriesHasMore || sessionSnapshot.deliveries_has_more : sessionSnapshot.deliveries_has_more,
      }
      if (machine.phase === "idle" || (deps.submissionRecovery && pendingSubmission !== null && machine.error === "submission_outcome_unknown")) {
        const head = sessionSnapshot.execution_head
        // Never revive the exact observed terminal head from a stale RR view.
        if (!head) {
          if (!liveAdvanced) {
            // A successful owner read with no successor authorizes the quiet terminal
            // state. Retire the terminal stream generation before reopening admission.
            closeStream()
            connection = { status: "connected" }
          }
        } else if (head.run_id === settledRunId || terminalRead.runs.has(head.run_id) ||
          observedTerminalRuns.has(JSON.stringify([sessionId, head.run_id]))) {
          closeStream()
        } else adoptOwnerSnapshot(sessionId, sessionSnapshot, liveAdvanced
          ? { deliveries: thread.deliveries, deliveriesHasMore: thread.deliveriesHasMore } : undefined, notificationGeneration)
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
    retireRunMessageParts(runId)
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

  function abandonPendingSubmission(): boolean {
    const submission = pendingSubmission ?? preparedSubmission
    if (submission === null) return true
    let retired = true
    try { retired = deps.submissionRecovery?.abandon(submission) ?? true } catch { retired = false }
    if (!retired) {
      // Keep the original recoverable slot; never claim that a failed retirement stuck.
      notice = { key: "chat.submissionRecoveryFailed" }
      notify()
      return false
    }
    const deferred = deferredCreateReceipt
    if (deferred !== null && deferred.submission === submission) {
      cancelledSubmissions.delete(submission.idempotencyKey)
      cancelAcceptedSubmission(submission.sessionId, deferred.receipt.run_id)
    } else if (createInFlight.has(submission.idempotencyKey)) {
      // The create outcome is still unknown. Its promise callback consumes
      // this exact key/session marker and cancels an accepted late receipt.
      cancelledSubmissions.set(submission.idempotencyKey, submission.sessionId)
    }
    pendingSubmission = null
    recoveredSubmission = null
    recoveredSubmissionError = null
    deferredCreateReceipt = null
    preparedSubmission = null
    return true
  }

  function cancelPendingSubmission(): boolean {
    if (machine.phase !== "submitting" || !store || pendingSubmission === null) {
      return true
    }
    return abandonPendingSubmission()
  }

  // snapshot-first 水合：GET /sessions/:sid → 当前读模型 + opaque AG-UI watermark 续流。
  function hydrate(sessionId: string, afterExpiredCursor = false, receiptConfirmedBeforeRead = false): void {
    missingSessionId = undefined
    taskNotifications.select(sessionId)
    const notificationGeneration = taskNotifications.generation()
    retireMessageParts()
    hydrateGeneration += 1
    observedTerminalRuns.clear()
    pendingSteerReceipts.clear()
    unprojectedAdmissions.clear()
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
            if (!abandonPendingSubmission()) { hydrating = false; notify(); return }
            evictActiveConversation()
            return
          }
          // Absence is not proof that a POST still awaiting its receipt failed.
          // A deep link may show this evidence, but local creation/unknown
          // submission keeps its original optimistic state and recovery key.
          if (receiptConfirmedBeforeRead || (pendingSubmission?.sessionId !== sessionId && locallyCreatedSessionId !== sessionId && thread.messages.length === 0)) {
            missingSessionId = sessionId
          }
          hydrating = false
          const deferred = deferredCreateReceipt
          if (deferred !== null && deferred.submission === pendingSubmission) {
            // The read may have preceded the accepted POST. Its absence must
            // not strand the exact receipt or trigger another create command.
            machine = transition(machine, { type: "RESET" })
            applyRecoveredReceipt(deferred.submission, deferred.receipt)
            openStream(sessionId, thread.resumeCursor)
          }
          notify()
          return
        }
        ownerConfirmedSessionId = sessionId
        locallyCreatedSessionId = undefined
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
            (message.run_id === deferred.receipt.run_id || message.message_id === deferred.receipt.assistant_message_id) &&
            (message.status === "completed" || message.status === "failed"),
        )
        taskNotifications.anchorSnapshot(sessionId, sessionSnapshot, notificationGeneration)
        thread = preserveMessageParts(thread, stateFromSnapshot(sessionSnapshot))
        readSnapshotParts()
        observeSnapshotTerminals(sessionId, sessionSnapshot)
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
        exposeUnconfirmedSubmission()
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
    if (submissionRecoveryUnavailable) {
      connection = { status: "connected" }
      notice = null
      machine = transition(machine, { type: "RESET" })
      const restored = restoreSubmission(store.activeId)
      if (restored === null) { notify(); return }
      if (!restored) pendingSubmission = null
      hydrate(store.activeId)
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
      selectedMcpConnectionIds: [...selectedMcpConnectionIds],
      selectedSkillSourceRefs: selectedSkillSourceRefs === undefined ? undefined : [...selectedSkillSourceRefs],
    }
  }

  function observeSnapshotTerminals(sessionId: string, owner: SessionSnapshot): void {
    if (!deps.submissionRecovery || pendingSubmission === null) return
    for (const row of owner.messages ?? []) {
      if (row.role === "assistant" && (row.status === "completed" || row.status === "failed")) {
        if (row.run_id) observedTerminalRuns.add(JSON.stringify([sessionId, row.run_id]))
        observedTerminalRuns.add(JSON.stringify(["message", sessionId, row.message_id]))
      }
    }
  }

  function exposeUnconfirmedSubmission(): void {
    if (deps.submissionRecovery && pendingSubmission !== null && machine.phase === "idle") {
      machine = transition(machine, { type: "FAIL", error: "submission_outcome_unknown" })
    }
  }

  function persistReceipt(submission: PendingSubmission, receipt: MessageCreateReceipt): boolean {
    if (!deps.submissionRecovery) return true
    let saved = false
    try { saved = deps.submissionRecovery.acknowledge(submission, receipt) } catch { /* Keep exact ACK for a local-only retry. */ }
    if (saved) unsavedReceipts.delete(submission.idempotencyKey)
    else unsavedReceipts.set(submission.idempotencyKey, { submission, receipt })
    return saved
  }

  function flushReceipts(): boolean {
    for (const { submission, receipt } of unsavedReceipts.values()) {
      if (!persistReceipt(submission, receipt)) {
        notice = { key: "chat.submissionRecoveryFailed" }
        notify()
        return false
      }
    }
    return true
  }

  function receiptAlreadySettled(submission: PendingSubmission, receipt: MessageCreateReceipt): boolean {
    return observedTerminalRuns.has(JSON.stringify([submission.sessionId, receipt.run_id])) ||
      observedTerminalRuns.has(JSON.stringify(["message", submission.sessionId, receipt.assistant_message_id]))
  }

  function sameSubmission(left: PendingSubmission | null, right: PendingSubmission): boolean {
    return left !== null && left.sessionId === right.sessionId && left.optimisticUserId === right.optimisticUserId &&
      JSON.stringify(buildMessageCreateParams({ ...left, scope })) === JSON.stringify(buildMessageCreateParams({ ...right, scope }))
  }

  function reconcileKnownReceipt(submission: PendingSubmission, receipt: MessageCreateReceipt): void {
    pendingSubmission = null
    preparedSubmission = null
    recoveredSubmission = null
    recoveredSubmissionError = null
    deferredCreateReceipt = null
    ownerConfirmedSessionId = submission.sessionId
    locallyCreatedSessionId = undefined
    notice = null
    machine = transition(machine, { type: "RESET" })
    thread = reconcileUserMessageId(thread, receipt.user_message_id, submission.optimisticUserId)
    // The ACK is already known before this GET. A later404 is actual owner absence,
    // not the initial-read-before-POST race handled by deferredCreateReceipt.
    hydrate(submission.sessionId, false, true)
  }

  function applyRecoveredReceipt(
    submission: PendingSubmission,
    receipt: MessageCreateReceipt,
    ownerAlreadySettled = false,
  ): void {
    if (pendingSubmission !== submission || store?.activeId !== submission.sessionId) {
      return
    }
    registerMessagePartsReceipt(submission.sessionId, receipt)
    ownerConfirmedSessionId = submission.sessionId
    if (!ownerAlreadySettled) taskNotifications.anchorReceipt(submission.sessionId, receipt, notificationAdmissions.get(submission) ?? -1)
    missingSessionId = undefined
    pendingSubmission = null
    recoveredSubmission = null
    recoveredSubmissionError = null
    deferredCreateReceipt = null
    if (ownerAlreadySettled && machine.runId === null) machine = transition(machine, { type: "RESET" })
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

  function retireDraftBeforePost(): boolean {
    if (!store || !activeIsLocalDraft(store)) return true
    let retired = false
    try { retired = deps.draftLifecycle?.retire(store.activeId) === true }
    catch { /* Storage failure must not dispatch a possibly untracked first POST. */ }
    if (!retired) {
      notice = { key: "chat.localDraftPersistenceFailed" }
      notify()
      return false
    }
    commitStore(retireLocalDraft(store, store.activeId))
    return true
  }

  // POST messages 并处理回执/失败（submit 与 retry 共用的开跑尾段）。
  function beginRun(args: PendingSubmission): void {
    missingSessionId = undefined
    const submission = {
      ...args,
      options: { ...args.options, selectedMcpConnectionIds: [...(args.options.selectedMcpConnectionIds ?? [])], selectedSkillSourceRefs: args.options.selectedSkillSourceRefs === undefined ? undefined : [...args.options.selectedSkillSourceRefs] },
    }
    pendingSubmission = submission
    recoveredSubmission = null
    recoveredSubmissionError = null
    deferredCreateReceipt = null
    const { sessionId, idempotencyKey } = submission
    taskNotifications.select(sessionId)
    notificationAdmissions.set(submission, taskNotifications.generation())
    notify()
    // A synchronous subscriber can retire this view before the transport starts.
    if (disposed || pendingSubmission !== submission || store?.activeId !== sessionId) return
    createInFlight.set(idempotencyKey, (createInFlight.get(idempotencyKey) ?? 0) + 1)
    execution
      .createMessage(submission)
      .then((receipt) => {
        persistReceipt(submission, receipt)
        const cancelledSessionId = cancelledSubmissions.get(idempotencyKey)
        if (cancelledSessionId === sessionId) {
          cancelledSubmissions.delete(idempotencyKey)
          cancelAcceptedSubmission(sessionId, receipt.run_id)
          return
        }
        // 回执落地前用户已重置/切换：丢弃迟到回执，不复活旧轮。
        const activeSubmission = pendingSubmission
        if (
          disposed || activeSubmission === null ||
          (activeSubmission !== submission && (!deps.submissionRecovery || !sameSubmission(activeSubmission, submission))) ||
          store?.activeId !== sessionId
        ) {
          return
        }
        ownerConfirmedSessionId = sessionId
        if (locallyCreatedSessionId === sessionId) locallyCreatedSessionId = undefined
        if (hydrating || recoveringExpiredCursor || connection.status !== "connected") {
          deferredCreateReceipt = { submission: activeSubmission, receipt }
          return
        }
        const ownerAlreadySettled = deps.submissionRecovery !== undefined && receiptAlreadySettled(activeSubmission, receipt)
        if (ownerAlreadySettled) {
          applyRecoveredReceipt(activeSubmission, receipt, true)
          notify()
          return
        }
        if (machine.phase !== "submitting") {
          if (recoveredSubmission === activeSubmission || deps.submissionRecovery !== undefined) {
            const needsStream = machine.runId === null
            if (deps.submissionRecovery && machine.phase === "error") machine = transition(machine, { type: "RESET" })
            applyRecoveredReceipt(activeSubmission, receipt)
            if (needsStream && machine.runId !== null) openStream(sessionId, thread.resumeCursor)
            notify()
          }
          return
        }
        registerMessagePartsReceipt(sessionId, receipt)
        pendingSubmission = null
        recoveredSubmission = null
        recoveredSubmissionError = null
        deferredCreateReceipt = null
        thread = reconcileUserMessageId(thread, receipt.user_message_id, submission.optimisticUserId)
        taskNotifications.anchorReceipt(sessionId, receipt, notificationAdmissions.get(submission) ?? -1)
        machine = transition(machine, { type: "RECEIPT", runId: receipt.run_id })
        openStream(sessionId, thread.resumeCursor)
        notify()
      })
      .catch((error: unknown) => {
        if (
          disposed ||
          pendingSubmission !== submission ||
          machine.phase !== "submitting" ||
          store?.activeId !== sessionId
        ) {
          return
        }
        // HTTP owner failures expose a reviewed public code. Preserve that
        // code for recovery UX (credit checks already rely on this), while
        // keeping unknown/network errors as their local diagnostic detail.
        const detail = error instanceof SessionClientError && error.code !== null
          ? error.code
          : describeUnknown(error)
        const recoveryCode = error instanceof SessionClientError && error.code !== null ? error.code : "submission_outcome_unknown"
        try { deps.submissionRecovery?.failure(submission, recoveryCode) } catch { /* The frozen intent remains unknown. */ }
        if (recoveringExpiredCursor || connection.status !== "connected") {
          recoveredSubmission = submission
          recoveredSubmissionError = detail
        }
        machine = transition(machine, { type: "FAIL", error: detail })
        notify()
      })
      .finally(() => {
        const remaining = (createInFlight.get(idempotencyKey) ?? 1) - 1
        if (remaining > 0) createInFlight.set(idempotencyKey, remaining)
        else { createInFlight.delete(idempotencyKey); cancelledSubmissions.delete(idempotencyKey) }
      })
  }

  function submit(content: string): boolean {
    const trimmed = content.trim()
    if (!trimmed || !canSubmitMessage()) {
      return false
    }
    notice = null
    if (!flushReceipts()) return false
    if (
      store !== null &&
      (machine.phase === "streaming" || machine.phase === "queued" || machine.phase === "resuming" ||
        machine.phase === "waiting")
    ) {
      if (!retireDraftBeforePost()) return false
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
      notificationAdmissions.set(submission, taskNotifications.generation())
      pendingSteerReceipts.set(receiptToken, submission)
      execution.createMessage(submission)
        .then((receipt) => {
          if (disposed || store?.activeId !== steerSessionId || hydrateGeneration !== steerGeneration) {
            return
          }
          registerMessagePartsReceipt(steerSessionId, receipt)
          taskNotifications.anchorReceipt(steerSessionId, receipt, notificationAdmissions.get(submission) ?? -1)
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
          if (pendingSteerReceipts.size === 0 && pendingSubmission === null) observedTerminalRuns.clear()
        })
      return true
    }
    if (deps.submissionRecovery) {
      if (!store) {
        store = addConversation(null, createId("conv"), now(), pendingMode, deps.draftLifecycle !== undefined)
        locallyCreatedSessionId = store.activeId
        commitStore(store)
      }
      const options = messageExecutionOptions(activeMode(store))
      if (preparedSubmission && (preparedSubmission.content !== trimmed || JSON.stringify(preparedSubmission.options) !== JSON.stringify(options))) {
        notice = { key: "chat.localDraftPersistenceFailed" }
        notify()
        return false
      }
      preparedSubmission ??= { sessionId: store.activeId, content: trimmed, idempotencyKey: createId("idem"), options, optimisticUserId: createId("usr") }
      let saved = false
      try { saved = deps.submissionRecovery.save(preparedSubmission) } catch { /* No POST on I/O failure. */ }
      if (!saved) {
        notice = { key: "chat.localDraftPersistenceFailed" }
        notify()
        return false
      }
    }
    if (!retireDraftBeforePost()) return false
    const before = machine
    machine = transition(machine, { type: "SUBMIT" })
    if (machine === before) {
      // 同步双发守卫：submitting 相位（回执未归）的提交直接拒绝。
      return false
    }
    if (!store) {
      store = addConversation(null, createId("conv"), now(), pendingMode)
      locallyCreatedSessionId = store.activeId
    }
    const optimisticUserId = preparedSubmission?.optimisticUserId ?? createId("usr")
    thread = appendUserMessage(thread, { id: optimisticUserId, content: trimmed })
    syncActiveEntry()
    // 模式意图上 wire：thinking 档=true，fast=false 显式关。
    beginRun(preparedSubmission ?? {
      sessionId: store.activeId,
      content: trimmed,
      idempotencyKey: createId("idem"),
      options: messageExecutionOptions(activeMode(store)),
      optimisticUserId,
    })
    preparedSubmission = null
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
    if (deps.submissionRecovery) {
      const inMemory = unsavedReceipts.get(pending.idempotencyKey)
      let knownReceipt: MessageCreateReceipt | null = inMemory && sameSubmission(inMemory.submission, pending) ? inMemory.receipt : null
      try { knownReceipt ??= deps.submissionRecovery.acknowledged(pending) }
      catch { notice = { key: "chat.submissionRecoveryFailed" }; notify(); return }
      if (knownReceipt) {
        if (!persistReceipt(pending, knownReceipt)) { notice = { key: "chat.submissionRecoveryFailed" }; notify(); return }
        reconcileKnownReceipt(pending, knownReceipt)
        return
      }
    }
    let saved = true
    try { saved = deps.submissionRecovery?.save(pending) ?? true } catch { saved = false }
    if (!saved) {
      notice = { key: "chat.submissionRecoveryFailed" }
      notify()
      return
    }
    if (!retireDraftBeforePost()) return
    notice = null
    const before = machine
    machine = transition(machine, { type: "SUBMIT" })
    if (machine === before) {
      return
    }
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
    const notificationGeneration = taskNotifications.generation()
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
          adoptOwnerSnapshot(intent.sessionId, owner, undefined, notificationGeneration)
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
  function activateConversation(next: ConversationStore, shouldHydrate = true, forceOwnerRead = false): void {
    notice = null
    const restoringDraft = !forceOwnerRead && canRestoreDraft(next)
    locallyCreatedSessionId = restoringDraft ? next.activeId : undefined
    missingSessionId = undefined
    taskNotifications.select(next.activeId)
    retireMessageParts()
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
    preparedSubmission = null
    recoveredSubmission = null
    recoveredSubmissionError = null
    deferredCreateReceipt = null
    if (previousSessionId !== next.activeId) {
      selectedSkillSourceRefs = scope.kind === "project" ? undefined : []
      selectedMcpConnectionIds = Object.freeze([])
    }
    thread = createSessionStreamState()
    observedTerminalRuns.clear()
    pendingSteerReceipts.clear()
    unprojectedAdmissions.clear()
    hydrating = shouldHydrate && !restoringDraft
    commitStore(next)
    const restoredSubmission = restoreSubmission(next.activeId)
    if (restoredSubmission) hydrating = true
    else if (restoredSubmission === null) hydrating = false
    notify()
    if (restoredSubmission !== null && shouldHydrate && (!restoringDraft || restoredSubmission)) {
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
    if (store?.activeId === id && (hydrating || pendingSubmission !== null || thread.messages.length > 0 || machine.runId !== null)) return
    if (store?.conversations.some(entry => entry.id === id && entry.localDraft === true)) {
      let retired = false
      try { retired = deps.draftLifecycle?.retire(id) === true } catch { /* Explicit owner reads remain available. */ }
      activateConversation(selectConversationOp(retired ? retireLocalDraft(store, id) : store, id), true, true)
      return
    }
    if (store && store.activeId === id) {
      if (missingSessionId === id && pendingSubmission === null) hydrate(id)
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
    if (submissionRecoveryUnavailable) { notice = { key: "chat.submissionRecoveryFailed" }; notify(); return }
    notice = null
    missingSessionId = undefined
    // Starting a fresh chat abandons a POST whose receipt has not arrived yet.
    // Preserve the idempotency key so a late receipt can cancel the server run.
    if (deps.submissionRecovery ? !abandonPendingSubmission() : !cancelPendingSubmission()) return
    abandonActiveRun()
    retireMessageParts()
    hydrateGeneration += 1
    const next = addConversation(store, createId("conv"), now(), store ? "fast" : pendingMode, deps.draftLifecycle !== undefined)
    locallyCreatedSessionId = next.activeId
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
    selectedSkillSourceRefs = scope.kind === "project" ? undefined : []
    selectedMcpConnectionIds = Object.freeze([])
    thread = createSessionStreamState()
    observedTerminalRuns.clear()
    pendingSteerReceipts.clear()
    unprojectedAdmissions.clear()
    hydrating = false
    taskNotifications.select(next.activeId)
    commitStore(next)
    notify()
    // 新会话本地新建、服务端必然不存在：不发无谓的 snapshot 请求。
  }

  function deleteConversation(id: string): Promise<boolean> {
    if (disposed || !store) {
      return Promise.resolve(false)
    }
    if (deleteIntent !== null) {
      return deleteIntent.targetId === id ? deleteIntent.promise : Promise.resolve(false)
    }
    const generation = ++deleteIntentGeneration
    const promise = execution.deleteSession(id)
      .then(() => {
        const intent = deleteIntent
        if (disposed || intent === null || intent.generation !== generation || intent.targetId !== id || !store) return false
        deleteIntent = null
        // BFF's committed delete owns durable Run cancellation. Only its strict
        // receipt authorizes the local projection switch.
        if (!store.conversations.some((entry) => entry.id === id)) return true
        const wasActive = store.activeId === id
        const next = removeConversation(store, id, createId("conv"), now())
        if (wasActive) {
          activateConversation(next)
        } else {
          // The user may have moved to another thread while DELETE was in
          // flight. Commit only the list projection; keep its draft/run state.
          commitStore(next)
          notify()
        }
        return true
      })
      .catch(() => false)
      .finally(() => {
        if (deleteIntent?.generation === generation && deleteIntent.targetId === id) deleteIntent = null
      })
    deleteIntent = { targetId: id, generation, promise }
    return promise
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
      if (!cancelPendingSubmission()) return
      machine = transition(machine, { type: "RESET" })
      notify()
      return
    }
    if (!store || !machine.runId) return
    const runId = machine.runId
    const sessionId = store.activeId
    const generation = hydrateGeneration
    if (machine.phase === "cancelling" && (machine.error === null || cancelIntent?.inFlight)) return
    if (!cancelIntent || cancelIntent.runId !== runId || cancelIntent.sessionId !== sessionId || cancelIntent.generation !== generation) {
      cancelIntent = { sessionId, runId, generation, commandId: createId("command"), inFlight: false }
    }
    const intent = cancelIntent
    const current = () => !disposed && cancelIntent === intent && store?.activeId === sessionId &&
      generation === hydrateGeneration && machine.runId === runId
    intent.inFlight = true
    retireRunMessageParts(runId)
    machine = { ...transition(machine, { type: "CANCEL" }), error: null }
    notify()
    const cursor = thread.resumeCursor
    execution.cancelRun({ sessionId, runId, commandId: intent.commandId }).catch((error: unknown) => {
      if (!current()) return
      machine = transition(machine, { type: "CONTROL_FAILED", error: describeUnknown(error) })
      notify()
    }).finally(() => {
      intent.inFlight = false
      if (!current()) return
      // One read, not a poller:202/lost ACK is only admission or uncertainty.
      // Only exact owner terminal data can settle this still-current run.
      const readThread = thread
      void execution.fetchSnapshot(sessionId).then((owner) => {
        if (!current() || thread !== readThread || thread.resumeCursor !== cursor || owner?.session.session_id !== sessionId) return
        if (owner.execution_head?.run_id === runId || !(owner.messages ?? []).some((message) =>
          message.role === "assistant" && message.run_id === runId && (message.status === "completed" || message.status === "failed"))) return
        cancelledPartsRuns.delete(runId)
        cancelIntent = null
        adoptOwnerSnapshot(sessionId, owner)
        notify()
      }).catch(() => { /* Keep the original intent/stream when the read is unavailable. */ })
    })
  }

  function setSelectedMcpConnectionIds(connectionIds: readonly string[]): void {
    if (disposed) return
    const next = selectedMcpConnectionIdsSchema.parse(connectionIds)
    if (next.length === selectedMcpConnectionIds.length && next.every((id, index) => id === selectedMcpConnectionIds[index])) return
    selectedMcpConnectionIds = Object.freeze(next)
    notify()
  }

  function setSelectedSkillSourceRefs(sourceRefs: readonly string[] | undefined): void {
    if (disposed) {
      return
    }
    selectedSkillSourceRefs = sourceRefs === undefined ? (scope.kind === "project" ? undefined : []) : [...sourceRefs]
  }

  function setModel(model: string | null): void {
    if (disposed) {
      return
    }
    selectedModel = model
  }

  function retireLocalCreationProvenance(): void {
    if (locallyCreatedSessionId === undefined) return
    locallyCreatedSessionId = undefined
    if (store && activeIsLocalDraft(store)) {
      let retired = false
      try { retired = deps.draftLifecycle?.retire(store.activeId) === true } catch { /* Owner/identity evidence still retires the live view. */ }
      if (retired) commitStore(retireLocalDraft(store, store.activeId))
    }
    notify()
  }

  function dispose(): void {
    selectedMcpConnectionIds = Object.freeze([])
    locallyCreatedSessionId = undefined
    taskNotifications.dispose()
    retireMessageParts()
    disposed = true
    deleteIntentGeneration += 1
    deleteIntent = null
    execution.abortDelete()
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
    locallyCreatedSessionId = undefined
    const myActive = store?.activeId ?? null
    if (
      external !== null &&
      myActive !== null &&
      external.conversations.some((entry) => entry.id === myActive)
    ) {
      // 本 tab 激活会话仍在：只吸收列表，保留本 tab 激活视图与在途线程，不重水合、不打断流。
      store = { ...external, activeId: myActive }
      if (canRestoreDraft(store) && thread.messages.length === 0 && pendingSubmission === null) locallyCreatedSessionId = myActive
      notify()
      return
    }
    // 本 tab 无激活或激活会话被别处删了：跟随外部激活并重水合（无激活则回空线程）。
    // 必须先收束在途 run（与 activateConversation 一致）：否则本 tab 正流式时被删，
    // machine 卡在旧 streaming 相位、runId 指向已删 run，hydrate 的 REATTACH 被守卫拒、不自愈。
    // 清空 storage 没有新的 session 可供 hydrate；递增代际使旧 snapshot 的 then/catch
    // 都失效，且必须同步结束 loading，否则旧请求永远悬挂在 hydrating=true。
    retireMessageParts()
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
    selectedSkillSourceRefs = scope.kind === "project" ? undefined : []
    selectedMcpConnectionIds = Object.freeze([])
    thread = createSessionStreamState()
    observedTerminalRuns.clear()
    pendingSteerReceipts.clear()
    unprojectedAdmissions.clear()
    store = external
    notice = null
    taskNotifications.select(external?.activeId ?? null)
    preparedSubmission = null
    const restoredExternalSubmission = external !== null && restoreSubmission(external.activeId)
    const restoringExternalDraft = !restoredExternalSubmission && canRestoreDraft(external)
    if (restoringExternalDraft) locallyCreatedSessionId = external?.activeId
    if (external?.activeId && restoredExternalSubmission !== null && !restoringExternalDraft) {
      hydrate(external.activeId)
    }
    notify()
  }
  unsubscribeStore = deps.storage.subscribe(onExternalStore)

  // 启动即水合：活跃会话从服务端 snapshot 恢复消息/在途 run/暂停点。
  if (store && restoredInitialSubmission !== null && (!restoringInitialDraft || restoredInitialSubmission)) {
    hydrate(store.activeId)
  }

  return {
    getSnapshot: () => snapshot,
    subscribeTaskNotifications: taskNotifications.subscribe,
    retireTaskNotifications: taskNotifications.retire,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    submit,
    retry,
    retryMessageParts,
    setMessagePartsReadTarget,
    retryResume,
    reconnect,
    cancelRun,
    stageToolDecision,
    selectConversation,
    openConversation,
    retireLocalCreationProvenance,
    newConversation,
    deleteConversation,
    reconcileConversationCache,
    setMode,
    setSelectedSkillSourceRefs,
    setSelectedMcpConnectionIds,
    setModel,
    dispose,
  }
}
