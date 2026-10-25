"use client";

import { createContext, useContext, useLayoutEffect, useMemo, type ReactNode } from "react";
import type { HubClient } from "@/hub/client";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { type McpPreparationCommands } from "./mcp-preparation-commands";
import { createBrowserMcpPreparationRecovery } from "./mcp-preparation-recovery";
import { createCustomApiCreateFlow, type CustomApiCreateFlow } from "./custom-api-create-flow";
import { createMcpJsonImportFlow, type McpJsonImportFlow } from "./mcp-json-import-flow";
import { JsonMcpImportForm } from "./mcp-json-import-form";
import { invalidateMcpConnectorProjection } from "./use-mcp-projection";
import { createMcpServerCreationFlow, type McpServerCreationFlow, type McpServerCreationCompletion } from "./mcp-server-creation-flow";
import { CustomMcpForm } from "./mcp-custom-form";
import { UrlMcpForm } from "./mcp-url-form";
import { CustomApiForm } from "./custom-api-form";
import { invalidateCustomApiProjection } from "./use-custom-api-projection";

import { createCustomApiManagementCommands, type CustomApiManagementCommands } from "./custom-api-management-commands";

import { createMcpLifecycleCommands, type McpManagementCommands } from "./mcp-management-commands";

import { createProviderCreationCommands, type ProviderCreationCommands } from "./provider-creation-commands";

const Commands = createContext<{ providerCreation: ProviderCreationCommands; api: CustomApiCreateFlow; apiManagement: CustomApiManagementCommands; json: McpJsonImportFlow; server: McpServerCreationFlow; preparation: McpPreparationCommands; management: McpManagementCommands; client: HubClient; boundary: ProjectReadBoundary } | null>(null);

/** The stable app shell owns the command; closing a modal does not abandon it. */
export function ConnectorCommandProvider({ client, boundary, children }: {
  client: HubClient; boundary: ProjectReadBoundary; children: ReactNode;
}) {
  const { subject, admitted, generation } = boundary;
  const mcp = useMemo(() => createMcpLifecycleCommands({
    client, recovery: createBrowserMcpPreparationRecovery(), boundary: { subject, admitted: false, generation: 0 },
    onConfirmed: () => { if (subject !== null) invalidateMcpConnectorProjection(client, subject); },
  }), [client, subject]);
  const { preparation, management } = mcp;
  const providerCreation = useMemo(() => createProviderCreationCommands({
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
    const releaseProvider = providerCreation.retain({ subject, admitted, generation });
    const releaseManagement = management.retain({ subject, admitted, generation });
    const releasePreparation = preparation.retain({ subject, admitted, generation });
    const releaseApiManagement = apiManagement.retain({ subject, admitted, generation });
    const releaseApi = api.retain({ subject, admitted, generation });
    const releaseJson = json.retain({ subject, admitted, generation });
    const releaseServer = server.retain({ subject, admitted, generation });
    return () => { releaseProvider(); releaseManagement(); releaseApiManagement(); releaseApi(); releaseJson(); releaseServer(); releasePreparation(); };
  }, [providerCreation, api, apiManagement, json, server, preparation, management, subject, admitted, generation]);
  const value = useMemo(() => ({ providerCreation, api, apiManagement, json, server, preparation, management, client, boundary: { subject, admitted, generation } }), [providerCreation, api, apiManagement, json, server, preparation, management, client, subject, admitted, generation]);
  return <Commands.Provider value={value}>{children}</Commands.Provider>;
}

export function CustomApiCreationForm({ onCancel, onDone }: { onCancel: () => void; onDone: () => Promise<void> }) {
  const value = useContext(Commands);
  if (value === null) throw new Error("Custom API creation requires its actor-owned shell provider");
  return <CustomApiForm key={value.api.instanceId} flow={value.api} iconClient={value.client.mcpIcons} boundary={value.boundary} onCancel={onCancel} onDone={onDone} />;
}

export function JsonMcpCreationForm({ onCancel, onDone }: { onCancel: () => void; onDone: () => Promise<void> }) {
  const value = useContext(Commands);
  if (value === null) throw new Error("MCP JSON creation requires its actor-owned shell provider");
  return <JsonMcpImportForm key={value.json.instanceId} flow={value.json} boundary={value.boundary} onCancel={onCancel} onDone={onDone} />;
}

export function PrivateMcpCreationForm({ mode, onCancel, onDone }: { mode: "form" | "url"; onCancel: () => void; onDone: (result: McpServerCreationCompletion, current: () => boolean) => Promise<void> }) {
  const value = useContext(Commands);
  if (value === null) throw new Error("Private MCP creation requires its actor-owned shell provider");
  const props = { flow: value.server, iconClient: value.client.mcpIcons, boundary: value.boundary, onCancel, onDone };
  return mode === "form" ? <CustomMcpForm key={value.server.instanceId} {...props} /> : <UrlMcpForm key={value.server.instanceId} {...props} />;
}

export function useConnectorCommandBoundary(client: HubClient) {
  const value = useContext(Commands);
  if (value === null || value.client !== client)
    throw new Error("Connector creation requires the exact client shell owner");
  return value.boundary;
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

export function useMcpManagementCommands(client: HubClient, identity: string) {
  const value = useContext(Commands);
  if (value === null || value.client !== client || value.boundary.subject !== identity)
    throw new Error("MCP management requires the exact actor/client shell owner");
  return value.management;
}

export function useProviderCreationCommands(client: HubClient, identity: string) {
  const value = useContext(Commands);
  if (value === null || value.client !== client || value.boundary.subject !== identity)
    throw new Error("Provider creation requires the exact actor/client shell owner");
  return value.providerCreation;
}
