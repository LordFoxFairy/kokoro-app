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
  brandName: string
  state: ScheduledTaskEditorState
  setState: React.Dispatch<React.SetStateAction<ScheduledTaskEditorState>>
  titleRef: RefObject<HTMLInputElement | null>
  saving: boolean
  saveError: boolean
  valid: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
}

export function ScheduledTaskEditorForm({
  brandName,
  state,
  setState,
  titleRef,
  saving,
  saveError,
  valid,
  onSubmit,
}: ScheduledTaskEditorFormProps) {
  const t = useT()
  return (
    <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
      <div className={styles.body}>
        <ScheduledTaskEditorFields
          state={state}
          setState={setState}
          titleRef={titleRef}
        />
        <ScheduledTaskEditorOptions
          brandName={brandName}
          state={state}
          setState={setState}
        />
      </div>
      {saveError ? (
        <p className={styles.saveError} role="alert">
          {t("scheduled.updateFailed")}
        </p>
      ) : null}
      <ScheduledTaskEditorActions saving={saving} valid={valid} />
    </form>
  )
}

function ScheduledTaskEditorActions({
  saving,
  valid,
}: Pick<ScheduledTaskEditorFormProps, "saving" | "valid">) {
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
        {t("firstSite.save")}
      </Button>
    </DialogFooter>
  )
}
