import { z } from "zod";
import { mcpReauthorizationRequestSchema, mcpReauthorizationWireSchema, mcpReauthorizationErrors } from "@/generated/bff-mcp-reauthorization";
export { mcpReauthorizationRequestSchema } from "@/generated/bff-mcp-reauthorization";
export const mcpReauthorizationDataSchema = mcpReauthorizationWireSchema.shape.data;
export type McpReauthorizationInput = z.infer<typeof mcpReauthorizationRequestSchema>;
export type McpReauthorization = z.infer<typeof mcpReauthorizationDataSchema>;

/** A historical ACK is only the original command result, never current admission. */
export function mcpReauthorizationMatches(value: unknown, serverId: string | undefined, input: unknown): boolean {
  const body = mcpReauthorizationRequestSchema.safeParse(input), parsed = mcpReauthorizationWireSchema.safeParse(value);
  if (!body.success || !parsed.success || serverId === undefined) return false;
  const { server, connector } = parsed.data.data;
  return server.server_id === serverId && connector.server_id === serverId &&
    connector.provider_key === `private-${server.server_id}` &&
    server.state_version === String(BigInt(body.data.expected_server_state_version) + BigInt(1)) &&
    connector.connector_id !== body.data.source_connector_id;
}
export function mcpReauthorizationErrorAllowed(status: number, value: unknown): boolean {
  const schema = mcpReauthorizationErrors[String(status) as keyof typeof mcpReauthorizationErrors];
  return schema !== undefined && schema.safeParse(value).success;
}
