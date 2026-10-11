import { describe, expect, it } from "vitest"
import { parseMcpPersonalCommandJson } from "@/hub/mcp-personal-command"
import { mcpPersonalSchemas, mcpPersonalMatches, mcpPersonalErrorAllowed } from "@/hub/mcp-personal.schema"

const connector = { connector_id: "connector-1", connector_type: "mcp", provider_key: "provider-one", status: "active", approved_scopes: ["tools.read"], enabled: true, state_version: "2" }
const connection = { connection_id: "connection-1", connector_id: "connector-1", server_id: "server-1", allowed_selectors: ["tool:read"], policy_digest: "a".repeat(64), status: "active" }
describe("personal MCP strict owner wire", () => {
  it("accepts four exact shapes and independently binds list/detail resources", () => {
    expect(mcpPersonalMatches("connectors", { data: { items: [connector], next_cursor: null } }, undefined, new URLSearchParams("status=active&limit=1"))).toBe(true)
    expect(mcpPersonalMatches("connector", { data: { connector } }, "connector-1", new URLSearchParams())).toBe(true)
    expect(mcpPersonalMatches("connections", { data: { items: [connection], next_cursor: "opaque_cursor" } }, "connector-1", new URLSearchParams())).toBe(true)
    expect(mcpPersonalMatches("connection", { data: { connection } }, "connection-1", new URLSearchParams())).toBe(true)
    expect(mcpPersonalMatches("connector", { data: { connector } }, "another", new URLSearchParams())).toBe(false)
    expect(mcpPersonalMatches("connection", { data: { connection } }, "another", new URLSearchParams())).toBe(false)
    expect(mcpPersonalMatches("connections", { data: { items: [connection], next_cursor: null } }, "another", new URLSearchParams())).toBe(false)
  })
  it("rejects absent, extra, malformed and duplicate fields without active-page fallback", () => {
    for (const field of Object.keys(connector)) {
      const value: Record<string, unknown> = { ...connector }; delete value[field]
      expect(mcpPersonalSchemas.connector.safeParse({ data: { connector: value } }).success).toBe(false)
    }
    for (const field of Object.keys(connection)) {
      const value: Record<string, unknown> = { ...connection }; delete value[field]
      expect(mcpPersonalSchemas.connection.safeParse({ data: { connection: value } }).success).toBe(false)
    }
    for (const value of [{ ...connector, secret: "no" }, { ...connector, connector_id: "id\n" }, { ...connector, approved_scopes: ["tools.read", "tools.read"] }, { ...connector, approved_scopes: ["tools.read\n"] }, { ...connector, provider_key: "UPPER" }]) {
      expect(mcpPersonalSchemas.connector.safeParse({ data: { connector: value } }).success).toBe(false)
    }
    for (const value of [{ ...connection, enabled: true }, { ...connection, status: "pending" }, { ...connection, policy_digest: "A".repeat(64) }, { ...connection, allowed_selectors: ["read "] }, { ...connection, allowed_selectors: ["read", "read"] }]) {
      expect(mcpPersonalSchemas.connection.safeParse({ data: { connection: value } }).success).toBe(false)
    }
    expect(mcpPersonalSchemas.connections.safeParse({ data: { connections: [connection], next_cursor: null } }).success).toBe(false)
    expect(mcpPersonalSchemas.connectors.safeParse({ data: { items: [], next_cursor: "" } }).success).toBe(false)
  })
  it("keeps UTF16 boundaries, opaque cursor, unique IDs, filters and requested page size", () => {
    const valid = { ...connector, approved_scopes: ["😀".repeat(64)] }
    expect(mcpPersonalSchemas.connector.safeParse({ data: { connector: valid } }).success).toBe(true)
    expect(mcpPersonalSchemas.connector.safeParse({ data: { connector: { ...valid, approved_scopes: ["😀".repeat(65)] } } }).success).toBe(false)
    expect(mcpPersonalSchemas.connection.safeParse({ data: { connection: { ...connection, allowed_selectors: ["read internal whitespace"] } } }).success).toBe(true)
    expect(mcpPersonalMatches("connectors", { data: { items: [connector, connector], next_cursor: null } }, undefined, new URLSearchParams())).toBe(false)
    expect(mcpPersonalMatches("connectors", { data: { items: [connector], next_cursor: null } }, undefined, new URLSearchParams("status=pending"))).toBe(false)
    expect(mcpPersonalMatches("connections", { data: { items: [connection, { ...connection, connection_id: "connection-2" }], next_cursor: null } }, "connector-1", new URLSearchParams("limit=1"))).toBe(false)
  })
  it("uses per-status code/retryable rules and excludes list connector 404", () => {
    const error = (code: string, retryable = false) => ({ error: { code, message: "safe", retryable } })
    expect(mcpPersonalErrorAllowed("connector", 404, error("mcp_personal_not_found"))).toBe(true)
    expect(mcpPersonalErrorAllowed("connectors", 404, error("mcp_personal_not_found"))).toBe(false)
    expect(mcpPersonalErrorAllowed("connections", 404, error("mcp_personal_not_found"))).toBe(true)
    expect(mcpPersonalErrorAllowed("connection", 429, error("session_rate_limited", true))).toBe(true)
    expect(mcpPersonalErrorAllowed("connection", 503, error("mcp_personal_dependency_unavailable", true))).toBe(true)
    for (const [httpStatus, value] of [[400, error("session_invalid")], [503, error("mcp_personal_dependency_unavailable")], [401, error("session_invalid", true)], [502, error("skill_response_invalid")], [404, { ...error("mcp_personal_not_found"), meta: {} }]] as const) {
      expect(mcpPersonalErrorAllowed("connection", httpStatus, value)).toBe(false)
    }
  })
})

describe("personal MCP 14.0 commands and provider directory", () => {
  const managed = { ...connector, display_name: "Connector", description: "", enabled: false, state_version: "1", status: "pending" as const }
  const provider = { provider_key: "provider-one", display_name: "Provider", directory_type: "app" as const, category_keys: ["development"], example_prompts: ["Help"], enabled: true, state_version: "2" }
  it("binds actual provider directory and closed command acknowledgements", () => {
    expect(mcpPersonalMatches("providers", { data: { items: [provider], next_cursor: null } }, undefined, new URLSearchParams("directory_type=app&category_key=development"))).toBe(true)
    expect(mcpPersonalMatches("provider", { data: { provider } }, "provider-one", new URLSearchParams())).toBe(true)
    const create = { provider_key: "provider-one", connector_type: "mcp", display_name: "Connector", description: "" }
    expect(mcpPersonalMatches("create", { data: { connector: managed } }, undefined, new URLSearchParams(), create)).toBe(true)
    expect(mcpPersonalMatches("create", { data: { connector: { ...managed, enabled: true } } }, undefined, new URLSearchParams(), create)).toBe(false)
    expect(mcpPersonalMatches("update", { data: { connector: { ...managed, connector_id: "connector-1", state_version: "2", display_name: "Renamed" } } }, "connector-1", new URLSearchParams(), { display_name: "Renamed", description: "", expected_state_version: "1" })).toBe(true)
    expect(mcpPersonalMatches("enabled", { data: { connector: { ...managed, connector_id: "connector-1", enabled: true, state_version: "2", status: "active" } } }, "connector-1", new URLSearchParams(), { enabled: true, expected_state_version: "1" })).toBe(true)
    expect(mcpPersonalMatches("remove", { data: { connector: { ...managed, connector_id: "connector-1", state_version: "2", status: "revoked" } } }, "connector-1", new URLSearchParams(), { expected_state_version: "1" })).toBe(true)
  })
  it("keeps command-only error states closed and retryable only when owner says in-progress", () => {
    const error = (code: string, retryable: boolean) => ({ error: { code, message: "safe", retryable } })
    expect(mcpPersonalErrorAllowed("create", 409, error("mcp_personal_idempotency_conflict", false))).toBe(true)
    expect(mcpPersonalErrorAllowed("create", 409, error("mcp_personal_command_in_progress", true))).toBe(true)
    expect(mcpPersonalErrorAllowed("create", 412, error("mcp_personal_precondition_failed", false))).toBe(true)
    expect(mcpPersonalErrorAllowed("create", 409, error("mcp_personal_idempotency_conflict", true))).toBe(false)
  })
  it("preserves duplicate-key evidence before command schemas run", () => {
    expect(() => parseMcpPersonalCommandJson('{"provider_key":"first","provider_key":"second"}')).toThrow(SyntaxError)
    expect(parseMcpPersonalCommandJson('{"provider_key":"github"}')).toEqual({ provider_key: "github" })
  })
})
