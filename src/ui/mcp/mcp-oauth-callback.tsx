"use client";

import { useEffect, useMemo, useState } from "react";

import { createHubClient, type HubClient } from "@/hub/client";
import { useT } from "@/i18n/context";
import type { McpOAuthCallbackPayload } from "./mcp-oauth-callback-payload";
import { publishMcpOAuthCompletion } from "./use-mcp-oauth-popup";

type CallbackState = "completing" | "completed" | "failed";

const completionInflight = new WeakMap<
  object,
  Map<
    string,
    ReturnType<HubClient["completeMcpConnectorAuthorization"]>
  >
>();

function completeOnce(client: HubClient, payload: McpOAuthCallbackPayload) {
  let requests = completionInflight.get(client);
  if (!requests) {
    requests = new Map();
    completionInflight.set(client, requests);
  }
  const key = JSON.stringify(payload);
  let request = requests.get(key);
  if (!request) {
    request = client.completeMcpConnectorAuthorization(payload);
    requests.set(key, request);
    const clear = () => {
      if (requests?.get(key) === request) requests.delete(key);
    };
    void request.then(clear, clear);
  }
  return request;
}

export function McpOAuthCallback({
  payload,
  client,
  onComplete,
}: {
  payload: McpOAuthCallbackPayload | undefined;
  client?: HubClient;
  onComplete?: () => void;
}) {
  const t = useT();
  const [state, setState] = useState<CallbackState>("completing");
  const hubClient = useMemo(() => client ?? createHubClient(), [client]);

  useEffect(() => {
    if (payload === undefined) return;
    let active = true;
    void completeOnce(hubClient, payload).then(
      (result) => {
        if (!active) return;
        publishMcpOAuthCompletion(result.connector.connector_id);
        if ("error" in payload || result.connector.status !== "active") {
          setState("failed");
          return;
        }
        setState("completed");
        if (onComplete !== undefined) onComplete();
        else window.close();
      },
      () => {
        if (active) setState("failed");
      },
    );
    return () => {
      active = false;
    };
  }, [hubClient, onComplete, payload]);

  if (payload === undefined || state === "failed") {
    return (
      <main>
        <h1>{t("mcp.oauthCallbackFailedTitle")}</h1>
        <p>{t("mcp.oauthCallbackFailedDescription")}</p>
        <a href="/app/plugins">{t("mcp.oauthCallbackReturn")}</a>
      </main>
    );
  }
  if (state === "completed") {
    return (
      <main>
        <h1>{t("mcp.oauthCallbackCompletedTitle")}</h1>
        <p>{t("mcp.oauthCallbackCompletedDescription")}</p>
        <a href="/app/plugins">{t("mcp.oauthCallbackReturn")}</a>
      </main>
    );
  }
  return (
    <main aria-busy="true">
      <h1>{t("mcp.oauthCallbackCompletingTitle")}</h1>
      <p>{t("mcp.oauthCallbackCompletingDescription")}</p>
    </main>
  );
}
