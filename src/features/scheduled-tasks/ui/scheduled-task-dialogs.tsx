"use client"

import type { Dispatch, RefObject, SetStateAction } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useLocale } from "@/i18n/context"

import type { ScheduledTaskDraft, ScheduledTaskInitial, ScheduledTaskRecord } from "../model/scheduled-task"
import { ScheduledTaskEditorDialog } from "./scheduled-task-editor"

type ScheduledTaskDialogsProps = {
  brandName: string
  editorOpen: boolean
  onEditorOpenChange: (open: boolean) => void
  initialPrompt: string
  editingTask: ScheduledTaskInitial | null
  canSave: boolean
  onSave: (draft: ScheduledTaskDraft) => Promise<void>
  returnFocusRef: RefObject<HTMLElement | null>
  deleteTarget: ScheduledTaskRecord | null
  setDeleteTarget: Dispatch<SetStateAction<ScheduledTaskRecord | null>>
  deleting: boolean
  onDelete: () => Promise<void>
}

export function ScheduledTaskDialogs({
  brandName,
  editorOpen,
  onEditorOpenChange,
  initialPrompt,
  editingTask,
  canSave,
  onSave,
  returnFocusRef,
  deleteTarget,
  setDeleteTarget,
  deleting,
  onDelete,
}: ScheduledTaskDialogsProps) {
  const { t } = useLocale()
  return (
    <>
      <ScheduledTaskEditorDialog
        open={editorOpen}
        onOpenChange={onEditorOpenChange}
        brandName={brandName}
        initialPrompt={initialPrompt}
        {...(canSave ? { onSave } : {})}
        initialTask={editingTask}
        returnFocusRef={returnFocusRef}
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
              disabled={deleting}
              aria-busy={deleting || undefined}
              onClick={(event) => {
                event.preventDefault()
                void onDelete()
              }}
            >
              {deleting ? t("scheduled.deleting") : t("scheduled.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
