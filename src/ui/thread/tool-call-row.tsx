import { Wrench } from "lucide-react"
import type { RunProcessActivity } from "@/contract/chat"
import type { MessageKey } from "@/i18n/messages"
import { useT } from "@/i18n/context"
import { RunState } from "./run-state"
import styles from "./thread.module.css"
type ToolActivity = Extract<RunProcessActivity, { activity: "tool" }>
const TOOL_LABELS = {
  "tool.execution": "thread.toolCall",
  "tool.file.read": "thread.toolFileRead",
  "tool.file.write": "thread.toolFileWrite",
  "tool.file.deliver": "thread.toolFileDeliver",
  "tool.mcp.discover": "thread.toolMcpDiscover",
  "tool.mcp.describe": "thread.toolMcpDescribe",
  "tool.mcp.call": "thread.toolMcpCall",
  "tool.web.search": "thread.toolWebSearch",
  "tool.web.fetch": "thread.toolWebFetch",
} satisfies Record<ToolActivity["display_code"], MessageKey>
/** Public28 tool activity exposes only trusted categories, never raw names, arguments or results. */
export function ToolCallRow({ activity }: { activity: ToolActivity }) {
  const t = useT()
  const status = t(activity.status === "running" ? "thread.processRunning" : activity.status === "completed" ? "thread.processCompleted" : "thread.processFailed")
  return <div className={styles.tool} data-status={activity.status}><div className={styles.toolSummary}>
    <Wrench className={styles.toolIcon} /><span className={styles.toolName}>{t(TOOL_LABELS[activity.display_code])}</span><span>{status}</span>
    <span className={styles.toolState} aria-hidden><RunState done={activity.status === "completed"} failed={activity.status === "failed"} /></span>
  </div></div>
}
