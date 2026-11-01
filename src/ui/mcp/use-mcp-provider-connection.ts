"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMcpConnectorRevision } from "./use-mcp-projection";
import { HubClientError, type HubClient } from "@/hub/client";
import { useProductReadRecheck } from "@/ui/auth/product-read-recheck-context";
import type { McpConnector } from "@/hub/mcp-connector.schema";

export type McpConnectorBinding = { connectorType: McpConnector["connector_type"]; serverId?: string };

/** OAuth detail resolves its exact connection even when the plaza has no list. */
export function useMcpProviderConnection({ client, identity, admitted, readGeneration, connectorId, providerKey, known, retry, binding, window }: {
  client: HubClient; identity: string; admitted: boolean; readGeneration: number;
  connectorId: string | null; providerKey: string | null; known: McpConnector | undefined; retry: number; binding?: McpConnectorBinding;
  window?: object | undefined;
}) {
  const reportRead401 = useProductReadRecheck();
  const revision = useMcpConnectorRevision(client, identity);
  const [attempt, setAttempt] = useState(0);
  const readOwner = useMemo(() => ({ client, identity, admitted, readGeneration, connectorId, providerKey, known, revision, binding, window }),
    [client, identity, admitted, readGeneration, connectorId, providerKey, known, revision, binding, window]);
  const scope = useMemo(() => ({ readOwner, retry, attempt }), [readOwner, retry, attempt]);
  const current = useRef<typeof scope | null>(null);
  const pending = useRef<typeof scope | null>(null);
  useLayoutEffect(() => { current.current = scope; return () => { current.current = null; }; }, [scope]);
  const [result, setResult] = useState<{ scope: typeof scope; connection?: McpConnector; error: boolean }>();
  useEffect(() => {
    if (!admitted || !connectorId || known) return;
    const controller = new AbortController();
    const request = client.getMcpConnector ? client.getMcpConnector(connectorId, controller.signal) : Promise.reject(new Error("MCP detail unavailable"));
    void request.then(connection => {
      if (controller.signal.aborted || current.current !== scope) return;
      setResult(connection.connector_id === connectorId && connection.provider_key === providerKey &&
        (!binding || (connection.status !== "revoked" && connection.connector_type === binding.connectorType &&
          (connection.server_id ?? null) === (binding.serverId ?? null)))
        ? { scope, connection, error: false } : { scope, error: true });
    }, (error: unknown) => {
      if (controller.signal.aborted || current.current !== scope) return;
      if (error instanceof HubClientError && error.reason === "http" && error.status === 401)
        reportRead401?.({ subject: identity, generation: readGeneration, signal: controller.signal });
      setResult({ scope, error: true });
    });
    return () => controller.abort();
  }, [scope, admitted, connectorId, client, known, providerKey, binding, reportRead401, identity, readGeneration]);
  const retryRead = () => {
    if (current.current !== scope || !admitted || known || !result?.error || result.scope !== scope || pending.current === scope) return;
    pending.current = scope;
    setAttempt(value => value + 1);
  };
  return { readScope: scope, connection: admitted ? known ?? (result?.scope === scope ? result.connection : undefined) ?? null : null,
    error: admitted && !known && result?.scope === scope && result.error,
    retrying: Boolean(admitted && !known && result?.scope !== scope && result?.scope.readOwner === readOwner && result.error),
    retryRead };
}
