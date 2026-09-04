import { useMemo } from "react"

import type { BillingByModel, BillingLedgerEntry } from "@/contract/http"
import { formatCredits, creditsToNumber } from "@/billing/format"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/context"

import styles from "./billing-usage.module.css"

function BalanceSparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const width = 100
  const height = 28
  const padding = 2
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const stepX = (width - padding * 2) / (values.length - 1)
  const points = values.map((value, index) => {
    const x = padding + index * stepX
    const y = padding + (height - padding * 2) * (1 - (value - min) / span)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(" ")
  return <svg className={styles.sparkline} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden><polyline points={points} fill="none" /></svg>
}

type BillingUsageProps = {
  entries: BillingLedgerEntry[]
  byModelItems: BillingByModel["items"]
  onOpenPricing: (() => void) | undefined
}

export function BillingUsage({ entries, byModelItems, onOpenPricing }: BillingUsageProps) {
  const t = useT()
  const trend = useMemo(() => entries.map((entry) => creditsToNumber(entry.balance_after_micros)).reverse(), [entries])
  const byModelMax = byModelItems.reduce((max, item) => Math.max(max, creditsToNumber(item.spent_micros)), 0)

  return (
    <>
      {trend.length >= 2 ? (
        <section className={styles.trend} data-testid="billing-trend">
          <div className={styles.trendHead}><span className={styles.trendTitle}>{t("billing.trendTitle")}</span><span className={styles.trendHint}>{t("billing.trendHint", { count: String(trend.length) })}</span></div>
          <BalanceSparkline values={trend} />
        </section>
      ) : null}
      {byModelItems.length > 0 ? (
        <section className={styles.byModel} data-testid="billing-by-model">
          <h3 className={styles.byModelTitle}>{t("billing.byModelTitle")}</h3>
          <ul className={styles.byModelList}>
            {byModelItems.map((item) => (
              <li className={styles.byModelRow} key={item.model_binding_id ?? "unattributed"}>
                <div className={styles.byModelRowHead}><span className={styles.byModelName} title={item.model_name}>{item.model_name}</span><span className={styles.byModelSpent}>{formatCredits(item.spent_micros)} {t("billing.creditUnit")}</span></div>
                <div className={styles.byModelBarTrack}><div className={styles.byModelBar} style={{ width: `${byModelMax > 0 ? Math.max(4, (creditsToNumber(item.spent_micros) / byModelMax) * 100) : 0}%` }} /></div>
                <span className={styles.byModelRuns}>{t("billing.byModelRuns", { count: String(item.run_count) })}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {onOpenPricing ? <ButtonLink onOpenPricing={onOpenPricing} label={t("billing.viewPricing")} /> : null}
    </>
  )
}

function ButtonLink({ onOpenPricing, label }: { onOpenPricing: () => void; label: string }) {
  return <Button variant="outline" type="button" className={styles.more} onClick={onOpenPricing}>{label}</Button>
}
