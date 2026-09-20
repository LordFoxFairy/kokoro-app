import type {
  ScheduledTaskDraft,
  ScheduledTaskEditorValue,
  ScheduledTaskPatch,
  ScheduledTaskRecord,
} from "../model/scheduled-task"
import {
  insertPreviewTask,
  removePreviewTask,
  replacePreviewTask,
  setPreviewTaskStatus,
} from "./preview-task-store"
import type { ScheduledTaskRuntime } from "./scheduled-task-mode"

export function missingScheduledClientError(): Error {
  return new Error("Scheduled task client is not configured")
}

function createDraft(value: ScheduledTaskEditorValue): ScheduledTaskDraft {
  return {
    title: value.title,
    prompt: value.prompt,
    frequency: value.frequency,
    time: value.time,
    timezone: value.timezone,
    autoApprove: value.autoApprove,
    ...(typeof value.expiresAt === "string" ? { expiresAt: value.expiresAt } : {}),
  }
}

function updatePatch(value: ScheduledTaskEditorValue): ScheduledTaskPatch {
  return {
    title: value.title,
    prompt: value.prompt,
    frequency: value.frequency,
    time: value.time,
    timezone: value.timezone,
    ...(value.expiresAt === undefined ? {} : { expiresAt: value.expiresAt }),
    autoApprove: value.autoApprove,
  }
}

export async function saveScheduledTask(
  runtime: ScheduledTaskRuntime,
  editingTask: ScheduledTaskRecord | null,
  value: ScheduledTaskEditorValue,
  reload: () => Promise<void>,
): Promise<void> {
  if (editingTask) {
    const patch = updatePatch(value)
    if (runtime.mode === "preview") {
      await runtime.handlers.onUpdateTask?.(editingTask.id, patch)
      await replacePreviewTask(editingTask.id, value)
      return
    }
    if (runtime.mode === "controlled") {
      if (!runtime.handlers.onUpdateTask) throw missingScheduledClientError()
      await runtime.handlers.onUpdateTask(editingTask.id, patch)
      return
    }
    if (!runtime.client) throw missingScheduledClientError()
    await runtime.client.updateScheduledTask(editingTask.id, patch)
    await reload()
    return
  }
  const draft = createDraft(value)
  if (runtime.mode === "preview") {
    await runtime.handlers.onSave?.(draft)
    await insertPreviewTask(draft)
    return
  }
  if (runtime.mode === "controlled") {
    if (!runtime.handlers.onSave) throw missingScheduledClientError()
    await runtime.handlers.onSave(draft)
    return
  }
  if (!runtime.client) throw missingScheduledClientError()
  await runtime.client.createScheduledTask(draft)
  await reload()
}

export async function updateScheduledTaskStatus(
  runtime: ScheduledTaskRuntime,
  task: ScheduledTaskRecord,
  enabled: boolean,
  reload: () => Promise<void>,
): Promise<void> {
  const patch = { enabled, status: enabled ? "active" as const : "paused" as const }
  if (runtime.mode === "preview") {
    await runtime.handlers.onUpdateTask?.(task.id, patch)
    await setPreviewTaskStatus(task.id, patch.status)
    return
  }
  if (runtime.mode === "controlled") {
    if (!runtime.handlers.onUpdateTask) throw missingScheduledClientError()
    await runtime.handlers.onUpdateTask(task.id, patch)
    return
  }
  if (!runtime.client) throw missingScheduledClientError()
  await runtime.client.updateScheduledTask(task.id, patch)
  await reload()
}

export async function retryScheduledTask(
  runtime: ScheduledTaskRuntime,
  task: ScheduledTaskRecord,
  reload: () => Promise<void>,
): Promise<void> {
  if (runtime.mode === "preview") {
    await runtime.handlers.onRetryTask?.(task.id)
    await setPreviewTaskStatus(task.id, "active")
    return
  }
  if (runtime.mode === "controlled") {
    if (!runtime.handlers.onRetryTask) throw missingScheduledClientError()
    await runtime.handlers.onRetryTask(task.id)
    return
  }
  if (!runtime.client) throw missingScheduledClientError()
  await runtime.client.retryScheduledTask(task.id)
  await reload()
}

export async function deleteScheduledTask(
  runtime: ScheduledTaskRuntime,
  task: ScheduledTaskRecord,
  reload: () => Promise<void>,
): Promise<void> {
  if (runtime.mode === "preview") {
    await runtime.handlers.onDeleteTask?.(task.id)
    await removePreviewTask(task.id)
    return
  }
  if (runtime.mode === "controlled") {
    if (!runtime.handlers.onDeleteTask) throw missingScheduledClientError()
    await runtime.handlers.onDeleteTask(task.id)
    return
  }
  if (!runtime.client) throw missingScheduledClientError()
  await runtime.client.deleteScheduledTask(task.id)
  await reload()
}

export function scheduledTaskCapabilities(runtime: ScheduledTaskRuntime) {
  if (runtime.mode === "preview") return { canCreate: true, canUpdate: true, canRetry: true, canDelete: true }
  if (runtime.mode === "live") {
    const available = runtime.client !== null
    return { canCreate: available, canUpdate: available, canRetry: available, canDelete: available }
  }
  return {
    canCreate: runtime.handlers.onSave !== undefined,
    canUpdate: runtime.handlers.onUpdateTask !== undefined,
    canRetry: runtime.handlers.onRetryTask !== undefined,
    canDelete: runtime.handlers.onDeleteTask !== undefined,
  }
}
