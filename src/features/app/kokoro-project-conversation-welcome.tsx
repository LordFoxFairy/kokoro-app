"use client"

import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { useT } from "@/i18n/context"

import styles from "./kokoro-welcome.module.css"

type ProjectConversationWelcomeProps = Pick<EmptyStateProps, "composer">

/**
 * A fresh project conversation is a conversation surface, not another project card
 * grid. The project overview remains addressable without `conversation`,
 * while this route owns only the conversation composer until the first message lands.
 */
export function KokoroProjectConversationWelcome({ composer }: ProjectConversationWelcomeProps) {
  const t = useT()

  return (
    <section
      className={styles.projectConversationSurface}
      data-slot="project-conversation-welcome"
      data-desktop-web="true"
      aria-labelledby="kokoro-project-conversation-heading"
    >
      <div className={styles.projectConversationContent}>
        <div className={styles.projectConversationIntro}>
          <span>{t("firstSite.projectConversations")}</span>
          <h1 id="kokoro-project-conversation-heading">{t("rail.newChat")}</h1>
          <p>{t("firstSite.noProjectConversations")}</p>
        </div>
        <div className={styles.projectConversationComposer}>{composer}</div>
      </div>
    </section>
  )
}
