"use client";

import { createContext, useContext, useLayoutEffect, useMemo, type ReactNode } from "react";
import type { HubClient } from "@/hub/client";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { createCustomApiCreateFlow, type CustomApiCreateFlow } from "./custom-api-create-flow";
import { createMcpJsonImportFlow, type McpJsonImportFlow } from "./mcp-json-import-flow";
import { JsonMcpImportForm } from "./mcp-json-import-form";
import { invalidateMcpConnectorProjection } from "./use-mcp-projection";
import { CustomApiForm } from "./custom-api-form";
import { invalidateCustomApiProjection } from "./use-custom-api-projection";

const Creation = createContext<{ api: CustomApiCreateFlow; json: McpJsonImportFlow; boundary: ProjectReadBoundary } | null>(null);

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
  useLayoutEffect(() => {
    const releaseApi = api.retain({ subject, admitted, generation });
    const releaseJson = json.retain({ subject, admitted, generation });
    return () => { releaseApi(); releaseJson(); };
  }, [api, json, subject, admitted, generation]);
  const value = useMemo(() => ({ api, json, boundary: { subject, admitted, generation } }), [api, json, subject, admitted, generation]);
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
