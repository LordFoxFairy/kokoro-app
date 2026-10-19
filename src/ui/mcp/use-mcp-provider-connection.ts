"use client";

import { useEffect, useMemo, useState } from "react";
import { useMcpConnectorRevision } from "./use-mcp-projection";
import type { HubClient } from "@/hub/client";
import type { McpConnector } from "@/hub/mcp-connector.schema";

/** OAuth detail resolves its exact connection even when the plaza has no list. */
export function useMcpProviderConnection({ client, identity, admitted, readGeneration, connectorId, providerKey, known, retry }: {
  client: HubClient; identity: string; admitted: boolean; readGeneration: number;
  connectorId: string | null; providerKey: string | null; known: McpConnector | undefined; retry: number;
}) {
  const revision = useMcpConnectorRevision(client, identity);
  const scope = useMemo(() => ({ client, identity, admitted, readGeneration, connectorId, providerKey, known, retry, revision }),
    [client, identity, admitted, readGeneration, connectorId, providerKey, known, retry, revision]);
  const [result, setResult] = useState<{ scope: typeof scope; connection?: McpConnector; error: boolean }>();
  useEffect(() => {
    if (!admitted || !connectorId || known) return;
    const controller = new AbortController();
    const request = client.getMcpConnector ? client.getMcpConnector(connectorId, controller.signal) : Promise.reject(new Error("MCP detail unavailable"));
    void request.then(connection => {
      if (controller.signal.aborted) return;
      setResult(connection.connector_id === connectorId && connection.provider_key === providerKey
        ? { scope, connection, error: false } : { scope, error: true });
    }, () => { if (!controller.signal.aborted) setResult({ scope, error: true }); });
    return () => controller.abort();
  }, [scope, admitted, connectorId, client, known, providerKey]);
  return { connection: admitted ? known ?? (result?.scope === scope ? result.connection : undefined) ?? null : null,
    error: admitted && !known && result?.scope === scope && result.error };
}
