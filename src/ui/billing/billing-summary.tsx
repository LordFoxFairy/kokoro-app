import { Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatCredits } from "@/billing/format"
import type { BillingSummary as ContractBillingSummary } from "@/contract/http"
import { useT } from "@/i18n/context"

import { type SummaryState } from "./billing-model"
import styles from "./billing-summary.module.css"

type BillingSummaryProps = {
  summary: SummaryState
  embedded: boolean
  retrying: boolean
  onOpenPricing: (() => void) | undefined
}

function EmbeddedSummary({ summary, onOpenPricing }: { summary: ContractBillingSummary | null; onOpenPricing: (() => void) | undefined }) {
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
            <div className={styles.embeddedMetric}><span>{t("billing.creditUnit")}</span><strong>{summary === null ? "—" : formatCredits(summary.available_micros)}</strong></div>

          </div>
        </div>
        <div className={styles.embeddedCreditRow}>
          <Sparkles aria-hidden="true" />
          <div className={styles.embeddedCreditCopy}>
            <div className={styles.embeddedMetric}><span>{t("billing.held")}</span><strong>{summary === null ? "—" : formatCredits(summary.held_micros)}</strong></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function NormalSummary({ summary, onOpenPricing }: { summary: ContractBillingSummary | null; onOpenPricing: (() => void) | undefined }) {
  const t = useT()
  return (
    <>
      <div className={styles.balanceHeader}>
        <div className={styles.balanceMain}>
          <span className={styles.balanceLabel}>{t("billing.balance")}</span>
          <span className={styles.balanceValue}>{summary === null ? "—" : formatCredits(summary.available_micros)} {t("billing.creditUnit")}</span>
        </div>
        {onOpenPricing ? <Button variant="default" size="sm" type="button" className={styles.balanceUpgrade} onClick={onOpenPricing}>{t("firstSite.upgrade")}</Button> : null}
      </div>
      <div className={styles.balanceHeld}>
        <span>{t("billing.held")}</span>
        <span>{summary === null ? "—" : formatCredits(summary.held_micros)} {t("billing.creditUnit")}</span>
      </div>

    </>
  )
}

export function BillingSummary({ summary, embedded, retrying, onOpenPricing }: BillingSummaryProps) {
  const t = useT()
  const confirmed = summary.kind === "ready" ? summary.summary : null
  return (
    <section className={styles.balanceCard} data-testid="billing-balance" data-slot="billing-balance-card" data-embedded={embedded ? "billing" : undefined} aria-label={t("settings.creditsMenu")} aria-busy={summary.kind === "loading" || retrying}>
      {embedded ? <EmbeddedSummary summary={confirmed} onOpenPricing={confirmed === null ? undefined : onOpenPricing} /> : <NormalSummary summary={confirmed} onOpenPricing={confirmed === null ? undefined : onOpenPricing} />}
    </section>
  )
}
