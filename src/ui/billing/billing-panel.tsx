"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { BillingByModel, BillingLedgerEntry, BillingSummary as ContractBillingSummary } from "@/contract/http"
import type { BillingClient } from "@/billing/client"
import { useT } from "@/i18n/context"
import { cn } from "@/lib/utils"
import { useResource } from "@/lib/query"
import { useOverlayClose } from "@/ui/shell/use-overlay-close"

import { BillingLedger } from "./billing-ledger"
import { BY_MODEL_KEY, SUMMARY_KEY, type LedgerFilter, type LedgerState, type SummaryState } from "./billing-model"
import { BillingSummary } from "./billing-summary"
import { BillingUsage } from "./billing-usage"
import styles from "./billing-panel.module.css"

const EMPTY_LEDGER_ENTRIES: BillingLedgerEntry[] = []

type BillingPanelProps = {
  client: BillingClient
  onClose: () => void
  onOpenPricing?: () => void
}

type BillingContentProps = {
  client: BillingClient
  onOpenPricing?: () => void
  embedded?: boolean
}

export function BillingContent({ client, onOpenPricing, embedded = false }: BillingContentProps) {
  const [ledger, setLedger] = useState<LedgerState>({ kind: "loading" })
  const [filter, setFilter] = useState<LedgerFilter>("all")
  const [retrying, setRetrying] = useState(false)
  const ledgerRequestSeqRef = useRef(0)
  const summaryRes = useResource<ContractBillingSummary>(SUMMARY_KEY, useCallback(() => client.summary(), [client]))
  const summary: SummaryState = summaryRes.data !== undefined ? { kind: "ready", summary: summaryRes.data } : summaryRes.error !== undefined ? { kind: "error" } : { kind: "loading" }
  const byModelRes = useResource<BillingByModel>(BY_MODEL_KEY, useCallback(() => client.byModel(), [client]))
  const byModelItems = byModelRes.data?.items ?? []

  const loadLedger = useCallback(async (): Promise<LedgerState> => {
    try {
      const page = await client.ledger()
      return { kind: "ready", entries: page.entries, cursor: page.next_cursor, loadingMore: false }
    } catch {
      return { kind: "error" }
    }
  }, [client])

  const retry = useCallback(async () => {
    if (retrying || (ledger.kind === "ready" && ledger.loadingMore)) return
    const requestSeq = ++ledgerRequestSeqRef.current
    setRetrying(true)
    summaryRes.refetch()
    byModelRes.refetch()
    setLedger({ kind: "loading" })
    try {
      const next = await loadLedger()
      if (requestSeq === ledgerRequestSeqRef.current) setLedger(next)
    } finally {
      setRetrying(false)
    }
  }, [byModelRes, ledger, loadLedger, retrying, summaryRes])

  useEffect(() => {
    const requestSeq = ++ledgerRequestSeqRef.current
    void loadLedger().then((next) => {
      if (requestSeq === ledgerRequestSeqRef.current) setLedger(next)
    })
  }, [loadLedger])

  const loadMore = useCallback(async () => {
    if (retrying || ledger.kind !== "ready" || ledger.cursor === undefined || ledger.loadingMore) return
    const requestSeq = ++ledgerRequestSeqRef.current
    const cursor = ledger.cursor
    setLedger({ ...ledger, loadingMore: true })
    try {
      const page = await client.ledger(cursor)
      if (requestSeq === ledgerRequestSeqRef.current) setLedger({ kind: "ready", entries: [...ledger.entries, ...page.entries], cursor: page.next_cursor, loadingMore: false })
    } catch {
      if (requestSeq === ledgerRequestSeqRef.current) setLedger({ ...ledger, loadingMore: false })
    }
  }, [client, ledger, retrying])

  const entries = ledger.kind === "ready" ? ledger.entries : EMPTY_LEDGER_ENTRIES
  return (
    <div className={cn(styles.body, embedded ? styles.embeddedBody : undefined)} data-embedded={embedded ? "billing" : undefined}>
      <BillingSummary summary={summary} embedded={embedded} retrying={retrying} ledgerLoadingMore={ledger.kind === "ready" && ledger.loadingMore} onRetry={() => void retry()} onOpenPricing={onOpenPricing} />
      {!embedded ? <BillingUsage entries={entries} byModelItems={byModelItems} onOpenPricing={onOpenPricing} /> : null}
      <BillingLedger ledger={ledger} filter={filter} embedded={embedded} retrying={retrying} onFilterChange={setFilter} onRetry={() => void retry()} onLoadMore={() => void loadMore()} />
    </div>
  )
}

export function BillingPanel({ client, onClose, onOpenPricing }: BillingPanelProps) {
  const t = useT()
  const { open, requestClose, onCloseAutoFocus } = useOverlayClose(onClose)
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) requestClose() }}>
      <DialogContent className={cn(styles.panel, "p-0 box-border")} data-testid="billing-panel" closeLabel={t("billing.close")} closeButtonTestId="billing-close" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogTitle className="sr-only">{t("billing.title")}</DialogTitle>
        <header className={styles.head}><h2 className={styles.title}>{t("billing.title")}</h2></header>
        <BillingContent client={client} {...(onOpenPricing === undefined ? {} : { onOpenPricing })} />
      </DialogContent>
    </Dialog>
  )
}
