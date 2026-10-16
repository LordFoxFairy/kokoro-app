// Catalog read states stay functional; unsupported checkout is disabled before interaction.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { PricingClient } from "@/billing/pricing"
import { PricingClientError } from "@/billing/pricing"
import { LocaleProvider } from "@/i18n/context"
import { PricingContent, PricingPanel } from "@/ui/billing/pricing-panel"

const PLAN = {
  id: "p1",
  key: "studio",
  name: "Studio Bundle",
  currency: "USD",
  amount_minor: "4900",
  credit_micros: "1000000",
  billing_interval: "month" as const,
}

function makeClient(over: Partial<PricingClient> = {}): PricingClient {
  return {
    plans: async () => ({ plans: [PLAN] }),
    checkout: async () => ({ status: "unavailable" }),
    ...over,
  }
}

afterEach(cleanup)

function renderPanel(client: PricingClient) {
  render(<PricingPanel {...{ preview: false, readBoundary: { admitted: true, subject: "billing-test-owner", generation: 1 } }} client={client} onClose={() => {}} />, { wrapper: LocaleProvider })
}

describe("PricingPanel", () => {
  it("渲染套餐卡：名称 + 价格（minor→十进制）+ 积分（micros→十进制）", async () => {
    renderPanel(makeClient())
    await screen.findByTestId("pricing-card")
    expect(screen.getByText("Studio Bundle")).toBeTruthy()
    expect(screen.getByText("49.00")).toBeTruthy()
    expect(screen.getByText(/1 credits/)).toBeTruthy()
  })

  it("catalog not_configured → 诚实未开通态（无套餐卡）", async () => {
    const client = makeClient({
      plans: async () => {
        throw new PricingClientError("not_configured", "payment not configured", 503)
      },
    })
    renderPanel(client)
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy())
    expect(screen.queryByTestId("pricing-card")).toBeNull()
  })

  it("disables the first nonempty catalog purchase without checkout", async () => {
    const checkout = vi.fn(async () => ({ status: "ok" as const, checkout_url: "https://pay.invalid" }))
    renderPanel(makeClient({ checkout }))
    const card = await screen.findByTestId("pricing-card")
    const buy = card.querySelector("button")!
    expect(buy).toBeDisabled()
    fireEvent.click(buy)
    fireEvent.keyDown(buy, { key: "Enter" })
    fireEvent.keyUp(buy, { key: "Enter" })
    expect(checkout).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toHaveTextContent("Payments aren't set up yet")
  })
  it("keeps embedded catalog prices readable with purchases disabled", async () => {
    const checkout = vi.fn()
    render(<PricingContent {...{ preview: false, readBoundary: { admitted: true, subject: "billing-test-owner", generation: 1 } }} client={makeClient({ checkout })} embedded />, { wrapper: LocaleProvider })
    const card = await screen.findByTestId("pricing-card")
    expect(screen.getByText("49.00")).toBeInTheDocument()
    expect(card.querySelector("button")).toBeDisabled()
    fireEvent.click(card.querySelector("button")!)
    expect(checkout).not.toHaveBeenCalled()
  })

  it("preserves the canonical empty catalog without invented offers", async () => {
    renderPanel(makeClient({ plans: async () => ({ plans: [] }) }))
    await screen.findByText("No plans available to purchase")
    expect(screen.queryByTestId("pricing-card")).toBeNull()
    expect(screen.queryByRole("button", { name: "Payments unavailable" })).toBeNull()
  })

  it("shows loading while the catalog is unresolved, then its real offer", async () => {
    let resolve!: (value: { plans: typeof PLAN[] }) => void
    renderPanel(makeClient({ plans: () => new Promise((done) => { resolve = done }) }))
    expect(screen.getByRole("status")).toBeInTheDocument()
    expect(screen.queryByTestId("pricing-card")).toBeNull()
    resolve({ plans: [PLAN] })
    await screen.findByTestId("pricing-card")
  })

  it("retains catalog error and explicit retry without invoking checkout", async () => {
    const plans = vi.fn().mockRejectedValueOnce(new Error("read failure")).mockResolvedValueOnce({ plans: [PLAN] })
    const checkout = vi.fn()
    renderPanel(makeClient({ plans, checkout }))
    const retry = await screen.findByRole("button", { name: "Reload plans" })
    fireEvent.click(retry)
    await screen.findByTestId("pricing-card")
    expect(plans).toHaveBeenCalledTimes(2)
    expect(checkout).not.toHaveBeenCalled()
  })

})

describe("SET26 pricing scope and bounded reads", () => {
  const boundary = { admitted: true, subject: "pricing-owner", generation: 1 };
  function draw(client: PricingClient, preview = false, generation = 1) {
    return <LocaleProvider><PricingContent {...{ client, preview, readBoundary: { ...boundary, generation } }} /></LocaleProvider>;
  }
  it("preview offers disappear on live failure even when the client instance is unchanged", async () => {
    const plans = vi.fn().mockResolvedValueOnce({ plans: [PLAN] }).mockRejectedValueOnce(new Error("live unavailable"));
    const client = makeClient({ plans });
    const mounted = render(draw(client, true));
    await screen.findByTestId("pricing-card");
    mounted.rerender(draw(client, false));
    expect(screen.queryByTestId("pricing-card")).toBeNull();
    await screen.findByRole("button", { name: "Reload plans" });
    expect(plans).toHaveBeenCalledTimes(2);
  });
  it("a new client synchronously hides a previous client's offer instead of letting stale data win over error", async () => {
    const mounted = render(draw(makeClient()));
    await screen.findByTestId("pricing-card");
    const plans = vi.fn().mockRejectedValue(new Error("replacement unavailable"));
    mounted.rerender(draw(makeClient({ plans })));
    expect(screen.queryByTestId("pricing-card")).toBeNull();
    await screen.findByRole("button", { name: "Reload plans" });
    expect(plans).toHaveBeenCalledOnce();
  });
  it("10s noncooperative catalog settles into explicit retry and cannot overwrite its newer attempt", async () => {
    let finish!: (value: { plans: typeof PLAN[] }) => void;
    let signal: AbortSignal | undefined;
    const plans = vi.fn().mockImplementationOnce((current?: AbortSignal) => {
      signal = current;
      return new Promise((resolve) => { finish = resolve; });
    }).mockResolvedValueOnce({ plans: [] });
    const client = makeClient({ plans });
    const { act } = await import("@testing-library/react");
    try {
      vi.useFakeTimers();
      render(draw(client));
      await act(async () => { await vi.advanceTimersByTimeAsync(9_999); });
      expect(screen.getByRole("status")).toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(signal?.aborted).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Reload plans" }));
      await act(async () => {});
      expect(plans).toHaveBeenCalledTimes(2);
      await act(async () => { finish({ plans: [PLAN] }); });
      expect(screen.queryByTestId("pricing-card")).toBeNull();
      expect(screen.getByText("No plans available to purchase")).toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });
});

it("SET26 unadmitted plans dispatch zero reads and no ineffective retry", async () => {
  const plans = vi.fn();
  render(<LocaleProvider><PricingContent {...{ client: makeClient({ plans }), preview: false, readBoundary: { admitted: false, subject: "pricing-owner", generation: 1 } }} /></LocaleProvider>);
  const { act } = await import("@testing-library/react");
  await act(async () => {});
  expect(plans).not.toHaveBeenCalled();
  expect(screen.queryByTestId("pricing-card")).toBeNull();
  expect(screen.queryByRole("button", { name: "Reload plans" })).toBeNull();
});

it("SET26 generation retirement and returning to an old tuple never resurrect old catalog", async () => {
  let oldSignal: AbortSignal | undefined;
  let finishNew!: (value: { plans: typeof PLAN[] }) => void;
  const plans = vi.fn().mockImplementationOnce((signal?: AbortSignal) => { oldSignal = signal; return Promise.resolve({ plans: [PLAN] }); })
    .mockImplementation(() => new Promise((resolve) => { finishNew = resolve; }));
  const client = makeClient({ plans });
  const draw = (generation: number) => <LocaleProvider><PricingContent {...{ client, preview: false, readBoundary: { admitted: true, subject: "pricing-owner", generation } }} /></LocaleProvider>;
  const mounted = render(draw(1));
  await screen.findByTestId("pricing-card");
  mounted.rerender(draw(2));
  expect(oldSignal?.aborted).toBe(true);
  expect(screen.queryByTestId("pricing-card")).toBeNull();
  mounted.rerender(draw(1));
  expect(screen.queryByTestId("pricing-card")).toBeNull();
  const { act } = await import("@testing-library/react");
  await act(async () => { finishNew({ plans: [] }); });
  expect(screen.getByText("No plans available to purchase")).toBeInTheDocument();
  expect(plans).toHaveBeenCalledTimes(3);
});

it("SET26 caller deadline discovered before delayed timer aborts injected client", async () => {
  let clock = 0;
  const time = vi.spyOn(performance, "now").mockImplementation(() => clock);
  let signal: AbortSignal | undefined;
  const plans = vi.fn().mockImplementation((current?: AbortSignal) => {
    signal = current; clock = 10_000; return Promise.resolve({ plans: [PLAN] });
  });
  try {
    render(<LocaleProvider><PricingContent {...{ client: makeClient({ plans }), preview: false, readBoundary: { admitted: true, subject: "pricing-owner", generation: 1 } }} /></LocaleProvider>);
    await screen.findByRole("button", { name: "Reload plans" });
    expect(signal?.aborted).toBe(true);
    expect(screen.queryByTestId("pricing-card")).toBeNull();
  } finally { time.mockRestore(); }
});

it("SET26 two synchronous manual retry clicks dispatch exactly one new read", async () => {
  const plans = vi.fn().mockRejectedValueOnce(new Error("catalog failed")).mockImplementationOnce(() => new Promise(() => {}));
  render(<LocaleProvider><PricingContent {...{ client: makeClient({ plans }), preview: false, readBoundary: { admitted: true, subject: "pricing-owner", generation: 1 } }} /></LocaleProvider>);
  const retry = await screen.findByRole("button", { name: "Reload plans" });
  const { act } = await import("@testing-library/react");
  act(() => { retry.click(); retry.click(); });
  expect(plans).toHaveBeenCalledTimes(2);
});

it("SET26 unmount aborts its noncooperative catalog and ignores late completion", async () => {
  let finish!: (value: { plans: typeof PLAN[] }) => void;
  let signal: AbortSignal | undefined;
  const plans = vi.fn().mockImplementation((current?: AbortSignal) => {
    signal = current; return new Promise((resolve) => { finish = resolve; });
  });
  const mounted = render(<LocaleProvider><PricingContent {...{ client: makeClient({ plans }), preview: false, readBoundary: { admitted: true, subject: "pricing-owner", generation: 1 } }} /></LocaleProvider>);
  mounted.unmount();
  expect(signal?.aborted).toBe(true);
  const { act } = await import("@testing-library/react");
  await act(async () => { finish({ plans: [PLAN] }); });
  expect(screen.queryByTestId("pricing-card")).toBeNull();
  expect(plans).toHaveBeenCalledOnce();
});
