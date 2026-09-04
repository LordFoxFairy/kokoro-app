import { CalendarSync, Sparkles } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { creditsToNumber, formatCredits } from "@/billing/format"
import type { BillingSummary as ContractBillingSummary } from "@/contract/http"
import { useLocale, useT } from "@/i18n/context"

import { isLowBalance, quotaPeriodKey, type SummaryState } from "./billing-model"
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
    <div className={panelStyles.loadingState} role="status" aria-label={label}>
      <Skeleton className={panelStyles.loadingLine} />
      <Skeleton className={panelStyles.loadingLineShort} />
    </div>
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
          disabled={embedded ? undefined : busy}
          aria-busy={embedded ? undefined : retrying}
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
  const { locale } = useLocale()
  const formatter = new Intl.NumberFormat(locale === "zh" ? "zh-CN" : locale, { maximumFractionDigits: 4 })
  const formatEmbeddedCredits = (micros: string) => formatter.format(creditsToNumber(micros))

  return (
    <div className={styles.embeddedBalanceContent}>
      <div className={styles.embeddedPlanHeader}>
        <strong>
          {summary.plan_label?.trim().toLowerCase() === "free" || !summary.plan_label
            ? t("billing.freeTier")
            : summary.plan_label}
        </strong>
        {onOpenPricing ? <Button variant="default" size="sm" type="button" className={styles.balanceUpgrade} onClick={onOpenPricing}>{t("firstSite.upgrade")}</Button> : null}
      </div>
      <div className={styles.embeddedCreditRows}>
        <div className={styles.embeddedCreditRow}>
          <Sparkles aria-hidden="true" />
          <div className={styles.embeddedCreditCopy}>
            <div className={styles.embeddedMetric}><span>{t("billing.creditUnit")}</span><strong>{formatEmbeddedCredits(summary.balance_micros)}</strong></div>
            <div className={styles.embeddedMetricSubrow}><span>{t("settings.freeCredits")}</span><span>{formatEmbeddedCredits(summary.free_credit_micros ?? summary.balance_micros)}</span></div>
          </div>
        </div>
        <div className={styles.embeddedCreditRow}>
          <CalendarSync aria-hidden="true" />
          <div className={styles.embeddedCreditCopy}>
            <div className={styles.embeddedMetric}><span>{t("billing.dailyRefresh")}</span><strong>{summary.daily_refresh_micros === null || summary.daily_refresh_micros === undefined ? "—" : formatEmbeddedCredits(summary.daily_refresh_micros)}</strong></div>
            {summary.daily_refresh_micros && summary.daily_refresh_time ? <p className={styles.embeddedRefreshHint}>{t("billing.dailyRefreshHint", { time: summary.daily_refresh_time, credits: formatEmbeddedCredits(summary.daily_refresh_micros) })}</p> : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function NormalSummary({ summary, onOpenPricing }: { summary: ContractBillingSummary; onOpenPricing: (() => void) | undefined }) {
  const t = useT()
  const periodKey = summary.quota_period === null ? null : quotaPeriodKey(summary.quota_period)
  return (
    <>
      <div className={styles.balanceHeader}>
        <div className={styles.balanceMain}>
          <span className={styles.balanceLabel}>{t("billing.balance")}</span>
          <span className={styles.balanceValue}>{formatCredits(summary.balance_micros)} {t("billing.creditUnit")}</span>
        </div>
        {onOpenPricing ? <Button variant="default" size="sm" type="button" className={styles.balanceUpgrade} onClick={onOpenPricing}>{t("firstSite.upgrade")}</Button> : null}
      </div>
      <div className={styles.balanceHeld}>
        <span>{t("billing.held")}</span>
        <span>{formatCredits(summary.held_micros)} {t("billing.creditUnit")}</span>
      </div>
      {summary.quota_micros !== null ? (
        <div className={styles.balanceHeld} data-testid="billing-quota">
          <span>
            {t("billing.quotaLabel")}
            {periodKey ? `（${t(periodKey)}）` : ""}
          </span>
          <span>{formatCredits(summary.quota_micros)} {t("billing.creditUnit")}</span>
        </div>
      ) : null}
    </>
  )
}

export function BillingSummary({ summary, embedded, retrying, ledgerLoadingMore, onRetry, onOpenPricing }: BillingSummaryProps) {
  const t = useT()
  const lowBalance = summary.kind === "ready" && isLowBalance(summary.summary.balance_micros)
  return (
    <>
      {!embedded && lowBalance ? (
        <section className={styles.lowBalance} data-testid="billing-low-balance">
          <div className={styles.lowBalanceText}>
            <strong className={styles.lowBalanceTitle}>{t("billing.lowBalanceTitle")}</strong>
            <span className={styles.lowBalanceBody}>{t("billing.lowBalanceBody")}</span>
          </div>
          {onOpenPricing ? <Button variant="default" type="button" className={styles.lowBalanceCta} onClick={onOpenPricing}>{t("billing.lowBalanceCta")}</Button> : null}
        </section>
      ) : null}
      <section className={styles.balanceCard} data-testid="billing-balance" data-slot="billing-balance-card">
        {summary.kind === "loading" ? <LoadingSummary label={t("billing.loading")} /> : null}
        {summary.kind === "error" ? <SummaryError label={t("billing.loadError")} retryLabel={t("billing.retry")} retrying={retrying} onRetry={onRetry} embedded={embedded} ledgerLoadingMore={ledgerLoadingMore} /> : null}
        {summary.kind === "ready" ? (embedded ? <EmbeddedSummary summary={summary.summary} onOpenPricing={onOpenPricing} /> : <NormalSummary summary={summary.summary} onOpenPricing={onOpenPricing} />) : null}
      </section>
    </>
  )
}
