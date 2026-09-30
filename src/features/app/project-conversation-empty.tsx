"use client"

import { MessageSquareDashed } from "lucide-react"

import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { useT } from "@/i18n/context"

import styles from "./kokoro-project-workspace.module.css"

export function ProjectConversationEmpty() {
  const t = useT()

  return (
    <Empty className={styles.emptyConversation}>
      <EmptyMedia><MessageSquareDashed aria-hidden="true" /></EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{t("firstSite.noProjectConversations")}</EmptyTitle>
      </EmptyHeader>
    </Empty>
  )
}
