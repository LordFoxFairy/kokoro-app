import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { LOCALE_STORAGE_KEY, type Locale } from "@/i18n/messages"
import { BillingLedger } from "@/ui/billing/billing-ledger"

const labels: ReadonlyArray<readonly [Locale, string, string]> = [
  ["zh", "积分到账", "积分变动"],
  ["en", "Credits received", "Credit activity"],
  ["ja", "クレジット付与", "クレジットの変更"],
  ["ko", "크레딧 지급", "크레딧 변동"],
  ["es", "Créditos recibidos", "Movimientos de créditos"],
  ["fr", "Crédits reçus", "Mouvements de crédits"],
  ["de", "Credits erhalten", "Credit-Änderung"],
  ["pt", "Créditos recebidos", "Movimentação de créditos"],
  ["ru", "Кредиты начислены", "Изменение кредитов"],
]
const cases = labels.flatMap(([locale, admin, other]) =>
  [false, true].flatMap((embedded) => [
    { locale, embedded, source: "admin_credit", label: admin },
    { locale, embedded, source: "future_internal_source", label: other },
  ]),
)

afterEach(() => {
  cleanup()
  localStorage.removeItem(LOCALE_STORAGE_KEY)
})

it.each(cases)("localizes $source in $locale (embedded=$embedded) without changing journal facts", async ({ locale, embedded, source, label }) => {
  localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  const entry = Object.freeze({
    journal_id: "22222222-2222-4222-8222-222222222222",
    sequence: "1", source_ref: "original-grant", source_kind: source,
    delta_micros: "1000000000", balance_after_micros: "1000000000",
    created_at: "2026-10-22T00:00:00.000Z",
  })
  render(<BillingLedger
    ledger={{ kind: "ready", entries: [entry], cursor: null, loadingMore: false, pageError: false }}
    filter="all" embedded={embedded} retrying={false}
    onFilterChange={vi.fn()} onRetry={vi.fn()} onLoadMore={vi.fn()}
  />, { wrapper: LocaleProvider })
  expect(await screen.findByText(label)).toBeVisible()
  expect(screen.queryByText(source)).not.toBeInTheDocument()
  expect(screen.getByText("+1000", { exact: true })).toHaveAttribute("data-sign", "positive")
  expect(entry.source_kind).toBe(source)
  expect(entry.delta_micros).toBe("1000000000")
})
