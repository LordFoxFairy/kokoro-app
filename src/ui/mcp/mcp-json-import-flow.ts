import type { HubClient } from "@/hub/client";
import { mcpPrivateJsonImportInputSchema } from "@/hub/mcp-connector.schema";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { createConnectorCreationCommand } from "./connector-creation-command";

/** One owner-atomic document, never a client-side loop of registrations. */
export function createMcpJsonImportFlow(options: {
  client: Pick<HubClient, "importPrivateMcpJson">;
  boundary: ProjectReadBoundary;
  onConfirmed: () => void;
  key?: () => string;
}) {
  return createConnectorCreationCommand<string>({
    ...options,
    create: options.client.importPrivateMcpJson,
    invalidRequestCode: "invalid_mcp_personal_request",
    freeze: config => mcpPrivateJsonImportInputSchema.parse({ config_json: config }).config_json,
  });
}
export type McpJsonImportFlow = ReturnType<typeof createMcpJsonImportFlow>;
