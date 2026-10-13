"use client"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Empty, EmptyDescription } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"

// Read the canonical catalog; the paired BFF does not provide checkout.
// Money and credits remain exact BigInt-based presentations.

import { useCallback } from "react"

import { formatMicros, formatMinor } from "@/billing/format"
import { planIntervalKey } from "@/billing/rules"
import type { PlanCatalogEntry, PricingClient } from "@/billing/pricing"
import { PricingClientError } from "@/billing/pricing"
import { useT } from "@/i18n/context"
import { cn } from "@/lib/utils"
import { useResource } from "@/lib/query"

import styles from "./pricing-panel.module.css"
import { useOverlayClose } from "@/ui/shell/use-overlay-close"

// 套餐目录查询键（单发只读）：checkout 购买不改目录，故无失活。
const CATALOG_KEY = "billing/plans"

type CatalogState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "unavailable" }
  | { kind: "ready"; plans: PlanCatalogEntry[] }

type PricingPanelProps = {
  client: PricingClient
  onClose: () => void
}

export function PricingPanel({ client, onClose }: PricingPanelProps) {
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
        <PricingContent client={client} />
      </DialogContent>
    </Dialog>
  )
}

type PricingContentProps = {
  client: PricingClient
  embedded?: boolean
}

export function PricingContent({ client, embedded = false }: PricingContentProps) {
  const t = useT()
  // 目录经查询层单发读；ResourceResult 映射回四态判别式——payment 未配置（not_configured）→
  // 诚实未开通态 unavailable，其余失败=加载错误，展示分支不变。
  const catalogRes = useResource<PlanCatalogEntry[]>(
    CATALOG_KEY,
    useCallback(async () => (await client.plans()).plans, [client]),
  )
  const catalog: CatalogState =
    catalogRes.data !== undefined
      ? { kind: "ready", plans: catalogRes.data }
      : catalogRes.error !== undefined
        ? catalogRes.error instanceof PricingClientError && catalogRes.error.reason === "not_configured"
          ? { kind: "unavailable" }
          : { kind: "error" }
        : { kind: "loading" }
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
              <Button variant="outline" size="sm" type="button" disabled={catalogRes.loading} aria-busy={catalogRes.loading} onClick={catalogRes.refetch}>
                {catalogRes.loading ? <Spinner aria-hidden="true" /> : null}
                {catalogRes.loading ? t("pricing.loading") : t("pricing.retry")}
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
