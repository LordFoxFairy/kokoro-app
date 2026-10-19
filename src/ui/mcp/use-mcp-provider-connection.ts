"use client";

import { useEffect, useMemo, useState } from "react";
import { useMcpConnectorRevision } from "./use-mcp-projection";
import type { HubClient } from "@/hub/client";
import type { McpConnector } from "@/hub/mcp-connector.schema";

export type McpConnectorBinding = { connectorType: McpConnector["connector_type"]; serverId?: string };

/** OAuth detail resolves its exact connection even when the plaza has no list. */
export function useMcpProviderConnection({ client, identity, admitted, readGeneration, connectorId, providerKey, known, retry, binding }: {
  client: HubClient; identity: string; admitted: boolean; readGeneration: number;
  connectorId: string | null; providerKey: string | null; known: McpConnector | undefined; retry: number; binding?: McpConnectorBinding;
}) {
  const revision = useMcpConnectorRevision(client, identity);
  const scope = useMemo(() => ({ client, identity, admitted, readGeneration, connectorId, providerKey, known, retry, revision, binding }),
    [client, identity, admitted, readGeneration, connectorId, providerKey, known, retry, revision, binding]);
  const [result, setResult] = useState<{ scope: typeof scope; connection?: McpConnector; error: boolean }>();
  useEffect(() => {
    if (!admitted || !connectorId || known) return;
    const controller = new AbortController();
    const request = client.getMcpConnector ? client.getMcpConnector(connectorId, controller.signal) : Promise.reject(new Error("MCP detail unavailable"));
    void request.then(connection => {
      if (controller.signal.aborted) return;
      setResult(connection.connector_id === connectorId && connection.provider_key === providerKey &&
        (!binding || (connection.status !== "revoked" && connection.connector_type === binding.connectorType &&
          (connection.server_id ?? null) === (binding.serverId ?? null)))
        ? { scope, connection, error: false } : { scope, error: true });
    }, () => { if (!controller.signal.aborted) setResult({ scope, error: true }); });
    return () => controller.abort();
  }, [scope, admitted, connectorId, client, known, providerKey, binding]);
  return { readScope: scope, connection: admitted ? known ?? (result?.scope === scope ? result.connection : undefined) ?? null : null,
    error: admitted && !known && result?.scope === scope && result.error };
}
