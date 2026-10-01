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
      className={styles.loadingSurface}
      data-testid="app-frame-loading"
      role="status"
      aria-label={t("shell.loadingApp")}
    >
      <div className={styles.loadingReadingTrack} aria-hidden="true">
        <span className={styles.loadingLine} />
        <span className={styles.loadingLineShort} />
      </div>
      <p className={styles.loadingMessage}>{t("shell.loadingApp")}</p>
      <div className={styles.loadingComposer} aria-hidden="true">
        <span className={styles.loadingComposerLine} />
        <span className={styles.loadingComposerControls}>
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
  )
}

export function AppFrameConnectionStatus({
  connection,
  onReconnect,
}: {
  connection: Exclude<EngineSnapshot["connection"], { status: "connected" }>
  onReconnect: () => void
}) {
  const t = useT()
  const unavailable = connection.status === "unavailable"
  const label = unavailable ? t("thread.connectionUnavailable") : t("thread.reconnecting")
  return (
    <div
      className={styles.connectionStatus}
      data-connection-status={connection.status}
      role="status"
      aria-label={label}
      aria-live="polite"
    >
      <span>{label}</span>
      {unavailable ? (
        <Button type="button" variant="outline" size="sm" onClick={onReconnect}>
          {t("thread.reconnect")}
        </Button>
      ) : null}
    </div>
  )
}

export function AppFrameConversationErrorSurface({
  detail,
  onRetry,
}: {
  detail: string | null
  onRetry: () => void
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
        <h2 className={styles.conversationErrorTitle}>{t("rail.listError")}</h2>
        <p className={styles.conversationErrorMessage}>{t("fail.generic")}</p>
        {detail ? <p className={styles.conversationErrorDetail}>{detail}</p> : null}
        <Button type="button" variant="outline" onClick={onRetry}>
          {t("thread.retry")}
        </Button>
      </div>
    </div>
  )
}
