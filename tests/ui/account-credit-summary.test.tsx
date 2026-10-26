import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { browserBillingClient } from "@/ui/shell/page-clients";
import type { BillingSummary } from "@/contract/http";
import { LocaleProvider } from "@/i18n/context";
import { AccountCard } from "@/ui/settings/sections/account-card";
import { AccountCreditSummary } from "@/ui/settings/sections/account-credit-summary";
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
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

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

it("recognizes only the strict missing-account envelope and prepares without an opening CTA or invented balance", async () => {
  fetcher.mockResolvedValueOnce(json({ error: { code: "billing_account_not_found", message: "Missing" }, meta: { request_id: "credits-read" } }, 404)).mockReturnValueOnce(new Promise<Response>(() => {}));
  render(credit({ ...admitted, subject: "i5-migrated-missing-owner" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Loading");
  await screen.findByText("Preparing your credit account…");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByText("0")).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0]![0]).toBe(summaryPath);
  expect(fetcher.mock.calls[0]![1]?.method ?? "GET").toBe("GET");
  expect(fetcher.mock.calls[1]![0]).toBe("/api/session/billing/credit-account");
  expect(fetcher.mock.calls[1]![1]).toMatchObject({ method: "PUT", body: "{}" });
});

it.each([
  ["ordinary 404", { error: { code: "not_found", message: "Missing" }, meta: { request_id: "credits-read" } }, 404],
  ["mismatched request id", { error: { code: "billing_account_not_found", message: "Missing" }, meta: { request_id: "other-read" } }, 404],
  ["extra missing-account fields", { error: { code: "billing_account_not_found", message: "Missing" }, meta: { request_id: "credits-read" }, extra: true }, 404],
  ["malformed summary", { ...summary, available_micros: 0 }, 200],
  ["unavailable service", { error: { code: "billing_unavailable" } }, 503],
] as const)("shows an error rather than a fabricated missing account or balance for %s", async (_name, body, status) => {
  fetcher.mockResolvedValueOnce(json(body, status));
  render(credit());
  expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load, try again later");
  expect(screen.getByRole("button", { name: "Reload" })).toBeEnabled();
  expect(screen.queryByText("No credit account yet")).not.toBeInTheDocument();
  expect(screen.queryByText("0")).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("waits for an explicit retry after a network failure and reads only summary again", async () => {
  const retry = deferred<Response>();
  fetcher.mockRejectedValueOnce(new Error("offline")).mockReturnValueOnce(retry.promise);
  render(credit());
  await screen.findByRole("alert");
  expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Reload" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  await act(async () => retry.resolve(json({ ...summary, available_micros: "3750000" })));
  expect(await screen.findByText("3.75")).toBeVisible();
  for (const [input, init] of fetcher.mock.calls) {
    expect(input).toBe(summaryPath);
    expect(init?.method ?? "GET").toBe("GET");
  }
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
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
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

// I5 exercises the existing entry and real browser client, not a future hook mock.
import { StrictMode } from "react";
import { BillingContent } from "@/ui/billing/billing-panel";

const i5AccountOpenPath = "/api/session/billing/credit-account";
const i5AccountLedgerPath = "/api/session/billing/ledger";
const i5AccountMissing = {
  error: { code: "billing_account_not_found", message: "Missing" },
  meta: { request_id: "credits-read" },
};
const i5AccountAck: BillingSummary = {
  credit_account_id: "11111111-1111-4111-8111-111111111111",
  status: "active", available_micros: "0", held_micros: "0",
};
const i5AccountBoundary = { admitted: true, subject: "i5-account-owner", generation: 1 };
const i5AccountAcknowledgement = (body: BillingSummary = i5AccountAck) => Response.json(body, {
  headers: { "cache-control": "private, no-store, max-age=0", "x-request-id": "credits-read" },
});

it("I5 account strict missing initializes invisibly and displays only authoritative big integer and held reads", async () => {
  const acknowledgement = deferred<Response>();
  const freshSummary = deferred<Response>();
  const freshLedger = deferred<Response>();
  let summaryReads = 0;
  fetcher.mockImplementation(async (input: string, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "PUT" && input === i5AccountOpenPath) return acknowledgement.promise;
    if (input === summaryPath) return ++summaryReads === 1 ? json(i5AccountMissing, 404) : freshSummary.promise;
    if (input === i5AccountLedgerPath) return freshLedger.promise;
    throw new Error("Unexpected I5 account request");
  });
  render(credit(i5AccountBoundary));
  await waitFor(() => expect(fetcher.mock.calls.filter(([input, init]) => input === i5AccountOpenPath && init?.method === "PUT")).toHaveLength(1));
  const write = fetcher.mock.calls.find(([input]) => input === i5AccountOpenPath)!;
  expect(write[1]?.body).toBe("{}");
  expect(new Headers(write[1]?.headers).get("content-type")).toBe("application/json");
  expect(new Headers(write[1]?.headers).has("idempotency-key")).toBe(false);
  expect(screen.queryByRole("button", { name: /Open credit account/ })).not.toBeInTheDocument();
  expect(screen.queryByText("0", { exact: true })).not.toBeInTheDocument();
  await act(async () => acknowledgement.resolve(i5AccountAcknowledgement()));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
  expect(screen.queryByText("0", { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText("9007199254740993123.456789")).not.toBeInTheDocument();
  await act(async () => {
    freshSummary.resolve(json({ ...summary, held_micros: "1234567" }));
    freshLedger.resolve(json({ items: [], page: { next_cursor: null } }));
  });
  expect(await screen.findByText("9007199254740993123.456789")).toBeVisible();
  expect(screen.getByText("1.234567")).toBeVisible();
  expect(fetcher.mock.calls.map(([input, init]) => `${init?.method ?? "GET"} ${input}`)).toEqual([
    `GET ${summaryPath}`, `PUT ${i5AccountOpenPath}`, `GET ${summaryPath}`, `GET ${i5AccountLedgerPath}`,
  ]);
});

it("I5 account and usage share one hidden command under StrictMode without an opening CTA", async () => {
  const acknowledgement = deferred<Response>();
  fetcher.mockImplementation(async (input: string, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "PUT" && input === i5AccountOpenPath) return acknowledgement.promise;
    if (input === summaryPath || input === i5AccountLedgerPath) return json(i5AccountMissing, 404);
    throw new Error("Unexpected concurrent I5 request");
  });
  const view = render(<StrictMode><LocaleProvider>
    <AccountCreditSummary readBoundary={{ ...i5AccountBoundary, subject: "i5-concurrent-owner" }} />
    <BillingContent client={browserBillingClient()} readBoundary={{ ...i5AccountBoundary, subject: "i5-concurrent-owner" }} embedded />
  </LocaleProvider></StrictMode>);
  await waitFor(() => expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1));
  await act(async () => {});
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: /Open credit account/ })).not.toBeInTheDocument();
  view.unmount();
  await act(async () => acknowledgement.resolve(i5AccountAcknowledgement()));
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
});

it.each(["subject", "generation", "admission", "preview", "unmount"] as const)("I5 account pending initialization retires on %s and its late ACK cannot add reads or publish credits", async (change) => {
  const acknowledgement = deferred<Response>();
  let retiring = false;
  fetcher.mockImplementation(async (input: string, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "PUT" && input === i5AccountOpenPath) return acknowledgement.promise;
    if (input === summaryPath) return retiring ? json({ ...summary, available_micros: "7000000" }) : json(i5AccountMissing, 404);
    if (input === i5AccountLedgerPath) return json({ items: [], page: { next_cursor: null } });
    throw new Error("Unexpected retired I5 request");
  });
  const boundary = { ...i5AccountBoundary, subject: `i5-retire-${change}` };
  const view = render(credit(boundary));
  await waitFor(() => expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1));
  const writeSignal = fetcher.mock.calls.find(([, init]) => init?.method === "PUT")![1]?.signal;
  retiring = true;
  if (change === "unmount") view.unmount();
  else view.rerender(credit({ ...boundary, subject: change === "subject" ? "i5-next-owner" : boundary.subject,
    admitted: change !== "admission", generation: change === "generation" ? 2 : 1 }, change === "preview"));
  expect(writeSignal?.aborted).toBe(true);
  await act(async () => {});
  const afterRetirement = fetcher.mock.calls.length;
  await act(async () => acknowledgement.resolve(i5AccountAcknowledgement({ ...i5AccountAck, available_micros: "777000000" })));
  expect(fetcher).toHaveBeenCalledTimes(afterRetirement);
  expect(screen.queryByText("777")).not.toBeInTheDocument();
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
  if (change === "subject" || change === "generation") expect(await screen.findByText("7")).toBeVisible();
});

it("I5 one participant can leave a shared command without aborting the remaining usage view", async () => {
  const acknowledgement = deferred<Response>();
  const boundary = { ...i5AccountBoundary, subject: "i5-shared-participant-owner" };
  let acknowledged = false;
  fetcher.mockImplementation(async (input: string, init?: RequestInit) => {
    if (init?.method === "PUT") return acknowledgement.promise;
    if (!acknowledged) return json(i5AccountMissing, 404);
    if (input === summaryPath) return json({ ...summary, available_micros: "73456789", held_micros: "1234567" });
    if (input === i5AccountLedgerPath) return json({ items: [], page: { next_cursor: null } });
    throw new Error("Unexpected shared participant request");
  });
  const client = browserBillingClient();
  const view = render(<LocaleProvider><div>
    <AccountCreditSummary key="account" readBoundary={boundary} />
    <BillingContent key="usage" client={client} readBoundary={boundary} embedded />
  </div></LocaleProvider>);
  await waitFor(() => expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1));
  const signal = fetcher.mock.calls.find(([, init]) => init?.method === "PUT")![1]?.signal;
  view.rerender(<LocaleProvider><div><BillingContent key="usage" client={client} readBoundary={boundary} embedded /></div></LocaleProvider>);
  expect(signal?.aborted).toBe(false);
  acknowledged = true;
  await act(async () => acknowledgement.resolve(i5AccountAcknowledgement()));
  expect(await screen.findByText("73.456789")).toBeVisible();
  expect(screen.getByText("1.234567")).toBeVisible();
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledTimes(6);
});
