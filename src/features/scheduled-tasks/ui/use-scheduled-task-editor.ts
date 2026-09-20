"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { ScheduledTaskEditorValue, ScheduledTaskRecord } from "../model/scheduled-task"
import { closeScheduledEditor, openScheduledEditor } from "./scheduled-task-location"
import type { ScheduledTaskRuntime } from "./scheduled-task-mode"
import { saveScheduledTask, scheduledTaskCapabilities } from "./scheduled-task-operations"

type EditorOptions = {
  runtime: ScheduledTaskRuntime
  tasks: readonly ScheduledTaskRecord[]
  editorOpen: boolean
  reload: () => Promise<void>
}

export function useScheduledTaskEditor({ runtime, tasks, editorOpen, reload }: EditorOptions) {
  const [initialPrompt, setInitialPrompt] = useState("")
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const editingTask = editingTaskId === null ? null : tasks.find((task) => task.id === editingTaskId) ?? null

  useEffect(() => {
    if (editorOpen) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL/history is the external dialog store.
    setEditingTaskId(null)
    setInitialPrompt("")
  }, [editorOpen])

  const openEditor = useCallback((prompt = "", target: HTMLElement | null = null, task: ScheduledTaskRecord | null = null) => {
    openerRef.current = target ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    setInitialPrompt(prompt)
    setEditingTaskId(task?.id ?? null)
    openScheduledEditor()
  }, [])

  const handleOpenChange = useCallback((open: boolean) => {
    if (open) return
    setEditingTaskId(null)
    closeScheduledEditor()
  }, [])

  const saveTask = useCallback(async (value: ScheduledTaskEditorValue) => {
    if (editingTaskId !== null && !editingTask) throw new Error("Scheduled task is no longer available")
    await saveScheduledTask(runtime, editingTask, value, reload)
  }, [editingTask, editingTaskId, reload, runtime])

  const capabilities = scheduledTaskCapabilities(runtime)
  return {
    initialPrompt,
    editingTask,
    openerRef,
    openEditor,
    handleOpenChange,
    saveTask,
    canSave: editingTask ? capabilities.canUpdate : capabilities.canCreate,
  }
}
