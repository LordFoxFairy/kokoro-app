import type {
  ScheduledTaskClient,
  ScheduledTaskDraft,
  ScheduledTaskPatch,
  ScheduledTaskRecord,
} from "../model/scheduled-task"

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
