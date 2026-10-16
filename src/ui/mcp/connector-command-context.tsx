"use client";

import { createContext, useContext, useLayoutEffect, useMemo, type ReactNode } from "react";
import type { HubClient } from "@/hub/client";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { createMcpPreparationCommands, type McpPreparationCommands } from "./mcp-preparation-commands";
import { createCustomApiCreateFlow, type CustomApiCreateFlow } from "./custom-api-create-flow";
import { createMcpJsonImportFlow, type McpJsonImportFlow } from "./mcp-json-import-flow";
import { JsonMcpImportForm } from "./mcp-json-import-form";
import { invalidateMcpConnectorProjection } from "./use-mcp-projection";
import { createMcpServerCreationFlow, type McpServerCreationFlow } from "./mcp-server-creation-flow";
import { CustomMcpForm } from "./mcp-custom-form";
import { UrlMcpForm } from "./mcp-url-form";
import { CustomApiForm } from "./custom-api-form";
import { invalidateCustomApiProjection } from "./use-custom-api-projection";

import { createCustomApiManagementCommands, type CustomApiManagementCommands } from "./custom-api-management-commands";

const Commands = createContext<{ api: CustomApiCreateFlow; apiManagement: CustomApiManagementCommands; json: McpJsonImportFlow; server: McpServerCreationFlow; preparation: McpPreparationCommands; client: HubClient; boundary: ProjectReadBoundary } | null>(null);

/** The stable app shell owns the command; closing a modal does not abandon it. */
export function ConnectorCommandProvider({ client, boundary, children }: {
  client: HubClient; boundary: ProjectReadBoundary; children: ReactNode;
}) {
  const { subject, admitted, generation } = boundary;
  const preparation = useMemo(() => createMcpPreparationCommands({
    client, boundary: { subject, admitted: false, generation: 0 },
    onConfirmed: () => { if (subject !== null) invalidateMcpConnectorProjection(client, subject); },
  }), [client, subject]);
  const apiManagement = useMemo(() => createCustomApiManagementCommands({
    client, boundary: { subject, admitted: false, generation: 0 },
    onConfirmed: () => { if (subject !== null) invalidateCustomApiProjection(client, subject); },
  }), [client, subject]);
  const api = useMemo(() => createCustomApiCreateFlow({
    client, boundary: { subject, admitted: false, generation: 0 },
    onConfirmed: () => { if (subject !== null) invalidateCustomApiProjection(client, subject); },
  }), [client, subject]);
  const json = useMemo(() => createMcpJsonImportFlow({
    client, boundary: { subject, admitted: false, generation: 0 },
    onConfirmed: () => { if (subject !== null) invalidateMcpConnectorProjection(client, subject); },
  }), [client, subject]);
  const server = useMemo(() => createMcpServerCreationFlow({
    client, preparation, boundary: { subject, admitted: false, generation: 0 },
    onChanged: () => { if (subject !== null) invalidateMcpConnectorProjection(client, subject); },
  }), [client, subject, preparation]);
  useLayoutEffect(() => {
    const releasePreparation = preparation.retain({ subject, admitted, generation });
    const releaseApiManagement = apiManagement.retain({ subject, admitted, generation });
    const releaseApi = api.retain({ subject, admitted, generation });
    const releaseJson = json.retain({ subject, admitted, generation });
    const releaseServer = server.retain({ subject, admitted, generation });
    return () => { releaseApiManagement(); releaseApi(); releaseJson(); releaseServer(); releasePreparation(); };
  }, [api, apiManagement, json, server, preparation, subject, admitted, generation]);
  const value = useMemo(() => ({ api, apiManagement, json, server, preparation, client, boundary: { subject, admitted, generation } }), [api, apiManagement, json, server, preparation, client, subject, admitted, generation]);
  return <Commands.Provider value={value}>{children}</Commands.Provider>;
}

export function CustomApiCreationForm({ onCancel, onDone }: { onCancel: () => void; onDone: () => Promise<void> }) {
  const value = useContext(Commands);
  if (value === null) throw new Error("Custom API creation requires its actor-owned shell provider");
  return <CustomApiForm key={value.api.instanceId} flow={value.api} boundary={value.boundary} onCancel={onCancel} onDone={onDone} />;
}

export function JsonMcpCreationForm({ onCancel, onDone }: { onCancel: () => void; onDone: () => Promise<void> }) {
  const value = useContext(Commands);
  if (value === null) throw new Error("MCP JSON creation requires its actor-owned shell provider");
  return <JsonMcpImportForm key={value.json.instanceId} flow={value.json} boundary={value.boundary} onCancel={onCancel} onDone={onDone} />;
}

export function PrivateMcpCreationForm({ mode, onCancel, onDone }: { mode: "form" | "url"; onCancel: () => void; onDone: () => Promise<void> }) {
  const value = useContext(Commands);
  if (value === null) throw new Error("Private MCP creation requires its actor-owned shell provider");
  const props = { flow: value.server, boundary: value.boundary, onCancel, onDone };
  return mode === "form" ? <CustomMcpForm key={value.server.instanceId} {...props} /> : <UrlMcpForm key={value.server.instanceId} {...props} />;
}

export function useMcpPreparationCommands(client: HubClient, identity: string) {
  const value = useContext(Commands);
  if (value === null || value.client !== client || value.boundary.subject !== identity)
    throw new Error("MCP preparation requires the exact actor/client shell owner");
  return value.preparation;
}

export function useCustomApiManagementCommands(client: HubClient, identity: string) {
  const value = useContext(Commands);
  if (value === null || value.client !== client || value.boundary.subject !== identity)
    throw new Error("Custom API management requires the exact actor/client shell owner");
  return value.apiManagement;
}
