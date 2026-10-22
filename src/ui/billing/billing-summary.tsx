import { Sparkles } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { formatCredits } from "@/billing/format"
import type { BillingSummary as ContractBillingSummary } from "@/contract/http"
import { useT } from "@/i18n/context"

import { type SummaryState } from "./billing-model"
import panelStyles from "./billing-panel.module.css"
import styles from "./billing-summary.module.css"

type BillingSummaryProps = {
  summary: SummaryState
  embedded: boolean
  retrying: boolean
  ledgerLoadingMore: boolean
  onRetry: () => void
  onOpenPricing: (() => void) | undefined
}

function LoadingSummary({ label }: { label: string }) {
  return (
    <div className={panelStyles.loadingState} role="status" aria-label={label} />
  )
}

function SummaryError({ label, retryLabel, retrying, onRetry, embedded, ledgerLoadingMore }: {
  label: string
  retryLabel: string
  retrying: boolean
  onRetry: () => void
  embedded: boolean
  ledgerLoadingMore: boolean
}) {
  const busy = retrying || ledgerLoadingMore
  return (
    <Alert variant="destructive" className={panelStyles.feedback}>
      <AlertDescription>
        <p>{label}</p>
        <Button
          variant="outline"
          size="sm"
          type="button"
          disabled={busy}
          aria-busy={retrying}
          onClick={() => void onRetry()}
        >
          {!embedded && retrying ? <Spinner aria-hidden="true" /> : null}
          {!embedded && retrying ? label : retryLabel}
        </Button>
      </AlertDescription>
    </Alert>
  )
}

function EmbeddedSummary({ summary, onOpenPricing }: { summary: ContractBillingSummary; onOpenPricing: (() => void) | undefined }) {
  const t = useT()

  return (
    <div className={styles.embeddedBalanceContent}>
      <div className={styles.embeddedPlanHeader}>
        <strong>
          {t("billing.balance")}
        </strong>
        {onOpenPricing ? <Button variant="default" size="sm" type="button" className={styles.balanceUpgrade} onClick={onOpenPricing}>{t("firstSite.upgrade")}</Button> : null}
      </div>
      <div className={styles.embeddedCreditRows}>
        <div className={styles.embeddedCreditRow}>
          <Sparkles aria-hidden="true" />
          <div className={styles.embeddedCreditCopy}>
            <div className={styles.embeddedMetric}><span>{t("billing.creditUnit")}</span><strong>{formatCredits(summary.available_micros)}</strong></div>

          </div>
        </div>
        <div className={styles.embeddedCreditRow}>
          <Sparkles aria-hidden="true" />
          <div className={styles.embeddedCreditCopy}>
            <div className={styles.embeddedMetric}><span>{t("billing.held")}</span><strong>{formatCredits(summary.held_micros)}</strong></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function NormalSummary({ summary, onOpenPricing }: { summary: ContractBillingSummary; onOpenPricing: (() => void) | undefined }) {
  const t = useT()
  return (
    <>
      <div className={styles.balanceHeader}>
        <div className={styles.balanceMain}>
          <span className={styles.balanceLabel}>{t("billing.balance")}</span>
          <span className={styles.balanceValue}>{formatCredits(summary.available_micros)} {t("billing.creditUnit")}</span>
        </div>
        {onOpenPricing ? <Button variant="default" size="sm" type="button" className={styles.balanceUpgrade} onClick={onOpenPricing}>{t("firstSite.upgrade")}</Button> : null}
      </div>
      <div className={styles.balanceHeld}>
        <span>{t("billing.held")}</span>
        <span>{formatCredits(summary.held_micros)} {t("billing.creditUnit")}</span>
      </div>

    </>
  )
}

export function BillingSummary({ summary, embedded, retrying, ledgerLoadingMore, onRetry, onOpenPricing }: BillingSummaryProps) {
  const t = useT()
  return (
    <>
      <section className={styles.balanceCard} data-testid="billing-balance" data-slot="billing-balance-card">
        {summary.kind === "loading" ? <LoadingSummary label={t("billing.loading")} /> : null}
        {summary.kind === "error" ? <SummaryError label={t("billing.loadError")} retryLabel={t("billing.retry")} retrying={retrying} onRetry={onRetry} embedded={embedded} ledgerLoadingMore={ledgerLoadingMore} /> : null}
        {summary.kind === "ready" ? (embedded ? <EmbeddedSummary summary={summary.summary} onOpenPricing={onOpenPricing} /> : <NormalSummary summary={summary.summary} onOpenPricing={onOpenPricing} />) : null}
      </section>
    </>
  )
}
