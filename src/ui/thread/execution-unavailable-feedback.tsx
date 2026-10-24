import { CircleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type { MessageKey } from "@/i18n/messages"
import { useT } from "@/i18n/context"

import styles from "./execution-unavailable-feedback.module.css"

type RecoveryFeedbackProps = { canRetry: boolean; retrying: boolean; onRetry: () => void }

/** Dependency unavailability is distinct from both unknown admission and failed execution. */
export function ExecutionUnavailableFeedback(props: RecoveryFeedbackProps) {
  return <RequestRecoveryFeedback {...props} title="fail.agentNotConfigured" hint="fail.executionUnavailableHint" />
}

export function UnconfirmedSubmissionFeedback(props: RecoveryFeedbackProps) {
  return <RequestRecoveryFeedback {...props} title="thread.submissionUnconfirmed" hint="thread.submissionUnconfirmedHint" />
}

function RequestRecoveryFeedback({ canRetry, retrying, onRetry, title, hint }: RecoveryFeedbackProps & { title: MessageKey; hint: MessageKey }) {
  const t = useT()
  return (
    <div role="status" className={styles.notice}>
      <CircleAlert aria-hidden="true" className={styles.icon} />
      <div className={styles.body}>
        <p className={styles.title}>{t(title)}</p>
        <p className={styles.hint}>{t(hint)}</p>
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
