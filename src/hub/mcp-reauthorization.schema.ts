import { z } from "zod";
import { mcpConnectorIdSchema } from "./mcp-connector.schema";
import { mcpReauthorizationRequestSchema, mcpReauthorizationWireSchema, mcpReauthorizationErrors } from "@/generated/bff-mcp-reauthorization";
export { mcpReauthorizationRequestSchema };
export const mcpReauthorizationDataSchema = mcpReauthorizationWireSchema.shape.data;
export type McpReauthorizationInput = z.infer<typeof mcpReauthorizationRequestSchema>;
export type McpReauthorization = z.infer<typeof mcpReauthorizationDataSchema>;
/** Historical completion is a safe locator, never a Current read or a Prepare grant. */
export function mcpReauthorizationMatches(value: unknown, serverId: string, input: unknown): boolean {
  const request = mcpReauthorizationRequestSchema.safeParse(input);
  const response = mcpReauthorizationWireSchema.safeParse({ data: value });
  if (!mcpConnectorIdSchema.safeParse(serverId).success || !request.success || !response.success) return false;
  const { server, connector } = response.data.data;
  return server.server_id === serverId && connector.server_id === serverId &&
    connector.connector_id !== request.data.source_connector_id &&
    BigInt(server.state_version) === BigInt(request.data.expected_server_state_version) + BigInt(1);
}
export function mcpReauthorizationErrorAllowed(status: number, value: unknown): boolean {
  return mcpReauthorizationErrors[String(status) as keyof typeof mcpReauthorizationErrors]?.safeParse(value).success === true;
}
export function mcpReauthorizationEnvelopeMatches(value: unknown, serverId: string, input: unknown): boolean {
  const parsed = mcpReauthorizationWireSchema.safeParse(value);
  return parsed.success && mcpReauthorizationMatches(parsed.data.data, serverId, input);
}
