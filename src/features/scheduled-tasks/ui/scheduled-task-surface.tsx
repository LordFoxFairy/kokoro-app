"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { useLocale } from "@/i18n/context"

import { scheduledDateKey, startOfMonth } from "../model/calendar"
import type { ScheduledTaskDraft, ScheduledTaskPatch, ScheduledTaskRecord } from "../model/scheduled-task"
import {
  insertPreviewTask,
  readPreviewTasks,
  removePreviewTask,
  replacePreviewTask,
  setPreviewTaskStatus,
} from "./preview-task-store"
import { ScheduledTaskContent } from "./scheduled-task-content"
import { ScheduledTaskDialogs } from "./scheduled-task-dialogs"
import { EDITOR_HASH, SCHEDULED_LOCATION_EVENT, useScheduledLocation, writeScheduledView } from "./scheduled-task-location"
import type { ScheduledMutation } from "./scheduled-task-presentation"
import type { ScheduledTaskSurfaceProps } from "./scheduled-task-surface.types"
import { useScheduledTaskSource } from "./use-scheduled-task-source"
import styles from "./scheduled-task-surface.module.css"

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
  const { displayedTasks, loading, loadError, loadTasks } = useScheduledTaskSource({
    fixtureMode,
    ...(tasks === undefined ? {} : { controlledTasks: tasks }),
    ...(injectedClient === undefined ? {} : { client: injectedClient }),
  })
  const { view, editorOpen } = useScheduledLocation()
  const [initialPrompt, setInitialPrompt] = useState("")
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()))
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ScheduledTaskRecord | null>(null)
  const [pendingMutation, setPendingMutation] = useState<ScheduledMutation | null>(null)
  const [mutationError, setMutationError] = useState<ScheduledMutation | null>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const taskIdRef = useRef(0)
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
    insertPreviewTask(`scheduled_preview_${sequence}`, draft)
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
        if (fixtureMode && !controlledTasks) replacePreviewTask(editingTask.id, draft)
        else if (!fixtureMode && !controlledTasks && injectedClient) await loadTasks()
      } else if (fixtureMode && !controlledTasks) {
        replacePreviewTask(editingTask.id, draft)
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
      <ScheduledTaskDialogs
        brandName={brandName}
        editorOpen={editorOpen}
        onEditorOpenChange={handleOpenChange}
        initialPrompt={initialPrompt}
        editingTask={editingTask}
        canSave={editingTask !== null ? canUpdate : canCreate}
        onSave={saveTask}
        returnFocusRef={openerRef}
        deleteTarget={deleteTarget}
        setDeleteTarget={setDeleteTarget}
        deleting={pendingMutation?.operation === "delete"}
        onDelete={removeTask}
      />
    </div>
  )
}
