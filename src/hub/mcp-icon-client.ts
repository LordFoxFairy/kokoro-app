import { z } from "zod";
import { HubClientError } from "./client";
import { connectorCreationKeySchema } from "./connector-creation-key.schema";
import { mcpIconIdSchema, mcpIconInputs, mcpIconResponses, mcpIconMatches, type McpIconOperation, type McpIconCommandInput } from "./mcp-icon.schema";

type Transport = <T extends z.ZodTypeAny>(operation: McpIconOperation, path: string, schema: T, init?: RequestInit, signal?: AbortSignal) => Promise<z.infer<T>>;
/** Reuses the admitted Hub transport; image bytes never enter BFF JSON. */
export function createMcpIconClient(transport: Transport) {
  const command = async <O extends Exclude<McpIconOperation, "getIcon">>(operation: O, input: McpIconCommandInput<O>, key: string, id?: string, signal?: AbortSignal): Promise<z.infer<(typeof mcpIconResponses)[O]>> => {
    const body = mcpIconInputs[operation].parse(input);
    const suffix = operation === "beginIcon" ? "uploads" : operation === "importIcon" ? "import" : `${mcpIconIdSchema.parse(id)}/${operation === "completeIcon" ? "complete" : "cancel"}`;
    const value = await transport(operation, `/mcp/icons/${suffix}`, mcpIconResponses[operation], {
      method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": connectorCreationKeySchema.parse(key) }, body: JSON.stringify(body),
    }, signal);
    if (!mcpIconMatches(operation, { data: value }, id, body)) throw new HubClientError("parse", "MCP icon ACK binding mismatch", null, 200);
    return value;
  };
  return {
    begin: (input: McpIconCommandInput<"beginIcon">, key: string, signal?: AbortSignal) => command("beginIcon", input, key, undefined, signal),
    complete: (id: string, input: McpIconCommandInput<"completeIcon">, key: string, signal?: AbortSignal) => command("completeIcon", input, key, id, signal),
    importUrl: (input: McpIconCommandInput<"importIcon">, key: string, signal?: AbortSignal) => command("importIcon", input, key, undefined, signal),
    cancel: (id: string, input: McpIconCommandInput<"cancelIcon">, key: string, signal?: AbortSignal) => command("cancelIcon", input, key, id, signal),
    get: async (id: string, signal?: AbortSignal) => {
      mcpIconIdSchema.parse(id);
      const value = await transport("getIcon", `/mcp/icons/${id}`, mcpIconResponses.getIcon, undefined, signal);
      if (!mcpIconMatches("getIcon", { data: value }, id)) throw new HubClientError("parse", "MCP icon read binding mismatch", null, 200);
      return value;
    },
  };
}
export type McpIconClient = ReturnType<typeof createMcpIconClient>;
