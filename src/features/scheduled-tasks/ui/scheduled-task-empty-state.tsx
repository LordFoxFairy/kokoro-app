"use client"

import { ArrowRight, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/context"

import { SUGGESTIONS } from "./scheduled-task-presentation"
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
    <section className={styles.content} aria-labelledby="scheduled-empty-title">
      <div
        className={calendarStyles.calendar}
        role="img"
        aria-label={t("scheduled.calendar")}
      >
        <div className={calendarStyles.calendarLines} aria-hidden="true">
          {Array.from({ length: 28 }, (_, index) => (
            <i key={index} data-active={index === 11 ? "true" : undefined} />
          ))}
        </div>
        <span className={calendarStyles.calendarAdd} aria-hidden="true">
          <Plus />
        </span>
      </div>
      <h2 id="scheduled-empty-title">
        {t("scheduled.heroTitle", { brand: brandName })}
      </h2>
      <div className={styles.suggestions}>
        {SUGGESTIONS.map(({ key, icon: Icon }) => {
          const prompt = t(key)
          return (
            <button
              key={key}
              type="button"
              className={styles.suggestion}
              disabled={!canCreate}
              onClick={(event) => openEditor(prompt, event.currentTarget)}
            >
              <Icon aria-hidden="true" />
              <span>{prompt}</span>
              <ArrowRight aria-hidden="true" />
            </button>
          )
        })}
      </div>
      <Button
        type="button"
        className={styles.create}
        disabled={!canCreate}
        onClick={(event) => openEditor("", event.currentTarget)}
      >
        <Plus data-icon="inline-start" aria-hidden="true" />
        {t("scheduled.create")}
      </Button>
    </section>
  )
}
