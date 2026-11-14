/** QA data shaped by the published private profile, never current owner facts. */
export const reauthorizationInput = { source_connector_id: "removed-source", expected_server_state_version: "4", expected_connector_state_version: "7" } as const;
export const reauthorizationFixture = () => ({ data: {
  server: { server_id: "saved-server", display_name: "Saved MCP", server_url: "https://mcp.example.test/saved", transport: "streamable_http" as const,
    status: "pending" as const, state_version: "5", availability: "unavailable" as const, prepare_status: "pending_prepare" as const, declarations_available: false, declarations: [], headers: [] },
  connector: { connector_id: "new-pending", server_id: "saved-server", provider_key: "private-saved-server", connector_type: "mcp" as const,
    status: "pending" as const, enabled: false, availability: "unavailable" as const, state_version: "1", approved_scopes: [] }, replayed: true,
} });
