import { useEffect } from "react"
import type { ResolvedCanvasContent } from "@/ui/canvas/canvas-store"
import type { AnswerActionBoundary } from "./answer-action-scope"
import { useRunDisplay } from "./use-run-display"
import { overlayRunDisplay } from "./run-display-overlay"
import { TOOL_ACTION_PRESENTATION } from "./tool-action-presentation"
import { useT } from "@/i18n/context"
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
    <p className={styles.operation}>{detail?.tool_name ?? t(TOOL_ACTION_PRESENTATION[activity.display_code].label)}</p>
    {target ? <p className={styles.target}>{target}</p> : null}
    <p role="status" className={styles.status}>{t(activity.status === "running" ? "thread.processRunning" : activity.status === "failed" ? "thread.processFailed" : "thread.processCompleted")}</p>
    {display.phase === "loading" ? <span className="sr-only" role="status">{t("thread.partsReading")}</span> : null}
    {display.phase === "error" ? <p className={styles.missing} role="status">{t("thread.activityReadFailed")}</p> : null}
    {detail ? ([ ["thread.activityInput", detail.input_preview], ["thread.activityOutput", detail.output_preview] ] as const).map(([label, preview]) => <section key={label} className={styles.section}>
      <h3 className={styles.heading}>{t(label)}</h3>
      {preview ? <>
        <pre className={styles.preview}>{preview.text}</pre>
        {preview.truncated ? <span className={styles.annotation}>{t("thread.activityTruncated")}</span> : null}
        {preview.redacted ? <span className={styles.annotation}>{t("thread.activityRedacted")}</span> : null}
      </> : display.phase === "ready" ? <p className={styles.missing}>{t("thread.activityMissing")}</p> : null}
    </section>) : display.phase === "ready" ? <p className={styles.missing}>{t("thread.activityMissing")}</p> : null}
  </div>
}
