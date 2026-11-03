import { mcpPrivateJsonImportSchema } from "@/hub/mcp-connector.schema";

/** Owner-shaped, non-secret receipts; only test fixtures synthesize these IDs. */
export function jsonImportReceipt(names = ["Acceptance MCP"], replayed = false) {
  return mcpPrivateJsonImportSchema.parse({ imports: names.map((name, index) => ({
    server: { availability: "unavailable", server_id: `import-server-${index}`, display_name: name,
      server_url: `https://mcp.example.test/${index}`, status: "registered", state_version: "1", headers: [],
      transport: "streamable_http", prepare_status: "pending_prepare", declarations: [], declarations_available: false },
    connector: { availability: "unavailable", connector_id: `import-connector-${index}`, server_id: `import-server-${index}`,
      provider_key: `import-provider-${index}`, display_name: name, connector_type: "mcp", status: "pending", enabled: false,
      state_version: "1", approved_scopes: [] },
  })), replayed });
}

export function jsonImportReceiptForDocument(document: string, replayed = false) {
  const input = JSON.parse(document) as { mcpServers: Record<string, { type: "streamableHttp" | "sse"; url: string; headers?: Record<string, string> }> };
  const entries = Object.entries(input.mcpServers);
  const receipt = jsonImportReceipt(entries.map(([name]) => name), replayed);
  return mcpPrivateJsonImportSchema.parse({ ...receipt, imports: receipt.imports.map((entry, index) => {
    const configuration = entries[index]![1];
    return { ...entry, server: { ...entry.server, server_url: configuration.url,
      transport: configuration.type === "sse" ? "sse_compat" : "streamable_http",
      headers: Object.keys(configuration.headers ?? {}).map(name => ({ name: name.toLowerCase(), configured: true, status: "active", state_version: "1" })),
    } };
  }) });
}
