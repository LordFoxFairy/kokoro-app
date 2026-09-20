"use client"

import { useRef, type RefObject } from "react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useT } from "@/i18n/context"

import type {
  ScheduledTaskEditorValue,
  ScheduledTaskInitial,
} from "../model/scheduled-task"
import { ScheduledTaskEditorForm } from "./scheduled-task-editor-form"
import { useScheduledTaskEditorSubmission } from "./use-scheduled-task-editor-submission"
import styles from "./scheduled-task-editor.module.css"

type ScheduledTaskEditorDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  brandName: string
  initialPrompt?: string
  initialTask?: ScheduledTaskInitial | null
  onSave?: (task: ScheduledTaskEditorValue) => Promise<void> | void
  returnFocusRef?: RefObject<HTMLElement | null>
}

export function ScheduledTaskEditorDialog({
  open,
  onOpenChange,
  brandName,
  initialPrompt = "",
  initialTask = null,
  onSave,
  returnFocusRef,
}: ScheduledTaskEditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <ScheduledTaskEditorContent
          brandName={brandName}
          initialPrompt={initialPrompt}
          initialTask={initialTask}
          onClose={() => onOpenChange(false)}
          {...(onSave === undefined ? {} : { onSave })}
          {...(returnFocusRef === undefined ? {} : { returnFocusRef })}
        />
      ) : null}
    </Dialog>
  )
}

type EditorContentProps = Omit<
  ScheduledTaskEditorDialogProps,
  "open" | "onOpenChange"
> & { onClose: () => void }

function ScheduledTaskEditorContent({
  brandName,
  initialPrompt = "",
  initialTask = null,
  onClose,
  onSave,
  returnFocusRef,
}: EditorContentProps) {
  const t = useT()
  const titleRef = useRef<HTMLInputElement | null>(null)
  const submission = useScheduledTaskEditorSubmission({
    initialTask,
    initialPrompt,
    onSave,
    onClose,
  })
  return (
    <DialogContent
      className={styles.dialog}
      overlayClassName={styles.overlay ?? ""}
      closeLabel={t("shell.closeDialog")}
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        titleRef.current?.focus()
      }}
      onCloseAutoFocus={(event) => restoreEditorFocus(event, returnFocusRef)}
    >
      <DialogTitle className={styles.title}>
        {initialTask
          ? t("firstSite.editScheduledTask")
          : t("firstSite.addScheduledTask")}
      </DialogTitle>
      <ScheduledTaskEditorForm
        brandName={brandName}
        titleRef={titleRef}
        onSubmit={submission.submit}
        {...submission}
      />
    </DialogContent>
  )
}

function restoreEditorFocus(
  event: Event,
  returnFocusRef: RefObject<HTMLElement | null> | undefined,
) {
  const target = returnFocusRef?.current
  if (!target?.isConnected || target.hasAttribute("disabled")) return
  event.preventDefault()
  window.requestAnimationFrame(() => target.focus())
}
