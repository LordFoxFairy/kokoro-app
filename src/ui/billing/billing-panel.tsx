"use client"

import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"

import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { BillingLedgerEntry } from "@/contract/http"
import { BillingClientError, type BillingClient } from "@/billing/client"
import { useT } from "@/i18n/context"
import { cn } from "@/lib/utils"
import { useOverlayClose } from "@/ui/shell/use-overlay-close"

import { BillingLedger } from "./billing-ledger"
import { type LedgerFilter, type LedgerState, type SummaryState } from "./billing-model"
import { BillingSummary } from "./billing-summary"
import { BillingUsage } from "./billing-usage"
import styles from "./billing-panel.module.css"

const EMPTY_LEDGER_ENTRIES: BillingLedgerEntry[] = []

function readActor(): string | null | undefined {
  try { return window.localStorage.getItem("kokoro.web.auth-index-subject") } catch { return undefined }
}

function uniqueEntries(entries: BillingLedgerEntry[]): BillingLedgerEntry[] {
  const seen = new Set<string>()
  return entries.filter((entry) => { if (seen.has(entry.journal_id)) return false; seen.add(entry.journal_id); return true })
}

type BillingPanelProps = {
  preview?: boolean
  readBoundary?: ProjectReadBoundary
  client: BillingClient
  onClose: () => void
  onOpenPricing?: () => void
}

type BillingContentProps = {
  preview?: boolean
  readBoundary?: ProjectReadBoundary
  client: BillingClient
  onOpenPricing?: () => void
  embedded?: boolean
}

export function BillingContent(props: BillingContentProps) {
  const { preview = false, readBoundary, client } = props
  const t = useT()
  const [clientIdentity, setClientIdentity] = useState({ client, epoch: 0 })
  if (clientIdentity.client !== client) setClientIdentity({ client, epoch: clientIdentity.epoch + 1 })
  const identity = clientIdentity.client === client ? clientIdentity.epoch : clientIdentity.epoch + 1
  const admitted = preview || (readBoundary?.admitted === true && typeof readBoundary.subject === "string" && readBoundary.subject.trim() !== "" && Number.isSafeInteger(readBoundary.generation) && readBoundary.generation >= 0)
  const scope = JSON.stringify([preview, readBoundary?.admitted, readBoundary?.subject, readBoundary?.generation, identity])
  if (!admitted) return <p>{t("settings.billingRequiresIdentity")}</p>
  return <BillingScopedContent key={scope} {...props} />
}

function BillingScopedContent({ client, onOpenPricing, embedded = false }: BillingContentProps) {
  const t = useT()
  const unavailableId = useId()
  const actor = readActor()
  const [projection, setProjection] = useState<{ client: BillingClient; actor: string | null | undefined; summary: SummaryState; ledger: LedgerState }>({ client, actor, summary: { kind: "loading" }, ledger: { kind: "loading" } })
  const [filter, setFilter] = useState<LedgerFilter>("all")
  const [retrying, setRetrying] = useState(false)
  const attempt = useRef<{ controller: AbortController; client: BillingClient; actor: string | null | undefined; paging: boolean; cursors: Set<string> } | null>(null)
  const matches = projection.client === client && projection.actor === actor
  const summary: SummaryState = matches ? projection.summary : { kind: "loading" }
  const ledger: LedgerState = useMemo(() => matches ? projection.ledger : { kind: "loading" }, [matches, projection.ledger])

  const refresh = useCallback(() => {
    attempt.current?.controller.abort()
    const flight = { controller: new AbortController(), client, actor, paging: false, cursors: new Set<string>() }
    attempt.current = flight
    const current = () => attempt.current === flight && !flight.controller.signal.aborted && readActor() === actor
    setRetrying(true)
    setProjection({ client, actor, summary: { kind: "loading" }, ledger: { kind: "loading" } })
    const summaryRead = async () => {
      try {
        if (actor === undefined) throw new Error("billing_identity_unavailable")
        const value = await client.summary(flight.controller.signal)
        if (current()) setProjection((previous) => ({ ...previous, summary: { kind: "ready", summary: value } }))
      } catch (error) {
        if (current()) setProjection((previous) => ({ ...previous, summary: { kind: error instanceof BillingClientError && error.reason === "missing_account" ? "missing_account" : "error" } }))
      }
    }
    const ledgerRead = async () => {
      try {
        if (actor === undefined) throw new Error("billing_identity_unavailable")
        const page = await client.ledger(undefined, flight.controller.signal)
        if (page.page.next_cursor === "") throw new Error("billing_cursor_invalid")
        const entries = uniqueEntries(page.items)
        if (current()) setProjection((previous) => ({ ...previous, ledger: { kind: "ready", entries, cursor: page.page.next_cursor, loadingMore: false, pageError: false } }))
      } catch (error) {
        if (current()) setProjection((previous) => ({ ...previous, ledger: { kind: error instanceof BillingClientError && error.reason === "missing_account" ? "missing_account" : "error" } }))
      }
    }
    void Promise.all([summaryRead(), ledgerRead()]).finally(() => { if (current()) setRetrying(false) })
  }, [actor, client])

  useLayoutEffect(() => {
    let live = true
    queueMicrotask(() => { if (live) refresh() })
    return () => { live = false; attempt.current?.controller.abort(); attempt.current = null }
  }, [refresh])

  const loadMore = useCallback(async () => {
    const flight = attempt.current
    if (!flight || flight.controller.signal.aborted || flight.paging || retrying || ledger.kind !== "ready" || ledger.cursor === null || readActor() !== flight.actor) return
    flight.paging = true
    const cursor = ledger.cursor
    const current = () => attempt.current === flight && !flight.controller.signal.aborted && readActor() === flight.actor
    setProjection((previous) => ({ ...previous, ledger: { ...ledger, loadingMore: true, pageError: false } }))
    try {
      const page = await client.ledger(cursor, flight.controller.signal)
      if (page.page.next_cursor === "" || page.page.next_cursor === cursor || (page.page.next_cursor !== null && flight.cursors.has(page.page.next_cursor))) throw new Error("billing_cursor_repeated")
      if (current()) {
        flight.cursors.add(cursor)
        setProjection((previous) => ({ ...previous, ledger: { kind: "ready", entries: uniqueEntries([...ledger.entries, ...page.items]), cursor: page.page.next_cursor, loadingMore: false, pageError: false } }))
      }
    } catch {
      if (current()) setProjection((previous) => ({ ...previous, ledger: { ...ledger, loadingMore: false, pageError: true } }))
    } finally {
      flight.paging = false
    }
  }, [client, ledger, retrying])
  const retry = () => { if (!retrying && !(ledger.kind === "ready" && ledger.loadingMore)) refresh() }

  const entries = ledger.kind === "ready" ? ledger.entries : EMPTY_LEDGER_ENTRIES
  const content = (
    <div className={cn(styles.body, embedded ? styles.embeddedBody : undefined)} data-embedded={embedded ? "billing" : undefined}>
      <BillingSummary summary={summary} embedded={embedded} retrying={retrying} ledgerLoadingMore={ledger.kind === "ready" && ledger.loadingMore} onRetry={() => void retry()} onOpenPricing={onOpenPricing} />
      {!embedded ? <BillingUsage entries={entries} onOpenPricing={onOpenPricing} /> : null}
      <BillingLedger ledger={ledger} filter={filter} embedded={embedded} retrying={retrying} onFilterChange={setFilter} onRetry={() => void retry()} onLoadMore={() => void loadMore()} />
    </div>
  )
  if (!embedded) return content
  return (
    <Tabs value="tasks" className={styles.resourceTabs}>
      <TabsList variant="line" className={styles.resourceList} aria-label={t("billing.resourceCategories")}>
        <TabsTrigger value="tasks">{t("billing.tasksScope")}</TabsTrigger>
        <TabsTrigger value="websites-games" disabled aria-describedby={unavailableId}>{t("billing.websitesGamesScope")}</TabsTrigger>
        <TabsTrigger value="computer" disabled aria-describedby={unavailableId}>{t("billing.computerScope")}</TabsTrigger>
        <TabsTrigger value="phone" disabled aria-describedby={unavailableId}>{t("billing.phoneScope")}</TabsTrigger>
      </TabsList>
      <p id={unavailableId} className={styles.resourceUnavailable}>{t("billing.resourceUnavailable")}</p>
      <TabsContent value="tasks">{content}</TabsContent>
    </Tabs>
  )
}

export function BillingPanel({ preview = false, readBoundary, client, onClose, onOpenPricing }: BillingPanelProps) {
  const t = useT()
  const { open, requestClose, onCloseAutoFocus } = useOverlayClose(onClose)
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) requestClose() }}>
      <DialogContent className={cn(styles.panel, "p-0 box-border")} data-testid="billing-panel" closeLabel={t("billing.close")} closeButtonTestId="billing-close" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogTitle className="sr-only">{t("billing.title")}</DialogTitle>
        <header className={styles.head}><h2 className={styles.title}>{t("billing.title")}</h2></header>
        <BillingContent preview={preview} {...(readBoundary === undefined ? {} : { readBoundary })} client={client} {...(onOpenPricing === undefined ? {} : { onOpenPricing })} />
      </DialogContent>
    </Dialog>
  )
}
