import { StrictMode, useEffect, useLayoutEffect } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { BillingClient } from "@/billing/client";
import type { BillingSummary } from "@/contract/http";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { AccountReadSnapshotBoundary, useAccountReadSnapshots } from "@/ui/settings/account-read-snapshots";

const admitted = { subject: "alice", admitted: true, generation: 1 };
const summary: BillingSummary = { credit_account_id: "11111111-1111-4111-8111-111111111111", status: "active", available_micros: "780000000", held_micros: "40000000" };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const client = (read = vi.fn<BillingClient["summary"]>().mockResolvedValue(summary)): BillingClient => ({ summary: read, ledger: vi.fn() });
let owner: NonNullable<ReturnType<typeof useAccountReadSnapshots>>;
function View({ tab }: { tab: string }) {
  const value = useAccountReadSnapshots();
  useLayoutEffect(() => { if (value) owner = value; }, [value]);
  if (!value) throw new Error("owner missing");
  return <output aria-label={tab}>{value.summary?.value.available_micros ?? "unknown"}</output>;
}
function draw(tab = "Account", boundary: ProjectReadBoundary | undefined = admitted, preview = false) {
  return <AccountReadSnapshotBoundary preview={preview} readBoundary={boundary}><View key={tab} tab={tab} /></AccountReadSnapshotBoundary>;
}
beforeEach(() => localStorage.setItem("kokoro.web.auth-index-subject", "alice"));
afterEach(() => { cleanup(); localStorage.clear(); });

it("hands one pending owner read from Account to Credits without aborting or dispatching another GET", async () => {
  const pending = deferred<BillingSummary>(), read = vi.fn<BillingClient["summary"]>().mockReturnValue(pending.promise), billing = client(read);
  const view = render(draw());
  let first!: Promise<BillingSummary>;
  act(() => { first = owner.readSummary(billing); });
  await act(async () => { await Promise.resolve(); });
  view.rerender(draw("Credits"));
  let second!: Promise<BillingSummary>;
  act(() => { second = owner.readSummary(billing); });
  expect(second).toBe(first); expect(read).toHaveBeenCalledOnce();
  expect(read.mock.calls[0]![0]?.aborted).toBe(false);
  await act(async () => { pending.resolve(summary); await first; });
  expect(screen.getByLabelText("Credits")).toHaveTextContent("780000000");
  expect(owner.summary).toEqual({ scope: JSON.stringify(["alice", 1]), value: summary, client: billing });
  view.rerender(draw("Account"));
  expect(screen.getByLabelText("Account")).toHaveTextContent("780000000");
});

it("keeps confirmed same-scope data on a failed fresh read and keeps readSummary stable after publication", async () => {
  const pending = deferred<BillingSummary>(), read = vi.fn<BillingClient["summary"]>().mockResolvedValueOnce(summary).mockReturnValueOnce(pending.promise), billing = client(read);
  render(draw()); const stable = owner.readSummary;
  await act(async () => { await owner.readSummary(billing); });
  expect(owner.readSummary).toBe(stable);
  let fresh!: Promise<BillingSummary>;
  act(() => { fresh = owner.readSummary(billing); });
  const failed = expect(fresh).rejects.toThrow("offline");
  expect(screen.getByLabelText("Account")).toHaveTextContent("780000000");
  await act(async () => { pending.reject(new Error("offline")); await failed; });
  expect(read).toHaveBeenCalledTimes(2); expect(owner.summary?.value).toBe(summary); expect(owner.readSummary).toBe(stable);
});

it("retires an old client and its late reply without borrowing its confirmed data", async () => {
  const oldPending = deferred<BillingSummary>(), freshPending = deferred<BillingSummary>();
  const read = vi.fn<BillingClient["summary"]>().mockResolvedValueOnce(summary).mockReturnValueOnce(oldPending.promise);
  const firstClient = client(read), secondClient = client(vi.fn<BillingClient["summary"]>().mockReturnValue(freshPending.promise));
  render(draw());
  await act(async () => { await owner.readSummary(firstClient); });
  let old!: Promise<BillingSummary>;
  act(() => { old = owner.readSummary(firstClient); });
  const retired = expect(old).rejects.toMatchObject({ name: "AbortError" });
  await act(async () => { await Promise.resolve(); });
  let next!: Promise<BillingSummary>;
  act(() => { next = owner.readSummary(secondClient); });
  await retired;
  expect(read.mock.calls[1]![0]?.aborted).toBe(true);
  expect(read.mock.calls[1]![1]?.()).toBe(false);
  expect(owner.summary).toBeNull();
  await act(async () => { oldPending.resolve({ ...summary, available_micros: "1" }); await Promise.resolve(); });
  expect(owner.summary).toBeNull();
  const newer = { ...summary, available_micros: "990000000" };
  await act(async () => { freshPending.resolve(newer); await next; });
  expect(owner.summary).toEqual({ scope: JSON.stringify(["alice", 1]), value: newer, client: secondClient });
});

it.each(["subject", "generation", "admission", "preview"] as const)("retires the old %s scope, rejects a pending read and ignores its late data", async change => {
  const pending = deferred<BillingSummary>(), read = vi.fn<BillingClient["summary"]>().mockReturnValue(pending.promise), billing = client(read);
  const view = render(draw());
  let old!: Promise<BillingSummary>;
  act(() => { old = owner.readSummary(billing); });
  const retired = expect(old).rejects.toMatchObject({ name: "AbortError" });
  await act(async () => { await Promise.resolve(); });
  const boundary = { ...admitted, ...(change === "subject" ? { subject: "bob" } : change === "generation" ? { generation: 2 } : change === "admission" ? { admitted: false } : {}) };
  if (change === "subject") localStorage.setItem("kokoro.web.auth-index-subject", "bob");
  view.rerender(draw("Credits", boundary, change === "preview"));
  await retired;
  expect(read.mock.calls[0]![0]?.aborted).toBe(true);
  expect(owner.summary).toBeNull();
  await act(async () => { pending.resolve(summary); await Promise.resolve(); });
  expect(owner.summary).toBeNull(); expect(screen.getByLabelText("Credits")).toHaveTextContent("unknown");
});

it("does not revive a pending A scope after an A-to-B-to-A transition", async () => {
  const pending = deferred<BillingSummary>(), billing = client(vi.fn<BillingClient["summary"]>().mockReturnValue(pending.promise));
  const view = render(draw());
  let old!: Promise<BillingSummary>;
  act(() => { old = owner.readSummary(billing); });
  const retired = expect(old).rejects.toMatchObject({ name: "AbortError" });
  await act(async () => { await Promise.resolve(); });
  view.rerender(draw("Credits", { ...admitted, generation: 2 }));
  view.rerender(draw()); await retired;
  await act(async () => { pending.resolve(summary); await Promise.resolve(); });
  expect(owner.summary).toBeNull();
});

it("unmounting the whole settings owner aborts and rejects a read even if its client ignores cancellation", async () => {
  const pending = deferred<BillingSummary>(), read = vi.fn<BillingClient["summary"]>().mockReturnValue(pending.promise), billing = client(read);
  const view = render(draw());
  let work!: Promise<BillingSummary>;
  act(() => { work = owner.readSummary(billing); });
  const retired = expect(work).rejects.toMatchObject({ name: "AbortError" });
  await act(async () => { await Promise.resolve(); });
  view.unmount(); await retired;
  expect(read.mock.calls[0]![0]?.aborted).toBe(true);
  await act(async () => { pending.resolve(summary); await Promise.resolve(); });
  render(draw()); expect(owner.summary).toBeNull();
});

it("requires live trusted admission and current marker, but allows an explicitly isolated preview", async () => {
  const read = vi.fn<BillingClient["summary"]>().mockResolvedValue(summary), billing = client(read);
  const view = render(draw("Account", { ...admitted, admitted: false }));
  await expect(owner.readSummary(billing)).rejects.toMatchObject({ name: "AbortError" });
  view.rerender(draw("Account", { ...admitted, subject: "" }));
  await expect(owner.readSummary(billing)).rejects.toMatchObject({ name: "AbortError" });
  view.rerender(draw("Account", { ...admitted, generation: -1 }));
  await expect(owner.readSummary(billing)).rejects.toMatchObject({ name: "AbortError" });
  view.rerender(draw()); localStorage.setItem("kokoro.web.auth-index-subject", "bob");
  await expect(owner.readSummary(billing)).rejects.toMatchObject({ name: "AbortError" });
  expect(read).not.toHaveBeenCalled(); expect(owner.summary).toBeNull();
  view.rerender(draw("Preview", { ...admitted, admitted: false }, true));
  await act(async () => { await owner.readSummary(billing); });
  expect(owner.summary?.client).toBe(billing);
  view.rerender(draw()); expect(owner.summary).toBeNull();
  await expect(owner.readSummary(billing)).rejects.toMatchObject({ name: "AbortError" });
  expect(read).toHaveBeenCalledOnce();
});

it("a changed browser subject retires the pending continuation without remembering its result", async () => {
  const pending = deferred<BillingSummary>(), read = vi.fn<BillingClient["summary"]>().mockReturnValue(pending.promise), billing = client(read);
  render(draw());
  let work!: Promise<BillingSummary>;
  act(() => { work = owner.readSummary(billing); });
  const retired = expect(work).rejects.toMatchObject({ name: "AbortError" });
  await act(async () => { await Promise.resolve(); });
  localStorage.setItem("kokoro.web.auth-index-subject", "bob");
  expect(read.mock.calls[0]![1]?.()).toBe(false);
  await act(async () => { pending.resolve(summary); await retired; });
  expect(owner.summary).toBeNull();
});

it("keeps original profile snapshots and exact disabled/zero credit facts independently", async () => {
  const exact = { ...summary, status: "disabled" as const, available_micros: "0", held_micros: "0" }, billing = client(vi.fn<BillingClient["summary"]>().mockResolvedValue(exact));
  render(draw()); const remember = owner.rememberProfile;
  const profile = { subject: "alice", name: "Alice", email: null, email_verified: null };
  act(() => owner.rememberProfile("profile-scope", profile));
  await act(async () => { await owner.readSummary(billing); });
  expect(owner.profile).toEqual({ scope: "profile-scope", value: profile });
  expect(owner.rememberProfile).toBe(remember);
  expect(owner.summary?.value).toBe(exact);
});


it("a cold failure stays unknown and only an explicit new read retries", async () => {
  const read = vi.fn<BillingClient["summary"]>().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(summary), billing = client(read);
  render(draw());
  await act(async () => { await expect(owner.readSummary(billing)).rejects.toThrow("offline"); });
  expect(owner.summary).toBeNull(); expect(screen.getByLabelText("Account")).toHaveTextContent("unknown");
  expect(read).toHaveBeenCalledOnce();
  await act(async () => { await owner.readSummary(billing); });
  expect(read).toHaveBeenCalledTimes(2); expect(owner.summary?.value).toBe(summary);
});

it("StrictMode retires its rehearsal scope without a second physical read or a publication loop", async () => {
  const read = vi.fn<BillingClient["summary"]>().mockResolvedValue(summary), billing = client(read);
  function Subscriber() {
    const snapshots = useAccountReadSnapshots();
    const readSummary = snapshots?.readSummary;
    useEffect(() => { if (readSummary) void readSummary(billing).catch(() => undefined); }, [readSummary]);
    return <View tab="Account" />;
  }
  render(<StrictMode><AccountReadSnapshotBoundary preview={false} readBoundary={admitted}><Subscriber /></AccountReadSnapshotBoundary></StrictMode>);
  await waitFor(() => expect(screen.getByLabelText("Account")).toHaveTextContent("780000000"));
  expect(read).toHaveBeenCalledOnce(); expect(owner.summary?.value).toBe(summary);
});
