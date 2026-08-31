"use client"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Empty, EmptyDescription } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"

// 价格/购买面板（PAY-2）：套餐卡（权益列表 + 价格 + 购买按钮）。目录经 `/api/billing/plans` BFF 拉取
// （site/owner 从信封派生）。诚实态优先：payment 未配置 / checkout 501 → 显式「支付暂未开通」+ 禁用购买，
// 状态真来自后端，绝不放假按钮。金额/积分全程 BigInt 换算展示（不过 Number 丢精度）。

import { useCallback, useEffect, useRef, useState } from "react"

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
  // 购买诚实态（来自后端 checkout 响应）：unavailable=501 未开通（禁用购买）；login=401 未登录。
  const [purchaseNotice, setPurchaseNotice] = useState<"none" | "unavailable" | "login">("none")
  const [pendingPlan, setPendingPlan] = useState<string | null>(null)
  const purchaseNoticeRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (purchaseNotice === "none") return
    const frame = window.requestAnimationFrame(() => purchaseNoticeRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [purchaseNotice])

  const buy = useCallback(
    async (planId: string) => {
      setPendingPlan(planId)
      setPurchaseNotice("none")
      try {
        const result = await client.checkout(planId)
        if (result.status === "ok") {
          // provider 已配置：跳转 provider 托管收银台（V1 无 provider，此路径暂不可达）。
          window.location.assign(result.checkout_url)
          return
        }
        // 诚实态：状态真来自后端。501=未开通（禁用后续购买）；401=未登录。
        setPurchaseNotice(result.status === "unavailable" ? "unavailable" : "login")
      } catch {
        setPurchaseNotice("unavailable")
      } finally {
        setPendingPlan(null)
      }
    },
    [client],
  )

  const checkoutBlocked = purchaseNotice === "unavailable"

  return (
    <div className={cn(styles.body, embedded && styles.embeddedBody)} data-embedded={embedded || undefined}>
          {purchaseNotice === "unavailable" ? (
            <Alert ref={purchaseNoticeRef} tabIndex={-1} variant="destructive" className={styles.unavailable}>
              <AlertDescription>{t("pricing.unavailable")}</AlertDescription>
            </Alert>
          ) : purchaseNotice === "login" ? (
            <Alert ref={purchaseNoticeRef} tabIndex={-1} variant="destructive" className={styles.unavailable}>
              <AlertDescription>{t("pricing.loginRequired")}</AlertDescription>
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
                    disabled={checkoutBlocked || pendingPlan !== null}
                    aria-busy={pendingPlan === plan.id}
                    onClick={() => void buy(plan.id)}
                  >
                    {checkoutBlocked
                      ? t("pricing.buyUnavailable")
                      : pendingPlan === plan.id
                        ? <><Spinner aria-hidden="true" />{t("pricing.buying")}</>
                        : t("pricing.buy")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
    </div>
  )
}
