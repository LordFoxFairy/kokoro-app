import { afterEach, describe, expect, it, vi } from "vitest";

import {
  catalogPackageResponseSchema,
  catalogPackageMatches,
  catalogPackagePrivatePath,
  skillCatalogSchema,
} from "@/hub/schemas";

import {
  createHubClient,
  createSkillInstallationClient,
  HubClientError,
} from "@/hub/client";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function managedResponse(data: object, status = 200): Response {
  return publicResponse({ ...data, meta: { request_id: "request-1" } }, status);
}
const managedSkill = {
  skill_id: "skill-1",
  source_ref: "skill:skill-1",
  series_id: "series",
  revision: "2",
  status: "active",
  name: "Mine",
  summary: "Private",
  tags: [],
  example_prompts: [],
  category_keys: [],
  skill_updated_at: "2026-10-10T00:00:00Z",
  product: { publication_audience: "owner", state_version: "5" },
};

function publicResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-request-id": "request-1",
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browser Hub cache directive boundary", () => {
  const consumers = [
    {
      name: "personal Skills",
      read: () => createHubClient().listPersonalSkills(),
      body: {
        data: { skills: [], next_cursor: null },
        meta: { request_id: "request-1" },
      },
      expected: { skills: [], next_cursor: null },
    },
    {
      name: "MCP projection",
      read: () => createHubClient().listMcpConnections(),
      body: { data: { connections: [] } },
      expected: { connections: [] },
    },
    {
      name: "installations",
      read: () => createSkillInstallationClient().list(),
      body: { data: [] },
      expected: { data: [] },
    },
  ];
  it.each(consumers)(
    "accepts final Proxy no-store directives for $name",
    async ({ read, body, expected }) => {
      for (const cacheControl of [
        "private, no-store, max-age=0",
        "NO-STORE, private",
        "private,\tno-store\t, max-age=0",
        'extension="value, no-store, value", no-store',
      ]) {
        const response = publicResponse(body);
        response.headers.set("cache-control", cacheControl);
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
        await expect(read()).resolves.toEqual(expected);
      }
    },
  );
  it.each(consumers)(
    "rejects missing or lookalike no-store directives for $name",
    async ({ read, body }) => {
      for (const cacheControl of [
        null,
        "private, max-age=0",
        "no-cache",
        "x-no-store",
        "no-store-extra",
        "no-store=1",
        'extension="value, no-store, value"',
        'no-store, extension="unterminated',
      ]) {
        const response = publicResponse(body);
        if (cacheControl === null) response.headers.delete("cache-control");
        else response.headers.set("cache-control", cacheControl);
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
        await expect(read()).rejects.toMatchObject({
          reason: "parse",
          status: 200,
        });
      }
    },
  );
  it.each(consumers)(
    "preserves strict media, request ID and schema validation for $name",
    async ({ read, body }) => {
      for (const [name, value] of [
        ["content-type", "text/plain"],
        ["x-request-id", "invalid request id"],
        ["x-request-id", ""],
      ]) {
        const response = publicResponse(body);
        response.headers.set("cache-control", "private, no-store, max-age=0");
        response.headers.set(name!, value!);
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
        await expect(read()).rejects.toMatchObject({
          reason: "parse",
          status: 200,
        });
      }
      const response = publicResponse({ ...body, unexpected: true });
      response.headers.set("cache-control", "private, no-store, max-age=0");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      await expect(read()).rejects.toMatchObject({
        reason: "parse",
        status: 200,
      });
    },
  );
  it.each(consumers)(
    "preserves typed authorization rejection under final Proxy headers for $name",
    async ({ read }) => {
      const response = publicResponse(
        read === consumers[0]?.read
          ? {
              error: { code: "session_invalid", message: "revoked" },
              meta: { request_id: "request-1" },
            }
          : {
              error: {
                code: "session_invalid",
                message: "revoked",
                retryable: false,
              },
            },
        401,
      );
      response.headers.set("cache-control", "private, no-store, max-age=0");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      await expect(read()).rejects.toMatchObject({
        reason: "http",
        status: 401,
        code: "session_invalid",
      });
    },
  );
});

describe("hub client", () => {
  it("rejects non-JSON success and error projection bodies but accepts UTF-8 JSON", async () => {
    const headers = { "cache-control": "no-store", "x-request-id": "req-json" };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            '{"data":{"skills":[],"next_cursor":null},"meta":{"request_id":"req-json"}}',
            {
              status: 200,
              headers: { ...headers, "content-type": "text/plain" },
            },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            '{"error":{"code":"session_invalid","message":"expired"},"meta":{"request_id":"req-json"}}',
            {
              status: 401,
              headers: { ...headers, "content-type": "text/plain" },
            },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            '{"data":{"skills":[],"next_cursor":null},"meta":{"request_id":"req-json"}}',
            {
              status: 200,
              headers: {
                ...headers,
                "content-type": "application/json; charset=utf-8",
              },
            },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            '{"error":{"code":"session_invalid","message":"expired"},"meta":{"request_id":"req-json"}}',
            {
              status: 401,
              headers: {
                ...headers,
                "content-type": "application/json; charset=utf-8",
              },
            },
          ),
        ),
    );
    const client = createHubClient();
    await expect(client.listPersonalSkills()).rejects.toMatchObject({
      reason: "parse",
      status: 200,
    });
    await expect(client.listPersonalSkills()).rejects.toMatchObject({
      reason: "parse",
      status: 401,
    });
    expect(await client.listPersonalSkills()).toEqual({
      skills: [],
      next_cursor: null,
    });
    await expect(client.listPersonalSkills()).rejects.toMatchObject({
      reason: "http",
      status: 401,
      code: "session_invalid",
    });
  });

  it("reads personal Skill pages by opaque cursor and resolves ACTIVE by ID without old catalog", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        managedResponse({
          data: { skills: [managedSkill], next_cursor: "opaque-next" },
        }),
      )
      .mockResolvedValueOnce(managedResponse({ data: managedSkill }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createHubClient();

    const page = await client.listPersonalSkills("opaque-current");
    expect(page.skills[0]).toMatchObject({
      source_ref: "skill:skill-1",
      revision: "2",
    });
    expect(page.next_cursor).toBe("opaque-next");
    const published = await client.getPublishedPersonalSkill("skill-1");
    expect(published).toEqual(managedSkill);
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/hub/self/skills/managed?status=active&limit=50&cursor=opaque-current",
      "/api/hub/self/skills/managed/skill-1",
    ]);
  });

  it("reads only owner-native MCP connection fields and rejects Server fields", async () => {
    const connection = {
      connection_id: "connection-1",
      connector_id: "connector-1",
      server_id: "server-1",
      provider_key: "provider",
      transport: "streamable_http",
      status: "active",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        publicResponse({
          data: { connections: [connection], next_cursor: "next" },
        }),
      )
      .mockResolvedValueOnce(
        publicResponse({
          data: {
            connections: [
              { ...connection, declaration_digest: "a".repeat(64) },
            ],
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = createHubClient();
    expect(await client.listMcpConnections()).toEqual({
      connections: [connection],
      next_cursor: "next",
    });
    await expect(client.listMcpConnections()).rejects.toMatchObject({
      reason: "parse",
    });
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/hub/mcp/connections",
      "/api/hub/mcp/connections",
    ]);
  });

  it("uses formal personal connector V1 routes, strict envelopes, idempotency, and CAS payloads", async () => {
    const connector = {
      connector_id: "connector-1",
      connector_type: "mcp",
      provider_key: "provider-one",
      status: "active",
      approved_scopes: ["tools.read"],
      enabled: true,
      state_version: "2",
      display_name: "Connector",
      description: "Ready",
    };
    const provider = {
      provider_key: "provider-one",
      display_name: "Provider One",
      directory_type: "app",
      category_keys: ["development"],
      example_prompts: ["Connect me"],
      enabled: true,
      state_version: "1",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        publicResponse({ data: { items: [connector], next_cursor: null } }),
      )
      .mockResolvedValueOnce(
        publicResponse({ data: { items: [provider], next_cursor: null } }),
      )
      .mockResolvedValueOnce(
        publicResponse(
          {
            data: {
              connector: {
                ...connector,
                connector_id: "connector-2",
                status: "pending",
                enabled: false,
                state_version: "1",
              },
            },
          },
          201,
        ),
      )
      .mockResolvedValueOnce(
        publicResponse({
          data: {
            connector: {
              ...connector,
              display_name: "Renamed",
              state_version: "3",
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        publicResponse({
          data: {
            connector: { ...connector, enabled: false, state_version: "3" },
          },
        }),
      )
      .mockResolvedValueOnce(
        publicResponse({
          data: {
            connector: {
              ...connector,
              enabled: false,
              status: "revoked",
              state_version: "3",
            },
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = createHubClient();

    await expect(
      client.listMcpConnectors({
        status: "active",
        limit: 25,
        cursor: "opaque",
      }),
    ).resolves.toEqual({ items: [connector], next_cursor: null });
    await expect(
      client.listMcpConnectorProviders({
        directory_type: "app",
        category_key: "development",
        limit: 25,
      }),
    ).resolves.toEqual({
      items: [provider],
      next_cursor: null,
    });
    await expect(
      client.createMcpConnector({
        provider_key: "provider-one",
        connector_type: "mcp",
        display_name: "New connector",
        description: "",
      }),
    ).resolves.toMatchObject({ connector_id: "connector-2", enabled: false });
    await expect(
      client.updateMcpConnector("connector-1", {
        display_name: "Renamed",
        description: "Ready",
        expected_state_version: "2",
      }),
    ).resolves.toMatchObject({ display_name: "Renamed", state_version: "3" });
    await expect(
      client.setMcpConnectorEnabled("connector-1", {
        enabled: false,
        expected_state_version: "2",
      }),
    ).resolves.toMatchObject({ enabled: false });
    await expect(
      client.removeMcpConnector("connector-1", { expected_state_version: "2" }),
    ).resolves.toMatchObject({ status: "revoked" });

    expect(
      fetchMock.mock.calls.map(
        ([path]) => new URL(path, "http://localhost").pathname,
      ),
    ).toEqual([
      "/api/hub/mcp/connectors",
      "/api/hub/mcp/providers",
      "/api/hub/mcp/connectors",
      "/api/hub/mcp/connectors/connector-1",
      "/api/hub/mcp/connectors/connector-1/enabled",
      "/api/hub/mcp/connectors/connector-1",
    ]);
    const connectorQuery = new URL(
      fetchMock.mock.calls[0]![0],
      "http://localhost",
    ).searchParams;
    expect([...connectorQuery]).toEqual([
      ["status", "active"],
      ["limit", "25"],
      ["cursor", "opaque"],
    ]);
    const createInit = fetchMock.mock.calls[2]![1] as RequestInit;
    expect(createInit.method).toBe("POST");
    expect(createInit.headers).toMatchObject({
      "content-type": "application/json",
    });
    expect(
      (createInit.headers as Record<string, string>)["Idempotency-Key"],
    ).toMatch(/^mcp-connector:/u);
    expect(JSON.parse(String(createInit.body))).toEqual({
      provider_key: "provider-one",
      connector_type: "mcp",
      display_name: "New connector",
      description: "",
    });
    expect(
      JSON.parse(String((fetchMock.mock.calls[3]![1] as RequestInit).body)),
    ).toEqual({
      display_name: "Renamed",
      description: "Ready",
      expected_state_version: "2",
    });
    expect(
      JSON.parse(String((fetchMock.mock.calls[4]![1] as RequestInit).body)),
    ).toEqual({ enabled: false, expected_state_version: "2" });
    expect(
      JSON.parse(String((fetchMock.mock.calls[5]![1] as RequestInit).body)),
    ).toEqual({ expected_state_version: "2" });
  });

  it("uses the exact self OAuth and Connection lifecycle routes and headers", async () => {
    const connector = {
      connector_id: "connector-1",
      connector_type: "mcp",
      provider_key: "provider-one",
      status: "pending",
      approved_scopes: ["tools.read"],
      enabled: false,
      state_version: "2",
    };
    const authorization = {
      authorization_id: "authorization-1",
      authorization_url: "https://oauth.example.test/authorize?state=opaque",
      expires_at: "2027-01-15T08:00:00.000Z",
    };
    const connection = {
      connection_id: "connection-1",
      connector_id: "connector-1",
      server_id: "server-1",
      allowed_selectors: ["tool:read"],
      policy_digest: "a".repeat(64),
      status: "active",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        publicResponse({ data: { authorization, connector } }),
      )
      .mockResolvedValueOnce(
        publicResponse({
          data: {
            authorization,
            connector: { ...connector, state_version: "3" },
          },
        }),
      )
      .mockResolvedValueOnce(
        publicResponse({
          data: {
            connector: { ...connector, status: "active", state_version: "4" },
          },
        }),
      )
      .mockResolvedValueOnce(publicResponse({ data: { connection } }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const client = createHubClient();

    await expect(
      client.beginMcpConnectorAuthorization("connector-1", {
        server_id: "server-1",
        expected_state_version: "1",
      }),
    ).resolves.toEqual({
      authorization,
      connector,
    });
    await expect(
      client.reconnectMcpConnectorAuthorization("connector-1", {
        server_id: "server-1",
        expected_state_version: "2",
      }),
    ).resolves.toMatchObject({
      connector: { state_version: "3" },
    });
    await expect(
      client.completeMcpConnectorAuthorization({
        state: "opaque",
        code: "code",
      }),
    ).resolves.toMatchObject({ connector: { status: "active" } });
    await expect(
      client.createMcpConnectorConnection({
        connector_id: "connector-1",
        server_id: "server-1",
        allowed_selectors: ["tool:read"],
        expected_state_version: "4",
      }),
    ).resolves.toEqual({ connection });

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/hub/mcp/connectors/connector-1/authorization",
      "/api/hub/mcp/connectors/connector-1/authorization/reconnect",
      "/api/hub/mcp/authorization/callback",
      "/api/hub/mcp/connections",
    ]);
    for (const index of [0, 1, 2]) {
      const init = fetchMock.mock.calls[index]![1] as RequestInit;
      expect(init.method).toBe("POST");
      expect(init.headers).toEqual({ "content-type": "application/json" });
    }
    const connectionInit = fetchMock.mock.calls[3]![1] as RequestInit;
    expect(connectionInit.headers).toMatchObject({
      "content-type": "application/json",
    });
    expect(
      (connectionInit.headers as Record<string, string>)["Idempotency-Key"],
    ).toMatch(/^mcp-connector:/u);
  });

  it("bounds MCP connection response bytes, UTF-8, error status and caller cancellation", async () => {
    const validHeaders = {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-request-id": "connection-read",
    };
    const connection = {
      connection_id: "connection-1",
      connector_id: "connector-1",
      server_id: "server-1",
      provider_key: "provider",
      transport: "streamable_http",
      status: "active",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(new Uint8Array([123, 34, 255, 34, 58, 49, 125]), {
          status: 200,
          headers: validHeaders,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { connections: [connection] } }), {
          status: 200,
          headers: {
            ...validHeaders,
            "content-length": String(1024 * 1024 + 1),
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "session_invalid",
              message: "expired",
              retryable: false,
            },
          }),
          { status: 503, headers: validHeaders },
        ),
      )
      .mockImplementationOnce(
        (_input, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener(
              "abort",
              () => reject(init.signal?.reason),
              { once: true },
            );
          }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = createHubClient();
    await expect(client.listMcpConnections()).rejects.toMatchObject({
      reason: "parse",
      status: 200,
    });
    await expect(client.listMcpConnections()).rejects.toMatchObject({
      reason: "parse",
      status: 200,
    });
    await expect(client.listMcpConnections()).rejects.toMatchObject({
      reason: "parse",
      status: 503,
    });
    const controller = new AbortController();
    const pending = client.listMcpConnections({}, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ reason: "aborted" });
  });

  it("applies one ten-second MCP Connection deadline to the pending response", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_input, init: RequestInit) =>
            new Promise((_resolve, reject) => {
              init.signal?.addEventListener(
                "abort",
                () => reject(init.signal?.reason),
                { once: true },
              );
            }),
        ),
      );
      const pending = createHubClient().listMcpConnections();
      const rejected = expect(pending).rejects.toMatchObject({
        reason: "aborted",
      });
      await vi.advanceTimersByTimeAsync(10_001);
      await rejected;
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels an unread MCP response body when strict headers reject it early", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode("{}"));
      },
      cancel,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(body, {
          status: 200,
          headers: {
            "content-type": "text/plain",
            "cache-control": "no-store",
            "x-request-id": "connection-early-reject",
          },
        }),
      ),
    );

    await expect(createHubClient().listMcpConnections()).rejects.toMatchObject({
      reason: "parse",
      status: 200,
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("sends each MCP connection filter once and preserves opaque pagination", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        publicResponse({
          data: { connections: [], next_cursor: "opaque-next" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createHubClient().listMcpConnections({
        connection_id: "connection-1",
        provider_key: "provider-one",
        limit: 25,
        cursor: "opaque-current",
      }),
    ).resolves.toEqual({ connections: [], next_cursor: "opaque-next" });
    const query = new URL(fetchMock.mock.calls[0]![0], "http://localhost")
      .searchParams;
    expect([...query]).toEqual([
      ["connection_id", "connection-1"],
      ["provider_key", "provider-one"],
      ["limit", "25"],
      ["cursor", "opaque-current"],
    ]);
  });

  it("applies MCP provider and cursor bounds by Unicode code point", async () => {
    const row = {
      connection_id: "connection-1",
      connector_id: "connector-1",
      server_id: "server-1",
      provider_key: "😀".repeat(191),
      transport: "streamable_http",
      status: "active",
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          publicResponse({
            data: { connections: [row], next_cursor: "😀".repeat(2048) },
          }),
        )
        .mockResolvedValueOnce(
          publicResponse({
            data: {
              connections: [{ ...row, provider_key: row.provider_key + "😀" }],
            },
          }),
        )
        .mockResolvedValueOnce(
          publicResponse({
            data: { connections: [], next_cursor: "😀".repeat(2049) },
          }),
        ),
    );
    const client = createHubClient();
    await expect(client.listMcpConnections()).resolves.toEqual({
      connections: [row],
      next_cursor: "😀".repeat(2048),
    });
    await expect(client.listMcpConnections()).rejects.toMatchObject({
      reason: "parse",
    });
    await expect(client.listMcpConnections()).rejects.toMatchObject({
      reason: "parse",
    });
  });

  it("fails closed on unknown personal Skill state, unauthorized owner response and bad headers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        publicResponse({
          data: {
            skill_id: "skill-1",
            source_ref: "skill:skill-1",
            revision: "2",
            status: "draft",
            name: "Mine",
            summary: "Private",
            tags: [],
          },
        }),
      )
      .mockResolvedValueOnce(
        managedResponse(
          { error: { code: "session_invalid", message: "revoked" } },
          401,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: { skills: [], next_cursor: null } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = createHubClient();
    await expect(
      client.getPublishedPersonalSkill("skill-1"),
    ).rejects.toMatchObject({ reason: "parse" });
    await expect(
      client.getPublishedPersonalSkill("skill-1"),
    ).rejects.toMatchObject({
      reason: "http",
      status: 401,
      code: "session_invalid",
    });
    await expect(client.listPersonalSkills()).rejects.toMatchObject({
      reason: "parse",
    });
  });
  it("rejects a by-ID Skill response for another personal identity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        publicResponse({
          data: {
            skill_id: "skill-other",
            source_ref: "skill:skill-other",
            revision: "2",
            status: "active",
            name: "Other",
            summary: "Private",
            tags: [],
          },
        }),
      ),
    );
    await expect(
      createHubClient().getPublishedPersonalSkill("skill-1"),
    ).rejects.toMatchObject({ reason: "parse" });
  });
  it.each([
    [401, "session_invalid"],
    [403, "session_forbidden"],
    [404, "skill_not_found"],
    [503, "skill_dependency_unavailable"],
  ])(
    "preserves by-ID owner error %i without claiming ACTIVE",
    async (status, code) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            managedResponse(
              { error: { code, message: "owner rejected" } },
              status,
            ),
          ),
      );
      await expect(
        createHubClient().getPublishedPersonalSkill("skill-1"),
      ).rejects.toMatchObject({ reason: "http", status, code });
    },
  );
  it("rejects managed dependency code at the wrong 502 status", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          managedResponse(
            {
              error: {
                code: "skill_dependency_unavailable",
                message: "owner rejected",
              },
            },
            502,
          ),
        ),
    );
    await expect(
      createHubClient().getPublishedPersonalSkill("skill-1"),
    ).rejects.toMatchObject({ reason: "parse", status: 502, code: null });
  });
  it("unwraps { data } and returns the skill pool", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          skills: [
            {
              name: "brainstorming",
              description: "d",
              content_hash: "h1",
              scope: "official",
            },
          ],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const pool = await createHubClient().listSkillPool();
    expect(pool).toHaveLength(1);
    expect(pool[0]?.name).toBe("brainstorming");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/hub/self/skills/pool");
  });

  it("requests the discoverable skill catalog separately from the installed pool", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          skills: [
            {
              name: "Skill Builder",
              description: "d",
              content_hash: "catalog:h1",
              scope: "official",
              installed: false,
              enabled: false,
            },
          ],
          next_cursor: "CURSOR",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const catalog = await createHubClient().listSkillCatalog({
      scope: "official",
      query: "Builder",
    });

    expect(catalog.skills[0]?.installed).toBe(false);
    expect(catalog.next_cursor).toBe("CURSOR");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/hub/self/skills/catalog?scope=official&query=Builder",
    );
  });

  it("surfaces the hub error code on a 409 required-skill disable", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error: { code: "hub.skill_required", message: "required" } },
            409,
          ),
        ),
    );
    const client = createHubClient();
    await expect(
      client.setSkillEnabled("installation-brainstorming", false),
    ).rejects.toMatchObject({
      code: "hub.skill_required",
      status: 409,
    } satisfies Partial<HubClientError>);
  });

  it("mutates a skill installation by its stable identity rather than its display name", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({
          data: { installation_id: "installation-copy-editor", enabled: false },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await createHubClient().setSkillEnabled("installation-copy-editor", false);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/skill.v1.SkillOptionalService/SetSkillInstallationEnabled",
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get("idempotency-key")).toMatch(
      /^skill-installation:/,
    );
    expect(init.body).toBe(
      JSON.stringify({
        installationId: "installation-copy-editor",
        enabled: false,
      }),
    );
  });

  it("removes retired preview/confirm methods instead of exposing nonexistent upload endpoints", () => {
    const client = createHubClient();
    expect(client).not.toHaveProperty("previewUpload");
    expect(client).not.toHaveProperty("confirmUpload");
  });

  it("fails loud (parse) when the pool payload violates the schema", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ data: { skills: [{ name: "x" }] } })),
    );
    await expect(createHubClient().listSkillPool()).rejects.toBeInstanceOf(
      HubClientError,
    );
  });

  it("uses the private-server V1 lifecycle and never receives supplied secret values", async () => {
    const server = {
      server_id: "server-private",
      display_name: "Private tools",
      server_url: "https://private.example/mcp",
      status: "registered",
      state_version: "2",
      headers: [
        {
          name: "x-api-key",
          configured: true,
          state_version: "1",
          status: "active",
        },
      ],
      oauth_client: {
        client_id: "client-id",
        configured: true,
        origin: "byo",
        status: "configured",
        state_version: "1",
      },
      prepare_status: "ready",
      declarations: [],
      declaration_digest: "a".repeat(64),
      declarations_available: true,
    };
    const connector = {
      connector_id: "connector-private",
      connector_type: "mcp",
      provider_key: "private-tools",
      status: "active",
      approved_scopes: [],
      enabled: false,
      state_version: "2",
      server_id: "server-private",
      display_name: "Private tools",
      description: "",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        publicResponse({ data: { server, connector, replayed: false } }, 201),
      )
      .mockResolvedValueOnce(
        publicResponse({
          data: {
            server: { ...server, state_version: "3" },
            connector: { ...connector, enabled: true, state_version: "3" },
            declarations: [],
            replayed: false,
          },
        }),
      )
      .mockResolvedValueOnce(
        publicResponse({
          data: {
            server: { ...server, state_version: "4", display_name: "Renamed" },
            connector: { ...connector, state_version: "4" },
            replayed: false,
          },
        }),
      )
      .mockResolvedValueOnce(
        publicResponse({
          data: { server_id: "server-private", deleted: true, replayed: false },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = createHubClient();
    const registered = await client.registerPrivateMcpServer?.({
      display_name: "Private tools",
      server_url: "https://private.example/mcp",
      headers: [{ name: "x-api-key", value: "WRITE_ONLY" }],
      oauth_client: { client_id: "client-id", client_secret: "WRITE_ONLY" },
    }, "register-command-key");
    const prepared = await client.preparePrivateMcpServer?.(
      "server-private",
      registered!.server.state_version,
      "prepare-command-key",
    );
    const updated = await client.updatePrivateMcpServer?.("server-private", {
      expected_state_version: prepared!.server.state_version,
      display_name: "Renamed",
    });
    await client.deletePrivateMcpServer?.(
      "server-private",
      updated!.server.state_version,
    );
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/hub/mcp/servers",
      "/api/hub/mcp/servers/server-private/prepare",
      "/api/hub/mcp/servers/server-private",
      "/api/hub/mcp/servers/server-private",
    ]);
    const registerBody = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string,
    );
    expect(registerBody).toMatchObject({
      oauth_client: { client_id: "client-id" },
      headers: [{ name: "x-api-key" }],
    });
    expect(registered?.server.oauth_client).toEqual(
      expect.objectContaining({ client_id: "client-id", configured: true }),
    );
    expect(registered?.server).not.toHaveProperty("client_secret");
    expect(registered?.server.headers[0]).not.toHaveProperty("value");
    expect(fetchMock.mock.calls.slice(0, 2).map(([, init]) =>
      new Headers((init as RequestInit).headers).get("idempotency-key"),
    )).toEqual(["register-command-key", "prepare-command-key"]);
    for (const [, init] of fetchMock.mock.calls.slice(2))
      expect(
        new Headers((init as RequestInit).headers).get("idempotency-key"),
      ).toMatch(/^mcp-private-server:/);
  });

});

describe("personal installation consumer", () => {
  const installation = {
    display_name: "Mine",
    summary: "Summary",
    source_status: "active",
    skill_updated_at: "2026-09-30T10:00:00Z",
    example_prompts: [],
    category_keys: [],
    product: { publication_audience: "owner", state_version: "5" },
    tags: [],
    installation_id: "install-1",
    source_ref: "skill:mine-1",
    series_id: "series-1",
    revision: "18446744073709551615",
    installed: true,
    enabled: true,
    installed_at: "2026-09-30T10:00:00.000Z",
    updated_at: "2026-09-30T10:00:00.000Z",
  };
  it("preserves list envelope, false presence, exact cursor and current GET identity", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        publicResponse({
          data: [installation],
          meta: { next_cursor: "opaque +/=" },
        }),
      )
      .mockResolvedValueOnce(publicResponse({ data: installation }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createSkillInstallationClient();
    expect(
      await client.list({
        installed: false,
        enabled: false,
        source_kind: "third_party",
        query: "  report builder  ",
        limit: 50,
        cursor: "opaque +/=",
      }),
    ).toEqual({
      data: [installation],
      meta: { next_cursor: "opaque +/=" },
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "installed=false&enabled=false&source_kind=third_party&query=report+builder&limit=50&cursor=opaque+%2B%2F%3D",
    );
    expect(await client.get("install-1")).toEqual(installation);
  });
  it("keeps caller mutation key and parses real receipt instead of void", async () => {
    const receipt = {
      installation,
      change: "installed",
      event_id: "event-1",
      replayed: true,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(publicResponse({ data: receipt }));
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await createSkillInstallationClient().install(
        "skill:mine-1",
        "frozen-key",
      ),
    ).toEqual(receipt);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/hub/self/skill-installations",
      expect.objectContaining({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "frozen-key",
        },
        body: '{"source_ref":"skill:mine-1"}',
        redirect: "error",
      }),
    );
  });
});

describe("personal installation strict boundaries", () => {
  const item = {
    display_name: "Mine",
    summary: "Summary",
    source_status: "active",
    skill_updated_at: "2026-09-30T10:00:00Z",
    example_prompts: [],
    category_keys: [],
    product: { publication_audience: "owner", state_version: "5" },
    tags: [],
    installation_id: "i1",
    source_ref: "skill:s1",
    series_id: "s",
    revision: "1",
    installed: true,
    enabled: false,
    installed_at: "2026-09-30T10:00:00Z",
    updated_at: "2026-09-30T10:00:00Z",
  };
  it.each([
    { ...item, tenant: "secret" },
    { ...item, revision: "18446744073709551616" },
    { ...item, revision: 1 },
    { ...item, revision: "01" },
    { ...item, revision: "invalid" },
    { ...item, revision: "1.5" },
    { ...item, revision: "1\n" },
    { ...item, source_ref: "skill:skill:s1" },
    { ...item, source_ref: "skill:s1\n" },
    { ...item, installation_id: "i1\n" },
    { ...item, installed: false },
    { ...item, removed_at: null },
    {
      ...item,
      installed: false,
      enabled: true,
      removed_at: "2026-09-30T11:00:00Z",
    },
    { ...item, removed_at: "2026-09-30T11:00:00Z" },
    { ...item, installed_at: "2026-02-30T10:00:00Z" },
    { ...item, updated_at: "2026-09-29T10:00:00Z" },
    { ...item, installed_at: "2026-09-30T10:00:00+00:00" },
  ])("rejects malformed/private installation %#", async (data) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(publicResponse({ data })));
    await expect(
      createSkillInstallationClient().get("i1"),
    ).rejects.toMatchObject({ reason: "parse" });
  });
  it.each([
    { data: [], meta: {} },
    { data: [], meta: { next_cursor: null } },
    { data: [], meta: { next_cursor: "" } },
    { data: [], meta: { next_cursor: "é".repeat(2049) } },
    { data: [item, item] },
    { data: { installations: [] } },
    { data: [], meta: { next_cursor: "next", has_more: true } },
  ])("rejects invalid page presence or duplicate IDs %#", async (data) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(publicResponse(data)));
    await expect(createSkillInstallationClient().list()).rejects.toMatchObject({
      reason: "parse",
    });
  });
  it.each([
    { installation: item, change: "unchanged", event_id: "e", replayed: true },
    { installation: item, change: "installed", replayed: false },
    {
      installation: item,
      change: "unexpected",
      event_id: "e",
      replayed: false,
    },
    { installation: item, change: "disabled", event_id: "e", replayed: false },
    {
      installation: { ...item, source_ref: "skill:other" },
      change: "installed",
      event_id: "e",
      replayed: false,
    },
  ])("rejects malformed or wrong-operation install ACK %#", async (data) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(publicResponse({ data })));
    await expect(
      createSkillInstallationClient().install("skill:s1", "key"),
    ).rejects.toMatchObject({ reason: "parse" });
  });
  it("sends false and empty DELETE correctly, preserves receipt and removed current read", async () => {
    const removed = {
      ...item,
      installed: false,
      removed_at: "2026-09-30T10:00:00Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        publicResponse({
          data: {
            installation: item,
            change: "disabled",
            event_id: "e",
            replayed: false,
          },
        }),
      )
      .mockResolvedValueOnce(
        publicResponse({
          data: {
            installation: removed,
            change: "removed",
            event_id: "e2",
            replayed: false,
          },
        }),
      )
      .mockResolvedValueOnce(publicResponse({ data: removed }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createSkillInstallationClient();
    await client.setEnabled("i1", false, "disable-key");
    await client.remove("i1", "remove-key");
    expect(await client.get("i1")).toEqual(removed);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "PUT",
      body: '{"enabled":false}',
    });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "DELETE",
      headers: { "idempotency-key": "remove-key" },
    });
    expect(fetchMock.mock.calls[1]?.[1]).not.toHaveProperty("body");
  });
  it("uses only legal operation/status error codes and keeps safe correlation/retry fields", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        publicResponse(
          {
            error: {
              code: "skill_installation_not_found",
              message: "hidden",
              retryable: false,
            },
          },
          404,
        ),
      )
      .mockResolvedValueOnce(
        publicResponse(
          {
            error: {
              code: "skill_installation_dependency_timeout",
              message: "SENTINEL",
              retryable: true,
            },
          },
          504,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(createSkillInstallationClient().list()).rejects.toMatchObject({
      reason: "parse",
      status: 404,
    });
    await expect(
      createSkillInstallationClient().install("skill:s1", "key"),
    ).rejects.toMatchObject({
      reason: "http",
      status: 504,
      code: "skill_installation_dependency_timeout",
      retryable: true,
      requestId: "request-1",
      message: "Installation request rejected",
    });
  });
  it("rejects invalid selectors before network and propagates cancellation", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (_path: string, init: RequestInit) => {
        expect(init.signal).toBeInstanceOf(AbortSignal);
        controller.abort();
        expect(init.signal?.aborted).toBe(true);
        return publicResponse({ data: [] });
      });
    const controller = new AbortController();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createSkillInstallationClient().list({ limit: 0 }),
    ).rejects.toThrow();
    await expect(createSkillInstallationClient().get("i1\n")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(
      createSkillInstallationClient().list({}, controller.signal),
    ).rejects.toMatchObject({ reason: "aborted" });
  });
});

it("requires every current installation field and rejects unknown owner fields", async () => {
  const item = {
    installation_id: "i1",
    source_ref: "skill:s1",
    series_id: "s1",
    revision: "1",
    installed: true,
    enabled: true,
    installed_at: "2026-10-10T00:00:00Z",
    updated_at: "2026-10-10T00:00:00Z",
    display_name: "Mine",
    summary: "",
    source_status: "active",
    skill_updated_at: "2026-10-10T00:00:00Z",
    example_prompts: [],
    category_keys: [],
    product: { publication_audience: "owner", state_version: "5" },
    tags: [],
  };
  for (const field of Object.keys(item)) {
    const data: Record<string, unknown> = { ...item };
    delete data[field];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(publicResponse({ data })));
    await expect(
      createSkillInstallationClient().get("i1"),
    ).rejects.toMatchObject({ reason: "parse" });
  }
  for (const data of [
    { ...item, internal_secret: "private" },
    { ...item, product: { ...item.product, state_version: "0" } },
    { ...item, product: { ...item.product, execution_allowed: true } },
  ]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(publicResponse({ data })));
    await expect(
      createSkillInstallationClient().get("i1"),
    ).rejects.toMatchObject({ reason: "parse" });
  }
});

it("preserves current command-only 403 skill_forbidden without widening installation reads", async () => {
  const client = createSkillInstallationClient();
  for (const [command, expected] of [
    [() => client.install("skill:s1", "key"), "http"],
    [() => client.setEnabled("i1", false, "key"), "http"],
    [() => client.remove("i1", "key"), "http"],
    [() => client.list(), "parse"],
    [() => client.get("i1"), "parse"],
  ] as const) {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          publicResponse(
            {
              error: {
                code: "skill_forbidden",
                message: "Denied",
                retryable: false,
              },
            },
            403,
          ),
        ),
    );
    await expect(command()).rejects.toMatchObject({
      reason: expected,
      status: 403,
    });
  }
});

it("accepts APPS only on current catalog cards and keeps unknown catalog categories closed", () => {
  const card = {
    name: "Apps",
    description: "Current catalog",
    content_hash: "revision",
    skill_id: "series",
    scope: "official",
    installed: true,
    enabled: false,
    categories: ["apps"],
  };
  expect(skillCatalogSchema.shape.skills.element.parse(card)).toMatchObject({
    categories: ["apps"],
    installed: true,
    enabled: false,
  });
  expect(
    skillCatalogSchema.shape.skills.element.safeParse({
      ...card,
      categories: ["invented"],
    }).success,
  ).toBe(false);
  expect(
    skillCatalogSchema.shape.skills.element.safeParse({ ...card, extra: true })
      .success,
  ).toBe(false);
});

it("keeps per-read marketplace paging separate from other consumers sharing the admitted client", async () => {
  const { createManusSkillHubClient } = await import("@/ui/skills/manus-skill-client");
  const calls: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("ListHubSkills")) {
      calls.push(JSON.parse(String(init?.body)));
      return jsonResponse({ skills: [], tagOptions: {} });
    }
    return jsonResponse({ userAddedSkills: [], officialSkills: [] });
  }));
  const client = createManusSkillHubClient(createHubClient(), { admitted: true, subject: "shared-paging-reader", generation: 1 });
  await client.listSkillCatalog({ pageSize: 3, shuffle: true });
  await client.listSkillCatalog();
  expect(calls).toEqual([
    { pageSize: 3, shuffle: true, includeOfficialSkills: true },
    { pageSize: 9, includeOfficialSkills: true },
  ]);
});

it("preserves catalog revision Skill ID separately from series and checksum for package reads", async () => {
  const { createManusSkillHubClient } =
    await import("@/ui/skills/manus-skill-client");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      jsonResponse(
        String(input).endsWith("ListHubSkills")
          ? {
              skills: [
                {
                  skillId: "series-id",
                  displayName: "Live",
                  currentVersion: {
                    versionUid: "revision-id",
                    checksum: "digest",
                  },
                },
              ],
              tagOptions: {},
            }
          : { userAddedSkills: [], officialSkills: [] },
      ),
    ),
  );
  const result =
    await createManusSkillHubClient(createHubClient(), { admitted: true, subject: "reader", generation: 1 }).listSkillCatalog();
  expect(result.skills[0]).toMatchObject({
    skill_id: "series-id",
    revision_skill_id: "revision-id",
    content_hash: "digest",
  });
});

it.each(["revision-a", "revision-b"])("keeps the installed %s distinct from the latest catalog revision", async (installedRevision) => {
  const { createManusSkillHubClient } = await import("@/ui/skills/manus-skill-client");
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => jsonResponse(
    String(input).endsWith("ListHubSkills")
      ? { skills: [{ skillId: "trial-series", currentVersion: { versionUid: "revision-b" } }], tagOptions: {} }
      : { userAddedSkills: [{ id: "trial-series", version: installedRevision, installationId: "trial-installation", added: true, enabled: true }], officialSkills: [] },
  )));
  const result = await createManusSkillHubClient(createHubClient(), { admitted: true, subject: "trial-reader", generation: 1 }).listSkillCatalog();
  expect(result.skills[0]).toMatchObject({
    skill_id: "trial-series", source_ref: "skill:revision-b", revision_skill_id: "revision-b",
    installed_source_ref: `skill:${installedRevision}`, installation_id: "trial-installation", installed: true, enabled: true,
  });
});

it.each([
  [undefined, "unknown"],
  ["SKILL_HUB_PUBLISHER_TYPE_FUTURE", "unknown"],
  ["SKILL_HUB_PUBLISHER_TYPE_MANUS_OFFICIAL", "official"],
  ["SKILL_HUB_PUBLISHER_TYPE_COMMUNITY", "third_party"],
])("catalog publisher %s carries only proven source classification", async (publisherType, scope) => {
  const { createManusSkillHubClient } = await import("@/ui/skills/manus-skill-client");
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => jsonResponse(
    String(input).endsWith("ListHubSkills")
      ? { skills: [{
          skillId: "publisher-series",
          displayName: "Published skill",
          currentVersion: { versionUid: "publisher-revision" },
          ...(publisherType === undefined ? {} : { publisherType }),
        }], tagOptions: {} }
      : { userAddedSkills: [{ id: "publisher-series", installationId: "installation-publisher", added: true, enabled: false }], officialSkills: [] },
  )));
  const client = createManusSkillHubClient(createHubClient(), { admitted: true, subject: "reader", generation: 1 });
  const result = await client.listSkillCatalog();
  expect(result.skills).toHaveLength(1);
  expect(result.skills[0]).toMatchObject({
    skill_id: "publisher-series", revision_skill_id: "publisher-revision",
    source_ref: "skill:publisher-revision", installation_id: "installation-publisher",
    installed: true, enabled: false, scope,
  });
  // Missing metadata is not a third-party fact. The card remains readable and
  // bound to its real installation, but must not enter either known filter.
  for (const filter of ["official", "third_party"] as const) {
    const filtered = await client.listSkillCatalog({ scope: filter });
    expect(filtered.skills).toHaveLength(scope === filter ? 1 : 0);
  }
});

const inspected = {
  source_ref: "skill:revision-1",
  revision: "4",
  files: [{ path: "SKILL.md", size_bytes: "6" }],
  selected_file: { path: "SKILL.md", text: "实际" },
};
it("binds package text to owner revision, decimal revision, file inventory and exact UTF8 bytes", () => {
  expect(
    catalogPackageResponseSchema.safeParse({ data: inspected }).success,
  ).toBe(true);
  expect(
    catalogPackageMatches(inspected, "revision-1", "SKILL.md", {
      ...inspected,
      selected_file: null,
    }),
  ).toBe(true);
  expect(catalogPackageMatches(inspected, "series-1", "SKILL.md")).toBe(false);
  expect(catalogPackageMatches(inspected, "revision-1", "other.txt")).toBe(
    false,
  );
  expect(
    catalogPackageMatches(inspected, "revision-1", "SKILL.md", {
      ...inspected,
      revision: "5",
    }),
  ).toBe(false);
  expect(
    catalogPackageMatches(inspected, "revision-1", "SKILL.md", {
      ...inspected,
      files: [],
    }),
  ).toBe(false);
  expect(catalogPackagePrivatePath("revision-1", "文档/说明.txt")).toBe(
    "/api/hub/skills/revision-1/package?file_path=%E6%96%87%E6%A1%A3%2F%E8%AF%B4%E6%98%8E.txt",
  );
});
it("rejects package unknown fields, unsafe paths, invalid decimal revision and byte mismatches", () => {
  for (const data of [
    { ...inspected, extra: true },
    { ...inspected, revision: "0" },
    { ...inspected, revision: "18446744073709551616" },
    { ...inspected, files: [{ path: "SKILL.md", size_bytes: "06" }] },
    { ...inspected, files: [{ path: "SKILL.md", size_bytes: "2" }] },
    { ...inspected, files: [...inspected.files, ...inspected.files] },
    {
      ...inspected,
      selected_file: { path: "SKILL.md", text: "实际", extra: 1 },
    },
    ...["../SKILL.md", "/SKILL.md", "a\\b", "a//b", "e\u0301.md"].map(
      (path) => ({
        ...inspected,
        files: [{ path, size_bytes: "6" }],
        selected_file: null,
      }),
    ),
  ])
    expect(catalogPackageResponseSchema.safeParse({ data }).success).toBe(
      false,
    );
});

it("removes the retired Github URL methods from the generic Hub client", () => {
  expect(createHubClient()).not.toHaveProperty("previewGithub");
  expect(createHubClient()).not.toHaveProperty("importGithub");
});

describe("installation request total budget", () => {
  afterEach(() => vi.useRealTimers());
  it("ends a stalled fetch within the total deadline and cleans up its late body", async () => {
    vi.useFakeTimers();
    let resolve!: (response: Response) => void;
    const cancelled = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      ),
    );
    const result = createSkillInstallationClient()
      .list()
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10_001);
    const error = await Promise.race([
      result,
      Promise.resolve("still pending"),
    ]);
    expect(error).toBeInstanceOf(HubClientError);
    resolve(new Response(new ReadableStream({ cancel: cancelled })));
    await Promise.resolve();
    await Promise.resolve();
    expect(cancelled).toHaveBeenCalledOnce();
  });
  it("cancels an oversized installation stream before parsing", async () => {
    const cancelled = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(1_048_577));
            },
            cancel: cancelled,
          }),
          {
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store",
              "x-request-id": "request-1",
            },
          },
        ),
      ),
    );
    const result = createSkillInstallationClient()
      .list()
      .catch((error: unknown) => error);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(
      await Promise.race([result, Promise.resolve("still pending")]),
    ).toMatchObject({ reason: "parse" });
    expect(cancelled).toHaveBeenCalledOnce();
  });
  it("cancels a stalled body when its caller leaves", async () => {
    const controller = new AbortController(),
      cancelled = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new ReadableStream({ cancel: cancelled }), {
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-request-id": "request-1",
          },
        }),
      ),
    );
    const result = createSkillInstallationClient()
      .list({}, controller.signal)
      .catch((error: unknown) => error);
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(
      await Promise.race([result, Promise.resolve("still pending")]),
    ).toMatchObject({ reason: "aborted" });
    expect(cancelled).toHaveBeenCalledOnce();
  });
});


describe("explicit installation update", () => {
  const installation = {
    installation_id: "installation-1", series_id: "series-1", source_ref: "skill:revision-b", revision: "2",
    installed: true, enabled: false, installed_at: "2026-10-15T10:00:00Z", updated_at: "2026-10-16T10:00:00Z",
    display_name: "Same installation", summary: "B", source_status: "active", skill_updated_at: "2026-10-16T09:00:00Z",
    tags: [], example_prompts: [], category_keys: [], product: { publication_audience: "owner", state_version: "2" },
  };
  const body = { expected_source_ref: "skill:revision-a", source_ref: "skill:revision-b" };
  const receipt = { installation, change: "upgraded", event_id: "event-update", replayed: false };
  it("sends both frozen pins with the original key; a disabled installation stays disabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue(publicResponse({ data: receipt })); vi.stubGlobal("fetch", fetchMock);
    expect(await createSkillInstallationClient().update("installation-1", body, "update-key")).toEqual(receipt);
    expect(fetchMock).toHaveBeenCalledWith("/api/hub/self/skill-installations/installation-1/update", expect.objectContaining({
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": "update-key" }, body: JSON.stringify(body), redirect: "error", cache: "no-store",
    }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...receipt, change: "unchanged", event_id: undefined }, { ...receipt, change: "installed" },
    { ...receipt, event_id: undefined }, { ...receipt, installation: { ...installation, installation_id: "other" } },
    { ...receipt, installation: { ...installation, source_ref: "skill:revision-c" } },
    { ...receipt, installation: { ...installation, installed: false, removed_at: installation.updated_at } },
    { ...receipt, private_token: "hidden" },
  ])("rejects an update ACK for a different command or phase %#", async wrong => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(publicResponse({ data: wrong })));
    await expect(createSkillInstallationClient().update("installation-1", body, "update-key")).rejects.toMatchObject({ reason: "parse" });
  });
  it.each([
    { ...body, expected_source_ref: "skill:revision-a\n" }, { ...body, source_ref: "skill:revision-b\n" },
    { ...body, enabled: true }, { source_ref: body.source_ref }, { ...body, expected_source_ref: null },
  ])("rejects invalid update input without dispatch %#", async input => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(createSkillInstallationClient().update("installation-1", input as typeof body, "update-key")).rejects.toBeInstanceOf(Error);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

it("Custom API creation uses its caller command key and binds the safe ACK to the frozen input", async () => {
  const body = { name: "Original API", environment: [{ name: "DUMMY_KEY", value: "fixture-only" }] }
  const profile = { profile_id: "api-command-profile", name: body.name, state_version: "1", created_at: "2026-10-16T12:00:00Z", updated_at: "2026-10-16T12:00:00Z", environment: [{ name: "DUMMY_KEY", configured: true, state_version: "1", status: "active" }] }
  const request = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("lost response"))
    .mockImplementation(async () => publicResponse({ data: { custom_api: profile, replayed: true } }, 201))
  const hub = createHubClient()
  await expect(hub.createCustomApi!(body, "original-api-key")).rejects.toBeInstanceOf(HubClientError)
  await expect(hub.createCustomApi!(body, "original-api-key")).resolves.toEqual(profile)
  expect(request).toHaveBeenCalledTimes(2)
  for (const [path, init] of request.mock.calls) {
    expect(path).toBe("/api/hub/connectors/custom-apis")
    expect(new Headers(init?.headers).get("idempotency-key")).toBe("original-api-key")
    expect(JSON.parse(String(init?.body))).toEqual(body)
  }
  request.mockImplementation(async () => publicResponse({ data: { custom_api: { ...profile, name: "Another API" }, replayed: false } }, 201))
  await expect(hub.createCustomApi!(body, "binding-check-key")).rejects.toMatchObject({ reason: "parse" })
})

it.each(["", "invalid\nkey", "k".repeat(192)])("Custom API rejects an invalid caller key before dispatch", async key => {
  const request = vi.fn<typeof fetch>()
  vi.stubGlobal("fetch", request)
  await expect(createHubClient().createCustomApi!({ name: "Valid API", environment: [] }, key)).rejects.toBeInstanceOf(Error)
  expect(request).not.toHaveBeenCalled()
})


it("MCP JSON import keeps its caller key and entire original document and rejects an unrelated ACK", async () => {
  const document = ' {"mcpServers":{"Original import":{"type":"streamableHttp","url":"https://mcp.example.test/original"}}} '
  const server = { server_id: "json-server", display_name: "Original import", server_url: "https://mcp.example.test/original", status: "pending", state_version: "1", headers: [], prepare_status: "pending_prepare", declarations: [], declarations_available: false }
  const connector = { connector_id: "json-connector", connector_type: "mcp", provider_key: "private-json", server_id: server.server_id, status: "pending", approved_scopes: [], enabled: false, state_version: "1" }
  const receipt = { imports: [{ server, connector }], replayed: true }
  const request = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("lost response"))
    .mockImplementation(async () => publicResponse({ data: receipt }, 201))
  vi.stubGlobal("fetch", request)
  const hub = createHubClient()
  await expect(hub.importPrivateMcpJson!(document, "original-json-key")).rejects.toBeInstanceOf(HubClientError)
  await expect(hub.importPrivateMcpJson!(document, "original-json-key")).resolves.toEqual(receipt)
  for (const [path, init] of request.mock.calls) {
    expect(path).toBe("/api/hub/mcp/servers/import")
    expect(new Headers(init?.headers).get("idempotency-key")).toBe("original-json-key")
    expect(JSON.parse(String(init?.body))).toEqual({ config_json: document })
  }
  request.mockImplementation(async () => publicResponse({ data: { ...receipt, imports: [{ server: { ...server, server_url: "https://mcp.example.test/unrelated" }, connector }] } }, 201))
  await expect(hub.importPrivateMcpJson!(document, "mismatched-json-key")).rejects.toMatchObject({ reason: "parse" })
})

it.each(["", "invalid\nkey", "k".repeat(192)])("MCP JSON import rejects an invalid caller key before dispatch", async key => {
  const request = vi.fn<typeof fetch>()
  vi.stubGlobal("fetch", request)
  await expect(createHubClient().importPrivateMcpJson!("{}", key)).rejects.toBeInstanceOf(Error)
  expect(request).not.toHaveBeenCalled()
})


it("reads an exact MCP connector and rejects a mismatched owner locator", async () => {
  const connector = { connector_id: "exact-connector", connector_type: "mcp", provider_key: "private-exact", server_id: "exact-server", status: "pending", approved_scopes: [], enabled: false, state_version: "7" }
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(publicResponse({ data: { connector } }))
    .mockResolvedValueOnce(publicResponse({ data: { connector: { ...connector, connector_id: "wrong-connector" } } }))
  vi.stubGlobal("fetch", request)
  const hub = createHubClient()
  await expect(hub.getMcpConnector!("exact-connector")).resolves.toEqual(connector)
  expect(request.mock.calls[0]?.[0]).toBe("/api/hub/mcp/connectors/exact-connector")
  await expect(hub.getMcpConnector!("exact-connector")).rejects.toMatchObject({ reason: "parse" })
})

it.each(["", "invalid\nkey", "k".repeat(192)])("private MCP creation commands reject invalid caller keys without I/O", async key => {
  const request = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", request)
  const hub = createHubClient()
  await expect(hub.registerPrivateMcpServer!({ display_name: "Valid MCP", server_url: "https://mcp.example.test/valid" }, key)).rejects.toBeInstanceOf(Error)
  await expect(hub.preparePrivateMcpServer!("valid-server", "1", key)).rejects.toBeInstanceOf(Error)
  expect(request).not.toHaveBeenCalled()
})

it("carries published MCP recovery reasons through the Hub once without replacing its original command", async () => {
  const fetchMock = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", fetchMock);
  const hub = createHubClient();
  for (const [code, status, retryable] of [
    ["mcp_personal_command_outcome_unknown", 503, false],
    ["mcp_personal_command_replay_expired", 412, false],
    ["mcp_personal_command_ownership_lost", 409, false],
    ["mcp_personal_not_prepared", 412, false],
    ["mcp_personal_needs_client", 412, false],
    ["mcp_personal_auth_method_unsupported", 412, false],
  ] as const) {
    fetchMock.mockResolvedValueOnce(publicResponse({ error: { code, message: "Safe failure", retryable } }, status));
    const before = fetchMock.mock.calls.length;
    await expect(hub.preparePrivateMcpServer!("private-server", "4", "original-prepare-key")).rejects.toMatchObject({ reason: "http", status, code, retryable });
    expect(fetchMock).toHaveBeenCalledTimes(before + 1);
    const [, init] = fetchMock.mock.calls.at(-1)!;
    expect(new Headers(init?.headers).get("idempotency-key")).toBe("original-prepare-key");
    expect(JSON.parse(String(init?.body))).toEqual({ expected_state_version: "4" });
  }
  const code = "mcp_personal_needs_client";
  fetchMock.mockResolvedValueOnce(publicResponse({ error: { code, message: "Safe failure", retryable: false } }, 412));
  await expect(hub.beginMcpConnectorAuthorization!("connector-one", { server_id: "private-server", expected_state_version: "4" })).rejects.toMatchObject({ reason: "http", code });
  expect(new Headers(fetchMock.mock.calls.at(-1)![1]?.headers).has("idempotency-key")).toBe(false);
});

it("rejects malformed Custom API error tuples and write receipt errors on reads", async () => {
  const fetchMock = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", fetchMock);
  const hub = createHubClient();
  for (const [code, status, retryable] of [
    ["custom_api_command_outcome_unknown", 503, true],
    ["custom_api_command_replay_expired", 409, false],
    ["unpublished_custom_error", 503, true],
    ["custom_api_not_found", 404, false],
    ["custom_api_dependency_unavailable", 418, true],
  ] as const) {
    fetchMock.mockResolvedValueOnce(publicResponse({ error: { code, message: "Safe failure", retryable } }, status));
    await expect(hub.createCustomApi!({ name: "Test", environment: [] }, "original-api-key")).rejects.toMatchObject({ reason: "parse" });
  }
  fetchMock.mockResolvedValueOnce(publicResponse({ error: { code: "custom_api_command_outcome_unknown", message: "Safe failure", retryable: false } }, 503));
  await expect(hub.listCustomApis!()).rejects.toMatchObject({ reason: "parse" });
  expect(fetchMock).toHaveBeenCalledTimes(6);
});


it("accepts all published Custom API recovery tuples and keeps ordinary dependency failures separate", async () => {
  const fetchMock = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", fetchMock);
  const hub = createHubClient();
  for (const [code, status, retryable] of [
    ["custom_api_command_in_progress", 409, true], ["custom_api_command_outcome_unknown", 503, false],
    ["custom_api_command_replay_expired", 412, false], ["custom_api_conflict", 409, false],
    ["custom_api_command_ownership_lost", 409, false], ["custom_api_response_invalid", 502, false],
    ["custom_api_dependency_unavailable", 503, true],
  ] as const) {
    fetchMock.mockResolvedValueOnce(publicResponse({ error: { code, message: "Safe failure", retryable } }, status));
    await expect(hub.createCustomApi!({ name: "Test", environment: [] }, "original-api-key")).rejects.toMatchObject({ reason: "http", code, status, retryable });
  }
  expect(fetchMock).toHaveBeenCalledTimes(7);
});

it("does not acknowledge a Custom API management response for another profile", async () => {
  const fetchMock = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", fetchMock);
  const wrong = { profile_id: "other-profile", name: "Edited", state_version: "2", created_at: "2026-10-16T12:00:00Z", updated_at: "2026-10-16T12:00:00Z", environment: [] };
  fetchMock.mockResolvedValueOnce(publicResponse({ data: { custom_api: wrong, replayed: false } }));
  await expect(createHubClient().updateCustomApi!("target-profile", { expected_state_version: "1", name: "Edited" }, "management-key")).rejects.toMatchObject({ reason: "parse" });
  fetchMock.mockResolvedValueOnce(publicResponse({ data: { profile_id: "other-profile", deleted: true, replayed: false } }));
  await expect(createHubClient().removeCustomApi!("target-profile", { expected_state_version: "1" }, "management-key")).rejects.toMatchObject({ reason: "parse" });
});

it("binds API edit ACK fields and descriptors and preserves the explicit management key", async () => {
  const fetchMock = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", fetchMock);
  const profile = { profile_id: "managed-api", name: "Edited", instructions: "New note", state_version: "3", created_at: "2026-10-16T12:00:00Z", updated_at: "2026-10-16T12:00:00Z", environment: [{ name: "SECRET", configured: true, status: "active", state_version: "1" }] };
  const input = { expected_state_version: "1", name: "Edited", instructions: "New note", environment_upserts: [{ name: "SECRET", value: "fixture-only" }], environment_removals: ["OLD_SECRET"] };
  const hub = createHubClient();
  for (const wrong of [ { ...profile, name: "Other" }, { ...profile, instructions: "Old note" }, { ...profile, environment: [] }, { ...profile, environment: [{ ...profile.environment[0], configured: false }] }, { ...profile, environment: [...profile.environment, { ...profile.environment[0], name: "OLD_SECRET" }] }, { ...profile, environment: [...profile.environment, ...profile.environment] } ]) {
    fetchMock.mockResolvedValueOnce(publicResponse({ data: { custom_api: wrong, replayed: false } }));
    await expect(hub.updateCustomApi!("managed-api", input, "management-key")).rejects.toMatchObject({ reason: "parse" });
  }
  fetchMock.mockResolvedValueOnce(publicResponse({ data: { custom_api: profile, replayed: true } }));
  await expect(hub.updateCustomApi!("managed-api", input, "management-key")).resolves.toEqual(profile);
  fetchMock.mockResolvedValueOnce(publicResponse({ data: { custom_api: profile, replayed: true } }));
  await expect(hub.updateCustomApi!("managed-api", { expected_state_version: "1", clear_instructions: true }, "management-key")).rejects.toMatchObject({ reason: "parse" });
  fetchMock.mockResolvedValueOnce(publicResponse({ data: { profile_id: "managed-api", deleted: true, replayed: true } }));
  await expect(hub.removeCustomApi!("managed-api", { expected_state_version: "1" }, "management-key")).resolves.toBeUndefined();
  for (const [, request] of fetchMock.mock.calls) expect(new Headers(request?.headers).get("Idempotency-Key")).toBe("management-key");
});
