"use client"

import { useId } from "react"
import { ArrowRight, GitBranch, ListChecks, Mail, MessageSquare, Plus, Sparkles, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/context"
import { interceptMountedSurfaceNavigation, navigateMountedSurface } from "@/ui/navigation/mounted-surface-navigation"

import { SUGGESTIONS } from "./scheduled-task-presentation"
import { scheduledAutomationHref } from "./scheduled-task-location"
import calendarStyles from "./scheduled-task-calendar.module.css"
import styles from "./scheduled-task-surface.module.css"

type ScheduledTaskEmptyStateProps = {
  brandName: string
  canCreate: boolean
  openEditor: (prompt?: string, target?: HTMLElement | null) => void
}

export function ScheduledTaskEmptyState({
  brandName,
  canCreate,
  openEditor,
}: ScheduledTaskEmptyStateProps) {
  const t = useT()
  return (
    <section className={`${styles.content} ${styles.automationOverview}`} aria-labelledby="scheduled-empty-title">
      <h2 id="scheduled-empty-title">
        {t("scheduled.heroTitle", { brand: brandName })}
      </h2>
      {canCreate ? <a className={styles.workflowStart} href={scheduledAutomationHref()} onClick={(event) => interceptMountedSurfaceNavigation(event, event.currentTarget.href)}>{t("scheduled.workflowStart")}<ArrowRight aria-hidden="true" /></a> : null}
      <ul className={styles.automationTypes} aria-label={t("scheduled.automationTypes")}>
        <li className={styles.automationCard}>
          <AutomationSketch kind="scheduled" />
          <div className={styles.automationCardHeading}><h3>{t("scheduled.scheduledType")}</h3></div>
          <p className={styles.automationDescription}>{t("scheduled.scheduledTypeDescription", { brand: brandName })}</p>
          <Button type="button" className={styles.automationAction} disabled={!canCreate}
            onClick={(event) => openEditor("", event.currentTarget)}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            {t("scheduled.create")}
          </Button>
        </li>
        <li className={styles.automationCard}>
          <AutomationSketch kind="trigger" />
          <div className={styles.automationCardHeading}><h3>{t("scheduled.triggerType")}</h3></div>
          <p className={styles.automationDescription}>{t("scheduled.rssDescription")}</p>
          <Button type="button" variant="outline" className={styles.automationAction} disabled={!canCreate} onClick={() => navigateMountedSurface(scheduledAutomationHref())}>{t("scheduled.triggerAction")}<ArrowRight aria-hidden="true" /></Button>
        </li>
        <UnavailableAutomationCard kind="advanced" />
      </ul>
      <ScheduledTaskSuggestions canCreate={canCreate} openEditor={openEditor} />
    </section>
  )
}

function UnavailableAutomationCard({ kind }: { kind: "trigger" | "advanced" }) {
  const t = useT()
  const reasonId = useId()
  const advanced = kind === "advanced"
  return (
    <li className={styles.automationCard}>
      <AutomationSketch kind={kind} />
      <div className={styles.automationCardHeading}>
        <h3>{t(advanced ? "scheduled.advancedType" : "scheduled.triggerType")}</h3>
        {advanced ? <span className={styles.automationBeta}>{t("scheduled.beta")}</span> : null}
      </div>
      <p className={styles.automationDescription}>{t(advanced ? "scheduled.advancedTypeDescription" : "scheduled.triggerTypeDescription")}</p>
      <p id={reasonId} className={styles.automationUnavailable}>{t(advanced ? "scheduled.advancedUnavailable" : "scheduled.triggerUnavailable")}</p>
      <Button type="button" variant="outline" className={styles.automationAction} disabled aria-describedby={reasonId}>
        {t(advanced ? "scheduled.advancedAction" : "scheduled.triggerAction")}
      </Button>
    </li>
  )
}

function AutomationSketch({ kind }: { kind: "scheduled" | "trigger" | "advanced" }) {
  const t = useT()
  if (kind === "scheduled") return (
    <div className={styles.automationSketch}>
      <div className={`${calendarStyles.calendar} ${styles.typeCalendar}`} role="img" aria-label={t("scheduled.calendar")}>
        <div className={calendarStyles.calendarLines} aria-hidden="true">
          {Array.from({ length: 28 }, (_, index) => <i key={index} data-active={index === 11 ? "true" : undefined} />)}
        </div>
        <span className={calendarStyles.calendarAdd} aria-hidden="true"><Plus /></span>
      </div>
    </div>
  )
  return (
    <div className={styles.automationSketch} aria-hidden="true">
      <span className={styles.sketchNode}>{kind === "trigger" ? <Mail /> : <MessageSquare />}</span>
      <span className={styles.sketchLink}><ArrowRight /></span>
      <span className={`${styles.sketchNode} ${styles.sketchHub}`}>{kind === "trigger" ? <Zap /> : <GitBranch />}</span>
      <span className={styles.sketchLink}><ArrowRight /></span>
      <span className={styles.sketchNode}>{kind === "trigger" ? <ListChecks /> : <Sparkles />}</span>
    </div>
  )
}

function ScheduledTaskSuggestions({ canCreate, openEditor }: Pick<ScheduledTaskEmptyStateProps, "canCreate" | "openEditor">) {
  const t = useT()
  return (
    <div className={styles.scheduledSuggestions}>
      <p className={styles.suggestionsLabel}>{t("scheduled.suggestionsTitle")}</p>
      <div className={styles.suggestions}>
        {SUGGESTIONS.map(({ key, icon: Icon }) => {
          const prompt = t(key)
          return (
            <button key={key} type="button" className={styles.suggestion} disabled={!canCreate}
              onClick={(event) => openEditor(prompt, event.currentTarget)}>
              <Icon aria-hidden="true" /><span>{prompt}</span><ArrowRight aria-hidden="true" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
