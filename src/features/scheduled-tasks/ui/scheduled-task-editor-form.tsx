"use client"

import type { FormEvent, RefObject } from "react"

import { Button } from "@/components/ui/button"
import { DialogClose, DialogFooter } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { useT } from "@/i18n/context"

import { ScheduledTaskEditorFields } from "./scheduled-task-editor-fields"
import { ScheduledTaskEditorOptions } from "./scheduled-task-editor-options"
import type { ScheduledTaskEditorState } from "./scheduled-task-editor-state"
import styles from "./scheduled-task-editor.module.css"

type ScheduledTaskEditorFormProps = {
  state: ScheduledTaskEditorState
  setState: React.Dispatch<React.SetStateAction<ScheduledTaskEditorState>>
  titleRef: RefObject<HTMLInputElement | null>
  saving: boolean
  unconfirmed?: boolean
  saveError: boolean
  valid: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
}

export function ScheduledTaskEditorForm({
  state,
  setState,
  titleRef,
  saving,
  saveError,
  unconfirmed = false,
  valid,
  onSubmit,
}: ScheduledTaskEditorFormProps) {
  const t = useT()
  return (
    <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
      <fieldset className={styles.body} disabled={saving || unconfirmed}>
        <ScheduledTaskEditorFields
          state={state}
          setState={setState}
          titleRef={titleRef}
        />
        <ScheduledTaskEditorOptions
          state={state}
          setState={setState}
        />
      </fieldset>
      {saveError ? (
        <p className={styles.saveError} role="alert">
          {t(unconfirmed ? "scheduled.unconfirmed" : "scheduled.updateFailed")}
        </p>
      ) : null}
      <ScheduledTaskEditorActions
        saving={saving}
        valid={valid}
        unconfirmed={unconfirmed}
      />
    </form>
  )
}

function ScheduledTaskEditorActions({
  saving,
  valid,
  unconfirmed,
}: Pick<ScheduledTaskEditorFormProps, "saving" | "valid" | "unconfirmed">) {
  const t = useT()
  return (
    <DialogFooter className={styles.footer}>
      <DialogClose asChild>
        <Button type="button" variant="outline" disabled={saving}>
          {t("firstSite.cancel")}
        </Button>
      </DialogClose>
      <Button type="submit" disabled={!valid || saving} aria-busy={saving}>
        {saving ? <Spinner aria-hidden="true" /> : null}
        {t(unconfirmed ? "scheduled.retryOriginal" : "firstSite.save")}
      </Button>
    </DialogFooter>
  )
}
