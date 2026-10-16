"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import type { HubClient } from "@/hub/client";
import type {
  CustomApiPage,
} from "@/hub/custom-api.schema";

type CustomApiState = Readonly<{
  data: CustomApiPage;
  identity: string;
  readGeneration: number;
  loading: boolean;
  error: boolean;
}>;

const emptyPage: CustomApiPage = { items: [], page: { next_cursor: null } };

type CustomApiFlight = {
  controller: AbortController;
  promise: Promise<CustomApiPage>;
  subscribers: number;
  identity: string;
};

type CustomApiSubscription = Readonly<{
  promise: Promise<CustomApiPage>;
  release: () => void;
}>;

// The Settings dialog mounts and changes tabs independently of the connection
// surface. Reads belong to the admitted subject, not to either component
// instance, so the same owner read is shared through a StrictMode replay and
// through the dialog's prewarm/active-tab handoff.
const inflight = new WeakMap<object, Map<string, CustomApiFlight>>();
const resolved = new WeakMap<object, Map<string, { readGeneration: number; data: CustomApiPage }>>();

type Revision = { value: number; listeners: Set<() => void> };
const revisions = new WeakMap<HubClient, Map<string, Revision>>();
function revisionFor(client: HubClient, identity: string): Revision {
  let entries = revisions.get(client);
  if (!entries) { entries = new Map(); revisions.set(client, entries); }
  let revision = entries.get(identity);
  if (!revision) { revision = { value: 0, listeners: new Set() }; entries.set(identity, revision); }
  return revision;
}

/** A confirmed API write invalidates only this aggregate and exact actor. */
export function invalidateCustomApiProjection(client: HubClient, identity: string): void {
  const revision = revisionFor(client, identity);
  revision.value += 1;
  resolved.get(client)?.delete(resourceKey(identity));
  for (const [key, flight] of inflight.get(client) ?? []) {
    if (flight.identity !== identity) continue;
    inflight.get(client)?.delete(key);
    flight.controller.abort();
  }
  revision.listeners.forEach(listener => listener());
}

function resourceKey(identity: string): string {
  return identity;
}

function cached(client: HubClient, identity: string, readGeneration: number): CustomApiPage | undefined {
  const entry = resolved.get(client)?.get(resourceKey(identity));
  return entry?.readGeneration === readGeneration ? entry.data : undefined;
}

function remember(client: HubClient, identity: string, page: CustomApiPage, readGeneration: number): void {
  let entries = resolved.get(client);
  if (!entries) {
    entries = new Map();
    resolved.set(client, entries);
  }
  entries.set(resourceKey(identity), { readGeneration, data: page });
}

function subscribe(
  client: HubClient,
  identity: string,
  refreshKey: string,
  readGeneration: number,
  revision: number,
): CustomApiSubscription | null {
  const read = client.listCustomApis;
  if (!read) return null;

  let requests = inflight.get(client);
  if (!requests) {
    requests = new Map();
    inflight.set(client, requests);
  }
  const key = JSON.stringify([identity, refreshKey, readGeneration, revision]);
  let flight = requests.get(key);
  if (!flight) {
    const controller = new AbortController();
    flight = {
      controller,
      promise: read({ limit: 100 }, controller.signal),
      subscribers: 0,
      identity,
    };
    requests.set(key, flight);
    const clear = () => {
      if (requests?.get(key) === flight) requests.delete(key);
    };
    void flight.promise.then(clear, clear);
  }

  flight.subscribers += 1;
  let released = false;
  return {
    promise: flight.promise,
    release: () => {
      if (released) return;
      released = true;
      flight.subscribers -= 1;
      if (flight.subscribers !== 0) return;
      queueMicrotask(() => {
        if (flight?.subscribers !== 0 || requests?.get(key) !== flight) return;
        requests.delete(key);
        flight.controller.abort();
      });
    },
  };
}

/** Start the custom API projection with the rest of Settings' connector data. */
export function warmCustomApiProjection({
  client,
  identity,
  readGeneration = 0,
}: {
  client: HubClient;
  identity: string;
  readGeneration?: number;
}): () => void {
  if (cached(client, identity, readGeneration) !== undefined) return () => undefined;
  const revision = revisionFor(client, identity);
  const value = revision.value;
  const subscription = subscribe(client, identity, "0:0", readGeneration, value);
  if (!subscription) return () => undefined;
  let active = true;
  void subscription.promise.then(
    (page) => { if (active && revision.value === value) remember(client, identity, page, readGeneration); },
    () => undefined,
  );
  return () => { active = false; subscription.release(); };
}

/**
 * Custom API profiles are a separate owner aggregate. They refresh beside the
 * MCP projection so a slow profile read never replaces the already-rendered
 * connector list with a global loading state.
 */
export function useCustomApiProjection({
  client,
  identity,
  refreshKey,
  admitted = true,
  readGeneration = 0,
}: {
  client: HubClient;
  identity: string;
  refreshKey: number;
  admitted?: boolean;
  readGeneration?: number;
}) {
  const revision = revisionFor(client, identity);
  const subscribeRevision = useCallback((listener: () => void) => {
    revision.listeners.add(listener);
    return () => { revision.listeners.delete(listener); };
  }, [revision]);
  const currentRevision = useSyncExternalStore(subscribeRevision, () => revision.value, () => 0);
  const [manualRefreshKey, setManualRefreshKey] = useState(0);
  const [state, setState] = useState<CustomApiState>({
    data: cached(client, identity, readGeneration) ?? emptyPage,
    identity,
    readGeneration,
    loading: cached(client, identity, readGeneration) === undefined,
    error: false,
  });

  const reload = useCallback(() => {
    setManualRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!admitted) return;
    const existing = cached(client, identity, readGeneration);
    if (
      refreshKey === 0 &&
      manualRefreshKey === 0 &&
      existing !== undefined
    )
      return;
    const subscription = subscribe(
      client,
      identity,
      `${refreshKey}:${manualRefreshKey}`,
      readGeneration,
      currentRevision,
    );
    if (!subscription) return;
    let active = true;
    // Keep previously confirmed rows while a mutation invalidates the owner
    // projection. The promise completion below is the only state transition;
    // this avoids a render-phase loading reset when Settings remounts.
    void subscription.promise.then(
      (data) => {
        if (!active || revision.value !== currentRevision) return;
        remember(client, identity, data, readGeneration);
        setState({ data, identity, readGeneration, loading: false, error: false });
      },
      () => {
        if (active && revision.value === currentRevision)
          setState((current) =>
            current.identity === identity
              ? { data: current.readGeneration === readGeneration ? current.data : emptyPage, identity, readGeneration, loading: false, error: true }
              : current,
          );
      },
    );
    return () => {
      active = false;
      subscription.release();
    };
  }, [admitted, readGeneration, client, identity, manualRefreshKey, refreshKey, currentRevision, revision]);

  // A Settings remount for an already admitted identity should render the
  // shared projection directly. This avoids a synchronous effect setState
  // (and the one-frame loading state it causes) while a mutation still uses
  // the state-backed path above to revalidate with the owner.
  const initial =
    refreshKey === 0 && manualRefreshKey === 0
      ? cached(client, identity, readGeneration)
      : undefined;
  const visible =
    !admitted ? { data: emptyPage, identity, readGeneration, loading: true, error: false } : initial === undefined
      ? state.identity === identity && state.readGeneration === readGeneration
        ? state
        : { data: emptyPage, identity, readGeneration, loading: true, error: false }
      : { data: initial, identity, readGeneration, loading: false, error: false };
  return { ...visible, reload };
}
