import { finalAnswerPartsComplete } from "./completed-turn-sections"
import type { AnswerActionBoundary } from "./answer-action-scope"
import { answerActionTarget } from "./answer-action-target"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { ArrowDown } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"

import type { AgentFailureCode } from "@/contract/agent-failure"
import type { AgentMode } from "@/core/conversations"
import { buildThreadItems } from "@/core/projections"
import type { AttributedRunFailure, RunFailure, SessionDelivery, SessionStreamState } from "@/core/state"
import type { MachinePhase } from "@/engine/machine-state"
import type { ToolDecision } from "@/engine/hitl-staging"
import { useT } from "@/i18n/context"
import type { MessageKey } from "@/i18n/messages"

import { ExecutionUnavailableFeedback, UnconfirmedSubmissionFeedback } from "./execution-unavailable-feedback"
import { AssistantTurn } from "./assistant-turn"
import { DeliverySection } from "./delivery-card"
import { MessageBubble } from "./message-bubble"
import styles from "./thread.module.css"

const NO_DECISIONS: Record<string, ToolDecision> = {}

export type ConversationThreadProps = {
  answerActionBoundary?: AnswerActionBoundary
  preview?: boolean
  brandName?: string
  onOpenActivity?: (runId: string, activityId: string) => void
  onOpenFile?: (path: string) => void
  // 成果卡点击 → canvas 打开冻结预览。
  onOpenDelivery?: (delivery: SessionDelivery) => void
  // 产物端点 URL 构造需要（透传到工具行的产物卡）。
  sessionId: string | null
  thread: SessionStreamState
  isStreaming: boolean
  // Engine machine runId is the live authority after receipt; snapshot activeRunId is its reload fallback.
  executionPhase?: MachinePhase
  currentRunId?: string | null
  // 重连续传态：在途轮的 live 锚点改为「重连中…」，区别于普通「正在思考…」。
  isReconnecting: boolean
  hasFailed: boolean
  // Public BFF code for a failed message admission before a Run exists.
  submissionFailureCode?: string | null
  canRetryResume?: boolean
  onRetryResume?: () => void
  canRetryPendingSubmission: boolean
  // 402：run 被 credit_insufficient 拒——失败处改给计费专用说明 + 查看余额入口（不用通用失败文案）。
  creditRejected: boolean
  onOpenBilling: () => void
  // PAY-2：402 说明处的「查看套餐」入口——闭环 Wave3 留的价格入口，打开购买面板。
  onOpenPricing: () => void
  onRetryMessageParts?: (messageId: string) => void
  onRetry: () => void
  // 本会话模式：透传给每轮过程块，驱动 Fast/Thinking 的密度与文案差异。
  mode: AgentMode
  // HITL：引擎快照的决策暂存视图（runId → toolId → decision）与本轮 awaiting 相位信息。
  stagingByRun: Record<string, Record<string, ToolDecision>>
  hitlRunId: string | null
  controlError: string | null
  onToolDecision?: (runId: string, toolId: string, decision: ToolDecision) => void
  // ask_user 问答卡的取消 run 入口（透传到工具行）。
  onCancelRun?: () => void
  // Project adapters may show the originating prompt as a task stage. Read-only
  // shared threads already render the user bubble and must not duplicate it.
  showTaskTitle?: boolean
}

function agentFailureCopyKey(code: AgentFailureCode): MessageKey {
  switch (code) {
    case "token_budget_exceeded":
      return "fail.tokenBudget"
    case "recursion_limit_exceeded":
      return "fail.recursion"
    case "assembly_failed":
      return "fail.assembly"
    case "enqueue_failed":
      return "fail.enqueue"
    case "dispatch_exhausted":
      return "fail.dispatch"
    case "contract_incompatible":
      return "fail.contract"
    case "internal_error":
      return "fail.internal"
    case "model_unavailable":
      return "fail.modelUnavailable"
    case "dependency_unavailable":
      return "fail.dependencyUnavailable"
    case "model_access_denied":
      return "fail.modelAccessDenied"
    case "model_settlement_pending":
      return "fail.modelSettlementPending"
    default: {
      const exhaustive: never = code
      return exhaustive
    }
  }
}

export function failureCopyKey(runError: RunFailure | null, submissionFailureCode?: string | null): MessageKey {
  if (runError?.kind === "agent") return agentFailureCopyKey(runError.profile.code)
  // This code is part of the BFF's public mutation error contract. It means a
  // retry cannot make the local Agent dependency available on its own.
  if (submissionFailureCode === "agent_not_configured") return "fail.agentNotConfigured"
  return "fail.generic"
}

function TerminalFailureFeedback({ failure }: { failure: AttributedRunFailure }) {
  const t = useT()
  return (
    <div className={styles.runFailureFooter} data-run-failure={failure.failedRunId}>
      <Alert variant="destructive" className={styles.error}>
        <AlertTitle>{t(failureCopyKey(failure))}</AlertTitle>
        {failure.kind === "agent" && failure.profile.code === "internal_error" ? (
          <AlertDescription className={styles.errorBody}>
            <span className={styles.errorHint}>{t("fail.internalHint")}</span>
          </AlertDescription>
        ) : null}
      </Alert>
    </div>
  )
}

export function ConversationThread(props: ConversationThreadProps) {
  return (
    <MessageScrollerProvider
      // Follow the actual message list, not the assistant placeholder. Anchoring
      // that placeholder creates a viewport-sized spacer and hides the prompt.
      autoScroll
      defaultScrollPosition="end"
      scrollEdgeThreshold={64}
    >
      <ConversationThreadSurface {...props} />
    </MessageScrollerProvider>
  )
}

function ConversationThreadSurface({
  preview = false,
  brandName,
  sessionId,
  onOpenFile,
  onOpenActivity,
  onOpenDelivery,
  thread,
  isStreaming,
  currentRunId,
  executionPhase,
  isReconnecting,
  hasFailed,
  submissionFailureCode,
  canRetryResume = false,
  onRetryResume,
  canRetryPendingSubmission,
  creditRejected,
  onOpenBilling,
  onOpenPricing,
  onRetry,
  onRetryMessageParts,
  mode,
  stagingByRun,
  hitlRunId,
  controlError,
  onToolDecision,
  onCancelRun,
  answerActionBoundary,
  showTaskTitle = true,
}: ConversationThreadProps) {
  const t = useT()
  // 把扁平 messages + 有序 steps 折成线程项；同 Run 可有多个 assistant 轮。
  const liveRunId = isStreaming ? currentRunId ?? thread.activeRunId ?? undefined : undefined
  const items = buildThreadItems(thread)
  // Once the owner Run is known, the forming surface and its first public text
  // share one keyed turn; a text delta never remounts the disclosure/HITL host.
  if (liveRunId !== undefined && !items.some((item) => item.kind === "assistant-turn" && item.runId === liveRunId)) {
    items.push({ kind: "assistant-turn", anchorId: `assistant:${liveRunId}:turn:0`, runId: liveRunId, steps: [], messagesById: {} })
  }

  // Delivery owns a Run, not an inferred message. Render it once after that
  // Run's last existing turn; later read-only Runs must not move earlier cards.
  const lastTurnByRun = new Map<string, number>()
  for (const [index, item] of items.entries()) {
    if (item.kind === "assistant-turn") lastTurnByRun.set(item.runId, index)
  }
  const deliveriesByRun = new Map<string, SessionDelivery[]>()
  let hasUnplacedDeliveries = false
  for (const delivery of thread.deliveries) {
    if (sessionId === null || delivery.conversationId !== sessionId) continue
    if (!lastTurnByRun.has(delivery.runId)) {
      hasUnplacedDeliveries = true
      continue
    }
    const deliveries = deliveriesByRun.get(delivery.runId) ?? []
    deliveries.push(delivery)
    deliveriesByRun.set(delivery.runId, deliveries)
  }

  // 提交后、首个 step/token 未到：在途轮还没产生任何可渲染项（最后一项仍是用户胶囊）。
  // 合成一个无内容的 live 脚手架轮，让 AssistantTurn 渲染「就近 live 成形线」，
  // 绝不在提交与首 token 之间留空帧。一旦首个 step/text 到达，buildThreadItems 即接管，脚手架退场。
  const showScaffoldTurn = isStreaming && (
    liveRunId === undefined || !items.some((item) => item.kind === "assistant-turn" && item.runId === liveRunId)
  )
  const failureMessageId = creditRejected ? "credit-error" : "run-error"
  const failureFeedback = !hasFailed ? null : (
    <div>
      {creditRejected ? (
        <Alert variant="destructive" className={styles.error}>
          <AlertTitle>{t("billing.creditRejected")}</AlertTitle>
          <AlertDescription className={styles.errorLayout}>
            <div className={styles.errorBody}>
              <span>{t("billing.creditPricing")}</span>
            </div>
            <div className={styles.errorActions}>
              <Button variant="outline" className={styles.retry} type="button" onClick={onOpenPricing}>
                {t("billing.viewPricing")}
              </Button>
              <Button variant="outline" className={styles.retry} type="button" onClick={onOpenBilling}>
                {t("billing.viewBalance")}
              </Button>
              {canRetryPendingSubmission ? (
                <Button
                  variant="outline"
                  className={styles.retry}
                  type="button"
                  disabled={isStreaming}
                  aria-busy={isStreaming}
                  onClick={onRetry}
                >
                  {isStreaming ? <Spinner aria-hidden="true" /> : null}
                  {t("thread.retry")}
                </Button>
              ) : null}
            </div>
          </AlertDescription>
        </Alert>
      ) : thread.unattributedFailure === null && submissionFailureCode === "agent_not_configured" ? (
        <ExecutionUnavailableFeedback canRetry={canRetryPendingSubmission} retrying={isStreaming} onRetry={onRetry} />
      ) : thread.unattributedFailure === null && submissionFailureCode === "submission_outcome_unknown" ? (
        <UnconfirmedSubmissionFeedback canRetry={canRetryPendingSubmission} retrying={isStreaming} onRetry={onRetry} />
      ) : (
        <Alert variant="destructive" className={styles.error}>
          <AlertTitle>{t(failureCopyKey(thread.unattributedFailure, submissionFailureCode))}</AlertTitle>
          <AlertDescription className={styles.errorLayout}>
            <div className={styles.errorBody}>
              {thread.unattributedFailure?.kind === "agent" && thread.unattributedFailure.profile.code === "internal_error" ? (
                <span className={styles.errorHint}>{t("fail.internalHint")}</span>
              ) : null}
            </div>
            {canRetryPendingSubmission ? (
              <Button
                variant="outline"
                className={styles.retry}
                type="button"
                disabled={isStreaming}
                aria-busy={isStreaming}
                onClick={onRetry}
              >
                {isStreaming ? <Spinner aria-hidden="true" /> : null}
                {t("thread.retry")}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
  return (
    <MessageScroller
      className={styles.thread}
      data-state={isStreaming ? "streaming" : "settled"}
      data-desktop-web="true"
    >
      <MessageScrollerViewport
        className={styles.viewport}
        aria-label={t("thread.recordAria")}
      >
      <MessageScrollerContent data-conversation-thread-inner="true" className={styles.inner} aria-live="polite" aria-relevant="additions text">
        {items.map((item, itemIndex) => (
          <MessageScrollerItem
            key={item.kind === "user" ? item.message.id : item.anchorId}
            messageId={item.kind === "user" ? item.message.id : item.anchorId}
          >
            {item.kind === "user" ? (
              <MessageBubble message={item.message} />
            ) : (
              <>
                <AssistantTurn
                  runId={item.runId}
                  terminal={thread.runTerminalsById?.[item.runId] !== undefined}
                  succeeded={thread.runTerminalsById?.[item.runId] === "completed"}
                  {...(thread.finalAnswersByRun?.[item.runId]?.segmentId ? { finalSegmentId: thread.finalAnswersByRun[item.runId]!.segmentId! } : {})}
                  finalPartsComplete={finalAnswerPartsComplete(thread.finalAnswersByRun?.[item.runId], thread.messageParts, item.runId)}
                  {...(answerActionBoundary === undefined ? {} : { answerActionBoundary, answerActionTarget: answerActionTarget(thread, { actorId: answerActionBoundary.actorId, sessionId: answerActionBoundary.sessionId, scope: answerActionBoundary.scope, runId: item.runId }) })}
                  {...(brandName === undefined ? {} : { brandName })}
                  sessionId={sessionId}
                  {...(onOpenActivity ? { onOpenActivity: (activityId: string) => onOpenActivity(item.runId, activityId) } : {})}
                  {...(onOpenFile === undefined ? {} : { onOpenFile })}
                  activities={thread.executionProcess?.runId === item.runId ? thread.executionProcess.activities : []}
                  {...(thread.interactionsByRun[item.runId] === undefined ? {} : { interaction: thread.interactionsByRun[item.runId] })}
                  parts={Object.values(thread.messageParts ?? {}).filter((part) => part.runId === item.runId)}
                  {...(onRetryMessageParts === undefined ? {} : { onRetryMessageParts })}
                  cancelled={item.cancelled === true}
                  steps={item.steps}
                  messagesById={item.messagesById}
                  {...(item.runId === liveRunId && executionPhase ? { executionPhase } : {})}
                  isLive={item.runId === liveRunId}
                  reconnecting={item.runId === liveRunId && isReconnecting}
                  mode={mode}
                  stagedDecisions={stagingByRun[item.runId] ?? NO_DECISIONS}
                  hitlActive={item.runId === hitlRunId}
                  controlError={item.runId === hitlRunId ? controlError : null}
                  {...(onToolDecision === undefined ? {} : { onToolDecision: (toolId: string, decision: ToolDecision) => onToolDecision(item.runId, toolId, decision) })}
                  {...(onCancelRun === undefined || item.runId !== hitlRunId ? {} : { onCancelRun })}
                  taskTitle={showTaskTitle && itemIndex > 0 && !items.slice(0, itemIndex).some((previous) => previous.kind === "assistant-turn")
                    ? items.slice(0, itemIndex).reverse().find((previous) => previous.kind === "user")?.message.content ?? ""
                    : ""}
                  {...(item.failure === undefined
                    ? {}
                    : { failureFooter: <TerminalFailureFeedback failure={item.failure} /> })}
                />
                {onOpenDelivery && sessionId !== null && lastTurnByRun.get(item.runId) === itemIndex && deliveriesByRun.has(item.runId) ? (
                  <DeliverySection
                    sessionId={sessionId}
                  {...(onOpenActivity ? { onOpenActivity: (activityId: string) => onOpenActivity(item.runId, activityId) } : {})}
                    deliveries={deliveriesByRun.get(item.runId)!}
                    preview={preview}
                    onOpen={onOpenDelivery}
                  />
                ) : null}
              </>
            )}
          </MessageScrollerItem>
        ))}

        {showScaffoldTurn ? (
          <MessageScrollerItem
            messageId={liveRunId === undefined ? "assistant:pending-submission:live" : `assistant:${liveRunId}:live`}
          >
            <AssistantTurn
              {...(brandName === undefined ? {} : { brandName })}
              sessionId={sessionId}
              steps={[]}
              messagesById={{}}
              activities={liveRunId !== undefined && thread.executionProcess?.runId === liveRunId ? thread.executionProcess.activities : []}
              isLive
              {...(executionPhase ? { executionPhase } : {})}
              reconnecting={isReconnecting}
              mode={mode}
              stagedDecisions={NO_DECISIONS}
              hitlActive={false}
              controlError={null}
            />
          </MessageScrollerItem>
        ) : null}

        {executionPhase === "cancelling" && controlError !== null && onCancelRun ? <MessageScrollerItem messageId="cancel-retry">
          <p role="status">{t("thread.cancelUnknown")}</p>
          <Button type="button" variant="outline" onClick={onCancelRun}>{t("thread.retryCancel")}</Button>
        </MessageScrollerItem> : null}
        {canRetryResume && onRetryResume ? <MessageScrollerItem messageId="resume-retry">
          <Button type="button" variant="outline" onClick={onRetryResume}>{t("hitl.retryResume")}</Button>
        </MessageScrollerItem> : null}
        {/* Only the conversation-level Library entry remains at the tail.
            Missing owner turns never attach a historical card to a new Run. */}
        {onOpenDelivery && sessionId !== null && (hasUnplacedDeliveries || thread.deliveriesHasMore) ? (
          <MessageScrollerItem messageId="deliveries">
            <DeliverySection
              sessionId={sessionId}
              deliveries={[]}
              hasMore
              preview={preview}
              onOpen={onOpenDelivery}
            />
          </MessageScrollerItem>
        ) : null}

        {failureFeedback ? (
          <MessageScrollerItem messageId={failureMessageId}>{failureFeedback}</MessageScrollerItem>
        ) : null}

      </MessageScrollerContent>
      </MessageScrollerViewport>
      <MessageScrollerButton direction="end" variant="outline" size="sm" className={styles.jump}>
        <ArrowDown data-icon="inline-start" aria-hidden="true" />
        <span>{t("shell.backToLatest")}</span>
      </MessageScrollerButton>
    </MessageScroller>
  )
}
