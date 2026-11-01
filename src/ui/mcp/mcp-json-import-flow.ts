import type { HubClient } from "@/hub/client";
import { mcpPrivateJsonImportInputSchema, mcpPrivateJsonImportSchema } from "@/hub/mcp-connector.schema";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { createConnectorCommand } from "./connector-command";
import type { McpServerCreationCompletion } from "./mcp-server-creation-flow";

export type McpJsonImportCompletion = readonly Readonly<McpServerCreationCompletion & { name: string }>[];

/** One owner-atomic document, never a client-side loop of registrations. */
export function createMcpJsonImportFlow(options: {
  client: Pick<HubClient, "importPrivateMcpJson">;
  boundary: ProjectReadBoundary;
  onConfirmed: () => void;
  key?: () => string;
}) {
  return createConnectorCommand<string, McpJsonImportCompletion>({
    ...options,
    surface: "mcp",
    execute: options.client.importPrivateMcpJson,
    invalidRequestCode: "invalid_mcp_personal_request",
    projectCompletion: ack => Object.freeze(mcpPrivateJsonImportSchema.parse(ack).imports.map(({ server, connector }) =>
      Object.freeze({ serverId: server.server_id, connectorId: connector.connector_id, providerKey: connector.provider_key, name: server.display_name }))),
    // Import is owner-atomic: an initial verified duplicate rejects the whole
    // document. A duplicate after an unknown outcome is never classified here.
    classifyRejection: error => error.status === 409 && error.code === "mcp_personal_server_url_conflict" &&
      error.retryable === false ? "url_conflict" : undefined,
    freeze: config => mcpPrivateJsonImportInputSchema.parse({ config_json: config }).config_json,
  });
}
export type McpJsonImportFlow = ReturnType<typeof createMcpJsonImportFlow>;
