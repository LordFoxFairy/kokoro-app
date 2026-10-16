"use client";

import { createContext, useContext, useLayoutEffect, useMemo, type ReactNode } from "react";
import type { HubClient } from "@/hub/client";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { createCustomApiCreateFlow, type CustomApiCreateFlow } from "./custom-api-create-flow";
import { createMcpJsonImportFlow, type McpJsonImportFlow } from "./mcp-json-import-flow";
import { JsonMcpImportForm } from "./mcp-json-import-form";
import { invalidateMcpConnectorProjection } from "./use-mcp-projection";
import { createMcpServerCreationFlow, type McpServerCreationFlow } from "./mcp-server-creation-flow";
import { CustomMcpForm } from "./mcp-custom-form";
import { UrlMcpForm } from "./mcp-url-form";
import { CustomApiForm } from "./custom-api-form";
import { invalidateCustomApiProjection } from "./use-custom-api-projection";

const Creation = createContext<{ api: CustomApiCreateFlow; json: McpJsonImportFlow; server: McpServerCreationFlow; boundary: ProjectReadBoundary } | null>(null);

/** The stable app shell owns the command; closing a modal does not abandon it. */
export function ConnectorCreationProvider({ client, boundary, children }: {
  client: HubClient; boundary: ProjectReadBoundary; children: ReactNode;
}) {
  const { subject, admitted, generation } = boundary;
  const api = useMemo(() => createCustomApiCreateFlow({
    client, boundary: { subject, admitted: false, generation: 0 },
    onConfirmed: () => { if (subject !== null) invalidateCustomApiProjection(client, subject); },
  }), [client, subject]);
  const json = useMemo(() => createMcpJsonImportFlow({
    client, boundary: { subject, admitted: false, generation: 0 },
    onConfirmed: () => { if (subject !== null) invalidateMcpConnectorProjection(client, subject); },
  }), [client, subject]);
  const server = useMemo(() => createMcpServerCreationFlow({
    client, boundary: { subject, admitted: false, generation: 0 },
    onChanged: () => { if (subject !== null) invalidateMcpConnectorProjection(client, subject); },
  }), [client, subject]);
  useLayoutEffect(() => {
    const releaseApi = api.retain({ subject, admitted, generation });
    const releaseJson = json.retain({ subject, admitted, generation });
    const releaseServer = server.retain({ subject, admitted, generation });
    return () => { releaseApi(); releaseJson(); releaseServer(); };
  }, [api, json, server, subject, admitted, generation]);
  const value = useMemo(() => ({ api, json, server, boundary: { subject, admitted, generation } }), [api, json, server, subject, admitted, generation]);
  return <Creation.Provider value={value}>{children}</Creation.Provider>;
}

export function CustomApiCreationForm({ onCancel, onDone }: { onCancel: () => void; onDone: () => Promise<void> }) {
  const value = useContext(Creation);
  if (value === null) throw new Error("Custom API creation requires its actor-owned shell provider");
  return <CustomApiForm key={value.api.instanceId} flow={value.api} boundary={value.boundary} onCancel={onCancel} onDone={onDone} />;
}

export function JsonMcpCreationForm({ onCancel, onDone }: { onCancel: () => void; onDone: () => Promise<void> }) {
  const value = useContext(Creation);
  if (value === null) throw new Error("MCP JSON creation requires its actor-owned shell provider");
  return <JsonMcpImportForm key={value.json.instanceId} flow={value.json} boundary={value.boundary} onCancel={onCancel} onDone={onDone} />;
}

export function PrivateMcpCreationForm({ mode, onCancel, onDone }: { mode: "form" | "url"; onCancel: () => void; onDone: () => Promise<void> }) {
  const value = useContext(Creation);
  if (value === null) throw new Error("Private MCP creation requires its actor-owned shell provider");
  const props = { flow: value.server, boundary: value.boundary, onCancel, onDone };
  return mode === "form" ? <CustomMcpForm key={value.server.instanceId} {...props} /> : <UrlMcpForm key={value.server.instanceId} {...props} />;
}
