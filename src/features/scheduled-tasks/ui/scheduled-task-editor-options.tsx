"use client"

import type { Dispatch, SetStateAction } from "react"

import { Switch } from "@/components/ui/switch"
import { useT } from "@/i18n/context"

import type { ScheduledTaskEditorState } from "./scheduled-task-editor-state"
import styles from "./scheduled-task-editor.module.css"

type ScheduledTaskEditorOptionsProps = { state: ScheduledTaskEditorState; setState: Dispatch<SetStateAction<ScheduledTaskEditorState>> }

export function ScheduledTaskEditorOptions({ state, setState }: ScheduledTaskEditorOptionsProps) {
  const t = useT()
  return <section className={styles.optionCard} aria-label={t("firstSite.autoApprove")}>
    <div><strong>{t("firstSite.autoApprove")}</strong><p>{t("firstSite.autoApproveHint")}</p></div>
    <Switch aria-label={t("firstSite.autoApprove")} checked={state.autoApprove}
      onCheckedChange={autoApprove => setState(current => ({ ...current, autoApprove }))} />
  </section>
}
