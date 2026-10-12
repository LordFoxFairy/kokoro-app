import { z } from "zod"

import {
  mcpSelfConnectorSchema,
  mcpSelfConnectionSchema,
  mcpSelfErrorSchema,
  mcpSelfErrors,
  mcpSelfIdSchema,
  mcpSelfStateVersionSchema,
  type McpSelfConnector,
  type McpSelfConnection,
} from "./mcp-self.schema"

const unique = (values: string[]) => new Set(values).size === values.length
const opaqueCallbackValue = z.string().refine((value) =>
  !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)
  && value.length >= 1
  && value.length <= 4096,
)
const allowedSelector = z.string().min(1).max(256).regex(/^\S(?:[\s\S]*\S)?(?![\s\S])/u)
const authorizationUrl = z.string().max(4096).refine((value) => {
  try {
    const parsed = new URL(value)
    return parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.hash
  } catch {
    return false
  }
})

/** Owner-issued lifecycle commands, kept apart from connector CRUD. */
export type McpSelfAuthorizationOperation = "beginAuthorization" | "reconnectAuthorization" | "completeAuthorization" | "createConnection"

export const mcpSelfAuthorizationRequestSchema = z.object({
  server_id: mcpSelfIdSchema,
  expected_state_version: mcpSelfStateVersionSchema,
}).strict()
export type McpSelfAuthorizationInput = z.infer<typeof mcpSelfAuthorizationRequestSchema>

export const mcpSelfAuthorizationCallbackSchema = z.union([
  z.object({ state: opaqueCallbackValue, code: opaqueCallbackValue }).strict(),
  z.object({ state: opaqueCallbackValue, error: opaqueCallbackValue }).strict(),
])
export type McpSelfAuthorizationCallback = z.infer<typeof mcpSelfAuthorizationCallbackSchema>

export const mcpSelfCreateConnectionSchema = z.object({
  connector_id: mcpSelfIdSchema,
  server_id: mcpSelfIdSchema,
  allowed_selectors: z.array(allowedSelector).refine(unique),
  expected_state_version: mcpSelfStateVersionSchema,
}).strict()
export type McpSelfCreateConnectionInput = z.infer<typeof mcpSelfCreateConnectionSchema>

const authorizationSchema = z.object({
  authorization_id: mcpSelfIdSchema,
  authorization_url: authorizationUrl,
  expires_at: z.string().datetime({ offset: true }),
}).strict()
export type McpSelfAuthorization = z.infer<typeof authorizationSchema>

export const mcpSelfAuthorizationDataSchemas = {
  beginAuthorization: z.object({ authorization: authorizationSchema, connector: mcpSelfConnectorSchema }).strict(),
  reconnectAuthorization: z.object({ authorization: authorizationSchema, connector: mcpSelfConnectorSchema }).strict(),
  completeAuthorization: z.object({ connector: mcpSelfConnectorSchema }).strict(),
  createConnection: z.object({ connection: mcpSelfConnectionSchema }).strict(),
} as const
export type McpSelfAuthorizationStarted = z.infer<typeof mcpSelfAuthorizationDataSchemas.beginAuthorization>
export type McpSelfAuthorizationCompleted = z.infer<typeof mcpSelfAuthorizationDataSchemas.completeAuthorization>
export type McpSelfConnectionCreated = z.infer<typeof mcpSelfAuthorizationDataSchemas.createConnection>

const mcpSelfAuthorizationEnvelopeSchemas = {
  beginAuthorization: z.object({ data: mcpSelfAuthorizationDataSchemas.beginAuthorization }).strict(),
  reconnectAuthorization: z.object({ data: mcpSelfAuthorizationDataSchemas.reconnectAuthorization }).strict(),
  completeAuthorization: z.object({ data: mcpSelfAuthorizationDataSchemas.completeAuthorization }).strict(),
  createConnection: z.object({ data: mcpSelfAuthorizationDataSchemas.createConnection }).strict(),
} as const

export function mcpSelfAuthorizationErrorAllowed(httpStatus: number, value: unknown): boolean {
  const parsed = mcpSelfErrorSchema.safeParse(value)
  if (!parsed.success) return false
  return (mcpSelfErrors[httpStatus]?.includes(parsed.data.error.code) ?? false)
    && parsed.data.error.retryable === (httpStatus === 429 || httpStatus === 503 || httpStatus === 409 && parsed.data.error.code === "mcp_personal_command_in_progress")
}

export function mcpSelfAuthorizationMatches(
  operation: McpSelfAuthorizationOperation,
  value: unknown,
  connectorId: string | undefined,
  input: unknown,
): boolean {
  const parsed = mcpSelfAuthorizationEnvelopeSchemas[operation].safeParse(value)
  if (!parsed.success) return false
  if (operation === "completeAuthorization") return true
  if (!input || typeof input !== "object" || Array.isArray(input)) return false
  const command = input as Record<string, unknown>
  const data = parsed.data.data as {
    connector?: McpSelfConnector
    connection?: McpSelfConnection
  }
  if (operation === "createConnection") {
    const connection = data.connection
    const allowedSelectors = command.allowed_selectors
    if (connection === undefined || !Array.isArray(allowedSelectors)) return false
    return connection.connector_id === command.connector_id
      && connection.server_id === command.server_id
      && connection.allowed_selectors.length === allowedSelectors.length
      && connection.allowed_selectors.every((selector, index) => selector === allowedSelectors[index])
  }
  const connector = data.connector
  return connector !== undefined
    && connector.connector_id === connectorId
    && connector.state_version !== command.expected_state_version
}
