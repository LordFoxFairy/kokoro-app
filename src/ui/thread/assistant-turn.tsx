import { useRunDisplay } from "./use-run-display"
import { overlayRunDisplay } from "./run-display-overlay"
import type { AnswerActionBoundary } from "./answer-action-scope"
import type { AnswerActionTarget } from "./answer-action-target"
import { OwnerAnswerActions } from "./owner-answer-actions"
import type { InteractionState } from "@/contract/control"
import { ApprovalCard } from "@/ui/hitl/approval-card"
import { AskUserCard } from "@/ui/hitl/ask-user-card"
import { ReviewCard } from "@/ui/hitl/review-card"
import { InputCard } from "@/ui/hitl/input-card"
import type { AgentMode } from "@/core/conversations"
import { DEFAULT_BRAND } from "@/config/brand"
import { groupSegments } from "@/core/projections"
import type { MessagePartsState, SessionMessage, SessionStep } from "@/core/state"
import type { RunProcessActivity } from "@/contract/chat"
import type { MachinePhase } from "@/engine/machine-state"
import type { ToolDecision } from "@/engine/hitl-staging"
import { useT } from "@/i18n/context"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { CheckCircle2 } from "lucide-react"
import { useEffect, useRef } from "react"
import type { ReactNode } from "react"

import { MarkdownMessage } from "./markdown-message"
import { SegmentProcess } from "./segment-process"
import { AnswerActions } from "./answer-actions"
import styles from "./thread.module.css"

type AssistantTurnProps = {
  answerActionBoundary?: AnswerActionBoundary
  runId?: string
  terminal?: boolean
  answerActionTarget?: AnswerActionTarget | null
  parts?: readonly MessagePartsState[]
  onRetryMessageParts?: (messageId: string) => void
  interaction?: InteractionState
  executionPhase?: MachinePhase
  brandName?: string
  onOpenActivity?: (activityId: string) => void
  onOpenFile?: (path: string) => void
  sessionId: string | null
  // 这一轮（一个 runId）按 seq 排好的有序步骤：思考/工具/子智能体/文本交错。
  steps: SessionStep[]
  // 文本步骤按 segmentId 取这一段正文；过程先到、正文未到时该段可能暂缺。
  messagesById: Record<string, SessionMessage>
  activities?: readonly RunProcessActivity[]
  // 这一轮是否仍在流式：驱动「正在出字」光标、过程默认展开。
  isLive: boolean
  // 重连续传态：在途轮的 live 锚点改为「重连中…」，区别于普通「正在思考…」。
  reconnecting?: boolean
  // 本会话模式：透传给过程块作密度 / 文案差异钩子。
  mode?: AgentMode
  // HITL：本轮的决策暂存视图与 control 失败信息（引擎快照），透传到工具行。
  stagedDecisions: Record<string, ToolDecision>
  hitlActive: boolean
  controlError: string | null
  onToolDecision?: (toolId: string, decision: ToolDecision) => void
  // ask_user 问答卡的取消 run 入口（透传到工具行）。
  onCancelRun?: () => void
  taskTitle?: string
  failureFooter?: ReactNode
  cancelled?: boolean
}

// 成形态内容：就近的「正在…」线索 + 脉冲点，占位与正文同一 answer 元素，
// 故首 token 到达是行内内容替换、不跳换。重连续传时换「重连中…」，data-anchor 驱动差异样式。
function FormingContent({
  label,
  reconnecting,
  waitingForDecision,
}: {
  label: string
  reconnecting: boolean
  waitingForDecision: boolean
}) {
  const t = useT()
  return (
    <span className={styles.forming} role="status">
      <span className={styles.formingLabel}>{reconnecting ? t("thread.reconnecting") : label}</span>
      {!waitingForDecision ? (
        <span className={styles.pulse} aria-hidden>
          <span />
          <span />
          <span />
        </span>
      ) : null}
    </span>
  )
}

// 助手一轮 = 一条无头像的竖脊（扁平文档观感）。脊上按段堆叠，每段：
//   正文在【上】＋ 它的过程挂在【下面】（思考/该段工具/子智能体，收成更轻的可折叠次级块）。
// 只有整轮的尾段在流式时带就近光标（唯一 live 锚点）。
export function AssistantTurn({
  interaction,
  onOpenActivity,
  parts = [],
  onRetryMessageParts,
  executionPhase,
  brandName = DEFAULT_BRAND.name,
  steps,
  messagesById,
  activities = [],
  isLive,
  reconnecting = false,
  mode,
  stagedDecisions,
  hitlActive,
  controlError,
  onToolDecision,
  onCancelRun,
  taskTitle,
  failureFooter,
  answerActionBoundary,
  answerActionTarget,
  runId,
  terminal = false,
  cancelled = false,
}: AssistantTurnProps) {
  const t = useT()
  const hadInteraction = useRef(Boolean(interaction?.groups.length))
  useEffect(() => {
    const hasInteraction = Boolean(interaction?.groups.length)
    const consumed = hadInteraction.current && !hasInteraction
    hadInteraction.current = hasInteraction
    if (!consumed) return
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('[data-settings-return-target="composer"]:not([disabled])')?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [interaction])
  const displayRunId = runId ?? answerActionTarget?.runId
  const display = useRunDisplay(answerActionBoundary, displayRunId, terminal)
  const displayedActivities = overlayRunDisplay(activities, display.facts)
  const displayedSteps = steps.map(step => step.kind === "activity" ? { ...step, activity: overlayRunDisplay([step.activity], display.facts)[0]! } : step)
  const segments = groupSegments(displayedSteps, displayedActivities, messagesById)
  const hasTurnProcess = segments.some((segment) => segment.activities.length > 0)
  // Public7 process activities have opaque safe segment identities that are
  // independent from message identities. Keep the newest process live, but
  // anchor answer streaming to the last segment that actually owns a message.
  let answerTailId: string | undefined
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index]
    if (segment && messagesById[segment.segmentId] !== undefined) {
      answerTailId = segment.segmentId
      break
    }
  }
  const tailMessage = answerTailId ? messagesById[answerTailId] : undefined
  const tailHasText = Boolean(tailMessage) && (tailMessage?.content.length ?? 0) > 0
  // An empty answer segment is not a second progress surface. Until text
  // arrives, keep the last real process disclosure as the live affordance.
  const processTailId = (!tailHasText ? segments.findLast((segment) => segment.activities.length > 0)?.segmentId : undefined) ?? segments.at(-1)?.segmentId
  const phaseLabel = executionPhase === "queued" ? t("hitl.queued") : executionPhase === "resuming" ? t("hitl.resuming") : executionPhase === "cancelling" ? t("hitl.cancelling") : null
  const formingLabel = phaseLabel ?? (hitlActive
    ? t("hitl.approvalTitle")
    : mode === "fast"
      ? t("thread.formingAnswer")
      : t("thread.formingThinking"))
  // 提交后首个 step/token 未到：这一轮还没有任何 segment，但仍在途——给一个成形脚手架
  // （单条「正在…」），绝不让在途轮塌成空帧。落定/非流式则不渲染脚手架。
  const showScaffold = isLive && segments.length === 0 && !interaction?.groups.length
  // Process-only turns have no answer placeholder either; retain the distinct
  // connection status here. Only the no-process/no-text path uses forming.
  const showReconnectStrip = reconnecting && (tailHasText || hasTurnProcess || (phaseLabel !== null && !showScaffold))
  const answerText = segments
    .map((segment) => messagesById[segment.segmentId]?.content ?? "")
    .filter(Boolean)
    .join("\n\n")


  // 流式内容位于 conversation 的 polite live region 内。保持增量播报，
  // atomic=true 会在每个 token 到达时重复朗读整轮长答案。
  return (
    <article className={styles.turn} aria-atomic={isLive ? false : undefined}>
      <div className={styles.turnSpine}>
        {taskTitle ? (
          <div className={styles.taskStage} data-slot="task-stage" aria-hidden="true">
            <CheckCircle2 />
            <span>{taskTitle}</span>
          </div>
        ) : null}
        <div className={styles.assistantIdentity} data-slot="assistant-identity" aria-hidden="true">
          <span className={styles.assistantIdentityMark} data-slot="assistant-identity-mark">K</span>
          <span>{t("firstSite.kokoro", { brand: brandName })}</span>
        </div>
        {showReconnectStrip ? (
          <div className={styles.turnReconnect} data-anchor="reconnecting" role="status">
            {t("thread.reconnecting")}
            {/* 脉冲三点：与无正文路径的成形盒动态线索一致，让「正在重连」可读。 */}
            <span className={styles.pulse} aria-hidden>
              <span />
              <span />
              <span />
            </span>
          </div>
        ) : null}
        {parts.filter((part) => part.status !== "complete").map((part) => (
          <div key={part.messageId} role="status" data-message-parts={part.status} className={part.status === "loading" || part.status === "unread" ? "sr-only" : segments.some((segment) => {
            const message = messagesById[segment.segmentId]
            return message?.role === "assistant" && message.runId === part.runId && (message.snapshotMessageId ?? message.id) === part.messageId && message.content.trim().length > 0
          }) ? styles.partsSupplement : undefined}>
            <span>{t(part.status === "loading" || part.status === "unread" ? "thread.partsReading" : "thread.partsPartial")}</span>
            {part.status !== "loading" && part.status !== "unread" && onRetryMessageParts ? <Button type="button" variant="ghost" onClick={() => onRetryMessageParts(part.messageId)}>{t("thread.partsReload")}</Button> : null}
          </div>
        ))}
        {phaseLabel && !showScaffold ? <p role="status">{phaseLabel}</p> : null}
        {showScaffold ? (
          <div className={styles.turnSegment}>
            <div
              className={cn(styles.bubble, styles.turnAnswer)}
              data-state="forming"
              data-anchor={reconnecting ? "reconnecting" : undefined}
            >
            <FormingContent
              label={formingLabel}
              reconnecting={reconnecting}
              waitingForDecision={hitlActive}
            />
            </div>
          </div>
        ) : null}
        {segments.map((segment) => {
          const message = messagesById[segment.segmentId]
          const hasText = Boolean(message) && (message?.content.length ?? 0) > 0
          const liveAnswerSegment = isLive && segment.segmentId === answerTailId
          const liveProcessSegment = isLive && segment.segmentId === processTailId
          const showCaret = liveAnswerSegment && hasText
          const hasProcess = segment.activities.length > 0
          // A real process or explicit phase already owns progress. Completed
          // tools waiting for an answer do not need a second wait line either.
          const forming = isLive && !tailHasText && liveProcessSegment && !hasText && !hasTurnProcess && phaseLabel === null
          // 既无气泡又无过程的空段不渲染：避免落定空正文段留一个占位 segment（多段时多撑一个 gap 槽）。
          if (!hasText && !forming && !hasProcess) {
            return null
          }
          return (
            <div className={styles.turnSegment} key={segment.segmentId}>
              {/* 段内贯穿 forming→streaming→settled 三态：复用同一 answer 元素、同一盒模型，
                  data-state 只切换盒内内容（成形线索 ↔ 正文），首 token 不跳换整盒。 */}
              {hasText || forming ? (
                <div
                  className={cn(styles.bubble, styles.turnAnswer)}
                  data-state={hasText ? (liveAnswerSegment ? "streaming" : "settled") : "forming"}
                  data-anchor={forming && reconnecting ? "reconnecting" : undefined}
                >
                  {hasText ? (
                    <>
                      <MarkdownMessage content={message?.content ?? ""} />
                      {/* 正在出字的就近线索：紧跟正文的内联闪烁光标，对读屏隐藏；落定即消失。 */}
                      {showCaret ? <span className={styles.caret} aria-hidden /> : null}
                    </>
                  ) : (
                    <FormingContent
                      label={formingLabel}
                      reconnecting={reconnecting}
                      waitingForDecision={hitlActive}
                    />
                  )}
                </div>
              ) : null}
              <SegmentProcess
                segmentId={segment.segmentId}
                {...(display.facts ? { activityDetails: display.facts.activity_details } : {})}
                {...(onOpenActivity ? { onOpenActivity: (activityId: string) => { display.inspect(); onOpenActivity(activityId) } } : {})}
                {...(answerActionBoundary && displayRunId && display.facts === null ? { onInspect: display.inspect } : {})}
                activities={segment.activities}
                live={liveProcessSegment}
                continueProcessing={liveProcessSegment && !tailHasText && phaseLabel === null && !reconnecting && !hitlActive}
                {...(mode === undefined ? {} : { mode })}
              />
            </div>
          )
        })}
        {interaction?.groups.map((group) => <div key={group.group_id} data-interaction-group={group.group_id}>
          {group.items.map((item) => {
            const Card = item.kind === "tool_approval" ? ApprovalCard : item.kind === "ask_user_question" ? AskUserCard : item.kind === "result_review" ? ReviewCard : InputCard
            const staged = stagedDecisions[item.item_id]
            return <div key={`${interaction.pause_revision}:${item.item_id}`}>
              <h3>{item.display.name}</h3>
              <Card tool={item} hitlActive={hitlActive && interaction.phase === "waiting"} controlError={controlError}
                {...(onCancelRun && item.kind === "ask_user_question" ? { onCancelRun } : {})}
                {...(staged === undefined ? {} : { staged })} {...(onToolDecision === undefined ? {} : { onDecision: onToolDecision })} />
              {/* Kind chooses the presentation, never narrows the owner's action whitelist. */}
              {item.kind !== "tool_approval" && item.allowed_decisions.some((type) => type === "edit" || (item.kind === "ask_user_question" && (type === "approve" || type === "reject")) || (item.kind === "input" && type === "approve")) ?
                <ApprovalCard tool={{ ...item, allowed_decisions: item.allowed_decisions.filter((type) => type === "edit" || (item.kind === "ask_user_question" && (type === "approve" || type === "reject")) || (item.kind === "input" && type === "approve")) }}
                  hitlActive={hitlActive && interaction.phase === "waiting"} controlError={controlError}
                  {...(staged === undefined ? {} : { staged })} {...(onToolDecision === undefined ? {} : { onDecision: onToolDecision })} /> : null}
              {item.kind !== "ask_user_question" && item.kind !== "result_review" && item.allowed_decisions.includes("respond") ?
                <AskUserCard tool={item} hitlActive={hitlActive && interaction.phase === "waiting"} controlError={controlError}
                  {...(staged === undefined ? {} : { staged })} {...(onToolDecision === undefined ? {} : { onDecision: onToolDecision })} /> : null}
              {item.kind !== "input" && item.allowed_decisions.includes("submit") ?
                <InputCard tool={{ ...item, allowed_decisions: ["submit"] }} hitlActive={hitlActive && interaction.phase === "waiting"} controlError={controlError}
                  {...(staged === undefined ? {} : { staged })} {...(onToolDecision === undefined ? {} : { onDecision: onToolDecision })} /> : null}
            </div>
          })}
        </div>)}
        {!isLive && (answerText || answerActionTarget) ? (
          answerActionBoundary && answerActionTarget ? <OwnerAnswerActions boundary={answerActionBoundary} runId={answerActionTarget.runId} messageId={answerActionTarget.messageId} text={answerText} /> : <AnswerActions text={answerText} />
        ) : null}
        {!isLive && cancelled ? <p role="status" data-run-terminal="cancelled">{t("thread.cancelled")}</p> : !isLive ? failureFooter : null}
      </div>
    </article>
  )
}
