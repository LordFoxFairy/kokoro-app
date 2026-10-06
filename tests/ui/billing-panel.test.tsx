// 计费面板组件测试：余额卡 BigInt 换算 + 流水 ±着色/reason 本地化 + 空态 + 翻页
// + owner 流水历史走势与消费/入账筛选；不推导免费/配额/费率政策。
// billing 客户端为注入 fake（不打网络）；新功能断言走 data-testid/role，不耦合译文。
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createBillingClient, type BillingClient } from "@/billing/client"
import { LocaleProvider } from "@/i18n/context"
import { BillingContent, BillingPanel } from "@/ui/billing/billing-panel"

// 唯一账户和 owner journal 契约；时间以 UTC instant 传输。
const DAY_A = Date.UTC(2026, 0, 10, 3, 0, 0) // 2026-01-10
const DAY_B = Date.UTC(2026, 0, 11, 5, 0, 0) // 2026-01-11

function makeClient(overrides: Partial<BillingClient> = {}): BillingClient {
  return {
    summary: vi
      .fn()
      .mockResolvedValue({ credit_account_id: "11111111-1111-4111-8111-111111111111", status: "active", available_micros: "12500000", held_micros: "500000"}),
    ledger: vi.fn().mockResolvedValue({
      items: [
        { sequence: "1", source_ref: "owner-ref", journal_id: "e1", delta_micros: "-250000", balance_after_micros: "12500000", source_kind: "model_call", created_at: new Date(DAY_B).toISOString() },
        { sequence: "1", source_ref: "owner-ref", journal_id: "e2", delta_micros: "5000000", balance_after_micros: "12750000", source_kind: "top_up_custom", created_at: new Date(DAY_A).toISOString() },
      ],
      page: { next_cursor: "cur_2" },
    }),
    ...overrides,
  }
}

function renderPanel(client: BillingClient) {
  return render(<BillingPanel client={client} onClose={vi.fn()} />, { wrapper: LocaleProvider })
}

afterEach(() => { cleanup(); vi.unstubAllEnvs() })

describe("BillingPanel", () => {
  it("uses the compact reference hierarchy when embedded in Settings", async () => {
    render(<BillingContent client={makeClient({
      summary: vi.fn().mockResolvedValue({
        credit_account_id: "11111111-1111-4111-8111-111111111111", status: "active", available_micros: "10000000",
        held_micros: "0"
      }),
    })} embedded />, { wrapper: LocaleProvider })

    await screen.findByTestId("billing-balance")
    expect(screen.getByTestId("billing-balance")).toHaveTextContent("10")
    expect(screen.getByText("Credit history")).toBeTruthy()
    expect(screen.queryByText("Free credits")).toBeNull()
    expect(screen.queryByText("Refreshes to 3 every day at 00:00")).toBeNull()
    expect(screen.getByText("On hold")).toBeTruthy()
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
    renderPanel(makeClient({ ledger: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) }))
    await screen.findByTestId("billing-balance")
    // 空流水：无任一日期分组头（dayNet 不出现）。
    expect(screen.queryByText("Model call")).toBeNull()
  })

  it("paginates via next_cursor on load more", async () => {
    const ledger = vi
      .fn()
      .mockResolvedValueOnce({
        items: [{ sequence: "1", source_ref: "owner-ref", journal_id: "e1", delta_micros: "-250000", balance_after_micros: "12500000", source_kind: "model_call", created_at: new Date(DAY_A).toISOString() }],
        page: { next_cursor: "cur_2" },
      })
      .mockResolvedValueOnce({
        items: [{ sequence: "1", source_ref: "owner-ref", journal_id: "e2", delta_micros: "-100000", balance_after_micros: "12400000", source_kind: "tool_call", created_at: new Date(DAY_A).toISOString() }],
        page: { next_cursor: null },
      })
    renderPanel(makeClient({ ledger }))
    await screen.findByText("Model call")
    fireEvent.click(screen.getByText("Load more"))
    await screen.findByText("Tool call")
    await waitFor(() => expect(ledger).toHaveBeenCalledWith("cur_2", expect.any(AbortSignal)))
  })

  // —— B1 用量透视 ——

  it("does not invent a quota policy from an available balance", async () => {
    renderPanel(makeClient())
    await screen.findByText("12.5 credits")
    expect(screen.queryByTestId("billing-quota")).toBeNull()
    expect(screen.queryByText("Quota this cycle")).toBeNull()
  })

  it("renders balance trend sparkline when there are ≥2 entries", async () => {
    renderPanel(makeClient())
    await screen.findByTestId("billing-trend")
  })

  it("does not infer an unowned low-balance threshold", async () => {
    renderPanel(makeClient({ summary: vi.fn().mockResolvedValue({ credit_account_id: "11111111-1111-4111-8111-111111111111", status: "active", available_micros: "100000", held_micros: "0" }) }))
    await screen.findByText("0.1 credits")
    expect(screen.queryByTestId("billing-low-balance")).toBeNull()
    cleanup()
    renderPanel(makeClient())
    await screen.findByText("12.5 credits")
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
        credit_account_id: "11111111-1111-4111-8111-111111111111", status: "active", available_micros: micros,
        held_micros: "0"
      }),
      ledger: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }),
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
        items: [{
          sequence: "1", source_ref: "owner-ref", journal_id: "r54-entry",
          delta_micros: micros,
          balance_after_micros: "9007199254740993",
          source_kind: "model_call",
          created_at: new Date(DAY_A).toISOString(),
        }],
        page: { next_cursor: null },
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
        credit_account_id: "11111111-1111-4111-8111-111111111111", status: "active", available_micros: "1000000",
        held_micros: "0"
      }),
      ledger: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }),
    })} embedded />, { wrapper: LocaleProvider })

    await screen.findByText("credits", { selector: "span" })
    const balance = screen.getByTestId("billing-balance")
    expect(balance.querySelector("strong")?.textContent).toBe("Available balance")
    expect(screen.queryByText("Free", { exact: true })).toBeNull()
  })

  it("does not relabel all balance as free credits when free_credit_micros is absent", async () => {
    render(<BillingContent client={makeClient({
      summary: vi.fn().mockResolvedValue({
        credit_account_id: "11111111-1111-4111-8111-111111111111", status: "active", available_micros: "2000000",
        held_micros: "0"
      }),
      ledger: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }),
    })} embedded />, { wrapper: LocaleProvider })

    await screen.findByText("2", { exact: true })
    expect(screen.queryByText("Free credits")).toBeNull()
    expect(screen.queryByText("Pro", { exact: true })).toBeNull()
  })

  it("does not publish unsupported membership or daily credit facts", async () => {
    render(<BillingContent client={makeClient({ summary: vi.fn().mockResolvedValue({ credit_account_id: "11111111-1111-4111-8111-111111111111", status: "active", available_micros: "2000000", held_micros: "0" }), ledger: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) })} embedded />, { wrapper: LocaleProvider })
    await screen.findByText("2", { exact: true })
    expect(screen.queryByText("Free", { exact: true })).toBeNull()
    expect(screen.queryByText("Free credits")).toBeNull()
    expect(screen.queryByText("Daily refresh")).toBeNull()
  })
})

// R255: the existing same-origin adapter unwraps the committed BFF public
// envelope. These native Responses carry its complete account/ledger data;
// no test-only JSON method or Billing SDK replaces the browser reader.
const r255CreditAccount = {
  credit_account_id: "74ea5371-b5cf-4df7-b49a-582e45d959ce",
  status: "active",
  available_micros: "9007199254740993",
  held_micros: "500000",
}
const r255CreditLedger = {
  items: [
    {
      journal_id: "b8281e18-6afd-4c08-a772-8b55e2d7cbdd",
      sequence: "9007199254740993",
      delta_micros: "-1",
      balance_after_micros: "9007199254740993",
      source_kind: "model_call",
      source_ref: "owner-call-1",
      created_at: "2026-01-11T05:00:00.000Z",
    },
    {
      journal_id: "2928736b-5d5f-4d02-b2dc-3f73aeb03f88",
      sequence: "9007199254740992",
      delta_micros: "9007199254740993",
      balance_after_micros: "9007199254740994",
      source_kind: "manual_adjustment",
      source_ref: "owner-grant-1",
      created_at: "2026-01-10T03:00:00.000Z",
    },
  ],
  page: { next_cursor: "opaque+/=:page-2" },
}

function r255NativeBillingFetch() {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const parsed = new URL(url, "http://localhost")
    const data = parsed.pathname === "/api/session/billing/summary" ? r255CreditAccount
      : parsed.pathname === "/api/session/billing/ledger" ? r255CreditLedger : null
    return Response.json(data ?? { error: { code: "not_found", message: "Unknown operation", retryable: false } }, {
      status: data === null ? 404 : 200,
      headers: { "cache-control": "private, no-store, max-age=0", "x-request-id": "r255-credit-read" },
    })
  })
  vi.stubGlobal("fetch", fetcher)
  return fetcher
}

describe("R255 committed personal Credit reads", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("accepts the complete published account instead of requiring a legacy quota wallet", async () => {
    r255NativeBillingFetch()
    await expect(createBillingClient().summary()).resolves.toEqual(r255CreditAccount)
  })

  it("accepts journal identity, decimal sequence, UTC timestamps and the opaque page cursor", async () => {
    const fetcher = r255NativeBillingFetch()
    await expect(createBillingClient().ledger("opaque+/=:page-2")).resolves.toEqual(r255CreditLedger)
    const calledUrl = fetcher.mock.calls[0]?.[0]
    expect(typeof calledUrl).toBe("string")
    expect(new URL(String(calledUrl), "http://localhost").searchParams.get("cursor")).toBe("opaque+/=:page-2")
  })

  it("renders exact available and held credits in the real embedded Credits reader", async () => {
    r255NativeBillingFetch()
    render(<BillingContent client={createBillingClient()} embedded />, { wrapper: LocaleProvider })
    expect(await screen.findByText("9007199254.740993")).toBeInTheDocument()
    expect(screen.getByText("0.5")).toBeInTheDocument()
    expect(screen.queryByText("Free credits")).not.toBeInTheDocument()
    expect(screen.queryByText("Daily refresh")).not.toBeInTheDocument()
    expect(screen.queryByTestId("billing-quota")).not.toBeInTheDocument()
  })

  it("renders signed exact journals and groups the owner UTC instants without guessing conversation links", async () => {
    r255NativeBillingFetch()
    render(<BillingContent client={createBillingClient()} embedded />, { wrapper: LocaleProvider })
    expect(await screen.findByText("-0.000001")).toHaveAttribute("data-sign", "negative")
    expect(screen.getByText("+9007199254.740993")).toHaveAttribute("data-sign", "positive")
    const days = screen.getAllByTestId("billing-day")
    expect(days).toHaveLength(2)
    expect(days[0]).toHaveTextContent(new Date(r255CreditLedger.items[0]!.created_at).toLocaleDateString("en", { weekday: "short" }))
    expect(days[1]).toHaveTextContent(new Date(r255CreditLedger.items[1]!.created_at).toLocaleDateString("en", { weekday: "short" }))
    expect(screen.getByTestId("billing-ledger").querySelector('a[href*="conversation="]')).toBeNull()
  })

  it("requests only the two published reads and never invents a by-model operation", async () => {
    const fetcher = r255NativeBillingFetch()
    render(<BillingContent client={createBillingClient()} embedded />, { wrapper: LocaleProvider })
    await waitFor(() => expect(fetcher.mock.calls.some(([input]) => String(input).includes("/billing/ledger"))).toBe(true))
    expect(fetcher.mock.calls.map(([input]) => new URL(String(input), "http://localhost").pathname).sort()).toEqual([
      "/api/session/billing/ledger",
      "/api/session/billing/summary",
    ])
  })
})

function r255Deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

// Injected view fixtures use the unique committed account/journal shape.
const r255ExistingSummary = { ...r255CreditAccount, available_micros: "42000000", held_micros: "500000" }
const r255ExistingEntry = { journal_id: "22222222-2222-4222-8222-222222222222", sequence: "1", source_ref: "owner-ref", delta_micros: "-1", balance_after_micros: "42000000", source_kind: "r255-entry", created_at: new Date(DAY_A).toISOString() }

describe("R255 bounded Credit read and mounted recovery", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    window.localStorage.removeItem("kokoro.web.auth-index-subject")
  })

  it("settles and truly aborts a noncooperative header fetch within the total ten-second deadline", async () => {
    vi.useFakeTimers()
    const headers = r255Deferred<Response>()
    let signal: AbortSignal | null | undefined
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal
      return headers.promise
    }))
    let outcome: "pending" | "ready" | "error" = "pending"
    const read = createBillingClient().summary().then(() => { outcome = "ready" }, () => { outcome = "error" })
    try {
      await vi.advanceTimersByTimeAsync(10_001)
      expect(outcome).toBe("error")
      expect(signal?.aborted).toBe(true)
    } finally {
      headers.resolve(Response.json(r255ExistingSummary))
      await read
    }
  })

  it("uses one header-plus-native-body budget and releases a held body reader on expiry", async () => {
    vi.useFakeTimers()
    const headers = r255Deferred<Response>()
    let signal: AbortSignal | null | undefined
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ start(value) { controller = value }, cancel })
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal
      return headers.promise
    }))
    let outcome: "pending" | "ready" | "error" = "pending"
    const read = createBillingClient().summary().then(() => { outcome = "ready" }, () => { outcome = "error" })
    try {
      await vi.advanceTimersByTimeAsync(9_000)
      headers.resolve(new Response(body, { headers: { "content-type": "application/json", "cache-control": "private, no-store", "x-request-id": "r255-body" } }))
      await vi.advanceTimersByTimeAsync(1_001)
      expect(outcome).toBe("error")
      expect(signal?.aborted).toBe(true)
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(body.locked).toBe(false)
    } finally {
      if (cancel.mock.calls.length === 0) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(r255ExistingSummary)))
        controller.close()
      }
      await read
    }
  })

  it("aborts real reads on panel unmount and never lets their late account populate the next panel", async () => {
    const late = r255Deferred<Response>()
    const signals: (AbortSignal | null | undefined)[] = []
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/summary")) { signals.push(init?.signal); return late.promise }
      return Promise.resolve(Response.json({ items: [], page: { next_cursor: null } }, { headers: { "cache-control": "private, no-store", "x-request-id": "r255-empty" } }))
    }))
    window.localStorage.setItem("kokoro.web.auth-index-subject", "r255-actor-A")
    const mounted = render(<BillingContent client={createBillingClient()} embedded />, { wrapper: LocaleProvider })
    await waitFor(() => expect(signals).toHaveLength(1))
    mounted.unmount()
    window.localStorage.setItem("kokoro.web.auth-index-subject", "r255-actor-B")
    const next = makeClient({ summary: vi.fn().mockResolvedValue({ ...r255ExistingSummary, available_micros: "7000000" }), ledger: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) })
    render(<BillingContent client={next} embedded />, { wrapper: LocaleProvider })
    await act(async () => { late.resolve(Response.json(r255ExistingSummary)); await Promise.resolve() })
    expect(signals.every((signal) => signal?.aborted)).toBe(true)
    expect(await screen.findByText("7", { exact: true })).toBeInTheDocument()
    expect(screen.queryByText("42", { exact: true })).not.toBeInTheDocument()
  })

  it("refresh failure is an error instead of advertising the previously read balance as current", async () => {
    const summary = vi.fn().mockResolvedValueOnce(r255ExistingSummary).mockRejectedValueOnce(new Error("billing_unavailable"))
    const ledger = vi.fn().mockRejectedValueOnce(new Error("ledger unavailable")).mockResolvedValueOnce({ items: [], page: { next_cursor: null } })
    render(<BillingContent client={makeClient({ summary, ledger })} embedded />, { wrapper: LocaleProvider })
    await screen.findByText("42", { exact: true })
    fireEvent.click(await screen.findByRole("button", { name: "Reload" }))
    await waitFor(() => expect(summary).toHaveBeenCalledTimes(2))
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByText("42", { exact: true })).not.toBeInTheDocument()
    expect(screen.getByTestId("billing-balance")).toHaveTextContent("Failed to load")
  })

  it("a verified subject change cannot adopt a prior actor's shared summary or a late ledger", async () => {
    const oldLedger = r255Deferred<{ items: typeof r255ExistingEntry[]; page: { next_cursor: string | null } }>()
    window.localStorage.setItem("kokoro.web.auth-index-subject", "r255-actor-A")
    const old = makeClient({ summary: vi.fn().mockResolvedValue(r255ExistingSummary), ledger: vi.fn(() => oldLedger.promise) })
    const mounted = render(<BillingContent client={old} embedded />, { wrapper: LocaleProvider })
    await screen.findByText("42", { exact: true })
    window.localStorage.setItem("kokoro.web.auth-index-subject", "r255-actor-B")
    const current = makeClient({ summary: vi.fn().mockResolvedValue({ ...r255ExistingSummary, available_micros: "7000000" }), ledger: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) })
    mounted.rerender(<BillingContent client={current} embedded />)
    await act(async () => { oldLedger.resolve({ items: [r255ExistingEntry], page: { next_cursor: null } }); await Promise.resolve() })
    expect(await screen.findByText("7", { exact: true })).toBeInTheDocument()
    expect(screen.queryByText("42", { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByText("r255-entry")).not.toBeInTheDocument()
  })

  it("keeps pagination single-flight and makes a failed page explicitly retry the same cursor", async () => {
    const page = r255Deferred<{ items: typeof r255ExistingEntry[]; page: { next_cursor: string | null } }>()
    const ledger = vi.fn().mockResolvedValueOnce({ items: [r255ExistingEntry], page: { next_cursor: "same-opaque-page" } })
      .mockImplementationOnce(() => page.promise).mockResolvedValueOnce({ items: [{ ...r255ExistingEntry, journal_id: "33333333-3333-4333-8333-333333333333", source_kind: "r255-second" }], page: { next_cursor: null } })
    render(<BillingContent client={makeClient({ ledger })} embedded />, { wrapper: LocaleProvider })
    const more = await screen.findByRole("button", { name: "Load more" })
    fireEvent.click(more)
    expect(more).toBeDisabled()
    fireEvent.click(more)
    expect(ledger).toHaveBeenCalledTimes(2)
    await act(async () => { page.reject(new Error("page unavailable")); await Promise.resolve() })
    const section = screen.getByTestId("billing-ledger")
    expect(section).toHaveTextContent("Failed to load")
    const retry = screen.getByRole("button", { name: "Reload" })
    fireEvent.click(retry)
    await screen.findByText("r255-second")
    expect(ledger.mock.calls[2]).toEqual(["same-opaque-page", expect.any(AbortSignal)])
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument()
  })

  it("does not duplicate a journal or loop when the next page repeats its consumed cursor", async () => {
    const ledger = vi.fn().mockResolvedValueOnce({ items: [r255ExistingEntry], page: { next_cursor: "repeat-page" } })
      .mockResolvedValueOnce({ items: [r255ExistingEntry], page: { next_cursor: "repeat-page" } })
    render(<BillingContent client={makeClient({ ledger })} embedded />, { wrapper: LocaleProvider })
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }))
    await waitFor(() => expect(ledger).toHaveBeenCalledTimes(2))
    await act(async () => { await Promise.resolve() })
    expect(screen.getAllByText("r255-entry")).toHaveLength(1)
    expect(screen.getByTestId("billing-ledger")).toHaveTextContent("Failed to load")
  })

  it("stops at the owner's explicit null cursor after rendering a valid native journal page", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => Promise.resolve(Response.json(String(input).endsWith("/summary") ? r255CreditAccount : { ...r255CreditLedger, page: { next_cursor: null } }, {
      headers: { "cache-control": "private, no-store", "x-request-id": "r255-terminal" },
    }))))
    render(<BillingContent client={createBillingClient()} embedded />, { wrapper: LocaleProvider })
    await screen.findByText("-0.000001")
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument()
  })
})


describe("R255 closed read boundary and honest account states", () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    { name: "legacy summary wallet", read: "summary", body: { balance_micros: "42000000", held_micros: "500000", quota_micros: null, quota_period: null } },
    { name: "legacy ledger page", read: "ledger", body: { entries: [{ entry_id: "old-entry", delta_micros: "-1", balance_after_micros: "42000000", reason: "old-reason", created_at: DAY_A }] } },
    { name: "new summary polluted with legacy balance", read: "summary", body: { ...r255CreditAccount, balance_micros: "1" } },
    // A current-schema-valid body isolates header rejection from the known
    // new-schema mismatch. No production compatibility behavior is allowed.
    { name: "non-JSON media", read: "summary", body: r255ExistingSummary, header: "content-type", value: "text/plain" },
    { name: "cache without no-store", read: "summary", body: r255ExistingSummary, header: "cache-control", value: "private, max-age=0" },
    { name: "missing request ID", read: "summary", body: r255ExistingSummary, header: "x-request-id", value: null },
  ])("rejects $name instead of admitting a wallet or unsafe response", async ({ read, body, header, value }) => {
    const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store", "x-request-id": "r255-closed" })
    if (header !== undefined) {
      if (value === null) headers.delete(header)
      else headers.set(header, value!)
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { headers })))
    const client = createBillingClient()
    await expect(read === "summary" ? client.summary() : client.ledger()).rejects.toBeInstanceOf(Error)
  })

  it.each([
    { name: "zero account with an empty terminal ledger", status: 200, account: { ...r255CreditAccount, available_micros: "0", held_micros: "0" }, expected: "0" },
    { name: "disabled account retains its owner amounts", status: 200, account: { ...r255CreditAccount, status: "disabled", available_micros: "7000000", held_micros: "500000" }, expected: "7" },
    { name: "missing account is an error, not a fabricated zero wallet", status: 404, account: { error: { code: "billing_account_not_found", message: "Account not found" } }, expected: null },
  ])("renders $name honestly", async ({ status, account, expected }) => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => Promise.resolve(Response.json(
      String(input).endsWith("/summary") ? account : { items: [], page: { next_cursor: null } }, {
        status: String(input).endsWith("/summary") ? status : 200,
        headers: { "cache-control": "private, no-store", "x-request-id": "r255-account-state" },
      },
    ))))
    render(<BillingContent client={createBillingClient()} embedded />, { wrapper: LocaleProvider })
    const balance = screen.getByTestId("billing-balance")
    if (expected === null) {
      await waitFor(() => expect(balance).toHaveTextContent("Failed to load"))
      expect(within(balance).queryAllByText("0", { exact: true })).toHaveLength(0)
    } else {
      await waitFor(() => expect(within(balance).getAllByText(expected, { exact: true }).length).toBeGreaterThan(0))
      expect(balance).not.toHaveTextContent("Failed to load")
      await waitFor(() => expect(screen.getByTestId("billing-ledger")).toHaveTextContent("No transactions yet"))
    }
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument()
    expect(screen.queryByTestId("billing-quota")).not.toBeInTheDocument()
  })
})

it("R255 preserves UTC wire instants but groups two midnight-crossing journals by the user's local calendar", async () => {
  // Test-local process calendar, not a new product time-zone setting.
  vi.stubEnv("TZ", "America/New_York")
  expect(new Date("2026-01-10T03:00:00Z").getDate()).toBe(9)
  const items = [
    { ...r255CreditLedger.items[0]!, created_at: "2026-01-10T03:00:00Z", delta_micros: "-1" },
    { ...r255CreditLedger.items[1]!, created_at: "2026-01-09T23:00:00Z", delta_micros: "2" },
  ]
  renderPanel(makeClient({ ledger: vi.fn().mockResolvedValue({ items, page: { next_cursor: null } }) }))
  await screen.findByText("Model call")
  const days = screen.getAllByTestId("billing-day")
  expect(days).toHaveLength(1)
  expect(days[0]).toHaveTextContent(new Date(items[0]!.created_at).toLocaleDateString())
  expect(days[0]).toHaveTextContent("+0.000001")
})
