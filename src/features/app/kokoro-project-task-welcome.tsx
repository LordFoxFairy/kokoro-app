"use client"

import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { useT } from "@/i18n/context"

import styles from "./kokoro-welcome.module.css"

type ProjectTaskWelcomeProps = Pick<EmptyStateProps, "composer">

/**
 * A fresh project task is a conversation surface, not another project card
 * grid. The project overview remains addressable without `conversation`,
 * while this route owns only the task composer until the first message lands.
 */
export function KokoroProjectTaskWelcome({ composer }: ProjectTaskWelcomeProps) {
  const t = useT()

  return (
    <section
      className={styles.projectTaskSurface}
      data-slot="project-task-welcome"
      data-desktop-web="true"
      aria-labelledby="kokoro-project-task-heading"
    >
      <div className={styles.projectTaskContent}>
        <div className={styles.projectTaskIntro}>
          <span>{t("firstSite.tasks")}</span>
          <h1 id="kokoro-project-task-heading">{t("firstSite.newTask")}</h1>
          <p>{t("firstSite.tasksHint")}</p>
        </div>
        <div className={styles.projectTaskComposer}>{composer}</div>
      </div>
    </section>
  )
}
