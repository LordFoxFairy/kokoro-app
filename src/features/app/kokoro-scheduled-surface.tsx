"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Ellipsis, ListChecks, Plus, Route, ScanSearch } from "lucide-react"

import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLocale, useT } from "@/i18n/context"
import { formatDeliveryTime } from "@/ui/canvas/canvas-panel"

import { ScheduledTaskEditorDialog, type ScheduledTaskDraft } from "./scheduled-task-editor"
import type { ScheduledTaskClient, ScheduledTaskPatch, ScheduledTaskRecord } from "./scheduled-task-client"
import styles from "./kokoro-scheduled-surface.module.css"

export type { ScheduledTaskClient, ScheduledTaskPatch, ScheduledTaskRecord } from "./scheduled-task-client"

const SUGGESTIONS = [
  { key: "scheduled.monitor", icon: ScanSearch },
  { key: "scheduled.dailyDigest", icon: ListChecks },
  { key: "scheduled.pipeline", icon: Route },
] as const

const WEEKDAY_KEYS = [
  "scheduled.sunday",
  "scheduled.monday",
  "scheduled.tuesday",
  "scheduled.wednesday",
  "scheduled.thursday",
  "scheduled.friday",
  "scheduled.saturday",
] as const

type KokoroScheduledSurfaceProps = Pick<EmptyStateProps, "brandName"> & {
  preview?: boolean
  /**
   * The existing Hub/HTTP adapter is injected here once its canonical
   * scheduled-task methods are available. This surface deliberately does not
   * create a second fetch client or guess a BFF route.
   */
  client?: ScheduledTaskClient
  /** AppFrame injection name; `client` remains as a local/test compatibility seam. */
  scheduledTaskClient?: ScheduledTaskClient
  onSave?: (task: ScheduledTaskDraft) => Promise<void> | void
  tasks?: readonly ScheduledTaskRecord[]
  onUpdateTask?: (taskId: string, patch: ScheduledTaskPatch) => Promise<void> | void
  onRetryTask?: (taskId: string) => Promise<void> | void
  onDeleteTask?: (taskId: string) => Promise<void> | void
}

function statusMessageKey(status: "active" | "paused" | "failed"): "scheduled.active" | "scheduled.paused" | "scheduled.failed" {
  return status === "active" ? "scheduled.active" : status === "paused" ? "scheduled.paused" : "scheduled.failed"
}

const EDITOR_HASH = "#scheduled-tasks/new"
const PREVIEW_TASKS_KEY = "kokoro.preview.scheduled-tasks"
const PREVIEW_TASKS_EVENT = "kokoro:scheduled-preview-tasks"
type ScheduledView = "calendar" | "list"
type ScheduledLocationState = { view: ScheduledView; editorOpen: boolean }
const DEFAULT_SCHEDULED_LOCATION_STATE: ScheduledLocationState = { view: "calendar", editorOpen: false }
const DEFAULT_SCHEDULED_LOCATION_SNAPSHOT = JSON.stringify(DEFAULT_SCHEDULED_LOCATION_STATE)
const SCHEDULED_LOCATION_EVENT = "kokoro:scheduled-location"

function readScheduledView(): ScheduledView {
  if (typeof window === "undefined") return "calendar"
  return new URLSearchParams(window.location.search).get("tab") === "list" ? "list" : "calendar"
}

function readScheduledLocationState(): ScheduledLocationState {
  if (typeof window === "undefined") return DEFAULT_SCHEDULED_LOCATION_STATE
  return {
    view: readScheduledView(),
    editorOpen: window.location.hash === EDITOR_HASH,
  }
}

function readScheduledLocationSnapshot(): string {
  return typeof window === "undefined"
    ? DEFAULT_SCHEDULED_LOCATION_SNAPSHOT
    : JSON.stringify(readScheduledLocationState())
}

function subscribeScheduledLocation(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  const events = ["hashchange", "popstate", "kokoro:surface-navigation", SCHEDULED_LOCATION_EVENT] as const
  for (const event of events) window.addEventListener(event, onStoreChange)
  return () => {
    for (const event of events) window.removeEventListener(event, onStoreChange)
  }
}

function useScheduledLocation(): ScheduledLocationState {
  const snapshot = useSyncExternalStore(
    subscribeScheduledLocation,
    readScheduledLocationSnapshot,
    () => DEFAULT_SCHEDULED_LOCATION_SNAPSHOT,
  )
  return useMemo(() => JSON.parse(snapshot) as ScheduledLocationState, [snapshot])
}

function writeScheduledView(view: ScheduledView): void {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  url.searchParams.set("tab", view)
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
  window.dispatchEvent(new Event(SCHEDULED_LOCATION_EVENT))
}

function taskStatus(task: ScheduledTaskRecord): "active" | "paused" | "failed" {
  if (task.status) return task.status
  return task.enabled === false ? "paused" : "active"
}

function readPreviewTasks(): ScheduledTaskRecord[] {
  if (typeof window === "undefined") return []
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(PREVIEW_TASKS_KEY) ?? "null")
    if (!Array.isArray(value)) return []
    return value.filter((candidate): candidate is ScheduledTaskRecord => {
      if (!candidate || typeof candidate !== "object") return false
      const task = candidate as Partial<ScheduledTaskRecord>
      return typeof task.id === "string"
        && typeof task.title === "string"
        && (task.frequency === "daily" || task.frequency === "weekly")
        && typeof task.time === "string"
    })
  } catch {
    return []
  }
}

function readPreviewTasksSnapshot(): string {
  return typeof window === "undefined" ? "[]" : JSON.stringify(readPreviewTasks())
}

function subscribePreviewTasks(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener("storage", onStoreChange)
  window.addEventListener(PREVIEW_TASKS_EVENT, onStoreChange)
  return () => {
    window.removeEventListener("storage", onStoreChange)
    window.removeEventListener(PREVIEW_TASKS_EVENT, onStoreChange)
  }
}

function usePreviewTasks(): ScheduledTaskRecord[] {
  const snapshot = useSyncExternalStore(subscribePreviewTasks, readPreviewTasksSnapshot, () => "[]")
  return useMemo(() => JSON.parse(snapshot) as ScheduledTaskRecord[], [snapshot])
}

function writePreviewTasks(tasks: readonly ScheduledTaskRecord[]): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(PREVIEW_TASKS_KEY, JSON.stringify(tasks))
  window.dispatchEvent(new Event(PREVIEW_TASKS_EVENT))
}

function missingScheduledClientError(): Error {
  return new Error("Scheduled task client is not configured")
}

function padDatePart(value: number): string {
  return String(value).padStart(2, "0")
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function scheduledDateKey(nextRun: string | undefined): string | null {
  if (!nextRun) return null
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(nextRun)
  if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`
  const parsed = new Date(nextRun)
  return Number.isNaN(parsed.getTime()) ? null : dateKey(parsed)
}

function nextPreviewRun(time: string, frequency: ScheduledTaskDraft["frequency"]): string {
  const now = new Date()
  const next = new Date(now)
  const [hours, minutes] = time.split(":").map(Number)
  next.setHours(Number.isFinite(hours) ? hours : 8, Number.isFinite(minutes) ? minutes : 0, 0, 0)
  if (frequency === "weekly" || next <= now) next.setDate(next.getDate() + (frequency === "weekly" ? 7 : 1))
  return next.toISOString()
}

type ScheduledMutation = {
  taskId: string
  operation: "update" | "retry" | "delete"
}

function mutationMessageKey(operation: ScheduledMutation["operation"]): "scheduled.updating" | "scheduled.deleting" {
  return operation === "delete" ? "scheduled.deleting" : "scheduled.updating"
}

function buildCalendarDays(month: Date): readonly { date: Date; key: string; currentMonth: boolean; today: boolean }[] {
  const firstOfMonth = startOfMonth(month)
  const firstCell = new Date(firstOfMonth)
  firstCell.setDate(firstCell.getDate() - firstOfMonth.getDay())
  const todayKey = dateKey(new Date())

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCell)
    date.setDate(firstCell.getDate() + index)
    return {
      date,
      key: dateKey(date),
      currentMonth: date.getFullYear() === firstOfMonth.getFullYear() && date.getMonth() === firstOfMonth.getMonth(),
      today: dateKey(date) === todayKey,
    }
  })
}

export function KokoroScheduledSurface({
  brandName = "Kokoro",
  preview = false,
  client,
  scheduledTaskClient,
  onSave,
  tasks,
  onUpdateTask,
  onRetryTask,
  onDeleteTask,
}: KokoroScheduledSurfaceProps = {}) {
  const { locale } = useLocale()
  const t = useT()
  // Preview is explicit. A live surface with no injected scheduled client
  // stays in an honest loading/error state instead of borrowing the fixture.
  const fixtureMode = preview
  const injectedClient = scheduledTaskClient ?? client
  const controlledTasks = tasks !== undefined
  const previewTasks = usePreviewTasks()
  const [remoteTasks, setRemoteTasks] = useState<ScheduledTaskRecord[]>([])
  const [loading, setLoading] = useState(!fixtureMode && !controlledTasks)
  const [loadError, setLoadError] = useState(false)
  const { view, editorOpen } = useScheduledLocation()
  const [initialPrompt, setInitialPrompt] = useState("")
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()))
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ScheduledTaskRecord | null>(null)
  const [pendingMutation, setPendingMutation] = useState<ScheduledMutation | null>(null)
  const [mutationError, setMutationError] = useState<ScheduledMutation | null>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const taskIdRef = useRef(0)
  const requestSeqRef = useRef(0)
  const loadTasks = useCallback(async () => {
    if (fixtureMode || controlledTasks) return
    const requestSeq = ++requestSeqRef.current
    // Yield before changing local state so the initial effect only starts an
    // external request; this also gives an immediately unmounted surface a
    // chance to invalidate the sequence without a cascading render.
    await Promise.resolve()
    if (requestSeq !== requestSeqRef.current) return
    setLoading(true)
    setLoadError(false)
    try {
      if (!injectedClient) throw missingScheduledClientError()
      const next = await injectedClient.listScheduledTasks()
      if (requestSeq !== requestSeqRef.current) return
      setRemoteTasks([...next])
    } catch {
      if (requestSeq !== requestSeqRef.current) return
      setLoadError(true)
    } finally {
      if (requestSeq === requestSeqRef.current) setLoading(false)
    }
  }, [controlledTasks, fixtureMode, injectedClient])
  const displayedTasks = useMemo(() => tasks ?? (fixtureMode ? previewTasks : remoteTasks), [fixtureMode, previewTasks, remoteTasks, tasks])
  const editingTask = editingTaskId === null ? null : displayedTasks.find((task) => task.id === editingTaskId) ?? null
  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth])
  const calendarTasks = useMemo(() => {
    const grouped = new Map<string, ScheduledTaskRecord[]>()
    for (const task of displayedTasks) {
      const key = scheduledDateKey(task.nextRun)
      if (!key) continue
      const tasksForDay = grouped.get(key) ?? []
      tasksForDay.push(task)
      grouped.set(key, tasksForDay)
    }
    return grouped
  }, [displayedTasks])

  useEffect(() => {
    if (fixtureMode || controlledTasks) {
      requestSeqRef.current += 1
      return
    }
    queueMicrotask(() => {
      void loadTasks()
    })
    return () => {
      requestSeqRef.current += 1
    }
  }, [controlledTasks, fixtureMode, loadTasks])

  useEffect(() => {
    if (!editorOpen) {
      // Back/forward and a direct hash edit bypass Dialog's onOpenChange.
      // Clear the edit target on those paths too, otherwise reopening the
      // editor from history can resurrect a previously edited task.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reconcile the local dialog payload with the external URL/hash store.
      setEditingTaskId(null)
      setInitialPrompt("")
    }
  }, [editorOpen])

  const canCreate = fixtureMode
    ? !controlledTasks || onSave !== undefined
    : onSave !== undefined || injectedClient?.createScheduledTask !== undefined
  const canUpdate = fixtureMode
    ? !controlledTasks || onUpdateTask !== undefined
    : onUpdateTask !== undefined || injectedClient?.updateScheduledTask !== undefined
  const canRetry = fixtureMode
    ? !controlledTasks || onRetryTask !== undefined || onUpdateTask !== undefined
    : onRetryTask !== undefined || injectedClient?.retryScheduledTask !== undefined || onUpdateTask !== undefined || injectedClient?.updateScheduledTask !== undefined
  const canDelete = fixtureMode
    ? !controlledTasks || onDeleteTask !== undefined
    : onDeleteTask !== undefined || injectedClient?.deleteScheduledTask !== undefined

  const addPreviewTask = (draft: ScheduledTaskDraft) => {
    const current = readPreviewTasks()
    let sequence = taskIdRef.current
    do {
      sequence += 1
    } while (current.some((task) => task.id === `scheduled_preview_${sequence}`))
    taskIdRef.current = sequence
    const nextTask: ScheduledTaskRecord = {
      id: `scheduled_preview_${sequence}`,
      title: draft.title,
      prompt: draft.prompt,
      frequency: draft.frequency === "weekly" ? "weekly" : "daily",
      time: draft.time,
      timezone: draft.timezone,
      nextRun: nextPreviewRun(draft.time, draft.frequency),
      expiresAt: draft.expiresAt,
      autoApprove: draft.autoApprove,
      enabled: true,
    }
    writePreviewTasks([nextTask, ...current])
  }

  const updatePreviewTask = (taskId: string, draft: ScheduledTaskDraft) => {
    const next = readPreviewTasks().map((task) => task.id === taskId
      ? { ...task, title: draft.title, prompt: draft.prompt, frequency: draft.frequency, time: draft.time, timezone: draft.timezone, nextRun: nextPreviewRun(draft.time, draft.frequency), expiresAt: draft.expiresAt, autoApprove: draft.autoApprove }
      : task)
    writePreviewTasks(next)
  }

  const setPreviewTaskStatus = (taskId: string, status: "active" | "paused") => {
    const next = readPreviewTasks().map((candidate) => candidate.id === taskId ? { ...candidate, enabled: status === "active", status } : candidate)
    writePreviewTasks(next)
  }

  const removePreviewTask = (taskId: string) => {
    writePreviewTasks(readPreviewTasks().filter((task) => task.id !== taskId))
  }

  const openEditor = (prompt = "", target: HTMLElement | null = null, task: ScheduledTaskRecord | null = null) => {
    openerRef.current = target ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    setInitialPrompt(prompt)
    setEditingTaskId(task?.id ?? null)
    if (window.location.hash !== EDITOR_HASH) {
      window.history.pushState({ scheduledEditor: true }, "", `${window.location.pathname}${window.location.search}${EDITOR_HASH}`)
    }
    window.dispatchEvent(new Event(SCHEDULED_LOCATION_EVENT))
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) setEditingTaskId(null)
    if (!open && window.location.hash === EDITOR_HASH) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)
    }
    if (!open) window.dispatchEvent(new Event(SCHEDULED_LOCATION_EVENT))
  }

  const saveTask = async (draft: ScheduledTaskDraft) => {
    if (editingTaskId !== null) {
      if (editingTask === null) throw new Error("Scheduled task is no longer available")
      const update = onUpdateTask ?? (!fixtureMode ? injectedClient?.updateScheduledTask : undefined)
      if (update) {
        await update(editingTask.id, {
          title: draft.title,
          prompt: draft.prompt,
          frequency: draft.frequency,
          time: draft.time,
          timezone: draft.timezone,
          expiresAt: draft.expiresAt,
          autoApprove: draft.autoApprove,
        })
        if (fixtureMode && !controlledTasks) updatePreviewTask(editingTask.id, draft)
        else if (!fixtureMode && !controlledTasks && injectedClient) await loadTasks()
      } else if (fixtureMode && !controlledTasks) {
        updatePreviewTask(editingTask.id, draft)
      } else {
        throw missingScheduledClientError()
      }
      return
    }
    const create = onSave ?? (!fixtureMode ? injectedClient?.createScheduledTask : undefined)
    if (create) {
      await create(draft)
      if (fixtureMode && !controlledTasks) addPreviewTask(draft)
      else if (!fixtureMode && !controlledTasks && injectedClient) await loadTasks()
      return
    }
    if (!fixtureMode) {
      throw missingScheduledClientError()
    }
    if (controlledTasks) {
      throw new Error("Controlled scheduled task creation is not configured")
    }
    addPreviewTask(draft)
  }

  const setTaskEnabled = async (task: ScheduledTaskRecord, enabled: boolean) => {
    const operation: ScheduledMutation = { taskId: task.id, operation: "update" }
    setPendingMutation(operation)
    setMutationError(null)
    try {
      const update = onUpdateTask ?? (!fixtureMode ? injectedClient?.updateScheduledTask : undefined)
      if (update) {
        await update(task.id, { enabled, status: enabled ? "active" : "paused" })
        if (fixtureMode && !controlledTasks) setPreviewTaskStatus(task.id, enabled ? "active" : "paused")
        else if (!fixtureMode && !controlledTasks && injectedClient) await loadTasks()
      } else if (fixtureMode && !controlledTasks) {
        setPreviewTaskStatus(task.id, enabled ? "active" : "paused")
      } else {
        throw missingScheduledClientError()
      }
    } catch {
      setMutationError(operation)
    } finally {
      setPendingMutation(null)
    }
  }

  const retryTask = async (task: ScheduledTaskRecord) => {
    const operation: ScheduledMutation = { taskId: task.id, operation: "retry" }
    setPendingMutation(operation)
    setMutationError(null)
    try {
      const retry = onRetryTask ?? (!fixtureMode ? injectedClient?.retryScheduledTask : undefined)
      const update = onUpdateTask ?? (!fixtureMode ? injectedClient?.updateScheduledTask : undefined)
      if (retry) {
        await retry(task.id)
        if (fixtureMode && !controlledTasks) setPreviewTaskStatus(task.id, "active")
        else if (!fixtureMode && !controlledTasks && injectedClient) await loadTasks()
      } else if (update) {
        await update(task.id, { enabled: true, status: "active" })
        if (fixtureMode && !controlledTasks) setPreviewTaskStatus(task.id, "active")
        else if (!fixtureMode && !controlledTasks && injectedClient) await loadTasks()
      } else if (fixtureMode && !controlledTasks) {
        setPreviewTaskStatus(task.id, "active")
      } else {
        throw missingScheduledClientError()
      }
    } catch {
      setMutationError(operation)
    } finally {
      setPendingMutation(null)
    }
  }

  const removeTask = async () => {
    if (!deleteTarget) return
    const id = deleteTarget.id
    const operation: ScheduledMutation = { taskId: id, operation: "delete" }
    setPendingMutation(operation)
    setMutationError(null)
    try {
      const remove = onDeleteTask ?? (!fixtureMode ? injectedClient?.deleteScheduledTask : undefined)
      if (remove) {
        await remove(id)
        if (fixtureMode && !controlledTasks) removePreviewTask(id)
        else if (!fixtureMode && !controlledTasks && injectedClient) await loadTasks()
      } else if (fixtureMode && !controlledTasks) {
        removePreviewTask(id)
      } else {
        throw missingScheduledClientError()
      }
      setDeleteTarget(null)
    } catch {
      setMutationError(operation)
    } finally {
      setPendingMutation(null)
    }
  }

  const switchView = (next: string) => {
    if (next !== "calendar" && next !== "list") return
    const nextView = next as ScheduledView
    writeScheduledView(nextView)
  }

  const shiftCalendarMonth = (offset: number) => {
    setCalendarMonth((current) => {
      const next = new Date(current)
      next.setMonth(next.getMonth() + offset)
      return startOfMonth(next)
    })
  }

  const resetCalendarMonth = () => setCalendarMonth(startOfMonth(new Date()))

  return (
    <div className={styles.surface} data-testid="scheduled-surface">
      <header className={styles.header}>
        <h1>{t("rail.navScheduled")}</h1>
      </header>
      <main className={styles.main}>
        {!fixtureMode && !controlledTasks && loading && displayedTasks.length === 0 ? (
          <section className={styles.content} data-testid="scheduled-loading" aria-busy="true" aria-label={t("firstSite.tasksLoading")}>
            <div className={styles.loadingCalendar} aria-hidden="true"><div className={styles.calendarLines}>{Array.from({ length: 28 }, (_, index) => <i key={index} data-active={index === 11 ? "true" : undefined} />)}</div></div>
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
            <div className={styles.calendar} role="img" aria-label={t("scheduled.calendar")}>
              <div className={styles.calendarLines} aria-hidden="true">
                {Array.from({ length: 28 }, (_, index) => <i key={index} data-active={index === 11 ? "true" : undefined} />)}
              </div>
              <span className={styles.calendarAdd} aria-hidden="true"><Plus /></span>
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
              <div className={styles.calendarBoard} data-testid="scheduled-calendar-view" aria-label={t("scheduled.calendar")}>
                <div className={styles.calendarToolbar}>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t("scheduled.previousMonth")} onClick={() => shiftCalendarMonth(-1)}><ChevronLeft aria-hidden="true" /></Button>
                  <strong data-testid="scheduled-calendar-title" data-month={`${calendarMonth.getFullYear()}-${padDatePart(calendarMonth.getMonth() + 1)}`}>
                    {new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(calendarMonth)}
                  </strong>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t("scheduled.nextMonth")} onClick={() => shiftCalendarMonth(1)}><ChevronRight aria-hidden="true" /></Button>
                  <Button type="button" variant="outline" size="sm" className={styles.today} onClick={resetCalendarMonth}>{t("scheduled.today")}</Button>
                </div>
                <div className={styles.calendarWeek} data-testid="scheduled-calendar-weekdays" aria-hidden="true">{WEEKDAY_KEYS.map((key) => <span key={key}>{t(key)}</span>)}</div>
                <div className={styles.calendarGrid} role="grid">
                  {calendarDays.map((day) => {
                    const dayTasks = calendarTasks.get(day.key) ?? []
                    return (
                      <div
                        key={day.key}
                        className={styles.calendarCell}
                        data-current-month={day.currentMonth ? "true" : "false"}
                        data-today={day.today ? "true" : undefined}
                        data-testid={`scheduled-calendar-day-${day.key}`}
                        role="gridcell"
                        aria-label={new Intl.DateTimeFormat(locale, { weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(day.date)}
                      >
                        <span className={styles.calendarDayNumber}>{day.date.getDate()}</span>
                        <div className={styles.calendarEvents}>
                          {dayTasks.map((task) => {
                            const status = taskStatus(task)
                            return (
                              <button
                                key={task.id}
                                type="button"
                                className={styles.calendarTask}
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
      </main>
      <ScheduledTaskEditorDialog
        open={editorOpen}
        onOpenChange={handleOpenChange}
        brandName={brandName}
        initialPrompt={initialPrompt}
        onSave={editingTask !== null ? (canUpdate ? saveTask : undefined) : (canCreate ? saveTask : undefined)}
        initialTask={editingTask}
        returnFocusRef={openerRef}
      />
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("scheduled.deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>{deleteTarget?.title}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("firstSite.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pendingMutation?.operation === "delete"}
              aria-busy={pendingMutation?.operation === "delete" || undefined}
              onClick={(event) => {
                event.preventDefault()
                void removeTask()
              }}
            >
              {pendingMutation?.operation === "delete" ? t("scheduled.deleting") : t("scheduled.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
