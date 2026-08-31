import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useState } from "react"

import type { SessionToolCall } from "@/core/state"
import type { ToolDecision } from "@/engine/hitl-staging"
import { useT } from "@/i18n/context"

import styles from "../thread/thread.module.css"

// ask_user 的 choices 活在工具 args 里（agent 侧工具入参）：仅接受纯字符串数组，其余形状忽略。
function choicesOf(args: Record<string, unknown>): string[] {
  const raw = args["choices"]
  if (!Array.isArray(raw)) {
    return []
  }
  const seen = new Set<string>()
  const choices: string[] = []
  for (const value of raw) {
    if (typeof value !== "string") continue
    const choice = value.trim()
    // The tool payload is untrusted presentation data. Drop blank/duplicate
    // options so the ToggleGroup has stable unique values and never renders
    // duplicate React keys or two controls that submit the same answer.
    if (choice === "" || seen.has(choice)) continue
    seen.add(choice)
    choices.push(choice)
  }
  return choices
}

type AskUserCardProps = {
  tool: SessionToolCall
  staged?: ToolDecision
  hitlActive: boolean
  controlError: string | null
  onDecision?: (toolId: string, decision: ToolDecision) => void
  // 问答卡自带「停止本轮」入口：用户不想回答时可直接取消 run。
  onCancelRun?: () => void
}

// ask_user 问答卡（kind=ask_user）：问题=工具入参 args.question（wire 只带数据，
// 展示文案归 web），choices 单选 + 自由输入，提交即 respond{response}；
// 不渲染普通审批按钮组（approve/reject 不属于问答）。
export function AskUserCard({
  tool,
  staged,
  hitlActive,
  controlError,
  onDecision,
  onCancelRun,
}: AskUserCardProps) {
  const t = useT()
  const [response, setResponse] = useState("")
  const decided = staged !== undefined
  const actionable = hitlActive && onDecision !== undefined
  const disabled = !actionable || (decided && controlError === null)
  const submitting = decided && controlError === null
  const canRespond = (tool.allowedDecisions ?? []).includes("respond")
  const choices = choicesOf(tool.args)
  const responseText = response.trim()
  const rawQuestion = tool.args["question"]
  const question = typeof rawQuestion === "string" && rawQuestion ? rawQuestion : t("hitl.askHint")
  const promptText = controlError
    ? t("hitl.replyFailed")
    : decided || !hitlActive
      ? t("hitl.replyRecorded")
      : question
  const promptLive = controlError !== null || decided || !hitlActive

  return (
    <div className={styles.toolApproval} role="group" aria-label={t("hitl.askQuestion")}>
      <p
        className={styles.toolApprovalPrompt}
        role={controlError !== null ? "alert" : promptLive ? "status" : undefined}
        aria-live={controlError !== null ? "assertive" : promptLive ? "polite" : undefined}
      >
        {promptText}
      </p>
      {canRespond ? (
        <>
          {choices.length > 0 ? (
            <ToggleGroup
              type="single"
              value={responseText}
              onValueChange={(value) => { if (value) setResponse(value) }}
              className={styles.toolChoices}
              aria-label={t("hitl.askOptions")}
            >
              {choices.map((choice) => (
                <ToggleGroupItem
                  key={choice}
                  className={styles.toolChoice}
                  disabled={disabled}
                  value={choice}
                >
                  {choice}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : null}
          <div className={styles.toolRespond}>
            <Input
              className={styles.toolRespondInput}
              aria-label={t("hitl.askReply")}
              value={response}
              disabled={disabled}
              onChange={(event) => setResponse(event.target.value)}
            />
            <Button variant="default"
              type="button"
              className={styles.toolRespondSend}
              disabled={disabled || responseText.length === 0}
              aria-busy={submitting}
              onClick={() => onDecision?.(tool.id, { type: "respond", message: responseText })}
            >
              {submitting ? <Spinner aria-hidden="true" /> : null}
              {t("hitl.sendReply")}
            </Button>
          </div>
        </>
      ) : null}
      {onCancelRun !== undefined && actionable && !decided ? (
        <Button variant="link"
          type="button"
          className={styles.toolCancelRun}
          onClick={onCancelRun}
        >
          {t("hitl.stopTurn")}
        </Button>
      ) : null}
    </div>
  )
}
