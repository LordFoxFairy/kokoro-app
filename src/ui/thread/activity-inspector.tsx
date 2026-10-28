import { useEffect } from "react"
import type { ResolvedCanvasContent } from "@/ui/canvas/canvas-store"
import type { AnswerActionBoundary } from "./answer-action-scope"
import { useRunDisplay } from "./use-run-display"
import { overlayRunDisplay } from "./run-display-overlay"
import { TOOL_ACTION_PRESENTATION } from "./tool-action-presentation"
import { useT } from "@/i18n/context"
import { ActivityResult } from "./activity-result"
import styles from "./activity-inspector.module.css"

/** Selected, read-only safe facts. A displayed path never grants file access. */
export function ActivityInspector({ content, boundary }: {
  content: Extract<ResolvedCanvasContent, { kind: "activity" }>
  boundary?: AnswerActionBoundary
}) {
  const t = useT()
  const admitted = boundary?.actorId === content.subject && boundary.isCurrent()
  const display = useRunDisplay(admitted ? boundary : undefined, content.runId, content.terminal)
  const inspect = display.inspect
  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) inspect() })
    return () => { active = false }
  }, [inspect])
  const activity = overlayRunDisplay([content.activity], display.facts)[0]!
  if (activity.activity !== "tool") return null
  const detail = display.facts?.activity_details.find(item => item.activity_id === content.activityId)
  const targetDetail = detail?.target ?? activity.display_detail
  const target = targetDetail?.kind === "file" ? targetDetail.virtual_path ?? targetDetail.name : targetDetail?.name
  return <div className={styles.inspector}>
    <p className={styles.operation}>{t(TOOL_ACTION_PRESENTATION[activity.display_code].label)}</p>
    {target ? <h2 className={styles.target}>{target}</h2> : null}
    <p role="status" className={styles.status}>{t(activity.status === "running" ? "thread.processRunning" : activity.status === "failed" ? "thread.processFailed" : "thread.processCompleted")}</p>
    {display.phase === "loading" ? <span className="sr-only" role="status">{t("thread.partsReading")}</span> : null}
    {display.phase === "error" ? <p className={styles.missing} role="status">{t("thread.activityReadFailed")}</p> : null}
    {detail ? <ActivityResult key={detail.activity_id} detail={detail} mcpCall={activity.display_code === "tool.mcp.call" && detail.tool_name === "mcp_call"} />
      : display.phase === "ready" ? <p className={styles.missing}>{t("thread.activityMissing")}</p> : null}
  </div>
}
