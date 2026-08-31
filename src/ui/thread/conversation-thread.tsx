import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
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
import { ArrowDown, ChevronRight } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { useEffect, useRef, useState } from "react"

import type { AgentMode } from "@/core/conversations"
import { buildThreadItems } from "@/core/projections"
import type { SessionDelivery, SessionStreamState, SessionToolCall } from "@/core/state"
import type { ToolDecision } from "@/engine/hitl-staging"
import { useT } from "@/i18n/context"
import type { MessageKey } from "@/i18n/messages"

import { AssistantTurn } from "./assistant-turn"
import { DeliverySection } from "./delivery-card"
import { MessageBubble } from "./message-bubble"
import styles from "./thread.module.css"

const NO_DECISIONS: Record<string, ToolDecision> = {}

export type ConversationThreadProps = {
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

// 失败讲人话：契约失败码 → 文案 key。闭集 7 码逐码本地化，未知码兜底通用句。i18n 在渲染处按码取译。
export function failureCopyKey(runError: { code: string; message: string } | null): MessageKey {
  switch (runError?.code) {
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
    default:
      return "fail.generic"
  }
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
  brandName,
  sessionId,
  onOpenFile,
  onOpenDelivery,
  onOpenTool,
  thread,
  isStreaming,
  isReconnecting,
  hasFailed,
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
  const errorCardRef = useRef<HTMLDivElement | null>(null)
  const [openErrorKey, setOpenErrorKey] = useState<string | null>(null)
  const failedRunId = [...thread.messages].reverse().find((message) => message.role === "assistant")?.runId ?? ""
  const errorKey = thread.runError
    ? `${failedRunId}\u0000${thread.runError.code}\u0000${thread.runError.message}`
    : null
  const errorDetailOpen = openErrorKey !== null && openErrorKey === errorKey
  // 把扁平 messages + 有序 steps 折成线程项：用户气泡 / assistant 轮（一个 runId 一轮）。
  const items = buildThreadItems(thread)

  // Expanding a long diagnostic changes the scroll height. On short mobile
  // viewports the primitive otherwise keeps the old bottom anchor, leaving
  // the title and disclosure trigger above the viewport while only the raw
  // stack trace remains visible. Re-anchor the error card itself so recovery
  // controls stay understandable and reachable after the expansion.
  const handleErrorDetailChange = (open: boolean) => {
    setOpenErrorKey(open ? errorKey : null)
    if (!open) return
    window.requestAnimationFrame(() => {
      errorCardRef.current?.scrollIntoView({ block: "start", behavior: "auto" })
    })
  }

  // The primitive keeps a spacer so long conversations can end-align. For a
  // settled, single short turn that spacer is larger than the actual content,
  // so default `end` alignment can hide the user's bubble above the viewport.
  // Re-anchor only that compact state to the start; long turns and active
  // streams retain the normal bottom-following behavior.
  useEffect(() => {
    if ((isStreaming && hitlRunId === null) || hasFailed || items.length !== 2) return
    const frame = window.requestAnimationFrame(() => {
      // Keep the compact-turn correction local to this thread. Shared/public
      // views can be mounted beside the workspace, and a document-wide query
      // would otherwise measure or scroll the first matching conversation.
      const root = threadRootRef.current
      const viewport = root?.querySelector<HTMLElement>('[data-slot="message-scroller-viewport"]')
      const messageItems = [...(root?.querySelectorAll<HTMLElement>('[data-slot="message-scroller-item"]') ?? [])]
        .filter((element) => element.dataset.messageId !== "deliveries")
      const lastMessage = messageItems.at(-1)
      if (!viewport || !lastMessage) return
      const viewportRect = viewport.getBoundingClientRect()
      const lastRect = lastMessage.getBoundingClientRect()
      // An inline approval is deliberately taller than a settled assistant
      // turn, but it still fits above the Composer on a desktop viewport.
      // Keep its initiating user message visible instead of bottom-anchoring
      // the whole short exchange and clipping that context above the header.
      const compactThreshold = hitlRunId !== null ? 0.9 : 0.65
      const compact = lastRect.height < viewport.clientHeight * compactThreshold
        && lastRect.bottom < viewportRect.top + viewport.clientHeight
      if (compact) scrollToStart({ behavior: "auto" })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [hasFailed, hitlRunId, isStreaming, items.length, scrollToStart])
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

  return (
    <MessageScroller
      ref={threadRootRef}
      className={styles.thread}
      data-state={isStreaming ? "streaming" : "settled"}
      data-desktop-web="true"
      data-error-detail={errorDetailOpen ? "open" : undefined}
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
              <AssistantTurn
                brandName={brandName}
                sessionId={sessionId}
                onOpenFile={onOpenFile}
                onOpenTool={
                  onOpenTool ? (tool) => onOpenTool(item.runId, tool) : undefined
                }
                steps={item.steps}
                messagesById={item.messagesById}
                isLive={item.runId === liveRunId}
                reconnecting={item.runId === liveRunId && isReconnecting}
                mode={mode}
                stagedDecisions={stagingByRun[item.runId] ?? NO_DECISIONS}
                hitlActive={item.runId === hitlRunId}
                controlError={item.runId === hitlRunId ? controlError : null}
                onToolDecision={
                  onToolDecision
                    ? (toolId, decision) => onToolDecision(item.runId, toolId, decision)
                    : undefined
                }
                onCancelRun={item.runId === hitlRunId ? onCancelRun : undefined}
                taskTitle={showTaskTitle && itemIndex > 0 && !items.slice(0, itemIndex).some((previous) => previous.kind === "assistant-turn")
                  ? items.slice(0, itemIndex).reverse().find((previous) => previous.kind === "user")?.message.content
                  : undefined}
              />
            )}
          </MessageScrollerItem>
        ))}

        {showScaffoldTurn ? (
          <MessageScrollerItem messageId="live-scaffold" scrollAnchor>
            <AssistantTurn
              brandName={brandName}
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
        {onOpenDelivery ? (
          <MessageScrollerItem messageId="deliveries">
            <DeliverySection
              sessionId={sessionId}
              deliveries={thread.deliveries}
              onOpen={onOpenDelivery}
            />
          </MessageScrollerItem>
        ) : null}

        {hasFailed && creditRejected ? (
          <MessageScrollerItem messageId="credit-error">
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
                </div>
              </AlertDescription>
            </Alert>
          </MessageScrollerItem>
        ) : hasFailed ? (
          <MessageScrollerItem messageId="run-error">
            <div ref={errorCardRef}>
            <Alert variant="destructive" className={styles.error}>
              <AlertTitle>{t(failureCopyKey(thread.runError))}</AlertTitle>
              <AlertDescription className={styles.errorLayout}>
                <div className={styles.errorBody}>
                  {/* internal_error 额外反馈指引：重试仍失败时引导用户把详情反馈给我们。 */}
                  {thread.runError?.code === "internal_error" ? (
                    <span className={styles.errorHint}>{t("fail.internalHint")}</span>
                  ) : null}
                  {/* message 原文折叠可展开（兜底展示，绝不裸露错误码）。 */}
                  {thread.runError?.message ? (
                    <Collapsible className={styles.errorDetail} onOpenChange={handleErrorDetailChange}>
                      <CollapsibleTrigger asChild>
                        <Button type="button" variant="link" className={styles.errorDetailTrigger}>
                          <ChevronRight data-icon="inline-start" aria-hidden="true" />
                          <span>{t("fail.showDetail")}</span>
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <pre>{thread.runError.message}</pre>
                      </CollapsibleContent>
                    </Collapsible>
                  ) : null}
                </div>
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
              </AlertDescription>
            </Alert>
            </div>
          </MessageScrollerItem>
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
