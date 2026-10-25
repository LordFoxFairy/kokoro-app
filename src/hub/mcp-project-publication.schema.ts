import { z } from "zod";
import { publicationIdSchema, publicationRequestSchema, publicationResponseSchema, publicationListSchema, publicationReceiptRequestSchema, publicationReceiptSchema, publicationErrorSchema } from "@/generated/bff-mcp-project-publication";
export { publicationIdSchema, publicationReceiptRequestSchema, publicationErrorSchema };
export const mcpPublicationInputSchema = publicationRequestSchema.superRefine((value, ctx) => {
  if (BigInt(value.expected_source_state_version) > BigInt(2147483647) || value.targets.some(item => "current" in item.expected_pin && BigInt(item.expected_pin.current.state_version) > BigInt(2147483647)) || new Set(value.targets.map(item => item.project_id)).size !== value.targets.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid publication CAS or duplicate project" });
});
export type McpPublicationInput = z.infer<typeof mcpPublicationInputSchema>;
export type McpPublicationAck = z.infer<typeof publicationResponseSchema>["data"];
export type McpProjectPin = McpPublicationAck["pins"][number];
export type McpPublicationIdentity = McpPublicationInput & { server_id: string };
export type McpPublicationOperation = "publish" | "list" | "receipt";
export const mcpPublicationSchemas = { publish: publicationResponseSchema, list: publicationListSchema, receipt: publicationReceiptSchema };
export function mcpPublicationPath(path: readonly string[]): boolean {
  return path[0] === "mcp" && (path[1] === "project-publication-receipts" || path[1] === "servers" && path[3] === "project-publications") || path[0] === "projects" && path[2] === "mcp-pins";
}
function validPin(pin: McpProjectPin): boolean {
  return BigInt(pin.state_version) <= BigInt(2147483647) && BigInt(pin.revision.source_state_version) <= BigInt(2147483647) && Boolean(pin.revision.display_name.trim()) && new TextEncoder().encode(pin.revision.display_name).length <= 100 && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(pin.revision.display_name);
}
/** A well-shaped result is not enough: every result must bind the frozen original. */
export function parseMcpPublicationAck(raw: unknown, original: McpPublicationIdentity, receipt = false): McpPublicationAck {
  let ack: McpPublicationAck;
  if (receipt) {
    const parsed = publicationReceiptSchema.parse(raw).data;
    if (!("publication" in parsed)) throw new Error("publication_receipt_kind_mismatch");
    ack = parsed.publication;
  } else ack = publicationResponseSchema.parse(raw).data;
  if (ack.revision.server_id !== original.server_id || ack.revision.connector_id !== original.connector_id || ack.revision.source_state_version !== original.expected_source_state_version || ack.pins.length !== original.targets.length || new Set(ack.pins.map(pin => pin.project_id)).size !== ack.pins.length || new Set(ack.pins.map(pin => pin.pin_id)).size !== ack.pins.length) throw new Error("publication_ack_binding_mismatch");
  for (const pin of ack.pins) {
    const target = original.targets.find(item => item.project_id === pin.project_id);
    if (!target || pin.removed || !validPin(pin) || JSON.stringify(pin.revision) !== JSON.stringify(ack.revision) || ("absent" in target.expected_pin ? pin.state_version !== "1" : pin.pin_id !== target.expected_pin.current.pin_id || BigInt(pin.state_version) !== BigInt(target.expected_pin.current.state_version) + BigInt(1))) throw new Error("publication_pin_binding_mismatch");
  }
  return ack;
}
export function parseMcpPublicationPage(raw: unknown, project: string, cursor?: string) {
  const page = publicationListSchema.parse(raw).data;
  if (page.next_cursor !== null && page.next_cursor === cursor || new Set(page.pins.map(pin => pin.pin_id)).size !== page.pins.length || page.pins.some(pin => pin.project_id !== project || !validPin(pin))) throw new Error("publication_list_binding_mismatch");
  return page;
}
