import type { ScheduledTaskClient, ScheduledTaskRecord } from "../model/scheduled-task"
import type { ScheduledTaskSurfaceHandlers, ScheduledTaskSurfaceHostProps } from "./scheduled-task-surface.types"

type RuntimeCommon = {
  brandName: string
  displayTimezone: string
}

export type ScheduledTaskRuntime =
  | (RuntimeCommon & { mode: "preview"; handlers: ScheduledTaskSurfaceHandlers })
  | (RuntimeCommon & { mode: "live"; client: ScheduledTaskClient | null })
  | (RuntimeCommon & { mode: "controlled"; tasks: readonly ScheduledTaskRecord[]; handlers: ScheduledTaskSurfaceHandlers })

function modeError(message: string): Error {
  return new Error(`ScheduledTask mode ${message}`)
}

function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

function displayTimezone(value: string | undefined): string {
  let candidate = value
  if (!candidate) {
    try {
      candidate = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    } catch {
      candidate = "UTC"
    }
  }
  if (!isTimezone(candidate)) throw modeError("requires a valid display IANA timezone")
  return candidate
}

function handlersFrom(props: ScheduledTaskSurfaceHostProps): ScheduledTaskSurfaceHandlers {
  return {
    ...(props.onSave === undefined ? {} : { onSave: props.onSave }),
    ...(props.onUpdateTask === undefined ? {} : { onUpdateTask: props.onUpdateTask }),
    ...(props.onRetryTask === undefined ? {} : { onRetryTask: props.onRetryTask }),
    ...(props.onDeleteTask === undefined ? {} : { onDeleteTask: props.onDeleteTask }),
  }
}

function hasHandlers(props: ScheduledTaskSurfaceHostProps): boolean {
  return props.onSave !== undefined
    || props.onUpdateTask !== undefined
    || props.onRetryTask !== undefined
    || props.onDeleteTask !== undefined
}

export function resolveScheduledTaskRuntime(props: ScheduledTaskSurfaceHostProps): ScheduledTaskRuntime {
  const common = {
    brandName: props.brandName ?? "Kokoro",
    displayTimezone: displayTimezone(props.displayTimezone),
  }
  if (props.mode !== undefined && props.preview !== undefined) throw modeError("cannot combine mode and preview")
  if (props.mode === "preview") {
    if (props.scheduledTaskClient || props.tasks) throw modeError("preview cannot include live or controlled data")
    return { ...common, mode: "preview", handlers: handlersFrom(props) }
  }
  if (props.mode === "controlled") {
    if (!props.tasks || props.scheduledTaskClient) throw modeError("controlled requires tasks and excludes a live client")
    return { ...common, mode: "controlled", tasks: props.tasks, handlers: handlersFrom(props) }
  }
  if (props.mode === "live") {
    if (!props.scheduledTaskClient || props.tasks || hasHandlers(props)) throw modeError("live requires only its complete client")
    return { ...common, mode: "live", client: props.scheduledTaskClient }
  }
  if (props.tasks !== undefined) {
    if (props.scheduledTaskClient) throw modeError("controlled cannot include a live client")
    return { ...common, mode: "controlled", tasks: props.tasks, handlers: handlersFrom(props) }
  }
  if (props.preview) {
    if (props.scheduledTaskClient) throw modeError("preview cannot include a live client")
    return { ...common, mode: "preview", handlers: handlersFrom(props) }
  }
  if (hasHandlers(props)) throw modeError("live cannot include controlled handlers")
  return { ...common, mode: "live", client: props.scheduledTaskClient ?? null }
}
