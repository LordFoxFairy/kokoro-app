"use client"

import { CalendarDays } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/context"

import type { ScheduledTaskRecord } from "../model/scheduled-task"
import type { ScheduledView } from "./scheduled-task-location"
import { ScheduledTaskCalendarView } from "./scheduled-task-calendar-view"
import { ScheduledTaskEmptyState } from "./scheduled-task-empty-state"
import { ScheduledTaskList } from "./scheduled-task-list"
import type { ScheduledMutation } from "./scheduled-task-presentation"
import calendarStyles from "./scheduled-task-calendar.module.css"
import styles from "./scheduled-task-surface.module.css"

type ScheduledTaskContentProps = {
  brandName: string
  fixtureMode: boolean
  controlledTasks: boolean
  loading: boolean
  loadError: boolean
  displayedTasks: readonly ScheduledTaskRecord[]
  view: ScheduledView
  displayTimezone: string
  calendarMonth: Date
  calendarTasks: ReadonlyMap<string, ScheduledTaskRecord[]>
  pendingMutation: ScheduledMutation | null
  mutationError: ScheduledMutation | null
  mutationBusy: boolean
  canCreate: boolean
  canUpdate: boolean
  canRetry: boolean
  canDelete: boolean
  loadTasks: () => Promise<void>
  openEditor: (
    prompt?: string,
    target?: HTMLElement | null,
    task?: ScheduledTaskRecord | null,
  ) => void
  switchView: (next: string) => void
  shiftCalendarMonth: (offset: number) => void
  resetCalendarMonth: () => void
  setDeleteTarget: (task: ScheduledTaskRecord) => void
  retryTask: (task: ScheduledTaskRecord) => Promise<void>
  setTaskEnabled: (task: ScheduledTaskRecord, enabled: boolean) => Promise<void>
}

export function ScheduledTaskContent(props: ScheduledTaskContentProps) {
  if (
    !props.fixtureMode &&
    !props.controlledTasks &&
    props.loading &&
    props.displayedTasks.length === 0
  )
    return <ScheduledTaskLoadingState />
  if (
    !props.fixtureMode &&
    !props.controlledTasks &&
    props.loadError &&
    props.displayedTasks.length === 0
  )
    return (
      <ScheduledTaskLoadError
        loading={props.loading}
        loadTasks={props.loadTasks}
      />
    )
  if (props.displayedTasks.length === 0)
    return (
      <ScheduledTaskEmptyState
        brandName={props.brandName}
        canCreate={props.canCreate}
        openEditor={props.openEditor}
      />
    )
  return <ScheduledTaskWorkspace {...props} />
}

function ScheduledTaskLoadingState() {
  const t = useT()
  return (
    <section
      className={styles.content}
      data-testid="scheduled-loading"
      aria-busy="true"
      aria-label={t("firstSite.tasksLoading")}
    >
      <div className={calendarStyles.loadingCalendar} aria-hidden="true">
        <div className={calendarStyles.calendarLines}>
          {Array.from({ length: 28 }, (_, index) => (
            <i key={index} data-active={index === 11 ? "true" : undefined} />
          ))}
        </div>
      </div>
      <p className={styles.loadingMessage} role="status">
        {t("firstSite.tasksLoading")}
      </p>
    </section>
  )
}

function ScheduledTaskLoadError({
  loading,
  loadTasks,
}: Pick<ScheduledTaskContentProps, "loading" | "loadTasks">) {
  const t = useT()
  return (
    <section
      className={styles.content}
      data-testid="scheduled-load-error"
      role="alert"
      aria-labelledby="scheduled-load-error-title"
    >
      <div className={styles.errorState}>
        <CalendarDays aria-hidden="true" />
        <h2 id="scheduled-load-error-title">{t("firstSite.tasksError")}</h2>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadTasks()}
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? (
            <span className={styles.inlineSpinner} aria-hidden="true" />
          ) : null}
          {t("firstSite.retry")}
        </Button>
      </div>
    </section>
  )
}

function ScheduledTaskWorkspace(props: ScheduledTaskContentProps) {
  return (
    <>
      {props.loadError ? (
        <ScheduledTaskInlineLoadError
          loading={props.loading}
          loadTasks={props.loadTasks}
        />
      ) : null}
      <ScheduledTaskList
        brandName={props.brandName}
        tasks={props.displayedTasks}
        view={props.view}
        pendingMutation={props.pendingMutation}
        mutationError={props.mutationError}
        mutationBusy={props.mutationBusy}
        canCreate={props.canCreate}
        canUpdate={props.canUpdate}
        canRetry={props.canRetry}
        canDelete={props.canDelete}
        openEditor={props.openEditor}
        switchView={props.switchView}
        setDeleteTarget={props.setDeleteTarget}
        retryTask={props.retryTask}
        setTaskEnabled={props.setTaskEnabled}
      />
      {props.view === "calendar" ? (
        <ScheduledTaskCalendarView
          calendarMonth={props.calendarMonth}
          calendarTasks={props.calendarTasks}
          displayTimezone={props.displayTimezone}
          openEditor={props.openEditor}
          shiftCalendarMonth={props.shiftCalendarMonth}
          resetCalendarMonth={props.resetCalendarMonth}
        />
      ) : null}
    </>
  )
}

function ScheduledTaskInlineLoadError({
  loading,
  loadTasks,
}: Pick<ScheduledTaskContentProps, "loading" | "loadTasks">) {
  const t = useT()
  return (
    <div
      className={styles.inlineLoadError}
      data-testid="scheduled-inline-load-error"
      role="alert"
    >
      <span>{t("firstSite.tasksError")}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void loadTasks()}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? (
          <span className={styles.inlineSpinner} aria-hidden="true" />
        ) : null}
        {t("firstSite.retry")}
      </Button>
    </div>
  )
}
