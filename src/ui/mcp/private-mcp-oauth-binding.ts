import type { McpConnector, McpPrivateServer } from "@/hub/mcp-connector.schema";

/** Only owner-projected OAuth facts qualify; a generic active MCP is not OAuth. */
export function canAuthorizePrivateMcp(connector: McpConnector, server: McpPrivateServer): boolean {
  return connector.server_id === server.server_id && server.status !== "disabled" &&
    (connector.status === "active" || connector.status === "pending" || connector.status === "error") &&
    (server.prepare_status === "needs_oauth" ||
      (server.prepare_status === "ready" && server.oauth_client?.configured === true && server.oauth_client.status === "configured"));
}
