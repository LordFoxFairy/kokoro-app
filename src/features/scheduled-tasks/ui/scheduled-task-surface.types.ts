import type {
  ScheduledTaskClient,
  ScheduledTaskDraft,
  ScheduledTaskPatch,
  ScheduledTaskRecord,
} from "../model/scheduled-task"

type ScheduledTaskSurfaceCommon = {
  brandName?: string
  displayTimezone?: string
}

export type ScheduledTaskSurfaceHandlers = {
  onSave?: (task: ScheduledTaskDraft) => Promise<void> | void
  onUpdateTask?: (taskId: string, patch: ScheduledTaskPatch) => Promise<void> | void
  onRetryTask?: (taskId: string) => Promise<void> | void
  onDeleteTask?: (taskId: string) => Promise<void> | void
}

type PreviewSurfaceProps = ScheduledTaskSurfaceCommon & ScheduledTaskSurfaceHandlers & {
  mode: "preview"
  preview?: never
  scheduledTaskClient?: never
  tasks?: never
}

type LiveSurfaceProps = ScheduledTaskSurfaceCommon & {
  mode: "live"
  preview?: never
  scheduledTaskClient: ScheduledTaskClient
  tasks?: never
  onSave?: never
  onUpdateTask?: never
  onRetryTask?: never
  onDeleteTask?: never
}

type ControlledSurfaceProps = ScheduledTaskSurfaceCommon & ScheduledTaskSurfaceHandlers & {
  mode: "controlled"
  preview?: never
  scheduledTaskClient?: never
  tasks: readonly ScheduledTaskRecord[]
}

export type ScheduledTaskSurfaceProps = PreviewSurfaceProps | LiveSurfaceProps | ControlledSurfaceProps

export type ScheduledTaskSurfaceHostProps = ScheduledTaskSurfaceCommon & ScheduledTaskSurfaceHandlers & {
  mode?: ScheduledTaskSurfaceProps["mode"]
  preview?: boolean
  scheduledTaskClient?: ScheduledTaskClient
  tasks?: readonly ScheduledTaskRecord[]
}
