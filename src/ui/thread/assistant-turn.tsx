import type { AgentMode } from "@/core/conversations"
import { DEFAULT_BRAND } from "@/config/brand"
import { groupSegments } from "@/core/projections"
import type { SessionMessage, SessionStep, SessionToolCall } from "@/core/state"
import type { ToolDecision } from "@/engine/hitl-staging"
import { useT } from "@/i18n/context"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Copy } from "lucide-react"
import { useState } from "react"

import { MarkdownMessage } from "./markdown-message"
import { SegmentProcess } from "./segment-process"
import styles from "./thread.module.css"

type AssistantTurnProps = {
  brandName?: string
  onOpenFile?: (path: string) => void
  // 工具 pill 点击 → canvas 详情（runId 已在上游绑定）。
  onOpenTool?: (tool: SessionToolCall) => void
  sessionId: string | null
  // 这一轮（一个 runId）按 seq 排好的有序步骤：思考/工具/子智能体/文本交错。
  steps: SessionStep[]
  // 文本步骤按 segmentId 取这一段正文；过程先到、正文未到时该段可能暂缺。
  messagesById: Record<string, SessionMessage>
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
    <span className={styles.forming}>
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
  brandName = DEFAULT_BRAND.name,
  sessionId,
  onOpenFile,
  onOpenTool,
  steps,
  messagesById,
  isLive,
  reconnecting = false,
  mode,
  stagedDecisions,
  hitlActive,
  controlError,
  onToolDecision,
  onCancelRun,
  taskTitle,
}: AssistantTurnProps) {
  const t = useT()
  const segments = groupSegments(steps)
  const tailId = segments.at(-1)?.segmentId
  const tailMessage = tailId ? messagesById[tailId] : undefined
  const tailHasText = Boolean(tailMessage) && (tailMessage?.content.length ?? 0) > 0
  const formingLabel = hitlActive
    ? t("hitl.approvalTitle")
    : mode === "fast"
      ? t("thread.formingAnswer")
      : t("thread.formingThinking")
  // 提交后首个 step/token 未到：这一轮还没有任何 segment，但仍在途——给一个成形脚手架
  // （单条「正在…」），绝不让在途轮塌成空帧。落定/非流式则不渲染脚手架。
  const showScaffold = isLive && segments.length === 0
  // 重连可读：尾段已有正文时（streaming 盒，无 forming 盒承载「重连中…」），用 turn 级状态条补出
  // 重连信号——否则刷新回半截 run 只剩呼吸脉冲、看不出在重连还是卡死。无正文时仍由成形盒显示，互斥不重复。
  const showReconnectStrip = reconnecting && tailHasText
  const [copied, setCopied] = useState(false)
  const answerText = segments
    .map((segment) => messagesById[segment.segmentId]?.content ?? "")
    .filter(Boolean)
    .join("\n\n")

  const copyAnswer = async () => {
    if (!answerText) return
    try {
      await navigator.clipboard.writeText(answerText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      // Clipboard permission is optional; the action remains present without
      // turning a browser policy denial into a visible runtime error.
    }
  }

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
        {taskTitle ? (
          <Badge variant="outline" className={styles.creditNote} data-slot="credit-note">
            {t("thread.creditNote")}
          </Badge>
        ) : null}
        {showReconnectStrip ? (
          <div className={styles.turnReconnect} data-anchor="reconnecting">
            {t("thread.reconnecting")}
            {/* 脉冲三点：与无正文路径的成形盒动态线索一致，让「正在重连」可读。 */}
            <span className={styles.pulse} aria-hidden>
              <span />
              <span />
              <span />
            </span>
          </div>
        ) : null}
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
          const liveSegment = isLive && segment.segmentId === tailId
          const showCaret = liveSegment && hasText
          const hasProcess =
            segment.thinking.length > 0 ||
            segment.tools.length > 0 ||
            segment.subagents.length > 0
          // HITL 的过程卡本身就是当前状态锚点；不要再在它上方渲染
          // 一条重复的「工具调用待批准」forming 行，避免审批态撑高后
          // 首条消息被自动滚动挤出视口。
          const forming = liveSegment && !hasText && !(hitlActive && hasProcess)
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
                  data-state={hasText ? (liveSegment ? "streaming" : "settled") : "forming"}
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
                sessionId={sessionId}
                onOpenFile={onOpenFile}
                onOpenTool={onOpenTool}
                segmentId={segment.segmentId}
                thinking={segment.thinking}
                tools={segment.tools}
                subagents={segment.subagents}
                live={liveSegment}
                mode={mode}
                stagedDecisions={stagedDecisions}
                hitlActive={hitlActive}
                controlError={controlError}
                onToolDecision={onToolDecision}
                onCancelRun={onCancelRun}
              />
            </div>
          )
        })}
        {taskTitle && answerText ? (
          <div className={styles.assistantActions} data-slot="assistant-actions">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t(copied ? "thread.copiedAnswer" : "thread.copyAnswer")}
              title={t(copied ? "thread.copiedAnswer" : "thread.copyAnswer")}
              onClick={() => void copyAnswer()}
            >
              <Copy aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </div>
    </article>
  )
}
