import { z } from "zod"

export type McpConnectorReadOperation = "connectors" | "connector" | "connections" | "connection" | "providers" | "provider"
export type McpConnectorCommandOperation = "create" | "update" | "enabled" | "remove"
export type McpConnectorOperation = McpConnectorReadOperation | McpConnectorCommandOperation
export type McpPrivateServerOperation = "registerServer" | "server"
export const mcpConnectorIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}(?![\s\S])/u)
const providerKey = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}(?![\s\S])/u)
const cursor = z.string().regex(/^[A-Za-z0-9_-]{1,2048}(?![\s\S])/u)
export const mcpConnectorStateVersionSchema = z.string().regex(/^[1-9][0-9]{0,15}(?![\s\S])/u).refine(value => BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER))
const scalar = (min: number, max: number) => z.string().refine(value => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value) && [...value].length >= min && [...value].length <= max && (min === 0 || Boolean(value.trim())))
const status = z.enum(["pending", "active", "error", "revoked"])
const unique = (values: string[]) => new Set(values).size === values.length
const safeUrl = z.string().max(2048).refine(value => { try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password } catch { return false } })
export const mcpConnectorSchema = z.object({
  connector_id: mcpConnectorIdSchema,
  connector_type: z.enum(["builtin", "byok", "mcp"]),
  provider_key: providerKey,
  status,
  approved_scopes: z.array(z.string().min(1).max(128).regex(/^\S+(?![\s\S])/u)).refine(unique),
  enabled: z.boolean(),
  state_version: mcpConnectorStateVersionSchema,
  server_id: mcpConnectorIdSchema.optional(),
  display_name: scalar(1, 100).optional(),
  description: scalar(0, 1000).optional(),
  created_at: z.string().datetime({ offset: true }).optional(),
  updated_at: z.string().datetime({ offset: true }).optional(),
}).strict()
export type McpConnector = z.infer<typeof mcpConnectorSchema>

const privateServerUrl = z.string().max(2048).refine((value) => {
  if (value.trim() !== value) return false
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password && !url.hash && url.toString() === value
  } catch { return false }
})
export const mcpPrivateServerSchema = z.object({ server_id: mcpConnectorIdSchema, display_name: scalar(1, 100), server_url: privateServerUrl, status: z.enum(["pending", "registered", "disabled"]), state_version: mcpConnectorStateVersionSchema }).strict()
export const mcpPrivateServerRegistrationInputSchema = z.object({ display_name: scalar(1, 100), server_url: privateServerUrl }).strict()
export const mcpPrivateServerRegistrationSchema = z.object({ server: mcpPrivateServerSchema, connector: mcpConnectorSchema }).strict()
export type McpPrivateServer = z.infer<typeof mcpPrivateServerSchema>
export type McpPrivateServerRegistrationInput = z.infer<typeof mcpPrivateServerRegistrationInputSchema>
export type McpPrivateServerRegistration = z.infer<typeof mcpPrivateServerRegistrationSchema>
export function mcpPrivateServerMatches(operation: McpPrivateServerOperation, value: unknown, serverId: string | undefined, input?: unknown): boolean {
  if (operation === "server") return z.object({ data: z.object({ server: mcpPrivateServerSchema }).strict() }).strict().safeParse(value).data?.data.server.server_id === serverId
  const parsed = z.object({ data: mcpPrivateServerRegistrationSchema }).strict().safeParse(value)
  if (!parsed.success || input === undefined || typeof input !== "object" || Array.isArray(input)) return false
  const command = input as Record<string, unknown>
  const { server, connector } = parsed.data.data
  const expectedConnectorStatus = server.status === "pending" ? "pending" : server.status === "registered" ? "active" : undefined
  return server.display_name === command.display_name && server.server_url === command.server_url && connector.server_id === server.server_id && connector.status === expectedConnectorStatus && !connector.enabled
}

export const mcpConnectorConnectionSchema = z.object({
  connection_id: mcpConnectorIdSchema,
  connector_id: mcpConnectorIdSchema,
  server_id: mcpConnectorIdSchema,
  allowed_selectors: z.array(z.string().min(1).max(256).regex(/^\S(?:[\s\S]*\S)?(?![\s\S])/u)).refine(unique),
  policy_digest: z.string().regex(/^[a-f0-9]{64}(?![\s\S])/u),
  status: z.enum(["active", "revoked"]),
}).strict()
export type McpConnectorConnection = z.infer<typeof mcpConnectorConnectionSchema>

const category = z.enum(["efficiency", "creation", "business", "development", "finance", "travel", "health"])
export const mcpConnectorProviderSchema = z.object({
  provider_key: providerKey, display_name: scalar(1, 100), description: scalar(0, 1000).optional(), directory_type: z.enum(["app", "data_source"]),
  category_keys: z.array(category).refine(unique), example_prompts: z.array(scalar(1, 1000)).max(10), author: scalar(1, 100).optional(), website: safeUrl.optional(), privacy_url: safeUrl.optional(), cover_image_url: safeUrl.optional(), updated_at: z.string().datetime({ offset: true }).optional(), connection_server_id: mcpConnectorIdSchema.optional(), enabled: z.boolean(), state_version: mcpConnectorStateVersionSchema,
}).strict()
export type McpConnectorProvider = z.infer<typeof mcpConnectorProviderSchema>

const page = <T extends z.ZodTypeAny>(item: T) => z.object({ items: z.array(item).max(100), next_cursor: cursor.nullable() }).strict()
export const mcpConnectorPageSchema = page(mcpConnectorSchema)
export const mcpConnectorConnectionPageSchema = page(mcpConnectorConnectionSchema)
export const mcpConnectorProviderPageSchema = page(mcpConnectorProviderSchema)
export type McpConnectorPage = z.infer<typeof mcpConnectorPageSchema>
export type McpConnectorConnectionPage = z.infer<typeof mcpConnectorConnectionPageSchema>
export type McpConnectorProviderPage = z.infer<typeof mcpConnectorProviderPageSchema>
export const mcpConnectorSchemas = {
  connectors: z.object({ data: mcpConnectorPageSchema }).strict(), connector: z.object({ data: z.object({ connector: mcpConnectorSchema }).strict() }).strict(),
  connections: z.object({ data: mcpConnectorConnectionPageSchema }).strict(), connection: z.object({ data: z.object({ connection: mcpConnectorConnectionSchema }).strict() }).strict(),
  providers: z.object({ data: mcpConnectorProviderPageSchema }).strict(), provider: z.object({ data: z.object({ provider: mcpConnectorProviderSchema }).strict() }).strict(),
  create: z.object({ data: z.object({ connector: mcpConnectorSchema }).strict() }).strict(), update: z.object({ data: z.object({ connector: mcpConnectorSchema }).strict() }).strict(), enabled: z.object({ data: z.object({ connector: mcpConnectorSchema }).strict() }).strict(), remove: z.object({ data: z.object({ connector: mcpConnectorSchema }).strict() }).strict(),
}
export const mcpConnectorCommandRequestSchemas = {
  create: z.object({ provider_key: providerKey, connector_type: z.enum(["builtin", "byok", "mcp"]), display_name: scalar(1, 100), description: scalar(0, 1000) }).strict(),
  update: z.object({ display_name: scalar(1, 100), description: scalar(0, 1000), expected_state_version: mcpConnectorStateVersionSchema }).strict(),
  enabled: z.object({ enabled: z.boolean(), expected_state_version: mcpConnectorStateVersionSchema }).strict(),
  remove: z.object({ expected_state_version: mcpConnectorStateVersionSchema }).strict(),
}
export type McpConnectorCreateInput = z.infer<typeof mcpConnectorCommandRequestSchemas.create>
export type McpConnectorUpdateInput = z.infer<typeof mcpConnectorCommandRequestSchemas.update>
export type McpConnectorEnabledInput = z.infer<typeof mcpConnectorCommandRequestSchemas.enabled>
export type McpConnectorRemoveInput = z.infer<typeof mcpConnectorCommandRequestSchemas.remove>
export const mcpConnectorErrors: Record<number, readonly string[]> = {
  400: ["invalid_mcp_personal_request"], 401: ["session_authentication_required", "session_invalid"], 403: ["service_auth_failed", "session_forbidden", "product_tenant_forbidden"], 404: ["mcp_personal_not_found"],
  409: ["mcp_personal_idempotency_conflict", "mcp_personal_command_in_progress"], 412: ["mcp_personal_precondition_failed"], 413: ["mcp_personal_body_too_large"], 429: ["session_rate_limited"], 502: ["mcp_personal_response_invalid"], 503: ["product_tenant_not_configured", "iam_admission_unavailable", "mcp_personal_dependency_unavailable"],
}
export const mcpConnectorErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string().min(1), retryable: z.boolean() }).strict() }).strict()
export function mcpConnectorErrorAllowed(operation: McpConnectorOperation, httpStatus: number, value: unknown): boolean {
  const parsed = mcpConnectorErrorSchema.safeParse(value)
  if (!parsed.success || ((operation === "connectors" || operation === "providers") && httpStatus === 404)) return false
  return (mcpConnectorErrors[httpStatus]?.includes(parsed.data.error.code) ?? false) && parsed.data.error.retryable === (httpStatus === 429 || httpStatus === 503 || httpStatus === 409 && parsed.data.error.code === "mcp_personal_command_in_progress")
}
export function mcpConnectorMatches(operation: McpConnectorOperation, value: unknown, id: string | undefined, query: URLSearchParams, input?: unknown): boolean {
  const parsed = mcpConnectorSchemas[operation].safeParse(value)
  if (!parsed.success) return false
  const data = parsed.data.data as unknown as { connector?: Record<string, unknown>; connection?: Record<string, unknown>; provider?: Record<string, unknown>; items?: Array<Record<string, unknown>> }
  if (operation === "connector") return data.connector?.connector_id === id
  if (operation === "connection") return data.connection?.connection_id === id
  if (operation === "provider") return data.provider?.provider_key === id
  if (operation === "connectors" || operation === "connections" || operation === "providers") {
    const items = data.items ?? []
    const identity = operation === "connections" ? "connection_id" : operation === "connectors" ? "connector_id" : "provider_key"
    const keys = items.map(item => item[identity])
    return keys.every((key): key is string => typeof key === "string") && items.length <= Number(query.get("limit") ?? 50) && unique(keys)
      && (operation !== "connectors" || !query.has("status") || items.every(item => item.status === query.get("status")))
      && (operation !== "connections" || items.every(item => item.connector_id === id))
      && (operation !== "providers" || !query.has("directory_type") || items.every(item => item.directory_type === query.get("directory_type")))
      && (operation !== "providers" || !query.has("category_key") || items.every(item => Array.isArray(item.category_keys) && item.category_keys.includes(query.get("category_key"))))
  }
  const result = data.connector
  if (!result || !input || typeof input !== "object" || Array.isArray(input)) return false
  const body = input as Record<string, unknown>
  if (operation === "create") return result.provider_key === body.provider_key && result.connector_type === body.connector_type && result.display_name === body.display_name && result.description === body.description && result.enabled === false && result.state_version === "1" && (result.status === "pending" || result.status === "active")
  if (result.connector_id !== id) return false
  if (operation === "update") return result.display_name === body.display_name && result.description === body.description && result.status !== "revoked"
  if (operation === "enabled") return result.enabled === body.enabled && result.status !== "revoked"
  return result.enabled === false && result.status === "revoked"
}
