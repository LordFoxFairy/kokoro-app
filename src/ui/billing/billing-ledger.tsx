import { CircleHelp } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import type { BillingLedgerEntry } from "@/contract/http"
import { formatSignedCredits, microSign, creditsToNumber } from "@/billing/format"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useLocale, useT } from "@/i18n/context"

import { formatTime, groupByDay, reasonKey, type LedgerFilter, type LedgerState } from "./billing-model"
import panelStyles from "./billing-panel.module.css"
import styles from "./billing-ledger.module.css"

type BillingLedgerProps = {
  ledger: LedgerState
  filter: LedgerFilter
  embedded: boolean
  retrying: boolean
  onFilterChange: (filter: LedgerFilter) => void
  onRetry: () => void
  onLoadMore: () => void
}

function LoadingLedger({ label, embedded }: { label: string; embedded: boolean }) {
  return (
    <div className={panelStyles.loadingState} role="status" aria-label={label}>
      <Skeleton className={panelStyles.loadingLine} />
      <Skeleton className={panelStyles.loadingLine} />
      {!embedded ? <Skeleton className={panelStyles.loadingLineShort} /> : null}
    </div>
  )
}

function LedgerError({ message, retryLabel, retrying, embedded, onRetry }: { message: string; retryLabel: string; retrying: boolean; embedded: boolean; onRetry: () => void }) {
  return (
    <Alert variant="destructive" className={panelStyles.feedback}>
      <AlertDescription>
        <p>{message}</p>
        <Button variant="outline" size="sm" type="button" disabled={embedded ? undefined : retrying} aria-busy={embedded ? undefined : retrying} onClick={() => void onRetry()}>
          {!embedded && retrying ? <Spinner aria-hidden="true" /> : null}
          {!embedded && retrying ? message : retryLabel}
        </Button>
      </AlertDescription>
    </Alert>
  )
}

function EmbeddedEntry({ entry, label }: { entry: BillingLedgerEntry; label: string }) {
  const { locale } = useLocale()
  const formatter = new Intl.NumberFormat(locale === "zh" ? "zh-CN" : locale, { maximumFractionDigits: 4 })
  const value = creditsToNumber(entry.delta_micros)
  const signed = value > 0 ? `+${formatter.format(value)}` : formatter.format(value)
  return (
    <li className={styles.entry}>
      <div className={styles.entryMain}>{entry.conversation_id ? <Link className={styles.entryReason} href={`/app?conversation=${encodeURIComponent(entry.conversation_id)}`}>{label}</Link> : <span className={styles.entryReason}>{label}</span>}</div>
      <span className={styles.entryDelta} data-sign={microSign(entry.delta_micros)}>{signed}</span>
    </li>
  )
}

function LedgerEntries({ entries, embedded, localeTag }: { entries: BillingLedgerEntry[]; embedded: boolean; localeTag: string }) {
  const t = useT()
  const days = useMemo(() => groupByDay(entries), [entries])
  return (
    <>
      {days.map((day) => {
        const firstEntry = day.entries[0]
        if (firstEntry === undefined) return null
        return (
          <div key={day.key} className={styles.dayGroup}>
            <div className={styles.dayHead} data-testid="billing-day">
              <span className={styles.dayLabel}>{embedded ? new Date(firstEntry.created_at).toLocaleDateString(localeTag, { weekday: "short" }) : day.label}</span>
              {!embedded ? <span className={styles.dayNet} data-sign={microSign(day.net)}>{formatSignedCredits(day.net)} {t("billing.creditUnit")}</span> : null}
            </div>
            <ul className={styles.ledger}>
              {day.entries.map((entry) => {
                const key = reasonKey(entry.reason)
                const label = key ? t(key) : entry.reason
                if (embedded) return <EmbeddedEntry key={entry.entry_id} entry={entry} label={entry.title ?? label} />
                return (
                  <li key={entry.entry_id} className={styles.entry}>
                    <div className={styles.entryMain}>
                      <span className={styles.entryReason}>{label}</span>
                      <span className={styles.entryMeta}>
                        <span className={styles.entryTime}>{formatTime(entry.created_at)}</span>
                        {entry.run_id ? <span className={styles.runTag} title={entry.run_id}>{t("billing.runTag", { id: entry.run_id.slice(-6) })}</span> : null}
                      </span>
                    </div>
                    <span className={styles.entryDelta} data-sign={microSign(entry.delta_micros)}>{formatSignedCredits(entry.delta_micros)}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </>
  )
}

export function BillingLedger({ ledger, filter, embedded, retrying, onFilterChange, onRetry, onLoadMore }: BillingLedgerProps) {
  const t = useT()
  const { locale } = useLocale()
  const localeTag = locale === "zh" ? "zh-CN" : locale
  const allEntries = useMemo(() => ledger.kind === "ready" ? ledger.entries : [], [ledger])
  const filteredEntries = useMemo(() => {
    if (embedded || filter === "all") return allEntries
    const sign = filter === "spend" ? "negative" : "positive"
    return allEntries.filter((entry) => microSign(entry.delta_micros) === sign)
  }, [allEntries, embedded, filter])
  const days = useMemo(() => groupByDay(filteredEntries), [filteredEntries])

  return (
    <section data-testid="billing-ledger" data-slot="billing-ledger">
      <div className={styles.ledgerHeadRow}>
        <h3 className={styles.ledgerHead}>{t("billing.ledgerTitle")}{embedded ? <CircleHelp aria-hidden="true" /> : null}</h3>
        {!embedded && ledger.kind === "ready" && ledger.entries.length > 0 ? (
          <ToggleGroup type="single" value={filter} onValueChange={(value) => { if (value === "all" || value === "spend" || value === "credit") onFilterChange(value) }} className={styles.filters} aria-label={t("billing.ledgerTitle")}>
            {(["all", "spend", "credit"] as const).map((value) => <ToggleGroupItem key={value} value={value} className={styles.filterChip} data-testid={`billing-filter-${value}`}>{t(value === "all" ? "billing.filterAll" : value === "spend" ? "billing.filterSpend" : "billing.filterCredit")}</ToggleGroupItem>)}
          </ToggleGroup>
        ) : null}
      </div>
      {ledger.kind === "loading" ? <LoadingLedger label={t("billing.loading")} embedded={embedded} /> : null}
      {ledger.kind === "error" ? <LedgerError message={t("billing.loadError")} retryLabel={t("billing.retry")} retrying={retrying} embedded={embedded} onRetry={onRetry} /> : null}
      {ledger.kind === "ready" && ledger.entries.length === 0 ? <Empty className={panelStyles.emptyState}><EmptyDescription>{t("billing.ledgerEmpty")}</EmptyDescription></Empty> : null}
      {ledger.kind === "ready" && ledger.entries.length > 0 && days.length === 0 ? <Empty className={panelStyles.emptyState}><EmptyDescription>{t("billing.filterEmpty")}</EmptyDescription></Empty> : null}
      {ledger.kind === "ready" && ledger.entries.length > 0 && days.length > 0 ? (
        <>
          <LedgerEntries entries={filteredEntries} embedded={embedded} localeTag={localeTag} />
          {ledger.cursor !== undefined ? <Button variant="outline" type="button" className={styles.more} disabled={ledger.loadingMore || retrying} aria-busy={embedded ? undefined : ledger.loadingMore} onClick={onLoadMore}>{!embedded && ledger.loadingMore ? <Spinner aria-hidden="true" /> : null}{ledger.loadingMore ? t("billing.loading") : t("billing.loadMore")}</Button> : null}
        </>
      ) : null}
    </section>
  )
}
