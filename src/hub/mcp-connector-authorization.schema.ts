import { z } from "zod"

import {
  mcpConnectorSchema,
  mcpConnectorConnectionSchema,
  mcpConnectorIdSchema,
  mcpConnectorStateVersionSchema,
  type McpConnector,
  type McpConnectorConnection,
} from "./mcp-connector.schema"

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
    const developmentLoopback =
      process.env.NODE_ENV !== "production" &&
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "[::1]")
    return (
      (parsed.protocol === "https:" || developmentLoopback) &&
      !parsed.username &&
      !parsed.password &&
      !parsed.hash
    )
  } catch {
    return false
  }
})

/** Owner-issued lifecycle commands, kept apart from connector CRUD. */
export type McpConnectorAuthorizationOperation = "beginAuthorization" | "reconnectAuthorization" | "completeAuthorization" | "createConnection"

export const mcpConnectorAuthorizationRequestSchema = z.object({
  server_id: mcpConnectorIdSchema,
  expected_state_version: mcpConnectorStateVersionSchema,
}).strict()
export type McpConnectorAuthorizationInput = z.infer<typeof mcpConnectorAuthorizationRequestSchema>

export const mcpConnectorAuthorizationCallbackSchema = z.union([
  z.object({ state: opaqueCallbackValue, code: opaqueCallbackValue }).strict(),
  z.object({ state: opaqueCallbackValue, error: opaqueCallbackValue }).strict(),
])
export type McpConnectorAuthorizationCallback = z.infer<typeof mcpConnectorAuthorizationCallbackSchema>

export const mcpConnectorCreateConnectionSchema = z.object({
  connector_id: mcpConnectorIdSchema,
  server_id: mcpConnectorIdSchema,
  allowed_selectors: z.array(allowedSelector).refine(unique),
  expected_state_version: mcpConnectorStateVersionSchema,
}).strict()
export type McpConnectorCreateConnectionInput = z.infer<typeof mcpConnectorCreateConnectionSchema>

const authorizationSchema = z.object({
  authorization_id: mcpConnectorIdSchema,
  authorization_url: authorizationUrl,
  expires_at: z.string().datetime({ offset: true }),
}).strict()
export type McpConnectorAuthorization = z.infer<typeof authorizationSchema>

export const mcpConnectorAuthorizationDataSchemas = {
  beginAuthorization: z.object({ authorization: authorizationSchema, connector: mcpConnectorSchema }).strict(),
  reconnectAuthorization: z.object({ authorization: authorizationSchema, connector: mcpConnectorSchema }).strict(),
  completeAuthorization: z.object({ connector: mcpConnectorSchema }).strict(),
  createConnection: z.object({ connection: mcpConnectorConnectionSchema }).strict(),
} as const
export type McpConnectorAuthorizationStarted = z.infer<typeof mcpConnectorAuthorizationDataSchemas.beginAuthorization>
export type McpConnectorAuthorizationCompleted = z.infer<typeof mcpConnectorAuthorizationDataSchemas.completeAuthorization>
export type McpConnectorConnectionCreated = z.infer<typeof mcpConnectorAuthorizationDataSchemas.createConnection>

const mcpConnectorAuthorizationEnvelopeSchemas = {
  beginAuthorization: z.object({ data: mcpConnectorAuthorizationDataSchemas.beginAuthorization }).strict(),
  reconnectAuthorization: z.object({ data: mcpConnectorAuthorizationDataSchemas.reconnectAuthorization }).strict(),
  completeAuthorization: z.object({ data: mcpConnectorAuthorizationDataSchemas.completeAuthorization }).strict(),
  createConnection: z.object({ data: mcpConnectorAuthorizationDataSchemas.createConnection }).strict(),
} as const

export function mcpConnectorAuthorizationMatches(
  operation: McpConnectorAuthorizationOperation,
  value: unknown,
  connectorId: string | undefined,
  input: unknown,
): boolean {
  const parsed = mcpConnectorAuthorizationEnvelopeSchemas[operation].safeParse(value)
  if (!parsed.success) return false
  if (operation === "completeAuthorization") return true
  if (!input || typeof input !== "object" || Array.isArray(input)) return false
  const command = input as Record<string, unknown>
  const data = parsed.data.data as {
    connector?: McpConnector
    connection?: McpConnectorConnection
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
