"use client";

import { useEffect, useMemo, useState } from "react";
import { useCustomApiRevision } from "./use-custom-api-projection";
import type { HubClient } from "@/hub/client";
import type { CustomApiProfile } from "@/hub/custom-api.schema";

/** An opened locator must survive a list-page retirement, not its old facts. */
export function useCustomApiDetail({ client, identity, admitted, readGeneration, profileId, known, retry }: {
  client: HubClient; identity: string; admitted: boolean; readGeneration: number;
  profileId: string | null; known: CustomApiProfile | undefined; retry: number;
}) {
  const revision = useCustomApiRevision(client, identity);
  const scope = useMemo(() => ({ client, identity, admitted, readGeneration, profileId, known, retry, revision }),
    [client, identity, admitted, readGeneration, profileId, known, retry, revision]);
  const [result, setResult] = useState<{ scope: typeof scope; profile?: CustomApiProfile; error: boolean }>();
  useEffect(() => {
    if (!admitted || !profileId || known) return;
    const controller = new AbortController();
    const request = client.getCustomApi ? client.getCustomApi(profileId, controller.signal) : Promise.reject(new Error("Custom API detail unavailable"));
    void request.then(profile => {
      if (controller.signal.aborted) return;
      setResult(profile.profile_id === profileId ? { scope, profile, error: false } : { scope, error: true });
    }, () => { if (!controller.signal.aborted) setResult({ scope, error: true }); });
    return () => controller.abort();
  }, [scope, admitted, profileId, client, known]);
  return { profile: admitted ? known ?? (result?.scope === scope ? result.profile : undefined) ?? null : null,
    error: admitted && !known && result?.scope === scope && result.error };
}
