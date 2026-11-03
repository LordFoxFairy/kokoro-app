"use client"

import { ArrowLeft, ArrowRight, CalendarClock, GitBranch, Settings2, Sparkles, X, Zap } from "lucide-react"
import { useId, useLayoutEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { useT } from "@/i18n/context"
import { interceptMountedSurfaceNavigation, navigateMountedSurface } from "@/ui/navigation/mounted-surface-navigation"

import { pendingScheduledTaskCreate } from "../api/scheduled-task-client"
import type { ScheduledTaskCreationContext } from "./scheduled-task-location"
import { scheduledManagementHref } from "./scheduled-task-location"
import type { ScheduledTaskRuntime } from "./scheduled-task-mode"
import { saveScheduledTask, scheduledTaskCapabilities } from "./scheduled-task-operations"
import { ScheduledTaskPromptField, ScheduledTaskScheduleFields, ScheduledTaskSettingsFields, ScheduledTaskTitleField } from "./scheduled-task-editor-fields"
import { ScheduledTaskAutomationOptions } from "./scheduled-task-editor-options"
import { useScheduledTaskEditorSubmission } from "./use-scheduled-task-editor-submission"
import styles from "./scheduled-task-surface.module.css"
import editorStyles from "./scheduled-task-editor.module.css"

type WorkflowProps = Readonly<{
  runtime: ScheduledTaskRuntime
  context: ScheduledTaskCreationContext
  reload: () => Promise<void>
}>

/** A replacement transport/controlled owner cannot inherit an earlier form or callback. */
export function ScheduledTaskAutomationWorkflow(props: WorkflowProps) {
  const client = props.runtime.mode === "live" ? props.runtime.client : null
  const handler = props.runtime.mode === "live" ? undefined : props.runtime.handlers.onSave
  const [owner, setOwner] = useState({ client, handler, revision: 0 })
  if (owner.client !== client || owner.handler !== handler) setOwner({ client, handler, revision: owner.revision + 1 })
  return <AutomationWorkflowSession key={owner.revision} {...props} />
}

function AutomationWorkflowSession(props: WorkflowProps) {
  const t = useT()
  const [kind, setKind] = useState<"calendar" | "rss" | null>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const scheduledRef = useRef<HTMLButtonElement>(null)
  const rssRef = useRef<HTMLButtonElement>(null)
  const returnToChooser = useRef<"calendar" | "rss" | null>(null)
  const unavailableId = useId()
  const canCreate = scheduledTaskCapabilities(props.runtime).canCreate && props.context.kind !== "invalid"
  useLayoutEffect(() => { titleRef.current?.focus() }, [])
  useLayoutEffect(() => {
    if (!kind && returnToChooser.current) {
      (returnToChooser.current === "rss" ? rssRef : scheduledRef).current?.focus()
      returnToChooser.current = null
    }
  }, [kind])
  return <main className={styles.workflowMain}>
    <a className={styles.workflowBack} href={scheduledManagementHref()} onClick={(event) => interceptMountedSurfaceNavigation(event, event.currentTarget.href)}><ArrowLeft aria-hidden="true" />{t("scheduled.workflowBack")}</a>
    <h1 ref={titleRef} tabIndex={-1}>{t("scheduled.workflowTitle")}</h1>
    {props.context.kind === "invalid" ? <p className={styles.workflowNotice} role="alert">{t("scheduled.invalidScope")}</p> : kind ? (
      <ScheduledAutomationForm {...props} kind={kind} onBack={() => { returnToChooser.current = kind; setKind(null) }} />
    ) : <section className={styles.workflowChooser} aria-labelledby="automation-start-title">
      <h2 id="automation-start-title">{t("scheduled.workflowChoose")}</h2>
      {!canCreate ? <p id={unavailableId} className={styles.workflowNotice}>{t("scheduled.workflowUnavailable")}</p> : null}
      <div className={styles.workflowChoices}>
        <Button ref={scheduledRef} type="button" variant="outline" className={styles.workflowChoice} disabled={!canCreate} aria-label={t("scheduled.scheduledType")} aria-describedby={canCreate ? undefined : unavailableId} onClick={() => setKind("calendar")}>
          <CalendarClock aria-hidden="true" /><span><strong>{t("scheduled.scheduledType")}</strong><span>{t("scheduled.scheduledTypeDescription", { brand: props.runtime.brandName })}</span></span><ArrowRight aria-hidden="true" />
        </Button>
        <Button ref={rssRef} type="button" variant="outline" className={styles.workflowChoice} disabled={!canCreate} aria-label={t("scheduled.triggerType")} aria-describedby={canCreate ? undefined : unavailableId} onClick={() => setKind("rss")}>
          <Zap aria-hidden="true" /><span><strong>{t("scheduled.triggerType")}</strong><span>{t("scheduled.rssDescription")}</span></span><ArrowRight aria-hidden="true" />
        </Button>
        <UnavailableWorkflowChoice advanced />
      </div>
    </section>}
  </main>
}

function UnavailableWorkflowChoice({ advanced }: { advanced: boolean }) {
  const t = useT()
  const reasonId = useId()
  const Icon = advanced ? GitBranch : Zap
  return <div className={styles.workflowUnavailableChoice}>
    <Button type="button" variant="outline" className={styles.workflowChoice} disabled aria-label={t(advanced ? "scheduled.advancedType" : "scheduled.triggerType")} aria-describedby={reasonId}>
      <Icon aria-hidden="true" /><span><strong>{t(advanced ? "scheduled.advancedType" : "scheduled.triggerType")}{advanced ? <small>{t("scheduled.beta")}</small> : null}</strong><span>{t(advanced ? "scheduled.advancedTypeDescription" : "scheduled.triggerTypeDescription")}</span></span>
    </Button>
    <p id={reasonId}>{t(advanced ? "scheduled.advancedUnavailable" : "scheduled.triggerUnavailable")}</p>
  </div>
}

function ScheduledAutomationForm({ runtime, context, reload, onBack, kind }: WorkflowProps & { onBack: () => void; kind: "calendar" | "rss" }) {
  const t = useT()
  const titleRef = useRef<HTMLInputElement>(null)
  const lifetime = useRef<{ active: boolean } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const canSave = scheduledTaskCapabilities(runtime).canCreate && context.kind !== "invalid"
  useLayoutEffect(() => {
    const token = { active: true }
    lifetime.current = token
    titleRef.current?.focus()
    return () => { token.active = false }
  }, [])
  const pending = runtime.mode === "live" && runtime.client && context.kind !== "invalid"
    ? pendingScheduledTaskCreate(runtime.client, context.kind === "project" ? context.projectId : undefined)
    : undefined
  const submission = useScheduledTaskEditorSubmission({
    initialTask: pending ?? { title: "", triggerKind: kind },
    ...(pending ? { initialDraft: pending } : {}),
    initialPrompt: "",
    defaultTime: "10:00",
    onSave: canSave ? async (value) => {
      const token = lifetime.current
      if (!token?.active) throw new Error("Scheduled automation scope retired")
      await saveScheduledTask(runtime, null, value, reload, context.kind === "project" ? context.projectId : undefined, () => token.active)
    } : undefined,
    onClose: () => { if (lifetime.current?.active) navigateMountedSurface(scheduledManagementHref()) },
  })
  const disabled = submission.saving || submission.unconfirmed || !canSave
  return <form className={styles.workflowForm} aria-label={t("scheduled.workflowForm")} onSubmit={(event) => void submission.submit(event)}>
    <div className={styles.workflowWhen}><h2>{t("scheduled.workflowWhen")}</h2><Button type="button" size="icon-sm" variant="ghost" aria-label={t("scheduled.workflowBackToChoices")} onClick={onBack}><X aria-hidden="true" /></Button></div>
    <fieldset className={`${editorStyles.fields} ${styles.workflowFields}`} disabled={disabled}>
      <ScheduledTaskTitleField state={submission.state} setState={submission.setState} titleRef={titleRef} />
      <div className={styles.workflowTiming}><ScheduledTaskScheduleFields state={submission.state} setState={submission.setState} /></div>
      <p className={styles.workflowWill}>{t("scheduled.workflowWill", { brand: runtime.brandName })}</p>
      <ScheduledTaskPromptField state={submission.state} setState={submission.setState} />
    </fieldset>
    {submission.saveError ? <p className={editorStyles.saveError} role="alert">{t(submission.unconfirmed ? "scheduled.unconfirmed" : "scheduled.updateFailed")}</p> : null}
    <footer className={styles.workflowFooter}>
      <span className={styles.workflowPill}><Sparkles aria-hidden="true" />{t("scheduled.title")}</span>
      <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
        <PopoverTrigger asChild><Button type="button" variant="outline" disabled={disabled} aria-label={t("scheduled.workflowSettings")}><Settings2 aria-hidden="true" /><span>{t("scheduled.workflowSettings")}</span></Button></PopoverTrigger>
        <PopoverContent className={editorStyles.automationSettings} side="bottom" align="start" collisionPadding={12}>
          <fieldset className={editorStyles.automationSettingsFields} disabled={disabled}>
            <ScheduledTaskAutomationOptions context={context} />
            <ScheduledTaskSettingsFields state={submission.state} setState={submission.setState} />
          </fieldset>
        </PopoverContent>
      </Popover>
      <Button type="submit" className={styles.workflowSubmit} disabled={!submission.valid || submission.saving} aria-busy={submission.saving}>{submission.saving ? <Spinner aria-hidden="true" /> : null}{t(submission.unconfirmed ? "scheduled.retryOriginal" : "scheduled.workflowCreate")}</Button>
    </footer>
  </form>
}
