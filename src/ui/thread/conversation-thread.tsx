import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from "@/components/ui/message-scroller"
import { ArrowDown } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { useEffect, useRef } from "react"

import type { AgentFailureCode } from "@/contract/agent-failure"
import type { AgentMode } from "@/core/conversations"
import { buildThreadItems } from "@/core/projections"
import type { RunFailure, SessionDelivery, SessionStreamState, SessionToolCall } from "@/core/state"
import type { ToolDecision } from "@/engine/hitl-staging"
import { useT } from "@/i18n/context"
import type { MessageKey } from "@/i18n/messages"

import { AssistantTurn } from "./assistant-turn"
import { DeliverySection } from "./delivery-card"
import { MessageBubble } from "./message-bubble"
import styles from "./thread.module.css"

const NO_DECISIONS: Record<string, ToolDecision> = {}
const COMPACT_GEOMETRY_EPSILON = 0.5

function pixelValue(value: string): number | null {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function blockPadding(element: HTMLElement): number | null {
  const style = window.getComputedStyle(element)
  const start = pixelValue(style.paddingBlockStart || style.paddingTop)
  const end = pixelValue(style.paddingBlockEnd || style.paddingBottom)
  if (start === null || end === null || start < 0 || end < 0) return null
  return start + end
}

function actualContentSpan(items: readonly HTMLElement[]): number | null {
  let start = Number.POSITIVE_INFINITY
  let end = Number.NEGATIVE_INFINITY
  for (const item of items) {
    const itemRect = item.getBoundingClientRect()
    if (!Number.isFinite(itemRect.top) || !Number.isFinite(itemRect.bottom) || itemRect.bottom < itemRect.top) {
      return null
    }
    start = Math.min(start, itemRect.top)
    end = Math.max(end, itemRect.bottom)
  }
  const span = end - start
  return Number.isFinite(span) && span > 0 ? span : null
}

function spacerHeight(spacer: HTMLElement | null): number | null {
  if (!spacer) return 0
  const rectHeight = spacer.getBoundingClientRect().height
  const styleHeight = pixelValue(window.getComputedStyle(spacer).height)
  const heights = [rectHeight, styleHeight].filter((height): height is number => height !== null && Number.isFinite(height))
  return heights.length > 0 ? Math.max(...heights) : null
}

export type ConversationThreadProps = {
  preview?: boolean
  brandName?: string
  onOpenFile?: (path: string) => void
  // 成果卡点击 → canvas 打开冻结预览；工具 pill 点击 → canvas 打开参数/结果详情。
  onOpenDelivery?: (delivery: SessionDelivery) => void
  onOpenTool?: (runId: string, tool: SessionToolCall) => void
  // 产物端点 URL 构造需要（透传到工具行的产物卡）。
  sessionId: string | null
  thread: SessionStreamState
  isStreaming: boolean
  // 重连续传态：在途轮的 live 锚点改为「重连中…」，区别于普通「正在思考…」。
  isReconnecting: boolean
  hasFailed: boolean
  canRetryPendingSubmission: boolean
  // 402：run 被 credit_insufficient 拒——失败处改给计费专用说明 + 查看余额入口（不用通用失败文案）。
  creditRejected: boolean
  onOpenBilling: () => void
  // PAY-2：402 说明处的「查看套餐」入口——闭环 Wave3 留的价格入口，打开购买面板。
  onOpenPricing: () => void
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
    default: {
      const exhaustive: never = code
      return exhaustive
    }
  }
}

export function failureCopyKey(runError: RunFailure | null): MessageKey {
  return runError?.kind === "agent" ? agentFailureCopyKey(runError.profile.code) : "fail.generic"
}

export function ConversationThread(props: ConversationThreadProps) {
  return (
    <MessageScrollerProvider
      autoScroll
      defaultScrollPosition="end"
      scrollEdgeThreshold={64}
      // The workspace starts with a single short turn; do not reserve the
      // library's default previous-message peek or the first user bubble can
      // begin above the viewport while the composer is still empty.
      scrollPreviousItemPeek={0}
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
  onOpenDelivery,
  onOpenTool,
  thread,
  isStreaming,
  isReconnecting,
  hasFailed,
  canRetryPendingSubmission,
  creditRejected,
  onOpenBilling,
  onOpenPricing,
  onRetry,
  mode,
  stagingByRun,
  hitlRunId,
  controlError,
  onToolDecision,
  onCancelRun,
  showTaskTitle = true,
}: ConversationThreadProps) {
  const t = useT()
  const { scrollToStart } = useMessageScroller()
  const threadRootRef = useRef<HTMLDivElement | null>(null)
  // 把扁平 messages + 有序 steps 折成线程项：用户气泡 / assistant 轮（一个 runId 一轮）。
  const items = buildThreadItems(thread)

  // 流式中：最后一个 assistant 轮是当前在途的那一轮——唯一带「实时」语义的 turn。
  let liveRunId: string | undefined
  if (isStreaming) {
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const item = items[i]
      if (item?.kind === "assistant-turn") {
        liveRunId = item.runId
        break
      }
    }
  }

  // 提交后、首个 step/token 未到：在途轮还没产生任何可渲染项（最后一项仍是用户胶囊）。
  // 合成一个无内容的 live 脚手架轮，让 AssistantTurn 渲染「就近 live 成形线」，
  // 绝不在提交与首 token 之间留空帧。一旦首个 step/text 到达，buildThreadItems 即接管，脚手架退场。
  const showScaffoldTurn = isStreaming && items[items.length - 1]?.kind !== "assistant-turn"
  const hasRenderableDeliveries = Boolean(
    onOpenDelivery && sessionId !== null && (thread.deliveries.length > 0 || thread.deliveriesHasMore),
  )
  const terminalItem = items.at(-1)
  const terminalMessage = thread.messages.at(-1)
  const embedFailureFeedback = Boolean(
    hasFailed
      && !isStreaming
      && !isReconnecting
      && hitlRunId === null
      && !hasRenderableDeliveries
      && terminalItem?.kind === "assistant-turn"
      && terminalMessage?.role === "assistant"
      && terminalItem.runId === terminalMessage.runId
      && Object.values(terminalItem.messagesById).length > 0
      && Object.values(terminalItem.messagesById).every((message) => message.content === "")
      && terminalItem.steps.every((step) => step.kind === "text"),
  )
  const failureMessageId = creditRejected ? "credit-error" : "run-error"
  const failureFeedback = !hasFailed ? null : (
    <div data-message-id={embedFailureFeedback ? failureMessageId : undefined}>
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
      ) : (
        <Alert variant="destructive" className={styles.error}>
          <AlertTitle>{t(failureCopyKey(thread.runError))}</AlertTitle>
          <AlertDescription className={styles.errorLayout}>
            <div className={styles.errorBody}>
              {thread.runError?.kind === "agent" && thread.runError.profile.code === "internal_error" ? (
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
  const geometryItemIdentity = [
    ...items.map((item) => item.kind === "user" ? `user:${item.message.id}` : `run:${item.runId}`),
    hasRenderableDeliveries ? "deliveries" : "",
    failureFeedback && !embedFailureFeedback ? failureMessageId : "",
  ].join("\u0000")

  // The native scroller uses a spacer to end-align compact content. Clear that
  // artificial range only when every rendered item really fits. Active runs,
  // reconnects and approvals retain their own scroll
  // ownership; long settled content is never pushed to either edge here.
  useEffect(() => {
    if (isStreaming || isReconnecting || hitlRunId !== null) return
    const root = threadRootRef.current
    const viewport = root?.querySelector<HTMLElement>('[data-slot="message-scroller-viewport"]')
    const content = root?.querySelector<HTMLElement>('[data-slot="message-scroller-content"]')
    if (!viewport || !content) return
    const messageItems = [...content.querySelectorAll<HTMLElement>('[data-slot="message-scroller-item"]')]
    if (messageItems.length === 0) return

    let frame: number | null = null
    const alignCompactContent = () => {
      frame = null
      const viewportHeight = viewport.clientHeight
      const itemSpan = actualContentSpan(messageItems)
      const viewportPadding = blockPadding(viewport)
      const contentPadding = blockPadding(content)
      const currentSpacerHeight = spacerHeight(
        content.querySelector<HTMLElement>("[data-message-scroller-spacer]"),
      )
      const currentScrollTop = viewport.scrollTop
      if (
        !Number.isFinite(viewportHeight)
        || viewportHeight <= 0
        || itemSpan === null
        || viewportPadding === null
        || contentPadding === null
        || currentSpacerHeight === null
        || !Number.isFinite(currentScrollTop)
      ) return
      const occupiedHeight = itemSpan + viewportPadding + contentPadding
      if (occupiedHeight > viewportHeight + COMPACT_GEOMETRY_EPSILON) return
      if (
        currentSpacerHeight <= COMPACT_GEOMETRY_EPSILON
        && currentScrollTop <= COMPACT_GEOMETRY_EPSILON
      ) return
      scrollToStart({ behavior: "auto" })
    }
    const scheduleAlignment = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(alignCompactContent)
    }
    const observer = new ResizeObserver(scheduleAlignment)
    observer.observe(viewport)
    observer.observe(content)
    messageItems.forEach((item) => observer.observe(item))
    scheduleAlignment()
    return () => {
      observer.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [geometryItemIdentity, hitlRunId, isReconnecting, isStreaming, scrollToStart])

  return (
    <MessageScroller
      ref={threadRootRef}
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
            key={item.kind === "user" ? item.message.id : item.runId}
            messageId={item.kind === "user" ? item.message.id : item.runId}
            scrollAnchor={item.kind === "assistant-turn" && item.runId === liveRunId}
          >
            {item.kind === "user" ? (
              <MessageBubble message={item.message} />
            ) : (
              <>
                <AssistantTurn
                  {...(brandName === undefined ? {} : { brandName })}
                  sessionId={sessionId}
                  {...(onOpenFile === undefined ? {} : { onOpenFile })}
                  {...(onOpenTool === undefined ? {} : { onOpenTool: (tool: SessionToolCall) => onOpenTool(item.runId, tool) })}
                  steps={item.steps}
                  messagesById={item.messagesById}
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
                />
                {embedFailureFeedback && itemIndex === items.length - 1 ? failureFeedback : null}
              </>
            )}
          </MessageScrollerItem>
        ))}

        {showScaffoldTurn ? (
          <MessageScrollerItem messageId="live-scaffold" scrollAnchor>
            <AssistantTurn
              {...(brandName === undefined ? {} : { brandName })}
              sessionId={sessionId}
              steps={[]}
              messagesById={{}}
              isLive
              reconnecting={isReconnecting}
              mode={mode}
              stagedDecisions={NO_DECISIONS}
              hitlActive={false}
              controlError={null}
            />
          </MessageScrollerItem>
        ) : null}

        {/* 成果区：会话流尾部聚合本会话全部成果（终态一目了然，不用翻消息流）。 */}
        {onOpenDelivery && sessionId !== null && (thread.deliveries.length > 0 || thread.deliveriesHasMore) ? (
          <MessageScrollerItem messageId="deliveries">
            <DeliverySection
              sessionId={sessionId}
              deliveries={thread.deliveries}
              hasMore={thread.deliveriesHasMore}
              preview={preview}
              onOpen={onOpenDelivery}
            />
          </MessageScrollerItem>
        ) : null}

        {failureFeedback && !embedFailureFeedback ? (
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
