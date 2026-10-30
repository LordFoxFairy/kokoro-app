"use client";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { archiveIdAvailable, type ArchiveState } from "@/lib/archived-tasks.schema";
import { readArchiveState } from "@/ui/settings/archived-tasks-client";

/** Selected-view evidence only. Missing from a page never proves archive state. */
type ActiveArchiveStateInput=Readonly<{ identity: object; admitted: boolean; id: string | null; inList: boolean; listSettled: boolean; locallyCreated: boolean; hasContent: boolean; pendingSubmission: boolean; ownerConfirmed: boolean; revision: number; refresh: number; receipt?: ArchiveState | null; onPersisted:()=>void }>;
export function useActiveArchiveState(input:ActiveArchiveStateInput) {
  const key = useMemo(() => ({ identity: input.identity, id: input.id }), [input.identity, input.id]);
  const [retry, setRetry] = useState(0);
  type Evidence = { key: typeof key; receiptKey: string | null; status: "unarchived" | "archived" | "unknown" | "missing"; error: boolean };
  const [state, setState] = useState<Evidence | null>(null);
  const owner = useRef<object | null>(null);
  // Presence survives selection changes, never an identity/scope retirement.
  const [presence, setPresence] = useState<{ identity: object; ids: ReadonlySet<string> } | null>(null);
  const receipt = input.receipt?.session_id === input.id ? input.receipt : null;
  const receiptKey = receipt ? JSON.stringify(receipt) : null;
  const value = state?.key === key ? state : null;
  const knownIds = presence?.identity === input.identity ? presence.ids : undefined;
  const confirmedHere = knownIds?.has(input.id ?? "") === true;
  const positive = input.ownerConfirmed || input.inList || receipt !== null || value?.status === "unarchived" || value?.status === "archived";
  // Adjust state to observed props/read evidence; do not mutate memoized data or
  // schedule synchronous state updates from an effect.
  if (input.id && positive && !confirmedHere) setPresence({ identity: input.identity, ids: new Set([...(knownIds ?? []), input.id]) });
  const freshReceipt = receipt !== null && value?.receiptKey !== receiptKey;
  // Creation provenance is engine-local, never inferred from an empty history or a 404.
  const isDraft = input.id !== null && input.locallyCreated && !input.hasContent && !input.inList && receipt === null;
  // Pending browser intent is neither a persisted Conversation nor proof of absence.
  // Positive snapshot/ACK, ordinary-list membership or an archive receipt ends this hold.
  const isUnconfirmed = input.pendingSubmission && !input.ownerConfirmed && !confirmedHere && !input.inList && receipt === null;
  useLayoutEffect(() => {
    if (isDraft || isUnconfirmed) return;
    const attempt = {}; owner.current = attempt;
    const controller = new AbortController();
    let reject!: (e: unknown) => void;
    const cancelled = new Promise<never>((_, no) => { reject = no; });
    // No operation exists while the ordinary first page is loading.
    void cancelled.catch(() => undefined);
    const timer = setTimeout(() => { controller.abort(); reject(Error("timeout")); }, 10000);
    const publish = (status: Evidence["status"], error: boolean) => {
      if (owner.current !== attempt) return;
      setState({ key, receiptKey, status, error });
    };
    if (input.admitted && input.listSettled && input.inList) input.onPersisted();
    if (receipt && freshReceipt) publish(receipt.archived_at === null ? "unarchived" : "archived", false);
    if (input.admitted && input.id && input.listSettled && archiveIdAvailable(input.id) && (!input.inList || receipt !== null || value?.status === "archived")) {
      // Issued after the receipt, so this read may legitimately supersede its state.
      void Promise.race([cancelled, readArchiveState({id:input.id,signal:controller.signal})]).then(result => {
        if (!controller.signal.aborted && owner.current === attempt) {
          input.onPersisted();
          publish(result.archived_at === null ? "unarchived" : "archived", false);
        }
      }).catch((error: unknown) => {
        if (receipt === null) publish(typeof error === "object" && error !== null && "status" in error && error.status === 404 ? "missing" : "unknown", true);
        else if (owner.current === attempt) setState(old => old?.key === key ? { ...old, error: true } : old);
      }).finally(() => clearTimeout(timer));
    } else if (input.inList && receipt === null && value?.status!=="archived") publish("unarchived", false);
    return () => { if (owner.current === attempt) owner.current = null; controller.abort(); clearTimeout(timer); reject(Error("retired")); };
    // Leaving the empty draft, revisions and retry trigger a read; ordinary body updates do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, isDraft, isUnconfirmed, input.ownerConfirmed, input.admitted, input.listSettled, input.inList, input.revision, input.refresh, receiptKey, retry]);
  const status: Evidence["status"] | "draft" | "unconfirmed" = isUnconfirmed ? "unconfirmed" : isDraft ? "draft" : freshReceipt ? receipt.archived_at === null ? "unarchived" : "archived" : value?.status ?? (input.inList ? "unarchived" : "unknown");
  const retryRead = useCallback(() => setRetry(n => n + 1), []);
  return { status, synthetic: input.admitted && (status === "unconfirmed" || status === "unarchived" || (input.locallyCreated && (status === "unknown" || status === "missing"))), error: isDraft || isUnconfirmed ? false : value?.error ?? false, retry: retryRead };
}
