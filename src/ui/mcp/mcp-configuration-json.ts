import { z } from "zod";
import { parseMcpConnectorJson } from "@/hub/mcp-connector-json";
import { mcpPrivateJsonImportInputSchema, mcpPrivateServerRegistrationInputSchema, type McpPrivateServer } from "@/hub/mcp-connector.schema";

const documentSchema = z.object({ mcpServers: z.record(z.unknown()) }).strict();
const entrySchema = z.object({ type: z.enum(["streamableHttp", "sse"]), url: z.string(), headers: z.record(z.string()).optional() }).strict();
export type McpConfigurationJsonFields = { name: string; serverUrl: string; headers: Array<{ name: string; value: string }> };
export type McpConfigurationJsonErrorCode = "headers_duplicate" | "headers_invalid" | "immutable_transport" | "invalid_configuration";

/** Local validation classification only; never carry submitted text or secrets. */
export class McpConfigurationJsonError extends Error {
  constructor(readonly code: McpConfigurationJsonErrorCode) {
    super(code);
    this.name = "McpConfigurationJsonError";
  }
}

export function mergeConfigurationJsonHeaders(existing: readonly { name: string; value: string }[], provided: readonly { name: string; value: string }[]) {
  const merged = new Map(existing.map(item => [item.name.trim().toLowerCase(), { name: item.name.trim().toLowerCase(), value: item.value }]));
  if (merged.size !== existing.length) throw new McpConfigurationJsonError("headers_duplicate");
  for (const item of provided) merged.set(item.name, item);
  try { return mcpPrivateServerRegistrationInputSchema.shape.headers.parse([...merged.values()]) ?? []; }
  catch { throw new McpConfigurationJsonError("headers_invalid"); }
}

/** Local editing representation only. Saved secret descriptors never become values. */
export function configurationJson(name: string, serverUrl: string, transport: McpPrivateServer["transport"]): string {
  return JSON.stringify({ mcpServers: { [name]: { type: transport === "sse_compat" ? "sse" : "streamableHttp", url: serverUrl } } }, null, 2);
}

/** Reuse the duplicate-key parser and existing writable-field validators, not Import. */
export function parseConfigurationJson(text: string, transport: McpPrivateServer["transport"]): McpConfigurationJsonFields {
  try {
    mcpPrivateJsonImportInputSchema.parse({ config_json: text });
    const document = documentSchema.parse(parseMcpConnectorJson(text));
    const entries = Object.entries(document.mcpServers);
    if (entries.length !== 1) throw Error("single_server_required");
    const [name, raw] = entries[0]!;
    const entry = entrySchema.parse(raw);
    if (entry.type !== (transport === "sse_compat" ? "sse" : "streamableHttp")) throw new McpConfigurationJsonError("immutable_transport");
    const parsed = mcpPrivateServerRegistrationInputSchema.parse({ display_name: name, server_url: entry.url,
      transport, headers: Object.entries(entry.headers ?? {}).map(([name, value]) => ({ name: name.toLowerCase(), value })) });
    if (!parsed.display_name.trim()) throw Error("invalid_name");
    return { name: parsed.display_name, serverUrl: parsed.server_url, headers: parsed.headers ?? [] };
  } catch (error) {
    // Never reflect submitted text, header values or a parser's payload in feedback.
    throw error instanceof McpConfigurationJsonError ? error : new McpConfigurationJsonError("invalid_configuration");
  }
}
