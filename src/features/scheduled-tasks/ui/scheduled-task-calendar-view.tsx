"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { useMemo } from "react"

import { Button } from "@/components/ui/button"
import { useLocale, useT } from "@/i18n/context"

import { buildCalendarDays, padDatePart } from "../model/calendar"
import { taskStatus, type ScheduledTaskRecord } from "../model/scheduled-task"
import { statusMessageKey, WEEKDAY_KEYS } from "./scheduled-task-presentation"
import calendarStyles from "./scheduled-task-calendar.module.css"
import styles from "./scheduled-task-surface.module.css"

type ScheduledTaskCalendarViewProps = {
  calendarMonth: Date
  calendarTasks: ReadonlyMap<string, ScheduledTaskRecord[]>
  displayTimezone: string
  openEditor: (
    prompt?: string,
    target?: HTMLElement | null,
    task?: ScheduledTaskRecord | null,
  ) => void
  shiftCalendarMonth: (offset: number) => void
  resetCalendarMonth: () => void
}

export function ScheduledTaskCalendarView({
  calendarMonth,
  calendarTasks,
  displayTimezone,
  openEditor,
  shiftCalendarMonth,
  resetCalendarMonth,
}: ScheduledTaskCalendarViewProps) {
  const { locale } = useLocale()
  const t = useT()
  const calendarDays = useMemo(
    () => buildCalendarDays(calendarMonth, displayTimezone),
    [calendarMonth, displayTimezone],
  )
  const logicalDateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        timeZone: "UTC",
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    [locale],
  )
  const logicalMonthFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        timeZone: "UTC",
        year: "numeric",
        month: "long",
      }),
    [locale],
  )

  return (
    <div
      className={calendarStyles.calendarBoard}
      data-testid="scheduled-calendar-view"
      aria-label={t("scheduled.calendar")}
    >
      <div className={calendarStyles.calendarToolbar}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("scheduled.previousMonth")}
          onClick={() => shiftCalendarMonth(-1)}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <strong
          data-testid="scheduled-calendar-title"
          data-month={`${calendarMonth.getUTCFullYear()}-${padDatePart(calendarMonth.getUTCMonth() + 1)}`}
        >
          {logicalMonthFormat.format(calendarMonth)}
        </strong>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("scheduled.nextMonth")}
          onClick={() => shiftCalendarMonth(1)}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={styles.today}
          onClick={resetCalendarMonth}
        >
          {t("scheduled.today")}
        </Button>
      </div>
      <div
        className={calendarStyles.calendarWeek}
        data-testid="scheduled-calendar-weekdays"
        aria-hidden="true"
      >
        {WEEKDAY_KEYS.map((key) => (
          <span key={key}>{t(key)}</span>
        ))}
      </div>
      <div className={calendarStyles.calendarGrid} role="grid">
        {calendarDays.map((day) => (
          <ScheduledTaskCalendarDay
            key={day.key}
            day={day}
            tasks={calendarTasks.get(day.key) ?? []}
            openEditor={openEditor}
            formatLabel={logicalDateFormat.format}
          />
        ))}
      </div>
    </div>
  )
}

type ScheduledTaskCalendarDayProps = {
  day: ReturnType<typeof buildCalendarDays>[number]
  tasks: readonly ScheduledTaskRecord[]
  openEditor: ScheduledTaskCalendarViewProps["openEditor"]
  formatLabel: (date: Date) => string
}

function ScheduledTaskCalendarDay({
  day,
  tasks,
  openEditor,
  formatLabel,
}: ScheduledTaskCalendarDayProps) {
  const t = useT()
  return (
    <div
      className={calendarStyles.calendarCell}
      data-current-month={day.currentMonth ? "true" : "false"}
      data-today={day.today ? "true" : undefined}
      data-testid={`scheduled-calendar-day-${day.key}`}
      role="gridcell"
      aria-label={formatLabel(day.date)}
    >
      <span className={calendarStyles.calendarDayNumber}>
        {day.date.getUTCDate()}
      </span>
      <div className={calendarStyles.calendarEvents}>
        {tasks.map((task) => {
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
              {status === "failed" ? (
                <small>{t("scheduled.failed")}</small>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
