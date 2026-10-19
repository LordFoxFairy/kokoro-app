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
  Map<string, { generation: number; data: McpConnectorProviderPage | McpConnectorPage }>
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
/** Exact details subscribe to the same confirmed-write revision as lists. */
export function useMcpConnectorRevision(client: HubClient, identity: string): number {
  const revision = connectorRevision(client, identity);
  const subscribeRevision = useCallback((listener: () => void) => {
    revision.listeners.add(listener);
    return () => { revision.listeners.delete(listener); };
  }, [revision]);
  return useSyncExternalStore(subscribeRevision, () => revision.value, () => 0);
}

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
  readGeneration = 0,
): string {
  return JSON.stringify([
    identity,
    resource === "connectors" ? cursor : null,
    generation,
    resource,
    revision,
    readGeneration,
  ]);
}

function cached<T extends McpConnectorProviderPage | McpConnectorPage>(
  client: HubClient,
  key: string,
  generation = 0,
): T | undefined {
  const entry = resolved.get(client)?.get(key);
  return entry?.generation === generation ? entry.data as T : undefined;
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
  generation: number,
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
  entries.set(key, { generation, data: value });
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
  readGeneration = 0,
}: {
  client: HubClient;
  identity: string;
  readGeneration?: number;
}): () => void {
  const warm = (resource: McpProjectionResource): (() => void) => {
    const cursor = null;
    const cacheKey = projectionCacheKey(resource, identity, cursor);
    if (cached(client, cacheKey, readGeneration) !== undefined) return () => undefined;
    const revision = resource === "connectors" ? connectorRevision(client, identity).value : 0;
    const subscription = subscribe(
      client,
      projectionRequestKey(resource, identity, cursor, 0, revision, readGeneration),
      cursor,
      resource,
      identity,
    );
    let active = true;
    void subscription.promise.then(
      (next) => {
        if (!active) return;
        if (resource === "connectors" && connectorRevision(client, identity).value !== revision) return;
        if (resource === "providers" && next.providers)
          remember(client, cacheKey, next.providers, readGeneration, {
            resource,
            identity,
            cursor,
          });
        if (resource === "connectors" && next.connectors)
          remember(client, cacheKey, next.connectors, readGeneration, {
            resource,
            identity,
            cursor,
          });
      },
      () => undefined,
    );
    return () => { active = false; subscription.release(); };
  };
  const releases = [warm("providers"), warm("connectors")];
  return () => releases.forEach((release) => release());
}

/** Only an admitted Settings shell may warm its current subject's projections. */
export function useWarmMcpProjection({
  client,
  identity,
  readGeneration = 0,
}: {
  client: HubClient;
  identity: string | null;
  readGeneration?: number;
}): void {
  useEffect(() => {
    if (identity === null) return;
    return warmMcpProjection({ client, identity, readGeneration });
  }, [client, identity, readGeneration]);
}

export function useMcpProjection({
  client,
  identity,
  cursor,
  view,
  connectorRefreshKey = 0,
  admitted = true,
  readGeneration = 0,
}: {
  client: HubClient;
  identity: string;
  cursor: string | null;
  view: "catalog" | "connections";
  /** External mutation generation; bypasses a stale cached connector page. */
  connectorRefreshKey?: number;
  admitted?: boolean;
  readGeneration?: number;
}) {
  const revision = connectorRevision(client, identity);
  const currentRevision = useMcpConnectorRevision(client, identity);
  const [providerGeneration, setProviderGeneration] = useState(0);
  const [connectorGeneration, setConnectorGeneration] =
    useState(connectorRefreshKey);
  const observedConnectorRefreshKey = useRef(connectorRefreshKey);
  const initialProviders =
    cached<McpConnectorProviderPage>(
      client,
      projectionCacheKey("providers", identity, null),
      readGeneration,
    ) ??
    (readGeneration === 0 ? sessionCached("providers", identity, null) as McpConnectorProviderPage | undefined : undefined);
  const initialConnectors =
    cached<McpConnectorPage>(
      client,
      projectionCacheKey("connectors", identity, cursor),
      readGeneration,
    ) ??
    (currentRevision === 0 && readGeneration === 0 ? sessionCached("connectors", identity, cursor) as McpConnectorPage | undefined : undefined);
  const [providerState, setProviderState] = useState<
    McpResourceState<McpConnectorProviderPage> & { readGeneration: number }
  >(() =>
    initialProviders === undefined
      ? { loading: true, error: false, readGeneration }
      : {
          readGeneration,
          data: initialProviders,
          dataIdentity: identity,
          requestIdentity: identity,
          loading: false,
          error: false,
        },
  );
  const [connectorState, setConnectorState] = useState<
    McpResourceState<McpConnectorPage> & { revision: number; readGeneration: number }
  >(() =>
    initialConnectors === undefined
      ? { loading: true, error: false, revision: currentRevision, readGeneration }
      : {
          readGeneration,
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
    if (!admitted) return;
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
        readGeneration,
      );
      const cacheKey = projectionCacheKey(resource, identity, requestCursor);
      if (completed.current.has(requestKey)) return;
      const existing = cached<McpConnectorProviderPage | McpConnectorPage>(
        client,
        cacheKey,
        readGeneration,
      );
      // Section changes unmount Settings panels. Reuse the owner projection on
      // return instead of clearing a ready card into a centred loading panel.
      // Explicit reloads still bypass this cache through their generation.
      if (generation === 0 && existing !== undefined) {
        if (resource === "providers") {
          setProviderState({
            readGeneration,
            data: existing as McpConnectorProviderPage,
            dataIdentity: identity,
            requestIdentity: identity,
            loading: false,
            error: false,
          });
        } else {
          setConnectorState({
            readGeneration,
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
          ...(current.readGeneration === readGeneration ? current : { readGeneration }),
          requestIdentity: identity,
          loading: true,
          error: false,
        }));
      } else {
        setConnectorState((current) => ({
          ...(current.readGeneration === readGeneration ? current : { readGeneration }),
          readGeneration,
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
            remember(client, cacheKey, next.providers, readGeneration, {
              resource,
              identity,
              cursor,
            });
            setProviderState({
            readGeneration,
              data: next.providers,
              dataIdentity: identity,
              requestIdentity: identity,
              loading: false,
              error: false,
            });
          }
          if (resource === "connectors" && next.connectors) {
            remember(client, cacheKey, next.connectors, readGeneration, {
              resource,
              identity,
              cursor,
            });
            setConnectorState({
              readGeneration,
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
  }, [admitted, readGeneration, client, connectorGeneration, currentRevision, cursor, identity, providerGeneration, revision, view]);

  const providerProjection =
    admitted && providerState.readGeneration === readGeneration && providerState.dataIdentity === identity ? providerState.data : undefined;
  const connectorProjection =
    admitted && connectorState.readGeneration === readGeneration && connectorState.dataIdentity === identity ? connectorState.data : undefined;
  const reload = (resource: McpProjectionResource) => {
    if (resource === "providers") setProviderGeneration((value) => value + 1);
    else setConnectorGeneration((value) => value + 1);
  };

  return {
    providerState: admitted && providerState.readGeneration === readGeneration ? providerState : { loading: true, error: false, requestIdentity: identity },
    connectorState: !admitted || connectorState.readGeneration !== readGeneration ? { loading: true, error: false, requestIdentity: identity } : { ...connectorState, loading: connectorState.loading || connectorState.revision !== currentRevision },
    providerProjection,
    connectorProjection,
    reload,
  };
}
