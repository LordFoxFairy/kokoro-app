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
    usage: vi.fn().mockResolvedValue({ auto_top_up_enabled: false, reset_at: null, period_start: "2026-08-01T00:00:00.000Z", period_end: "2026-08-29T23:59:59.000Z", total_cost_minor: "0", categories: [], websites: [], computers: [] }),
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
    expect(screen.getByTestId("billing-balance")).toHaveTextContent("1,000")
    expect(screen.getByText("Computer")).toBeTruthy()
    expect(screen.getByText("Credit history")).toBeTruthy()
    expect(screen.getByText("Free credits")).toBeTruthy()
    expect(screen.getByText("Refreshes to 300 every day at 00:00")).toBeTruthy()
    expect(screen.queryByText("On hold")).toBeNull()
    expect(screen.queryByText("Quota this cycle")).toBeNull()
    expect(screen.queryByTestId("billing-filter-spend")).toBeNull()
    expect(screen.queryByTestId("billing-trend")).toBeNull()
    expect(screen.queryByTestId("billing-by-model")).toBeNull()
  })

  it("switches embedded website and computer tabs to their own usage surfaces", async () => {
    const usage = vi.fn().mockResolvedValue({
      auto_top_up_enabled: false,
      reset_at: "2026-09-01T00:00:00.000Z",
      period_start: "2026-08-01T00:00:00.000Z",
      period_end: "2026-08-29T23:59:59.000Z",
      total_cost_minor: "0",
      categories: [
        { key: "cloud", label: "Cloud services", free_used_minor: "0", free_limit_minor: "1000", paid_minor: "0" },
        { key: "ai", label: "Artificial intelligence", free_used_minor: "0", free_limit_minor: "100", paid_minor: "0" },
        { key: "integration", label: "Integrations", free_used_minor: "0", free_limit_minor: "100", paid_minor: "0" },
      ],
      websites: [],
      computers: [],
    })
    render(<BillingContent client={makeClient({ usage })} embedded />, { wrapper: LocaleProvider })

    fireEvent.click(screen.getByRole("radio", { name: "Websites" }))
    expect(await screen.findByTestId("billing-website-usage")).toBeInTheDocument()
    expect(screen.getByText("Cloud services")).toBeInTheDocument()
    expect(screen.getByText("No websites yet")).toBeInTheDocument()
    expect(screen.queryByTestId("billing-balance")).toBeNull()
    expect(usage).toHaveBeenCalledWith("websites")

    fireEvent.click(screen.getByRole("radio", { name: "Computer" }))
    expect(await screen.findByTestId("billing-computer-usage")).toBeInTheDocument()
    expect(screen.getByText("Cloud computer")).toBeInTheDocument()
    expect(usage).toHaveBeenCalledWith("computer")
  })

  it("clears the base Dialog padding so the panel owns its shell geometry", () => {
    renderPanel(makeClient())
    expect(screen.getByTestId("billing-panel")).toHaveClass("p-0", "box-border")
  })

  it("renders balance and held in credits (1 积分 = 10000 micros)", async () => {
    renderPanel(makeClient())
    const balance = await screen.findByTestId("billing-balance")
    // 12_500_000 micros / 10_000 = 1250 积分；500_000 / 10_000 = 50 积分。
    expect(balance.textContent).toContain("1250")
    expect(balance.textContent).toContain("50")
  })

  it("colours ledger deltas by sign and localizes known reasons", async () => {
    renderPanel(makeClient())
    await screen.findByText("Model call")
    const debit = screen.getByText("-25")
    expect(debit.getAttribute("data-sign")).toBe("negative")
    const credit = screen.getByText("+500")
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
    // 300_000_000 / 10_000 = 30000 积分。
    expect(quota.textContent).toContain("30000")
  })

  it("renders balance trend sparkline when there are ≥2 entries", async () => {
    renderPanel(makeClient())
    await screen.findByTestId("billing-trend")
  })

  it("warns on low balance and hides the warning when balance is healthy", async () => {
    // 100_000 micros = 10 积分 < 50 积分阈值 → 预警。
    renderPanel(
      makeClient({
        summary: vi.fn().mockResolvedValue({ balance_micros: "100000", held_micros: "0", quota_micros: null, quota_period: null }),
      }),
    )
    await screen.findByTestId("billing-low-balance")
    cleanup()
    // 健康余额（1250 积分）→ 无预警。
    renderPanel(makeClient())
    await screen.findByTestId("billing-balance")
    expect(screen.queryByTestId("billing-low-balance")).toBeNull()
  })

  it("filters to spend-only, hiding credit entries", async () => {
    renderPanel(makeClient())
    await screen.findByText("Model call")
    // 初始全部：入账条目（+500）可见。
    expect(screen.getByText("+500")).toBeTruthy()
    // 三个单选筛选按钮：全部 / 消费 / 入账 → 点「消费」。
    expect(screen.getAllByRole("radio")).toHaveLength(3)
    fireEvent.click(screen.getByTestId("billing-filter-spend"))
    // 入账条目隐去，仅消费（-25）留存。
    await waitFor(() => expect(screen.queryByText("+500")).toBeNull())
    expect(screen.getByText("-25")).toBeTruthy()
  })

  it("groups entries by day with a per-day net subtotal", async () => {
    renderPanel(makeClient())
    await screen.findByText("Model call")
    // 两条跨两天（DAY_A、DAY_B）→ 两个分组头。
    const dayHeads = screen.getAllByTestId("billing-day")
    expect(dayHeads).toHaveLength(2)
    // 每个组头带当日净额（data-sign 标注）。
    expect(dayHeads[0].querySelector("[data-sign]")).toBeTruthy()
  })
})
