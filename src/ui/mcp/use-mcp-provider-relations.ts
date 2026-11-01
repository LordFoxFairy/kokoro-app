"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { HubClientError, type HubClient } from "@/hub/client";
import type { McpConnector } from "@/hub/mcp-connector.schema";
import { useProductReadRecheck } from "@/ui/auth/product-read-recheck-context";
import { useMcpConnectorRevision } from "./use-mcp-projection";

export type McpProviderRelationRead = {
  items: readonly McpConnector[];
  loading: boolean;
  complete: boolean;
  error: boolean;
  retrying: boolean;
  retry: () => void;
};
type Flight = { controller: AbortController; promise: Promise<McpConnector[]>; subscribers: number };
const flights = new WeakMap<HubClient, Map<string, Flight>>();

async function readAll(client: HubClient, signal: AbortSignal): Promise<McpConnector[]> {
  const rows = new Map<string, McpConnector>(), cursors = new Set<string>();
  let cursor: string | undefined;
  // Operational read budget, not an account/business limit. Exhaustion remains
  // unknown: never return a partial/empty success or unlock Create.
  for (let pageNumber = 0; pageNumber < 50; pageNumber++) {
    signal.throwIfAborted();
    const page = await client.listMcpConnectors({ limit: 100, ...(cursor ? { cursor } : {}) }, signal);
    signal.throwIfAborted();
    for (const row of page.items) {
      const previous = rows.get(row.connector_id);
      if (previous && previous.provider_key !== row.provider_key) throw Error("MCP relation identity changed");
      rows.set(row.connector_id, row);
    }
    if (page.next_cursor === null) return [...rows.values()];
    if (cursors.has(page.next_cursor)) throw Error("MCP relation cursor loop");
    cursor = page.next_cursor;
    cursors.add(cursor);
  }
  throw Error("MCP relation read budget exceeded");
}

function subscribeScan(client: HubClient, key: string) {
  let entries = flights.get(client);
  if (!entries) { entries = new Map(); flights.set(client, entries); }
  let flight = entries.get(key);
  if (!flight) {
    const controller = new AbortController();
    let removeAbort = () => {};
    const deadline = setTimeout(() => controller.abort(), 10_000);
    const promise = new Promise<McpConnector[]>((resolve, reject) => {
      const abort = () => reject(Error("MCP relation read cancelled or timed out"));
      controller.signal.addEventListener("abort", abort, { once: true });
      removeAbort = () => controller.signal.removeEventListener("abort", abort);
      void readAll(client, controller.signal).then(resolve, reject);
    });
    flight = { controller, promise, subscribers: 0 };
    entries.set(key, flight);
    const own = flight;
    void promise.finally(() => {
      clearTimeout(deadline); removeAbort();
      if (entries.get(key) === own) entries.delete(key);
    }).catch(() => undefined);
  }
  const own = flight;
  own.subscribers++;
  let released = false;
  return { promise: own.promise, signal: own.controller.signal, release: () => {
    if (released) return;
    released = true;
    if (--own.subscribers !== 0) return;
    // StrictMode replacement subscribers may still own the same admitted read.
    queueMicrotask(() => { if (own.subscribers === 0) {
      if (entries.get(key) === own) entries.delete(key);
      own.controller.abort();
    } });
  } };
}

/** Share only live scans, never trust a restored/old first page as a complete relation. */
export function useMcpProviderRelations({ client, identity, admitted, readGeneration, enabled, refreshKey }: {
  client: HubClient; identity: string; admitted: boolean; readGeneration: number; enabled: boolean; refreshKey: number;
}): McpProviderRelationRead {
  const reportRead401 = useProductReadRecheck();
  const revision = useMcpConnectorRevision(client, identity);
  const [attempt, setAttempt] = useState(0);
  const owner = useMemo(() => ({ client, identity, admitted, readGeneration, enabled, refreshKey, revision }),
    [client, identity, admitted, readGeneration, enabled, refreshKey, revision]);
  const scope = useMemo(() => ({ owner, attempt }), [owner, attempt]);
  const activeOwner = useRef<typeof owner | null>(owner);
  const pending = useRef<{ owner: typeof owner; attempt: number } | null>(null);
  const [retryOwner, setRetryOwner] = useState<typeof owner | null>(null);
  useLayoutEffect(() => { activeOwner.current = owner; return () => { activeOwner.current = null; }; }, [owner]);
  const [result, setResult] = useState<{ scope: typeof scope; items: McpConnector[]; error: boolean }>();
  useEffect(() => {
    if (!admitted || !enabled) return;
    let retired = false;
    const subscription = subscribeScan(client, JSON.stringify([identity, readGeneration, refreshKey, revision]));
    const settle = () => {
      if (pending.current?.owner === owner && pending.current.attempt === attempt) {
        pending.current = null;
        setRetryOwner(value => value === owner ? null : value);
      }
    };
    void subscription.promise.then(items => { if (!retired) { settle(); setResult({ scope, items, error: false }); } },
      (error: unknown) => {
        if (retired) return;
        if (!subscription.signal.aborted && error instanceof HubClientError && error.reason === "http" && error.status === 401)
          reportRead401?.({ subject: identity, generation: readGeneration, signal: subscription.signal });
        settle();
        setResult({ scope, items: [], error: true });
      });
    return () => { retired = true; subscription.release(); };
  }, [scope, owner, attempt, admitted, enabled, client, identity, readGeneration, refreshKey, revision, reportRead401]);
  const current = admitted && enabled && result?.scope === scope ? result : undefined;
  const retry = useCallback(() => {
    if (!admitted || !enabled || activeOwner.current !== owner || !current?.error || pending.current?.owner === owner) return;
    pending.current = { owner, attempt: attempt + 1 };
    setRetryOwner(owner);
    setAttempt(attempt + 1);
  }, [admitted, enabled, owner, current, attempt]);
  return { items: current?.items ?? [], complete: current !== undefined && !current.error, error: current?.error ?? false,
    loading: admitted && enabled && current === undefined,
    retrying: admitted && enabled && retryOwner === owner, retry };
}
