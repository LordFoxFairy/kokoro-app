import type { BillingLedgerEntry, BillingSummary } from "@/contract/http"
import type { MessageKey } from "@/i18n/messages"

export const SUMMARY_KEY = "billing/summary"
export const BY_MODEL_KEY = "billing/by-model"
export const LOW_BALANCE_MICROS = BigInt(500_000)

export type SummaryState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; summary: BillingSummary }

export type LedgerState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; entries: BillingLedgerEntry[]; cursor: string | undefined; loadingMore: boolean }

export type LedgerFilter = "all" | "spend" | "credit"

export type LedgerDay = { key: string; label: string; net: string; entries: BillingLedgerEntry[] }

export function reasonKey(reason: string): MessageKey | null {
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

export function quotaPeriodKey(period: string): MessageKey | null {
  return period === "monthly" ? "billing.quotaPeriodMonthly" : null
}

export function isLowBalance(balanceMicros: string): boolean {
  try {
    return BigInt(balanceMicros) < LOW_BALANCE_MICROS
  } catch {
    return false
  }
}

function dayKey(epochMs: number): string {
  const date = new Date(epochMs)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function formatDay(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString()
}

export function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export function groupByDay(entries: BillingLedgerEntry[]): LedgerDay[] {
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
