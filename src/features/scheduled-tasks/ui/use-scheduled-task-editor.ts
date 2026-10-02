"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { ScheduledTaskEditorValue, ScheduledTaskRecord } from "../model/scheduled-task"
import {
  closeScheduledEditor,
  openScheduledEditor,
  scheduledTaskCreationContextKey,
  scheduledTaskEditorInstanceKey,
  type ScheduledTaskCreationContext,
} from "./scheduled-task-location"
import type { ScheduledTaskRuntime } from "./scheduled-task-mode"
import { saveScheduledTask, scheduledTaskCapabilities } from "./scheduled-task-operations"

type EditorOptions = {
  runtime: ScheduledTaskRuntime
  tasks: readonly ScheduledTaskRecord[]
  editorOpen: boolean
  creationContext: ScheduledTaskCreationContext
  reload: () => Promise<void>
}

export function useScheduledTaskEditor({ runtime, tasks, editorOpen, creationContext, reload }: EditorOptions) {
  const [initialPrompt, setInitialPrompt] = useState("")
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const editorGeneration = useRef(0)
  const mounted = useRef(false)
  const contextKey = scheduledTaskCreationContextKey(creationContext)
  const currentContextKey = useRef(contextKey)
  const currentEditorOpen = useRef(editorOpen)
  const editingTask = editingTaskId === null ? null : tasks.find((task) => task.id === editingTaskId) ?? null

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      editorGeneration.current += 1
    }
  }, [])

  useEffect(() => {
    currentContextKey.current = contextKey
    currentEditorOpen.current = editorOpen
  }, [contextKey, editorOpen])

  useEffect(() => {
    if (editorOpen) return
    editorGeneration.current += 1
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL/history is the external dialog store.
    setEditingTaskId(null)
    setInitialPrompt("")
  }, [editorOpen])

  useEffect(() => {
    editorGeneration.current += 1
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL project context owns the editor instance.
    setEditingTaskId(null)
    setInitialPrompt("")
    openerRef.current = null
  }, [contextKey])

  const openEditor = useCallback((prompt = "", target: HTMLElement | null = null, task: ScheduledTaskRecord | null = null) => {
    editorGeneration.current += 1
    openerRef.current = target ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    setInitialPrompt(prompt)
    setEditingTaskId(task?.id ?? null)
    openScheduledEditor()
  }, [])

  const handleOpenChange = useCallback((open: boolean) => {
    if (open) return
    editorGeneration.current += 1
    setEditingTaskId(null)
    closeScheduledEditor()
  }, [])

  const saveTask = useCallback(async (value: ScheduledTaskEditorValue) => {
    if (creationContext.kind === "invalid") throw new Error("Invalid scheduled task project context")
    if (editingTaskId !== null && !editingTask) throw new Error("Scheduled task is no longer available")
    const generation = editorGeneration.current
    const projectId = editingTask === null && creationContext.kind === "project"
      ? creationContext.projectId
      : undefined
    await saveScheduledTask(runtime, editingTask, value, reload, projectId, () => (
      mounted.current
      && editorGeneration.current === generation
      && currentContextKey.current === contextKey
      && currentEditorOpen.current
    ))
  }, [contextKey, creationContext, editingTask, editingTaskId, reload, runtime])

  const capabilities = scheduledTaskCapabilities(runtime)
  return {
    initialPrompt,
    editingTask,
    openerRef,
    openEditor,
    handleOpenChange,
    saveTask,
    editorInstanceKey: scheduledTaskEditorInstanceKey(creationContext, editingTaskId),
    canSave: editingTask ? capabilities.canUpdate : capabilities.canCreate,
  }
}
