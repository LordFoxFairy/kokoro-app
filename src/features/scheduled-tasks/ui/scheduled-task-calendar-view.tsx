"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useLocale, useT } from "@/i18n/context"

import { buildCalendarDays, padDatePart, scheduledRunInstant } from "../model/calendar"
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

type CalendarScope = {
  calendarTasks: ScheduledTaskCalendarViewProps["calendarTasks"]
  displayTimezone: string
  monthKey: string
}

type CalendarRun = { task: ScheduledTaskRecord; instant: Date }

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
    () => new Intl.DateTimeFormat(locale, {
      timeZone: "UTC", weekday: "long", year: "numeric", month: "long", day: "numeric",
    }),
    [locale],
  )
  const runTimeFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, {
      timeZone: displayTimezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }),
    [displayTimezone, locale],
  )
  const monthKey = `${calendarMonth.getUTCFullYear()}-${padDatePart(calendarMonth.getUTCMonth() + 1)}`
  const scope = useMemo(
    () => ({ calendarTasks, displayTimezone, monthKey }),
    [calendarTasks, displayTimezone, monthKey],
  )

  return (
    <div className={calendarStyles.calendarBoard} data-testid="scheduled-calendar-view" aria-label={t("scheduled.calendar")}>
      <ScheduledTaskCalendarToolbar
        calendarMonth={calendarMonth}
        monthKey={monthKey}
        shiftCalendarMonth={shiftCalendarMonth}
        resetCalendarMonth={resetCalendarMonth}
      />
      <div className={calendarStyles.calendarWeek} data-testid="scheduled-calendar-weekdays" aria-hidden="true">
        {WEEKDAY_KEYS.map((key) => <span key={key}>{t(key)}</span>)}
      </div>
      <div className={calendarStyles.calendarGrid} role="grid">
        {calendarDays.map((day) => (
          <ScheduledTaskCalendarDay
            key={day.key}
            day={day}
            tasks={calendarTasks.get(day.key) ?? []}
            scope={scope}
            openEditor={openEditor}
            formatLabel={logicalDateFormat.format}
            formatTime={runTimeFormat.format}
          />
        ))}
      </div>
    </div>
  )
}

function ScheduledTaskCalendarToolbar({
  calendarMonth, monthKey, shiftCalendarMonth, resetCalendarMonth,
}: Pick<ScheduledTaskCalendarViewProps, "calendarMonth" | "shiftCalendarMonth" | "resetCalendarMonth"> & { monthKey: string }) {
  const { locale } = useLocale()
  const t = useT()
  const label = new Intl.DateTimeFormat(locale, { timeZone: "UTC", year: "numeric", month: "long" }).format(calendarMonth)
  return (
    <div className={calendarStyles.calendarToolbar}>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={t("scheduled.previousMonth")} onClick={() => shiftCalendarMonth(-1)}>
        <ChevronLeft aria-hidden="true" />
      </Button>
      <strong data-testid="scheduled-calendar-title" data-month={monthKey}>{label}</strong>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={t("scheduled.nextMonth")} onClick={() => shiftCalendarMonth(1)}>
        <ChevronRight aria-hidden="true" />
      </Button>
      <Button type="button" variant="outline" size="sm" className={styles.today} onClick={resetCalendarMonth}>
        {t("scheduled.today")}
      </Button>
    </div>
  )
}

type ScheduledTaskCalendarDayProps = {
  day: ReturnType<typeof buildCalendarDays>[number]
  tasks: readonly ScheduledTaskRecord[]
  scope: CalendarScope
  openEditor: ScheduledTaskCalendarViewProps["openEditor"]
  formatLabel: (date: Date) => string
  formatTime: (date: Date) => string
}

function ScheduledTaskCalendarDay({ day, tasks, scope, openEditor, formatLabel, formatTime }: ScheduledTaskCalendarDayProps) {
  const t = useT()
  const titleId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const currentScope = useRef<CalendarScope | null>(null)
  const focusScope = useRef<CalendarScope | null>(null)
  const returnFocus = useRef(false)
  const editing = useRef(false)
  const [openedFor, setOpenedFor] = useState<CalendarScope | null>(null)
  const runs = useMemo(() => tasks.flatMap((task) => {
    const instant = scheduledRunInstant(task.nextRun)
    return instant ? [{ task, instant }] : []
  }).sort((a, b) => a.instant.getTime() - b.instant.getTime()), [tasks])
  const open = openedFor === scope && runs.length > 3
  useLayoutEffect(() => {
    currentScope.current = scope
    return () => { currentScope.current = null }
  }, [scope])
  const entry = ({ task, instant }: CalendarRun, overflow: boolean) => {
    return (
      <ScheduledTaskCalendarEntry
        key={task.id}
        task={task}
        instant={instant.toISOString()}
        time={`${formatTime(instant)} (${scope.displayTimezone})`}
        expanded={overflow}
        onClick={(target) => {
          if (overflow) {
            editing.current = true
            setOpenedFor(null)
          }
          openEditor("", overflow ? trigger.current : target, task)
        }}
      />
    )
  }
  return (
    <div className={calendarStyles.calendarCell} data-current-month={day.currentMonth ? "true" : "false"}
      data-today={day.today ? "true" : undefined} data-testid={`scheduled-calendar-day-${day.key}`}
      role="gridcell" aria-label={formatLabel(day.date)}>
      <span className={calendarStyles.calendarDayNumber}>{day.date.getUTCDate()}</span>
      <div className={calendarStyles.calendarEvents}>
        {runs.slice(0, 3).map((task) => entry(task, false))}
        {runs.length > 3 ? (
          <Popover open={open} onOpenChange={(next) => {
            editing.current = false
            if (next) {
              focusScope.current = scope
              returnFocus.current = true
            }
            setOpenedFor(next ? scope : null)
          }}>
            <PopoverTrigger asChild>
              <button ref={trigger} type="button" className={calendarStyles.calendarMore}>
                {t("scheduled.calendarMoreTasks", { count: runs.length - 3 })}
              </button>
            </PopoverTrigger>
            <PopoverContent className={calendarStyles.calendarPopover} align="start" collisionPadding={16}
              onInteractOutside={() => { returnFocus.current = false }}
              aria-labelledby={titleId} onCloseAutoFocus={(event) => {
                event.preventDefault()
                if (!editing.current && returnFocus.current && currentScope.current === focusScope.current && trigger.current?.isConnected) trigger.current.focus()
              }}>
              <h3 id={titleId}>{formatLabel(day.date)}</h3>
              <div className={calendarStyles.calendarPopoverEntries}>{runs.map((task) => entry(task, true))}</div>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
    </div>
  )
}

function ScheduledTaskCalendarEntry({ task, instant, time, expanded, onClick }: {
  task: ScheduledTaskRecord
  instant: string
  time: string
  expanded: boolean
  onClick: (target: HTMLButtonElement) => void
}) {
  const t = useT()
  const status = task.schedulingState ?? taskStatus(task)
  const statusLabel = t(statusMessageKey(status))
  return (
    <button type="button" className={calendarStyles.calendarTask} data-status={status} data-expanded={expanded || undefined}
      onClick={(event) => onClick(event.currentTarget)} aria-label={`${task.title} · ${time} · ${statusLabel}`}>
      <span>{task.title}</span>
      <time dateTime={instant}>{time}</time>
      <small>{statusLabel}</small>
    </button>
  )
}
