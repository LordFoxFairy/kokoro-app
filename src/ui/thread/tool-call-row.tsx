import type { ReactNode } from "react"
import type { RunProcessActivity } from "@/contract/chat"
import { useT } from "@/i18n/context"
import { RunState } from "./run-state"
import { TOOL_ACTION_PRESENTATION } from "./tool-action-presentation"
import styles from "./thread.module.css"
import details from "./activity-detail.module.css"

type ToolActivity = Extract<RunProcessActivity, { activity: "tool" }>

/** Both the category and its optional target come from the same validated owner activity. */
export function ToolCallRow({ activity, continuation }: {
  activity: ToolActivity
  continuation?: ReactNode
}) {
  const t = useT()
  const detail = activity.display_detail
  const targetText = detail?.kind === "file" ? detail.virtual_path ?? detail.name : detail?.name
  const { label, Icon } = TOOL_ACTION_PRESENTATION[activity.display_code]
  const status = t(activity.status === "running" ? "thread.processRunning" : activity.status === "completed" ? "thread.processCompleted" : "thread.processFailed")
  return <div className={styles.action} data-status={activity.status}><div className={`${styles.actionRow} ${details.row}`}>
    <Icon className={styles.actionIcon} aria-hidden="true" />
    <span className={styles.actionLabel} title={t(label)}>{t(label)}</span>
    {targetText ? <span className={`${styles.actionTarget} ${details.target}`} title={targetText}>{targetText}</span> : null}
    <span className={activity.status === "completed" ? "sr-only" : styles.actionStatus}>{status}</span>
    <span className={styles.actionState} aria-hidden="true"><RunState done={activity.status === "completed"} failed={activity.status === "failed"} /></span>
    {continuation}
  </div></div>
}
