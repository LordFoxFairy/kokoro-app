"use client"

import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Empty, EmptyDescription } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"

// Read the canonical catalog; the paired BFF does not provide checkout.
// Money and credits remain exact BigInt-based presentations.

import { useCallback, useLayoutEffect, useState, useRef } from "react"

import { formatMicros, formatMinor } from "@/billing/format"
import { planIntervalKey } from "@/billing/rules"
import type { PlanCatalogEntry, PricingClient } from "@/billing/pricing"
import { PricingClientError } from "@/billing/pricing"
import { useT } from "@/i18n/context"
import { cn } from "@/lib/utils"

import styles from "./pricing-panel.module.css"
import { useOverlayClose } from "@/ui/shell/use-overlay-close"


type CatalogState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "unavailable" }
  | { kind: "ready"; plans: PlanCatalogEntry[] }

type PricingPanelProps = {
  preview?: boolean
  readBoundary?: ProjectReadBoundary
  client: PricingClient
  onClose: () => void
}

export function PricingPanel({ preview = false, readBoundary, client, onClose }: PricingPanelProps) {
  const t = useT()
  const { open, requestClose, onCloseAutoFocus } = useOverlayClose(onClose)
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) requestClose() }}>
      <DialogContent
        className={cn(styles.panel, "p-0 box-border")}
        data-testid="pricing-panel"
        closeLabel={t("pricing.close")}
        closeButtonTestId="pricing-close"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogTitle className="sr-only">{t("pricing.title")}</DialogTitle>
        <header className={styles.head}>
          <h2 className={styles.title}>{t("pricing.title")}</h2>
        </header>
        <PricingContent preview={preview} {...(readBoundary === undefined ? {} : { readBoundary })} client={client} />
      </DialogContent>
    </Dialog>
  )
}

type PricingContentProps = {
  preview?: boolean
  readBoundary?: ProjectReadBoundary
  client: PricingClient
  embedded?: boolean
}

export function PricingContent(props: PricingContentProps) {
  const { preview = false, readBoundary, client } = props
  const t = useT()
  const [clientIdentity, setClientIdentity] = useState({ client, epoch: 0 })
  if (clientIdentity.client !== client) setClientIdentity({ client, epoch: clientIdentity.epoch + 1 })
  const identity = clientIdentity.client === client ? clientIdentity.epoch : clientIdentity.epoch + 1
  const admitted = preview || (readBoundary?.admitted === true && typeof readBoundary.subject === "string" && readBoundary.subject.trim() !== "" && Number.isSafeInteger(readBoundary.generation) && readBoundary.generation >= 0)
  const scope = JSON.stringify([preview, readBoundary?.admitted, readBoundary?.subject, readBoundary?.generation, identity])
  if (!admitted) return <p>{t("settings.billingRequiresIdentity")}</p>
  return <PricingScopedContent key={scope} {...props} />
}

function PricingScopedContent({ client, embedded = false }: PricingContentProps) {
  const t = useT()
  const [catalog, setCatalog] = useState<CatalogState>({ kind: "loading" })
  const attempt = useRef<{ controller: AbortController; settled: boolean; clear: () => void } | null>(null)
  const load = useCallback(() => {
    attempt.current?.controller.abort()
    attempt.current?.clear()
    const controller = new AbortController()
    const deadline = performance.now() + 10_000
    let rejectAbort!: (reason: unknown) => void
    const interrupted = new Promise<never>((_resolve, reject) => { rejectAbort = reject })
    const abort = () => rejectAbort(controller.signal.reason)
    controller.signal.addEventListener("abort", abort, { once: true })
    const timer = setTimeout(() => controller.abort(new PricingClientError("timeout", "Catalog timed out", null)), 10_000)
    const flight = { controller, settled: false, clear: () => { clearTimeout(timer); controller.signal.removeEventListener("abort", abort) } }
    attempt.current = flight
    const current = () => attempt.current === flight
    const operation = async () => {
      const value = await client.plans(controller.signal)
      controller.signal.throwIfAborted()
      if (performance.now() >= deadline) {
        controller.abort(new PricingClientError("timeout", "Catalog timed out", null))
        controller.signal.throwIfAborted()
      }
      return value
    }
    void Promise.race([operation(), interrupted]).then((value) => {
      if (current()) setCatalog({ kind: "ready", plans: value.plans })
    }).catch((error: unknown) => {
      if (current()) setCatalog({ kind: error instanceof PricingClientError && error.reason === "not_configured" ? "unavailable" : "error" })
    }).finally(() => { flight.settled = true; flight.clear() })
  }, [client])
  useLayoutEffect(() => {
    load()
    return () => {
      const flight = attempt.current
      attempt.current = null
      flight?.controller.abort(new PricingClientError("aborted", "Catalog retired", null))
      flight?.clear()
    }
  }, [load])
  const catalogLoading = catalog.kind === "loading"
  const retry = () => {
    if (attempt.current && !attempt.current.settled) return
    setCatalog({ kind: "loading" }); load()
  }
  return (
    <div className={cn(styles.body, embedded && styles.embeddedBody)} data-embedded={embedded || undefined}>
          {catalog.kind === "ready" && catalog.plans.length > 0 ? (
            <Alert className={styles.unavailable}>
              <AlertDescription>{t("pricing.unavailable")}</AlertDescription>
            </Alert>
          ) : null}

          {catalog.kind === "loading" ? (
            <div className={styles.loadingState} role="status" aria-label={t("pricing.loading")}>
              <Skeleton className={styles.loadingLine} />
              <Skeleton className={styles.loadingLine} />
              <Skeleton className={styles.loadingLineShort} />
            </div>
          ) : catalog.kind === "error" ? (
            <Alert variant="destructive" className={styles.feedback}>
              <AlertDescription>
                <p>{t("pricing.loadError")}</p>
              <Button variant="outline" size="sm" type="button" disabled={catalogLoading} aria-busy={catalogLoading} onClick={retry}>
                {catalogLoading ? <Spinner aria-hidden="true" /> : null}
                {catalogLoading ? t("pricing.loading") : t("pricing.retry")}
              </Button>
              </AlertDescription>
            </Alert>
          ) : catalog.kind === "unavailable" ? (
            <Alert variant="destructive" className={styles.unavailable}>
              <AlertDescription>{t("pricing.unavailable")}</AlertDescription>
            </Alert>
          ) : catalog.plans.length === 0 ? (
            <Empty className={styles.emptyState}>
              <EmptyDescription>{t("pricing.empty")}</EmptyDescription>
            </Empty>
          ) : (
            <ul className={styles.grid}>
              {catalog.plans.map((plan) => (
                <li key={plan.id} className={styles.card} data-testid="pricing-card">
                  <span className={styles.cardName}>{plan.name}</span>
                  <div className={styles.price}>
                    <span className={styles.priceAmount}>{formatMinor(plan.amount_minor)}</span>
                    <span className={styles.priceMeta}>
                      {plan.currency} · {t(planIntervalKey(plan.billing_interval))}
                    </span>
                  </div>
                  <ul className={styles.benefits}>
                    <li className={styles.benefit}>
                      {t("pricing.credits", { credits: formatMicros(plan.credit_micros) })}
                    </li>
                  </ul>
                  <Button variant="default"
                    type="button"
                    className={styles.buy}
                    disabled
                  >
                    {t("pricing.buyUnavailable")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
    </div>
  )
}
