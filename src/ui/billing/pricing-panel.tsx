"use client"

import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { PackageOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Empty, EmptyDescription, EmptyMedia } from "@/components/ui/empty"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// Read the canonical catalog; the paired BFF does not provide checkout.
// Money and credits remain exact BigInt-based presentations.

import { useCallback, useLayoutEffect, useState, useRef, useId } from "react"

import { formatMicros, formatMinor } from "@/billing/format"
import { planIntervalKey } from "@/billing/rules"
import type { PlanCatalogEntry, PricingClient } from "@/billing/pricing"
import { PricingClientError } from "@/billing/pricing"
import { useT } from "@/i18n/context"
import { cn } from "@/lib/utils"

import styles from "./pricing-panel.module.css"
import { PricingPlanDetailsDialog } from "./pricing-plan-details-dialog"
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
  const [period, setPeriod] = useState<"all" | PlanCatalogEntry["billing_interval"]>("all")
  const periodId = useId()
  const unavailableId = useId()
  const attempt = useRef<{ controller: AbortController; clear: () => void } | null>(null)
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
    const flight = { controller, clear: () => { clearTimeout(timer); controller.signal.removeEventListener("abort", abort) } }
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
    }).finally(() => { flight.clear() })
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
  return (
    <div className={cn(styles.body, embedded && styles.embeddedBody)} data-embedded={embedded || undefined}>
          {catalog.kind === "ready" && catalog.plans.length > 0 ? (
            <Alert className={styles.unavailable}>
              <AlertDescription id={unavailableId}>{t("pricing.unavailable")}</AlertDescription>
            </Alert>
          ) : null}

          {catalog.kind === "loading" || catalog.kind === "error" ? (
            <div className={styles.readState} aria-busy={catalog.kind === "loading"}>
              <span className="sr-only" role="status">
                {t(catalog.kind === "loading" ? "pricing.loading" : "pricing.loadError")}
              </span>
            </div>
          ) : catalog.kind === "unavailable" ? (
            <Alert variant="destructive" className={styles.unavailable}>
              <AlertDescription>{t("pricing.unavailable")}</AlertDescription>
            </Alert>
          ) : catalog.plans.length === 0 ? (
            <Empty className={styles.emptyState}>
              <EmptyMedia variant="icon"><PackageOpen aria-hidden="true" /></EmptyMedia>
              <EmptyDescription>{t("pricing.empty")}</EmptyDescription>
            </Empty>
          ) : (
            <>
            <label className={styles.period} htmlFor={periodId}>{t("pricing.billingPeriod")}
              <Select value={period} onValueChange={(value) => {
                if (value === "all" || value === "month" || value === "year" || value === "once") setPeriod(value)
              }}>
                <SelectTrigger id={periodId} aria-label={t("pricing.billingPeriod")}><SelectValue /></SelectTrigger>
                <SelectContent position="popper" className={styles.periodOptions}>
                  <SelectItem value="all">{t("pricing.allPeriods")}</SelectItem>
                  <SelectItem value="month">{t("pricing.intervalMonth")}</SelectItem>
                  <SelectItem value="year">{t("pricing.intervalYear")}</SelectItem>
                  <SelectItem value="once">{t("pricing.intervalOnce")}</SelectItem>
                </SelectContent>
              </Select>
            </label>
            {catalog.plans.some((plan) => period === "all" || plan.billing_interval === period) ? null : <p>{t("pricing.noMatchingPeriod")}</p>}
            <ul className={styles.grid}>
              {catalog.plans.filter((plan) => period === "all" || plan.billing_interval === period).map((plan) => (
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
                    aria-describedby={unavailableId}
                    disabled
                  >
                    {t("pricing.buyUnavailable")}
                  </Button>
                  <PricingPlanDetailsDialog plan={plan} />
                </li>
              ))}
            </ul>
            </>
          )}
    </div>
  )
}
