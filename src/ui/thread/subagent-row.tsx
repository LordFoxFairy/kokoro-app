import { Bot } from "lucide-react"
import type { ReactNode } from "react"
import type { RunProcessActivity } from "@/contract/chat"
import { useT } from "@/i18n/context"
import { RunState } from "./run-state"
import styles from "./thread.module.css"

type SubagentActivity = Extract<RunProcessActivity, { activity: "subagent" }>
/** A safe lifecycle marker, never a nested transcript or a disclosure of its own. */
export function SubagentRow({ activity, continuation }: { activity: SubagentActivity; continuation?: ReactNode }) {
  const t = useT()
  const status = t(activity.status === "running" ? "thread.processRunning" : activity.status === "completed" ? "thread.processCompleted" : "thread.processFailed")
  return <div className={styles.action} data-status={activity.status}><div className={styles.actionRow}>
    <Bot className={styles.actionIcon} aria-hidden="true" /><span className={styles.actionLabel}>{t("thread.subagent")}</span>
    <span className={activity.status === "completed" ? "sr-only" : styles.actionStatus}>{status}</span>
    <span className={styles.actionState} aria-hidden="true"><RunState done={activity.status === "completed"} failed={activity.status === "failed"} /></span>
    {continuation}
  </div></div>
}
