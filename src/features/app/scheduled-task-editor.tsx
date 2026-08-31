"use client"

import { useRef, useState, type RefObject } from "react"
import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/i18n/context"

import styles from "./scheduled-task-editor.module.css"

export type ScheduledTaskDraft = {
  title: string
  prompt: string
  frequency: "daily" | "weekly"
  time: string
  timezone: string
  expiresAt?: string
  autoApprove: boolean
}

export type ScheduledTaskInitial = Partial<ScheduledTaskDraft> & {
  title: string
}

type ScheduledTaskEditorDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  brandName: string
  initialPrompt?: string
  initialTask?: ScheduledTaskInitial | null
  onSave?: (task: ScheduledTaskDraft) => Promise<void> | void
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
          onSave={onSave}
          returnFocusRef={returnFocusRef}
        />
      ) : null}
    </Dialog>
  )
}

type ScheduledTaskEditorContentProps = Pick<ScheduledTaskEditorDialogProps, "brandName" | "initialPrompt" | "initialTask" | "onSave"> & {
  onClose: () => void
  returnFocusRef?: RefObject<HTMLElement | null>
}

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

function ScheduledTaskEditorContent({
  brandName,
  initialPrompt = "",
  initialTask = null,
  onClose,
  onSave,
  returnFocusRef,
}: ScheduledTaskEditorContentProps) {
  const t = useT()
  const titleRef = useRef<HTMLInputElement | null>(null)
  const [title, setTitle] = useState(() => initialTask?.title ?? "")
  const [frequency, setFrequency] = useState<"daily" | "weekly">(() => initialTask?.frequency === "weekly" ? "weekly" : "daily")
  const [time, setTime] = useState(() => initialTask?.time ?? "08:00")
  // Manus keeps timezone implicit in this editor. Preserve the API field for
  // the backend contract, but derive it from the browser rather than exposing
  // a second scheduling control that changes the reference geometry.
  const timezone = initialTask?.timezone || browserTimezone()
  const [expires, setExpires] = useState(() => Boolean(initialTask?.expiresAt))
  const [expiryDate, setExpiryDate] = useState(() => initialTask?.expiresAt ?? "")
  const [prompt, setPrompt] = useState(() => initialTask?.prompt ?? initialPrompt)
  const [autoApprove, setAutoApprove] = useState(() => initialTask?.autoApprove ?? false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!title.trim() || !prompt.trim() || (expires && !expiryDate) || saving || !onSave) return
    setSaving(true)
    setSaveError(false)
    try {
      await onSave({ title: title.trim(), prompt: prompt.trim(), frequency, time, timezone, expiresAt: expires ? expiryDate : undefined, autoApprove })
      onClose()
    } catch {
      // Keep the editor open so a live persistence failure is recoverable and
      // never looks like a successful save followed by a disappearing task.
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogContent
      className={styles.dialog}
      overlayClassName={styles.overlay}
      closeLabel={t("shell.closeDialog")}
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        titleRef.current?.focus()
      }}
      onCloseAutoFocus={(event) => {
        const target = returnFocusRef?.current
        if (!target?.isConnected || target.hasAttribute("disabled")) return
        event.preventDefault()
        window.requestAnimationFrame(() => target.focus())
      }}
    >
      <DialogTitle className={styles.title}>{initialTask ? t("firstSite.editScheduledTask") : t("firstSite.addScheduledTask")}</DialogTitle>
      <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
        <div className={styles.body}>
          <FieldGroup className={styles.fields}>
            <Field>
              <FieldLabel htmlFor="scheduled-task-title">{t("firstSite.title")}</FieldLabel>
              <Input
                ref={titleRef}
                id="scheduled-task-title"
                aria-label={t("firstSite.scheduleTitlePlaceholder")}
                placeholder={t("firstSite.scheduleTitlePlaceholder")}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <FieldSet className={styles.fieldset}>
              <FieldLegend variant="label">{t("firstSite.schedule")}</FieldLegend>
              <div className={styles.scheduleRow}>
                <Select value={frequency} onValueChange={(value) => setFrequency(value === "weekly" ? "weekly" : "daily")}>
                  <SelectTrigger aria-label={t("firstSite.schedule")}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup><SelectItem value="daily">{t("firstSite.daily")}</SelectItem><SelectItem value="weekly">{t("firstSite.weekly")}</SelectItem></SelectGroup></SelectContent>
                </Select>
                <label className={styles.timeControl}>
                  <Input type="time" aria-label={t("firstSite.selectTime")} value={time} onChange={(event) => setTime(event.target.value)} />
                  <ChevronDown aria-hidden="true" />
                </label>
              </div>
              <Field orientation="horizontal" className={styles.expiryField}>
                <Checkbox id="scheduled-task-expiry" checked={expires} onCheckedChange={(checked) => setExpires(checked === true)} />
                <FieldLabel htmlFor="scheduled-task-expiry">{t("firstSite.setExpiryDate")}</FieldLabel>
              </Field>
              {expires ? <Input className={styles.expiryDate} type="date" aria-label={t("firstSite.selectExpiryDate")} value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} /> : null}
            </FieldSet>
            <Field>
              <FieldLabel htmlFor="scheduled-task-prompt">{t("firstSite.prompt")}</FieldLabel>
              <Textarea id="scheduled-task-prompt" aria-label={t("firstSite.schedulePromptPlaceholder")} placeholder={t("firstSite.schedulePromptPlaceholder")} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            </Field>
          </FieldGroup>
          <section className={styles.optionCard} aria-label={t("firstSite.autoApprove")}>
            <div><strong>{t("firstSite.autoApprove")}</strong><p>{t("firstSite.autoApproveHint")}</p></div>
            <Switch aria-label={t("firstSite.autoApprove")} checked={autoApprove} onCheckedChange={setAutoApprove} />
          </section>
          <section className={styles.advanced}>
            <Button type="button" variant="ghost" onClick={() => setAdvancedOpen((value) => !value)} aria-expanded={advancedOpen}>
              <span><strong>{t("firstSite.advancedSettings")}</strong><small>{t("firstSite.advancedSettingsHint")}</small></span>
              <ChevronDown data-open={advancedOpen} />
            </Button>
            {advancedOpen ? <div className={styles.advancedContent}><span>{t("firstSite.executionMode")}</span><span>{t("firstSite.sameTask")}</span><span>{t("firstSite.agent")}: {brandName}</span></div> : null}
          </section>
        </div>
        {saveError ? <p className={styles.saveError} role="alert">{t("firstSite.runtimeUnavailable")}</p> : null}
        <DialogFooter className={styles.footer}>
          <DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose>
          <Button type="submit" disabled={!onSave || !title.trim() || !prompt.trim() || (expires && !expiryDate) || saving} aria-busy={saving}>
            {saving ? <Spinner aria-hidden="true" /> : null}
            {t("firstSite.save")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
