"use client"

import { Check, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useLocale, useT } from "@/i18n/context"
import { formatDeliveryTime } from "@/ui/canvas/canvas-panel"

import { taskStatus, type ScheduledTaskRecord } from "../model/scheduled-task"
import type { ScheduledView } from "./scheduled-task-location"
import { ScheduledTaskListActions } from "./scheduled-task-list-actions"
import { mutationMessageKey, statusMessageKey, type ScheduledMutation } from "./scheduled-task-presentation"
import styles from "./scheduled-task-surface.module.css"

type ScheduledTaskListProps = {
  brandName: string
  tasks: readonly ScheduledTaskRecord[]
  view: ScheduledView
  pendingMutation: ScheduledMutation | null
  mutationError: ScheduledMutation | null
  mutationBusy: boolean
  canCreate: boolean
  canUpdate: boolean
  canRetry: boolean
  canDelete: boolean
  openEditor: (prompt?: string, target?: HTMLElement | null, task?: ScheduledTaskRecord | null) => void
  setDeleteTarget: (task: ScheduledTaskRecord) => void
  retryTask: (task: ScheduledTaskRecord) => Promise<void>
  setTaskEnabled: (task: ScheduledTaskRecord, enabled: boolean) => Promise<void>
}

export function ScheduledTaskList({
  brandName,
  tasks,
  view,
  pendingMutation,
  mutationError,
  mutationBusy,
  canCreate,
  canUpdate,
  canRetry,
  canDelete,
  openEditor,
  setDeleteTarget,
  retryTask,
  setTaskEnabled,
}: ScheduledTaskListProps) {
  const t = useT()
  return (
    <section className={styles.taskContent} aria-labelledby="scheduled-list-title" data-testid="scheduled-task-list">
      <div className={styles.taskHeading}>
        <div>
          <p className={styles.eyebrow}>{t("rail.navScheduled")}</p>
          <h2 id="scheduled-list-title">{t("scheduled.heroTitle", { brand: brandName })}</h2>
        </div>
        <Button
          type="button"
          variant="outline"
          className={styles.listCreate}
          disabled={!canCreate}
          onClick={(event) => openEditor("", event.currentTarget)}
        >
          <Plus data-icon="inline-start" aria-hidden="true" />
          {t("scheduled.create")}
        </Button>
      </div>
      {view === "calendar" ? null : (
        <div className={styles.taskList} role="list" aria-label={t("rail.navScheduled")}>
          {tasks.map((task) => (
            <ScheduledTaskListItem
              key={task.id}
              task={task}
              pendingMutation={pendingMutation}
              mutationError={mutationError}
              mutationBusy={mutationBusy}
              canUpdate={canUpdate}
              canRetry={canRetry}
              canDelete={canDelete}
              openEditor={openEditor}
              setDeleteTarget={setDeleteTarget}
              retryTask={retryTask}
              setTaskEnabled={setTaskEnabled}
            />
          ))}
        </div>
      )}
    </section>
  )
}

type ScheduledTaskListItemProps = Pick<
  ScheduledTaskListProps,
  | "pendingMutation"
  | "mutationError"
  | "mutationBusy"
  | "canUpdate"
  | "canRetry"
  | "canDelete"
  | "openEditor"
  | "setDeleteTarget"
  | "retryTask"
  | "setTaskEnabled"
> & { task: ScheduledTaskRecord }

function ScheduledTaskListItem({
  task,
  pendingMutation,
  mutationError,
  mutationBusy,
  canUpdate,
  canRetry,
  canDelete,
  openEditor,
  setDeleteTarget,
  retryTask,
  setTaskEnabled,
}: ScheduledTaskListItemProps) {
  const { locale } = useLocale()
  const t = useT()
  const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" })
  const ruleLabel =
    task.frequency === "weekly"
      ? (task.weekdays ?? []).map((day) => weekdayFormat.format(new Date(Date.UTC(2000, 0, 2 + day)))).join("、")
      : task.frequency === "monthly"
        ? (task.monthDays ?? []).map((day) => t("scheduled.dayOfMonth", { day })).join("、")
        : (task.localDate ?? "")
  const status = task.schedulingState ?? taskStatus(task)
  const enabled = status === "active"
  const isMutating = pendingMutation?.taskId === task.id
  const taskMutationError = mutationError?.taskId === task.id
  return (
    <article className={styles.taskCard} role="listitem" data-status={status} aria-busy={isMutating || undefined}>
      <span
        className={styles.taskStatus}
        data-enabled={enabled ? "true" : "false"}
        role="img"
        aria-label={t(statusMessageKey(status))}
      >
        {status === "active" ? <Check aria-hidden="true" /> : <span aria-hidden="true" />}
      </span>
      <div className={styles.taskDetails}>
        <strong>{task.title}</strong>
        {task.triggerKind === "rss" ? <RssTaskFacts task={task} status={status} /> : <span>
          {t(
            task.frequency === "weekly"
              ? "firstSite.weekly"
              : task.frequency === "monthly"
                ? "scheduled.monthly"
                : task.frequency === "once"
                  ? "scheduled.once"
                  : "firstSite.daily",
          )}
          {ruleLabel ? ` ${ruleLabel}` : ""} · {task.time}
          {task.timezone ? ` (${task.timezone})` : ""} · {t(statusMessageKey(status))}
        </span>}
        {isMutating && pendingMutation ? (
          <span className={styles.mutationStatus} role="status">
            {t(mutationMessageKey(pendingMutation.operation))}
          </span>
        ) : null}
        {taskMutationError ? (
          <span className={styles.mutationError} role="alert">
            {t("scheduled.updateFailed")}
          </span>
        ) : null}
      </div>
      {task.nextRun ? (
        <time className={styles.nextRun} dateTime={task.nextRun}>
          {formatDeliveryTime(task.nextRun, locale)}
        </time>
      ) : null}
      <ScheduledTaskListActions
        task={task}
        busy={mutationBusy}
        canUpdate={canUpdate}
        canRetry={canRetry}
        canDelete={canDelete}
        openEditor={openEditor}
        setDeleteTarget={setDeleteTarget}
        retryTask={retryTask}
        setTaskEnabled={setTaskEnabled}
      />
    </article>
  )
}

function RssTaskFacts({ task, status }: {
  task: Extract<ScheduledTaskRecord, { triggerKind: "rss" }>
  status: NonNullable<ScheduledTaskRecord["schedulingState"]>
}) {
  const t = useT(), { locale } = useLocale()
  const labels = { initializing: "scheduled.rssInitializing", active: "scheduled.rssActive", backoff: "scheduled.rssBackoff", limit_reached: "scheduled.rssLimitReached" } as const
  return <div className={styles.rssFacts}>
    <span>{task.feedUrl}</span>
    <span>{t(status === "active" ? (task.feedState ? labels[task.feedState] : "scheduled.rssPreviewUnavailable") : statusMessageKey(status))}</span>
    {task.lastCheckedAt ? <span>{t("scheduled.rssLastChecked")} · <time dateTime={task.lastCheckedAt}>{formatDeliveryTime(task.lastCheckedAt, locale)}</time></span> : null}
    {status === "active" && task.nextCheckAt ? <span>{t("scheduled.rssNextCheck")} · <time dateTime={task.nextCheckAt}>{formatDeliveryTime(task.nextCheckAt, locale)}</time></span> : null}
    {task.errorCode ? <span>{t("scheduled.rssCheckError")} · {task.errorCode}</span> : null}
  </div>
}
