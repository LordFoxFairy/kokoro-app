"use client"

import { Ellipsis } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useT } from "@/i18n/context"

import { taskStatus, type ScheduledTaskRecord } from "../model/scheduled-task"
import styles from "./scheduled-task-surface.module.css"

type ScheduledTaskListActionsProps = {
  task: ScheduledTaskRecord
  busy: boolean
  canUpdate: boolean
  canRetry: boolean
  canDelete: boolean
  openEditor: (
    prompt?: string,
    target?: HTMLElement | null,
    task?: ScheduledTaskRecord | null,
  ) => void
  setDeleteTarget: (task: ScheduledTaskRecord) => void
  retryTask: (task: ScheduledTaskRecord) => Promise<void>
  setTaskEnabled: (task: ScheduledTaskRecord, enabled: boolean) => Promise<void>
}

export function ScheduledTaskListActions({
  task,
  busy,
  canUpdate,
  canRetry,
  canDelete,
  openEditor,
  setDeleteTarget,
  retryTask,
  setTaskEnabled,
}: ScheduledTaskListActionsProps) {
  const t = useT()
  const status = taskStatus(task)
  const enabled = status === "active"
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={styles.taskActions}
          disabled={busy}
          aria-label={t("scheduled.taskActions", { title: task.title })}
          aria-busy={busy || undefined}
        >
          <Ellipsis aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {status === "failed" ? (
          <DropdownMenuItem
            disabled={!canRetry}
            onSelect={() => void retryTask(task)}
          >
            {t("scheduled.retry")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            disabled={!canUpdate}
            onSelect={() => void setTaskEnabled(task, !enabled)}
          >
            {enabled ? t("scheduled.pause") : t("scheduled.resume")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          disabled={!canUpdate}
          onSelect={() => openEditor("", null, task)}
        >
          {t("scheduled.edit")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canDelete}
          onSelect={() => setDeleteTarget(task)}
        >
          {t("scheduled.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
