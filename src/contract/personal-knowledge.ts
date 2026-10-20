import { z } from "zod";

export const knowledgeIdSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
  );
export const knowledgeRevisionSchema = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER);
export const knowledgeText = (limit: number, required = true) =>
  z
    .string()
    .refine(
      (value) =>
        !value.includes("\u0000") &&
        !/[\uD800-\uDFFF]/u.test(value) &&
        [...value].length <= limit &&
        (!required || value.trim().length > 0),
    );
export const knowledgeFieldsSchema = z
  .object({
    name: knowledgeText(500),
    when_to_use: knowledgeText(500),
    content: knowledgeText(2000),
  })
  .strict();
export const knowledgeReplaceSchema = knowledgeFieldsSchema
  .extend({ expected_revision: knowledgeRevisionSchema })
  .strict();
export const knowledgeDeleteSchema = z
  .object({ expected_revision: knowledgeRevisionSchema.min(1) })
  .strict();
export const knowledgeUsageInputSchema = z
  .object({ expected_revision: knowledgeRevisionSchema, enabled: z.boolean() })
  .strict();
const instant = z.string().datetime();
export const knowledgeItemSchema = knowledgeFieldsSchema
  .extend({
    knowledge_id: knowledgeIdSchema,
    revision: knowledgeRevisionSchema.min(1),
    created_at: instant,
    updated_at: instant,
  })
  .strict()
  .refine(
    (value) => Date.parse(value.created_at) <= Date.parse(value.updated_at),
  );
export const knowledgeItemResponseSchema = z
  .object({ data: knowledgeItemSchema })
  .strict();
export const knowledgeListResponseSchema = z
  .object({
    data: z
      .object({
        items: z.array(knowledgeItemSchema).max(100),
        max_items: z.literal(100),
      })
      .strict(),
  })
  .strict()
  .refine(({ data }) => {
    if (
      new Set(data.items.map((item) => item.knowledge_id)).size !==
      data.items.length
    )
      return false;
    return data.items.every((item, i) => {
      if (i === 0) return true;
      const previous = data.items[i - 1]!;
      const delta =
        Date.parse(previous.created_at) - Date.parse(item.created_at);
      return (
        delta > 0 || (delta === 0 && previous.knowledge_id < item.knowledge_id)
      );
    });
  });
export const knowledgeUsageResponseSchema = z
  .object({
    data: z
      .object({ enabled: z.boolean(), revision: knowledgeRevisionSchema })
      .strict()
      .refine((value) => value.revision !== 0 || !value.enabled),
  })
  .strict();

const statuses: Readonly<Record<string, readonly number[]>> = {
  invalid_knowledge_request: [400],
  knowledge_not_found: [404],
  knowledge_revision_conflict: [409],
  knowledge_revision_exhausted: [409],
  knowledge_limit_exceeded: [409],
  knowledge_unavailable: [503],
  knowledge_save_unknown: [503],
  request_body_too_large: [413],
  method_not_allowed: [405],
  service_auth_failed: [401, 403],
  session_authentication_required: [401],
  session_invalid: [401],
  session_forbidden: [403],
  session_rate_limited: [429],
  product_tenant_not_configured: [503],
  product_tenant_forbidden: [403],
  iam_admission_unavailable: [503],
};
export const knowledgeErrorSchema = z
  .object({
    error: z
      .object({ code: z.string(), message: z.string(), retryable: z.boolean() })
      .strict(),
  })
  .strict();
export function knowledgeErrorAllowed(
  raw: unknown,
  status: number,
  method: string,
): boolean {
  const parsed = knowledgeErrorSchema.safeParse(raw);
  if (!parsed.success) return false;
  const { code, retryable } = parsed.data.error;
  return (
    statuses[code]?.includes(status) === true &&
    (code !== "knowledge_save_unknown" || (method !== "GET" && !retryable)) &&
    (code !== "knowledge_unavailable" || retryable === (method === "GET")) &&
    (![400, 404, 405, 409, 413].includes(status) || !retryable)
  );
}
export type KnowledgeWireItem = z.infer<typeof knowledgeItemSchema>;
export type KnowledgeWireFields = z.infer<typeof knowledgeFieldsSchema>;
export function knowledgeAckMatches(
  item: KnowledgeWireItem,
  id: string,
  input?: z.infer<typeof knowledgeReplaceSchema>,
): boolean {
  return (
    item.knowledge_id === id &&
    (input === undefined ||
      (Number.isSafeInteger(input.expected_revision + 1) &&
        item.revision === input.expected_revision + 1 &&
        item.name === input.name &&
        item.when_to_use === input.when_to_use &&
        item.content === input.content))
  );
}

/** Reject duplicate decoded keys at every object level without recursive descent. */
export function parseKnowledgeResponseJson(text: string): unknown {
  const raw: unknown = JSON.parse(text);
  const tokens =
    text.match(/"(?:[^"\\]|\\[\s\S])*"|[{}\[\]:,]|[^\s{}\[\]:,]+/gu) ?? [];
  if (tokens[0] !== "{") throw new SyntaxError("Knowledge object required");
  const objects: Set<string>[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "{") objects.push(new Set());
    else if (tokens[i] === "}") objects.pop();
    else if (tokens[i + 1] === ":") {
      const key = JSON.parse(tokens[i]!) as string;
      const keys = objects.at(-1)!;
      if (keys.has(key)) throw new SyntaxError("Duplicate knowledge key");
      keys.add(key);
    }
  }
  return raw;
}
/** Knowledge commands are flat objects; nested values are never command fields. */
export function parseKnowledgeJson(text: string): unknown {
  const raw = parseKnowledgeResponseJson(text);
  if (
    Object.values(raw as Record<string, unknown>).some(
      (value) => typeof value === "object" && value !== null,
    )
  )
    throw new SyntaxError("Nested knowledge input");
  return raw;
}
