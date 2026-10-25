import { describe, expect, it } from "vitest";
import { parseMcpConnectorJson } from "@/hub/mcp-connector-json";
import {
  mcpConnectorSchemas,
  mcpConnectorSchema,
  mcpPrivateServerSchema,
  mcpConnectorMatches,
  mcpConnectorErrorAllowed,
  mcpPrivateServerMatches,
  mcpPrivateServerRegistrationInputSchema,
  mcpPrivateServerUpdateInputSchema,
  mcpPrivateJsonImportInputSchema,
  mcpPrivateJsonImportSchema,
} from "@/hub/mcp-connector.schema";
import { isMcpCustomHeaderName } from "@/ui/mcp/mcp-header-validation";

const connector = { availability: "available" as const,
  connector_id: "connector-1",
  connector_type: "mcp",
  provider_key: "provider-one",
  status: "active",
  approved_scopes: ["tools.read"],
  enabled: true,
  state_version: "2",
};
const connection = {
  connection_id: "connection-1",
  connector_id: "connector-1",
  server_id: "server-1",
  allowed_selectors: ["tool:read"],
  policy_digest: "a".repeat(64),
  status: "active",
};
describe("current-user MCP strict owner wire", () => {
  it("accepts four exact shapes and independently binds list/detail resources", () => {
    expect(
      mcpConnectorMatches(
        "connectors",
        { data: { items: [connector], next_cursor: null } },
        undefined,
        new URLSearchParams("status=active&limit=1"),
      ),
    ).toBe(true);
    expect(
      mcpConnectorMatches(
        "connector",
        { data: { connector } },
        "connector-1",
        new URLSearchParams(),
      ),
    ).toBe(true);
    expect(
      mcpConnectorMatches(
        "connections",
        { data: { items: [connection], next_cursor: "opaque_cursor" } },
        "connector-1",
        new URLSearchParams(),
      ),
    ).toBe(true);
    expect(
      mcpConnectorMatches(
        "connection",
        { data: { connection } },
        "connection-1",
        new URLSearchParams(),
      ),
    ).toBe(true);
    expect(
      mcpConnectorMatches(
        "connector",
        { data: { connector } },
        "another",
        new URLSearchParams(),
      ),
    ).toBe(false);
    expect(
      mcpConnectorMatches(
        "connection",
        { data: { connection } },
        "another",
        new URLSearchParams(),
      ),
    ).toBe(false);
    expect(
      mcpConnectorMatches(
        "connections",
        { data: { items: [connection], next_cursor: null } },
        "another",
        new URLSearchParams(),
      ),
    ).toBe(false);
  });
  it("rejects absent, extra, malformed and duplicate fields without active-page fallback", () => {
    for (const field of Object.keys(connector)) {
      const value: Record<string, unknown> = { ...connector };
      delete value[field];
      expect(
        mcpConnectorSchemas.connector.safeParse({ data: { connector: value } })
          .success,
      ).toBe(false);
    }
    for (const field of Object.keys(connection)) {
      const value: Record<string, unknown> = { ...connection };
      delete value[field];
      expect(
        mcpConnectorSchemas.connection.safeParse({
          data: { connection: value },
        }).success,
      ).toBe(false);
    }
    for (const value of [
      { ...connector, secret: "no" },
      { ...connector, connector_id: "id\n" },
      { ...connector, approved_scopes: ["tools.read", "tools.read"] },
      { ...connector, approved_scopes: ["tools.read\n"] },
      { ...connector, provider_key: "UPPER" },
    ]) {
      expect(
        mcpConnectorSchemas.connector.safeParse({ data: { connector: value } })
          .success,
      ).toBe(false);
    }
    for (const value of [
      { ...connection, enabled: true },
      { ...connection, status: "pending" },
      { ...connection, policy_digest: "A".repeat(64) },
      { ...connection, allowed_selectors: ["read "] },
      { ...connection, allowed_selectors: ["read", "read"] },
    ]) {
      expect(
        mcpConnectorSchemas.connection.safeParse({
          data: { connection: value },
        }).success,
      ).toBe(false);
    }
    expect(
      mcpConnectorSchemas.connections.safeParse({
        data: { connections: [connection], next_cursor: null },
      }).success,
    ).toBe(false);
    expect(
      mcpConnectorSchemas.connectors.safeParse({
        data: { items: [], next_cursor: "" },
      }).success,
    ).toBe(false);
  });
  it("keeps UTF16 boundaries, opaque cursor, unique IDs, filters and requested page size", () => {
    const valid = { ...connector, approved_scopes: ["😀".repeat(64)] };
    expect(
      mcpConnectorSchemas.connector.safeParse({ data: { connector: valid } })
        .success,
    ).toBe(true);
    expect(
      mcpConnectorSchemas.connector.safeParse({
        data: { connector: { ...valid, approved_scopes: ["😀".repeat(65)] } },
      }).success,
    ).toBe(false);
    expect(
      mcpConnectorSchemas.connection.safeParse({
        data: {
          connection: {
            ...connection,
            allowed_selectors: ["read internal whitespace"],
          },
        },
      }).success,
    ).toBe(true);
    expect(
      mcpConnectorMatches(
        "connectors",
        { data: { items: [connector, connector], next_cursor: null } },
        undefined,
        new URLSearchParams(),
      ),
    ).toBe(false);
    expect(
      mcpConnectorMatches(
        "connectors",
        { data: { items: [connector], next_cursor: null } },
        undefined,
        new URLSearchParams("status=pending"),
      ),
    ).toBe(false);
    expect(
      mcpConnectorMatches(
        "connections",
        {
          data: {
            items: [
              connection,
              { ...connection, connection_id: "connection-2" },
            ],
            next_cursor: null,
          },
        },
        "connector-1",
        new URLSearchParams("limit=1"),
      ),
    ).toBe(false);
  });
  it("uses per-status code/retryable rules and excludes list connector 404", () => {
    const error = (code: string, retryable = false) => ({
      error: { code, message: "safe", retryable },
    });
    expect(
      mcpConnectorErrorAllowed(
        "connector",
        404,
        error("mcp_personal_not_found"),
      ),
    ).toBe(true);
    expect(
      mcpConnectorErrorAllowed(
        "connectors",
        404,
        error("mcp_personal_not_found"),
      ),
    ).toBe(false);
    expect(
      mcpConnectorErrorAllowed(
        "connections",
        404,
        error("mcp_personal_not_found"),
      ),
    ).toBe(true);
    expect(
      mcpConnectorErrorAllowed(
        "connection",
        429,
        error("session_rate_limited", true),
      ),
    ).toBe(true);
    expect(
      mcpConnectorErrorAllowed(
        "connection",
        503,
        error("mcp_personal_dependency_unavailable", true),
      ),
    ).toBe(true);
    for (const [httpStatus, value] of [
      [400, error("session_invalid")],
      [503, error("mcp_personal_dependency_unavailable")],
      [401, error("session_invalid", true)],
      [502, error("skill_response_invalid")],
      [404, { ...error("mcp_personal_not_found"), meta: {} }],
    ] as const) {
      expect(mcpConnectorErrorAllowed("connection", httpStatus, value)).toBe(
        false,
      );
    }
  });
});

describe("current-user MCP 14.0 commands and provider directory", () => {
  const managed = {
    ...connector,
    display_name: "Connector",
    description: "",
    enabled: false,
    state_version: "1",
    status: "pending" as const,
  };
  const provider = {
    provider_key: "provider-one",
    display_name: "Provider",
    directory_type: "app" as const,
    category_keys: ["development"],
    example_prompts: ["Help"],
    connection_server_id: "server-1",
    enabled: true,
    state_version: "2",
  };
  it("binds actual provider directory and closed command acknowledgements", () => {
    expect(
      mcpConnectorMatches(
        "providers",
        { data: { items: [provider], next_cursor: null } },
        undefined,
        new URLSearchParams("directory_type=app&category_key=development"),
      ),
    ).toBe(true);
    expect(
      mcpConnectorMatches(
        "provider",
        { data: { provider } },
        "provider-one",
        new URLSearchParams(),
      ),
    ).toBe(true);
    expect(
      mcpConnectorSchemas.provider.safeParse({
        data: {
          provider: { ...provider, connection_server_id: "invalid space" },
        },
      }).success,
    ).toBe(false);
    const create = {
      provider_key: "provider-one",
      connector_type: "mcp",
      display_name: "Connector",
      description: "",
    };
    expect(
      mcpConnectorMatches(
        "create",
        { data: { connector: managed } },
        undefined,
        new URLSearchParams(),
        create,
      ),
    ).toBe(true);
    expect(
      mcpConnectorMatches(
        "create",
        { data: { connector: { ...managed, enabled: true } } },
        undefined,
        new URLSearchParams(),
        create,
      ),
    ).toBe(false);
    expect(
      mcpConnectorMatches(
        "update",
        {
          data: {
            connector: {
              ...managed,
              connector_id: "connector-1",
              state_version: "2",
              display_name: "Renamed",
            },
          },
        },
        "connector-1",
        new URLSearchParams(),
        {
          display_name: "Renamed",
          description: "",
          expected_state_version: "1",
        },
      ),
    ).toBe(true);
    expect(
      mcpConnectorMatches(
        "enabled",
        {
          data: {
            connector: {
              ...managed,
              connector_id: "connector-1",
              enabled: true,
              state_version: "2",
              status: "active",
            },
          },
        },
        "connector-1",
        new URLSearchParams(),
        { enabled: true, expected_state_version: "1" },
      ),
    ).toBe(true);
    expect(
      mcpConnectorMatches(
        "remove",
        {
          data: {
            connector: {
              ...managed,
              connector_id: "connector-1",
              state_version: "2",
              status: "revoked",
            },
          },
        },
        "connector-1",
        new URLSearchParams(),
        { expected_state_version: "1" },
      ),
    ).toBe(true);
  });
  it("keeps command-only error states closed and retryable only when owner says in-progress", () => {
    const error = (code: string, retryable: boolean) => ({
      error: { code, message: "safe", retryable },
    });
    expect(
      mcpConnectorErrorAllowed(
        "create",
        409,
        error("mcp_personal_idempotency_conflict", false),
      ),
    ).toBe(true);
    expect(
      mcpConnectorErrorAllowed(
        "create",
        409,
        error("mcp_personal_command_in_progress", true),
      ),
    ).toBe(true);
    expect(
      mcpConnectorErrorAllowed(
        "create",
        412,
        error("mcp_personal_precondition_failed", false),
      ),
    ).toBe(true);
    expect(
      mcpConnectorErrorAllowed(
        "create",
        409,
        error("mcp_personal_idempotency_conflict", true),
      ),
    ).toBe(false);
  });
  it("preserves duplicate-key evidence before command schemas run", () => {
    expect(() =>
      parseMcpConnectorJson('{"provider_key":"first","provider_key":"second"}'),
    ).toThrow(SyntaxError);
    expect(parseMcpConnectorJson('{"provider_key":"github"}')).toEqual({
      provider_key: "github",
    });
  });
});

describe("private URL MCP registration wire", () => {
  const input = {
    display_name: "DeepWiki",
    server_url: "https://mcp.deepwiki.com/mcp",
  };
  const server = { availability: "unavailable" as const,
    server_id: "server-1",
    display_name: input.display_name,
    server_url: input.server_url,
    status: "registered" as const,
    state_version: "1",
    headers: [],
    prepare_status: "ready" as const,
    declarations: [],
    declaration_digest: "a".repeat(64),
    declarations_available: true,
  };
  const privateConnector = {
    ...connector,
    connector_id: "connector-private",
    server_id: server.server_id,
    display_name: input.display_name,
    description: "",
    approved_scopes: [],
    enabled: false,
    state_version: "1",
    status: "active" as const,
  };

  it.each(["tool", "resource", "prompt"] as const)(
    "accepts multiline public %s descriptions in prepared server reads and receipts",
    (kind) => {
      // Actual discovery may use the MCP description as display_name. A valid
      // owner response must survive both the same-origin bridge and its client.
      const declaration = {
        kind,
        selector: "read_documentation",
        display_name: "Read public documentation\nSecond paragraph\r\n\tIndented context",
        ...(kind === "tool"
          ? { input_schema_digest: "b".repeat(64), required_scopes: [] }
          : {}),
      };
      const prepared = { ...server, state_version: "2", declarations: [declaration] };
      expect(mcpPrivateServerMatches("server", { data: { server: prepared } }, server.server_id)).toBe(true);
      expect(mcpPrivateServerMatches("prepareServer", {
        data: {
          server: prepared,
          connector: { ...privateConnector, enabled: true, state_version: "2" },
          declarations: prepared.declarations,
          replayed: false,
        },
      }, server.server_id, { expected_state_version: "1" })).toBe(true);
      for (const display_name of ["invalid\0description", "invalid\x7fdescription", "invalid\uD800description"]) {
        expect(mcpPrivateServerSchema.safeParse({ ...prepared, declarations: [{ ...declaration, display_name }] }).success).toBe(false);
      }
      expect(mcpPrivateServerSchema.safeParse({ ...prepared, declarations: [{ ...declaration, selector: "invalid\nselector" }] }).success).toBe(false);
      expect(mcpPrivateServerRegistrationInputSchema.safeParse({ ...input, display_name: "invalid\nname" }).success).toBe(false);
    },
  );

  it.each(["tool", "resource", "prompt"] as const)(
    "preserves long owner %s display text in reads and original prepare receipts",
    (kind) => {
      for (const display_name of ["x".repeat(2006), "界".repeat(334) + "\nSecond paragraph"]) {
        const declaration = { kind, selector: "read_docs", display_name,
          ...(kind === "tool" ? { input_schema_digest: "b".repeat(64), required_scopes: [] } : {}) };
        const prepared = { ...server, state_version: "2", declarations: [declaration] };
        expect(mcpPrivateServerSchema.parse(prepared).declarations[0]?.display_name).toBe(display_name);
        expect(mcpPrivateServerMatches("server", { data: { server: prepared } }, server.server_id)).toBe(true);
        for (const replayed of [false, true]) {
          expect(mcpPrivateServerMatches("prepareServer", { data: {
            server: prepared, connector: { ...privateConnector, enabled: true, state_version: "2" },
            declarations: prepared.declarations, replayed,
          } }, server.server_id, { expected_state_version: "1" })).toBe(true);
        }
      }
    },
  );

  it("accepts exact V1 registration and binds preparation/update/delete to the server CAS", () => {
    expect(
      mcpPrivateServerMatches(
        "registerServer",
        { data: { server, connector: privateConnector, replayed: false } },
        undefined,
        input,
      ),
    ).toBe(true);
    const pendingServer = {
      ...server,
      status: "pending" as const,
      prepare_status: "needs_oauth" as const,
      declarations: [],
      declaration_digest: undefined,
      declarations_available: false,
    };
    const pendingConnector = {
      ...privateConnector,
      status: "pending" as const,
    };
    expect(
      mcpPrivateServerMatches(
        "registerServer",
        {
          data: {
            server: pendingServer,
            connector: pendingConnector,
            replayed: false,
          },
        },
        undefined,
        input,
      ),
    ).toBe(true);
    const prepared = { ...server, state_version: "2" };
    expect(
      mcpPrivateServerMatches(
        "prepareServer",
        {
          data: {
            server: prepared,
            connector: {
              ...privateConnector,
              enabled: true,
              state_version: "2",
            },
            declarations: [],
            replayed: false,
          },
        },
        server.server_id,
        { expected_state_version: "1" },
      ),
    ).toBe(true);
    expect(
      mcpPrivateServerMatches(
        "updateServer",
        {
          data: {
            server: {
              ...prepared,
              state_version: "3",
              display_name: "Renamed",
            },
            connector: {
              ...privateConnector,
              enabled: true,
              state_version: "3",
            },
            replayed: false,
          },
        },
        server.server_id,
        { expected_state_version: "2", display_name: "Renamed" },
      ),
    ).toBe(true);
    expect(
      mcpPrivateServerMatches(
        "deleteServer",
        {
          data: { server_id: server.server_id, deleted: true, replayed: false },
        },
        server.server_id,
        { expected_state_version: "3" },
      ),
    ).toBe(true);
    expect(
      mcpPrivateServerMatches(
        "prepareServer",
        {
          data: {
            server,
            connector: privateConnector,
            declarations: [],
            replayed: false,
          },
        },
        server.server_id,
        { expected_state_version: "1" },
      ),
    ).toBe(false);
  });

  it("accepts one owner-atomic JSON import response without exposing its document", () => {
    const config = JSON.stringify({
      mcpServers: {
        remote: { type: "streamableHttp", url: "https://example.test/mcp" },
      },
    });
    expect(
      mcpPrivateJsonImportInputSchema.parse({ config_json: config }),
    ).toEqual({ config_json: config });
    expect(
      mcpPrivateJsonImportSchema.parse({
        imports: [{ server, connector: privateConnector }],
        replayed: false,
      }),
    ).toEqual({
      imports: [{ server, connector: privateConnector }],
      replayed: false,
    });
    expect(() =>
      mcpPrivateJsonImportInputSchema.parse({ config_json: "", other: true }),
    ).toThrow();
  });

  it("keeps browser header admission aligned with the private MCP request boundary", () => {
    expect(isMcpCustomHeaderName("X-Client-Key")).toBe(true);
    for (const name of ["authorization", "X-Kokoro-E2E", "sec-fetch-site"]) {
      expect(isMcpCustomHeaderName(name)).toBe(false);
      expect(
        mcpPrivateServerRegistrationInputSchema.safeParse({
          ...input,
          headers: [{ name: name.toLowerCase(), value: "fixture" }],
        }).success,
      ).toBe(false);
    }
  });
});

import {
  mcpConnectorAuthorizationCallbackSchema,
  mcpConnectorAuthorizationMatches,
  mcpConnectorCreateConnectionSchema,
} from "@/hub/mcp-connector-authorization.schema";

describe("current-user MCP authorization lifecycle wire", () => {
  const authorization = {
    authorization_id: "authorization-1",
    authorization_url: "https://oauth.example.test/authorize?state=opaque",
    expires_at: "2027-01-15T08:00:00.000Z",
  };

  it("accepts the exact BFF envelope and binds authorization/connection effects", () => {
    expect(
      mcpConnectorAuthorizationMatches(
        "beginAuthorization",
        {
          data: {
            authorization,
            connector: { ...connector, state_version: "2" },
          },
        },
        "connector-1",
        { server_id: "server-1", expected_state_version: "1" },
      ),
    ).toBe(true);
    expect(
      mcpConnectorAuthorizationMatches(
        "createConnection",
        { data: { connection } },
        undefined,
        {
          connector_id: "connector-1",
          server_id: "server-1",
          allowed_selectors: ["tool:read"],
          expected_state_version: "2",
        },
      ),
    ).toBe(true);
    expect(
      mcpConnectorAuthorizationMatches(
        "completeAuthorization",
        {
          data: {
            connector: { ...connector, status: "active", state_version: "3" },
          },
        },
        undefined,
        { state: "opaque", code: "code" },
      ),
    ).toBe(true);
  });

  it("enforces callback XOR and owner-equivalent UTF-16 boundaries", () => {
    expect(
      mcpConnectorAuthorizationCallbackSchema.safeParse({
        state: "opaque",
        code: "code",
      }).success,
    ).toBe(true);
    expect(
      mcpConnectorAuthorizationCallbackSchema.safeParse({
        state: "opaque",
        error: "access_denied",
      }).success,
    ).toBe(true);
    expect(
      mcpConnectorAuthorizationCallbackSchema.safeParse({
        state: "opaque",
        code: "code",
        error: "access_denied",
      }).success,
    ).toBe(false);
    expect(
      mcpConnectorAuthorizationCallbackSchema.safeParse({
        state: "😀".repeat(2048),
        code: "code",
      }).success,
    ).toBe(true);
    expect(
      mcpConnectorAuthorizationCallbackSchema.safeParse({
        state: "😀".repeat(2049),
        code: "code",
      }).success,
    ).toBe(false);
    expect(
      mcpConnectorCreateConnectionSchema.safeParse({
        connector_id: "connector-1",
        server_id: "server-1",
        allowed_selectors: ["tool:read", "tool:read"],
        expected_state_version: "2",
      }).success,
    ).toBe(false);
  });
});

it("preserves published connector receipt tuples instead of treating every 503 as retryable", () => {
  for (const [code, status, retryable] of [
    ["mcp_personal_command_in_progress", 409, true],
    ["mcp_personal_command_outcome_unknown", 503, false],
    ["mcp_personal_command_replay_expired", 412, false],
    ["mcp_personal_idempotency_conflict", 409, false],
    ["mcp_personal_command_ownership_lost", 409, false],
    ["mcp_personal_response_invalid", 502, false],
  ] as const) {
    const body = { error: { code, message: "Safe failure", retryable } };
    expect(mcpConnectorErrorAllowed("create", status, body), code).toBe(true);
    expect(mcpConnectorErrorAllowed("create", status === 503 ? 409 : 503, body), code).toBe(false);
    expect(mcpConnectorErrorAllowed("create", status, { error: { ...body.error, retryable: !retryable } }), code).toBe(false);
    expect(mcpConnectorErrorAllowed("connector", status, body), code).toBe(code === "mcp_personal_response_invalid");
  }
});

// Live availability is independent of the saved lifecycle and enabled setting.
it("requires the five exact availability values without lifecycle/default fallback", () => {
  for (const availability of ["available", "refresh_required", "refreshing", "reauthorization_required", "unavailable"]) {
    const value = mcpConnectorSchema.parse({ ...connector, availability });
    expect(value.availability).toBe(availability);
    expect(value.status).toBe("active");
    expect(value.enabled).toBe(true);
  }
  for (const availability of [undefined, null, "active", "", 0, 1, "AVAILABLE"]) {
    expect(mcpConnectorSchema.safeParse({ ...connector, availability }).success).toBe(false);
  }
});
it("retains safe revoked header history while keeping write limits and strict descriptors", () => {
  const server = {
    server_id: "history", display_name: "History", server_url: "https://tools.example/mcp",
    status: "pending", state_version: "1", prepare_status: "pending_prepare",
    declarations: [], declarations_available: false, availability: "unavailable" as const,
    headers: Array.from({ length: 33 }, (_, index) => ({ name: `x-fixture-${index}`, configured: index !== 0, status: index === 0 ? "revoked" : "active", state_version: "1" })),
  };
  expect(mcpPrivateServerSchema.parse(server).headers).toHaveLength(33);
  expect(mcpPrivateServerSchema.safeParse({ ...server, availability: undefined }).success).toBe(false);
  expect(mcpPrivateServerSchema.safeParse({ ...server, availability: "active" }).success).toBe(false);
  expect(mcpPrivateServerSchema.safeParse({ ...server, headers: [...server.headers, server.headers[0]] }).success).toBe(false);
  expect(mcpPrivateServerSchema.safeParse({ ...server, headers: [{ ...server.headers[0], value: "private" }] }).success).toBe(false);
  expect(mcpPrivateServerRegistrationInputSchema.safeParse({ display_name: "History", server_url: server.server_url, headers: Array.from({ length: 33 }, (_, index) => ({ name: `x-header-${index}`, value: "fixture" })) }).success).toBe(false);
});

it("staged icon selectors are accepted by original server saves, clear is explicit and icon-only updates are valid", () => {
  const icon = { intent_id: "12345678-1234-1234-1234-123456789abc", expected_state_version: "2" };
  expect(mcpPrivateServerRegistrationInputSchema.safeParse({ display_name: "Icon", server_url: "https://tools.example/mcp", icon }).success).toBe(true);
  expect(mcpPrivateServerUpdateInputSchema.safeParse({ expected_state_version: "7", icon }).success).toBe(true);
  expect(mcpPrivateServerUpdateInputSchema.safeParse({ expected_state_version: "7", clear_icon: true }).success).toBe(true);
  for (const bad of [{ icon, clear_icon: true }, { clear_icon: false }, { icon: { ...icon, expected_state_version: 2 } }, { icon: { ...icon, expected_state_version: "2147483647" } }])
    expect(mcpPrivateServerUpdateInputSchema.safeParse({ expected_state_version: "7", ...bad }).success).toBe(false);
});
