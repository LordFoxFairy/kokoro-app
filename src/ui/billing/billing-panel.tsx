"use client"
import { AppWindow, CalendarDays, CalendarSync, CircleHelp, Monitor, Plus, Sparkles } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Empty, EmptyDescription } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

// 计费面板（WEB-BILLING + B1 用量透视）：低余额预警条 + 余额卡（余额/冻结/配额）+ 余额走势
// sparkline + 流水（按天分组、消费/入账筛选、run 标记、±着色）。金额全程 BigInt 换算展示
// （sparkline 几何除外，见 creditsToNumber）。billing off 档 → 零额空流水（session 不 503）。

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { BillingByModel, BillingLedgerEntry, BillingSummary, BillingUsage } from "@/contract/http"
import { creditsToNumber, formatCredits, formatMinor, formatSignedCredits, microSign } from "@/billing/format"
import type { BillingClient } from "@/billing/client"
import { useLocale, useT } from "@/i18n/context"
import { cn } from "@/lib/utils"
import { useResource } from "@/lib/query"
import type { MessageKey } from "@/i18n/messages"

import styles from "./billing-panel.module.css"
import { useOverlayClose } from "@/ui/shell/use-overlay-close"

// 余额卡查询键（单发可缓存读）。流水为分页累加，保留本地 accumulator（同 use-session-list 范式）。
const SUMMARY_KEY = "billing/summary"
// 按模型消费分解查询键（B1d，单发可缓存读）。
const BY_MODEL_KEY = "billing/by-model"

// 低余额阈值：可用余额低于此值 → 顶部预警条引导充值。50 积分 = 500_000 微单位。
const LOW_BALANCE_MICROS = BigInt(500_000)
const EMPTY_LEDGER_ENTRIES: BillingLedgerEntry[] = []

type SummaryState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; summary: BillingSummary }

type LedgerState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; entries: BillingLedgerEntry[]; cursor: string | undefined; loadingMore: boolean }

type UsageState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; usage: BillingUsage }

// 流水筛选：全部 / 仅消费（delta<0）/ 仅入账（delta>0）。
type LedgerFilter = "all" | "spend" | "credit"

type BillingPanelProps = {
  client: BillingClient
  onClose: () => void
  // PAY-2：余额卡下的「查看套餐」购买入口（原充值入口留白位）；缺省不渲染（兼容未接 payment 的档）。
  onOpenPricing?: () => void
}

// 已知 credit reason → 本地化 key；未知 reason 回退原文（绝不裸露 key，也不吞未知类别）。
function reasonKey(reason: string): MessageKey | null {
  switch (reason) {
    case "model_call":
      return "billing.reasonModelCall"
    case "tool_call":
      return "billing.reasonToolCall"
    case "subscription":
      return "billing.reasonSubscription"
    case "refund":
      return "billing.reasonRefund"
    case "manual_adjustment":
      return "billing.reasonAdjustment"
    default:
      return null
  }
}

// 配额周期 → 本地化 key（credit domain 现仅 "monthly"）；未知回退 null（只显额度不显周期）。
function quotaPeriodKey(period: string): MessageKey | null {
  return period === "monthly" ? "billing.quotaPeriodMonthly" : null
}

function isLowBalance(balanceMicros: string): boolean {
  try {
    return BigInt(balanceMicros) < LOW_BALANCE_MICROS
  } catch {
    return false
  }
}

// created_at 为 epoch **毫秒**（credit getTime() 直透）。日期键（本地 YYYY-MM-DD，用于分组）。
function dayKey(epochMs: number): string {
  const d = new Date(epochMs)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function formatDay(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString()
}

function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

// 按天分组（保序：entries 已 newest-first）：每组带当日净额（delta 求和，BigInt）。
type LedgerDay = { key: string; label: string; net: string; entries: BillingLedgerEntry[] }

function groupByDay(entries: BillingLedgerEntry[]): LedgerDay[] {
  const days: LedgerDay[] = []
  const index = new Map<string, LedgerDay>()
  for (const entry of entries) {
    const key = dayKey(entry.created_at)
    let day = index.get(key)
    if (day === undefined) {
      day = { key, label: formatDay(entry.created_at), net: "0", entries: [] }
      index.set(key, day)
      days.push(day)
    }
    day.entries.push(entry)
    try {
      day.net = (BigInt(day.net) + BigInt(entry.delta_micros)).toString()
    } catch {
      // 脏 delta 不参与求和（展示层不因单条脏数据崩）。
    }
  }
  return days
}

// 余额走势 sparkline：入账后余额（chronological）折线。等值/单点退化为水平线，仍给视觉锚。
function BalanceSparkline({ values }: { values: number[] }): React.JSX.Element | null {
  if (values.length < 2) {
    return null
  }
  const W = 100
  const H = 28
  const PAD = 2
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const stepX = (W - PAD * 2) / (values.length - 1)
  const points = values
    .map((v, i) => {
      const x = PAD + i * stepX
      const y = PAD + (H - PAD * 2) * (1 - (v - min) / span)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
  return (
    <svg className={styles.sparkline} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={points} fill="none" />
    </svg>
  )
}

type BillingContentProps = {
  client: BillingClient
  // PAY-2：余额卡下的「查看套餐」购买入口；缺省不渲染（兼容未接 payment 的档）。
  onOpenPricing?: () => void
  embedded?: boolean
}

function MetricHelp({ label }: { label: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className={styles.metricHelp} type="button" aria-label={label}>
            <CircleHelp aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function formatMinorCompact(value: string): string {
  return formatMinor(value).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")
}

function usageCategoryLabel(key: string, fallback: string, t: ReturnType<typeof useT>): string {
  if (key === "cloud") return t("billing.cloudServices")
  if (key === "ai") return t("billing.artificialIntelligence")
  if (key === "integration" || key === "integrations") return t("billing.integrations")
  return fallback
}

function WebsiteUsageContent({ state, localeTag, onOpenPricing }: { state: UsageState; localeTag: string; onOpenPricing?: () => void }) {
  const t = useT()
  if (state.kind === "loading" || state.kind === "idle") return <div className={styles.scopedLoading}><Skeleton className={styles.loadingLine} /><Skeleton className={styles.loadingLine} /></div>
  if (state.kind === "error") return <Alert variant="destructive" className={styles.feedback}><AlertDescription>{t("billing.loadError")}</AlertDescription></Alert>
  const { usage } = state
  const date = (value: string) => new Date(value).toLocaleDateString(localeTag, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })
  return <div className={styles.websiteUsage} data-testid="billing-website-usage">
    <section className={styles.usageOverview}>
      <div className={styles.autoTopUpRow}><span>{t("billing.websiteKeepRunning")}</span><Button type="button" onClick={onOpenPricing} disabled={!onOpenPricing}><strong>{t("billing.enable")}</strong><small>{t("billing.autoTopUp")}</small></Button></div>
      <div className={styles.usageCategoryGrid}>{usage.categories.map((category) => <section key={category.key} className={styles.usageCategory}><strong>{usageCategoryLabel(category.key, category.label, t)} <MetricHelp label={usageCategoryLabel(category.key, category.label, t)} /></strong><span>{t("billing.freeUsageConsumed")}</span><b>${formatMinorCompact(category.free_used_minor)} / ${formatMinorCompact(category.free_limit_minor)}</b><span>{t("billing.paid")}</span><b>{category.paid_minor === "0" ? "-" : `$${formatMinorCompact(category.paid_minor)}`}</b></section>)}</div>
      {usage.reset_at ? <p className={styles.usageReset}>{t("billing.monthlyReset", { date: date(usage.reset_at) })}</p> : null}
    </section>
    <div className={styles.usageDetailsHead}><h3>{t("billing.usageDetails")}</h3><div className={styles.usagePeriod}><label><span className={styles.srOnly}>{t("billing.startDate")}</span><input aria-label={t("billing.startDate")} readOnly value={date(usage.period_start)} /></label><span>—</span><label><span className={styles.srOnly}>{t("billing.endDate")}</span><input aria-label={t("billing.endDate")} readOnly value={date(usage.period_end)} /></label></div><p>{t("billing.totalCost", { amount: formatMinor(usage.total_cost_minor) })}</p></div>
    <div className={styles.websiteTableHead}><span>{t("billing.website")}</span><span>{t("billing.cost")}</span></div>
    {usage.websites.length === 0 ? <div className={styles.websiteEmpty}><AppWindow aria-hidden="true" /><strong>{t("billing.noWebsites")}</strong><span>{t("billing.noWebsitesHint")}</span><Button asChild type="button" variant="outline"><Link href="/app?intent=website">{t("billing.createWebsite")}</Link></Button></div> : <ul className={styles.websiteRows}>{usage.websites.map(site => <li key={site.id}><span>{site.name}</span><span>${formatMinor(site.cost_minor)}</span></li>)}</ul>}
  </div>
}

function ComputerUsageContent({ state }: { state: UsageState }) {
  const t = useT()
  if (state.kind === "loading" || state.kind === "idle") return <div className={styles.scopedLoading}><Skeleton className={styles.loadingLine} /></div>
  if (state.kind === "error") return <Alert variant="destructive" className={styles.feedback}><AlertDescription>{t("billing.loadError")}</AlertDescription></Alert>
  return <div className={styles.computerUsage} data-testid="billing-computer-usage"><Monitor aria-hidden="true" /><strong>{t("billing.cloudComputer")}</strong><span>{t("billing.cloudComputerHint")}</span><Button asChild type="button"><Link href="/app#/account/settings/computer"><Plus aria-hidden="true" />{t("billing.createNow")}</Link></Button></div>
}

export function BillingContent({ client, onOpenPricing, embedded = false }: BillingContentProps) {
  const t = useT()
  const { locale } = useLocale()
  const localeTag = locale === "zh" ? "zh-CN" : locale
  const creditFormatter = new Intl.NumberFormat(localeTag, { maximumFractionDigits: 4 })
  const formatEmbeddedCredits = (micros: string) => creditFormatter.format(creditsToNumber(micros))
  const formatEmbeddedSignedCredits = (micros: string) => {
    const value = creditsToNumber(micros)
    return value > 0 ? `+${creditFormatter.format(value)}` : creditFormatter.format(value)
  }
  const [ledger, setLedger] = useState<LedgerState>({ kind: "loading" })
  const [filter, setFilter] = useState<LedgerFilter>("all")
  const [usageScope, setUsageScope] = useState<"tasks" | "websites" | "computer">("tasks")
  const [scopedUsage, setScopedUsage] = useState<UsageState>({ kind: "idle" })
  const [retrying, setRetrying] = useState(false)
  const ledgerRequestSeqRef = useRef(0)

  // 余额卡经查询层单发读；ResourceResult 适配回既有判别式，渲染分支不变。
  const summaryRes = useResource<BillingSummary>(
    SUMMARY_KEY,
    useCallback(() => client.summary(), [client]),
  )
  const summary: SummaryState =
    summaryRes.data !== undefined
      ? { kind: "ready", summary: summaryRes.data }
      : summaryRes.error !== undefined
        ? { kind: "error" }
        : { kind: "loading" }

  // B1d 按模型消费分解（本月）：单发缓存读；无账户/off 档→空清单（不渲染区块）。
  const byModelRes = useResource<BillingByModel>(
    BY_MODEL_KEY,
    useCallback(() => client.byModel(), [client]),
  )
  const byModelItems = byModelRes.data?.items ?? []
  const byModelMax = byModelItems.reduce((m, it) => Math.max(m, creditsToNumber(it.spent_micros)), 0)

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

  useEffect(() => {
    if (usageScope === "tasks") return
    let current = true
    void client.usage(usageScope)
      .then((usage) => { if (current) setScopedUsage({ kind: "ready", usage }) })
      .catch(() => { if (current) setScopedUsage({ kind: "error" }) })
    return () => { current = false }
  }, [client, usageScope])

  const loadMore = useCallback(async () => {
    if (retrying || ledger.kind !== "ready" || ledger.cursor === undefined || ledger.loadingMore) {
      return
    }
    const requestSeq = ++ledgerRequestSeqRef.current
    const cursor = ledger.cursor
    setLedger({ ...ledger, loadingMore: true })
    try {
      const page = await client.ledger(cursor)
      if (requestSeq === ledgerRequestSeqRef.current) {
        setLedger({
          kind: "ready",
          entries: [...ledger.entries, ...page.entries],
          cursor: page.next_cursor,
          loadingMore: false,
        })
      }
    } catch {
      if (requestSeq === ledgerRequestSeqRef.current) setLedger({ ...ledger, loadingMore: false })
    }
  }, [client, ledger, retrying])

  const allEntries = ledger.kind === "ready" ? ledger.entries : EMPTY_LEDGER_ENTRIES

  // 余额走势：入账后余额（chronological）——entries newest-first,故 reverse。
  const trend = useMemo(
    () => allEntries.map((e) => creditsToNumber(e.balance_after_micros)).reverse(),
    [allEntries],
  )

  const filtered = useMemo(() => {
    if (embedded) return allEntries
    if (filter === "all") return allEntries
    const want = filter === "spend" ? "negative" : "positive"
    return allEntries.filter((e) => microSign(e.delta_micros) === want)
  }, [allEntries, embedded, filter])

  const days = useMemo(() => groupByDay(filtered), [filtered])

  const lowBalance = summary.kind === "ready" && isLowBalance(summary.summary.balance_micros)

  if (embedded) {
    return (
      <div className={cn(styles.body, styles.embeddedBody)} data-embedded="billing">
        <ToggleGroup
          type="single"
          value={usageScope}
          onValueChange={(value) => {
            if (!value) return
            const nextScope = value as typeof usageScope
            if (nextScope !== "tasks") setScopedUsage({ kind: "loading" })
            setUsageScope(nextScope)
          }}
          className={styles.usageTabs}
          aria-label={t("billing.title")}
        >
          <ToggleGroupItem value="tasks" className={styles.usageTab}>{t("firstSite.tasks")}</ToggleGroupItem>
          <ToggleGroupItem value="websites" className={styles.usageTab}>{t("firstSite.websites")}</ToggleGroupItem>
          <ToggleGroupItem value="computer" className={styles.usageTab}>{t("billing.computerScope")}</ToggleGroupItem>
        </ToggleGroup>

        {usageScope === "websites" ? (
          <WebsiteUsageContent state={scopedUsage} localeTag={localeTag} onOpenPricing={onOpenPricing} />
        ) : usageScope === "computer" ? (
          <ComputerUsageContent state={scopedUsage} />
        ) : <>

        <section className={styles.balanceCard} data-testid="billing-balance">
          {summary.kind === "loading" ? (
            <div className={styles.loadingState} role="status" aria-label={t("billing.loading")}><Skeleton className={styles.loadingLine} /><Skeleton className={styles.loadingLineShort} /></div>
          ) : summary.kind === "error" ? (
            <Alert variant="destructive" className={styles.feedback}><AlertDescription><p>{t("billing.loadError")}</p><Button variant="outline" size="sm" type="button" onClick={() => void retry()}>{t("billing.retry")}</Button></AlertDescription></Alert>
          ) : (
              <div className={styles.embeddedBalanceContent}>
                <div className={styles.embeddedPlanHeader}>
                  <strong>{summary.summary.plan_label?.trim().toLowerCase() === "free" || !summary.summary.plan_label
                    ? t("billing.freeTier")
                    : summary.summary.plan_label}</strong>
                {onOpenPricing ? <Button variant="default" size="sm" type="button" className={styles.balanceUpgrade} onClick={onOpenPricing}>{t("firstSite.upgrade")}</Button> : null}
              </div>
              <div className={styles.embeddedCreditRows}>
                <div className={styles.embeddedCreditRow}>
                  <Sparkles aria-hidden="true" />
                  <div className={styles.embeddedCreditCopy}>
                    <div className={styles.embeddedMetric}><span>{t("billing.creditUnit")}</span><strong>{formatEmbeddedCredits(summary.summary.balance_micros)}</strong></div>
                    <div className={styles.embeddedMetricSubrow}><span>{t("settings.freeCredits")}</span><span>{formatEmbeddedCredits(summary.summary.free_credit_micros ?? summary.summary.balance_micros)}</span></div>
                  </div>
                </div>
                <div className={styles.embeddedCreditRow}>
                  <CalendarSync aria-hidden="true" />
                  <div className={styles.embeddedCreditCopy}>
                    <div className={styles.embeddedMetric}><span>{t("billing.dailyRefresh")}</span><strong>{summary.summary.daily_refresh_micros === null || summary.summary.daily_refresh_micros === undefined ? "—" : formatEmbeddedCredits(summary.summary.daily_refresh_micros)}</strong></div>
                    {summary.summary.daily_refresh_micros && summary.summary.daily_refresh_time ? <p className={styles.embeddedRefreshHint}>{t("billing.dailyRefreshHint", { time: summary.summary.daily_refresh_time, credits: formatEmbeddedCredits(summary.summary.daily_refresh_micros) })}</p> : null}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <div className={styles.ledgerHeadRow}><h3 className={styles.ledgerHead}>{t("billing.ledgerTitle")}<CircleHelp aria-hidden="true" /></h3></div>
        {ledger.kind === "loading" ? (
          <div className={styles.loadingState} role="status" aria-label={t("billing.loading")}><Skeleton className={styles.loadingLine} /><Skeleton className={styles.loadingLineShort} /></div>
        ) : ledger.kind === "error" ? (
          <Alert variant="destructive" className={styles.feedback}><AlertDescription><p>{t("billing.loadError")}</p><Button variant="outline" size="sm" type="button" onClick={() => void retry()}>{t("billing.retry")}</Button></AlertDescription></Alert>
        ) : ledger.entries.length === 0 ? (
          <Empty className={styles.emptyState}><EmptyDescription>{t("billing.ledgerEmpty")}</EmptyDescription></Empty>
        ) : (
          <>
            {days.map((day) => (
              <div key={day.key} className={styles.dayGroup}>
                <div className={styles.dayHead} data-testid="billing-day"><span className={styles.dayLabel}>{new Date(day.entries[0].created_at).toLocaleDateString(localeTag, { weekday: "short" })}</span></div>
                <ul className={styles.ledger}>
                  {day.entries.map((entry) => {
                    const label = entry.title ?? (reasonKey(entry.reason) ? t(reasonKey(entry.reason) as MessageKey) : entry.reason)
                    return <li key={entry.entry_id} className={styles.entry}><div className={styles.entryMain}>{entry.conversation_id ? <Link className={styles.entryReason} href={`/app?conversation=${encodeURIComponent(entry.conversation_id)}`}>{label}</Link> : <span className={styles.entryReason}>{label}</span>}</div><span className={styles.entryDelta} data-sign={microSign(entry.delta_micros)}>{formatEmbeddedSignedCredits(entry.delta_micros)}</span></li>
                  })}
                </ul>
              </div>
            ))}
            {ledger.cursor !== undefined ? <Button variant="outline" type="button" className={styles.more} disabled={ledger.loadingMore || retrying} onClick={loadMore}>{ledger.loadingMore ? t("billing.loading") : t("billing.loadMore")}</Button> : null}
          </>
        )}
        </>}
      </div>
    )
  }

  return (
    <div className={cn(styles.body, embedded && styles.embeddedBody)} data-embedded={embedded || undefined}>
      {/* B1c 低余额预警：可用余额低于阈值即引导充值（有购买入口时才给按钮）。 */}
      {lowBalance && !embedded ? (
        <section className={styles.lowBalance} data-testid="billing-low-balance">
          <div className={styles.lowBalanceText}>
            <strong className={styles.lowBalanceTitle}>{t("billing.lowBalanceTitle")}</strong>
            <span className={styles.lowBalanceBody}>{t("billing.lowBalanceBody")}</span>
          </div>
          {onOpenPricing ? (
            <Button variant="default" type="button" className={styles.lowBalanceCta} onClick={onOpenPricing}>
              {t("billing.lowBalanceCta")}
            </Button>
          ) : null}
        </section>
      ) : null}

      <section className={styles.balanceCard} data-testid="billing-balance">
        {summary.kind === "loading" ? (
          <div className={styles.loadingState} role="status" aria-label={t("billing.loading")}>
            <Skeleton className={styles.loadingLine} />
            <Skeleton className={styles.loadingLineShort} />
          </div>
        ) : summary.kind === "error" ? (
          <Alert variant="destructive" className={styles.feedback}>
            <AlertDescription>
              <p>{t("billing.loadError")}</p>
            <Button variant="outline" size="sm" type="button" disabled={retrying || (ledger.kind === "ready" && ledger.loadingMore)} aria-busy={retrying} onClick={() => void retry()}>
              {retrying ? <Spinner aria-hidden="true" /> : null}
              {retrying ? t("billing.loading") : t("billing.retry")}
            </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {embedded ? (
              <div className={styles.embeddedBalanceContent}>
                <div className={styles.embeddedPlanHeader}>
                  <strong>{t("billing.freeTier")}</strong>
                  {onOpenPricing ? <Button variant="default" size="sm" type="button" className={styles.balanceUpgrade} onClick={onOpenPricing}>{t("firstSite.upgrade")}</Button> : null}
                </div>
                <div className={styles.embeddedBalanceRule} />
                <div className={styles.embeddedCreditRow}>
                  <Sparkles aria-hidden="true" />
                  <div className={styles.embeddedCreditCopy}>
                    <div className={styles.embeddedMetric}>
                      <span>
                        {t("billing.creditUnit")}
                        <MetricHelp label={t("billing.balance")} />
                      </span>
                      <strong>{formatCredits(summary.summary.balance_micros)}</strong>
                    </div>
                    <div className={styles.embeddedMetricSubrow}>
                      <span>{t("billing.held")}</span>
                      <span>{formatCredits(summary.summary.held_micros)}</span>
                    </div>
                  </div>
                </div>
                <div className={styles.embeddedCreditRow}>
                  <CalendarDays aria-hidden="true" />
                  <div className={styles.embeddedCreditCopy}>
                    <div className={styles.embeddedMetric}>
                      <span>
                        {t("billing.quotaLabel")}
                        <MetricHelp label={t("billing.quotaLabel")} />
                      </span>
                      <strong>
                        {summary.summary.quota_micros === null ? "—" : formatCredits(summary.summary.quota_micros)}
                      </strong>
                    </div>
                    <div className={styles.embeddedMetricSubrow}>
                      <span>
                        {summary.summary.quota_period !== null && quotaPeriodKey(summary.summary.quota_period) !== null
                          ? t(quotaPeriodKey(summary.summary.quota_period) as MessageKey)
                          : t("billing.balance")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            {!embedded ? <div className={styles.balanceHeader}>
              <div className={styles.balanceMain}>
                <span className={styles.balanceLabel}>{t("billing.balance")}</span>
                <span className={styles.balanceValue}>
                  {formatCredits(summary.summary.balance_micros)} {t("billing.creditUnit")}
                </span>
              </div>
              {onOpenPricing ? <Button variant="default" size="sm" type="button" className={styles.balanceUpgrade} onClick={onOpenPricing}>{t("firstSite.upgrade")}</Button> : null}
            </div> : null}
            {!embedded ? <div className={styles.balanceHeld}>
              <span>{t("billing.held")}</span>
              <span>
                {formatCredits(summary.summary.held_micros)} {t("billing.creditUnit")}
              </span>
            </div> : null}
            {!embedded && summary.summary.quota_micros !== null ? (
              <div className={styles.balanceHeld} data-testid="billing-quota">
                <span>
                  {t("billing.quotaLabel")}
                  {summary.summary.quota_period !== null && quotaPeriodKey(summary.summary.quota_period) !== null
                    ? `（${t(quotaPeriodKey(summary.summary.quota_period) as MessageKey)}）`
                    : ""}
                </span>
                <span>
                  {formatCredits(summary.summary.quota_micros)} {t("billing.creditUnit")}
                </span>
              </div>
            ) : null}
          </>
        )}
      </section>

      {/* 余额走势 sparkline：≥2 笔流水时显示（用入账后余额快照重建）。 */}
      {trend.length >= 2 && !embedded ? (
        <section className={styles.trend} data-testid="billing-trend">
          <div className={styles.trendHead}>
            <span className={styles.trendTitle}>{t("billing.trendTitle")}</span>
            <span className={styles.trendHint}>{t("billing.trendHint", { count: String(trend.length) })}</span>
          </div>
          <BalanceSparkline values={trend} />
        </section>
      ) : null}

      {/* B1d 本月按模型消费分解：有消费才渲染（同 trend 条件渲染范式）。条宽按消费额占比。 */}
      {byModelItems.length > 0 && !embedded ? (
        <section className={styles.byModel} data-testid="billing-by-model">
          <h3 className={styles.byModelTitle}>{t("billing.byModelTitle")}</h3>
          <ul className={styles.byModelList}>
            {byModelItems.map((it) => (
              <li className={styles.byModelRow} key={it.model_binding_id ?? "unattributed"}>
                <div className={styles.byModelRowHead}>
                  <span className={styles.byModelName} title={it.model_name}>
                    {it.model_name}
                  </span>
                  <span className={styles.byModelSpent}>
                    {formatCredits(it.spent_micros)} {t("billing.creditUnit")}
                  </span>
                </div>
                <div className={styles.byModelBarTrack}>
                  <div
                    className={styles.byModelBar}
                    style={{
                      width: `${byModelMax > 0 ? Math.max(4, (creditsToNumber(it.spent_micros) / byModelMax) * 100) : 0}%`,
                    }}
                  />
                </div>
                <span className={styles.byModelRuns}>
                  {t("billing.byModelRuns", { count: String(it.run_count) })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {onOpenPricing && !embedded ? (
        <Button variant="outline" type="button" className={styles.more} onClick={onOpenPricing}>
          {t("billing.viewPricing")}
        </Button>
      ) : null}

      <div className={styles.ledgerHeadRow}>
        <h3 className={styles.ledgerHead}>
          {t("billing.ledgerTitle")}
          {embedded ? <CircleHelp aria-hidden="true" /> : null}
        </h3>
        {!embedded && ledger.kind === "ready" && ledger.entries.length > 0 ? (
          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={(value) => { if (value) setFilter(value as LedgerFilter) }}
            className={styles.filters}
            aria-label={t("billing.ledgerTitle")}
          >
              {(["all", "spend", "credit"] as const).map((f) => (
              <ToggleGroupItem
                key={f}
                value={f}
                className={styles.filterChip}
                data-testid={`billing-filter-${f}`}
              >
                {t(
                  f === "all" ? "billing.filterAll" : f === "spend" ? "billing.filterSpend" : "billing.filterCredit",
                )}
              </ToggleGroupItem>
              ))}
          </ToggleGroup>
        ) : null}
      </div>

      {ledger.kind === "loading" ? (
        <div className={styles.loadingState} role="status" aria-label={t("billing.loading")}>
          <Skeleton className={styles.loadingLine} />
          <Skeleton className={styles.loadingLine} />
          <Skeleton className={styles.loadingLineShort} />
        </div>
      ) : ledger.kind === "error" ? (
        <Alert variant="destructive" className={styles.feedback}>
          <AlertDescription>
            <p>{t("billing.loadError")}</p>
          <Button variant="outline" size="sm" type="button" disabled={retrying} aria-busy={retrying} onClick={() => void retry()}>
            {retrying ? <Spinner aria-hidden="true" /> : null}
            {retrying ? t("billing.loading") : t("billing.retry")}
          </Button>
          </AlertDescription>
        </Alert>
      ) : ledger.entries.length === 0 ? (
        <Empty className={styles.emptyState}>
          <EmptyDescription>{t("billing.ledgerEmpty")}</EmptyDescription>
        </Empty>
      ) : days.length === 0 ? (
        <Empty className={styles.emptyState}>
          <EmptyDescription>{t("billing.filterEmpty")}</EmptyDescription>
        </Empty>
      ) : (
        <>
          {days.map((day) => (
            <div key={day.key} className={styles.dayGroup}>
              <div className={styles.dayHead} data-testid="billing-day">
                <span className={styles.dayLabel}>{day.label}</span>
                {!embedded ? (
                  <span className={styles.dayNet} data-sign={microSign(day.net)}>
                    {formatSignedCredits(day.net)} {t("billing.creditUnit")}
                  </span>
                ) : null}
              </div>
              <ul className={styles.ledger}>
                {day.entries.map((entry) => {
                  const key = reasonKey(entry.reason)
                  return (
                    <li key={entry.entry_id} className={styles.entry}>
                      <div className={styles.entryMain}>
                        <span className={styles.entryReason}>{key ? t(key) : entry.reason}</span>
                        {!embedded ? <span className={styles.entryMeta}>
                          <span className={styles.entryTime}>{formatTime(entry.created_at)}</span>
                          {entry.run_id ? (
                            <span className={styles.runTag} title={entry.run_id}>
                              {t("billing.runTag", { id: entry.run_id.slice(-6) })}
                            </span>
                          ) : null}
                        </span> : null}
                      </div>
                      <span className={styles.entryDelta} data-sign={microSign(entry.delta_micros)}>
                        {formatSignedCredits(entry.delta_micros)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
          {ledger.cursor !== undefined ? (
            <Button
              variant="outline"
              type="button"
              className={styles.more}
              disabled={ledger.loadingMore || retrying}
              aria-busy={ledger.loadingMore}
              onClick={loadMore}
            >
              {ledger.loadingMore ? <Spinner aria-hidden="true" /> : null}
              {ledger.loadingMore ? t("billing.loading") : t("billing.loadMore")}
            </Button>
          ) : null}
        </>
      )}
    </div>
  )
}

export function BillingPanel({ client, onClose, onOpenPricing }: BillingPanelProps) {
  const t = useT()
  const { open, requestClose, onCloseAutoFocus } = useOverlayClose(onClose)

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) requestClose() }}>
      <DialogContent
        className={cn(styles.panel, "p-0 box-border")}
        data-testid="billing-panel"
        closeLabel={t("billing.close")}
        closeButtonTestId="billing-close"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogTitle className="sr-only">{t("billing.title")}</DialogTitle>
        <header className={styles.head}>
          <h2 className={styles.title}>{t("billing.title")}</h2>
        </header>

        <BillingContent client={client} onOpenPricing={onOpenPricing} />
      </DialogContent>
    </Dialog>
  )
}
