"use client"

import { ChevronDown } from "lucide-react"
import type { Dispatch, RefObject, SetStateAction } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/i18n/context"

import type { ScheduledTaskEditorState } from "./scheduled-task-editor-state"
import styles from "./scheduled-task-editor.module.css"

type EditorStateSetter = Dispatch<SetStateAction<ScheduledTaskEditorState>>
type ScheduledTaskEditorFieldsProps = { state: ScheduledTaskEditorState; setState: EditorStateSetter; titleRef: RefObject<HTMLInputElement | null> }

export function ScheduledTaskEditorFields({ state, setState, titleRef }: ScheduledTaskEditorFieldsProps) {
  return <FieldGroup className={styles.fields}><ScheduledTaskTitleField state={state} setState={setState} titleRef={titleRef} /><ScheduledTaskTimingFields state={state} setState={setState} /><ScheduledTaskPromptField state={state} setState={setState} /></FieldGroup>
}

function ScheduledTaskTitleField({ state, setState, titleRef }: ScheduledTaskEditorFieldsProps) {
  const t = useT()
  return <Field><FieldLabel htmlFor="scheduled-task-title">{t("firstSite.title")}</FieldLabel><Input ref={titleRef} id="scheduled-task-title" aria-label={t("firstSite.scheduleTitlePlaceholder")} placeholder={t("firstSite.scheduleTitlePlaceholder")} value={state.title} onChange={(event) => setState((current) => ({ ...current, title: event.target.value }))} /></Field>
}

function ScheduledTaskTimingFields({ state, setState }: Pick<ScheduledTaskEditorFieldsProps, "state" | "setState">) {
  const t = useT()
  return <FieldSet className={styles.fieldset}>
    <FieldLegend variant="label">{t("firstSite.schedule")}</FieldLegend>
    <div className={styles.scheduleRow}><Select value={state.frequency} onValueChange={(value) => setState((current) => ({ ...current, frequency: value === "weekly" ? "weekly" : "daily" }))}><SelectTrigger aria-label={t("firstSite.schedule")}><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="daily">{t("firstSite.daily")}</SelectItem><SelectItem value="weekly">{t("firstSite.weekly")}</SelectItem></SelectGroup></SelectContent></Select><label className={styles.timeControl}><Input type="time" aria-label={t("firstSite.selectTime")} value={state.time} onChange={(event) => setState((current) => ({ ...current, time: event.target.value }))} /><ChevronDown aria-hidden="true" /></label></div>
    <Field orientation="horizontal" className={styles.expiryField}><Checkbox id="scheduled-task-expiry" checked={state.expires} onCheckedChange={(checked) => setState((current) => ({ ...current, expires: checked === true }))} /><FieldLabel htmlFor="scheduled-task-expiry">{t("firstSite.setExpiryDate")}</FieldLabel></Field>
    {state.expires ? <Input className={styles.expiryDate} type="date" aria-label={t("firstSite.selectExpiryDate")} value={state.expiryDate} onChange={(event) => setState((current) => ({ ...current, expiryDate: event.target.value }))} /> : null}
  </FieldSet>
}

function ScheduledTaskPromptField({ state, setState }: Pick<ScheduledTaskEditorFieldsProps, "state" | "setState">) {
  const t = useT()
  return <Field><FieldLabel htmlFor="scheduled-task-prompt">{t("firstSite.prompt")}</FieldLabel><Textarea id="scheduled-task-prompt" aria-label={t("firstSite.schedulePromptPlaceholder")} placeholder={t("firstSite.schedulePromptPlaceholder")} value={state.prompt} onChange={(event) => setState((current) => ({ ...current, prompt: event.target.value }))} /></Field>
}
