import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { browserBillingClient } from "@/ui/shell/page-clients";
import type { BillingSummary } from "@/contract/http";
import { LocaleProvider } from "@/i18n/context";
import { AccountCard } from "@/ui/settings/sections/account-card";
import { AccountCreditSummary } from "@/ui/settings/sections/account-credit-summary";
import { AccountReadSnapshotBoundary } from "@/ui/settings/account-read-snapshots";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const summaryPath = "/api/session/billing/summary";
const fetcher = vi.fn();
const summary = {
  credit_account_id: "11111111-1111-4111-8111-111111111111",
  status: "active",
  available_micros: "9007199254740993123456789",
  held_micros: "0",
};
const json = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { "cache-control": "private, no-store", "x-request-id": "credits-read" },
});
const admitted = { admitted: true, subject: "alice", generation: 1 };
const credit = (readBoundary: ProjectReadBoundary | undefined = admitted, preview = false) =>
  <LocaleProvider><AccountCreditSummary readBoundary={readBoundary} preview={preview} /></LocaleProvider>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  localStorage.setItem("kokoro.locale", "en");
  fetcher.mockReset().mockImplementation(async (input: string) => {
    if (input === summaryPath) return json(summary);
    if (input === "/api/account/profile") return json({ data: { subject: "alice", name: "Alice", email: null, email_verified: null } });
    throw new Error("Unexpected account request");
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { localStorage.removeItem("kokoro.web.auth-index-subject"); cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("reads only the admitted account summary and displays exact owner credits", async () => {
  render(<LocaleProvider><AccountCard readBoundary={{ admitted: true, subject: "alice", generation: 1 }} detail={null} onDetailChange={vi.fn()} onOpenSubscription={vi.fn()} /></LocaleProvider>);
  const credits = await screen.findByRole("region", { name: "Credits" });
  expect(await within(credits).findByText("9007199254740993123.456789")).toBeVisible();
  expect(within(credits).getByText("0")).toBeVisible();
  expect(within(credits).getByText("On hold")).toBeVisible();
  expect(screen.getByText("Credits", { exact: true })).toBeVisible();
  expect(fetcher.mock.calls.map(([input]) => input).sort()).toEqual(["/api/account/profile", summaryPath].sort());
  for (const [, init] of fetcher.mock.calls) expect(init?.method ?? "GET").toBe("GET");
  expect(screen.queryByText("Free")).not.toBeInTheDocument();
});

it.each([
  ["not admitted", { ...admitted, admitted: false }],
  ["null subject", { ...admitted, subject: null }],
  ["empty subject", { ...admitted, subject: "" }],
  ["blank subject", { ...admitted, subject: "  " }],
  ["negative generation", { ...admitted, generation: -1 }],
  ["fractional generation", { ...admitted, generation: 1.5 }],
  ["unsafe generation", { ...admitted, generation: Number.MAX_SAFE_INTEGER + 1 }],
  ["nonfinite generation", { ...admitted, generation: NaN }],
] as const)("does not read credits for %s", async (_name, boundary) => {
  render(credit(boundary));
  await act(async () => {});
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent("Your credit balance can be read after your session is confirmed.");
  expect(screen.queryByText("0")).not.toBeInTheDocument();
});

it("does not read credits with no boundary or in explicit preview", async () => {
  const view = render(<LocaleProvider><AccountCreditSummary readBoundary={undefined} /></LocaleProvider>);
  await act(async () => {});
  view.rerender(credit(admitted, true));
  await act(async () => {});
  expect(fetcher).not.toHaveBeenCalled();
});

it("reads generation zero, treats zero as a real balance and leaves other amounts precise", async () => {
  fetcher.mockResolvedValueOnce(json({ ...summary, available_micros: "0", held_micros: "1500000" }));
  render(credit({ ...admitted, generation: 0 }));
  expect(await screen.findByText("0")).toBeVisible();
  expect(screen.getByText("1.5")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("Credit account active");
  expect(screen.queryByText("No credit account yet")).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [input, init] = fetcher.mock.calls[0]!;
  expect(input).toBe(summaryPath);
  expect(init).toMatchObject({ cache: "no-store", redirect: "error", signal: expect.any(AbortSignal) });
  expect(init?.body).toBeUndefined();
  expect(init?.headers).toBeUndefined();
});

it("renders disabled accounts with their actual available and held amounts", async () => {
  fetcher.mockResolvedValueOnce(json({ ...summary, status: "disabled", available_micros: "2250000", held_micros: "125000" }));
  render(credit());
  expect(await screen.findByText("2.25")).toBeVisible();
  expect(screen.getByText("0.125")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("Credit account disabled");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("silently initializes a strict missing account and only displays the authoritative reread", async () => {
  localStorage.setItem("kokoro.web.auth-index-subject", admitted.subject);
  const initialized = deferred<Response>();
  fetcher.mockResolvedValueOnce(json({ error: { code: "billing_account_not_found", message: "Missing" }, meta: { request_id: "credits-read" } }, 404))
    .mockReturnValueOnce(initialized.promise).mockResolvedValueOnce(json(summary));
  render(credit());
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  expect(screen.queryByText("No credit account yet")).not.toBeInTheDocument();
  expect(document.querySelector('[data-slot="skeleton"]')).toBeNull();
  expect(screen.queryByText("0")).not.toBeInTheDocument();
  expect(fetcher.mock.calls[1]![0]).toBe("/api/session/billing/credit-account");
  expect(fetcher.mock.calls[1]![1]).toMatchObject({ method: "PUT", body: "{}" });
  await act(async () => initialized.resolve(json({ ...summary, available_micros: "0" })));
  expect(await screen.findByText("9007199254740993123.456789")).toBeVisible();
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([summaryPath, "/api/session/billing/credit-account", summaryPath]);
});

it.each(["subject", "generation", "unmount"] as const)("does not initialize an old missing account after %s retirement", async (change) => {
  const old = deferred<Response>();
  fetcher.mockReturnValueOnce(old.promise);
  const view = render(credit());
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  if (change === "unmount") view.unmount();
  else view.rerender(credit({ ...admitted, subject: change === "subject" ? "bob" : "alice", generation: 2 }));
  await act(async () => old.resolve(json({ error: { code: "billing_account_not_found", message: "Missing" }, meta: { request_id: "credits-read" } }, 404)));
  expect(fetcher.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
});

it.each([
  ["ordinary 404", { error: { code: "not_found", message: "Missing" }, meta: { request_id: "credits-read" } }, 404],
  ["mismatched request id", { error: { code: "billing_account_not_found", message: "Missing" }, meta: { request_id: "other-read" } }, 404],
  ["extra missing-account fields", { error: { code: "billing_account_not_found", message: "Missing" }, meta: { request_id: "credits-read" }, extra: true }, 404],
  ["malformed summary", { ...summary, available_micros: 0 }, 200],
  ["unavailable service", { error: { code: "billing_unavailable" } }, 503],
] as const)("keeps unknown credit fields neutral without an error panel or a fabricated balance for %s", async (_name, body, status) => {
  fetcher.mockResolvedValueOnce(json(body, status));
  render(credit());
  await waitFor(() => expect(screen.getByRole("region", { name: "Credits" })).toHaveAttribute("aria-busy", "false"));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reload" })).not.toBeInTheDocument();
  expect(screen.getAllByText("—")).toHaveLength(2);
  expect(screen.queryByText("No credit account yet")).not.toBeInTheDocument();
  expect(screen.queryByText("0")).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("keeps unknown fields quiet after network failure and rereads only on a normal remount", async () => {
  const retry = deferred<Response>();
  fetcher.mockRejectedValueOnce(new Error("offline")).mockReturnValueOnce(retry.promise);
  const view = render(credit());
  await waitFor(() => expect(screen.getByRole("region", { name: "Credits" })).toHaveAttribute("aria-busy", "false"));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.getAllByText("—")).toHaveLength(2);
  expect(screen.queryByRole("button", { name: "Reload" })).not.toBeInTheDocument();
  view.unmount();
  render(credit());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveAccessibleName(/Loading/);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  await act(async () => retry.resolve(json({ ...summary, available_micros: "3750000" })));
  expect(await screen.findByText("3.75")).toBeVisible();
  for (const [input, init] of fetcher.mock.calls) {
    expect(input).toBe(summaryPath);
    expect(init?.method ?? "GET").toBe("GET");
  }
});

it("keeps confirmed same-scope credits while a background reread fails", async () => {
  fetcher.mockResolvedValueOnce(json(summary)).mockRejectedValueOnce(new Error("offline"));
  const draw = (open: boolean) => <LocaleProvider><AccountReadSnapshotBoundary preview={false} readBoundary={admitted}>{open ? <AccountCreditSummary readBoundary={admitted} /> : null}</AccountReadSnapshotBoundary></LocaleProvider>;
  const view = render(draw(true));
  await screen.findByText("9007199254740993123.456789");
  view.rerender(draw(false));
  view.rerender(draw(true));
  expect(screen.getByText("9007199254740993123.456789")).toBeVisible();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  await act(async () => {});
  expect(screen.getByText("9007199254740993123.456789")).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reload" })).not.toBeInTheDocument();
});

it.each(["subject", "generation"] as const)("synchronously clears loaded credits and aborts the prior %s read", async (change) => {
  const pending = deferred<Response>();
  fetcher.mockResolvedValueOnce(json(summary)).mockReturnValueOnce(pending.promise);
  const view = render(credit());
  await screen.findByText("9007199254740993123.456789");
  const firstSignal = fetcher.mock.calls[0]![1].signal as AbortSignal;
  view.rerender(credit({ ...admitted, subject: change === "subject" ? "bob" : "alice", generation: change === "generation" ? 2 : 1 }));
  expect(firstSignal.aborted).toBe(true);
  expect(screen.queryByText("9007199254740993123.456789")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveAccessibleName(/Loading/);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  await act(async () => pending.resolve(json({ ...summary, available_micros: "7000000" })));
  expect(await screen.findByText("7")).toBeVisible();
});

it.each(["success", "failure"] as const)("ignores late client %s after an identity change even if the client ignores abort", async (completion) => {
  const old = deferred<BillingSummary>();
  let signal: AbortSignal | undefined;
  vi.spyOn(browserBillingClient(), "summary").mockImplementationOnce((readSignal) => { signal = readSignal; return old.promise; })
    .mockResolvedValueOnce({ ...summary, status: "active", available_micros: "7000000" });
  const view = render(credit());
  await waitFor(() => expect(signal).toBeDefined());
  view.rerender(credit({ ...admitted, subject: "bob", generation: 2 }));
  expect(signal?.aborted).toBe(true);
  await screen.findByText("7");
  await act(async () => { if (completion === "success") old.resolve({ ...summary, status: "active" }); else old.reject(new Error("late failure")); });
  expect(screen.getByText("7")).toBeVisible();
  expect(screen.queryByText("9007199254740993123.456789")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it.each(["admission", "preview", "unmount"] as const)("retires pending summary reads on %s without showing late data", async (change) => {
  const pending = deferred<Response>();
  fetcher.mockReturnValueOnce(pending.promise);
  const view = render(credit());
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  const signal = fetcher.mock.calls[0]![1].signal as AbortSignal;
  if (change === "unmount") view.unmount();
  else view.rerender(credit({ ...admitted, admitted: change !== "admission" }, change === "preview"));
  expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve(json(summary)));
  expect(screen.queryByText("9007199254740993123.456789")).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("unmounts the summary on the account sign-in subpage and rereads when returning", async () => {
  const pending = deferred<Response>();
  let reads = 0;
  fetcher.mockImplementation(async (input: string) => {
    if (input === summaryPath) return ++reads === 1 ? pending.promise : json({ ...summary, available_micros: "7000000" });
    if (input === "/api/account/profile") return json({ data: { subject: "alice", name: "Alice", email: null, email_verified: null } });
    throw new Error("Unexpected account request");
  });
  const draw = (loginMethodsOpen: boolean) => <LocaleProvider><AccountCard readBoundary={admitted} detail={loginMethodsOpen ? "login-methods" : null} onDetailChange={vi.fn()} onOpenSubscription={vi.fn()} /></LocaleProvider>;
  const view = render(draw(false));
  await waitFor(() => expect(reads).toBe(1));
  const signal = fetcher.mock.calls.find(([input]) => input === summaryPath)![1].signal as AbortSignal;
  view.rerender(draw(true));
  expect(signal.aborted).toBe(true);
  expect(screen.queryByRole("region", { name: "Credits" })).not.toBeInTheDocument();
  await act(async () => pending.resolve(json(summary)));
  view.rerender(draw(false));
  expect(await screen.findByText("7")).toBeVisible();
  expect(screen.queryByText("9007199254740993123.456789")).not.toBeInTheDocument();
  expect(reads).toBe(2);
  expect(fetcher.mock.calls.every(([input]) => input === summaryPath || input === "/api/account/profile")).toBe(true);
});
