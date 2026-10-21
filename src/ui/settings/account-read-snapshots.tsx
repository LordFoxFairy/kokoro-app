"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { AccountProfile } from "@/lib/account-profile.schema";
import type { BillingSummary } from "@/contract/http";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";

type Snapshot<T> = { scope: string; value: T };
type AccountReadSnapshots = {
  profile: Snapshot<AccountProfile> | null;
  rememberProfile: (scope: string, value: AccountProfile) => void;
  summary: Snapshot<BillingSummary> | null;
  rememberSummary: (scope: string, value: BillingSummary) => void;
};
const Context = createContext<AccountReadSnapshots | null>(null);

/** Only confirmed reads, for this open settings dialog and admission generation.
 * Panels still unmount (retiring edits and nested dialogs); no persistent store,
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
  const [saved, setSaved] = useState<{ key: string; profile: Snapshot<AccountProfile> | null; summary: Snapshot<BillingSummary> | null }>(() => ({ key, profile: null, summary: null }));
  let current = saved;
  if (saved.key !== key) {
    current = { key, profile: null, summary: null };
    setSaved(current);
  }
  const rememberProfile = useCallback((scope: string, value: AccountProfile) => {
    setSaved((previous) => previous.key === key ? { ...previous, profile: { scope, value } } : previous);
  }, [key]);
  const rememberSummary = useCallback((scope: string, value: BillingSummary) => {
    setSaved((previous) => previous.key === key ? { ...previous, summary: { scope, value } } : previous);
  }, [key]);
  const snapshots: AccountReadSnapshots = { profile: current.profile, summary: current.summary, rememberProfile, rememberSummary };
  return <Context.Provider value={snapshots}>{children}</Context.Provider>;
}

export function useAccountReadSnapshots() { return useContext(Context); }
