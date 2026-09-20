"use client"

import { useRef, useState, type FormEvent } from "react"

import { expiryDateToUtcInstant } from "../model/calendar"
import type {
  ScheduledTaskEditorValue,
  ScheduledTaskInitial,
} from "../model/scheduled-task"
import {
  initialScheduledTaskEditorState,
  useMountedRef,
} from "./scheduled-task-editor-state"

type UseScheduledTaskEditorSubmissionOptions = {
  initialTask: ScheduledTaskInitial | null
  initialPrompt: string
  onSave: ((task: ScheduledTaskEditorValue) => Promise<void> | void) | undefined
  onClose: () => void
}

export function useScheduledTaskEditorSubmission({
  initialTask,
  initialPrompt,
  onSave,
  onClose,
}: UseScheduledTaskEditorSubmissionOptions) {
  const submitting = useRef(false)
  const mounted = useMountedRef()
  const [state, setState] = useState(() =>
    initialScheduledTaskEditorState(initialTask, initialPrompt),
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const valid = Boolean(
    onSave &&
    state.title.trim() &&
    state.prompt.trim() &&
    (!state.expires || state.expiryDate),
  )

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valid || submitting.current || !onSave) return
    submitting.current = true
    setSaving(true)
    setSaveError(false)
    try {
      await onSave(toScheduledTaskEditorValue(state, initialTask))
    } catch {
      submitting.current = false
      if (mounted.current) {
        setSaving(false)
        setSaveError(true)
      }
      return
    }
    submitting.current = false
    if (!mounted.current) return
    setSaving(false)
    onClose()
  }

  return { state, setState, saving, saveError, valid, submit }
}

function toScheduledTaskEditorValue(
  state: ReturnType<typeof initialScheduledTaskEditorState>,
  initialTask: ScheduledTaskInitial | null,
): ScheduledTaskEditorValue {
  return {
    title: state.title.trim(),
    prompt: state.prompt.trim(),
    frequency: state.frequency,
    time: state.time,
    timezone: state.timezone,
    expiresAt: state.expires
      ? expiryDateToUtcInstant(state.expiryDate, state.timezone)
      : initialTask?.expiresAt === undefined
        ? undefined
        : null,
    autoApprove: state.autoApprove,
  }
}
