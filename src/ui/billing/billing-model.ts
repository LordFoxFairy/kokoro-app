import type { BillingLedgerEntry, BillingSummary } from "@/contract/http"
import type { MessageKey } from "@/i18n/messages"

export type SummaryState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "missing_account" }
  | { kind: "ready"; summary: BillingSummary }

export type LedgerState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "missing_account" }
  | { kind: "ready"; entries: BillingLedgerEntry[]; cursor: string | null; loadingMore: boolean; pageError: boolean }

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

function dayKey(instant: string): string {
  const date = new Date(instant)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function formatDay(instant: string, localeTag?: string): string {
  return new Date(instant).toLocaleDateString(localeTag)
}

export function formatTime(instant: string, localeTag?: string): string {
  return new Date(instant).toLocaleTimeString(localeTag, { hour: "2-digit", minute: "2-digit" })
}

export function groupByDay(entries: BillingLedgerEntry[], localeTag?: string): LedgerDay[] {
  const days: LedgerDay[] = []
  const index = new Map<string, LedgerDay>()
  for (const entry of entries) {
    const key = dayKey(entry.created_at)
    let day = index.get(key)
    if (day === undefined) {
      day = { key, label: formatDay(entry.created_at, localeTag), net: "0", entries: [] }
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
