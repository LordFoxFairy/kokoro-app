"use client"

import { MessageSquare } from "lucide-react"
import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame.types"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/context"
import { cn } from "@/lib/utils"
import { ProjectConversationEmpty } from "./project-conversation-empty"
import styles from "./kokoro-project-workspace.module.css"
import layoutStyles from "./project-workspace-layout.module.css"

type Props = Pick<
  EmptyStateProps,
  | "projectConversations"
  | "projectConversationsLoading"
  | "projectConversationsError"
  | "activeProjectConversationId"
  | "onSelectProjectConversation"
>

/** Project history owns its loading/error/list states, independently of the composer. */
export function ProjectConversations({
  projectConversations = [],
  projectConversationsLoading = false,
  projectConversationsError = false,
  activeProjectConversationId,
  onSelectProjectConversation,
}: Props) {
  const t = useT()
  return (
    <section
      className={cn(styles.conversations, layoutStyles.conversations)}
      aria-labelledby="project-conversation-heading"
    >
      <h2 id="project-conversation-heading">{t("firstSite.recent")}</h2>
      <p className="sr-only">{t("firstSite.projectConversationsPrivate")}</p>
      {projectConversations.length > 0 ? (
        <>
          <div className={styles.conversationList} role="list" aria-busy={projectConversationsLoading || undefined}>
            {projectConversations.map((conversation) => (
              <Button
                key={conversation.id}
                type="button"
                variant={
                  conversation.id === activeProjectConversationId
                    ? "secondary"
                    : "ghost"
                }
                className={styles.conversationRow}
                onClick={() => onSelectProjectConversation?.(conversation.id)}
              >
                <MessageSquare data-icon="inline-start" aria-hidden="true" />
                <span>{conversation.title}</span>
              </Button>
            ))}
          </div>
        </>
      ) : projectConversationsLoading || projectConversationsError ? (
        <div className={styles.conversationState} aria-busy={projectConversationsLoading || undefined}>
          <p className="sr-only" role="status" aria-live="polite">
            {projectConversationsLoading ? t("firstSite.conversationsLoading") : t("firstSite.conversationsError")}
          </p>
        </div>
      ) : (
        <ProjectConversationEmpty />
      )}
    </section>
  )
}
