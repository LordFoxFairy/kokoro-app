// 计费面板组件测试：余额卡 BigInt 换算 + 流水 ±着色/reason 本地化 + 空态 + 翻页
// + B1 用量透视（配额行 / 余额走势 / 消费-入账筛选 / 低余额预警）。
// billing 客户端为注入 fake（不打网络）；新功能断言走 data-testid/role，不耦合译文。
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { BillingClient } from "@/billing/client"
import { LocaleProvider } from "@/i18n/context"
import { BillingContent, BillingPanel } from "@/ui/billing/billing-panel"

// 真实契约形状：summary 含 quota_micros/quota_period；ledger 分录含 balance_after_micros。
// created_at 为 epoch **毫秒**（credit getTime() 直透）。
const DAY_A = Date.UTC(2026, 0, 10, 3, 0, 0) // 2026-01-10
const DAY_B = Date.UTC(2026, 0, 11, 5, 0, 0) // 2026-01-11

function makeClient(overrides: Partial<BillingClient> = {}): BillingClient {
  return {
    summary: vi
      .fn()
      .mockResolvedValue({ balance_micros: "12500000", held_micros: "500000", quota_micros: null, quota_period: null }),
    ledger: vi.fn().mockResolvedValue({
      entries: [
        { entry_id: "e1", delta_micros: "-250000", balance_after_micros: "12500000", reason: "model_call", created_at: DAY_B, run_id: "run_abcdef123456" },
        { entry_id: "e2", delta_micros: "5000000", balance_after_micros: "12750000", reason: "top_up_custom", created_at: DAY_A },
      ],
      next_cursor: "cur_2",
    }),
    byModel: vi.fn().mockResolvedValue({ period_start: "2026-07-01T00:00:00.000Z", items: [] }),
    ...overrides,
  }
}

function renderPanel(client: BillingClient) {
  return render(<BillingPanel client={client} onClose={vi.fn()} />, { wrapper: LocaleProvider })
}

afterEach(cleanup)

describe("BillingPanel", () => {
  it("uses the compact reference hierarchy when embedded in Settings", async () => {
    render(<BillingContent client={makeClient({
      summary: vi.fn().mockResolvedValue({
        balance_micros: "10000000",
        held_micros: "0",
        quota_micros: null,
        quota_period: null,
        plan_label: "Free",
        free_credit_micros: "10000000",
        daily_refresh_micros: "3000000",
        daily_refresh_time: "00:00",
      }),
    })} embedded />, { wrapper: LocaleProvider })

    await screen.findByTestId("billing-balance")
    expect(screen.getByTestId("billing-balance")).toHaveTextContent("10")
    expect(screen.getByText("Credit history")).toBeTruthy()
    expect(screen.getByText("Free credits")).toBeTruthy()
    expect(screen.getByText("Refreshes to 3 every day at 00:00")).toBeTruthy()
    expect(screen.queryByText("On hold")).toBeNull()
    expect(screen.queryByText("Quota this cycle")).toBeNull()
    expect(screen.queryByTestId("billing-filter-spend")).toBeNull()
    expect(screen.queryByTestId("billing-trend")).toBeNull()
    expect(screen.queryByTestId("billing-by-model")).toBeNull()
  })

  it("clears the base Dialog padding so the panel owns its shell geometry", () => {
    renderPanel(makeClient())
    expect(screen.getByTestId("billing-panel")).toHaveClass("p-0", "box-border")
  })

  it("keeps balance and ledger as independently addressable sections", async () => {
    renderPanel(makeClient())
    expect(await screen.findByTestId("billing-balance")).toHaveAttribute("data-slot", "billing-balance-card")
    expect(screen.getByTestId("billing-ledger")).toHaveAttribute("data-slot", "billing-ledger")
  })

  it("renders balance and held in credits (1 积分 = 1000000 micros)", async () => {
    renderPanel(makeClient())
    const balance = await screen.findByTestId("billing-balance")
    // 12_500_000 micros / 1_000_000 = 12.5 积分；500_000 / 1_000_000 = 0.5 积分。
    expect(balance.textContent).toContain("12.5")
    expect(balance.textContent).toContain("0.5")
  })

  it("colours ledger deltas by sign and localizes known reasons", async () => {
    renderPanel(makeClient())
    await screen.findByText("Model call")
    const debit = screen.getByText("-0.25")
    expect(debit.getAttribute("data-sign")).toBe("negative")
    const credit = screen.getByText("+5")
    expect(credit.getAttribute("data-sign")).toBe("positive")
    // 未知 reason 回退原文（不裸露 key）。
    expect(screen.getByText("top_up_custom")).toBeTruthy()
  })

  it("shows an empty state when there are no transactions", async () => {
    renderPanel(makeClient({ ledger: vi.fn().mockResolvedValue({ entries: [] }) }))
    await screen.findByTestId("billing-balance")
    // 空流水：无任一日期分组头（dayNet 不出现）。
    expect(screen.queryByText("Model call")).toBeNull()
  })

  it("paginates via next_cursor on load more", async () => {
    const ledger = vi
      .fn()
      .mockResolvedValueOnce({
        entries: [{ entry_id: "e1", delta_micros: "-250000", balance_after_micros: "12500000", reason: "model_call", created_at: DAY_A }],
        next_cursor: "cur_2",
      })
      .mockResolvedValueOnce({
        entries: [{ entry_id: "e2", delta_micros: "-100000", balance_after_micros: "12400000", reason: "tool_call", created_at: DAY_A }],
      })
    renderPanel(makeClient({ ledger }))
    await screen.findByText("Model call")
    fireEvent.click(screen.getByText("Load more"))
    await screen.findByText("Tool call")
    await waitFor(() => expect(ledger).toHaveBeenCalledWith("cur_2"))
  })

  // —— B1 用量透视 ——

  it("shows quota line only when a quota is set", async () => {
    renderPanel(makeClient())
    await screen.findByTestId("billing-balance")
    expect(screen.queryByTestId("billing-quota")).toBeNull()
    cleanup()

    renderPanel(
      makeClient({
        summary: vi
          .fn()
          .mockResolvedValue({ balance_micros: "12500000", held_micros: "0", quota_micros: "300000000", quota_period: "monthly" }),
      }),
    )
    const quota = await screen.findByTestId("billing-quota")
    // 300_000_000 / 1_000_000 = 300 积分。
    expect(quota.textContent).toContain("300")
  })

  it("renders balance trend sparkline when there are ≥2 entries", async () => {
    renderPanel(makeClient())
    await screen.findByTestId("billing-trend")
  })

  it("warns on low balance and hides the warning when balance is healthy", async () => {
    // 100_000 micros = 0.1 积分 < 0.5 积分阈值 → 预警。
    renderPanel(
      makeClient({
        summary: vi.fn().mockResolvedValue({ balance_micros: "100000", held_micros: "0", quota_micros: null, quota_period: null }),
      }),
    )
    await screen.findByTestId("billing-low-balance")
    cleanup()
    // 健康余额（12.5 积分）→ 无预警。
    renderPanel(makeClient())
    await screen.findByTestId("billing-balance")
    expect(screen.queryByTestId("billing-low-balance")).toBeNull()
  })

  it("filters to spend-only, hiding credit entries", async () => {
    renderPanel(makeClient())
    await screen.findByText("Model call")
    // 初始全部：入账条目（+5）可见。
    expect(screen.getByText("+5")).toBeTruthy()
    // 三个单选筛选按钮：全部 / 消费 / 入账 → 点「消费」。
    expect(screen.getAllByRole("radio")).toHaveLength(3)
    fireEvent.click(screen.getByTestId("billing-filter-spend"))
    // 入账条目隐去，仅消费（-0.25）留存。
    await waitFor(() => expect(screen.queryByText("+5")).toBeNull())
    expect(screen.getByText("-0.25")).toBeTruthy()
  })

  it("groups entries by day with a per-day net subtotal", async () => {
    renderPanel(makeClient())
    await screen.findByText("Model call")
    // 两条跨两天（DAY_A、DAY_B）→ 两个分组头。
    const dayHeads = screen.getAllByTestId("billing-day")
    expect(dayHeads).toHaveLength(2)
    // 每个组头带当日净额（data-sign 标注）。
    const firstDayHead = dayHeads.at(0)
    if (firstDayHead === undefined) {
      throw new Error("Expected at least one billing day")
    }
    expect(firstDayHead.querySelector("[data-sign]")).toBeTruthy()
  })
})

// R54: display-only target assertions, not BFF wallet wire or live billing acceptance.
describe("R54 embedded billing precision and unknown owner facts", () => {
  it.each([
    ["1", "0.000001"],
    ["9007199254740993", "9007199254.740993"],
  ])("renders exact embedded balance for %s micros", async (micros, expected) => {
    render(<BillingContent client={makeClient({
      summary: vi.fn().mockResolvedValue({
        balance_micros: micros,
        held_micros: "0",
        quota_micros: null,
        quota_period: null,
        plan_label: "Pro",
        free_credit_micros: "0",
      }),
      ledger: vi.fn().mockResolvedValue({ entries: [] }),
    })} embedded />, { wrapper: LocaleProvider })

    const label = await screen.findByText("credits", { selector: "span" })
    expect(label.parentElement?.querySelector("strong")?.textContent).toBe(expected)
  })

  it.each([
    ["1", "+0.000001", "positive"],
    ["-1", "-0.000001", "negative"],
    ["9007199254740993", "+9007199254.740993", "positive"],
    ["-9007199254740993", "-9007199254.740993", "negative"],
  ])("renders exact signed embedded ledger delta for %s micros", async (micros, expected, sign) => {
    render(<BillingContent client={makeClient({
      ledger: vi.fn().mockResolvedValue({
        entries: [{
          entry_id: "r54-entry",
          delta_micros: micros,
          balance_after_micros: "9007199254740993",
          reason: "model_call",
          created_at: DAY_A,
        }],
      }),
    })} embedded />, { wrapper: LocaleProvider })

    const reason = await screen.findByText("Model call")
    const amount = reason.closest("li")?.querySelector("[data-sign]")
    expect(amount).toHaveAttribute("data-sign", sign)
    expect(amount?.textContent).toBe(expected)
  })

  it("does not infer a Free plan when plan_label is absent", async () => {
    render(<BillingContent client={makeClient({
      summary: vi.fn().mockResolvedValue({
        balance_micros: "1000000",
        held_micros: "0",
        quota_micros: null,
        quota_period: null,
        free_credit_micros: "0",
      }),
      ledger: vi.fn().mockResolvedValue({ entries: [] }),
    })} embedded />, { wrapper: LocaleProvider })

    await screen.findByText("credits", { selector: "span" })
    const balance = screen.getByTestId("billing-balance")
    expect(balance.querySelector("strong")?.textContent).toBe("—")
    expect(screen.queryByText("Free", { exact: true })).toBeNull()
  })

  it("does not relabel all balance as free credits when free_credit_micros is absent", async () => {
    render(<BillingContent client={makeClient({
      summary: vi.fn().mockResolvedValue({
        balance_micros: "2000000",
        held_micros: "0",
        quota_micros: null,
        quota_period: null,
        plan_label: "Pro",
      }),
      ledger: vi.fn().mockResolvedValue({ entries: [] }),
    })} embedded />, { wrapper: LocaleProvider })

    const label = await screen.findByText("Free credits")
    expect(label.parentElement?.lastElementChild?.textContent).toBe("—")
    expect(screen.getByText("Pro", { exact: true })).toBeTruthy()
  })

  it("preserves explicit Free plan and zero free-credit owner facts", async () => {
    render(<BillingContent client={makeClient({
      summary: vi.fn().mockResolvedValue({
        balance_micros: "2000000",
        held_micros: "0",
        quota_micros: null,
        quota_period: null,
        plan_label: "Free",
        free_credit_micros: "0",
      }),
      ledger: vi.fn().mockResolvedValue({ entries: [] }),
    })} embedded />, { wrapper: LocaleProvider })

    const label = await screen.findByText("Free credits")
    expect(label.parentElement?.lastElementChild?.textContent).toBe("0")
    expect(screen.getByText("Free", { exact: true })).toBeTruthy()
  })
})
