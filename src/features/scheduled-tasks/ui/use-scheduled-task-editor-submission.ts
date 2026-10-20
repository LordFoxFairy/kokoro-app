"use client"

import { useRef, useState, type FormEvent } from "react"

import { isUnknownScheduledTaskResult } from "../api/scheduled-task-client"

import { expiryDateToUtcInstant } from "../model/calendar"
import { isIanaTimezone } from "../model/scheduled-task"
import type { ScheduledTaskDraft, ScheduledTaskEditorValue, ScheduledTaskInitial } from "../model/scheduled-task"
import { initialScheduledTaskEditorState, useMountedRef } from "./scheduled-task-editor-state"

type UseScheduledTaskEditorSubmissionOptions = {
  initialTask: ScheduledTaskInitial | null
  initialDraft?: ScheduledTaskDraft
  initialPrompt: string
  onSave: ((task: ScheduledTaskEditorValue) => Promise<void> | void) | undefined
  onClose: () => void
}

export function useScheduledTaskEditorSubmission({
  initialTask,
  initialDraft,
  initialPrompt,
  onSave,
  onClose,
}: UseScheduledTaskEditorSubmissionOptions) {
  const frozen = useRef<ScheduledTaskEditorValue | null>(
    initialDraft
      ? {
          ...initialDraft,
          ...(initialDraft.weekdays ? { weekdays: [...initialDraft.weekdays] } : {}),
          ...(initialDraft.monthDays ? { monthDays: [...initialDraft.monthDays] } : {}),
          expiresAt: initialDraft.expiresAt,
        }
      : null,
  )
  const submitting = useRef(false)
  const mounted = useMountedRef()
  const [state, setState] = useState(() =>
    initialScheduledTaskEditorState(initialTask ?? initialDraft ?? null, initialPrompt),
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [unconfirmed, setUnconfirmed] = useState(initialDraft !== undefined)
  const valid = Boolean(
    onSave &&
    state.title.trim() &&
    state.prompt.trim() &&
    isIanaTimezone(state.timezone) &&
    (unconfirmed ||
      ((state.frequency !== "weekly" || state.weekdays.length > 0) &&
        (state.frequency !== "monthly" || state.monthDays.length > 0) &&
        (state.frequency !== "once" || /^\d{4}-\d{2}-\d{2}$/.test(state.localDate)))) &&
    /^([01]\d|2[0-3]):[0-5]\d$/u.test(state.time) &&
    (!state.expires || state.expiryDate),
  )

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valid || submitting.current || !onSave) return
    submitting.current = true
    setSaving(true)
    setSaveError(false)
    let submitted: ScheduledTaskEditorValue | undefined
    try {
      submitted = frozen.current ?? toScheduledTaskEditorValue(state, initialTask)
      await onSave(submitted)
    } catch (error) {
      if (submitted && isUnknownScheduledTaskResult(error)) {
        frozen.current = submitted
        if (mounted.current) setUnconfirmed(true)
      }
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

  return { state, setState, saving, saveError, unconfirmed, valid, submit }
}

function toScheduledTaskEditorValue(
  state: ReturnType<typeof initialScheduledTaskEditorState>,
  initialTask: ScheduledTaskInitial | null,
): ScheduledTaskEditorValue {
  return {
    ...(state.frequency === "weekly" ? { weekdays: [...state.weekdays] } : {}),
    ...(state.frequency === "monthly" ? { monthDays: [...state.monthDays] } : {}),
    ...(state.frequency === "once" ? { localDate: state.localDate } : {}),
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
