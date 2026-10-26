// Catalog read states stay functional; unsupported checkout is disabled before interaction.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
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
  return render(<PricingPanel {...{ preview: false, readBoundary: { admitted: true, subject: "billing-test-owner", generation: 1 } }} client={client} onClose={() => {}} />, { wrapper: LocaleProvider })
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

  it("keeps unresolved catalog quiet and accessible, then renders its real offer", async () => {
    let resolve!: (value: { plans: typeof PLAN[] }) => void
    renderPanel(makeClient({ plans: () => new Promise((done) => { resolve = done }) }))
    expect(screen.getByRole("status")).toBeInTheDocument()
    expect(screen.queryByTestId("pricing-card")).toBeNull()
    resolve({ plans: [PLAN] })
    await screen.findByTestId("pricing-card")
  })

  it("keeps failed reads quiet without fake empty offers; reopening reads again", async () => {
    const plans = vi.fn().mockRejectedValueOnce(new Error("read failure")).mockResolvedValueOnce({ plans: [PLAN] })
    const checkout = vi.fn()
    const client = makeClient({ plans, checkout })
    const mounted = renderPanel(client)
    await screen.findByText("Failed to load plans")
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.queryByRole("button", { name: "Reload plans" })).toBeNull()
    expect(screen.queryByText("No plans available to purchase")).toBeNull()
    expect(screen.queryByTestId("pricing-card")).toBeNull()
    expect(plans).toHaveBeenCalledTimes(1)
    mounted.unmount()
    renderPanel(client)
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
    await screen.findByText("Failed to load plans");
    expect(plans).toHaveBeenCalledTimes(2);
  });
  it("a new client synchronously hides a previous client's offer instead of letting stale data win over error", async () => {
    const mounted = render(draw(makeClient()));
    await screen.findByTestId("pricing-card");
    const plans = vi.fn().mockRejectedValue(new Error("replacement unavailable"));
    mounted.rerender(draw(makeClient({ plans })));
    expect(screen.queryByTestId("pricing-card")).toBeNull();
    await screen.findByText("Failed to load plans");
    expect(plans).toHaveBeenCalledOnce();
  });
  it("10s noncooperative catalog retires quietly and cannot overwrite a reopened view", async () => {
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
      const mounted = render(draw(client));
      await act(async () => { await vi.advanceTimersByTimeAsync(9_999); });
      expect(screen.getByRole("status")).toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(signal?.aborted).toBe(true);
      expect(screen.queryByRole("button", { name: "Reload plans" })).toBeNull();
      mounted.unmount();
      render(draw(client));
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
    await screen.findByText("Failed to load plans");
    expect(signal?.aborted).toBe(true);
    expect(screen.queryByTestId("pricing-card")).toBeNull();
  } finally { time.mockRestore(); }
});

it("passive failed catalog does not dispatch background retry on rerender", async () => {
  const plans = vi.fn().mockRejectedValue(new Error("catalog failed"));
  const client = makeClient({ plans });
  const draw = () => <LocaleProvider><PricingContent client={client} readBoundary={{ admitted: true, subject: "pricing-owner", generation: 1 }} /></LocaleProvider>;
  const mounted = render(draw());
  await screen.findByText("Failed to load plans");
  mounted.rerender(draw());
  const { act } = await import("@testing-library/react");
  await act(async () => {});
  expect(plans).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Reload plans" })).toBeNull();
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

it("plan detail previews filter actual billing periods without inventing discounts or starting checkout", async () => {
  const annual = { ...PLAN, id: "annual", name: "Annual offer", billing_interval: "year" as const, amount_minor: "39900" };
  const once = { ...PLAN, id: "once", name: "One-time offer", billing_interval: "once" as const, amount_minor: "700" };
  const plans = vi.fn().mockResolvedValue({ plans: [PLAN, annual, once] });
  const checkout = vi.fn();
  renderPanel(makeClient({ plans, checkout }));
  await screen.findByText("Studio Bundle");
  const period = screen.getByRole("combobox", { name: "Billing period" });
  expect(period.tagName).toBe("BUTTON");
  fireEvent.keyDown(period, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "per year" }));
  expect(screen.queryByText("Studio Bundle")).not.toBeInTheDocument();
  expect(screen.queryByText("One-time offer")).not.toBeInTheDocument();
  expect(screen.getByText("399.00")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "View Annual offer details" }));
  const dialog = screen.getByRole("dialog", { name: "Annual offer" });
  expect(dialog).toHaveTextContent("399.00");
  expect(dialog).toHaveTextContent("USD");
  expect(dialog).toHaveTextContent("year");
  expect(within(dialog).getByRole("button", { name: "Payments unavailable" })).toBeDisabled();
  expect(within(dialog).getByRole("button", { name: "Payments unavailable" })).toHaveAccessibleDescription(/Payments aren't set up/);
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  fireEvent.keyDown(period, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "per month" }));
  expect(screen.getByText("49.00")).toBeVisible();
  fireEvent.keyDown(period, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "one-time" }));
  expect(screen.getByText("One-time offer")).toBeVisible();
  expect(plans).toHaveBeenCalledTimes(1);
  expect(checkout).not.toHaveBeenCalled();
});

it("reopening a confirmed empty catalog displays only the newly returned offer", async () => {
  let finish!: (value: { plans: typeof PLAN[] }) => void;
  const plans = vi.fn().mockResolvedValueOnce({ plans: [] }).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const checkout = vi.fn();
  const client = makeClient({ plans, checkout });
  const mounted = renderPanel(client);
  await screen.findByText("No plans available to purchase");
  expect(plans).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button", { name: "Reload plans" })).toBeNull();
  expect(screen.queryByTestId("pricing-card")).not.toBeInTheDocument();

  mounted.unmount();
  renderPanel(client);
  expect(screen.getByRole("status")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Reload plans" })).not.toBeInTheDocument();
  expect(plans).toHaveBeenCalledTimes(2);
  const { act } = await import("@testing-library/react");
  await act(async () => { finish({ plans: [{ ...PLAN, name: "Fresh catalog offer", amount_minor: "7301" }] }); });
  const card = screen.getByTestId("pricing-card");
  expect(card).toHaveTextContent("Fresh catalog offer");
  expect(card).toHaveTextContent("73.01");
  expect(screen.queryByText("Studio Bundle")).not.toBeInTheDocument();
  const buy = within(card).getByRole("button", { name: "Payments unavailable" });
  expect(buy).toBeDisabled();
  expect(buy).toHaveAccessibleDescription(/Payments aren't set up yet/);
  fireEvent.click(buy);
  expect(checkout).not.toHaveBeenCalled();
  expect(plans).toHaveBeenCalledTimes(2);
});
