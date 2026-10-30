import { createProjectSkillSelectionClient } from "@/hub/project-skill-selection-client";
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
import { getManusSkillPackage } from "@/ui/skills/manus-skill-client";

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
    const connector = { availability: "available" as const,
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
                display_name: "New connector",
                description: "",
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
      }, "provider-create-original"),
    ).resolves.toMatchObject({ connector_id: "connector-2", enabled: false });
    await expect(
      client.updateMcpConnector("connector-1", {
        display_name: "Renamed",
        description: "Ready",
        expected_state_version: "2",
      }, "management-key"),
    ).resolves.toMatchObject({ display_name: "Renamed", state_version: "3" });
    await expect(
      client.setMcpConnectorEnabled("connector-1", {
        enabled: false,
        expected_state_version: "2",
      }, "management-key"),
    ).resolves.toMatchObject({ enabled: false });
    await expect(
      client.removeMcpConnector("connector-1", { expected_state_version: "2" }, "management-key"),
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
    ).toBe("provider-create-original");
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
    const connector = { availability: "unavailable" as const,
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
    const server = { availability: "available" as const,
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
      transport: "streamable_http" as const, prepare_status: "ready",
      declarations: [],
      declaration_digest: "a".repeat(64),
      declarations_available: true,
    };
    const connector = { availability: "available" as const,
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
    }, "update-command-key");
    await client.deletePrivateMcpServer?.(
      "server-private",
      updated!.server.state_version,
      "delete-command-key",
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
    expect(fetchMock.mock.calls.slice(2).map(([, init]) =>
      new Headers((init as RequestInit).headers).get("idempotency-key"),
    )).toEqual(["update-command-key", "delete-command-key"]);
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
  it("routes project lifecycle to the project without changing personal defaults or exact receipts", async () => {
    const projectId = "project_11111111-1111-4111-8111-111111111111";
    const receipt = { installation, change: "installed", event_id: "event-1", replayed: false };
    const fetchMock = vi.fn().mockResolvedValueOnce(publicResponse({ data: [installation] }))
      .mockResolvedValueOnce(publicResponse({ data: receipt }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createSkillInstallationClient({ projectId });
    expect(await client.list({ installed: true })).toEqual({ data: [installation] });
    expect(await client.install(installation.source_ref, "project-install-key")).toEqual(receipt);
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      `/api/hub/projects/${projectId}/skill-installations?installed=true`,
      `/api/hub/projects/${projectId}/skill-installations`,
    ]);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ body: JSON.stringify({ source_ref: installation.source_ref }) });
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
  const server = { availability: "unavailable" as const, server_id: "json-server", display_name: "Original import", server_url: "https://mcp.example.test/original", status: "pending", state_version: "1", headers: [], transport: "streamable_http" as const, prepare_status: "pending_prepare", declarations: [], declarations_available: false }
  const connector = { availability: "unavailable" as const, connector_id: "json-connector", connector_type: "mcp", provider_key: "private-json", server_id: server.server_id, status: "pending", approved_scopes: [], enabled: false, state_version: "1" }
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
  const connector = { availability: "unavailable" as const, connector_id: "exact-connector", connector_type: "mcp", provider_key: "private-exact", server_id: "exact-server", status: "pending", approved_scopes: [], enabled: false, state_version: "7" }
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

it("rejects MCP management ACKs bound to another target instead of acknowledging the requested write", async () => {
  const fetchMock = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", fetchMock);
  const hub = createHubClient();
  const connector = { availability: "available" as const, connector_id: "other-connector", connector_type: "mcp", provider_key: "fixture", display_name: "Edited", description: "Note", status: "active", enabled: false, approved_scopes: [], state_version: "2" };
  for (const action of [() => hub.updateMcpConnector("target-connector", { display_name: "Edited", description: "Note", expected_state_version: "1" }, "management-key"), () => hub.setMcpConnectorEnabled("target-connector", { enabled: false, expected_state_version: "1" }, "management-key"), () => hub.removeMcpConnector("target-connector", { expected_state_version: "1" }, "management-key")]) {
    fetchMock.mockResolvedValueOnce(publicResponse({ data: { connector } }));
    await expect(action()).rejects.toMatchObject({ reason: "parse" });
  }
  const server = { availability: "unavailable" as const, server_id: "other-server", display_name: "Edited", server_url: "https://mcp.example.test/", status: "pending", state_version: "2", headers: [], transport: "streamable_http" as const, prepare_status: "pending_prepare", declarations: [], declarations_available: false };
  fetchMock.mockResolvedValueOnce(publicResponse({ data: { server, connector: { ...connector, server_id: server.server_id }, replayed: false } }));
  await expect(hub.updatePrivateMcpServer!("target-server", { expected_state_version: "1", display_name: "Edited" }, "management-key")).rejects.toMatchObject({ reason: "parse" });
  fetchMock.mockResolvedValueOnce(publicResponse({ data: { server_id: "other-server", deleted: true, replayed: false } }));
  await expect(hub.deletePrivateMcpServer!("target-server", "1", "management-key")).rejects.toMatchObject({ reason: "parse" });
});

it("requires private MCP edit ACKs to reflect the explicitly written safe fields and header descriptors", async () => {
  const fetchMock = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", fetchMock);
  const hub = createHubClient();
  const connector = { availability: "unavailable" as const, connector_id: "edited-connector", server_id: "edited-server", connector_type: "mcp", provider_key: "fixture", display_name: "Edited", description: "Note", status: "pending", enabled: false, approved_scopes: [], state_version: "2" };
  const server = { availability: "unavailable" as const, server_id: "edited-server", display_name: "Edited", server_url: "https://mcp.example.test/new", notes: "New note", status: "pending", state_version: "2", headers: [{ name: "x-test", configured: true, status: "active", state_version: "1" }], transport: "streamable_http" as const, prepare_status: "pending_prepare", declarations: [], declarations_available: false };
  const input = { expected_state_version: "1", display_name: "Edited", server_url: "https://mcp.example.test/new", notes: "New note", header_upserts: [{ name: "x-test", value: "fixture-only" }], header_removals: ["x-old"] };
  for (const wrong of [{ ...server, display_name: "Other" }, { ...server, server_url: "https://mcp.example.test/old" }, { ...server, notes: "Old note" }, { ...server, headers: [] }, { ...server, headers: [...server.headers, { name: "x-old", configured: true, status: "active", state_version: "1" }] }]) {
    fetchMock.mockResolvedValueOnce(publicResponse({ data: { server: wrong, connector, replayed: false } }));
    await expect(hub.updatePrivateMcpServer!("edited-server", input, "management-key")).rejects.toMatchObject({ reason: "parse" });
  }
  fetchMock.mockResolvedValueOnce(publicResponse({ data: { server, connector, replayed: true } }));
  await expect(hub.updatePrivateMcpServer!("edited-server", input, "management-key")).resolves.toMatchObject({ server });
});

describe("Project default Skill selection", () => {
  const projectId = "project_11111111-1111-4111-8111-111111111111";
  it("preserves ordered defaults and explicit clear without changing caller intent or replay key", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(publicResponse({ data: { project_id: projectId, installation_ids: ["i2", "i1"] } }))
      .mockResolvedValueOnce(publicResponse({ data: { project_id: projectId, installation_ids: [] } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createProjectSkillSelectionClient(projectId);
    expect((await client.get()).installation_ids).toEqual(["i2", "i1"]);
    const ids: string[] = [];
    const saved = client.replace(ids, "original-selection-key");
    ids.push("changed-after-dispatch");
    expect((await saved).installation_ids).toEqual([]);
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/api/hub/projects/${projectId}/skill-selection`, expect.objectContaining({
      method: "PUT", body: '{"installation_ids":[]}', cache: "no-store", redirect: "error",
      headers: expect.objectContaining({ "idempotency-key": "original-selection-key" }),
    }));
    expect(() => client.replace(["i1", "i1"], "key")).toThrow();
    expect(() => client.replace(Array.from({ length: 17 }, (_, i) => `i${i}`), "key")).toThrow();
    expect(() => createProjectSkillSelectionClient("slug")).toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("rejects wrong project, reordered ACK and unexpected fields instead of claiming selection saved", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const client = createProjectSkillSelectionClient(projectId);
    for (const data of [
      { project_id: "project_22222222-2222-4222-8222-222222222222", installation_ids: ["i1", "i2"] },
      { project_id: projectId, installation_ids: ["i2", "i1"] },
      { project_id: projectId, installation_ids: ["i1", "i2"], source_refs: ["skill:new-current"] },
    ]) {
      fetchMock.mockResolvedValueOnce(publicResponse({ data }));
      await expect(client.replace(["i1", "i2"], "same-key")).rejects.toMatchObject({ reason: "parse" });
    }
    fetchMock.mockRejectedValueOnce(new Error("commit response lost"));
    await expect(client.replace(["i1", "i2"], "same-key")).rejects.toMatchObject({ reason: "network" });
    expect(fetchMock).toHaveBeenCalledTimes(4); // no automatic retry or new-key command
  });
  it("cancels stalled selection bytes within the original budget, without a second request", async () => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn();
      const fetchMock = vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"data":')); }, cancel }), {
        headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "selection-body" },
      }));
      vi.stubGlobal("fetch", fetchMock);
      const pending = createProjectSkillSelectionClient(projectId).get();
      const rejected = expect(pending).rejects.toMatchObject({ reason: "network" });
      await vi.advanceTimersByTimeAsync(10_001);
      await rejected;
      expect(cancel).toHaveBeenCalled(); expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});

it("reads an exact provider outside the first catalog page and rejects a different identity", async () => {
  const provider = { provider_key: "outside-page", display_name: "Outside", directory_type: "app", category_keys: [], example_prompts: [], enabled: true, state_version: "1" };
  const fetchMock = vi.fn().mockResolvedValueOnce(publicResponse({ data: { provider } }))
    .mockResolvedValueOnce(publicResponse({ data: { provider: { ...provider, provider_key: "different" } } }));
  vi.stubGlobal("fetch", fetchMock);
  const client = createHubClient();
  await expect(client.getMcpConnectorProvider("outside-page")).resolves.toEqual(provider);
  expect(fetchMock.mock.calls[0]![0]).toBe("/api/hub/mcp/providers/outside-page");
  await expect(client.getMcpConnectorProvider("outside-page")).rejects.toMatchObject({ reason: "parse" });
});

it.each(["provider_key", "display_name", "description"] as const)("rejects a Provider Create ACK with mismatched %s while preserving caller identity", async field => {
  const input = { provider_key: "bound-provider", connector_type: "mcp" as const, display_name: "Original", description: "Original description" };
  const connector = { ...input, connector_id: "bound-create", status: "pending", enabled: false, approved_scopes: [], state_version: "1", [field]: "other" };
  const fetchMock = vi.fn().mockResolvedValue(publicResponse({ data: { connector } }, 201));
  vi.stubGlobal("fetch", fetchMock);
  await expect(createHubClient().createMcpConnector(input, "same-original-key")).rejects.toMatchObject({ reason: "parse" });
  expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("idempotency-key")).toBe("same-original-key");
  expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual(input);
});

it("MCP icons use all five same-origin operations and reject a mismatched command ACK", async () => {
  const id = "12345678-1234-1234-1234-123456789abc", at = "2099-01-01T00:00:00Z";
  const intent = { intent_id: id, state: "ready", state_version: "3", filename: "icon.png", mime_type: "image/png", content_sha256: "a".repeat(64), size_bytes: "8", expires_at: at, expired: false, width: 24, height: 24, created_at: at, updated_at: at };
  const fetch = vi.fn<typeof globalThis.fetch>(); vi.stubGlobal("fetch", fetch);
  const client = createHubClient().mcpIcons!;
  const operations = [
    { path: "uploads", action: () => client.begin({ filename: "icon.png", mime_type: "image/png", content_sha256: "a".repeat(64), size_bytes: "8" }, "icon-original"), data: { intent: { ...intent, state: "staged", state_version: "1", width: undefined, height: undefined }, replayed: false } },
    { path: "import", action: () => client.importUrl({ image_url: "https://images.example/icon.png" }, "icon-original"), data: { intent, replayed: false } },
    { path: `${id}/complete`, action: () => client.complete(id, { expected_state_version: "1", source_version_id: "exact-version" }, "icon-original"), data: { intent, replayed: false } },
    { path: `${id}/cancel`, action: () => client.cancel(id, { expected_state_version: "3" }, "icon-original"), data: { intent: { ...intent, state: "released", state_version: "5" }, replayed: false } },
    { path: id, action: () => client.get(id), data: { intent } },
  ];
  for (const operation of operations) {
    fetch.mockResolvedValueOnce(publicResponse({ data: operation.data }));
    await expect(operation.action()).resolves.toEqual(operation.data);
    const [url, options] = fetch.mock.calls.at(-1)!;
    expect(url).toBe(`/api/hub/mcp/icons/${operation.path}`);
    expect(options?.method ?? "GET").toBe(operation.path === id ? "GET" : "POST");
    expect(new Headers(options?.headers).get("idempotency-key")).toBe(operation.path === id ? null : "icon-original");
  }
  fetch.mockResolvedValueOnce(publicResponse({ data: { intent, replayed: false } }));
  await expect(client.cancel(id, { expected_state_version: "1" }, "icon-original")).rejects.toMatchObject({ reason: "parse" });
  expect(fetch).toHaveBeenCalledTimes(6);
});

it("SSE Hub keeps fresh Current separate from exact historical ACK and never falls back to HTTP", async () => {
 const server = { availability: "unavailable", server_id: "sse-server", display_name: "SSE", server_url: "https://example.test/sse", transport: "sse_compat", status: "pending", state_version: "1", headers: [], prepare_status: "pending_prepare", declarations: [], declarations_available: false };
 const connector = { availability: "unavailable", connector_id: "sse-connector", server_id: server.server_id, provider_key: "private-sse", connector_type: "mcp", status: "pending", enabled: false, state_version: "1", approved_scopes: [] };
 const legacy = Object.fromEntries(Object.entries(server).filter(([key]) => key !== "transport"));
 const fetch = vi.fn<typeof globalThis.fetch>(); vi.stubGlobal("fetch", fetch); const hub = createHubClient();
 const input = { display_name: server.display_name, server_url: server.server_url, transport: "sse_compat" as const };
 fetch.mockResolvedValueOnce(publicResponse({ data: { server, connector, replayed: false } }, 201));
 await expect(hub.registerPrivateMcpServer!(input, "sse-key")).resolves.toMatchObject({ server });
 expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual(input);
 for (const transport of ["streamable_http", "sse_compat"] as const) {
  fetch.mockResolvedValueOnce(publicResponse({ data: { server: legacy, connector, replayed: true } }, 201));
  await expect(hub.registerPrivateMcpServer!({ ...input, transport }, "explicit-key")).rejects.toMatchObject({ reason: "parse" });
 }
 const oldBody = { display_name: input.display_name, server_url: input.server_url };
 fetch.mockResolvedValueOnce(publicResponse({ data: { server: legacy, connector, replayed: true } }, 201));
 const result = await hub.registerPrivateMcpServer!(oldBody, "old-key"); expect(Object.hasOwn(result.server, "transport")).toBe(false);
 fetch.mockResolvedValueOnce(publicResponse({ data: { server: legacy } })); await expect(hub.getPrivateMcpServer!(server.server_id)).rejects.toMatchObject({ reason: "parse" });
 expect(fetch).toHaveBeenCalledTimes(5); expect(JSON.parse(String(fetch.mock.calls[3]?.[1]?.body))).toEqual(oldBody);
});

describe("bounded MCP GET rate-limit cooldown", () => {
  function limited(retryAfter: string | null = "1", retryable = true): Response {
    const response = publicResponse({ error: { code: "session_rate_limited", message: "limited", retryable } }, 429);
    if (retryAfter !== null) response.headers.set("retry-after", retryAfter);
    return response;
  }
  const reads = [
    { name: "connections", read: (signal?: AbortSignal) => createHubClient().listMcpConnections({}, signal), success: { data: { connections: [] } } },
    { name: "connectors", read: (signal?: AbortSignal) => createHubClient().listMcpConnectors!({}, signal), success: { data: { items: [], next_cursor: null } } },
    { name: "providers", read: (signal?: AbortSignal) => createHubClient().listMcpConnectorProviders!({}, signal), success: { data: { items: [], next_cursor: null } } },
  ];

  for (const { name, read, success } of reads) {
    it(`${name}: preserves validated 429 metadata and recovers after exactly one indicated second`, async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
      try {
        const fetchMock = vi.fn().mockResolvedValueOnce(limited()).mockResolvedValueOnce(publicResponse(success));
        vi.stubGlobal("fetch", fetchMock);
        const outcome = read().then((value) => ({ value }), (error: unknown) => ({ error }));
        await vi.advanceTimersByTimeAsync(999);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(await outcome).toHaveProperty("value");
        expect(fetchMock.mock.calls[1]?.[0]).toBe(fetchMock.mock.calls[0]?.[0]);
        expect(fetchMock.mock.calls[1]?.[1]).toEqual(fetchMock.mock.calls[0]?.[1]);
      } finally { vi.useRealTimers(); }
    });

    it(`${name}: aborting the cooldown retires the second dispatch`, async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
      try {
        const controller = new AbortController();
        const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(limited()));
        vi.stubGlobal("fetch", fetchMock);
        const outcome = read(controller.signal).catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(500);
        controller.abort();
        await vi.advanceTimersByTimeAsync(1000);
        expect(await outcome).toMatchObject({ reason: "aborted" });
        expect(fetchMock).toHaveBeenCalledTimes(1);
      } finally { vi.useRealTimers(); }
    });

    it(`${name}: a second 429 stays terminal without a third GET`, async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
      try {
        const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(limited()));
        vi.stubGlobal("fetch", fetchMock);
        const outcome = read().catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(9000);
        expect(await outcome).toMatchObject({ reason: "http", status: 429, retryable: true, retryAfter: "1" });
        expect(fetchMock).toHaveBeenCalledTimes(2);
      } finally { vi.useRealTimers(); }
    });

    it(`${name}: both response bodies share the original absolute ten-second budget`, async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
      const controller = new AbortController();
      const cancel = vi.fn();
      try {
        const fetchMock = vi.fn()
          .mockImplementationOnce(() => new Promise<Response>((resolve) => setTimeout(() => resolve(limited()), 8000)))
          .mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({
            start(stream) { stream.enqueue(new TextEncoder().encode(JSON.stringify(success))); }, cancel,
          }), { headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "second-read" } }));
        vi.stubGlobal("fetch", fetchMock);
        let result: unknown;
        void read(controller.signal).then((value) => { result = value; }, (error: unknown) => { result = error; });
        await vi.advanceTimersByTimeAsync(9999);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(result).toBeUndefined();
        await vi.advanceTimersByTimeAsync(1);
        expect(result).toMatchObject({ reason: "aborted", status: 200 });
        expect(cancel).toHaveBeenCalledTimes(1);
      } finally { controller.abort(); vi.useRealTimers(); }
    });
  }

  it.each([null, "0", "01", "+1", "1.0", "-1", "99999", "86400", "Wed, 21 Oct 2026 07:28:00 GMT"])("connections: missing, invalid or over-budget delay %s never invents a retry", async (retryAfter) => {
    const fetchMock = vi.fn().mockResolvedValue(limited(retryAfter));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createHubClient().listMcpConnections()).rejects.toMatchObject({ reason: "http", status: 429, retryAfter });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("nonretryable and malformed 429 responses never trigger a cooldown", async () => {
    const malformed = publicResponse({ error: { code: "session_rate_limited", message: "limited", retryable: true }, extra: true }, 429);
    malformed.headers.set("retry-after", "1");
    const fetchMock = vi.fn().mockResolvedValueOnce(limited("1", false)).mockResolvedValueOnce(malformed);
    vi.stubGlobal("fetch", fetchMock);
    await expect(createHubClient().listMcpConnections()).rejects.toMatchObject({ reason: "http", retryable: false });
    await expect(createHubClient().listMcpConnections()).rejects.toMatchObject({ reason: "parse" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a registration POST retains its original body and key and is never resent", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    try {
      const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(limited()));
      vi.stubGlobal("fetch", fetchMock);
      const body = { display_name: "Private tools", server_url: "https://fixture.invalid/mcp" };
      const outcome = createHubClient().registerPrivateMcpServer!(body, "original-register-key").catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(2000);
      expect(await outcome).toMatchObject({ reason: "http", status: 429 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: JSON.stringify(body), headers: expect.objectContaining({ "Idempotency-Key": "original-register-key" }) });
    } finally { vi.useRealTimers(); }
  });
  it.each([
    { name: "provider", read: () => createHubClient().getMcpConnectorProvider("fixture-provider") },
    { name: "connector", read: () => createHubClient().getMcpConnector!("fixture-connector") },
    { name: "server", read: () => createHubClient().getPrivateMcpServer!("fixture-server") },
  ])("$name exact metadata GET is eligible, but still stops after a second 429", async ({ read }) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    try {
      const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(limited()));
      vi.stubGlobal("fetch", fetchMock);
      const outcome = read().catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(9000);
      expect(await outcome).toMatchObject({ reason: "http", status: 429 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1]?.[0]).toBe(fetchMock.mock.calls[0]?.[0]);
    } finally { vi.useRealTimers(); }
  });

  it("a valid delay that cannot fit after the first response fails immediately as the original 429", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    try {
      const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => setTimeout(() => resolve(limited("2")), 8500)));
      vi.stubGlobal("fetch", fetchMock);
      let result: unknown;
      void createHubClient().listMcpConnections().catch((error: unknown) => { result = error; });
      await vi.advanceTimersByTimeAsync(8500);
      expect(result).toMatchObject({ reason: "http", status: 429, retryAfter: "2" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it("cancels a second response arriving after the original deadline rather than accepting it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    try {
      const cancel = vi.fn();
      let resolveLate: ((response: Response) => void) | undefined;
      const fetchMock = vi.fn().mockResolvedValueOnce(limited()).mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveLate = resolve; }));
      vi.stubGlobal("fetch", fetchMock);
      let result: unknown;
      void createHubClient().listMcpConnections().then((value) => { result = value; }, (error: unknown) => { result = error; });
      await vi.advanceTimersByTimeAsync(10000);
      expect(result).toMatchObject({ reason: "aborted" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      resolveLate!(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "late-response" } }));
      await vi.advanceTimersByTimeAsync(0);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ reason: "aborted" });
    } finally { vi.useRealTimers(); }
  });

});

it.each([
  [401, "session_invalid", false], [403, "skill_forbidden", false],
  [404, "skill_not_found", false], [412, "skill_precondition_failed", false],
  [503, "skill_dependency_unavailable", true],
] as const)("preserves strictly validated catalog package HTTP %s as a typed read failure", async (status, code, retryable) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code, message: "Owner read failure", retryable } }), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "typed-package" },
  })));
  await expect(getManusSkillPackage("typed-revision")).rejects.toMatchObject({ reason: "http", status, code, retryable });
});

it.each(["network", "json", "profile", "headers"] as const)("does not confuse catalog package %s with an authenticated owner denial", async failure => {
  vi.stubGlobal("fetch", vi.fn(async () => {
    if (failure === "network") throw new TypeError("network disconnected");
    return new Response(failure === "json" ? "{" : JSON.stringify({ error: { code: "skill_forbidden", message: "Owner failure", retryable: failure === "profile" } }), {
      status: 403, headers: { "content-type": "application/json", "cache-control": failure === "headers" ? "public" : "no-store", "x-request-id": "typed-package" },
    });
  }));
  await expect(getManusSkillPackage("typed-revision")).rejects.toMatchObject({ reason: failure === "network" ? "network" : "parse" });
});

it.each(["caller", "deadline"] as const)("settles catalog package %s retirement and cancels an ignored late response without a second read", async retirement => {
  vi.useFakeTimers();
  try {
    let finish!: (response: Response) => void;
    const cancel = vi.fn();
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    let failure: unknown;
    void getManusSkillPackage("typed-revision", undefined, controller.signal).catch(error => { failure = error; });
    if (retirement === "caller") controller.abort();
    await vi.advanceTimersByTimeAsync(retirement === "caller" ? 0 : 10_000);
    expect(failure).toBeInstanceOf(HubClientError);
    expect(failure).toMatchObject({ reason: retirement === "caller" ? "aborted" : "network", status: null });
    finish(new Response(new ReadableStream({ cancel })));
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledOnce();
  } finally { vi.useRealTimers(); }
});

const qualifiedCatalogRepository = {
  kind: "github", repository_id: "123", repository_url: "https://github.com/qa-owner/skill", owner_login: "qa-owner", owner_url: "https://github.com/qa-owner",
  asset_ref: "qa-github-package", commit: "a".repeat(40), path: "SKILL.md", content_sha256: "b".repeat(64), size_bytes: "100", mime_type: "application/zip",
}
const qualifiedRepositoryProduct = {
  publication_audience: "catalog", state_version: "7", source_kind: "third_party", presentation_kind: "github_repository",
  publisher: { kind: "github_repository", github_repository: qualifiedCatalogRepository }, creation_provenance: qualifiedCatalogRepository,
}
const catalogPublisherProduct = {
  publication_audience: "catalog", state_version: "7", source_kind: "personal", presentation_kind: "first_party",
  creator_ref: { kind: "user", id: "qa-importer" },
  publisher: { kind: "iam", iam: { kind: "user", id: "qa-publisher" } },
}
const catalogPublisherProfile = { kind: "user", id: "qa-publisher", status: "found", display_name: "QA Publisher", image_url: null }

it.each([
  { product: qualifiedRepositoryProduct },
  { product: { publication_audience: "catalog", state_version: "7" } },
  { product: catalogPublisherProduct, publisher_profile: catalogPublisherProfile },
  { product: { ...catalogPublisherProduct, source_kind: "official", publisher: { kind: "iam", iam: { kind: "organization", id: "qa-org" } } }, publisher_profile: { ...catalogPublisherProfile, kind: "organization", id: "qa-org" } },
  { product: catalogPublisherProduct, publisher_profile: { kind: "user", id: "qa-publisher", status: "missing" } },
  {},
])("carries optional current catalog publisher facts without rebinding revisions: %j", async (facts) => {
  const { createManusSkillHubClient } = await import("@/ui/skills/manus-skill-client")
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => jsonResponse(String(input).endsWith("ListHubSkills")
    ? { skills: [{ skillId: "publisher-series", displayName: "Same series", currentVersion: { versionUid: "current-revision" }, ...facts }], tagOptions: {} }
    : { userAddedSkills: [{ id: "publisher-series", version: "installed-revision", installationId: "publisher-installation", added: true, enabled: true }], officialSkills: [] })))
  const result = await createManusSkillHubClient(createHubClient(), { admitted: true, subject: "publisher-reader", generation: 1 }).listSkillCatalog()
  expect(result.skills[0]).toMatchObject({ skill_id: "publisher-series", source_ref: "skill:current-revision", revision_skill_id: "current-revision", installation_id: "publisher-installation", installed_source_ref: "skill:installed-revision", installed: true, enabled: true, ...facts })
})

it.each([
  { product: catalogPublisherProduct, publisher_profile: { ...catalogPublisherProfile, id: "qa-importer" } },
  { product: qualifiedRepositoryProduct, publisher_profile: catalogPublisherProfile },
  { product: catalogPublisherProduct, publisher_profile: { ...catalogPublisherProfile, kind: "organization" } },
  { product: catalogPublisherProduct },
  { publisher_profile: catalogPublisherProfile },
  { product: { ...catalogPublisherProduct, publisher: undefined }, publisher_profile: catalogPublisherProfile },
  { product: catalogPublisherProduct, publisher_profile: { ...catalogPublisherProfile, extra: true } },
  { product: { ...catalogPublisherProduct, extra: true }, publisher_profile: catalogPublisherProfile },
  { product: catalogPublisherProduct, publisher_profile: { ...catalogPublisherProfile, status: "missing" } },
])("rejects supplied catalog publisher wire rather than silently omitting it: %j", async (facts) => {
  const { manuscriptHubPageSchema } = await import("@/hub/schemas")
  const { createManusSkillHubClient } = await import("@/ui/skills/manus-skill-client")
  const hub = { skills: [{ skillId: "publisher-series", ...facts }], tagOptions: {} }
  expect(manuscriptHubPageSchema.safeParse(hub).success).toBe(false)
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => jsonResponse(String(input).endsWith("ListHubSkills") ? hub : { userAddedSkills: [], officialSkills: [] })))
  await expect(createManusSkillHubClient(createHubClient(), { admitted: true, subject: "bad-publisher-reader", generation: 1 }).listSkillCatalog()).rejects.toThrow()
  expect(skillCatalogSchema.safeParse({ skills: [{ skill_id: "publisher-series", name: "Skill", description: "", content_hash: "revision", scope: "third_party", installed: false, enabled: false, ...facts }] }).success).toBe(false)
})

it.each([
  { product: { ...catalogPublisherProduct, source_kind: undefined }, publisher_profile: catalogPublisherProfile },
  { product: { ...catalogPublisherProduct, source_kind: "personal", publisher: undefined, presentation_kind: "first_party" } },
  { product: { ...catalogPublisherProduct, source_kind: "third_party", presentation_kind: "first_party" }, publisher_profile: catalogPublisherProfile },
  { product: { ...qualifiedRepositoryProduct, source_kind: "personal", presentation_kind: "first_party", creation_provenance: { kind: "local" } } },
  { product: { ...qualifiedRepositoryProduct, source_kind: "official", presentation_kind: "first_party" } },
  { product: { ...qualifiedRepositoryProduct, creation_provenance: undefined } },
  { product: { ...qualifiedRepositoryProduct, creation_provenance: { kind: "local" } } },
  { product: { ...qualifiedRepositoryProduct, creation_provenance: { ...qualifiedCatalogRepository, repository_id: "456" } } },
  { product: { ...qualifiedRepositoryProduct, presentation_kind: "first_party" } },
  { product: { ...catalogPublisherProduct, source_kind: "official", presentation_kind: "github_repository" }, publisher_profile: catalogPublisherProfile },
])("rejects owner-inconsistent publisher product facts in both Hub and catalog: %j", async (facts) => {
  const { manuscriptHubPageSchema } = await import("@/hub/schemas")
  const hub = manuscriptHubPageSchema.safeParse({ skills: [{ skillId: "publisher-series", ...facts }], tagOptions: {} }).success
  const card = skillCatalogSchema.safeParse({ skills: [{ name: "Skill", description: "", content_hash: "revision", scope: "third_party", installed: false, enabled: false, ...facts }] }).success
  expect({ hub, card }).toEqual({ hub: false, card: false })
})
