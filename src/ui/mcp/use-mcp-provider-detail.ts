"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { HubClientError, type HubClient } from "@/hub/client";
import type { McpConnectorProvider } from "@/hub/mcp-connector.schema";
import { useProductReadRecheck } from "@/ui/auth/product-read-recheck-context";

/** Resolve only an opened provider, never scan the catalog to find its identity. */
export function useMcpProviderDetail({ client, identity, admitted, readGeneration, providerKey, known, retry, window }: {
  client: HubClient;
  identity: string;
  admitted: boolean;
  readGeneration: number;
  providerKey: string | null;
  known: McpConnectorProvider | undefined;
  retry: number;
  window?: object | undefined;
}) {
  const reportRead401 = useProductReadRecheck();
  const [attempt, setAttempt] = useState(0);
  const readOwner = useMemo(() => ({ client, identity, admitted, readGeneration, providerKey, known, window }),
    [client, identity, admitted, readGeneration, providerKey, known, window]);
  const scope = useMemo(() => ({ readOwner, retry, attempt }), [readOwner, retry, attempt]);
  const current = useRef<typeof scope | null>(null);
  const pending = useRef<typeof scope | null>(null);
  useLayoutEffect(() => { current.current = scope; return () => { current.current = null; }; }, [scope]);
  const [result, setResult] = useState<{ scope: typeof scope; provider?: McpConnectorProvider; error: boolean }>();
  useEffect(() => {
    if (!admitted || !providerKey || known) return;
    const controller = new AbortController();
    let active = true;
    void client.getMcpConnectorProvider(providerKey, controller.signal).then(provider => {
      if (!active || current.current !== scope) return;
      if (provider.provider_key !== providerKey) { setResult({ scope, error: true }); return; }
      setResult({ scope, provider, error: false });
    }, (error: unknown) => {
      if (!active || controller.signal.aborted || current.current !== scope) return;
      if (error instanceof HubClientError && error.reason === "http" && error.status === 401)
        reportRead401?.({ subject: identity, generation: readGeneration, signal: controller.signal });
      setResult({ scope, error: true });
    });
    return () => { active = false; controller.abort(); };
  }, [scope, admitted, providerKey, client, known, reportRead401, identity, readGeneration]);
  const retryRead = () => {
    if (current.current !== scope || !admitted || known || !result?.error || result.scope !== scope || pending.current === scope) return;
    pending.current = scope;
    setAttempt(value => value + 1);
  };
  return {
    provider: admitted ? known ?? (result?.scope === scope ? result.provider : undefined) ?? null : null,
    error: admitted && !known && result?.scope === scope && result.error,
    retrying: Boolean(admitted && !known && result?.scope !== scope && result?.scope.readOwner === readOwner && result.error),
    retryRead,
  };
}
