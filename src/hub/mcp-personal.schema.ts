import { z } from "zod"

export type McpPersonalOperation = "connectors" | "connector" | "connections" | "connection"
export const mcpPersonalIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}(?![\s\S])/u)
const cursor = z.string().regex(/^[A-Za-z0-9_-]{1,2048}(?![\s\S])/u)
const status = z.enum(["pending", "active", "error", "revoked"])
const unique = (values: string[]) => new Set(values).size === values.length
const connector = z.object({
  connector_id: mcpPersonalIdSchema,
  connector_type: z.enum(["builtin", "byok", "mcp"]),
  provider_key: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}(?![\s\S])/u),
  status,
  approved_scopes: z.array(z.string().min(1).max(128).regex(/^\S+(?![\s\S])/u)).refine(unique),
}).strict()
const connection = z.object({
  connection_id: mcpPersonalIdSchema,
  connector_id: mcpPersonalIdSchema,
  server_id: mcpPersonalIdSchema,
  allowed_selectors: z.array(z.string().min(1).max(256).regex(/^\S(?:[\s\S]*\S)?(?![\s\S])/u)).refine(unique),
  policy_digest: z.string().regex(/^[a-f0-9]{64}(?![\s\S])/u),
  status: z.enum(["active", "revoked"]),
}).strict()
export const mcpPersonalSchemas = {
  connectors: z.object({ data: z.object({ items: z.array(connector).max(100), next_cursor: cursor.nullable() }).strict() }).strict(),
  connector: z.object({ data: z.object({ connector }).strict() }).strict(),
  connections: z.object({ data: z.object({ items: z.array(connection).max(100), next_cursor: cursor.nullable() }).strict() }).strict(),
  connection: z.object({ data: z.object({ connection }).strict() }).strict(),
}
export const mcpPersonalErrors: Record<number, readonly string[]> = {
  400: ["invalid_mcp_personal_request"],
  401: ["session_authentication_required", "session_invalid"],
  403: ["service_auth_failed", "session_forbidden", "product_tenant_forbidden"],
  404: ["mcp_personal_not_found"],
  429: ["session_rate_limited"],
  502: ["mcp_personal_response_invalid"],
  503: ["product_tenant_not_configured", "iam_admission_unavailable", "mcp_personal_dependency_unavailable"],
}
export const mcpPersonalErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string().min(1), retryable: z.boolean() }).strict() }).strict()
export function mcpPersonalErrorAllowed(operation: McpPersonalOperation, httpStatus: number, value: unknown): boolean {
  const parsed = mcpPersonalErrorSchema.safeParse(value)
  return parsed.success && !(operation === "connectors" && httpStatus === 404)
    && (mcpPersonalErrors[httpStatus]?.includes(parsed.data.error.code) ?? false)
    && parsed.data.error.retryable === (httpStatus === 429 || httpStatus === 503)
}

export function mcpPersonalMatches(operation: McpPersonalOperation, value: unknown, id: string | undefined, query: URLSearchParams): boolean {
  if (operation === "connector") {
    const parsed = mcpPersonalSchemas.connector.safeParse(value)
    return parsed.success && parsed.data.data.connector.connector_id === id
  }
  if (operation === "connection") {
    const parsed = mcpPersonalSchemas.connection.safeParse(value)
    return parsed.success && parsed.data.data.connection.connection_id === id
  }
  if (operation === "connectors") {
    const parsed = mcpPersonalSchemas.connectors.safeParse(value)
    if (!parsed.success) return false
    const items = parsed.data.data.items
    return items.length <= Number(query.get("limit") ?? 50) && unique(items.map(item => item.connector_id))
      && items.every(item => !query.has("status") || item.status === query.get("status"))
  }
  const parsed = mcpPersonalSchemas.connections.safeParse(value)
  if (!parsed.success) return false
  const items = parsed.data.data.items
  return items.length <= Number(query.get("limit") ?? 50) && unique(items.map(item => item.connection_id)) && items.every(item => item.connector_id === id)
}
