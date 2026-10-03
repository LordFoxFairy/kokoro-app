import { Bot } from "lucide-react"
import type { RunProcessActivity } from "@/contract/chat"
import { useT } from "@/i18n/context"
import { RunState } from "./run-state"
import styles from "./thread.module.css"
type SubagentActivity = Extract<RunProcessActivity, { activity: "subagent" }>
/** Public7 subagent activity is a safe lifecycle marker, not a raw nested transcript. */
export function SubagentRow({ activity }: { activity: SubagentActivity }) {
  const t = useT()
  const status = t(activity.status === "running" ? "thread.processRunning" : activity.status === "completed" ? "thread.processCompleted" : "thread.processFailed")
  return <div className={styles.subagent} data-status={activity.status}><div className={styles.subagentSummary}>
    <Bot className={styles.subagentIcon} /><span className={styles.subagentName}>{t("thread.subagent")}</span><span>{status}</span>
    <span className={styles.subagentState} aria-hidden><RunState done={activity.status === "completed"} failed={activity.status === "failed"} /></span>
  </div></div>
}
