"use client"

import { useState } from "react"
import { History, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useLocale } from "@/i18n/context"
import type { MessageKey } from "@/i18n/messages"

import type { ScheduledTaskRecord } from "../model/scheduled-task"
import type { ScheduledTaskRunState } from "../model/scheduled-task-run"
import type { ScheduledTaskCreationContext } from "./scheduled-task-location"
import type { ScheduledTaskRuntime } from "./scheduled-task-mode"
import { useScheduledTaskRuns } from "./use-scheduled-task-runs"
import styles from "./scheduled-task-surface.module.css"

const stateLabels: Record<ScheduledTaskRunState, MessageKey> = {
  pending: "scheduled.runsPending", admission_unknown: "scheduled.runsAdmissionUnknown", admitted: "scheduled.runsAdmitted",
  dispatch_failed: "scheduled.runsDispatchFailed", completed: "scheduled.runsCompleted", cancelled: "scheduled.runsCancelled", failed: "scheduled.runsFailed",
}

type Props = Readonly<{
  runtime: ScheduledTaskRuntime; context: ScheduledTaskCreationContext
  tasks: readonly ScheduledTaskRecord[]; readReady: boolean; loading: boolean; loadError: boolean; reloadTasks: () => Promise<void>
}>

export function ScheduledTaskRunUpdates({ runtime, context, tasks, readReady, loading, loadError, reloadTasks }: Props) {
  const { t, locale } = useLocale()
  const [selection, setSelection] = useState({ taskId: "", expired: false })
  const selected = selection.expired ? undefined : tasks.find(task => task.id === selection.taskId)
  const selectionExpired = selection.expired || selection.taskId !== "" && selected === undefined
  if (!selection.expired && selectionExpired && !loading && !loadError) setSelection({ ...selection, expired: true })
  const reader = runtime.mode === "live" ? runtime.client?.listScheduledTaskRuns : undefined
  const available = reader !== undefined
  const canRead = available && readReady && !selectionExpired && context.kind !== "invalid" && !loading && !loadError && (context.kind === "personal" || selected !== undefined)
  const runs = useScheduledTaskRuns(reader, canRead, selected?.id)
  const busy = runs.phase === "loading"
  const date = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", timeZone: runtime.displayTimezone })
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: runtime.displayTimezone })
  let previousDay: string | undefined

  return <section className={styles.runUpdates} aria-label={t("scheduled.runsTitle")} aria-busy={busy || loading}>
    <div className={styles.runHeading}>
      <div><h2>{t("scheduled.runsTitle")}</h2><p>{t("scheduled.runsDescription")}</p></div>
      <Button type="button" variant="outline" disabled={!canRead || busy} onClick={runs.refresh} aria-label={t("scheduled.runsRefresh")}>
        <RefreshCw aria-hidden="true" />{t("scheduled.runsRefresh")}
      </Button>
    </div>
    {available && context.kind !== "invalid" ? <label className={styles.runFilter}>
      <span>{t("scheduled.runsSelectTask")}</span>
      <select aria-label={t("scheduled.runsSelectTask")} value={selection.taskId} disabled={loading || loadError} onChange={event => setSelection({ taskId: event.target.value, expired: false })}>
        {selectionExpired ? <option value={selection.taskId} disabled>{t("scheduled.runsChooseTask")}</option> : null}
        <option value="">{t(context.kind === "project" ? "scheduled.runsChooseTask" : "scheduled.runsAllTasks")}</option>
        {tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}
      </select>
    </label> : null}
    {!available ? <p className={styles.runNotice}>{t("scheduled.runsUnavailable")}</p>
      : context.kind === "invalid" ? <p role="alert" className={styles.runNotice}>{t("scheduled.invalidScope")}</p>
      : loading ? <p role="status" className={styles.runNotice}>{t("firstSite.tasksLoading")}</p>
      : loadError ? <div role="alert" className={styles.runNotice}><p>{t("firstSite.tasksError")}</p><Button variant="outline" onClick={() => void reloadTasks()}>{t("firstSite.retry")}</Button></div>
      : (context.kind === "project" || selectionExpired) && !selected ? <p className={styles.runNotice}>{t(context.kind === "project" ? "scheduled.runsProjectPrompt" : "scheduled.runsChooseTask")}</p>
      : runs.phase === "error" ? <div role="alert" className={styles.runNotice}><p>{t("scheduled.runsReadError")}</p><Button variant="outline" onClick={runs.refresh}>{t("scheduled.runsRetry")}</Button></div>
      : busy || runs.phase === "idle" ? <p role="status" className={styles.runNotice}>{t("scheduled.runsLoading")}</p>
      : runs.page?.items.length === 0 ? <div className={styles.runNotice}><History aria-hidden="true" /><p>{t("scheduled.runsEmpty")}</p></div>
      : <div className={styles.runGroups}>
        {runs.page?.items.map(run => {
          const instant = run.triggerKind === "rss" ? run.observedAt : run.scheduledFor
          if (!instant) return null
          const day = date.format(new Date(instant)), showDay = day !== previousDay
          previousDay = day
          return <div key={run.runId}>
            {showDay ? <h3 className={styles.runDay}>{day}</h3> : null}
            <article className={styles.runCard}>
              <div className={styles.runCardHeading}><strong>{run.title}</strong><span className={styles.runBadge} data-state={run.state}>{t(stateLabels[run.state])}</span></div>
              <dl><div><dt>{t(run.triggerKind === "rss" ? "scheduled.rssObservedAt" : "scheduled.runsScheduledFor")}</dt><dd><time dateTime={instant}>{time.format(new Date(instant))}</time><span> · {runtime.displayTimezone}</span></dd></div>
                {run.terminalEventAt ? <div><dt>{t("scheduled.runsTerminalAt")}</dt><dd><time dateTime={run.terminalEventAt} title={date.format(new Date(run.terminalEventAt))}>{time.format(new Date(run.terminalEventAt))}</time></dd></div> : null}
              </dl>
            </article>
          </div>
        })}
        {runs.page?.nextCursor ? <Button className={styles.runNext} variant="outline" onClick={runs.next} disabled={busy}>{t("scheduled.runsNext")}</Button> : null}
      </div>}
  </section>
}
