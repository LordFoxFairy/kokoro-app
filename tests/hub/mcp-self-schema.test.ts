import { describe, expect, it } from "vitest"
import { parseMcpSelfJson } from "@/hub/mcp-self-json"
import { mcpSelfSchemas, mcpSelfMatches, mcpSelfErrorAllowed } from "@/hub/mcp-self.schema"

const connector = { connector_id: "connector-1", connector_type: "mcp", provider_key: "provider-one", status: "active", approved_scopes: ["tools.read"], enabled: true, state_version: "2" }
const connection = { connection_id: "connection-1", connector_id: "connector-1", server_id: "server-1", allowed_selectors: ["tool:read"], policy_digest: "a".repeat(64), status: "active" }
describe("current-user MCP strict owner wire", () => {
  it("accepts four exact shapes and independently binds list/detail resources", () => {
    expect(mcpSelfMatches("connectors", { data: { items: [connector], next_cursor: null } }, undefined, new URLSearchParams("status=active&limit=1"))).toBe(true)
    expect(mcpSelfMatches("connector", { data: { connector } }, "connector-1", new URLSearchParams())).toBe(true)
    expect(mcpSelfMatches("connections", { data: { items: [connection], next_cursor: "opaque_cursor" } }, "connector-1", new URLSearchParams())).toBe(true)
    expect(mcpSelfMatches("connection", { data: { connection } }, "connection-1", new URLSearchParams())).toBe(true)
    expect(mcpSelfMatches("connector", { data: { connector } }, "another", new URLSearchParams())).toBe(false)
    expect(mcpSelfMatches("connection", { data: { connection } }, "another", new URLSearchParams())).toBe(false)
    expect(mcpSelfMatches("connections", { data: { items: [connection], next_cursor: null } }, "another", new URLSearchParams())).toBe(false)
  })
  it("rejects absent, extra, malformed and duplicate fields without active-page fallback", () => {
    for (const field of Object.keys(connector)) {
      const value: Record<string, unknown> = { ...connector }; delete value[field]
      expect(mcpSelfSchemas.connector.safeParse({ data: { connector: value } }).success).toBe(false)
    }
    for (const field of Object.keys(connection)) {
      const value: Record<string, unknown> = { ...connection }; delete value[field]
      expect(mcpSelfSchemas.connection.safeParse({ data: { connection: value } }).success).toBe(false)
    }
    for (const value of [{ ...connector, secret: "no" }, { ...connector, connector_id: "id\n" }, { ...connector, approved_scopes: ["tools.read", "tools.read"] }, { ...connector, approved_scopes: ["tools.read\n"] }, { ...connector, provider_key: "UPPER" }]) {
      expect(mcpSelfSchemas.connector.safeParse({ data: { connector: value } }).success).toBe(false)
    }
    for (const value of [{ ...connection, enabled: true }, { ...connection, status: "pending" }, { ...connection, policy_digest: "A".repeat(64) }, { ...connection, allowed_selectors: ["read "] }, { ...connection, allowed_selectors: ["read", "read"] }]) {
      expect(mcpSelfSchemas.connection.safeParse({ data: { connection: value } }).success).toBe(false)
    }
    expect(mcpSelfSchemas.connections.safeParse({ data: { connections: [connection], next_cursor: null } }).success).toBe(false)
    expect(mcpSelfSchemas.connectors.safeParse({ data: { items: [], next_cursor: "" } }).success).toBe(false)
  })
  it("keeps UTF16 boundaries, opaque cursor, unique IDs, filters and requested page size", () => {
    const valid = { ...connector, approved_scopes: ["😀".repeat(64)] }
    expect(mcpSelfSchemas.connector.safeParse({ data: { connector: valid } }).success).toBe(true)
    expect(mcpSelfSchemas.connector.safeParse({ data: { connector: { ...valid, approved_scopes: ["😀".repeat(65)] } } }).success).toBe(false)
    expect(mcpSelfSchemas.connection.safeParse({ data: { connection: { ...connection, allowed_selectors: ["read internal whitespace"] } } }).success).toBe(true)
    expect(mcpSelfMatches("connectors", { data: { items: [connector, connector], next_cursor: null } }, undefined, new URLSearchParams())).toBe(false)
    expect(mcpSelfMatches("connectors", { data: { items: [connector], next_cursor: null } }, undefined, new URLSearchParams("status=pending"))).toBe(false)
    expect(mcpSelfMatches("connections", { data: { items: [connection, { ...connection, connection_id: "connection-2" }], next_cursor: null } }, "connector-1", new URLSearchParams("limit=1"))).toBe(false)
  })
  it("uses per-status code/retryable rules and excludes list connector 404", () => {
    const error = (code: string, retryable = false) => ({ error: { code, message: "safe", retryable } })
    expect(mcpSelfErrorAllowed("connector", 404, error("mcp_personal_not_found"))).toBe(true)
    expect(mcpSelfErrorAllowed("connectors", 404, error("mcp_personal_not_found"))).toBe(false)
    expect(mcpSelfErrorAllowed("connections", 404, error("mcp_personal_not_found"))).toBe(true)
    expect(mcpSelfErrorAllowed("connection", 429, error("session_rate_limited", true))).toBe(true)
    expect(mcpSelfErrorAllowed("connection", 503, error("mcp_personal_dependency_unavailable", true))).toBe(true)
    for (const [httpStatus, value] of [[400, error("session_invalid")], [503, error("mcp_personal_dependency_unavailable")], [401, error("session_invalid", true)], [502, error("skill_response_invalid")], [404, { ...error("mcp_personal_not_found"), meta: {} }]] as const) {
      expect(mcpSelfErrorAllowed("connection", httpStatus, value)).toBe(false)
    }
  })
})

describe("current-user MCP 14.0 commands and provider directory", () => {
  const managed = { ...connector, display_name: "Connector", description: "", enabled: false, state_version: "1", status: "pending" as const }
  const provider = { provider_key: "provider-one", display_name: "Provider", directory_type: "app" as const, category_keys: ["development"], example_prompts: ["Help"], enabled: true, state_version: "2" }
  it("binds actual provider directory and closed command acknowledgements", () => {
    expect(mcpSelfMatches("providers", { data: { items: [provider], next_cursor: null } }, undefined, new URLSearchParams("directory_type=app&category_key=development"))).toBe(true)
    expect(mcpSelfMatches("provider", { data: { provider } }, "provider-one", new URLSearchParams())).toBe(true)
    const create = { provider_key: "provider-one", connector_type: "mcp", display_name: "Connector", description: "" }
    expect(mcpSelfMatches("create", { data: { connector: managed } }, undefined, new URLSearchParams(), create)).toBe(true)
    expect(mcpSelfMatches("create", { data: { connector: { ...managed, enabled: true } } }, undefined, new URLSearchParams(), create)).toBe(false)
    expect(mcpSelfMatches("update", { data: { connector: { ...managed, connector_id: "connector-1", state_version: "2", display_name: "Renamed" } } }, "connector-1", new URLSearchParams(), { display_name: "Renamed", description: "", expected_state_version: "1" })).toBe(true)
    expect(mcpSelfMatches("enabled", { data: { connector: { ...managed, connector_id: "connector-1", enabled: true, state_version: "2", status: "active" } } }, "connector-1", new URLSearchParams(), { enabled: true, expected_state_version: "1" })).toBe(true)
    expect(mcpSelfMatches("remove", { data: { connector: { ...managed, connector_id: "connector-1", state_version: "2", status: "revoked" } } }, "connector-1", new URLSearchParams(), { expected_state_version: "1" })).toBe(true)
  })
  it("keeps command-only error states closed and retryable only when owner says in-progress", () => {
    const error = (code: string, retryable: boolean) => ({ error: { code, message: "safe", retryable } })
    expect(mcpSelfErrorAllowed("create", 409, error("mcp_personal_idempotency_conflict", false))).toBe(true)
    expect(mcpSelfErrorAllowed("create", 409, error("mcp_personal_command_in_progress", true))).toBe(true)
    expect(mcpSelfErrorAllowed("create", 412, error("mcp_personal_precondition_failed", false))).toBe(true)
    expect(mcpSelfErrorAllowed("create", 409, error("mcp_personal_idempotency_conflict", true))).toBe(false)
  })
  it("preserves duplicate-key evidence before command schemas run", () => {
    expect(() => parseMcpSelfJson('{"provider_key":"first","provider_key":"second"}')).toThrow(SyntaxError)
    expect(parseMcpSelfJson('{"provider_key":"github"}')).toEqual({ provider_key: "github" })
  })
})

import {
  mcpSelfAuthorizationCallbackSchema,
  mcpSelfAuthorizationMatches,
  mcpSelfCreateConnectionSchema,
} from "@/hub/mcp-self-authorization.schema"

describe("current-user MCP authorization lifecycle wire", () => {
  const authorization = {
    authorization_id: "authorization-1",
    authorization_url: "https://oauth.example.test/authorize?state=opaque",
    expires_at: "2027-01-15T08:00:00.000Z",
  }

  it("accepts the exact BFF envelope and binds authorization/connection effects", () => {
    expect(mcpSelfAuthorizationMatches(
      "beginAuthorization",
      { data: { authorization, connector: { ...connector, state_version: "2" } } },
      "connector-1",
      { server_id: "server-1", expected_state_version: "1" },
    )).toBe(true)
    expect(mcpSelfAuthorizationMatches(
      "createConnection",
      { data: { connection } },
      undefined,
      { connector_id: "connector-1", server_id: "server-1", allowed_selectors: ["tool:read"], expected_state_version: "2" },
    )).toBe(true)
    expect(mcpSelfAuthorizationMatches(
      "completeAuthorization",
      { data: { connector: { ...connector, status: "active", state_version: "3" } } },
      undefined,
      { state: "opaque", code: "code" },
    )).toBe(true)
  })

  it("enforces callback XOR and owner-equivalent UTF-16 boundaries", () => {
    expect(mcpSelfAuthorizationCallbackSchema.safeParse({ state: "opaque", code: "code" }).success).toBe(true)
    expect(mcpSelfAuthorizationCallbackSchema.safeParse({ state: "opaque", error: "access_denied" }).success).toBe(true)
    expect(mcpSelfAuthorizationCallbackSchema.safeParse({ state: "opaque", code: "code", error: "access_denied" }).success).toBe(false)
    expect(mcpSelfAuthorizationCallbackSchema.safeParse({ state: "😀".repeat(2048), code: "code" }).success).toBe(true)
    expect(mcpSelfAuthorizationCallbackSchema.safeParse({ state: "😀".repeat(2049), code: "code" }).success).toBe(false)
    expect(mcpSelfCreateConnectionSchema.safeParse({ connector_id: "connector-1", server_id: "server-1", allowed_selectors: ["tool:read", "tool:read"], expected_state_version: "2" }).success).toBe(false)
  })
})
