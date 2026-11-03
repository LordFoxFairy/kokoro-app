"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useCustomApiRevision } from "./use-custom-api-projection";
import { HubClientError, type HubClient } from "@/hub/client";
import type { CustomApiProfile } from "@/hub/custom-api.schema";
import { useProductReadRecheck } from "@/ui/auth/product-read-recheck-context";

/** An opened locator must survive a list-page retirement, not its old facts. */
export function useCustomApiDetail({ client, identity, admitted, readGeneration, profileId, known, retry, window }: {
  client: HubClient; identity: string; admitted: boolean; readGeneration: number;
  profileId: string | null; known: CustomApiProfile | undefined; retry: number; window?: object | undefined;
}) {
  const reportRead401 = useProductReadRecheck();
  const revision = useCustomApiRevision(client, identity);
  const [attempt, setAttempt] = useState(0);
  const readOwner = useMemo(() => ({ client, identity, admitted, readGeneration, profileId, known, revision, window }),
    [client, identity, admitted, readGeneration, profileId, known, revision, window]);
  const scope = useMemo(() => ({ readOwner, retry, attempt }), [readOwner, retry, attempt]);
  const current = useRef<typeof scope | null>(null);
  const pending = useRef<typeof scope | null>(null);
  useLayoutEffect(() => { current.current = scope; return () => { current.current = null; }; }, [scope]);
  const [result, setResult] = useState<{ scope: typeof scope; profile?: CustomApiProfile; error: boolean }>();
  useEffect(() => {
    if (!admitted || !profileId || known) return;
    const controller = new AbortController();
    const request = client.getCustomApi ? client.getCustomApi(profileId, controller.signal) : Promise.reject(new Error("Custom API detail unavailable"));
    void request.then(profile => {
      if (controller.signal.aborted || current.current !== scope) return;
      setResult(profile.profile_id === profileId ? { scope, profile, error: false } : { scope, error: true });
    }, (error: unknown) => {
      if (controller.signal.aborted || current.current !== scope) return;
      if (error instanceof HubClientError && error.reason === "http" && error.status === 401)
        reportRead401?.({ subject: identity, generation: readGeneration, signal: controller.signal });
      setResult({ scope, error: true });
    });
    return () => controller.abort();
  }, [scope, admitted, profileId, client, known, reportRead401, identity, readGeneration]);
  const retryRead = () => {
    if (current.current !== scope || !admitted || known || !result?.error || result.scope !== scope || pending.current === scope) return;
    pending.current = scope;
    setAttempt(value => value + 1);
  };
  return { profile: admitted ? known ?? (result?.scope === scope ? result.profile : undefined) ?? null : null,
    error: admitted && !known && result?.scope === scope && result.error,
    retrying: Boolean(admitted && !known && result?.scope !== scope && result?.scope.readOwner === readOwner && result.error),
    retryRead };
}
