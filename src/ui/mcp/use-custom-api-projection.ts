"use client";

import { useCallback, useEffect, useState } from "react";

import type { HubClient } from "@/hub/client";
import type {
  CustomApiPage,
  CustomApiProfile,
} from "@/hub/custom-api.schema";

type CustomApiState = Readonly<{
  data: CustomApiPage;
  identity: string;
  loading: boolean;
  error: boolean;
}>;

const emptyPage: CustomApiPage = { items: [], page: { next_cursor: null } };

type CustomApiFlight = {
  controller: AbortController;
  promise: Promise<CustomApiPage>;
  subscribers: number;
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
const resolved = new WeakMap<object, Map<string, CustomApiPage>>();

function resourceKey(identity: string): string {
  return identity;
}

function cached(client: HubClient, identity: string): CustomApiPage | undefined {
  return resolved.get(client)?.get(resourceKey(identity));
}

function remember(client: HubClient, identity: string, page: CustomApiPage): void {
  let entries = resolved.get(client);
  if (!entries) {
    entries = new Map();
    resolved.set(client, entries);
  }
  entries.set(resourceKey(identity), page);
}

function replaceProfile(
  page: CustomApiPage,
  profile: CustomApiProfile,
): CustomApiPage {
  const current = page.items.findIndex(
    (item) => item.profile_id === profile.profile_id,
  );
  const items =
    current === -1
      ? [profile, ...page.items]
      : page.items.map((item, index) => (index === current ? profile : item));
  return { ...page, items };
}

function removeProfile(page: CustomApiPage, profileId: string): CustomApiPage {
  return {
    ...page,
    items: page.items.filter((item) => item.profile_id !== profileId),
  };
}

function subscribe(
  client: HubClient,
  identity: string,
  refreshKey: string,
): CustomApiSubscription | null {
  const read = client.listCustomApis;
  if (!read) return null;

  let requests = inflight.get(client);
  if (!requests) {
    requests = new Map();
    inflight.set(client, requests);
  }
  const key = JSON.stringify([identity, refreshKey]);
  let flight = requests.get(key);
  if (!flight) {
    const controller = new AbortController();
    flight = {
      controller,
      promise: read({ limit: 100 }, controller.signal),
      subscribers: 0,
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
}: {
  client: HubClient;
  identity: string;
}): () => void {
  if (cached(client, identity) !== undefined) return () => undefined;
  const subscription = subscribe(client, identity, "0:0");
  if (!subscription) return () => undefined;
  void subscription.promise.then(
    (page) => remember(client, identity, page),
    () => undefined,
  );
  return subscription.release;
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
}: {
  client: HubClient;
  identity: string;
  refreshKey: number;
}) {
  const [manualRefreshKey, setManualRefreshKey] = useState(0);
  const [state, setState] = useState<CustomApiState>({
    data: cached(client, identity) ?? emptyPage,
    identity,
    loading: cached(client, identity) === undefined,
    error: false,
  });

  const apply = useCallback(
    (next: (page: CustomApiPage) => CustomApiPage) => {
      const existing = cached(client, identity) ?? emptyPage;
      const data = next(existing);
      remember(client, identity, data);
      setState((current) =>
        current.identity === identity
          ? { data, identity, loading: false, error: false }
          : current,
      );
    },
    [client, identity],
  );
  const replace = useCallback(
    (profile: CustomApiProfile) => apply((page) => replaceProfile(page, profile)),
    [apply],
  );
  const remove = useCallback(
    (profileId: string) => apply((page) => removeProfile(page, profileId)),
    [apply],
  );
  const reload = useCallback(() => {
    setManualRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    const existing = cached(client, identity);
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
    );
    if (!subscription) return;
    let active = true;
    // Keep previously confirmed rows while a mutation invalidates the owner
    // projection. The promise completion below is the only state transition;
    // this avoids a render-phase loading reset when Settings remounts.
    void subscription.promise.then(
      (data) => {
        remember(client, identity, data);
        if (active)
          setState({ data, identity, loading: false, error: false });
      },
      () => {
        if (active)
          setState((current) =>
            current.identity === identity
              ? { ...current, loading: false, error: true }
              : current,
          );
      },
    );
    return () => {
      active = false;
      subscription.release();
    };
  }, [client, identity, manualRefreshKey, refreshKey]);

  // A Settings remount for an already admitted identity should render the
  // shared projection directly. This avoids a synchronous effect setState
  // (and the one-frame loading state it causes) while a mutation still uses
  // the state-backed path above to revalidate with the owner.
  const initial =
    refreshKey === 0 && manualRefreshKey === 0
      ? cached(client, identity)
      : undefined;
  const visible =
    initial === undefined
      ? state.identity === identity
        ? state
        : { data: emptyPage, identity, loading: true, error: false }
      : { data: initial, identity, loading: false, error: false };
  return { ...visible, reload, replace, remove };
}
