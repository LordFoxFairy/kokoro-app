/** Public QA fixture; not live facts, secrets, or a second editable wire contract. */
export const prepareReceiptFixture = () => ({
  data: { completed: {
    server: { availability: "unavailable" as const, server_id: "receipt-server", display_name: "Receipt QA", server_url: "https://mcp.example.test/receipt", status: "registered" as const, state_version: "2", headers: [], transport: "sse_compat" as const, prepare_status: "ready" as const, declarations: [], declarations_available: true, declaration_digest: "a".repeat(64) },
    connector: { availability: "unavailable" as const, connector_id: "receipt-connector", server_id: "receipt-server", provider_key: "receipt-provider", connector_type: "mcp" as const, status: "active" as const, enabled: true, approved_scopes: [], state_version: "2" },
    declarations: [], replayed: true,
  } },
});
