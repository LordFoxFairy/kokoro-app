import { Wrench } from "lucide-react"
import type { RunProcessActivity } from "@/contract/chat"
import { useT } from "@/i18n/context"
import { RunState } from "./run-state"
import styles from "./thread.module.css"
type ToolActivity = Extract<RunProcessActivity, { activity: "tool" }>
/** Public7 tool activity is summary-only; raw names, arguments and results are not public facts. */
export function ToolCallRow({ activity }: { activity: ToolActivity }) {
  const t = useT()
  const status = t(activity.status === "running" ? "thread.processRunning" : activity.status === "completed" ? "thread.processCompleted" : "thread.processFailed")
  return <div className={styles.tool} data-status={activity.status}><div className={styles.toolSummary}>
    <Wrench className={styles.toolIcon} /><span className={styles.toolName}>{t("thread.toolCall")}</span><span>{status}</span>
    <span className={styles.toolState} aria-hidden><RunState done={activity.status === "completed"} failed={activity.status === "failed"} /></span>
  </div></div>
}
