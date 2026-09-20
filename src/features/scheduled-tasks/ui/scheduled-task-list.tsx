"use client"

import { Check, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLocale, useT } from "@/i18n/context"
import { formatDeliveryTime } from "@/ui/canvas/canvas-panel"

import { taskStatus, type ScheduledTaskRecord } from "../model/scheduled-task"
import type { ScheduledView } from "./scheduled-task-location"
import { ScheduledTaskListActions } from "./scheduled-task-list-actions"
import {
  mutationMessageKey,
  statusMessageKey,
  type ScheduledMutation,
} from "./scheduled-task-presentation"
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
  openEditor: (
    prompt?: string,
    target?: HTMLElement | null,
    task?: ScheduledTaskRecord | null,
  ) => void
  switchView: (next: string) => void
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
  switchView,
  setDeleteTarget,
  retryTask,
  setTaskEnabled,
}: ScheduledTaskListProps) {
  const t = useT()
  return (
    <section
      className={styles.taskContent}
      aria-labelledby="scheduled-list-title"
      data-testid="scheduled-task-list"
    >
      <div className={styles.taskHeading}>
        <div>
          <p className={styles.eyebrow}>{t("rail.navScheduled")}</p>
          <h2 id="scheduled-list-title">
            {t("scheduled.heroTitle", { brand: brandName })}
          </h2>
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
      <Tabs value={view} onValueChange={switchView} className={styles.views}>
        <TabsList
          variant="line"
          className={styles.viewTabs}
          aria-label={t("rail.navScheduled")}
        >
          <TabsTrigger value="calendar" className={styles.viewTab}>
            {t("scheduled.tabCalendar")}
          </TabsTrigger>
          <TabsTrigger value="list" className={styles.viewTab}>
            {t("scheduled.tabTasks")}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {view === "calendar" ? null : (
        <div
          className={styles.taskList}
          role="list"
          aria-label={t("rail.navScheduled")}
        >
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
  const status = taskStatus(task)
  const enabled = status === "active"
  const isMutating = pendingMutation?.taskId === task.id
  const taskMutationError = mutationError?.taskId === task.id
  return (
    <article
      className={styles.taskCard}
      role="listitem"
      data-status={status}
      aria-busy={isMutating || undefined}
    >
      <span
        className={styles.taskStatus}
        data-enabled={enabled ? "true" : "false"}
        role="img"
        aria-label={t(statusMessageKey(status))}
      >
        {status === "active" ? (
          <Check aria-hidden="true" />
        ) : (
          <span aria-hidden="true" />
        )}
      </span>
      <div className={styles.taskDetails}>
        <strong>{task.title}</strong>
        <span>
          {task.frequency === "weekly"
            ? t("firstSite.weekly")
            : t("firstSite.daily")}{" "}
          · {task.time} · {t(statusMessageKey(status))}
        </span>
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
