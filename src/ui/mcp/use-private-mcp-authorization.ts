"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { HubClient } from "@/hub/client";
import type { McpConnector, McpPrivateServer } from "@/hub/mcp-connector.schema";
import { useMcpOAuthPopup } from "./use-mcp-oauth-popup";
import { invalidateMcpConnectorProjection } from "./use-mcp-projection";

/** A detail window owns its OAuth wait, never the durable authorization fact. */
export function usePrivateMcpAuthorization({ client, identity, admitted, readGeneration, intent, blocked, onAuthorizationNavigate }: {
  client: HubClient;
  identity: string;
  admitted: boolean;
  readGeneration: number;
  intent: { connectorId: string; serverId?: string; window: object } | null;
  blocked: boolean;
  onAuthorizationNavigate?: (url: string) => void;
}) {
  const window = intent?.window, connectorId = intent?.connectorId, serverId = intent?.serverId;
  const scope = useMemo(() => ({ client, identity, admitted: admitted && !blocked && serverId !== undefined,
    readGeneration, window, connectorId, serverId }), [client, identity, admitted, blocked, readGeneration, window, connectorId, serverId]);
  const committed = useRef<typeof scope | null>(null);
  const waiting = useRef<{ scope: typeof scope } | null>(null);
  useLayoutEffect(() => {
    committed.current = scope;
    return () => {
      if (committed.current === scope) committed.current = null;
      if (waiting.current?.scope === scope) waiting.current = null;
    };
  }, [scope]);
  const [status, setStatus] = useState<{ scope: typeof scope; busy: boolean; error: boolean } | null>(null);
  const startPopup = useMcpOAuthPopup({ lifecycle: scope,
    ...(onAuthorizationNavigate ? { onAuthorizationNavigate } : {}),
    onReload: () => { if (committed.current === scope && scope.admitted) invalidateMcpConnectorProjection(client, identity); },
  });
  const authorize = async (connector: McpConnector, server: McpPrivateServer) => {
    if (committed.current !== scope || !scope.admitted || waiting.current ||
      connector.connector_id !== scope.connectorId || server.server_id !== scope.serverId ||
      connector.server_id !== server.server_id || server.status === "disabled" ||
      server.prepare_status !== "needs_oauth" || (connector.status !== "pending" && connector.status !== "error")) return;
    const request = { scope };
    waiting.current = request;
    setStatus({ scope, busy: true, error: false });
    try {
      await startPopup(async signal => {
        const started = await client.reconnectMcpConnectorAuthorization(connector.connector_id,
          { server_id: server.server_id, expected_state_version: connector.state_version }, signal);
        // A late confirmed mutation still invalidates its original actor, but
        // cannot navigate or complete a different detail window.
        invalidateMcpConnectorProjection(client, identity);
        if (signal.aborted || committed.current !== scope) throw new Error("private OAuth window retired");
        return { connectorId: connector.connector_id, authorizationUrl: started.authorization.authorization_url,
          expiresAt: started.authorization.expires_at };
      });
      if (committed.current === scope) setStatus({ scope, busy: false, error: false });
    } catch {
      if (committed.current === scope) setStatus({ scope, busy: false, error: true });
    } finally { if (waiting.current === request) waiting.current = null; }
  };
  return { authorize, busy: status?.scope === scope && status.busy, error: status?.scope === scope && status.error };
}
