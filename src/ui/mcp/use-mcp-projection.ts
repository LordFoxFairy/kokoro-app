"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { HubClient } from "@/hub/client";
import {
  mcpConnectorPageSchema,
  mcpConnectorProviderPageSchema,
  type McpConnectorPage,
  type McpConnectorProviderPage,
} from "@/hub/mcp-connector.schema";

import type {
  McpProjectionResource,
  McpResourceState,
} from "./mcp-projection-types";

type ProjectionFlight = {
  controller: AbortController;
  promise: Promise<
    Partial<{
      providers: McpConnectorProviderPage;
      connectors: McpConnectorPage;
    }>
  >;
  subscribers: number;
  identity: string;
  resource: McpProjectionResource;
};

type ProjectionSubscription = {
  promise: ProjectionFlight["promise"];
  release: () => void;
};

// StrictMode replays effects in development. A read belongs to the authenticated
// lifecycle, not an individual component mount, so subscribers share one request.
const inflight = new WeakMap<object, Map<string, ProjectionFlight>>();
const resolved = new WeakMap<
  object,
  Map<string, McpConnectorProviderPage | McpConnectorPage>
>();

// A confirmed connector projection is safe to retain for this browser tab: it
// holds titles/statuses only, never endpoint credentials or headers. It gives a
// reload the same stable geometry as an in-app Settings re-entry, while every
// session-restored value is immediately revalidated against the owner.
const sessionCachePrefix = "kokoro:mcp-projection:v1:";

type ConnectorRevision = { value: number; listeners: Set<() => void> };
const connectorRevisions = new WeakMap<HubClient, Map<string, ConnectorRevision>>();
function connectorRevision(client: HubClient, identity: string): ConnectorRevision {
  let entries = connectorRevisions.get(client);
  if (!entries) {
    entries = new Map();
    connectorRevisions.set(client, entries);
  }
  let revision = entries.get(identity);
  if (!revision) {
    revision = { value: 0, listeners: new Set() };
    entries.set(identity, revision);
  }
  return revision;
}

/** A confirmed write retires only this subject's connector pages, not provider metadata. */
export function invalidateMcpConnectorProjection(client: HubClient, identity: string): void {
  const revision = connectorRevision(client, identity);
  revision.value += 1;
  for (const key of resolved.get(client)?.keys() ?? []) {
    const [resource, subject] = JSON.parse(key) as [McpProjectionResource, string];
    if (resource === "connectors" && subject === identity)
      resolved.get(client)?.delete(key);
  }
  for (const [key, flight] of inflight.get(client) ?? []) {
    if (flight.resource !== "connectors" || flight.identity !== identity) continue;
    inflight.get(client)?.delete(key);
    flight.controller.abort();
  }
  try {
    window.sessionStorage.removeItem(
      `${sessionCachePrefix}${projectionCacheKey("connectors", identity, null)}`,
    );
  } catch {
    // Persistence is an optional paint optimization, not current facts.
  }
  revision.listeners.forEach((listener) => listener());
}

function projectionCacheKey(
  resource: McpProjectionResource,
  identity: string,
  cursor: string | null,
): string {
  return JSON.stringify([
    resource,
    identity,
    resource === "connectors" ? cursor : null,
  ]);
}

function projectionRequestKey(
  resource: McpProjectionResource,
  identity: string,
  cursor: string | null,
  generation: number,
  revision = 0,
): string {
  return JSON.stringify([
    identity,
    resource === "connectors" ? cursor : null,
    generation,
    resource,
    revision,
  ]);
}

function cached<T extends McpConnectorProviderPage | McpConnectorPage>(
  client: HubClient,
  key: string,
): T | undefined {
  return resolved.get(client)?.get(key) as T | undefined;
}

function sessionCached(
  resource: McpProjectionResource,
  identity: string,
  cursor: string | null,
): McpConnectorProviderPage | McpConnectorPage | undefined {
  if (typeof window === "undefined" || cursor !== null) return undefined;
  try {
    const raw = window.sessionStorage.getItem(
      `${sessionCachePrefix}${projectionCacheKey(resource, identity, cursor)}`,
    );
    if (raw === null) return undefined;
    const value: unknown = JSON.parse(raw);
    const parsed =
      resource === "providers"
        ? mcpConnectorProviderPageSchema.safeParse(value)
        : mcpConnectorPageSchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function remember(
  client: HubClient,
  key: string,
  value: McpConnectorProviderPage | McpConnectorPage,
  session?: {
    resource: McpProjectionResource;
    identity: string;
    cursor: string | null;
  },
): void {
  let entries = resolved.get(client);
  if (!entries) {
    entries = new Map();
    resolved.set(client, entries);
  }
  entries.set(key, value);
  if (!session || typeof window === "undefined" || session.cursor !== null)
    return;
  try {
    window.sessionStorage.setItem(
      `${sessionCachePrefix}${projectionCacheKey(
        session.resource,
        session.identity,
        session.cursor,
      )}`,
      JSON.stringify(value),
    );
  } catch {
    // Private browsing/storage quota only removes this paint optimization.
  }
}

function subscribe(
  client: HubClient,
  key: string,
  cursor: string | null,
  resource: McpProjectionResource,
  identity: string,
): ProjectionSubscription {
  let requests = inflight.get(client);
  if (!requests) {
    requests = new Map();
    inflight.set(client, requests);
  }
  let flight = requests.get(key);
  if (!flight) {
    const controller = new AbortController();
    const promise =
      resource === "providers"
        ? client
            .listMcpConnectorProviders({ limit: 100 }, controller.signal)
            .then((providers) => ({ providers }))
        : client
            .listMcpConnectors(
              cursor === null ? {} : { cursor },
              controller.signal,
            )
            .then((connectors) => ({ connectors }));
    flight = { controller, promise, subscribers: 0, identity, resource };
    requests.set(key, flight);
    const clear = () => {
      if (requests?.get(key) === flight) requests.delete(key);
    };
    void promise.then(clear, clear);
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

/**
 * Starts the two Settings projections when the Settings shell opens. The active
 * connector panel then joins the same request or consumes its settled result,
 * so selecting the tab never begins a second cold read. This remains an
 * in-memory view cache: authentication and owner reads stay server-owned.
 */
export function warmMcpProjection({
  client,
  identity,
}: {
  client: HubClient;
  identity: string;
}): () => void {
  const warm = (resource: McpProjectionResource): (() => void) => {
    const cursor = null;
    const cacheKey = projectionCacheKey(resource, identity, cursor);
    if (cached(client, cacheKey) !== undefined) return () => undefined;
    const revision = resource === "connectors" ? connectorRevision(client, identity).value : 0;
    const subscription = subscribe(
      client,
      projectionRequestKey(resource, identity, cursor, 0, revision),
      cursor,
      resource,
      identity,
    );
    void subscription.promise.then(
      (next) => {
        if (resource === "connectors" && connectorRevision(client, identity).value !== revision) return;
        if (resource === "providers" && next.providers)
          remember(client, cacheKey, next.providers, {
            resource,
            identity,
            cursor,
          });
        if (resource === "connectors" && next.connectors)
          remember(client, cacheKey, next.connectors, {
            resource,
            identity,
            cursor,
          });
      },
      () => undefined,
    );
    return subscription.release;
  };
  const releases = [warm("providers"), warm("connectors")];
  return () => releases.forEach((release) => release());
}

/** Only an admitted Settings shell may warm its current subject's projections. */
export function useWarmMcpProjection({
  client,
  identity,
}: {
  client: HubClient;
  identity: string | null;
}): void {
  useEffect(() => {
    if (identity === null) return;
    return warmMcpProjection({ client, identity });
  }, [client, identity]);
}

export function useMcpProjection({
  client,
  identity,
  cursor,
  view,
  connectorRefreshKey = 0,
}: {
  client: HubClient;
  identity: string;
  cursor: string | null;
  view: "catalog" | "connections";
  /** External mutation generation; bypasses a stale cached connector page. */
  connectorRefreshKey?: number;
}) {
  const revision = connectorRevision(client, identity);
  const subscribeRevision = useCallback((listener: () => void) => {
    revision.listeners.add(listener);
    return () => { revision.listeners.delete(listener); };
  }, [revision]);
  const currentRevision = useSyncExternalStore(subscribeRevision, () => revision.value, () => 0);
  const [providerGeneration, setProviderGeneration] = useState(0);
  const [connectorGeneration, setConnectorGeneration] =
    useState(connectorRefreshKey);
  const observedConnectorRefreshKey = useRef(connectorRefreshKey);
  const initialProviders =
    cached<McpConnectorProviderPage>(
      client,
      projectionCacheKey("providers", identity, null),
    ) ??
    (sessionCached("providers", identity, null) as
      | McpConnectorProviderPage
      | undefined);
  const initialConnectors =
    cached<McpConnectorPage>(
      client,
      projectionCacheKey("connectors", identity, cursor),
    ) ??
    (currentRevision === 0 ? sessionCached("connectors", identity, cursor) as McpConnectorPage | undefined : undefined);
  const [providerState, setProviderState] = useState<
    McpResourceState<McpConnectorProviderPage>
  >(() =>
    initialProviders === undefined
      ? { loading: true, error: false }
      : {
          data: initialProviders,
          dataIdentity: identity,
          requestIdentity: identity,
          loading: false,
          error: false,
        },
  );
  const [connectorState, setConnectorState] = useState<
    McpResourceState<McpConnectorPage> & { revision: number }
  >(() =>
    initialConnectors === undefined
      ? { loading: true, error: false, revision: currentRevision }
      : {
          revision: currentRevision,
          data: initialConnectors,
          dataIdentity: identity,
          requestIdentity: identity,
          loading: false,
          error: false,
        },
  );
  const completed = useRef(new Set<string>());

  useEffect(() => {
    if (observedConnectorRefreshKey.current === connectorRefreshKey) return;
    observedConnectorRefreshKey.current = connectorRefreshKey;
    setConnectorGeneration(connectorRefreshKey);
  }, [connectorRefreshKey]);

  useEffect(() => {
    let active = true;
    const subscriptions: ProjectionSubscription[] = [];
    const start = (resource: McpProjectionResource, generation: number) => {
      const requestCursor = resource === "connectors" ? cursor : null;
      const requestKey = projectionRequestKey(
        resource,
        identity,
        requestCursor,
        generation,
        resource === "connectors" ? currentRevision : 0,
      );
      const cacheKey = projectionCacheKey(resource, identity, requestCursor);
      if (completed.current.has(requestKey)) return;
      const existing = cached<McpConnectorProviderPage | McpConnectorPage>(
        client,
        cacheKey,
      );
      // Section changes unmount Settings panels. Reuse the owner projection on
      // return instead of clearing a ready card into a centred loading panel.
      // Explicit reloads still bypass this cache through their generation.
      if (generation === 0 && existing !== undefined) {
        if (resource === "providers") {
          setProviderState({
            data: existing as McpConnectorProviderPage,
            dataIdentity: identity,
            requestIdentity: identity,
            loading: false,
            error: false,
          });
        } else {
          setConnectorState({
            revision: currentRevision,
            data: existing as McpConnectorPage,
            dataIdentity: identity,
            requestIdentity: identity,
            loading: false,
            error: false,
          });
        }
        return;
      }
      if (resource === "providers") {
        setProviderState((current) => ({
          ...current,
          requestIdentity: identity,
          loading: true,
          error: false,
        }));
      } else {
        setConnectorState((current) => ({
          ...current,
          revision: currentRevision,
          requestIdentity: identity,
          loading: true,
          error: false,
        }));
      }
      const subscription = subscribe(
        client,
        requestKey,
        requestCursor,
        resource,
        identity,
      );
      subscriptions.push(subscription);
      void subscription.promise.then(
        (next) => {
          if (!active || (resource === "connectors" && revision.value !== currentRevision)) return;
          completed.current.add(requestKey);
          if (resource === "providers" && next.providers) {
            remember(client, cacheKey, next.providers, {
              resource,
              identity,
              cursor,
            });
            setProviderState({
              data: next.providers,
              dataIdentity: identity,
              requestIdentity: identity,
              loading: false,
              error: false,
            });
          }
          if (resource === "connectors" && next.connectors) {
            remember(client, cacheKey, next.connectors, {
              resource,
              identity,
              cursor,
            });
            setConnectorState({
              revision: currentRevision,
              data: next.connectors,
              dataIdentity: identity,
              requestIdentity: identity,
              loading: false,
              error: false,
            });
          }
        },
        () => {
          completed.current.delete(requestKey);
          if (!active || (resource === "connectors" && revision.value !== currentRevision)) return;
          if (resource === "providers") {
            setProviderState((current) => ({
              ...current,
              loading: false,
              error: true,
            }));
          } else {
            setConnectorState((current) => ({
              ...current,
              loading: false,
              error: true,
            }));
          }
        },
      );
    };
    // Provider metadata resolves card identity and OAuth server binding. Its read
    // remains independent from the current connector page, so either surface can render.
    start("providers", providerGeneration);
    if (view === "connections") start("connectors", connectorGeneration);
    return () => {
      active = false;
      subscriptions.forEach((subscription) => subscription.release());
    };
  }, [client, connectorGeneration, currentRevision, cursor, identity, providerGeneration, revision, view]);

  const providerProjection =
    providerState.dataIdentity === identity ? providerState.data : undefined;
  const connectorProjection =
    connectorState.dataIdentity === identity ? connectorState.data : undefined;
  const reload = (resource: McpProjectionResource) => {
    if (resource === "providers") setProviderGeneration((value) => value + 1);
    else setConnectorGeneration((value) => value + 1);
  };

  return {
    providerState,
    connectorState: { ...connectorState, loading: connectorState.loading || connectorState.revision !== currentRevision },
    providerProjection,
    connectorProjection,
    reload,
  };
}
