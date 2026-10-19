"use client"

import { MessageSquare } from "lucide-react"
import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame.types"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
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
  | "onRetryProjectConversations"
  | "activeProjectConversationId"
  | "onSelectProjectConversation"
>

/** Project history owns its loading/error/list states, independently of the composer. */
export function ProjectConversations({
  projectConversations = [],
  projectConversationsLoading = false,
  projectConversationsError = false,
  onRetryProjectConversations,
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
      {projectConversationsLoading ? (
        <div
          className={styles.conversationState}
          data-testid="project-conversations-loading"
          aria-busy="true"
        >
          <div className={styles.conversationLoadingRows} aria-hidden="true">
            <Skeleton className={styles.conversationLoadingRow} />
            <Skeleton className={styles.conversationLoadingRow} />
            <Skeleton className={styles.conversationLoadingRowShort} />
          </div>
          <p className={styles.conversationLoadingMessage} role="status">
            {t("firstSite.conversationsLoading")}
          </p>
        </div>
      ) : projectConversationsError ? (
        <div
          className={styles.conversationState}
          data-testid="project-conversations-error"
          role="alert"
          aria-labelledby="project-conversations-error-title"
        >
          <p
            id="project-conversations-error-title"
            className={styles.conversationErrorMessage}
          >
            {t("firstSite.conversationsError")}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={onRetryProjectConversations}
            disabled={!onRetryProjectConversations}
          >
            {t("firstSite.retry")}
          </Button>
        </div>
      ) : projectConversations.length > 0 ? (
        <div className={styles.conversationList} role="list">
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
      ) : (
        <ProjectConversationEmpty />
      )}
    </section>
  )
}
