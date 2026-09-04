"use client"

import { ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Ellipsis, Plus } from "lucide-react"
import { useMemo } from "react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLocale, useT } from "@/i18n/context"
import { formatDeliveryTime } from "@/ui/canvas/canvas-panel"

import { buildCalendarDays, padDatePart } from "../model/calendar"
import { taskStatus, type ScheduledTaskRecord } from "../model/scheduled-task"
import type { ScheduledView } from "./scheduled-task-location"
import { mutationMessageKey, SUGGESTIONS, statusMessageKey, WEEKDAY_KEYS, type ScheduledMutation } from "./scheduled-task-presentation"
import styles from "./scheduled-task-surface.module.css"
import calendarStyles from "./scheduled-task-calendar.module.css"

type ScheduledSurfaceContentProps = {
  brandName: string
  fixtureMode: boolean
  controlledTasks: boolean
  loading: boolean
  loadError: boolean
  displayedTasks: readonly ScheduledTaskRecord[]
  view: ScheduledView
  calendarMonth: Date
  calendarTasks: ReadonlyMap<string, ScheduledTaskRecord[]>
  pendingMutation: ScheduledMutation | null
  mutationError: ScheduledMutation | null
  canCreate: boolean
  canUpdate: boolean
  canRetry: boolean
  canDelete: boolean
  loadTasks: () => Promise<void>
  openEditor: (prompt?: string, target?: HTMLElement | null, task?: ScheduledTaskRecord | null) => void
  switchView: (next: string) => void
  shiftCalendarMonth: (offset: number) => void
  resetCalendarMonth: () => void
  setDeleteTarget: (task: ScheduledTaskRecord) => void
  retryTask: (task: ScheduledTaskRecord) => Promise<void>
  setTaskEnabled: (task: ScheduledTaskRecord, enabled: boolean) => Promise<void>
}

export function ScheduledTaskContent({ brandName, fixtureMode, controlledTasks, loading, loadError, displayedTasks, view, calendarMonth, calendarTasks, pendingMutation, mutationError, canCreate, canUpdate, canRetry, canDelete, loadTasks, openEditor, switchView, shiftCalendarMonth, resetCalendarMonth, setDeleteTarget, retryTask, setTaskEnabled }: ScheduledSurfaceContentProps) {
  const { locale } = useLocale()
  const t = useT()
  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth])
  return (
    <>

        {!fixtureMode && !controlledTasks && loading && displayedTasks.length === 0 ? (
          <section className={styles.content} data-testid="scheduled-loading" aria-busy="true" aria-label={t("firstSite.tasksLoading")}>
            <div className={calendarStyles.loadingCalendar} aria-hidden="true"><div className={calendarStyles.calendarLines}>{Array.from({ length: 28 }, (_, index) => <i key={index} data-active={index === 11 ? "true" : undefined} />)}</div></div>
            <p className={styles.loadingMessage} role="status">{t("firstSite.tasksLoading")}</p>
          </section>
        ) : !fixtureMode && !controlledTasks && loadError && displayedTasks.length === 0 ? (
          <section className={styles.content} data-testid="scheduled-load-error" role="alert" aria-labelledby="scheduled-load-error-title">
            <div className={styles.errorState}>
              <CalendarDays aria-hidden="true" />
              <h2 id="scheduled-load-error-title">{t("firstSite.tasksError")}</h2>
              <Button type="button" variant="outline" onClick={() => void loadTasks()} disabled={loading} aria-busy={loading}>
                {loading ? <span className={styles.inlineSpinner} aria-hidden="true" /> : null}
                {t("firstSite.retry")}
              </Button>
            </div>
          </section>
        ) : displayedTasks.length === 0 ? (
          <section className={styles.content} aria-labelledby="scheduled-empty-title">
            <div className={calendarStyles.calendar} role="img" aria-label={t("scheduled.calendar")}>
              <div className={calendarStyles.calendarLines} aria-hidden="true">
                {Array.from({ length: 28 }, (_, index) => <i key={index} data-active={index === 11 ? "true" : undefined} />)}
              </div>
              <span className={calendarStyles.calendarAdd} aria-hidden="true"><Plus /></span>
            </div>
            <h2 id="scheduled-empty-title">{t("scheduled.heroTitle", { brand: brandName })}</h2>
            <div className={styles.suggestions}>
              {SUGGESTIONS.map(({ key, icon: Icon }) => {
                const prompt = t(key)
                return (
                  <button key={key} type="button" className={styles.suggestion} disabled={!canCreate} onClick={(event) => openEditor(prompt, event.currentTarget)}>
                    <Icon aria-hidden="true" />
                    <span>{prompt}</span>
                    <ArrowRight aria-hidden="true" />
                  </button>
                )
              })}
            </div>
            <Button type="button" className={styles.create} disabled={!canCreate} onClick={(event) => openEditor("", event.currentTarget)}>
              <Plus data-icon="inline-start" aria-hidden="true" />
              {t("scheduled.create")}
            </Button>
          </section>
        ) : (
          <section className={styles.taskContent} aria-labelledby="scheduled-list-title" data-testid="scheduled-task-list">
            {loadError ? (
              <div className={styles.inlineLoadError} data-testid="scheduled-inline-load-error" role="alert">
                <span>{t("firstSite.tasksError")}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => void loadTasks()} disabled={loading} aria-busy={loading}>
                  {loading ? <span className={styles.inlineSpinner} aria-hidden="true" /> : null}
                  {t("firstSite.retry")}
                </Button>
              </div>
            ) : null}
            <div className={styles.taskHeading}>
              <div>
                <p className={styles.eyebrow}>{t("rail.navScheduled")}</p>
                <h2 id="scheduled-list-title">{t("scheduled.heroTitle", { brand: brandName })}</h2>
              </div>
              <Button type="button" variant="outline" className={styles.listCreate} disabled={!canCreate} onClick={(event) => openEditor("", event.currentTarget)}>
                <Plus data-icon="inline-start" aria-hidden="true" />
                {t("scheduled.create")}
              </Button>
            </div>
            <Tabs value={view} onValueChange={switchView} className={styles.views}>
              <TabsList variant="line" className={styles.viewTabs} aria-label={t("rail.navScheduled")}>
                <TabsTrigger value="calendar" className={styles.viewTab}>{t("scheduled.tabCalendar")}</TabsTrigger>
                <TabsTrigger value="list" className={styles.viewTab}>{t("scheduled.tabTasks")}</TabsTrigger>
              </TabsList>
            </Tabs>
            {view === "calendar" ? (
              <div className={calendarStyles.calendarBoard} data-testid="scheduled-calendar-view" aria-label={t("scheduled.calendar")}>
                <div className={calendarStyles.calendarToolbar}>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t("scheduled.previousMonth")} onClick={() => shiftCalendarMonth(-1)}><ChevronLeft aria-hidden="true" /></Button>
                  <strong data-testid="scheduled-calendar-title" data-month={`${calendarMonth.getFullYear()}-${padDatePart(calendarMonth.getMonth() + 1)}`}>
                    {new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(calendarMonth)}
                  </strong>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t("scheduled.nextMonth")} onClick={() => shiftCalendarMonth(1)}><ChevronRight aria-hidden="true" /></Button>
                  <Button type="button" variant="outline" size="sm" className={styles.today} onClick={resetCalendarMonth}>{t("scheduled.today")}</Button>
                </div>
                <div className={calendarStyles.calendarWeek} data-testid="scheduled-calendar-weekdays" aria-hidden="true">{WEEKDAY_KEYS.map((key) => <span key={key}>{t(key)}</span>)}</div>
                <div className={calendarStyles.calendarGrid} role="grid">
                  {calendarDays.map((day) => {
                    const dayTasks = calendarTasks.get(day.key) ?? []
                    return (
                      <div
                        key={day.key}
                        className={calendarStyles.calendarCell}
                        data-current-month={day.currentMonth ? "true" : "false"}
                        data-today={day.today ? "true" : undefined}
                        data-testid={`scheduled-calendar-day-${day.key}`}
                        role="gridcell"
                        aria-label={new Intl.DateTimeFormat(locale, { weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(day.date)}
                      >
                        <span className={calendarStyles.calendarDayNumber}>{day.date.getDate()}</span>
                        <div className={calendarStyles.calendarEvents}>
                          {dayTasks.map((task) => {
                            const status = taskStatus(task)
                            return (
                              <button
                                key={task.id}
                                type="button"
                                className={calendarStyles.calendarTask}
                                data-status={status}
                                onClick={(event) => openEditor("", event.currentTarget, task)}
                                aria-label={`${task.title} · ${t(statusMessageKey(status))}`}
                              >
                                <span>{task.title}</span>
                                {status === "failed" ? <small>{t("scheduled.failed")}</small> : null}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className={styles.taskList} role="list" aria-label={t("rail.navScheduled")}>
                {displayedTasks.map((task) => {
                  const status = taskStatus(task)
                  const enabled = status === "active"
                  const isMutating = pendingMutation?.taskId === task.id
                  const taskMutationError = mutationError?.taskId === task.id
                  return (
                    <article key={task.id} className={styles.taskCard} role="listitem" data-status={status} aria-busy={isMutating || undefined}>
                      <span className={styles.taskStatus} data-enabled={enabled ? "true" : "false"} role="img" aria-label={t(statusMessageKey(status))}>
                        {status === "active" ? <Check aria-hidden="true" /> : <span aria-hidden="true" />}
                      </span>
                      <div className={styles.taskDetails}>
                        <strong>{task.title}</strong>
                        <span>{task.frequency === "weekly" ? t("firstSite.weekly") : t("firstSite.daily")} · {task.time} · {t(statusMessageKey(status))}</span>
                        {isMutating && pendingMutation ? <span className={styles.mutationStatus} role="status">{t(mutationMessageKey(pendingMutation.operation))}</span> : null}
                        {taskMutationError ? <span className={styles.mutationError} role="alert">{t("scheduled.updateFailed")}</span> : null}
                      </div>
                      {task.nextRun ? <time className={styles.nextRun} dateTime={task.nextRun}>{formatDeliveryTime(task.nextRun, locale)}</time> : null}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon-sm" className={styles.taskActions} disabled={isMutating} aria-label={t("scheduled.taskActions", { title: task.title })} aria-busy={isMutating || undefined}><Ellipsis aria-hidden="true" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {status === "failed" ? <DropdownMenuItem disabled={!canRetry} onSelect={() => void retryTask(task)}>{t("scheduled.retry")}</DropdownMenuItem> : <DropdownMenuItem disabled={!canUpdate} onSelect={() => void setTaskEnabled(task, !enabled)}>{enabled ? t("scheduled.pause") : t("scheduled.resume")}</DropdownMenuItem>}
                          <DropdownMenuItem disabled={!canUpdate} onSelect={() => openEditor("", null, task)}>{t("scheduled.edit")}</DropdownMenuItem>
                          <DropdownMenuItem disabled={!canDelete} onSelect={() => setDeleteTarget(task)}>{t("scheduled.delete")}</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        )}

    </>
  )
}
