import {
  knowledgeIdSchema,
  knowledgeRevisionSchema,
  knowledgeText,
  knowledgeReplaceSchema,
  knowledgeDeleteSchema,
  knowledgeUsageInputSchema,
  knowledgeItemResponseSchema,
  knowledgeListResponseSchema,
  knowledgeUsageResponseSchema,
  knowledgeErrorSchema,
  knowledgeErrorAllowed,
  knowledgeAckMatches,
  parseKnowledgeResponseJson,
  type KnowledgeWireItem,
} from "@/contract/personal-knowledge";

export type KnowledgeFields = Readonly<{
  name: string;
  whenToUse: string;
  content: string;
}>;
export type KnowledgeItem = KnowledgeFields &
  Readonly<{
    knowledgeId: string;
    revision: number;
    createdAt: string;
    updatedAt: string;
  }>;
export type KnowledgeUsage = Readonly<{ enabled: boolean; revision: number }>;
export class KnowledgeClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "KnowledgeClientError";
  }
}
const endpoint = "/api/hub/preferences/knowledge";
const invalid = () =>
  new KnowledgeClientError(
    "Invalid knowledge input",
    0,
    "invalid_knowledge_input",
  );
const badResponse = (status: number) =>
  new KnowledgeClientError("Invalid knowledge response", status);
const model = (item: KnowledgeWireItem): KnowledgeItem => ({
  knowledgeId: item.knowledge_id,
  name: item.name,
  whenToUse: item.when_to_use,
  content: item.content,
  revision: item.revision,
  createdAt: item.created_at,
  updatedAt: item.updated_at,
});
async function call(
  url: string,
  method: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    ...(signal ? { signal } : {}),
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (response.ok) return response;
  const raw: unknown = await json(response).catch(() => null);
  const parsed = knowledgeErrorSchema.safeParse(raw);
  // Same-origin adapter faults do not impersonate a business receipt.
  const localCodes = [
    "knowledge_response_invalid",
    "knowledge_dependency_unavailable",
    "knowledge_deadline_exceeded",
  ];
  if (
    parsed.success &&
    (knowledgeErrorAllowed(raw, response.status, method) ||
      (localCodes.includes(parsed.data.error.code) &&
        [502, 503, 504].includes(response.status)))
  )
    throw new KnowledgeClientError(
      parsed.data.error.message,
      response.status,
      parsed.data.error.code,
    );
  throw badResponse(response.status);
}
async function json(response: Response): Promise<unknown> {
  try {
    return parseKnowledgeResponseJson(await response.text());
  } catch {
    throw badResponse(response.status);
  }
}
export async function listKnowledge(
  query = "",
  signal?: AbortSignal,
): Promise<{ items: KnowledgeItem[]; maxItems: 100 }> {
  if (!knowledgeText(500, false).safeParse(query).success) throw invalid();
  const response = await call(
    `${endpoint}${query === "" ? "" : `?${new URLSearchParams({ query })}`}`,
    "GET",
    undefined,
    signal,
  );
  const parsed = knowledgeListResponseSchema.safeParse(await json(response));
  if (response.status !== 200 || !parsed.success)
    throw badResponse(response.status);
  return { items: parsed.data.data.items.map(model), maxItems: 100 };
}
export async function getKnowledge(
  id: string,
  signal?: AbortSignal,
): Promise<KnowledgeItem> {
  if (!knowledgeIdSchema.safeParse(id).success) throw invalid();
  const response = await call(`${endpoint}/${id}`, "GET", undefined, signal);
  const parsed = knowledgeItemResponseSchema.safeParse(await json(response));
  if (
    response.status !== 200 ||
    !parsed.success ||
    !knowledgeAckMatches(parsed.data.data, id)
  )
    throw badResponse(response.status);
  return model(parsed.data.data);
}
export async function replaceKnowledge(
  id: string,
  fields: KnowledgeFields,
  revision: number,
  signal?: AbortSignal,
): Promise<KnowledgeItem> {
  const input = knowledgeReplaceSchema.safeParse({
    name: fields.name,
    when_to_use: fields.whenToUse,
    content: fields.content,
    expected_revision: revision,
  });
  if (!knowledgeIdSchema.safeParse(id).success || !input.success)
    throw invalid();
  const response = await call(`${endpoint}/${id}`, "PUT", input.data, signal);
  const parsed = knowledgeItemResponseSchema.safeParse(await json(response));
  if (
    response.status !== (revision === 0 ? 201 : 200) ||
    !parsed.success ||
    !knowledgeAckMatches(parsed.data.data, id, input.data)
  )
    throw badResponse(response.status);
  return model(parsed.data.data);
}
export async function removeKnowledge(
  id: string,
  revision: number,
  signal?: AbortSignal,
): Promise<void> {
  const input = knowledgeDeleteSchema.safeParse({
    expected_revision: revision,
  });
  if (!knowledgeIdSchema.safeParse(id).success || !input.success)
    throw invalid();
  const response = await call(
    `${endpoint}/${id}`,
    "DELETE",
    input.data,
    signal,
  );
  if (response.status !== 204 || (await response.text()) !== "")
    throw badResponse(response.status);
}
export async function readKnowledgeUsage(
  signal?: AbortSignal,
): Promise<KnowledgeUsage> {
  const response = await call(`${endpoint}-usage`, "GET", undefined, signal);
  const parsed = knowledgeUsageResponseSchema.safeParse(await json(response));
  if (response.status !== 200 || !parsed.success)
    throw badResponse(response.status);
  return parsed.data.data;
}
export async function replaceKnowledgeUsage(
  enabled: boolean,
  revision: number,
  signal?: AbortSignal,
): Promise<KnowledgeUsage> {
  const input = knowledgeUsageInputSchema.safeParse({
    expected_revision: revision,
    enabled,
  });
  if (!input.success || !knowledgeRevisionSchema.safeParse(revision).success)
    throw invalid();
  const response = await call(`${endpoint}-usage`, "PUT", input.data, signal);
  const parsed = knowledgeUsageResponseSchema.safeParse(await json(response));
  if (
    response.status !== 200 ||
    !parsed.success ||
    parsed.data.data.revision !== revision + 1 ||
    parsed.data.data.enabled !== enabled
  )
    throw badResponse(response.status);
  return parsed.data.data;
}
