import { CircleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useT } from "@/i18n/context"

import styles from "./execution-unavailable-feedback.module.css"

/** Pre-admission dependency state, not a completed or failed Agent run. */
export function ExecutionUnavailableFeedback({ canRetry, retrying, onRetry }: {
  canRetry: boolean
  retrying: boolean
  onRetry: () => void
}) {
  const t = useT()
  return (
    <div role="status" className={styles.notice}>
      <CircleAlert aria-hidden="true" className={styles.icon} />
      <div className={styles.body}>
        <p className={styles.title}>{t("fail.agentNotConfigured")}</p>
        <p className={styles.hint}>{t("fail.executionUnavailableHint")}</p>
        {canRetry ? (
          <Button className={styles.action} variant="outline" size="sm" type="button" disabled={retrying} aria-busy={retrying} onClick={onRetry}>
            {retrying ? <Spinner aria-hidden="true" /> : null}
            {t("thread.retryOriginal")}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
