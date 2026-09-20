"use client"

import { ChevronDown } from "lucide-react"
import type { Dispatch, SetStateAction } from "react"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useT } from "@/i18n/context"

import type { ScheduledTaskEditorState } from "./scheduled-task-editor-state"
import styles from "./scheduled-task-editor.module.css"

type ScheduledTaskEditorOptionsProps = { brandName: string; state: ScheduledTaskEditorState; setState: Dispatch<SetStateAction<ScheduledTaskEditorState>> }

export function ScheduledTaskEditorOptions({ brandName, state, setState }: ScheduledTaskEditorOptionsProps) {
  const t = useT()
  return <><section className={styles.optionCard} aria-label={t("firstSite.autoApprove")}><div><strong>{t("firstSite.autoApprove")}</strong><p>{t("firstSite.autoApproveHint")}</p></div><Switch aria-label={t("firstSite.autoApprove")} checked={state.autoApprove} onCheckedChange={(autoApprove) => setState((current) => ({ ...current, autoApprove }))} /></section><section className={styles.advanced}><Button type="button" variant="ghost" onClick={() => setState((current) => ({ ...current, advancedOpen: !current.advancedOpen }))} aria-expanded={state.advancedOpen}><span><strong>{t("firstSite.advancedSettings")}</strong><small>{t("firstSite.advancedSettingsHint")}</small></span><ChevronDown data-open={state.advancedOpen} /></Button>{state.advancedOpen ? <div className={styles.advancedContent}><span>{t("firstSite.executionMode")}</span><span>{t("firstSite.sameTask")}</span><span>{t("firstSite.agent")}: {brandName}</span></div> : null}</section></>
}
