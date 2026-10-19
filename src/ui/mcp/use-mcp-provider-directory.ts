"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { HubClient } from "@/hub/client";
import type { McpConnectorProviderPage } from "@/hub/mcp-connector.schema";

type Input = {
  client: HubClient;
  identity: string;
  admitted: boolean;
  readGeneration: number;
  seed: McpConnectorProviderPage | undefined;
  query: string;
  category: string;
};

/** Owner-filtered directory pages; the unfiltered first page joins the shell read. */
export function useMcpProviderDirectory({ client, identity, admitted, readGeneration, seed, query, category }: Input) {
  const search = query.trim();
  const unfiltered = search === "" && category === "all";
  const scope = useMemo(() => ({ client, identity, admitted, readGeneration, seed, search, category }),
    [client, identity, admitted, readGeneration, seed, search, category]);
  const initialPage = admitted && unfiltered ? seed : undefined;
  const [state, setState] = useState(() => ({ scope, page: initialPage, loading: admitted && !initialPage, error: false, stopped: false }));
  if (state.scope !== scope) setState({ scope, page: initialPage, loading: admitted && !initialPage, error: false, stopped: false });
  const current = useRef<typeof scope | null>(scope);
  const flight = useRef<AbortController | null>(null);
  const cursors = useRef(new Set<string>());
  useLayoutEffect(() => {
    current.current = scope;
    cursors.current.clear();
    return () => { current.current = null; flight.current?.abort(); flight.current = null; };
  }, [scope]);

  const read = useCallback(async (cursor?: string) => {
    if (!scope.admitted || current.current !== scope || flight.current) return;
    const controller = new AbortController();
    flight.current = controller;
    if (!cursor) cursors.current.clear();
    setState(value => ({ ...value, loading: true, error: false, stopped: false }));
    try {
      const page = await client.listMcpConnectorProviders({
        limit: 100,
        ...(search ? { query: search } : {}),
        ...(category !== "all" ? { category_key: category } : {}),
        ...(cursor ? { cursor } : {}),
      }, controller.signal);
      if (current.current !== scope || controller.signal.aborted) return;
      // Refuse cursor loops instead of endlessly appending the same result.
      if (page.next_cursor && (page.next_cursor === cursor || cursors.current.has(page.next_cursor))) {
        setState(value => ({ ...value, loading: false, error: true, stopped: true }));
        return;
      }
      if (cursor) cursors.current.add(cursor);
      setState(value => ({ scope, loading: false, error: false, stopped: false, page: {
        ...page,
        items: cursor ? [...new Map([...(value.page?.items ?? []), ...page.items].map(item => [item.provider_key, item])).values()] : page.items,
      } }));
    } catch {
      if (current.current === scope && !controller.signal.aborted) setState(value => ({ ...value, loading: false, error: true }));
    } finally {
      if (flight.current === controller) flight.current = null;
    }
  }, [scope, client, search, category]);

  useEffect(() => {
    if (!admitted || unfiltered) return;
    // Retire stale results immediately; debounce only the outgoing search read.
    const timer = setTimeout(() => { void read(); }, 180);
    return () => clearTimeout(timer);
  }, [admitted, unfiltered, read]);

  const page = admitted && state.scope === scope ? state.page : undefined;
  const loading = admitted && (state.scope !== scope || state.loading);
  const stopped = state.scope === scope && state.stopped;
  return {
    items: page?.items ?? [],
    loading,
    error: admitted && state.scope === scope && state.error,
    hasMore: Boolean(page?.next_cursor) && !stopped,
    loadMore: () => { if (page?.next_cursor && !loading && !stopped) void read(page.next_cursor); },
    retry: () => { if (!loading) void read(stopped ? undefined : page?.next_cursor ?? undefined); },
  };
}
