"use client";

import { useEffect, useMemo, useState } from "react";

import type { HubClient } from "@/hub/client";
import type { McpConnectorProvider } from "@/hub/mcp-connector.schema";

/** Resolve only an opened provider, never scan the catalog to find its identity. */
export function useMcpProviderDetail({ client, identity, admitted, readGeneration, providerKey, known, retry }: {
  client: HubClient;
  identity: string;
  admitted: boolean;
  readGeneration: number;
  providerKey: string | null;
  known: McpConnectorProvider | undefined;
  retry: number;
}) {
  const scope = useMemo(() => ({ client, identity, admitted, readGeneration, providerKey, retry }),
    [client, identity, admitted, readGeneration, providerKey, retry]);
  const [result, setResult] = useState<{ scope: typeof scope; provider?: McpConnectorProvider; error: boolean }>();
  useEffect(() => {
    if (!admitted || !providerKey || known) return;
    const controller = new AbortController();
    let active = true;
    void client.getMcpConnectorProvider(providerKey, controller.signal).then(provider => {
      if (!active) return;
      if (provider.provider_key !== providerKey) { setResult({ scope, error: true }); return; }
      setResult({ scope, provider, error: false });
    }, () => { if (active) setResult({ scope, error: true }); });
    return () => { active = false; controller.abort(); };
  }, [scope, admitted, providerKey, client, known]);
  return {
    provider: admitted ? known ?? (result?.scope === scope ? result.provider : undefined) ?? null : null,
    error: admitted && !known && result?.scope === scope && result.error,
  };
}
