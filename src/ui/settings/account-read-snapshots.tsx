"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { BillingClient } from "@/billing/client";
import { readBrowserAuthIndexSubject } from "@/ui/shell/page-clients";
import type { AccountProfile } from "@/lib/account-profile.schema";
import type { BillingSummary } from "@/contract/http";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";

type Snapshot<T> = { scope: string; value: T };
type SummarySnapshot = Snapshot<BillingSummary> & { client: BillingClient };
type SummaryFlight = { client: BillingClient; promise: Promise<BillingSummary>; cancel: () => void };
type SummaryOwner = { key: string; active: boolean; client: BillingClient | null; epoch: number; flight: SummaryFlight | null };
type AccountReadSnapshots = {
  profile: Snapshot<AccountProfile> | null;
  rememberProfile: (scope: string, value: AccountProfile) => void;
  summary: SummarySnapshot | null;
  readSummary: (client: BillingClient) => Promise<BillingSummary>;
};
const Context = createContext<AccountReadSnapshots | null>(null);

/** Confirmed snapshots and one same-client summary flight for this open Settings scope.
 * Panels still unmount (retiring edits, not the shared read); no persistent store,
 * credentials, cross-actor fallback or authority is cached here.
 */
export function AccountReadSnapshotBoundary({ preview, readBoundary, children }: {
  preview: boolean;
  readBoundary: ProjectReadBoundary | undefined;
  children: ReactNode;
}) {
  const admitted = readBoundary?.admitted;
  const subject = readBoundary?.subject;
  const generation = readBoundary?.generation;
  const key = JSON.stringify([preview, admitted, subject, generation]);
  const [saved, setSaved] = useState<{ key: string; profile: Snapshot<AccountProfile> | null; summary: SummarySnapshot | null }>(() => ({ key, profile: null, summary: null }));
  let current = saved;
  if (saved.key !== key) {
    current = { key, profile: null, summary: null };
    setSaved(current);
  }
  const rememberProfile = useCallback((scope: string, value: AccountProfile) => {
    setSaved((previous) => previous.key === key ? { ...previous, profile: { scope, value } } : previous);
  }, [key]);
  const activeOwner = useRef<SummaryOwner | null>(null);
  useLayoutEffect(() => {
    const owner: SummaryOwner = { key, active: true, client: null, epoch: 0, flight: null };
    activeOwner.current = owner;
    return () => {
      owner.active = false;
      owner.flight?.cancel();
      if (activeOwner.current === owner) activeOwner.current = null;
    };
  }, [key]);
  const scope = JSON.stringify([subject, generation]);
  const eligible = preview || (admitted === true && typeof subject === "string" && subject.trim().length > 0 &&
    typeof generation === "number" && Number.isSafeInteger(generation) && generation >= 0);
  const readSummary = useCallback((client: BillingClient): Promise<BillingSummary> => {
    const retired = () => new DOMException("Billing summary read retired", "AbortError");
    const owner = activeOwner.current;
    if (owner === null || owner.key !== key) return Promise.reject(retired());
    // The marker only retires a trusted boundary; it never supplies admission.
    const currentScope = () => activeOwner.current === owner && owner.active && eligible &&
      (preview || readBrowserAuthIndexSubject() === subject);
    if (!currentScope()) return Promise.reject(retired());
    if (owner.client !== client) {
      owner.flight?.cancel();
      owner.client = client;
      owner.epoch++;
      setSaved(previous => previous.key === key && previous.summary !== null ? { ...previous, summary: null } : previous);
    }
    if (owner.flight?.client === client) return owner.flight.promise;
    const epoch = owner.epoch, controller = new AbortController();
    let accept!: (value: BillingSummary) => void, reject!: (reason: unknown) => void;
    const promise = new Promise<BillingSummary>((resolve, fail) => { accept = resolve; reject = fail; });
    const flight: SummaryFlight = { client, promise, cancel: () => {
      if (owner.flight === flight) owner.flight = null;
      controller.abort(); reject(retired());
    } };
    owner.flight = flight;
    const current = () => currentScope() && owner.client === client && owner.epoch === epoch &&
      owner.flight === flight && !controller.signal.aborted;
    void Promise.resolve().then(async () => {
      try {
        if (!current()) throw retired();
        const value = await client.summary(controller.signal, current);
        if (!current()) throw retired();
        setSaved(previous => previous.key === key && currentScope() && owner.client === client && owner.epoch === epoch
          ? { ...previous, summary: { scope, value, client } } : previous);
        owner.flight = null;
        accept(value);
      } catch (error) {
        if (owner.flight === flight) owner.flight = null;
        reject(error);
      }
    });
    return promise;
  }, [eligible, key, preview, scope, subject]);
  const snapshots: AccountReadSnapshots = { profile: current.profile, summary: current.summary, rememberProfile, readSummary };
  return <Context.Provider value={snapshots}>{children}</Context.Provider>;
}

export function useAccountReadSnapshots() { return useContext(Context); }
