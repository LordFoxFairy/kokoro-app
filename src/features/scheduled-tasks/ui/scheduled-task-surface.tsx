"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useLocale } from "@/i18n/context"

import { nextPreviewRun, scheduledDateKey, startOfMonth } from "../model/calendar"
import type { ScheduledTaskClient, ScheduledTaskDraft, ScheduledTaskPatch, ScheduledTaskRecord } from "../model/scheduled-task"
import { readPreviewTasks, usePreviewTasks, writePreviewTasks } from "./preview-task-store"
import { ScheduledTaskContent } from "./scheduled-task-content"
import { ScheduledTaskEditorDialog } from "./scheduled-task-editor"
import { EDITOR_HASH, SCHEDULED_LOCATION_EVENT, useScheduledLocation, writeScheduledView } from "./scheduled-task-location"
import type { ScheduledMutation } from "./scheduled-task-presentation"
import styles from "./scheduled-task-surface.module.css"

export type ScheduledTaskSurfaceProps = {
  brandName?: string
  preview?: boolean
  scheduledTaskClient?: ScheduledTaskClient
  onSave?: (task: ScheduledTaskDraft) => Promise<void> | void
  tasks?: readonly ScheduledTaskRecord[]
  onUpdateTask?: (taskId: string, patch: ScheduledTaskPatch) => Promise<void> | void
  onRetryTask?: (taskId: string) => Promise<void> | void
  onDeleteTask?: (taskId: string) => Promise<void> | void
}

function missingScheduledClientError(): Error {
  return new Error("Scheduled task client is not configured")
}

export function ScheduledTaskSurface({
  brandName = "Kokoro",
  preview = false,
  scheduledTaskClient,
  onSave,
  tasks,
  onUpdateTask,
  onRetryTask,
  onDeleteTask,
}: ScheduledTaskSurfaceProps = {}) {
  const { t } = useLocale()
  // Preview is explicit. A live surface with no injected scheduled client
  // stays in an honest loading/error state instead of borrowing the fixture.
  const fixtureMode = preview
  const injectedClient = scheduledTaskClient
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
      autoApprove: draft.autoApprove,
      enabled: true,
      ...(draft.expiresAt === undefined ? {} : { expiresAt: draft.expiresAt }),
    }
    writePreviewTasks([nextTask, ...current])
  }

  const updatePreviewTask = (taskId: string, draft: ScheduledTaskDraft) => {
    const next = readPreviewTasks().map((task) => {
      if (task.id !== taskId) return task
      const updated: ScheduledTaskRecord = {
        ...task,
        title: draft.title,
        prompt: draft.prompt,
        frequency: draft.frequency,
        time: draft.time,
        timezone: draft.timezone,
        nextRun: nextPreviewRun(draft.time, draft.frequency),
        autoApprove: draft.autoApprove,
      }
      if (draft.expiresAt === undefined) delete updated.expiresAt
      else updated.expiresAt = draft.expiresAt
      return updated
    })
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
        const patch: ScheduledTaskPatch = {
          title: draft.title,
          prompt: draft.prompt,
          frequency: draft.frequency,
          time: draft.time,
          timezone: draft.timezone,
          autoApprove: draft.autoApprove,
        }
        if (draft.expiresAt !== undefined) patch.expiresAt = draft.expiresAt
        await update(editingTask.id, patch)
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
    writeScheduledView(next)
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
      <ScheduledTaskContent
        brandName={brandName}
        fixtureMode={fixtureMode}
        controlledTasks={controlledTasks}
        loading={loading}
        loadError={loadError}
        displayedTasks={displayedTasks}
        view={view}
        calendarMonth={calendarMonth}
        calendarTasks={calendarTasks}
        pendingMutation={pendingMutation}
        mutationError={mutationError}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canRetry={canRetry}
        canDelete={canDelete}
        loadTasks={loadTasks}
        openEditor={openEditor}
        switchView={switchView}
        shiftCalendarMonth={shiftCalendarMonth}
        resetCalendarMonth={resetCalendarMonth}
        setDeleteTarget={setDeleteTarget}
        retryTask={retryTask}
        setTaskEnabled={setTaskEnabled}
      />
      <ScheduledTaskEditorDialog
        open={editorOpen}
        onOpenChange={handleOpenChange}
        brandName={brandName}
        initialPrompt={initialPrompt}
        {...((editingTask !== null ? canUpdate : canCreate) ? { onSave: saveTask } : {})}
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
