import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/i18n/context";
import { browserBillingClient } from "@/ui/shell/page-clients";
import { BillingContent } from "@/ui/billing/billing-panel";
import { AccountReadSnapshotBoundary } from "@/ui/settings/account-read-snapshots";
import { AccountCreditSummary } from "@/ui/settings/sections/account-credit-summary";
import type { BillingSummary } from "@/contract/http";

const boundary = { admitted: true, subject: "credit-card-owner", generation: 1 };
const value: BillingSummary = { credit_account_id: "11111111-1111-4111-8111-111111111111", status: "active", available_micros: "9007199254740993123456789", held_micros: "40000000" };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const pricing = vi.fn();
function Settings({ tab }: { tab: "account" | "credits" }) {
  return <LocaleProvider><AccountReadSnapshotBoundary preview={false} readBoundary={boundary}>
    {tab === "account" ? <AccountCreditSummary readBoundary={boundary} onOpenPricing={pricing} /> : <BillingContent client={browserBillingClient()} readBoundary={boundary} embedded onOpenPricing={pricing} />}
  </AccountReadSnapshotBoundary></LocaleProvider>;
}
beforeEach(() => { localStorage.setItem("kokoro.locale", "en"); localStorage.setItem("kokoro.web.auth-index-subject", boundary.subject); pricing.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.removeItem("kokoro.web.auth-index-subject"); });

it("uses the same compact card and exact credits in both Settings entries while revalidating", async () => {
  const second = deferred<BillingSummary>();
  vi.spyOn(browserBillingClient(), "summary").mockResolvedValueOnce(value).mockReturnValueOnce(second.promise);
  vi.spyOn(browserBillingClient(), "ledger").mockResolvedValue({ items: [], page: { next_cursor: null } });
  const view = render(<Settings tab="account" />);
  await screen.findByText("9007199254740993123.456789");
  const account = screen.getByTestId("billing-balance");
  const cardContent = account.innerHTML;
  const cardClass = account.className;
  view.rerender(<Settings tab="credits" />);
  expect(screen.getByTestId("billing-balance").innerHTML).toBe(cardContent);
  expect(screen.getByTestId("billing-balance").className).toBe(cardClass);
  expect(within(screen.getByTestId("billing-balance")).queryByText("—")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Upgrade" }));
  expect(pricing).toHaveBeenCalledOnce();
  await act(async () => second.resolve(value));
});

it("hands an in-flight summary to the other tab without aborting or issuing another GET", async () => {
  const pending = deferred<BillingSummary>();
  const read = vi.spyOn(browserBillingClient(), "summary").mockReturnValue(pending.promise);
  vi.spyOn(browserBillingClient(), "ledger").mockResolvedValue({ items: [], page: { next_cursor: null } });
  const view = render(<Settings tab="account" />);
  await act(async () => {});
  view.rerender(<Settings tab="credits" />);
  await act(async () => {});
  expect(read).toHaveBeenCalledOnce();
  expect(read.mock.calls[0]?.[0]?.aborted).toBe(false);
  await act(async () => pending.resolve(value));
  expect(screen.getByText("9007199254740993123.456789")).toBeVisible();
});

it("settles the balance independently of a slow credit history", async () => {
  const history = deferred<Awaited<ReturnType<ReturnType<typeof browserBillingClient>["ledger"]>>>();
  vi.spyOn(browserBillingClient(), "summary").mockResolvedValue(value);
  vi.spyOn(browserBillingClient(), "ledger").mockReturnValue(history.promise);
  render(<Settings tab="credits" />);
  await screen.findByText("9007199254740993123.456789");
  expect(screen.getByTestId("billing-balance")).toHaveAttribute("aria-busy", "false");
  await act(async () => history.resolve({ items: [], page: { next_cursor: null } }));
});

// The browser marker retires a prior trusted scope; warm UI never revives it.
it.each(["account", "credits"] as const)("hides the previous subject's confirmed balance on marker retirement into %s", async target => {
  vi.spyOn(browserBillingClient(), "summary").mockResolvedValue(value);
  vi.spyOn(browserBillingClient(), "ledger").mockResolvedValue({ items: [], page: { next_cursor: null } });
  const view = render(<Settings tab="account" />);
  await screen.findByText("9007199254740993123.456789");
  localStorage.setItem("kokoro.web.auth-index-subject", "other-owner");
  view.rerender(<Settings tab={target} />);
  expect(screen.queryByText("9007199254740993123.456789")).not.toBeInTheDocument();
  await act(async () => {});
  expect(screen.queryByText("9007199254740993123.456789")).not.toBeInTheDocument();
  expect(within(screen.getByTestId("billing-balance")).getAllByText("—")).toHaveLength(2);
  view.rerender(<Settings tab="account" />);
  expect(screen.queryByText("9007199254740993123.456789")).not.toBeInTheDocument();
});

it("retires shared balances quietly when browser subject storage becomes unreadable", async () => {
  vi.spyOn(browserBillingClient(), "summary").mockResolvedValue(value);
  vi.spyOn(browserBillingClient(), "ledger").mockResolvedValue({ items: [], page: { next_cursor: null } });
  const view = render(<Settings tab="account" />);
  await screen.findByText("9007199254740993123.456789");
  const getItem = Storage.prototype.getItem;
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
    if (key === "kokoro.web.auth-index-subject") throw new DOMException("Storage unavailable", "SecurityError");
    return getItem.call(this, key);
  });
  view.rerender(<Settings tab="account" />);
  expect(within(screen.getByTestId("billing-balance")).getAllByText("—")).toHaveLength(2);
  expect(screen.queryByText("9007199254740993123.456789")).not.toBeInTheDocument();
  view.rerender(<Settings tab="credits" />);
  await act(async () => {});
  expect(within(screen.getByTestId("billing-balance")).getAllByText("—")).toHaveLength(2);
});
