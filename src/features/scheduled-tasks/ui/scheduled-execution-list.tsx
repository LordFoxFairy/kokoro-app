"use client"

import Link from "next/link"

import { Button } from "@/components/ui/button"
import { useLocale } from "@/i18n/context"

import type { ScheduledExecution } from "../model/scheduled-task"
import type { useScheduledExecutions } from "./use-scheduled-executions"
import styles from "./scheduled-task-surface.module.css"

export function ScheduledExecutionList({ source }: { source: ReturnType<typeof useScheduledExecutions> }) {
  const { t } = useLocale()
  const executions = source.page?.executions ?? []
  return <section className={styles.executionList} aria-label={t("scheduled.tabUpdates")} aria-busy={source.loading}>
    <div className={styles.executionActions}>
      <Button type="button" variant="outline" size="sm" disabled={!source.available || source.loading}
        onClick={() => void source.refresh()}>{t("scheduled.refreshUpdates")}</Button>
    </div>
    {!source.available ? <p role="status">{t("scheduled.updatesUnavailable")}</p>
      : source.loading && executions.length === 0 ? <p role="status">{t("scheduled.updatesLoading")}</p>
        : source.error ? <p role="alert">{t("scheduled.updatesError")}</p>
          : executions.length === 0 ? <p role="status">{t("scheduled.updatesEmpty")}</p> : null}
    {executions.length > 0 ? <ul className={styles.executionRows}>
      {executions.map(execution => <ScheduledExecutionItem key={execution.id} execution={execution} />)}
    </ul> : null}
    {source.page?.nextCursor ? <Button type="button" variant="outline" disabled={source.loading || !source.available}
      onClick={() => void source.loadMore()}>{source.loading ? t("scheduled.updatesLoading") : t("rail.loadMore")}</Button> : null}
  </section>
}

function ScheduledExecutionItem({ execution }: { execution: ScheduledExecution }) {
  const { t, locale } = useLocale()
  const href = execution.conversationId === null || execution.assistantMessageId === null ? null
    : execution.projectId === null ? `/app?conversation=${encodeURIComponent(execution.conversationId)}`
      : `/app/project/${encodeURIComponent(execution.projectId)}?conversation=${encodeURIComponent(execution.conversationId)}`
  const format = (instant: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(instant))
  return <li className={styles.executionRow} data-state={execution.state}>
    <div className={styles.taskDetails}>
      <strong>{execution.taskTitle}</strong>
      <time dateTime={execution.occurrenceAt}>{format(execution.occurrenceAt)}</time>
      <span>{t(`scheduled.execution.${execution.state}`)}</span>
      {execution.completedAt ? <time dateTime={execution.completedAt}>{t("scheduled.completedAt", { time: format(execution.completedAt) })}</time> : null}
    </div>
    {href === null ? <span className={styles.resultUnavailable}>{t("scheduled.resultUnavailable")}</span>
      : <Link className={styles.resultLink} href={href}>{t("scheduled.openResult")}</Link>}
  </li>
}
