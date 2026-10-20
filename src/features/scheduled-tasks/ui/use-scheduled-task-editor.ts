"use client"

import { useCallback, useState } from "react"

import { useScheduledEditorLifecycle } from "./use-scheduled-editor-lifecycle"

import { pendingScheduledTaskCreate } from "../api/scheduled-task-client"

import type {
  ScheduledTaskEditorValue,
  ScheduledTaskRecord,
} from "../model/scheduled-task"
import {
  closeScheduledEditor,
  openScheduledEditor,
  scheduledTaskCreationContextKey,
  scheduledTaskEditorInstanceKey,
  type ScheduledTaskCreationContext,
} from "./scheduled-task-location"
import type { ScheduledTaskRuntime } from "./scheduled-task-mode"
import {
  saveScheduledTask,
  scheduledTaskCapabilities,
} from "./scheduled-task-operations"

type EditorOptions = {
  runtime: ScheduledTaskRuntime
  tasks: readonly ScheduledTaskRecord[]
  editorOpen: boolean
  creationContext: ScheduledTaskCreationContext
  reload: () => Promise<void>
}

export function useScheduledTaskEditor({
  runtime,
  tasks,
  editorOpen,
  creationContext,
  reload,
}: EditorOptions) {
  const [initialPrompt, setInitialPrompt] = useState("")
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const contextKey = scheduledTaskCreationContextKey(creationContext)
  const { openerRef, editorGenerationRef, mountedRef, currentContextKeyRef, currentEditorOpenRef } =
    useScheduledEditorLifecycle(contextKey, editorOpen, setEditingTaskId, setInitialPrompt)
  const editingTask =
    editingTaskId === null
      ? null
      : (tasks.find((task) => task.id === editingTaskId) ?? null)

  const openEditor = useCallback(
    (
      prompt = "",
      target: HTMLElement | null = null,
      task: ScheduledTaskRecord | null = null,
    ) => {
      editorGenerationRef.current += 1
      openerRef.current =
        target ??
        (document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null)
      setInitialPrompt(prompt)
      setEditingTaskId(task?.id ?? null)
      openScheduledEditor()
    },
    [editorGenerationRef, openerRef],
  )

  const handleOpenChange = useCallback((open: boolean) => {
    if (open) return
    editorGenerationRef.current += 1
    setEditingTaskId(null)
    closeScheduledEditor()
  }, [editorGenerationRef])

  const saveTask = useCallback(
    async (value: ScheduledTaskEditorValue) => {
      if (creationContext.kind === "invalid")
        throw new Error("Invalid scheduled task project context")
      if (editingTaskId !== null && !editingTask)
        throw new Error("Scheduled task is no longer available")
      const generation = editorGenerationRef.current
      const projectId =
        editingTask === null && creationContext.kind === "project"
          ? creationContext.projectId
          : undefined
      await saveScheduledTask(
        runtime,
        editingTask,
        value,
        reload,
        projectId,
        () =>
          mountedRef.current &&
          editorGenerationRef.current === generation &&
          currentContextKeyRef.current === contextKey &&
          currentEditorOpenRef.current,
      )
    },
    [contextKey, creationContext, editingTask, editingTaskId, reload, runtime,
      currentContextKeyRef, currentEditorOpenRef, editorGenerationRef, mountedRef],
  )

  const pendingCreate =
    editingTaskId === null &&
    runtime.mode === "live" &&
    runtime.client &&
    creationContext.kind !== "invalid"
      ? pendingScheduledTaskCreate(
          runtime.client,
          creationContext.kind === "project"
            ? creationContext.projectId
            : undefined,
        )
      : undefined
  const capabilities = scheduledTaskCapabilities(runtime)
  return {
    initialPrompt,
    pendingCreate: pendingCreate || undefined,
    editingTask,
    openerRef,
    openEditor,
    handleOpenChange,
    saveTask,
    editorInstanceKey: scheduledTaskEditorInstanceKey(
      creationContext,
      editingTaskId,
    ),
    canSave: editingTask ? capabilities.canUpdate : capabilities.canCreate,
  }
}
