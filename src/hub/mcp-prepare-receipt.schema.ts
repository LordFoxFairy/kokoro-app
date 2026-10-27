import {
  MCP_PREPARE_RECEIPT_POLICY as policy,
  mcpPrepareReceiptWireSchema,
  mcpPrepareReceiptServerIdSchema,
  mcpPrepareReceiptVersionSchema,
  mcpPrepareReceiptKeySchema,
  mcpPrepareReceiptErrors,
} from "@/generated/bff-mcp-prepare-receipt";
import { connectorCreationKeySchema } from "./connector-creation-key.schema";
import { mcpConnectorIdSchema, mcpPrivateServerPrepareInputSchema, mcpPrivateServerMatches } from "./mcp-connector.schema";

/** This capability grants original-result GET only, including same_command faults. */
export function mcpPrepareReceiptLookupOnly(): boolean {
  return policy.lookup_only && policy.completed_only && !policy.negative_ack && !policy.prepare_authorized &&
    !policy.new_command_authorized && !policy.automatic_retries && policy.supersedes_prepare_inspection_recovery &&
    policy.same_command.method === "GET" && policy.same_command.target === "original_lookup";
}
// JSON Schema preserves the decimal pattern; the owner Zod refinement also caps PostgreSQL int32 CAS.
const receiptVersion = mcpPrepareReceiptVersionSchema.refine(value => BigInt(value) <= BigInt(2_147_483_647));
export const mcpPrepareReceiptDataSchema = mcpPrepareReceiptWireSchema.shape.data;
export function mcpPrepareReceiptRequest(serverId: string, version: string, key: string) {
  const id = mcpConnectorIdSchema.parse(mcpPrepareReceiptServerIdSchema.parse(serverId));
  const input = mcpPrivateServerPrepareInputSchema.parse({ expected_state_version: receiptVersion.parse(version) });
  return { serverId: id, version: input.expected_state_version, key: connectorCreationKeySchema.parse(mcpPrepareReceiptKeySchema.parse(key)) };
}
export function mcpPrepareReceiptMatches(value: unknown, serverId: string, version: string): boolean {
  const parsed = mcpPrepareReceiptWireSchema.safeParse(value);
  return mcpPrepareReceiptLookupOnly() && parsed.success &&
    mcpPrivateServerMatches("prepareServer", { data: parsed.data.data.completed }, serverId, { expected_state_version: version });
}
export function mcpPrepareReceiptErrorAllowed(status: number, value: unknown): boolean {
  return mcpPrepareReceiptErrors[String(status) as keyof typeof mcpPrepareReceiptErrors]?.safeParse(value).success === true;
}
