import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { useT } from "@/i18n/context"
import type { EngineSnapshot } from "@/engine/machine"

import type { EmptyStateProps } from "./app-frame.types"
import styles from "./app-frame-status.module.css"

export function DefaultEmptyState({ brandName }: EmptyStateProps) {
  const t = useT()
  return (
    <Empty className="min-h-0 flex-1 rounded-none border-0 px-6 py-10">
      <EmptyHeader>
        <EmptyTitle>{brandName ?? t("rail.workspace")}</EmptyTitle>
        <EmptyDescription>{t("shell.subhead")}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

export function AppFrameLoadingSurface() {
  const t = useT()
  return (
    <div
      className="sr-only"
      data-testid="app-frame-loading"
      role="status"
      aria-busy="true"
      aria-label={t("shell.loadingApp")}
    />
  )
}

export function AppFrameConnectionStatus({
  connection,
}: {
  connection: Exclude<EngineSnapshot["connection"], { status: "connected" }>
}) {
  const t = useT()
  const unavailable = connection.status === "unavailable"
  const label = unavailable ? t("thread.connectionUnavailable") : t("thread.reconnecting")
  return (
    <div
      className="sr-only"
      data-connection-status={connection.status}
      role="status"
      aria-label={label}
      aria-live="polite"
    />
  )
}

export function AppFrameConversationErrorSurface({
  detail,
  onRetry,
  missing = false,
}: {
  detail: string | null
  onRetry: () => void
  missing?: boolean
}) {
  const t = useT()
  return (
    <div
      className={styles.conversationErrorSurface}
      data-testid="app-frame-conversation-error"
      role="alert"
      aria-live="assertive"
    >
      <div className={styles.conversationErrorCard}>
        <h2 className={styles.conversationErrorTitle}>{t(missing ? "thread.conversationMissing" : "rail.listError")}</h2>
        <p className={styles.conversationErrorMessage}>{t(missing ? "thread.conversationMissingHint" : "fail.generic")}</p>
        {!missing && detail ? <p className={styles.conversationErrorDetail}>{detail}</p> : null}
        <Button type="button" variant="outline" onClick={onRetry}>
          {t("thread.retry")}
        </Button>
      </div>
    </div>
  )
}
