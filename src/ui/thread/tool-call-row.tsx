import type { ReactNode } from "react"
import type { RunActivityDetail } from "@/contract/answer-actions"
import type { RunProcessActivity } from "@/contract/chat"
import { useT } from "@/i18n/context"
import { TOOL_ACTION_PRESENTATION, mcpInputContext } from "./tool-action-presentation"
import styles from "./thread.module.css"
import details from "./activity-detail.module.css"

type ToolActivity = Extract<RunProcessActivity, { activity: "tool" }>

/** Prefer the same-call public intent; legacy activities keep their recorded category/target. */
export function ToolCallRow({ activity, continuation, onInspect, detail: ownerDetail }: {
  detail?: RunActivityDetail
  activity: ToolActivity
  onInspect?: (activityId: string) => void
  continuation?: ReactNode
}) {
  const t = useT()
  const detail = ownerDetail?.target ?? activity.display_detail
  const targetText = detail?.kind === "file" ? detail.virtual_path ?? detail.name : detail?.name
  const actionTitle = activity.action_title
  const input = ownerDetail?.input_preview?.text
  const context = activity.display_code === "tool.mcp.call" ? mcpInputContext(input) : undefined
  const { label, Icon } = TOOL_ACTION_PRESENTATION[activity.display_code]
  const status = t(activity.status === "running" ? "thread.processRunning" : activity.status === "completed" ? "thread.processCompleted" : "thread.processFailed")
  const content = <>
    <Icon className={styles.actionIcon} aria-hidden="true" />
    <span className={`${details.readingLine} ${actionTitle || detail?.kind === "file" ? details.fileLine : ""}`} title={actionTitle ?? [t(label), targetText, context].filter(Boolean).join(" · ")}>
      {actionTitle ? <span>{actionTitle}</span> : <>
      <span>{t(label)}</span>
      {targetText ? <> <span className={details.inlineTarget} title={targetText}>{targetText}</span></> : null}
      {context ? <> · <span>{context}</span></> : null}
      </>}
    </span>
    <span className={activity.status === "completed" ? "sr-only" : styles.actionStatus}>{status}</span>
  </>
  return <div className={styles.action} data-status={activity.status}>
    {onInspect ? <button type="button" data-canvas-opener="true" className={`${styles.actionRow} ${details.row} ${details.inspect}`} onClick={() => onInspect(activity.activity_id)}>{content}</button>
      : <div className={`${styles.actionRow} ${details.row}`}>{content}</div>}
    {continuation}
  </div>
}
