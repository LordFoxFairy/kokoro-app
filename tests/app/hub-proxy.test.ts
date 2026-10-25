import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";

import { requestWithDomain } from "@/lib/server/upstream-http";
import type { ProductBffConfig } from "@/lib/server/product-bff";

vi.mock("@/lib/server/upstream-http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/upstream-http")>()),
  requestWithDomain: vi.fn(),
}));

const { currentProductSession } = vi.hoisted(() => ({
  currentProductSession: vi.fn(),
}));
vi.mock("@/lib/server/product-session", () => ({ currentProductSession }));

const ENV = {
  KOKORO_WEB_AUTH_SECRET: "a".repeat(32),
  KOKORO_WEB_REDIS_URL: "redis://fixture.invalid/9",
  KOKORO_WEB_ORIGIN: "http://localhost",
  KOKORO_DOMAIN: "dev.kokoro.localhost",
  KOKORO_BFF_BASE_URL: "http://bff.test",
  KOKORO_INTERNAL_SECRET_WEB_BFF: "svc-secret",
};

const pinnedSpec = YAML.parse(
  readFileSync(
    resolve(process.cwd(), "src/generated/bff-public-openapi.yaml"),
    "utf8",
  ),
) as {
  components: {
    schemas: {
      PlatformProjectionReadErrorResponse: {
        properties: { error: { properties: { code: { enum: string[] } } } };
      };
      ManagedPersonalSkillErrorDetail: {
        properties: { code: { enum: string[] } };
      };
    };
  };
};
const ownerErrorCodes = {
  projection:
    pinnedSpec.components.schemas.PlatformProjectionReadErrorResponse.properties
      .error.properties.code.enum,
  byId: pinnedSpec.components.schemas.ManagedPersonalSkillErrorDetail.properties
    .code.enum,
};

// A retired cookie must never be promoted into a Product Session.
function sessionCookie(): string {
  return "kokoro_session=retired-forged-envelope";
}

function params(path: string[]): { params: Promise<{ path: string[] }> } {
  return { params: Promise.resolve({ path }) };
}

beforeEach(() => {
  currentProductSession.mockReset();
  currentProductSession.mockResolvedValue({
    access: "product-access",
    accessExpiresAt: Date.now() + 60_000,
  });
  for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
  vi.mocked(requestWithDomain).mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  currentProductSession.mockReset();
  for (const k of Object.keys(ENV)) delete process.env[k];
});

describe("/api/hub/[...path] proxy", () => {
  it("keeps list/MCP query errors separate from by-ID request errors in the pinned owner enums", () => {
    expect(ownerErrorCodes.projection).toContain("invalid_query_parameter");
    expect(ownerErrorCodes.byId).toContain("invalid_skill_request");
    expect(ownerErrorCodes.byId).toContain("invalid_skill_request");
    expect(ownerErrorCodes.byId).not.toContain("invalid_query_parameter");
  });

  async function expectProjectionError(
    response: Response,
    status: number,
    code: string,
    retryable: boolean,
    expectedRequestId?: string,
    ownerKind: "projection" | "byId" = "projection",
  ) {
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toMatch(/^application\/json/u);
    const requestId = response.headers.get("x-request-id");
    expect(requestId).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u);
    if (expectedRequestId) expect(requestId).toBe(expectedRequestId);
    expect(ownerErrorCodes[ownerKind]).toContain(code);
    const raw = await response.json();
    if ("meta" in raw) {
      const managedCode =
        code === "invalid_query_parameter" ? "invalid_skill_request" : code;
      expect(raw).toEqual({
        error: { code: managedCode, message: managedCode },
        meta: { request_id: requestId },
      });
    } else expect(raw).toEqual({ error: { code, message: code, retryable } });
  }

  it("emits typed local errors for projection config, IAM, query, network, and invalid owner branches", async () => {
    const { GET } = await import("@/app/api/hub/[...path]/route");
    const path = params(["self", "skills", "managed"]);
    delete process.env.KOKORO_WEB_AUTH_SECRET;
    await expectProjectionError(
      await GET(
        new Request(
          "http://localhost/api/hub/self/skills/managed?status=active",
          { headers: { "x-kokoro-request-id": "client-valid" } },
        ),
        path,
      ),
      503,
      "product_tenant_not_configured",
      false,
      "client-valid",
    );
    process.env.KOKORO_WEB_AUTH_SECRET = ENV.KOKORO_WEB_AUTH_SECRET;

    const productBff = await import("@/lib/server/product-bff");
    const configSpy = vi
      .spyOn(productBff, "productBffConfig")
      .mockReturnValueOnce({
        bffBaseUrl: null,
        domain: "dev.kokoro.localhost",
        internalSecret: "svc-secret",
        session: {
          redisUrl: ENV.KOKORO_WEB_REDIS_URL,
          webOrigin: ENV.KOKORO_WEB_ORIGIN,
          secret: ENV.KOKORO_WEB_AUTH_SECRET,
        },
      } as unknown as ProductBffConfig);
    await expectProjectionError(
      await GET(
        new Request(
          "http://localhost/api/hub/self/skills/managed?status=active",
        ),
        path,
      ),
      503,
      "skill_dependency_unavailable",
      false,
    );
    configSpy.mockRestore();

    currentProductSession.mockRejectedValueOnce(new Error("IAM down"));
    const invalidId = await GET(
      new Request(
        "http://localhost/api/hub/self/skills/managed?status=active",
        { headers: { "x-kokoro-request-id": "bad request id" } },
      ),
      path,
    );
    await expectProjectionError(
      invalidId,
      503,
      "iam_admission_unavailable",
      true,
    );
    expect(invalidId.headers.get("x-request-id")).not.toBe("bad request id");

    currentProductSession.mockResolvedValueOnce(null);
    await expectProjectionError(
      await GET(
        new Request(
          "http://localhost/api/hub/self/skills/managed?status=active",
        ),
        path,
      ),
      401,
      "session_authentication_required",
      false,
    );
    await expectProjectionError(
      await GET(
        new Request(
          "http://localhost/api/hub/self/skills/managed?scope=official",
        ),
        path,
      ),
      400,
      "invalid_query_parameter",
      false,
    );
    await expectProjectionError(
      await GET(
        new Request("http://localhost/api/hub/mcp/connections?cursor="),
        params(["mcp", "connections"]),
      ),
      400,
      "invalid_query_parameter",
      false,
    );
    await expectProjectionError(
      await GET(
        new Request("http://localhost/api/hub/self/skills/managed/bad%20id"),
        params(["self", "skills", "managed", "bad id"]),
      ),
      400,
      "invalid_skill_request",
      false,
      undefined,
      "byId",
    );

    vi.mocked(requestWithDomain).mockRejectedValueOnce(new Error("BFF down"));
    await expectProjectionError(
      await GET(
        new Request(
          "http://localhost/api/hub/self/skills/managed?status=active",
        ),
        path,
      ),
      503,
      "skill_dependency_unavailable",
      true,
    );
    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      new Response('{"data":{"skills":[]}}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await expectProjectionError(
      await GET(
        new Request(
          "http://localhost/api/hub/self/skills/managed?status=active",
        ),
        path,
      ),
      502,
      "skill_response_invalid",
      false,
    );
  });

  it("accepts only JSON media type for successful and error owner projections", async () => {
    const { GET } = await import("@/app/api/hub/[...path]/route");
    const path = params(["self", "skills", "managed"]);
    for (const status of [200, 404]) {
      vi.mocked(requestWithDomain).mockResolvedValueOnce(
        new Response(
          status === 200
            ? '{"data":{"skills":[]}}'
            : '{"error":{"code":"skill_not_found","message":"hidden","retryable":false}}',
          {
            status,
            headers: {
              "content-type": "text/plain",
              "cache-control": "no-store",
              "x-request-id": "owner-request",
            },
          },
        ),
      );
      await expectProjectionError(
        await GET(
          new Request(
            "http://localhost/api/hub/self/skills/managed?status=active",
          ),
          path,
        ),
        502,
        "skill_response_invalid",
        false,
      );
    }
    for (const status of [200, 404]) {
      vi.mocked(requestWithDomain).mockResolvedValueOnce(
        new Response(
          status === 200
            ? '{"data":{"skills":[]}}'
            : '{"error":{"code":"skill_not_found","message":"hidden","retryable":false}}',
          {
            status,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
              "x-request-id": "owner-request",
            },
          },
        ),
      );
      const response = await GET(
        new Request(
          "http://localhost/api/hub/self/skills/managed?status=active",
        ),
        path,
      );
      expect(response.status).toBe(status);
      expect(response.headers.get("content-type")).toBe(
        "application/json; charset=utf-8",
      );
    }
  });

  it("preserves BFF personal Skill and MCP read request IDs while rejecting old scope and redirects", async () => {
    const { GET } = await import("@/app/api/hub/[...path]/route");
    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: { skills: [], next_cursor: null } }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-request-id": "req_skill_1",
          },
        },
      ),
    );
    const list = await GET(
      new Request("http://localhost/api/hub/self/skills/managed?status=active"),
      params(["self", "skills", "managed"]),
    );
    expect(list.status).toBe(200);
    expect(list.headers.get("cache-control")).toBe("no-store");
    expect(list.headers.get("x-request-id")).toBe("req_skill_1");
    expect(vi.mocked(requestWithDomain).mock.calls[0]?.[0]).toBe(
      "http://bff.test/v1/self/skills?status=active",
    );

    const oldScope = await GET(
      new Request(
        "http://localhost/api/hub/self/skills/managed?scope=official",
      ),
      params(["self", "skills", "managed"]),
    );
    expect(oldScope.status).toBe(400);
    expect(requestWithDomain).toHaveBeenCalledTimes(1);

    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: "skill_not_found",
            message: "hidden",
            retryable: false,
          },
        }),
        {
          status: 404,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-request-id": "req_skill_2",
          },
        },
      ),
    );
    const hidden = await GET(
      new Request("http://localhost/api/hub/self/skills/managed/skill-1"),
      params(["self", "skills", "managed", "skill-1"]),
    );
    expect(hidden.status).toBe(404);
    expect(hidden.headers.get("x-request-id")).toBe("req_skill_2");

    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://invalid.example" },
      }),
    );
    const redirect = await GET(
      new Request("http://localhost/api/hub/mcp/connections"),
      params(["mcp", "connections"]),
    );
    expect(redirect.status).toBe(502);
    expect(redirect.headers.get("location")).toBeNull();
  });

  it("proxies only the strict current-person MCP Connection read", async () => {
    const { GET } = await import("@/app/api/hub/[...path]/route");
    const connection = {
      connection_id: "connection-1",
      connector_id: "connector-1",
      server_id: "server-1",
      provider_key: "provider-one",
      transport: "streamable_http",
      status: "active",
    };
    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { connections: [connection], next_cursor: "opaque-next" },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-request-id": "owner-connection-read",
          },
        },
      ),
    );
    const response = await GET(
      new Request(
        "http://localhost/api/hub/mcp/connections?connection_id=connection-1&provider_key=provider-one&limit=25&cursor=opaque-current",
        {
          headers: {
            "x-kokoro-subject": "attacker",
            "x-kokoro-tenant-id": "other",
          },
        },
      ),
      params(["mcp", "connections"]),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { connections: [connection], next_cursor: "opaque-next" },
    });
    const [target, , options] = vi.mocked(requestWithDomain).mock.calls[0] as [
      string,
      string,
      {
        headers: Record<string, string>;
        maxResponseBytes: number;
        timeoutMs: number;
      },
    ];
    expect(target).toBe(
      "http://bff.test/v1/mcp/connections?connection_id=connection-1&provider_key=provider-one&limit=25&cursor=opaque-current",
    );
    expect(options).toMatchObject({
      maxResponseBytes: 1024 * 1024,
      timeoutMs: 10_000,
    });
    expect(options.headers["x-kokoro-subject"]).not.toBe("attacker");
    expect(options.headers["x-kokoro-tenant-id"]).not.toBe("other");

    const calls = vi.mocked(requestWithDomain).mock.calls.length;
    for (const suffix of [
      "subject=other",
      "connection_id=x&connection_id=y",
      "connection_id=",
      "connection_id=bad%2Fid",
      "provider_key=",
      `provider_key=${"😀".repeat(192)}`,
      "limit=01",
      "limit=101",
      "cursor=",
    ]) {
      const invalid = await GET(
        new Request(`http://localhost/api/hub/mcp/connections?${suffix}`),
        params(["mcp", "connections"]),
      );
      expect(invalid.status).toBe(400);
      expect((await invalid.json()).error.code).toBe("invalid_query_parameter");
    }
    const body = await GET(
      new Request("http://localhost/api/hub/mcp/connections", {
        headers: { "content-length": "1" },
      }),
      params(["mcp", "connections"]),
    );
    expect(body.status).toBe(400);
    const retired = await GET(
      new Request("http://localhost/api/hub/self/mcp/servers"),
      params(["self", "mcp", "servers"]),
    );
    expect(retired.status).toBe(404);
    expect(requestWithDomain).toHaveBeenCalledTimes(calls);

    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { connections: [{ ...connection, secret: "leak" }] },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-request-id": "owner-bad",
          },
        },
      ),
    );
    const badOwner = await GET(
      new Request("http://localhost/api/hub/mcp/connections"),
      params(["mcp", "connections"]),
    );
    expect(badOwner.status).toBe(502);
    expect(await badOwner.json()).toEqual({
      error: {
        code: "mcp_connection_response_invalid",
        message: "mcp_connection_response_invalid",
        retryable: false,
      },
    });
  });
  it("accepts the owner contract's 191-code-point connection ID boundary and rejects 192", async () => {
    const { GET } = await import("@/app/api/hub/[...path]/route");
    const connectionId191 = "c".repeat(191);
    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { connections: [] } }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          "x-request-id": "owner-connection-boundary",
        },
      }),
    );

    const accepted = await GET(
      new Request(
        `http://localhost/api/hub/mcp/connections?connection_id=${connectionId191}`,
      ),
      params(["mcp", "connections"]),
    );
    expect(accepted.status).toBe(200);
    expect(vi.mocked(requestWithDomain).mock.calls[0]?.[0]).toBe(
      `http://bff.test/v1/mcp/connections?connection_id=${connectionId191}`,
    );

    const rejected = await GET(
      new Request(
        `http://localhost/api/hub/mcp/connections?connection_id=${"c".repeat(192)}`,
      ),
      params(["mcp", "connections"]),
    );
    expect(rejected.status).toBe(400);
    expect(requestWithDomain).toHaveBeenCalledTimes(1);
  });
  it("streams only the exact Artifact binary path with a 1 GiB ceiling and safe attachment headers", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    vi.mocked(requestWithDomain).mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: {
          "content-type": "application/octet-stream",
          "content-length": "3",
          "content-disposition":
            "attachment; filename=\"report.bin\"; filename*=UTF-8''report.bin",
          "cache-control": "no-store",
          "referrer-policy": "no-referrer",
          "x-content-type-options": "nosniff",
          "x-request-id": "req_artifact_1",
          "x-owner-secret": "drop-me",
        },
      }),
    );
    const { GET } = await import("@/app/api/hub/[...path]/route");
    const response = await GET(
      new Request(
        "http://localhost/api/hub/library/artifacts/conversation-1/artifact-1/content",
      ),
      params([
        "library",
        "artifacts",
        "conversation-1",
        "artifact-1",
        "content",
      ]),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("report.bin");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-owner-secret")).toBeNull();
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    const [target, , options] = vi.mocked(requestWithDomain).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(target).toBe(
      "http://bff.test/v1/library/artifacts/conversation-1/artifact-1/content",
    );
    expect(options).toMatchObject({
      maxResponseBytes: 1_073_741_824,
      maxErrorResponseBytes: 16_777_216,
      errorResponseTimeoutMs: 15_000,
      strictResponseLength: true,
      streamIdleTimeoutMs: expect.any(Number),
      streamTotalTimeoutMs: expect.any(Number),
    });
  });

  it("rejects Artifact query/alias, unsafe headers and a short binary stream", async () => {
    const { GET } = await import("@/app/api/hub/[...path]/route");
    const query = await GET(
      new Request(
        "http://localhost/api/hub/library/artifacts/conversation-1/artifact-1/content?x=1",
      ),
      params([
        "library",
        "artifacts",
        "conversation-1",
        "artifact-1",
        "content",
      ]),
    );
    expect(query.status).toBe(400);
    const alias = await GET(
      new Request(
        "http://localhost/api/hub/self/library/artifacts/conversation-1/artifact-1/content",
      ),
      params([
        "self",
        "library",
        "artifacts",
        "conversation-1",
        "artifact-1",
        "content",
      ]),
    );
    expect(alias.status).toBe(404);
    expect(requestWithDomain).not.toHaveBeenCalled();
    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      new Response("", {
        status: 302,
        headers: { location: "https://storage.invalid/object" },
      }),
    );
    const redirect = await GET(
      new Request(
        "http://localhost/api/hub/library/artifacts/conversation-1/artifact-1/content",
      ),
      params([
        "library",
        "artifacts",
        "conversation-1",
        "artifact-1",
        "content",
      ]),
    );
    expect(redirect.status).toBe(502);
    expect(redirect.headers.get("location")).toBeNull();
    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2]), {
        status: 200,
        headers: {
          "content-type": "application/octet-stream",
          "content-length": "2",
          "content-disposition": "inline",
          "cache-control": "no-store",
          "referrer-policy": "no-referrer",
          "x-content-type-options": "nosniff",
          "x-request-id": "req_1",
        },
      }),
    );
    const unsafe = await GET(
      new Request(
        "http://localhost/api/hub/library/artifacts/conversation-1/artifact-1/content",
      ),
      params([
        "library",
        "artifacts",
        "conversation-1",
        "artifact-1",
        "content",
      ]),
    );
    expect(unsafe.status).toBe(502);
    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2]), {
        status: 200,
        headers: {
          "content-type": "application/octet-stream",
          "content-length": "3",
          "content-disposition":
            "attachment; filename=\"report.bin\"; filename*=UTF-8''report.bin",
          "cache-control": "no-store",
          "referrer-policy": "no-referrer",
          "x-content-type-options": "nosniff",
          "x-request-id": "req_1",
        },
      }),
    );
    const short = await GET(
      new Request(
        "http://localhost/api/hub/library/artifacts/conversation-1/artifact-1/content",
      ),
      params([
        "library",
        "artifacts",
        "conversation-1",
        "artifact-1",
        "content",
      ]),
    );
    await expect(short.arrayBuffer()).rejects.toThrow();
  });

  it("rejects non-200 success codes and preserves only safe Artifact error headers", async () => {
    const { GET } = await import("@/app/api/hub/[...path]/route");
    const request = () =>
      new Request(
        "http://localhost/api/hub/library/artifacts/conversation-1/artifact-1/content",
      );
    const selector = () =>
      params([
        "library",
        "artifacts",
        "conversation-1",
        "artifact-1",
        "content",
      ]);
    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    );
    const emptySuccess = await GET(request(), selector());
    expect(emptySuccess.status).toBe(502);
    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      new Response("partial", { status: 206 }),
    );
    const partial = await GET(request(), selector());
    expect(partial.status).toBe(502);
    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: "admission_rate_limited" } }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "x-request-id": "req_429",
            "retry-after": "12",
            "content-disposition": "attachment; filename=bad",
            "x-owner-secret": "drop",
          },
        },
      ),
    );
    const limited = await GET(request(), selector());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("x-request-id")).toBe("req_429");
    expect(limited.headers.get("retry-after")).toBe("12");
    expect(limited.headers.get("content-disposition")).toBeNull();
    expect(limited.headers.get("x-owner-secret")).toBeNull();
    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      new Response("{}", {
        status: 503,
        headers: {
          "content-type": "application/json",
          "x-request-id": "bad id",
          "retry-after": "999999",
        },
      }),
    );
    const unavailable = await GET(request(), selector());
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("x-request-id")).toBeNull();
    expect(unavailable.headers.get("retry-after")).toBeNull();
  });

  it("returns fully verified personal download bytes and only the narrow safe headers", async () => {
    const bytes = new Uint8Array([0, 255, 1, 42]);
    vi.mocked(requestWithDomain).mockResolvedValue(
      new Response(bytes, {
        status: 200,
        headers: {
          "content-type": "application/octet-stream",
          "content-length": String(bytes.byteLength),
          "content-disposition":
            "attachment; filename=\"private.bin\"; filename*=UTF-8''private.bin",
          "cache-control": "no-store",
          "referrer-policy": "no-referrer",
          "x-content-type-options": "nosniff",
          "x-request-id": "req_download_1",
          "x-owner-secret": "never-forward",
        },
      }),
    );
    const { GET } = await import("@/app/api/hub/[...path]/route");
    const response = await GET(
      new Request("http://localhost/api/hub/library/files/asset-1/content"),
      params(["library", "files", "asset-1", "content"]),
    );
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("content-disposition")).toContain(
      "private.bin",
    );
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-request-id")).toBe("req_download_1");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-owner-secret")).toBeNull();
    expect(vi.mocked(requestWithDomain).mock.calls[0]?.[0]).toBe(
      "http://bff.test/v1/library/files/asset-1/content",
    );
  });

  it.each([
    [{ "content-disposition": "inline; filename=private.bin" }, 502],
    [{ "referrer-policy": "unsafe-url" }, 502],
    [{ "x-content-type-options": "" }, 502],
    [{ "content-length": "3" }, 502],
    [{ "x-request-id": "bad request id" }, 502],
    [{ "x-request-id": "" }, 502],
  ])(
    "rejects invalid personal download owner metadata %o",
    async (overrides, expected) => {
      vi.mocked(requestWithDomain).mockResolvedValue(
        new Response(new Uint8Array([1, 2]), {
          status: 200,
          headers: {
            "content-type": "application/octet-stream",
            "content-length": "2",
            "content-disposition":
              "attachment; filename=\"private.bin\"; filename*=UTF-8''private.bin",
            "cache-control": "no-store",
            "referrer-policy": "no-referrer",
            "x-content-type-options": "nosniff",
            "x-request-id": "req_download_1",
            ...overrides,
          },
        }),
      );
      const { GET } = await import("@/app/api/hub/[...path]/route");
      const response = await GET(
        new Request("http://localhost/api/hub/library/files/asset-1/content"),
        params(["library", "files", "asset-1", "content"]),
      );
      expect(response.status).toBe(expected);
      expect(response.headers.get("content-disposition")).toBeNull();
      expect(response.headers.get("x-request-id")).toBeNull();
    },
  );

  it("rejects a personal 200 with no owner request id", async () => {
    vi.mocked(requestWithDomain).mockResolvedValue(
      new Response(new Uint8Array([1, 2]), {
        status: 200,
        headers: {
          "content-type": "application/octet-stream",
          "content-length": "2",
          "content-disposition":
            "attachment; filename=\"private.bin\"; filename*=UTF-8''private.bin",
          "cache-control": "no-store",
          "referrer-policy": "no-referrer",
          "x-content-type-options": "nosniff",
        },
      }),
    );
    const { GET } = await import("@/app/api/hub/[...path]/route");
    const response = await GET(
      new Request("http://localhost/api/hub/library/files/asset-1/content"),
      params(["library", "files", "asset-1", "content"]),
    );
    expect(response.status).toBe(502);
    expect(response.headers.get("content-disposition")).toBeNull();
  });

  it.each([404, 401, 502])(
    "keeps personal download owner error %i without success headers",
    async (status) => {
      vi.mocked(requestWithDomain).mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: "library_file_not_found" } }),
          {
            status,
            headers: {
              "content-type": "application/json",
              "content-disposition": 'attachment; filename="leak"',
            },
          },
        ),
      );
      const { GET } = await import("@/app/api/hub/[...path]/route");
      const response = await GET(
        new Request("http://localhost/api/hub/library/files/asset-1/content"),
        params(["library", "files", "asset-1", "content"]),
      );
      expect(response.status).toBe(status);
      expect(response.headers.get("content-disposition")).toBeNull();
    },
  );

  it("rejects redirects, extra query and self alias for personal content without exposing a download", async () => {
    vi.mocked(requestWithDomain).mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://storage.invalid/private" },
      }),
    );
    const { GET } = await import("@/app/api/hub/[...path]/route");
    const redirected = await GET(
      new Request("http://localhost/api/hub/library/files/asset-1/content"),
      params(["library", "files", "asset-1", "content"]),
    );
    expect(redirected.status).toBe(502);
    expect(redirected.headers.get("location")).toBeNull();
    const queried = await GET(
      new Request(
        "http://localhost/api/hub/library/files/asset-1/content?download=1",
      ),
      params(["library", "files", "asset-1", "content"]),
    );
    expect(queried.status).toBe(400);
    expect(requestWithDomain).toHaveBeenCalledTimes(1);
    const aliased = await GET(
      new Request(
        "http://localhost/api/hub/self/library/files/asset-1/content",
      ),
      params(["self", "library", "files", "asset-1", "content"]),
    );
    expect(aliased.status).toBe(404);
    expect(requestWithDomain).toHaveBeenCalledTimes(1);
  });
  it("allows the owner upload deadline only for Project resources and personal Library files", async () => {
    vi.mocked(requestWithDomain).mockResolvedValue(
      new Response('{"error":{"code":"resource_scan_pending"}}', {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );
    const { POST } = await import("@/app/api/hub/[...path]/route");
    const body = new FormData();
    body.append(
      "files",
      new File(["content"], "notes.txt", { type: "text/plain" }),
    );
    await POST(
      new Request("http://localhost/api/hub/projects/project-1/resources", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "idempotency-key": "project-resource:key-1",
        },
        body,
      }),
      params(["projects", "project-1", "resources"]),
    );
    const [, , upload] = vi.mocked(requestWithDomain).mock.calls[0] as [
      string,
      string,
      {
        timeoutMs?: number;
        maxRequestBytes?: number;
        headers: Record<string, string>;
      },
    ];
    expect(upload.timeoutMs).toBe(50_000);
    expect(upload.maxRequestBytes).toBe(1024 * 1024);
    expect(new Headers(upload.headers).get("idempotency-key")).toBe(
      "project-resource:key-1",
    );

    await POST(
      new Request("http://localhost/api/hub/library/files", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "idempotency-key": "personal-file:key-1",
        },
        body,
      }),
      params(["library", "files"]),
    );
    const [personalTarget, , personalUpload] = vi.mocked(requestWithDomain).mock
      .calls[1] as [
      string,
      string,
      {
        timeoutMs?: number;
        maxRequestBytes?: number;
        headers: Record<string, string>;
      },
    ];
    expect(personalTarget).toBe("http://bff.test/v1/library/files");
    expect(personalUpload.timeoutMs).toBe(50_000);
    expect(personalUpload.maxRequestBytes).toBe(1024 * 1024);
    expect(new Headers(personalUpload.headers).get("idempotency-key")).toBe(
      "personal-file:key-1",
    );

    await POST(
      new Request("http://localhost/api/hub/projects/project-1", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: "{}",
      }),
      params(["projects", "project-1"]),
    );
    const [, , ordinary] = vi.mocked(requestWithDomain).mock.calls[2] as [
      string,
      string,
      { timeoutMs?: number },
    ];
    expect(ordinary.timeoutMs).toBeUndefined();
  });
  it("rejects an oversized project resource body before forwarding it", async () => {
    const { POST } = await import("@/app/api/hub/[...path]/route");
    const response = await POST(
      new Request("http://localhost/api/hub/projects/project-1/resources", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "idempotency-key": "project-resource:huge",
          "content-type": "multipart/form-data; boundary=fixture",
        },
        body: new Uint8Array(1024 * 1024 + 1),
      }),
      params(["projects", "project-1", "resources"]),
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      error: "request_body_too_large",
    });
    expect(requestWithDomain).not.toHaveBeenCalled();

    const personalResponse = await POST(
      new Request("http://localhost/api/hub/library/files", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "idempotency-key": "personal-file:huge",
          "content-type": "multipart/form-data; boundary=fixture",
        },
        body: new Uint8Array(1024 * 1024 + 1),
      }),
      params(["library", "files"]),
    );
    expect(personalResponse.status).toBe(413);
    expect(requestWithDomain).not.toHaveBeenCalled();
  });
  it("injects web-bff caller creds + envelope scope/user and projects to the BFF", async () => {
    vi.mocked(requestWithDomain).mockResolvedValue(
      new Response('{"data":{"skills":[],"next_cursor":null}}', {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          "x-request-id": "req-personal-list",
        },
      }),
    );
    const { GET } = await import("@/app/api/hub/[...path]/route");

    const request = new Request(
      "http://localhost/api/hub/self/skills/managed?status=active",
      {
        headers: { cookie: sessionCookie() },
      },
    );
    const res = await GET(request, params(["self", "skills", "managed"]));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-request-id")).toBe("req-personal-list");

    const [target, domain, init] = vi.mocked(requestWithDomain).mock
      .calls[0] as [
      string,
      string,
      { headers: Record<string, string>; signal: AbortSignal },
    ];
    expect(target).toBe("http://bff.test/v1/self/skills?status=active");
    expect(domain).toBe("dev.kokoro.localhost");
    expect(init.headers["x-kokoro-service"]).toBe("web-bff");
    expect(init.headers["x-kokoro-internal-secret"]).toBe("svc-secret");
    expect(init.headers["x-kokoro-namespace"]).toBeUndefined();
    expect(init.headers["x-kokoro-principal-id"]).toBeUndefined();
    expect(init.signal).toBe(request.signal);
  });

  it("fails closed when the business BFF base is omitted", async () => {
    delete process.env.KOKORO_BFF_BASE_URL;
    const { GET } = await import("@/app/api/hub/[...path]/route");

    const response = await GET(
      new Request(
        "http://localhost/api/hub/self/skills/managed?status=active",
        {
          headers: { cookie: sessionCookie() },
        },
      ),
      params(["self", "skills", "managed"]),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "product_tenant_not_configured" },
      meta: { request_id: expect.any(String) },
    });
    expect(requestWithDomain).not.toHaveBeenCalled();
  });

  it("never forwards a browser-supplied scope header (identity from envelope only)", async () => {
    vi.mocked(requestWithDomain).mockResolvedValue(
      new Response('{"data":{"skills":[],"next_cursor":null}}', {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          "x-request-id": "req-scope",
        },
      }),
    );
    const { GET } = await import("@/app/api/hub/[...path]/route");

    await GET(
      new Request(
        "http://localhost/api/hub/self/skills/managed?status=active",
        {
          headers: {
            cookie: sessionCookie(),
            "x-kokoro-namespace": "team_evil",
          },
        },
      ),
      params(["self", "skills", "managed"]),
    );
    const [, domain, init] = vi.mocked(requestWithDomain).mock.calls[0] as [
      string,
      string,
      { headers: Record<string, string> },
    ];
    expect(domain).toBe("dev.kokoro.localhost");
    expect(init.headers["x-kokoro-namespace"]).toBeUndefined();
    // The helper is mocked here; wire-level Forwarded injection is covered by
    // tests/server/upstream-http.test.ts rather than duplicated in the route.
    expect(init.headers.forwarded).toBeUndefined();
  });

  it("returns 401 when there is no envelope", async () => {
    currentProductSession.mockResolvedValueOnce(null);
    vi.stubGlobal("fetch", vi.fn());
    const { GET } = await import("@/app/api/hub/[...path]/route");
    const res = await GET(
      new Request("http://localhost/api/hub/self/skills/managed?status=active"),
      params(["self", "skills", "managed"]),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a cross-origin mutation (POST) even with a valid envelope", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { POST } = await import("@/app/api/hub/[...path]/route");
    const res = await POST(
      new Request("http://localhost/api/hub/self/skills/x/disable", {
        method: "POST",
        headers: { cookie: sessionCookie(), origin: "http://evil.test" },
      }),
      params(["self", "skills", "x", "disable"]),
    );
    expect(res.status).toBe(403);
  });

  it("keeps formal Skill draft/Publish commands on a typed no-store owner boundary", async () => {
    const { POST } = await import("@/app/api/hub/[...path]/route");
    const draftPath = params(["self", "skills", "drafts"]);
    const draftUrl = "http://localhost/api/hub/self/skills/drafts";
    delete process.env.KOKORO_WEB_AUTH_SECRET;
    const config = await POST(
      new Request(draftUrl, {
        method: "POST",
        headers: {
          "idempotency-key": "draft-key",
          "content-type": "application/json",
        },
        body: "{}",
      }),
      draftPath,
    );
    expect(config.status).toBe(503);
    expect(config.headers.get("cache-control")).toBe("no-store");
    expect(await config.json()).toMatchObject({
      error: { code: "product_tenant_not_configured", retryable: false },
    });
    process.env.KOKORO_WEB_AUTH_SECRET = ENV.KOKORO_WEB_AUTH_SECRET;

    const wrongOrigin = await POST(
      new Request(draftUrl, {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "idempotency-key": "draft-key",
          "content-type": "application/json",
        },
        body: "{}",
      }),
      draftPath,
    );
    expect(wrongOrigin.status).toBe(403);
    expect(await wrongOrigin.json()).toMatchObject({
      error: { code: "session_forbidden" },
    });

    const publishPath = params(["self", "skills", "mine", "publish"]);
    const publishUrl = "http://localhost/api/hub/self/skills/mine/publish";
    const nonempty = await POST(
      new Request(publishUrl, {
        method: "POST",
        headers: { "idempotency-key": "publish-key" },
        body: "{}",
      }),
      publishPath,
    );
    expect(nonempty.status).toBe(400);
    expect(await nonempty.json()).toMatchObject({
      error: { code: "invalid_skill_request" },
    });
    expect(requestWithDomain).not.toHaveBeenCalled();

    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      new Response(
        '{"data":{"source_ref":"skill:mine","revision":"1","status":"active","event_id":"550e8400-e29b-41d4-a716-446655440000","replayed":false}}',
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-request-id": "owner-publish",
          },
        },
      ),
    );
    const published = await POST(
      new Request(publishUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "publish-key",
        },
        body: JSON.stringify({
          expected_state_version: "4",
          audience: "owner",
          expected_publication: null,
        }),
      }),
      publishPath,
    );
    expect(published.status).toBe(200);
    expect(published.headers.get("x-request-id")).toBe("owner-publish");
    expect(published.headers.get("cache-control")).toBe("no-store");
    const [, , init] = vi.mocked(requestWithDomain).mock.calls[0] as [
      string,
      string,
      { body?: ArrayBuffer; headers: Record<string, string> },
    ];
    expect(JSON.parse(new TextDecoder().decode(init.body))).toEqual({
      expected_state_version: "4",
      audience: "owner",
      expected_publication: null,
    });
    expect(init.headers["idempotency-key"]).toBe("publish-key");
    expect(init.headers["content-type"]).toBe("application/json");
  });

  it("rejects a non-JSON formal command owner response before the browser sees it", async () => {
    const { POST } = await import("@/app/api/hub/[...path]/route");
    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      new Response('{"data":{}}', {
        status: 201,
        headers: {
          "content-type": "text/plain",
          "cache-control": "no-store",
          "x-request-id": "owner-draft",
        },
      }),
    );
    const response = await POST(
      new Request("http://localhost/api/hub/self/skills/drafts", {
        method: "POST",
        headers: {
          "idempotency-key": "draft-key",
          "content-type": "application/json",
        },
        body: "{}",
      }),
      params(["self", "skills", "drafts"]),
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: { code: "skill_response_invalid" },
    });
  });

  it("does not forward retired multipart preview/confirm or GitHub pseudo-publish routes", async () => {
    const { POST } = await import("@/app/api/hub/[...path]/route");
    for (const path of [
      ["self", "skills", "upload", "preview"],
      ["self", "skills", "upload", "confirm"],
      ["self", "skills", "github", "import"],
    ]) {
      const response = await POST(
        new Request(`http://localhost/api/hub/${path.join("/")}`, {
          method: "POST",
          body: "unused",
        }),
        params(path),
      );
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(requestWithDomain).not.toHaveBeenCalled();
  });

  it("forwards a Draft under the owner raw-body limit and rejects bytes above 65,536", async () => {
    const { POST } = await import("@/app/api/hub/[...path]/route");
    const body = JSON.stringify({
      display_name: "Mine",
      summary: "S".repeat(65400),
      tags: [],
    });
    expect(new TextEncoder().encode(body).length).toBeGreaterThan(65_000);
    expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(65_536);
    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      new Response(
        '{"data":{"skill_id":"mine","series_id":"series","revision":1,"status":"draft","replayed":false}}',
        {
          status: 201,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-request-id": "owner-draft",
          },
        },
      ),
    );
    const response = await POST(
      new Request("http://localhost/api/hub/self/skills/drafts", {
        method: "POST",
        headers: {
          "idempotency-key": "draft-key",
          "content-type": "application/json",
        },
        body,
      }),
      params(["self", "skills", "drafts"]),
    );
    expect(response.status).toBe(201);
    expect(
      (
        vi.mocked(requestWithDomain).mock.calls[0]?.[2] as {
          body?: ArrayBuffer;
        }
      ).body?.byteLength,
    ).toBe(new TextEncoder().encode(body).length);

    const oversized = await POST(
      new Request("http://localhost/api/hub/self/skills/drafts", {
        method: "POST",
        headers: {
          "idempotency-key": "draft-key",
          "content-type": "application/json",
        },
        body: "X".repeat(65_537),
      }),
      params(["self", "skills", "drafts"]),
    );
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toMatchObject({
      error: { code: "request_body_too_large" },
    });
  });

  it("closes retired self aliases and public Skill aliases before generic proxying", async () => {
    const { GET, POST } = await import("@/app/api/hub/[...path]/route");
    const cases = [
      POST(
        new Request("http://localhost/api/hub/skills/drafts", {
          method: "POST",
          body: "X".repeat(600 * 1024),
        }),
        params(["skills", "drafts"]),
      ),
      POST(
        new Request("http://localhost/api/hub/skills/mine/publish", {
          method: "POST",
          body: "{}",
        }),
        params(["skills", "mine", "publish"]),
      ),
      POST(
        new Request("http://localhost/api/hub/skills/mine/publish", {
          method: "POST",
        }),
        params(["skills", "mine", "publish"]),
      ),
      GET(
        new Request("http://localhost/api/hub/self/mcp/servers"),
        params(["self", "mcp", "servers"]),
      ),
    ];
    for (const response of await Promise.all(cases)) {
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(requestWithDomain).not.toHaveBeenCalled();
  });
});

it("personal installation reads preserve strict owner headers and reject DELETE bodies before upstream", async () => {
  const { GET, DELETE } = await import("@/app/api/hub/[...path]/route");
  vi.mocked(requestWithDomain).mockResolvedValue(
    new Response(JSON.stringify({ data: [] }), {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-request-id": "installation-read",
      },
    }),
  );
  const response = await GET(
    new Request(
      "http://localhost/api/hub/self/skill-installations?installed=false&limit=50",
    ),
    params(["self", "skill-installations"]),
  );
  expect(response.headers.get("x-request-id")).toBe("installation-read");
  expect(response.headers.get("cache-control")).toBe("no-store");
  vi.mocked(requestWithDomain).mockClear();
  const rejected = await DELETE(
    new Request("http://localhost/api/hub/self/skill-installations/install-1", {
      method: "DELETE",
      headers: { origin: "http://localhost", "idempotency-key": "remove-1" },
      body: "{}",
    }),
    params(["self", "skill-installations", "install-1"]),
  );
  expect(rejected.status).toBe(400);
  expect(requestWithDomain).not.toHaveBeenCalled();
});

it.each([
  ["personal", "财务报告"],
  ["official", "report builder"],
  ["third_party", "📄".repeat(1024)],
])("forwards installation source %s and literal search to the formal BFF operation", async (sourceKind, query) => {
  const { GET } = await import("@/app/api/hub/[...path]/route");
  vi.mocked(requestWithDomain).mockResolvedValue(new Response(JSON.stringify({ data: [] }), {
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "installation-filter" },
  }));
  const search = new URLSearchParams({ source_kind: sourceKind!, query: query!, enabled: "false", limit: "50" });
  const response = await GET(new Request(`http://localhost/api/hub/self/skill-installations?${search}`), params(["self", "skill-installations"]));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: [] });
  expect(requestWithDomain).toHaveBeenCalledTimes(1);
  const upstreamUrl = new URL(vi.mocked(requestWithDomain).mock.calls[0]![0]);
  expect(upstreamUrl.pathname).toBe("/v1/skill-installations");
  expect(upstreamUrl.searchParams.get("source_kind")).toBe(sourceKind);
  expect(upstreamUrl.searchParams.get("query")).toBe(query);
  expect(upstreamUrl.searchParams.get("enabled")).toBe("false");
});

it.each([
  ["GET", "?enabled=0", null, null],
  ["GET", "?installed=false&installed=true", null, null],
  ["GET", "?scope=personal", null, null],
  ["GET", "?limit=0", null, null],
  ["GET", "?cursor=", null, null],
  ["GET", "?source_kind=hub", null, null],
  ["GET", "?source_kind=personal&source_kind=official", null, null],
  ["GET", "?query=", null, null],
  ["GET", "?query=%20", null, null],
  ["GET", "?query=one&query=two", null, null],
  ["GET", `?query=${"a".repeat(1025)}`, null, null],
  ["GET", "", "key", null],
  ["POST", "?tenant=forged", "key", '{"source_ref":"skill:s1"}'],
  ["POST", "", "key,second", '{"source_ref":"skill:s1"}'],
  ["POST", "", "key", '{"source_ref":"skill:s1","subject":"forged"}'],
  ["POST", "", "key", '{"source_ref":" skill:s1"}'],
])(
  "rejects illegal installation input %s %s before upstream",
  async (method, search, key, body) => {
    const route = await import("@/app/api/hub/[...path]/route");
    const proxyHubRequest = method === "GET" ? route.GET : method === "PUT" ? route.PUT : route.POST;
    const response = await proxyHubRequest(
      new Request(
        `http://localhost/api/hub/self/skill-installations${search}`,
        {
          method: method!,
          headers: {
            origin: "http://localhost",
            "content-type": "application/json",
            ...(key ? { "idempotency-key": key } : {}),
          },
          ...(body === null ? {} : { body }),
        },
      ),
      params(["self", "skill-installations"]),
    );
    expect(response.status).toBe(400);
    expect(requestWithDomain).not.toHaveBeenCalled();
  },
);

it("forwards only trusted installation headers, false body and safe retry response", async () => {
  const { PUT } = await import("@/app/api/hub/[...path]/route");
  vi.mocked(requestWithDomain).mockResolvedValue(
    new Response(
      JSON.stringify({
        error: {
          code: "skill_installation_rate_limited",
          message: "Try later",
          retryable: true,
        },
      }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          "x-request-id": "rate-1",
          "retry-after": "3",
          "set-cookie": "private=value",
        },
      },
    ),
  );
  const controller = new AbortController();
  const request = new Request(
    "http://localhost/api/hub/self/skill-installations/i1/enabled",
    {
      method: "PUT",
      signal: controller.signal,
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
        "idempotency-key": "frozen",
        "x-kokoro-subject": "forged",
        authorization: "Bearer forged",
        cookie: "private=browser",
      },
      body: '{"enabled":false}',
    },
  );
  const response = await PUT(
    request,
    params(["self", "skill-installations", "i1", "enabled"]),
  );
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("3");
  expect(response.headers.get("set-cookie")).toBeNull();
  const options = vi.mocked(requestWithDomain).mock.calls[0]?.[2];
  expect(options?.headers).toMatchObject({
    authorization: "Bearer product-access",
    "idempotency-key": "frozen",
  });
  expect(options?.headers).not.toHaveProperty("x-kokoro-subject");
  expect(options?.headers).not.toHaveProperty("cookie");
  expect(options?.signal?.aborted).toBe(false);
  controller.abort();
  expect(options?.signal?.aborted).toBe(true);
  expect(new TextDecoder().decode(options?.body)).toBe('{"enabled":false}');
});

it.each([301, 201, 204])(
  "rejects unexpected installation response status %i",
  async (status) => {
    const { GET } = await import("@/app/api/hub/[...path]/route");
    vi.mocked(requestWithDomain).mockResolvedValue(
      new Response(status === 204 ? null : '{"data":[]}', {
        status,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          "x-request-id": "read-1",
        },
      }),
    );
    const response = await GET(
      new Request("http://localhost/api/hub/self/skill-installations"),
      params(["self", "skill-installations"]),
    );
    expect(response.status).toBe(502);
  },
);

it.each([
  [
    "POST",
    ["self", "skill-installations"],
    "text/plain",
    '{"source_ref":"skill:s1"}',
  ],
  [
    "PUT",
    ["self", "skill-installations", "i1", "enabled"],
    "application/json",
    "{}",
  ],
  [
    "PUT",
    ["self", "skill-installations", "i1", "enabled"],
    "application/json",
    '{"enabled":"false"}',
  ],
  [
    "PUT",
    ["self", "skill-installations", "i1", "enabled"],
    "application/json",
    '{"enabled":false,"generation":1}',
  ],
] as const)(
  "rejects invalid installation media/body %s %#",
  async (method, path, contentType, body) => {
    const route = await import("@/app/api/hub/[...path]/route");
    const proxyHubRequest = method === "PUT" ? route.PUT : route.POST;
    const response = await proxyHubRequest(
      new Request(`http://localhost/api/hub/${path.join("/")}`, {
        method,
        headers: {
          origin: "http://localhost",
          "content-type": contentType,
          "idempotency-key": "key",
        },
        body,
      }),
      params([...path]),
    );
    expect(response.status).toBe(400);
    expect(requestWithDomain).not.toHaveBeenCalled();
  },
);

it("rejects installation aliases/unknown methods and foreign Origin before owner calls", async () => {
  const { GET, PATCH, POST } = await import("@/app/api/hub/[...path]/route");
  for (const path of [
    ["skill-installations"],
    ["self", "skill-installations", "i1", "unknown"],
  ]) {
    expect(
      (
        await GET(
          new Request(`http://localhost/api/hub/${path.join("/")}`),
          params(path),
        )
      ).status,
    ).toBe(404);
  }
  expect(
    (
      await PATCH(
        new Request("http://localhost/api/hub/self/skill-installations", {
          method: "PATCH",
        }),
        params(["self", "skill-installations"]),
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await POST(
        new Request("http://localhost/api/hub/self/skill-installations", {
          method: "POST",
          headers: { origin: "https://evil.test" },
        }),
        params(["self", "skill-installations"]),
      )
    ).status,
  ).toBe(403);
  expect(requestWithDomain).not.toHaveBeenCalled();
});

it("does not forward mismatched installation identity or invalid error status/code pairs", async () => {
  const { GET } = await import("@/app/api/hub/[...path]/route");
  const responses = [
    {
      status: 200,
      value: {
        data: {
          display_name: "Mine",
          summary: "Summary",
          source_status: "active",
          skill_updated_at: "2026-10-10T00:00:00Z",
          example_prompts: [],
          category_keys: [],
          product: { publication_audience: "owner", state_version: "5" },
          tags: [],
          installation_id: "other",
          source_ref: "skill:s1",
          series_id: "s",
          revision: "1",
          installed: true,
          enabled: true,
          installed_at: "2026-09-30T10:00:00Z",
          updated_at: "2026-09-30T10:00:00Z",
        },
      },
    },
    {
      status: 403,
      value: {
        error: {
          code: "skill_installation_dependency_timeout",
          message: "SENTINEL",
          retryable: true,
        },
      },
    },
    { status: 200, value: { data: [], private: "SENTINEL" } },
  ];
  for (const { status, value } of responses) {
    vi.mocked(requestWithDomain).mockResolvedValue(
      new Response(JSON.stringify(value), {
        status,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          "x-request-id": "read-1",
        },
      }),
    );
    const response = await GET(
      new Request("http://localhost/api/hub/self/skill-installations/i1"),
      params(["self", "skill-installations", "i1"]),
    );
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("SENTINEL");
  }
});

it.each(["content-type", "cache-control", "x-request-id"])(
  "fails closed on missing installation %s",
  async (name) => {
    const { GET } = await import("@/app/api/hub/[...path]/route");
    const headers = new Headers({
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-request-id": "read-1",
    });
    headers.delete(name);
    vi.mocked(requestWithDomain).mockResolvedValue(
      new Response('{"data":[]}', { headers }),
    );
    expect(
      (
        await GET(
          new Request("http://localhost/api/hub/self/skill-installations"),
          params(["self", "skill-installations"]),
        )
      ).status,
    ).toBe(502);
  },
);

describe("R243 exact Project name adapter", () => {
  const id = "project_12345678-1234-1234-1234-123456789abc";
  const headers = {
    "content-type": "application/json",
    "cache-control": "no-store",
    "x-request-id": "owner-rename-1",
  };
  const request = (
    body = '{"name":"  我的项目  "}',
    suffix = "",
    key = "stable-key",
  ) =>
    new Request(`http://localhost/api/hub/projects/${id}/name${suffix}`, {
      method: "PATCH",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
        "Idempotency-Key": key,
      },
      body,
    });
  const path = params(["projects", id, "name"]);
  async function expectError(response: Response, status: number, code: string) {
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("x-request-id")).toMatch(
      /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u,
    );
    expect(await response.json()).toEqual({
      error: {
        code,
        message: code,
        retryable: status >= 500 || status === 499,
      },
    });
  }

  it("maps only exact canonical PATCH, normalized closed body and stable key to the admitted BFF domain", async () => {
    const { PATCH } = await import("@/app/api/hub/[...path]/route");
    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      Response.json(
        { data: { project_id: id, name: "我的项目" } },
        { headers },
      ),
    );
    const response = await PATCH(request(), path);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("owner-rename-1");
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(await response.json()).toEqual({
      data: { project_id: id, name: "我的项目" },
    });
    expect(requestWithDomain).toHaveBeenCalledTimes(1);
    const [url, domain, init] = vi.mocked(requestWithDomain).mock.calls[0]!;
    expect(url).toBe(`http://bff.test/v1/projects/${id}/name`);
    expect(domain).toBe("dev.kokoro.localhost");
    expect(init).toMatchObject({
      method: "PATCH",
      timeoutMs: expect.any(Number),
      maxRequestBytes: 65_536,
      maxResponseBytes: 65_536,
    });
    expect(init?.timeoutMs).toBeGreaterThan(0);
    expect(init?.timeoutMs).toBeLessThanOrEqual(10_000);
    expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe(
      '{"name":"我的项目"}',
    );
    const upstreamHeaders = new Headers(init?.headers);
    expect(upstreamHeaders.get("idempotency-key")).toBe("stable-key");
    expect(upstreamHeaders.get("authorization")).toBe("Bearer product-access");
    expect(upstreamHeaders.get("x-kokoro-service")).toBe("web-bff");
    expect(init?.signal?.aborted).toBe(true);
  });

  it("rejects aliases, query including bare ?, duplicate JSON keys, invalid Unicode and malformed keys before owner I/O", async () => {
    const { PATCH } = await import("@/app/api/hub/[...path]/route");
    for (const body of [
      '{"name":"A","name":"B"}',
      '{"name":"A","na\\u006de":"B"}',
      '{"name":"A","subject":"spoof"}',
      '{"name":"\\ud800"}',
      '{"name":"\\u0000"}',
      JSON.stringify({ name: "😀".repeat(81) }),
    ]) {
      await expectError(
        await PATCH(request(body), path),
        400,
        "invalid_project_rename",
      );
    }
    for (const suffix of ["?", "?x=1", "/extra"])
      await expectError(
        await PATCH(request(undefined, suffix), path),
        400,
        "invalid_project_rename",
      );
    for (const key of ["a,b", "a b", "x".repeat(129)])
      await expectError(
        await PATCH(request(undefined, "", key), path),
        400,
        "invalid_project_rename",
      );
    await expectError(
      await PATCH(
        new Request(`http://localhost/api/hub/self/projects/${id}/name`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": "key",
          },
          body: '{"name":"A"}',
        }),
        params(["self", "projects", id, "name"]),
      ),
      400,
      "invalid_project_rename",
    );
    await expectError(
      await PATCH(
        new Request(`http://localhost/api/hub/projects/${id}/name`, {
          method: "PATCH",
          headers: {
            origin: "https://evil.test",
            "content-type": "application/json",
            "Idempotency-Key": "key",
          },
          body: '{"name":"A"}',
        }),
        path,
      ),
      403,
      "session_forbidden",
    );
    expect(requestWithDomain).not.toHaveBeenCalled();
  });

  it("closes owner status/headers/errors and never accepts a receipt as current Project", async () => {
    const { PATCH } = await import("@/app/api/hub/[...path]/route");
    const ack = { data: { project_id: id, name: "我的项目" } };
    const vectors = [
      {
        body: { data: { ...ack.data, name: "Newer B" } },
        status: 200,
        code: "ack_shape_mismatch",
      },
      { body: { ...ack, meta: {} }, status: 200, code: "ack_shape_mismatch" },
      { body: ack, status: 201, code: "unexpected_status" },
      {
        body: {
          error: {
            code: "session_forbidden",
            message: "denied",
            retryable: false,
          },
        },
        status: 503,
        code: "unexpected_status",
      },
      {
        body: {
          error: {
            code: "business_store_unavailable",
            message: "unknown",
            retryable: false,
          },
        },
        status: 503,
        code: "unexpected_status",
      },
    ];
    for (const vector of vectors) {
      vi.mocked(requestWithDomain).mockResolvedValueOnce(
        Response.json(vector.body, { status: vector.status, headers }),
      );
      await expectError(await PATCH(request(), path), 502, vector.code);
    }
    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      Response.json(ack, {
        headers: { ...headers, "cache-control": "public" },
      }),
    );
    await expectError(await PATCH(request(), path), 502, "invalid_headers");
    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      new Response(
        '{"data":{"project_id":"' + id + '","name":"A","name":"我的项目"}}',
        { headers },
      ),
    );
    await expectError(await PATCH(request(), path), 502, "invalid_json");
    const error = {
      error: {
        code: "business_store_unavailable",
        message: "unknown commit",
        retryable: true,
      },
    };
    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      Response.json(error, { status: 503, headers }),
    );
    const unavailable = await PATCH(request(), path);
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("x-request-id")).toBe(
      headers["x-request-id"],
    );
    expect(await unavailable.json()).toEqual(error);
    expect(requestWithDomain).toHaveBeenCalledTimes(vectors.length + 3);
  });

  it("does no owner write without configuration or current admission", async () => {
    const { PATCH } = await import("@/app/api/hub/[...path]/route");
    delete process.env.KOKORO_WEB_AUTH_SECRET;
    await expectError(
      await PATCH(request(), path),
      503,
      "product_tenant_not_configured",
    );
    expect(currentProductSession).not.toHaveBeenCalled();
    process.env.KOKORO_WEB_AUTH_SECRET = ENV.KOKORO_WEB_AUTH_SECRET;
    currentProductSession.mockResolvedValueOnce(null);
    await expectError(
      await PATCH(request(), path),
      401,
      "session_authentication_required",
    );
    currentProductSession.mockRejectedValueOnce(new Error("IAM unavailable"));
    await expectError(
      await PATCH(request(), path),
      503,
      "iam_admission_unavailable",
    );
    expect(requestWithDomain).not.toHaveBeenCalled();
  });

  it("shares the 10-second admission/body budget and aborts a caller cancellation without later I/O", async () => {
    const { PATCH } = await import("@/app/api/hub/[...path]/route");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    try {
      let admit: (value: null) => void = () => {
        throw new Error("no admission");
      };
      currentProductSession.mockImplementationOnce(
        () =>
          new Promise<null>((resolve) => {
            admit = resolve;
          }),
      );
      const pending = PATCH(request(), path);
      await vi.advanceTimersByTimeAsync(10_000);
      await expectError(await pending, 504, "request_timeout");
      admit(null);
      await Promise.resolve();
      expect(requestWithDomain).not.toHaveBeenCalled();
      const controller = new AbortController();
      const cancelled = PATCH(
        new Request(`http://localhost/api/hub/projects/${id}/name`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": "key",
          },
          body: new ReadableStream<Uint8Array>(),
          duplex: "half",
          signal: controller.signal,
        } as RequestInit & { duplex: string }),
        path,
      );
      await Promise.resolve();
      controller.abort();
      await expectError(await cancelled, 499, "request_aborted");
      expect(requestWithDomain).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

it("keeps managed reads a closed static route and rejects retired published wire paths", async () => {
  const { GET } = await import("@/app/api/hub/[...path]/route");
  for (const [url, path, status] of [
    ["/self/skills", ["self", "skills"], 404],
    ["/self/skills/mine", ["self", "skills", "mine"], 404],
    [
      "/self/skills/managed?status=draft&status=active",
      ["self", "skills", "managed"],
      400,
    ],
    [
      "/self/skills/managed?status=draft&limit=101",
      ["self", "skills", "managed"],
      400,
    ],
    [
      "/self/skills/managed?status=draft&unexpected=1",
      ["self", "skills", "managed"],
      400,
    ],
    [
      "/self/skills/managed/mine?status=draft",
      ["self", "skills", "managed", "mine"],
      400,
    ],
  ] as const) {
    const response = await GET(
      new Request(`http://localhost/api/hub${url}`),
      params([...path]),
    );
    expect(response.status).toBe(status);
  }
  expect(requestWithDomain).not.toHaveBeenCalled();
});

it.each(["draft", "active"])(
  "maps only exact managed %s reads to current owner self resources",
  async (status) => {
    const { GET } = await import("@/app/api/hub/[...path]/route");
    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { skills: [], next_cursor: null },
          meta: { request_id: "managed-owner" },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-request-id": "managed-owner",
          },
        },
      ),
    );
    const response = await GET(
      new Request(
        `http://localhost/api/hub/self/skills/managed?status=${status}&limit=50&cursor=opaque`,
      ),
      params(["self", "skills", "managed"]),
    );
    expect(response.status).toBe(200);
    expect(vi.mocked(requestWithDomain).mock.calls[0]?.[0]).toBe(
      `http://bff.test/v1/self/skills?status=${status}&limit=50&cursor=opaque`,
    );
    expect(vi.mocked(requestWithDomain).mock.calls[0]?.[2]).toMatchObject({
      timeoutMs: 10000,
      maxResponseBytes: 1048576,
    });
  },
);

const ownerCoverHeaders = {
  "content-type": "image/png",
  "content-length": "3",
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-request-id": "req-cover",
};
it("proxies only the exact owner revision cover GET with trusted session and image bytes", async () => {
  const { GET } = await import("@/app/api/hub/[...path]/route");
  vi.mocked(requestWithDomain).mockResolvedValue(
    new Response(new Uint8Array([1, 2, 3]), { headers: ownerCoverHeaders }),
  );
  const result = await GET(
    new Request("http://localhost/api/hub/skills/revision-current/cover"),
    params(["skills", "revision-current", "cover"]),
  );
  expect(result.status).toBe(200);
  expect([...new Uint8Array(await result.arrayBuffer())]).toEqual([1, 2, 3]);
  expect(result.headers.get("content-type")).toBe("image/png");
  expect(result.headers.get("referrer-policy")).toBe("no-referrer");
  expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect(requestWithDomain).toHaveBeenCalledWith(
    "http://bff.test/v1/skills/revision-current/cover",
    "dev.kokoro.localhost",
    expect.objectContaining({
      method: "GET",
      timeoutMs: expect.any(Number),
      maxResponseBytes: 5242880,
      strictResponseLength: true,
    }),
  );
  expect(
    vi.mocked(requestWithDomain).mock.calls[0]?.[2]?.timeoutMs,
  ).toBeGreaterThan(0);
  expect(
    vi.mocked(requestWithDomain).mock.calls[0]?.[2]?.timeoutMs,
  ).toBeLessThanOrEqual(10_000);
});
it("rejects cover aliases, methods, query, encoded IDs, foreign Origin and missing session before owner I/O", async () => {
  const { GET, POST } = await import("@/app/api/hub/[...path]/route");
  for (const [path, suffix, method, origin] of [
    [["self", "skills", "revision-current", "cover"], "", "GET", null],
    [["skills", "%72evision-current", "cover"], "", "GET", null],
    [["skills", "revision-current", "cover"], "?q=1", "GET", null],
    [["skills", "revision-current", "cover"], "", "POST", null],
    [
      ["skills", "revision-current", "cover"],
      "",
      "GET",
      "https://foreign.test",
    ],
  ] as const) {
    vi.mocked(requestWithDomain).mockClear();
    const request = new Request(
      `http://localhost/api/hub/${path.join("/")}${suffix}`,
      { method, ...(origin ? { headers: { origin } } : {}) },
    );
    const result = await (method === "GET" ? GET : POST)(
      request,
      params([...path]),
    );
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(requestWithDomain).not.toHaveBeenCalled();
  }
  currentProductSession.mockResolvedValue(null);
  const result = await GET(
    new Request("http://localhost/api/hub/skills/revision-current/cover"),
    params(["skills", "revision-current", "cover"]),
  );
  expect(result.status).toBe(401);
});
it("rejects invalid cover media/length/headers and truncated or excessive body", async () => {
  const { GET } = await import("@/app/api/hub/[...path]/route");
  for (const overrides of [
    { "content-type": "image/svg+xml" },
    { "content-length": "5242881" },
    { "content-length": "03" },
    { "cache-control": "public" },
    { "x-content-type-options": "" },
  ]) {
    vi.mocked(requestWithDomain).mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { ...ownerCoverHeaders, ...overrides },
      }),
    );
    const result = await GET(
      new Request("http://localhost/api/hub/skills/revision-current/cover"),
      params(["skills", "revision-current", "cover"]),
    );
    expect(result.status).toBe(502);
  }
  for (const bytes of [
    [1, 2],
    [1, 2, 3, 4],
  ]) {
    vi.mocked(requestWithDomain).mockResolvedValue(
      new Response(new Uint8Array(bytes), { headers: ownerCoverHeaders }),
    );
    const result = await GET(
      new Request("http://localhost/api/hub/skills/revision-current/cover"),
      params(["skills", "revision-current", "cover"]),
    );
    await expect(result.arrayBuffer()).rejects.toThrow();
  }
});

it.each(["image/jpeg", "image/webp"])(
  "preserves the owner %s cover representation",
  async (type) => {
    const { GET } = await import("@/app/api/hub/[...path]/route");
    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { ...ownerCoverHeaders, "content-type": type },
      }),
    );
    const result = await GET(
      new Request("http://localhost/api/hub/skills/revision-current/cover", {
        headers: {
          cookie: "forged",
          "x-kokoro-user-id": "forged",
          origin: "http://localhost",
        },
      }),
      params(["skills", "revision-current", "cover"]),
    );
    expect(result.headers.get("content-type")).toBe(type);
    expect((await result.arrayBuffer()).byteLength).toBe(3);
    const headers = vi.mocked(requestWithDomain).mock.calls[0]?.[2]?.headers;
    expect(headers).toMatchObject({
      authorization: "Bearer product-access",
      "x-kokoro-service": "web-bff",
      "x-kokoro-internal-secret": "svc-secret",
    });
    expect(headers).not.toHaveProperty("cookie");
    expect(headers).not.toHaveProperty("x-kokoro-user-id");
  },
);
it("closes cover error status/code pairs and stops aborted or expired admission before owner I/O", async () => {
  const { GET } = await import("@/app/api/hub/[...path]/route");
  const request = () =>
    new Request("http://localhost/api/hub/skills/revision-current/cover");
  for (const [status, code, expected] of [
    [404, "skill_not_found", 404],
    [502, "skill_not_found", 502],
    [503, "invented", 502],
  ] as const) {
    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      Response.json(
        { error: { code, message: "Owner error", retryable: false } },
        { status },
      ),
    );
    expect(
      (await GET(request(), params(["skills", "revision-current", "cover"])))
        .status,
    ).toBe(expected);
  }
  vi.mocked(requestWithDomain).mockClear();
  const controller = new AbortController();
  controller.abort();
  await GET(
    new Request(request(), { signal: controller.signal }),
    params(["skills", "revision-current", "cover"]),
  );
  expect(requestWithDomain).not.toHaveBeenCalled();
  vi.useFakeTimers();
  try {
    currentProductSession.mockImplementationOnce(() => new Promise(() => {}));
    const pending = GET(
      request(),
      params(["skills", "revision-current", "cover"]),
    );
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await pending).status).toBe(503);
    expect(requestWithDomain).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it("rejects cover body declarations, command identity and scheme-changing Origin before owner I/O", async () => {
  const { GET } = await import("@/app/api/hub/[...path]/route");
  for (const headers of [
    { "content-length": "0" },
    { "transfer-encoding": "chunked" },
    { "idempotency-key": "key" },
    { origin: "https://localhost" },
  ]) {
    const result = await GET(
      new Request("http://localhost/api/hub/skills/revision-current/cover", {
        headers,
      }),
      params(["skills", "revision-current", "cover"]),
    );
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(requestWithDomain).not.toHaveBeenCalled();
  }
});

const catalogPackage = {
  data: {
    source_ref: "skill:revision-exact",
    revision: "4",
    files: [{ path: "SKILL.md", size_bytes: "12" }],
    selected_file: null,
  },
};
const catalogPackageHeaders = {
  "content-type": "application/json",
  "cache-control": "no-store",
  "x-request-id": "package-owner",
};
it("projects the exact published revision package directory through current same-origin admission", async () => {
  const { GET } = await import("@/app/api/hub/[...path]/route");
  vi.mocked(requestWithDomain).mockResolvedValueOnce(
    Response.json(catalogPackage, { headers: catalogPackageHeaders }),
  );
  const result = await GET(
    new Request("http://localhost/api/hub/skills/revision-exact/package"),
    params(["skills", "revision-exact", "package"]),
  );
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual(catalogPackage);
  expect(requestWithDomain).toHaveBeenCalledWith(
    "http://bff.test/v1/skills/revision-exact/package",
    "dev.kokoro.localhost",
    expect.objectContaining({ method: "GET", maxResponseBytes: 1048576 }),
  );
});
it("rejects published inspection resource mismatch instead of forwarding a different package", async () => {
  const { GET } = await import("@/app/api/hub/[...path]/route");
  vi.mocked(requestWithDomain).mockResolvedValueOnce(
    Response.json(
      { data: { ...catalogPackage.data, source_ref: "skill:other-revision" } },
      { headers: catalogPackageHeaders },
    ),
  );
  const result = await GET(
    new Request("http://localhost/api/hub/skills/revision-exact/package"),
    params(["skills", "revision-exact", "package"]),
  );
  expect(result.status).toBe(502);
});
it("bounds published package slow body and cancels the stream at the whole request deadline", async () => {
  const { GET } = await import("@/app/api/hub/[...path]/route");
  vi.useFakeTimers();
  const cancel = vi.fn();
  vi.mocked(requestWithDomain).mockResolvedValueOnce(
    new Response(new ReadableStream<Uint8Array>({ cancel }), {
      headers: catalogPackageHeaders,
    }),
  );
  try {
    const pending = GET(
      new Request("http://localhost/api/hub/skills/revision-exact/package"),
      params(["skills", "revision-exact", "package"]),
    );
    await vi.advanceTimersByTimeAsync(10_001);
    expect((await pending).status).toBe(503);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it("keeps published package GET closed to exact paths, one file query, no body and same origin", async () => {
  const { GET } = await import("@/app/api/hub/[...path]/route");
  for (const [parts, suffix, headers] of [
    [["self", "skills", "revision-exact", "package"], "", {}],
    [
      ["skills", "revision-exact", "package"],
      "?file_path=SKILL.md&file_path=notes.txt",
      {},
    ],
    [["skills", "revision-exact", "package"], "?file_path=..%2FSKILL.md", {}],
    [["skills", "revision-exact", "package"], "?other=1", {}],
    [["skills", "revision-exact", "package"], "", { "content-length": "0" }],
    [
      ["skills", "revision-exact", "package"],
      "",
      { origin: "https://foreign.test" },
    ],
  ] as const) {
    vi.mocked(requestWithDomain).mockClear();
    const result = await GET(
      new Request(`http://localhost/api/hub/${parts.join("/")}${suffix}`, {
        headers,
      }),
      params([...parts]),
    );
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(requestWithDomain).not.toHaveBeenCalled();
  }
});
it("checks published file bytes and rejects personal error families and mismatched public status", async () => {
  const { GET } = await import("@/app/api/hub/[...path]/route");
  const request = () =>
    new Request(
      "http://localhost/api/hub/skills/revision-exact/package?file_path=SKILL.md",
    );
  const context = () => params(["skills", "revision-exact", "package"]);
  vi.mocked(requestWithDomain).mockResolvedValueOnce(
    Response.json(
      {
        data: {
          ...catalogPackage.data,
          selected_file: { path: "SKILL.md", text: "# Owner text" },
        },
      },
      { headers: catalogPackageHeaders },
    ),
  );
  expect((await GET(request(), context())).status).toBe(200);
  expect(vi.mocked(requestWithDomain).mock.calls.at(-1)?.[0]).toBe(
    "http://bff.test/v1/skills/revision-exact/package?file_path=SKILL.md",
  );
  for (const [status, body] of [
    [
      200,
      {
        data: {
          ...catalogPackage.data,
          selected_file: { path: "SKILL.md", text: "wrong bytes" },
        },
      },
    ],
    [
      404,
      {
        error: {
          code: "skill_package_not_found",
          message: "Missing",
          retryable: false,
        },
      },
    ],
    [
      502,
      {
        error: {
          code: "skill_not_found",
          message: "Missing",
          retryable: false,
        },
      },
    ],
  ] as const) {
    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      Response.json(body, { status, headers: catalogPackageHeaders }),
    );
    expect((await GET(request(), context())).status).toBe(502);
  }
});
it("bounds actual package stream bytes and caller cancellation, not just declared size", async () => {
  const { GET } = await import("@/app/api/hub/[...path]/route");
  const context = () => params(["skills", "revision-exact", "package"]);
  const cancelLarge = vi.fn();
  vi.mocked(requestWithDomain).mockResolvedValueOnce(
    new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array(1048577));
        },
        cancel: cancelLarge,
      }),
      { headers: catalogPackageHeaders },
    ),
  );
  expect(
    (
      await GET(
        new Request("http://localhost/api/hub/skills/revision-exact/package"),
        context(),
      )
    ).status,
  ).toBe(502);
  expect(cancelLarge).toHaveBeenCalledTimes(1);
  const cancel = vi.fn();
  const caller = new AbortController();
  vi.mocked(requestWithDomain).mockResolvedValueOnce(
    new Response(new ReadableStream<Uint8Array>({ cancel }), {
      headers: catalogPackageHeaders,
    }),
  );
  const pending = GET(
    new Request("http://localhost/api/hub/skills/revision-exact/package", {
      signal: caller.signal,
    }),
    context(),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  caller.abort();
  expect((await pending).status).toBe(503);
  expect(cancel).toHaveBeenCalledTimes(1);
});

it("admits the formal browser-private local import Begin path and owner ACK", async () => {
  const { POST } = await import("@/app/api/hub/[...path]/route");
  const data = {
    intent_id: "intent-1",
    skill_id: "series-1",
    phase: "upload_pending",
    upload_id: "upload-1",
    transfer_reference: {
      url: "https://objects.example/put",
      method: "PUT",
      required_headers: { "content-type": "application/zip" },
      expires_at: "2999-01-01T00:00:00Z",
    },
    expires_at: "2999-01-01T00:00:00Z",
    replayed: false,
  };
  vi.mocked(requestWithDomain).mockResolvedValue(
    new Response(JSON.stringify({ data }), {
      status: 201,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-request-id": "owner-1",
      },
    }),
  );
  const response = await POST(
    new Request("http://localhost/api/hub/skills/local-imports", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
        "idempotency-key": "begin-1",
      },
      body: JSON.stringify({
        filename: "mine.skill",
        size_bytes: 3,
        content_sha256: "a".repeat(64),
      }),
    }),
    params(["skills", "local-imports"]),
  );
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ data });
});

const importExpiry = "2999-01-01T00:00:00Z";
const importProof = {
  upload_id: "upload-1",
  asset_id: "asset-1",
  source_version_id: "real-version",
  size_bytes: "3",
  content_sha256: "a".repeat(64),
};
const importSkill = {
  skill_id: "revision-1",
  source_ref: "skill:revision-1",
  series_id: "series-1",
  revision: "1",
  status: "active",
  name: "Mine",
  summary: "",
  tags: [],
  example_prompts: [],
  category_keys: [],
  skill_updated_at: "2026-10-10T00:00:00Z",
  product: {
    publication_audience: "owner",
    state_version: "4",
    source_kind: "personal",
  },
  package_phase: "valid",
};
const importInstallation = {
  installation_id: "installation-1",
  source_ref: importSkill.source_ref,
  series_id: importSkill.series_id,
  revision: "1",
  installed: true,
  enabled: true,
  installed_at: importSkill.skill_updated_at,
  updated_at: importSkill.skill_updated_at,
  display_name: "Mine",
  summary: "",
  source_status: "active",
  skill_updated_at: importSkill.skill_updated_at,
  example_prompts: [],
  category_keys: [],
  product: importSkill.product,
  tags: [],
};
const importOwnerHeaders = {
  "content-type": "application/json",
  "cache-control": "no-store",
  "x-request-id": "owner-1",
};

it("maps Complete/zero-body Finalize/Get to exactly formal local-import paths, never self aliases", async () => {
  const { POST, GET } = await import("@/app/api/hub/[...path]/route");
  const commands = [
    {
      tail: ["intent-1", "complete"],
      data: {
        intent_id: "intent-1",
        skill_id: "series-1",
        phase: "uploaded",
        upload_proof: importProof,
        scan_state: "pending",
        expires_at: importExpiry,
        replayed: false,
      },
      body: {
        upload_id: "upload-1",
        source_version_id: "real-version",
        size_bytes: 3,
        content_sha256: importProof.content_sha256,
      },
    },
    {
      tail: ["intent-1", "finalize"],
      data: {
        intent_id: "intent-1",
        phase: "completed",
        skill: importSkill,
        installation: importInstallation,
        replayed: false,
      },
    },
    {
      tail: ["intent-1"],
      data: {
        intent_id: "intent-1",
        skill_id: "series-1",
        phase: "completed",
        expires_at: importExpiry,
        upload_proof: importProof,
        skill: importSkill,
      },
    },
  ];
  for (const command of commands) {
    vi.mocked(requestWithDomain).mockResolvedValue(
      new Response(JSON.stringify({ data: command.data }), {
        headers: importOwnerHeaders,
      }),
    );
    const get = command.tail.length === 1;
    const path = ["skills", "local-imports", ...command.tail];
    const response = await (get ? GET : POST)(
      new Request(`http://localhost/api/hub/${path.join("/")}`, {
        method: get ? "GET" : "POST",
        headers: {
          origin: "http://localhost",
          ...(get ? {} : { "idempotency-key": "original-key" }),
          ...("body" in command ? { "content-type": "application/json" } : {}),
        },
        ...("body" in command ? { body: JSON.stringify(command.body) } : {}),
      }),
      params(path),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: command.data });
    expect(requestWithDomain).toHaveBeenLastCalledWith(
      `http://bff.test/browser/v1/${path.join("/")}`,
      ENV.KOKORO_DOMAIN,
      expect.objectContaining({
        method: get ? "GET" : "POST",
        headers: expect.objectContaining({
          authorization: "Bearer product-access",
          "x-kokoro-service": "web-bff",
        }),
      }),
    );
    if (command.tail.at(-1) === "finalize")
      expect(
        vi.mocked(requestWithDomain).mock.calls.at(-1)?.[2],
      ).not.toHaveProperty("body");
  }
});
it.each([
  { tail: ["intent-1", "finalize"], method: "POST", body: "{}", key: "key" },
  { tail: ["intent-1"], method: "GET", key: "key" },
  { tail: ["intent-1", "finalize"], method: "POST", key: "comma,key" },
  { tail: ["intent-1", "complete", "extra"], method: "POST", key: "key" },
])(
  "rejects local import nonzero body/key/path variants before owner IO",
  async ({ tail, method, body, key }) => {
    const { POST, GET } = await import("@/app/api/hub/[...path]/route");
    const path = ["skills", "local-imports", ...tail];
    const response = await (method === "GET" ? GET : POST)(
      new Request(`http://localhost/api/hub/${path.join("/")}`, {
        method,
        headers: { origin: "http://localhost", "idempotency-key": key },
        ...(body === undefined ? {} : { body }),
      }),
      params(path),
    );
    expect(response.status).toBe(400);
    expect(requestWithDomain).not.toHaveBeenCalled();
  },
);
it("keeps local-import Origin/session/query gates closed", async () => {
  const { POST, GET } = await import("@/app/api/hub/[...path]/route");
  const path = ["skills", "local-imports", "intent-1"];
  const query = await GET(
    new Request(
      "http://localhost/api/hub/skills/local-imports/intent-1?tenant=other",
    ),
    params(path),
  );
  expect(query.status).toBe(400);
  const foreign = await POST(
    new Request(
      "http://localhost/api/hub/skills/local-imports/intent-1/finalize",
      {
        method: "POST",
        headers: { origin: "http://evil.test", "idempotency-key": "key" },
      },
    ),
    params([...path, "finalize"]),
  );
  expect(foreign.status).toBe(403);
  currentProductSession.mockResolvedValue(null);
  const unauthenticated = await GET(
    new Request("http://localhost/api/hub/skills/local-imports/intent-1"),
    params(path),
  );
  expect(unauthenticated.status).toBe(401);
  expect(requestWithDomain).not.toHaveBeenCalled();
});
it("rejects Complete ACK mismatched proof and Get foreign series without leaking owner-family errors", async () => {
  const { POST, GET } = await import("@/app/api/hub/[...path]/route");
  vi.mocked(requestWithDomain).mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        data: {
          intent_id: "intent-1",
          skill_id: "series-1",
          phase: "uploaded",
          upload_proof: { ...importProof, source_version_id: "different" },
          scan_state: "clean",
          expires_at: importExpiry,
          replayed: false,
        },
      }),
      { headers: importOwnerHeaders },
    ),
  );
  const response = await POST(
    new Request(
      "http://localhost/api/hub/skills/local-imports/intent-1/complete",
      {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
          "idempotency-key": "key",
        },
        body: JSON.stringify({
          upload_id: "upload-1",
          source_version_id: "real-version",
          size_bytes: 3,
          content_sha256: importProof.content_sha256,
        }),
      },
    ),
    params(["skills", "local-imports", "intent-1", "complete"]),
  );
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({
    error: { code: "local_skill_import_response_invalid" },
  });
  vi.mocked(requestWithDomain).mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        data: {
          intent_id: "intent-1",
          skill_id: "foreign",
          phase: "completed",
          expires_at: importExpiry,
          upload_proof: importProof,
          skill: importSkill,
        },
      }),
      { headers: importOwnerHeaders },
    ),
  );
  expect(
    (
      await GET(
        new Request("http://localhost/api/hub/skills/local-imports/intent-1"),
        params(["skills", "local-imports", "intent-1"]),
      )
    ).status,
  ).toBe(502);
});
it("accepts formal local-import 429 without Retry-After, rejects a wrong error/status pair", async () => {
  const { POST } = await import("@/app/api/hub/[...path]/route");
  const call = () =>
    POST(
      new Request(
        "http://localhost/api/hub/skills/local-imports/intent-1/finalize",
        {
          method: "POST",
          headers: { origin: "http://localhost", "idempotency-key": "key" },
        },
      ),
      params(["skills", "local-imports", "intent-1", "finalize"]),
    );
  vi.mocked(requestWithDomain).mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        error: {
          code: "local_skill_import_rate_limited",
          message: "limited",
          retryable: true,
        },
      }),
      {
        status: 429,
        headers: importOwnerHeaders,
      },
    ),
  );
  expect((await call()).status).toBe(429);
  vi.mocked(requestWithDomain).mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        error: {
          code: "local_skill_import_precondition_failed",
          message: "phase",
          retryable: false,
        },
      }),
      {
        status: 403,
        headers: importOwnerHeaders,
      },
    ),
  );
  expect((await call()).status).toBe(502);
});
it("local import total budget closes an unending upstream body", async () => {
  vi.useFakeTimers();
  try {
    const { GET } = await import("@/app/api/hub/[...path]/route");
    const cancel = vi.fn();
    vi.mocked(requestWithDomain).mockResolvedValue(
      new Response(new ReadableStream({ cancel }), {
        headers: importOwnerHeaders,
      }),
    );
    const result = GET(
      new Request("http://localhost/api/hub/skills/local-imports/intent-1"),
      params(["skills", "local-imports", "intent-1"]),
    );
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await result).status).toBe(503);
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

const githubSelector = {
  owner: "acme",
  repository: "skills",
  commit: "a".repeat(40),
  path: "tools/check",
};
const githubDraft = {
  skill_id: "revision-new",
  source_ref: "skill:revision-new",
  status: "draft",
  state_version: "4",
  valid: true,
  content_digest: "b".repeat(64),
  manifest_identity: `skill-md-v1:sha256:${"b".repeat(64)}`,
};
const githubPreview = {
  selection_required: true,
  repository_url: "https://github.com/acme/skills",
  commit: githubSelector.commit,
  paths: ["tools/check", "tools/other"],
};
const githubOwnerResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-request-id": "github-owner",
    },
  });
const githubRequest = (
  operation: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Request(`http://localhost/api/hub/skills/github/${operation}`, {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
it.each(["preview", "import"])(
  "admits exact formal GitHub %s and preserves immutable input",
  async (operation) => {
    const { POST } = await import("@/app/api/hub/[...path]/route");
    const data = operation === "preview" ? githubPreview : githubDraft;
    const body =
      operation === "preview"
        ? { repository_url: githubPreview.repository_url }
        : githubSelector;
    vi.mocked(requestWithDomain).mockResolvedValue(
      githubOwnerResponse(data, operation === "preview" ? 200 : 201),
    );
    const result = await POST(
      githubRequest(
        operation,
        body,
        operation === "import"
          ? { "idempotency-key": "github-original-key" }
          : {},
      ),
      params(["skills", "github", operation]),
    );
    expect(result.status).toBe(operation === "preview" ? 200 : 201);
    expect(await result.json()).toEqual({ data });
    expect(requestWithDomain).toHaveBeenCalledWith(
      `http://bff.test/v1/skills/github/${operation}`,
      ENV.KOKORO_DOMAIN,
      expect.objectContaining({ method: "POST", maxResponseBytes: 1_048_576 }),
    );
    const init = vi.mocked(requestWithDomain).mock.calls[0]![2]!;
    expect(
      JSON.parse(new TextDecoder().decode(init.body as ArrayBuffer)),
    ).toEqual(body);
    const forwarded = new Headers(init.headers);
    expect(forwarded.get("idempotency-key")).toBe(
      operation === "import" ? "github-original-key" : null,
    );
    expect(forwarded.get("authorization")).toBe("Bearer product-access");
  },
);

it.each([
  ["preview", { repository: "https://github.com/acme/skills" }, {}],
  [
    "preview",
    { repository_url: "https://github.com/acme/skills" },
    { "idempotency-key": "forbidden" },
  ],
  ["import", githubSelector, {}],
  ["import", { ...githubSelector, extra: true }, { "idempotency-key": "key" }],
  [
    "import",
    { ...githubSelector, path: "a".repeat(257) },
    { "idempotency-key": "key" },
  ],
] as const)(
  "rejects invalid GitHub %s body or key before upstream I/O",
  async (operation, body, headers) => {
    const { POST } = await import("@/app/api/hub/[...path]/route");
    const result = await POST(
      githubRequest(operation, body, headers),
      params(["skills", "github", operation]),
    );
    expect(result.status).toBe(400);
    expect(requestWithDomain).not.toHaveBeenCalled();
    expect(await result.json()).toMatchObject({
      error: { code: "invalid_skill_request" },
    });
  },
);
it.each(["?extra=1", "/extra", "/"])(
  "rejects GitHub path/query variant %s",
  async (suffix) => {
    const { POST } = await import("@/app/api/hub/[...path]/route");
    const result = await POST(
      new Request(`http://localhost/api/hub/skills/github/preview${suffix}`, {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({ repository_url: githubPreview.repository_url }),
      }),
      params(["skills", "github", "preview"]),
    );
    expect(result.status).toBe(400);
    expect(requestWithDomain).not.toHaveBeenCalled();
  },
);
it("keeps GitHub origin, session and method boundaries closed", async () => {
  const { POST, GET } = await import("@/app/api/hub/[...path]/route");
  const path = params(["skills", "github", "preview"]);
  expect(
    (
      await POST(
        githubRequest(
          "preview",
          { repository_url: githubPreview.repository_url },
          { origin: "https://evil.test" },
        ),
        path,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await GET(
        new Request("http://localhost/api/hub/skills/github/preview"),
        path,
      )
    ).status,
  ).toBe(400);
  currentProductSession.mockResolvedValueOnce(null);
  expect(
    (
      await POST(
        githubRequest("preview", {
          repository_url: githubPreview.repository_url,
        }),
        path,
      )
    ).status,
  ).toBe(401);
  expect(requestWithDomain).not.toHaveBeenCalled();
});
it("rejects malformed GitHub owner ACK and status/code mismatch instead of relaying a fake installation", async () => {
  const { POST } = await import("@/app/api/hub/[...path]/route");
  for (const data of [
    { ...githubDraft, installed: true },
    { ...githubDraft, source_ref: "skill:wrong" },
    { ...githubDraft, status: "active" },
  ]) {
    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      githubOwnerResponse(data, 201),
    );
    expect(
      (
        await POST(
          githubRequest("import", githubSelector, { "idempotency-key": "key" }),
          params(["skills", "github", "import"]),
        )
      ).status,
    ).toBe(502);
  }
  vi.mocked(requestWithDomain).mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        error: { code: "session_invalid", message: "Wrong", retryable: false },
      }),
      {
        status: 502,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          "x-request-id": "github-owner",
        },
      },
    ),
  );
  expect(
    (
      await POST(
        githubRequest("preview", {
          repository_url: githubPreview.repository_url,
        }),
        params(["skills", "github", "preview"]),
      )
    ).status,
  ).toBe(502);
});
it("relays legitimate GitHub 429 without requiring an absent Retry-After", async () => {
  const { POST } = await import("@/app/api/hub/[...path]/route");
  const error = {
    error: { code: "skill_rate_limited", message: "Limited", retryable: true },
  };
  vi.mocked(requestWithDomain).mockResolvedValueOnce(
    new Response(JSON.stringify(error), {
      status: 429,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-request-id": "github-owner",
      },
    }),
  );
  const result = await POST(
    githubRequest("preview", { repository_url: githubPreview.repository_url }),
    params(["skills", "github", "preview"]),
  );
  expect(result.status).toBe(429);
  expect(await result.json()).toEqual(error);
  expect(result.headers.has("retry-after")).toBe(false);
});
it("cancels GitHub oversized response bytes, including streams without declared length", async () => {
  const { POST } = await import("@/app/api/hub/[...path]/route");
  const cancel = vi.fn();
  vi.mocked(requestWithDomain).mockResolvedValueOnce(
    new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(1_048_577));
        },
        cancel,
      }),
      {
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          "x-request-id": "github-owner",
        },
      },
    ),
  );
  expect(
    (
      await POST(
        githubRequest("preview", {
          repository_url: githubPreview.repository_url,
        }),
        params(["skills", "github", "preview"]),
      )
    ).status,
  ).toBe(502);
  expect(cancel).toHaveBeenCalled();
});
it("bounds the total GitHub adapter body-read deadline and leaves no timer", async () => {
  vi.useFakeTimers();
  try {
    const { POST } = await import("@/app/api/hub/[...path]/route");
    const cancel = vi.fn();
    vi.mocked(requestWithDomain).mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode('{"data":'));
          },
          cancel,
        }),
        {
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-request-id": "github-owner",
          },
        },
      ),
    );
    const work = POST(
      githubRequest("preview", {
        repository_url: githubPreview.repository_url,
      }),
      params(["skills", "github", "preview"]),
    );
    await vi.advanceTimersByTimeAsync(10_001);
    expect((await work).status).toBe(503);
    expect(cancel).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
it("retires a late GitHub upstream response after caller cancellation", async () => {
  const { POST } = await import("@/app/api/hub/[...path]/route");
  let resolve!: (value: Response) => void;
  vi.mocked(requestWithDomain).mockImplementationOnce(
    () =>
      new Promise<Response>((accept) => {
        resolve = accept;
      }),
  );
  const controller = new AbortController();
  const req = new Request(
    githubRequest("preview", { repository_url: githubPreview.repository_url }),
    { signal: controller.signal },
  );
  const work = POST(req, params(["skills", "github", "preview"]));
  await vi.waitFor(() => expect(requestWithDomain).toHaveBeenCalled());
  controller.abort();
  expect((await work).status).toBe(503);
  const cancel = vi.fn();
  resolve(
    new Response(new ReadableStream({ cancel }), {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-request-id": "github-owner",
      },
    }),
  );
  await new Promise((accept) => setTimeout(accept, 0));
  expect(cancel).toHaveBeenCalled();
});

it("Skill Share Create relays the exact revision and keeps the actual six-field service URL", async () => {
  const { POST } = await import("@/app/api/hub/[...path]/route");
  const data = {
    share_id: "share-old",
    source_ref: "skill:revision-old",
    url: "http://localhost/skills/shared/share-old",
    created_at: "2026-10-10T00:00:00.000Z",
    expires_at: null,
    revoked_at: null,
  };
  vi.mocked(requestWithDomain).mockResolvedValue(
    new Response(JSON.stringify({ data }), {
      status: 201,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-request-id": "share-request",
      },
    }),
  );
  const response = await POST(
    new Request("http://localhost/api/hub/skill-shares", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
      },
      body: JSON.stringify({ source_ref: "skill:revision-old" }),
    }),
    params(["skill-shares"]),
  );
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ data });
  expect(vi.mocked(requestWithDomain).mock.calls[0]?.[0]).toBe(
    "http://bff.test/v1/skill-shares",
  );
});

it("Skill Share summary preserves exact revision fields and rejects a current/foreign cover", async () => {
  const { GET } = await import("@/app/api/hub/[...path]/route");
  const skill = {
    skill_id: "revision-old",
    series_id: "series",
    revision: "1",
    display_name: "Old",
    description: "Actual",
    tags: [],
    example_prompts: [],
    category_keys: ["apps"],
    created_at: "2026-10-10T00:00:00Z",
    updated_at: "2026-10-10T00:00:00Z",
    owner_type: "official",
    source_kind: "official",
  };
  const data = {
    share_id: "share-old",
    source_ref: "skill:revision-old",
    skill,
  };
  for (const [value, status] of [
    [data, 200],
    [
      {
        ...data,
        skill: { ...skill, cover_image: "/api/v1/skills/series/cover" },
      },
      502,
    ],
    [{ ...data, skill: { ...skill, current: true } }, 502],
  ] as const) {
    vi.mocked(requestWithDomain).mockResolvedValue(
      new Response(JSON.stringify({ data: value }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          "x-request-id": "share-read",
        },
      }),
    );
    const result = await GET(
      new Request("http://localhost/api/hub/skill-shares/share-old/skill"),
      params(["skill-shares", "share-old", "skill"]),
    );
    expect(result.status).toBe(status);
    if (status === 200) expect(await result.json()).toEqual({ data });
  }
  expect(
    vi
      .mocked(requestWithDomain)
      .mock.calls.every(
        (call) => call[0] === "http://bff.test/v1/skill-shares/share-old/skill",
      ),
  ).toBe(true);
});
it.each(["query", "body", "key", "origin", "extra"])(
  "Skill Share rejects closed request violation %s before owner IO",
  async (mode) => {
    const { POST } = await import("@/app/api/hub/[...path]/route");
    const response = await POST(
      new Request(
        `http://localhost/api/hub/skill-shares${mode === "query" ? "?extra=1" : ""}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin:
              mode === "origin" ? "https://other.example" : "http://localhost",
            ...(mode === "key" ? { "idempotency-key": "not-permitted" } : {}),
          },
          body: JSON.stringify(
            mode === "body"
              ? {}
              : {
                  source_ref: "skill:revision-old",
                  ...(mode === "extra" ? { extra: true } : {}),
                },
          ),
        },
      ),
      params(["skill-shares"]),
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(requestWithDomain).not.toHaveBeenCalled();
  },
);

it.each([
  ["resolve", "content-length"],
  ["resolve", "transfer-encoding"],
  ["summary", "content-length"],
  ["summary", "transfer-encoding"],
])(
  "Skill Share %s rejects the mere presence of %s before owner IO",
  async (operation, header) => {
    const { GET } = await import("@/app/api/hub/[...path]/route");
    const data =
      operation === "resolve"
        ? {
            share_id: "share-old",
            source_ref: "skill:revision-old",
            url: "http://localhost/skills/shared/share-old",
            created_at: "2026-10-10T00:00:00Z",
            expires_at: null,
            revoked_at: null,
          }
        : {
            share_id: "share-old",
            source_ref: "skill:revision-old",
            skill: {
              skill_id: "revision-old",
              series_id: "series",
              revision: "1",
              display_name: "Old",
              description: "Actual",
              tags: [],
              example_prompts: [],
              category_keys: [],
              created_at: "2026-10-10T00:00:00Z",
              updated_at: "2026-10-10T00:00:00Z",
              owner_type: "official",
              source_kind: "official",
            },
          };
    vi.mocked(requestWithDomain).mockResolvedValue(
      new Response(JSON.stringify({ data }), {
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          "x-request-id": "share-read",
        },
      }),
    );
    const path = [
      "skill-shares",
      "share-old",
      ...(operation === "summary" ? ["skill"] : []),
    ];
    const response = await GET(
      new Request(`http://localhost/api/hub/${path.join("/")}`, {
        headers: { [header]: header === "content-length" ? "0" : "chunked" },
      }),
      params(path),
    );
    expect(response.status).toBe(400);
    expect(requestWithDomain).not.toHaveBeenCalled();
  },
);

it("prepares an exact shared download through the published browser-private route with zero body", async () => {
  const { POST } = await import("@/app/api/hub/[...path]/route");
  const data = {
    source_ref: "skill:revision-old",
    revision: "1",
    download_info: {
      download_url: `/skill-downloads/${"a".repeat(43)}`,
      filename: "real.skill",
      expires_at: "2999-01-01T00:00:00Z",
    },
  };
  vi.mocked(requestWithDomain).mockResolvedValue(
    new Response(JSON.stringify({ data }), {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-request-id": "prepare-request",
      },
    }),
  );
  const response = await POST(
    new Request("http://localhost/api/hub/skill-shares/share-old/download", {
      method: "POST",
      headers: { origin: "http://localhost" },
    }),
    params(["skill-shares", "share-old", "download"]),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data });
  expect(vi.mocked(requestWithDomain).mock.calls[0]?.[0]).toBe(
    "http://bff.test/browser/v1/skill-shares/share-old/download",
  );
  expect(vi.mocked(requestWithDomain).mock.calls[0]?.[2]?.body).toBeUndefined();
});
it.each(["query", "body", "key", "length", "encoding", "origin"])(
  "exact shared download rejects %s before owner IO",
  async (mode) => {
    const { POST } = await import("@/app/api/hub/[...path]/route");
    const response = await POST(
      new Request(
        `http://localhost/api/hub/skill-shares/share-old/download${mode === "query" ? "?extra=1" : ""}`,
        {
          method: "POST",
          headers: {
            origin:
              mode === "origin" ? "https://other.example" : "http://localhost",
            ...(mode === "key"
              ? { "idempotency-key": "forbidden" }
              : mode === "length"
                ? { "content-length": "1" }
                : mode === "encoding"
                  ? { "transfer-encoding": "chunked" }
                  : {}),
          },
          ...(mode === "body" ? { body: "x" } : {}),
        },
      ),
      params(["skill-shares", "share-old", "download"]),
    );
    expect(response.status).toBe(mode === "origin" ? 403 : 400);
    expect(requestWithDomain).not.toHaveBeenCalled();
  },
);

it("personal version and withdrawal map only to the formal self owner routes", async () => {
  const { POST } = await import("@/app/api/hub/[...path]/route");
  vi.mocked(requestWithDomain).mockResolvedValue(
    Response.json(
      {
        data: {
          skill_id: "new",
          series_id: "series",
          revision: "2",
          status: "draft",
          replayed: false,
          state_version: "1",
        },
        meta: { request_id: "owner-1" },
      },
      {
        status: 201,
        headers: { "cache-control": "no-store", "x-request-id": "owner-1" },
      },
    ),
  );
  const response = await POST(
    new Request("http://localhost/api/hub/self/skills/mine/versions", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
        "idempotency-key": "v-original",
      },
      body: JSON.stringify({
        display_name: "Mine",
        summary: "",
        tags: [],
        example_prompts: [],
        category_keys: [],
      }),
    }),
    params(["self", "skills", "mine", "versions"]),
  );
  expect(response.status).toBe(201);
  expect(vi.mocked(requestWithDomain).mock.calls[0]?.[0]).toBe(
    "http://bff.test/v1/self/skills/mine/versions",
  );
});

it("personal lifecycle malformed owner JSON is a 502 closed response error, not dependency outage", async () => {
  const { POST } = await import("@/app/api/hub/[...path]/route");
  vi.mocked(requestWithDomain).mockResolvedValue(
    new Response("{", {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-request-id": "owner-1",
      },
    }),
  );
  const response = await POST(
    new Request("http://localhost/api/hub/self/skills/mine/withdraw", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
        "idempotency-key": "withdraw-original",
      },
      body: JSON.stringify({ reason: "本人撤回", expected_state_version: "4" }),
    }),
    params(["self", "skills", "mine", "withdraw"]),
  );
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({
    error: { code: "skill_response_invalid" },
  });
});
it("personal withdrawal preserves the original CAS/body/key through the formal route", async () => {
  const { POST } = await import("@/app/api/hub/[...path]/route");
  const data = {
    source_ref: "skill:mine",
    status: "withdrawn",
    event_id: `evt:${"a".repeat(64)}`,
    state_version: "5",
    replayed: false,
  };
  vi.mocked(requestWithDomain).mockResolvedValue(
    Response.json(
      { data, meta: { request_id: "owner-1" } },
      { headers: { "cache-control": "no-store", "x-request-id": "owner-1" } },
    ),
  );
  const body = { reason: "本人撤回", expected_state_version: "4" };
  const response = await POST(
    new Request("http://localhost/api/hub/self/skills/mine/withdraw", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
        "idempotency-key": "original",
      },
      body: JSON.stringify(body),
    }),
    params(["self", "skills", "mine", "withdraw"]),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    data,
    meta: { request_id: "owner-1" },
  });
  expect(vi.mocked(requestWithDomain).mock.calls[0]?.[0]).toBe(
    "http://bff.test/v1/self/skills/mine/withdraw",
  );
  const options = vi.mocked(requestWithDomain).mock.calls[0]?.[2];
  expect(options?.headers).toMatchObject({ "idempotency-key": "original" });
  expect(
    JSON.parse(new TextDecoder().decode(options?.body as ArrayBuffer)),
  ).toEqual(body);
});

it.each(["versions", "withdraw"] as const)(
  "personal lifecycle %s sends a fixed-length UTF-8 body over the actual Node transport",
  async (action) => {
    const { createServer } = await import("node:http");
    const actual = await vi.importActual<
      typeof import("@/lib/server/upstream-http")
    >("@/lib/server/upstream-http");
    const body =
      action === "versions"
        ? {
            display_name: "本人更新",
            summary: "真实中文",
            tags: [],
            example_prompts: ["保留例子"],
            category_keys: [],
          }
        : { reason: "本人撤回", expected_state_version: "4" };
    const ack =
      action === "versions"
        ? {
            skill_id: "new",
            series_id: "series",
            revision: "2",
            status: "draft",
            replayed: false,
            state_version: "1",
          }
        : {
            source_ref: "skill:mine",
            status: "withdrawn",
            event_id: `evt:${"a".repeat(64)}`,
            state_version: "5",
            replayed: false,
          };
    let observed:
      | {
          transferEncoding: string | undefined;
          length: string | undefined;
          key: string | undefined;
          body: string;
        }
      | undefined;
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        const bytes = Buffer.concat(chunks);
        observed = {
          transferEncoding: request.headers["transfer-encoding"],
          length: request.headers["content-length"],
          key: request.headers["idempotency-key"]?.toString(),
          body: bytes.toString("utf8"),
        };
        const valid =
          observed.transferEncoding === undefined &&
          observed.length === String(bytes.byteLength);
        response.writeHead(valid ? (action === "versions" ? 201 : 200) : 400, {
          "content-type": "application/json",
          "cache-control": "no-store",
          "x-request-id": "owner-wire",
        });
        response.end(
          JSON.stringify(
            valid
              ? { data: ack, meta: { request_id: "owner-wire" } }
              : {
                  error: {
                    code: "invalid_skill_request",
                    message: "Skill lifecycle request is invalid",
                  },
                  meta: { request_id: "owner-wire" },
                },
          ),
        );
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = server.address();
      if (address === null || typeof address === "string")
        throw new Error("missing fixture address");
      vi.mocked(requestWithDomain).mockImplementation((url, domain, options) =>
        actual.requestWithDomain(
          `http://127.0.0.1:${address.port}${new URL(url).pathname}`,
          domain,
          options,
        ),
      );
      const { POST } = await import("@/app/api/hub/[...path]/route");
      const response = await POST(
        new Request(`http://localhost/api/hub/self/skills/mine/${action}`, {
          method: "POST",
          headers: {
            origin: "http://localhost",
            "content-type": "application/json",
            "idempotency-key": "original-wire-intent",
          },
          body: JSON.stringify(body),
        }),
        params(["self", "skills", "mine", action]),
      );
      expect(observed).toEqual({
        transferEncoding: undefined,
        length: String(Buffer.byteLength(JSON.stringify(body))),
        key: "original-wire-intent",
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(action === "versions" ? 201 : 200);
      expect(await response.json()).toEqual({
        data: ack,
        meta: { request_id: "owner-wire" },
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
);

describe("personal MCP four canonical reads", () => {
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
  it.each([
    ["connectors", { items: [connector], next_cursor: null }],
    ["connectors/connector-1", { connector }],
    [
      "connectors/connector-1/connections",
      { items: [connection], next_cursor: null },
    ],
    ["connections/connection-1", { connection }],
  ])(
    "preserves browser-private MCP path and strict %s response",
    async (suffix, data) => {
      vi.mocked(requestWithDomain).mockResolvedValue(
        new Response(JSON.stringify({ data }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-request-id": "owner-personal",
          },
        }),
      );
      const { GET } = await import("@/app/api/hub/[...path]/route");
      const response = await GET(
        new Request(`http://localhost/api/hub/mcp/${suffix}`),
        params(["mcp", ...String(suffix).split("/")]),
      );
      expect(vi.mocked(requestWithDomain).mock.calls[0]?.[0]).toBe(
        `http://bff.test/browser/v1/mcp/${suffix}`,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data });
    },
  );
});

describe("personal MCP closed adapter boundaries", () => {
  const connector = { availability: "available" as const,
    connector_id: "connector-1",
    connector_type: "mcp",
    provider_key: "provider-one",
    status: "active",
    approved_scopes: [],
    enabled: true,
    state_version: "2",
  };
  const owner = (
    data: unknown,
    status = 200,
    headers: Record<string, string> = {},
  ) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-request-id": "owner-personal",
        ...headers,
      },
    });
  it.each([
    "connectors?limit=01",
    "connectors?limit=101",
    "connectors?status=disabled",
    "connectors?cursor=bad%20cursor",
    "connectors?limit=1&limit=1",
    "connectors?tenant=forged",
    "connectors/connector-1?limit=1",
    "connectors/connector-1/connections?status=active",
    "connectors/%63onnector-1",
    "connectors/providers/extra",
    "providers?limit=01",
    "connections/connection-1/extra",
  ])(
    "rejects unissued/canonical/query variant %s before owner",
    async (suffix) => {
      const { GET } = await import("@/app/api/hub/[...path]/route");
      const url = new URL(`http://localhost/api/hub/mcp/${suffix}`);
      const response = await GET(
        new Request(url),
        params(
          url.pathname
            .slice("/api/hub/".length)
            .split("/")
            .map(decodeURIComponent),
        ),
      );
      expect(response.status).toBe(400);
      expect(vi.mocked(requestWithDomain)).not.toHaveBeenCalled();
    },
  );
  it.each(["content-length", "transfer-encoding", "idempotency-key"])(
    "rejects GET %s including zero length",
    async (header) => {
      const { GET } = await import("@/app/api/hub/[...path]/route");
      const response = await GET(
        new Request("http://localhost/api/hub/mcp/connectors", {
          headers: { [header]: header === "content-length" ? "0" : "forged" },
        }),
        params(["mcp", "connectors"]),
      );
      expect(response.status).toBe(400);
      expect(vi.mocked(requestWithDomain)).not.toHaveBeenCalled();
    },
  );
  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "rejects unissued %s personal connector writes",
    async (method) => {
      const route = await import("@/app/api/hub/[...path]/route");
      const response = await route[
        method as "POST" | "PUT" | "PATCH" | "DELETE"
      ](
        new Request("http://localhost/api/hub/mcp/connectors", {
          method,
          headers: { origin: "http://localhost" },
        }),
        params(["mcp", "connectors"]),
      );
      expect(response.status).toBe(400);
      expect(vi.mocked(requestWithDomain)).not.toHaveBeenCalled();
    },
  );
  it("forwards only admitted bearer and validates owner requestID/no-store/resource/error matching", async () => {
    const { GET } = await import("@/app/api/hub/[...path]/route");
    const read = () =>
      GET(
        new Request("http://localhost/api/hub/mcp/connectors/connector-1", {
          headers: { "x-kokoro-subject": "forged", cookie: "forged" },
        }),
        params(["mcp", "connectors", "connector-1"]),
      );
    vi.mocked(requestWithDomain).mockResolvedValue(
      owner({ data: { connector } }),
    );
    expect((await read()).status).toBe(200);
    const options = vi.mocked(requestWithDomain).mock.calls[0]?.[2];
    expect(options?.headers).toMatchObject({
      authorization: "Bearer product-access",
      "x-kokoro-service": "web-bff",
    });
    expect(options?.headers).not.toHaveProperty("cookie");
    expect(options?.headers).not.toHaveProperty("x-kokoro-subject");
    expect(options?.headers).not.toHaveProperty("content-length");
    for (const response of [
      owner({ data: { connector: { ...connector, connector_id: "wrong" } } }),
      owner({ data: { connector: { ...connector, extra: true } } }),
      owner({ data: { connector } }, 200, { "cache-control": "private" }),
      owner({ data: { connector } }, 200, { "x-request-id": "bad id" }),
      owner(
        {
          error: { code: "session_invalid", message: "safe", retryable: false },
        },
        502,
      ),
      owner({}, 302),
    ]) {
      vi.mocked(requestWithDomain).mockResolvedValue(response);
      expect((await read()).status).toBe(502);
    }
    vi.mocked(requestWithDomain).mockResolvedValue(
      owner(
        {
          error: {
            code: "mcp_personal_not_found",
            message: "safe",
            retryable: false,
          },
        },
        404,
      ),
    );
    expect((await read()).status).toBe(404);
  });
  it("allows valid throttling but never connector-list 404 or malformed Retry-After", async () => {
    const { GET } = await import("@/app/api/hub/[...path]/route");
    const read = () =>
      GET(
        new Request("http://localhost/api/hub/mcp/connectors"),
        params(["mcp", "connectors"]),
      );
    vi.mocked(requestWithDomain).mockResolvedValue(
      owner(
        {
          error: {
            code: "session_rate_limited",
            message: "safe",
            retryable: true,
          },
        },
        429,
        { "retry-after": "2" },
      ),
    );
    const response = await read();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("2");
    vi.mocked(requestWithDomain).mockResolvedValue(
      owner(
        {
          error: {
            code: "mcp_personal_not_found",
            message: "safe",
            retryable: false,
          },
        },
        404,
      ),
    );
    expect((await read()).status).toBe(502);
    vi.mocked(requestWithDomain).mockResolvedValue(
      owner(
        {
          error: {
            code: "session_rate_limited",
            message: "safe",
            retryable: true,
          },
        },
        429,
        { "retry-after": "bad" },
      ),
    );
    expect((await read()).status).toBe(502);
  });
  it("fails closed before business request on no session or inspection failure", async () => {
    const { GET } = await import("@/app/api/hub/[...path]/route");
    currentProductSession.mockResolvedValue(null);
    expect(
      (
        await GET(
          new Request("http://localhost/api/hub/mcp/connectors"),
          params(["mcp", "connectors"]),
        )
      ).status,
    ).toBe(401);
    currentProductSession.mockRejectedValue(new Error("unavailable"));
    expect(
      (
        await GET(
          new Request("http://localhost/api/hub/mcp/connectors"),
          params(["mcp", "connectors"]),
        )
      ).status,
    ).toBe(503);
    expect(vi.mocked(requestWithDomain)).not.toHaveBeenCalled();
  });
  it("cancels oversized owner streams and caller-aborted reads", async () => {
    const { GET } = await import("@/app/api/hub/[...path]/route");
    for (const chunk of [new Uint8Array(1_048_577), new Uint8Array([0xff])]) {
      const cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(chunk);
        },
        cancel,
      });
      vi.mocked(requestWithDomain).mockResolvedValue(
        new Response(body, {
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-request-id": "owner-personal",
          },
        }),
      );
      const controller = new AbortController();
      const result = GET(
        new Request("http://localhost/api/hub/mcp/connectors", {
          signal: controller.signal,
        }),
        params(["mcp", "connectors"]),
      );
      if (chunk.length === 1) {
        await vi.waitFor(() =>
          expect(vi.mocked(requestWithDomain)).toHaveBeenCalledTimes(2),
        );
        controller.abort();
      }
      expect((await result).status).toBe(chunk.length === 1 ? 503 : 502);
      expect(cancel).toHaveBeenCalled();
    }
  });
  it("shares one ten-second budget across session and body, with late fetch cleanup", async () => {
    vi.useFakeTimers();
    try {
      const { GET } = await import("@/app/api/hub/[...path]/route");
      currentProductSession.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  access: "product-access",
                  accessExpiresAt: Date.now() + 60_000,
                }),
              6_000,
            ),
          ),
      );
      const cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>({ cancel });
      vi.mocked(requestWithDomain).mockResolvedValue(
        new Response(body, {
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-request-id": "owner-personal",
          },
        }),
      );
      const result = GET(
        new Request("http://localhost/api/hub/mcp/connectors"),
        params(["mcp", "connectors"]),
      );
      await vi.advanceTimersByTimeAsync(6_000);
      expect(
        vi.mocked(requestWithDomain).mock.calls[0]?.[2]?.timeoutMs,
      ).toBeLessThanOrEqual(4_000);
      await vi.advanceTimersByTimeAsync(4_000);
      expect((await result).status).toBe(503);
      expect(cancel).toHaveBeenCalled();
      currentProductSession.mockResolvedValue({
        access: "product-access",
        accessExpiresAt: Date.now() + 60_000,
      });
      let resolveLate!: (value: Response) => void;
      vi.mocked(requestWithDomain).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveLate = resolve;
          }),
      );
      const aborted = GET(
        new Request("http://localhost/api/hub/mcp/connectors"),
        params(["mcp", "connectors"]),
      );
      await vi.advanceTimersByTimeAsync(10_000);
      expect((await aborted).status).toBe(503);
      const lateCancel = vi.fn();
      resolveLate(new Response(new ReadableStream({ cancel: lateCancel })));
      await Promise.resolve();
      await Promise.resolve();
      expect(lateCancel).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("current-user MCP OAuth lifecycle adapter", () => {
  const pendingConnector = { availability: "unavailable" as const,
    connector_id: "connector-1",
    connector_type: "mcp",
    provider_key: "provider-one",
    status: "pending",
    approved_scopes: ["tools.read"],
    enabled: false,
    state_version: "2",
  };
  const activeConnector = {
    ...pendingConnector,
    status: "active",
    state_version: "3",
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
  const owner = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-request-id": "owner-self-oauth",
      },
    });

  it("forwards each formal lifecycle path with the owner-required idempotency semantics", async () => {
    vi.mocked(requestWithDomain)
      .mockResolvedValueOnce(
        owner({ data: { authorization, connector: pendingConnector } }),
      )
      .mockResolvedValueOnce(
        owner({ data: { authorization, connector: pendingConnector } }),
      )
      .mockResolvedValueOnce(owner({ data: { connector: activeConnector } }))
      .mockResolvedValueOnce(owner({ data: { connection } }, 201));
    const route = await import("@/app/api/hub/[...path]/route");
    const invoke = (path: string[], body: unknown, headers: HeadersInit = {}) =>
      route.POST(
        new Request(`http://localhost/api/hub/${path.join("/")}`, {
          method: "POST",
          headers: {
            origin: "http://localhost",
            "content-type": "application/json",
            ...headers,
          },
          body: JSON.stringify(body),
        }),
        params(path),
      );

    await expect(
      invoke(["mcp", "connectors", "connector-1", "authorization"], {
        server_id: "server-1",
        expected_state_version: "1",
      }),
    ).resolves.toMatchObject({
      status: 200,
    });
    await expect(
      invoke(
        ["mcp", "connectors", "connector-1", "authorization", "reconnect"],
        { server_id: "server-1", expected_state_version: "1" },
      ),
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      invoke(["mcp", "authorization", "callback"], {
        state: "opaque",
        code: "code",
      }),
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      invoke(
        ["mcp", "connections"],
        {
          connector_id: "connector-1",
          server_id: "server-1",
          allowed_selectors: ["tool:read"],
          expected_state_version: "3",
        },
        { "idempotency-key": "connection-key" },
      ),
    ).resolves.toMatchObject({ status: 201 });

    expect(vi.mocked(requestWithDomain).mock.calls.map(([url]) => url)).toEqual(
      [
        "http://bff.test/browser/v1/mcp/connectors/connector-1/authorization",
        "http://bff.test/browser/v1/mcp/connectors/connector-1/authorization/reconnect",
        "http://bff.test/browser/v1/mcp/authorization/callback",
        "http://bff.test/browser/v1/mcp/connections",
      ],
    );
    for (const index of [0, 1, 2])
      expect(
        vi.mocked(requestWithDomain).mock.calls[index]?.[2]?.headers,
      ).not.toHaveProperty("idempotency-key");
    expect(
      vi.mocked(requestWithDomain).mock.calls[3]?.[2]?.headers,
    ).toMatchObject({ "idempotency-key": "connection-key" });
  });

  it("rejects callback ambiguity and wrong idempotency placement before the BFF", async () => {
    const { POST } = await import("@/app/api/hub/[...path]/route");
    const invalid = [
      [
        ["mcp", "authorization", "callback"],
        { state: "opaque", code: "code", error: "access_denied" },
        {},
      ],
      [
        ["mcp", "connectors", "connector-1", "authorization"],
        { server_id: "server-1", expected_state_version: "1" },
        { "idempotency-key": "forbidden" },
      ],
      [
        ["mcp", "connections"],
        {
          connector_id: "connector-1",
          server_id: "server-1",
          allowed_selectors: ["tool:read"],
          expected_state_version: "1",
        },
        {},
      ],
    ] as const;
    for (const [path, body, extra] of invalid) {
      const response = await POST(
        new Request(`http://localhost/api/hub/${path.join("/")}`, {
          method: "POST",
          headers: {
            origin: "http://localhost",
            "content-type": "application/json",
            ...extra,
          },
          body: JSON.stringify(body),
        }),
        params([...path]),
      );
      expect(response.status).toBe(400);
    }
    expect(vi.mocked(requestWithDomain)).not.toHaveBeenCalled();
  });
});

describe("private MCP server V1 lifecycle adapter", () => {
  const privateServer = { availability: "available" as const,
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
  const owner = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-request-id": "owner-private",
      },
    });
  it("relays Register → Prepare → Update → Delete with CAS and write-only secrets", async () => {
    vi.mocked(requestWithDomain)
      .mockResolvedValueOnce(
        owner(
          { data: { server: privateServer, connector, replayed: false } },
          201,
        ),
      )
      .mockResolvedValueOnce(
        owner({
          data: {
            server: { ...privateServer, state_version: "3" },
            connector: { ...connector, enabled: true, state_version: "3" },
            declarations: [],
            replayed: false,
          },
        }),
      )
      .mockResolvedValueOnce(
        owner({
          data: {
            server: {
              ...privateServer,
              state_version: "4",
              display_name: "Renamed",
            },
            connector: { ...connector, enabled: true, state_version: "4" },
            replayed: false,
          },
        }),
      )
      .mockResolvedValueOnce(
        owner({
          data: { server_id: "server-private", deleted: true, replayed: false },
        }),
      );
    const route = await import("@/app/api/hub/[...path]/route");
    const invoke = (
      method: "POST" | "PATCH" | "DELETE",
      path: string[],
      body: unknown,
    ) =>
      route[method](
        new Request(`http://localhost/api/hub/${path.join("/")}`, {
          method,
          headers: {
            origin: "http://localhost",
            "content-type": "application/json",
            "idempotency-key": "private-command",
          },
          body: JSON.stringify(body),
        }),
        params(path),
      );
    expect(
      (
        await invoke("POST", ["mcp", "servers"], {
          display_name: "Private tools",
          server_url: "https://private.example/mcp",
          headers: [{ name: "x-api-key", value: "WRITE_ONLY" }],
          oauth_client: { client_id: "client-id", client_secret: "WRITE_ONLY" },
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await invoke("POST", ["mcp", "servers", "server-private", "prepare"], {
          expected_state_version: "2",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await invoke("PATCH", ["mcp", "servers", "server-private"], {
          expected_state_version: "3",
          display_name: "Renamed",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await invoke("DELETE", ["mcp", "servers", "server-private"], {
          expected_state_version: "4",
        })
      ).status,
    ).toBe(200);
    expect(vi.mocked(requestWithDomain).mock.calls.map(([url]) => url)).toEqual(
      [
        "http://bff.test/browser/v1/mcp/servers",
        "http://bff.test/browser/v1/mcp/servers/server-private/prepare",
        "http://bff.test/browser/v1/mcp/servers/server-private",
        "http://bff.test/browser/v1/mcp/servers/server-private",
      ],
    );
    const registerRequestBody = vi.mocked(requestWithDomain).mock.calls[0]?.[2]
      ?.body;
    expect(registerRequestBody).toBeInstanceOf(ArrayBuffer);
    const registerBody = JSON.parse(
      new TextDecoder().decode(registerRequestBody as ArrayBuffer),
    );
    expect(registerBody.oauth_client).toEqual({
      client_id: "client-id",
      client_secret: "WRITE_ONLY",
    });
    expect(
      (
        await (
          await invoke("POST", ["mcp", "servers"], {
            display_name: "Private tools",
            server_url: "https://private.example/mcp",
            headers: [
              { name: "x-api-key", value: "WRITE_ONLY" },
              { name: "X-API-Key", value: "duplicate" },
            ],
          })
        ).json()
      ).error.code,
    ).toBe("invalid_mcp_personal_request");
    expect(vi.mocked(requestWithDomain)).toHaveBeenCalledTimes(4);
  });
});

it("personal MCP rejects malformed UTF8 owner responses", async () => {
  const { GET } = await import("@/app/api/hub/[...path]/route");
  vi.mocked(requestWithDomain).mockResolvedValue(
    new Response(new Uint8Array([0xff]), {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-request-id": "owner-personal",
      },
    }),
  );
  expect(
    (
      await GET(
        new Request("http://localhost/api/hub/mcp/connectors"),
        params(["mcp", "connectors"]),
      )
    ).status,
  ).toBe(502);
});

it("personal MCP accepts only owner Retry-After seconds 1 through 86400", async () => {
  const { GET } = await import("@/app/api/hub/[...path]/route");
  for (const [seconds, expected] of [
    ["86400", 429],
    ["86401", 502],
    ["99999", 502],
  ] as const) {
    vi.mocked(requestWithDomain).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "session_rate_limited",
            message: "safe",
            retryable: true,
          },
        }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-request-id": "owner-personal",
            "retry-after": seconds,
          },
        },
      ),
    );
    const response = await GET(
      new Request("http://localhost/api/hub/mcp/connectors"),
      params(["mcp", "connectors"]),
    );
    expect(response.status).toBe(expected);
  }
});

describe("personal MCP 14.0 provider and command adapter", () => {
  const connector = { availability: "unavailable" as const,
    connector_id: "connector-1",
    connector_type: "mcp",
    provider_key: "provider-one",
    status: "pending",
    approved_scopes: [],
    enabled: false,
    state_version: "1",
    display_name: "Connector",
    description: "",
  };
  const provider = {
    provider_key: "provider-one",
    display_name: "Provider",
    directory_type: "app",
    category_keys: ["development"],
    example_prompts: ["Help"],
    enabled: true,
    state_version: "2",
  };
  const owner = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-request-id": "owner-personal",
      },
    });
  it("forwards the formal provider list and rejects old aliases", async () => {
    const { GET } = await import("@/app/api/hub/[...path]/route");
    vi.mocked(requestWithDomain).mockResolvedValue(
      owner({ data: { items: [provider], next_cursor: null } }),
    );
    const response = await GET(
      new Request(
        "http://localhost/api/hub/mcp/providers?directory_type=app&category_key=development",
      ),
      params(["mcp", "providers"]),
    );
    expect(response.status).toBe(200);
    expect(vi.mocked(requestWithDomain).mock.calls[0]?.[0]).toBe(
      "http://bff.test/browser/v1/mcp/providers?directory_type=app&category_key=development",
    );
    vi.mocked(requestWithDomain).mockClear();
    expect(
      (
        await GET(
          new Request(
            "http://localhost/api/hub/mcp/providers/provider-one?limit=1",
          ),
          params(["mcp", "providers", "provider-one"]),
        )
      ).status,
    ).toBe(400);
    expect(vi.mocked(requestWithDomain)).not.toHaveBeenCalled();
  });
  it.each([
    [
      "POST",
      ["mcp", "connectors"],
      {
        provider_key: "provider-one",
        connector_type: "mcp",
        display_name: "Connector",
        description: "",
      },
      201,
    ],
    [
      "PATCH",
      ["mcp", "connectors", "connector-1"],
      {
        display_name: "Connector",
        description: "",
        expected_state_version: "1",
      },
      200,
    ],
    [
      "PUT",
      ["mcp", "connectors", "connector-1", "enabled"],
      { enabled: false, expected_state_version: "1" },
      200,
    ],
    [
      "DELETE",
      ["mcp", "connectors", "connector-1"],
      { expected_state_version: "1" },
      200,
    ],
  ] as const)(
    "strictly relays %s personal command",
    async (method, path, body, status) => {
      const route = await import("@/app/api/hub/[...path]/route");
      const result =
        method === "DELETE" ? { ...connector, status: "revoked" } : connector;
      vi.mocked(requestWithDomain).mockResolvedValue(
        owner({ data: { connector: result } }, status),
      );
      const response = await route[method](
        new Request(`http://localhost/api/hub/${path.join("/")}`, {
          method,
          headers: {
            origin: "http://localhost",
            "content-type": "application/json",
            "idempotency-key": "original-key",
          },
          body: JSON.stringify(body),
        }),
        params([...path]),
      );
      expect(response.status).toBe(status);
      const options = vi.mocked(requestWithDomain).mock.calls[0]?.[2];
      expect(options?.headers).toMatchObject({
        "idempotency-key": "original-key",
        "content-type": "application/json",
        authorization: "Bearer product-access",
      });
    },
  );
  it("rejects missing key, duplicate body fields, and unauthorized command before owner", async () => {
    const { POST } = await import("@/app/api/hub/[...path]/route");
    const body =
      '{"provider_key":"provider-one","provider_key":"other","connector_type":"mcp","display_name":"Connector","description":""}';
    expect(
      (
        await POST(
          new Request("http://localhost/api/hub/mcp/connectors", {
            method: "POST",
            headers: {
              origin: "http://localhost",
              "content-type": "application/json",
              "idempotency-key": "original-key",
            },
            body,
          }),
          params(["mcp", "connectors"]),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          new Request("http://localhost/api/hub/mcp/connectors", {
            method: "POST",
            headers: {
              origin: "http://localhost",
              "content-type": "application/json",
            },
            body: JSON.stringify({}),
          }),
          params(["mcp", "connectors"]),
        )
      ).status,
    ).toBe(400);
    expect(vi.mocked(requestWithDomain)).not.toHaveBeenCalled();
  });
});


it("forwards the explicit installation update without promoting browser identity or enabling it", async () => {
  const { POST } = await import("@/app/api/hub/[...path]/route");
  vi.mocked(requestWithDomain).mockResolvedValue(new Response(JSON.stringify({ error: { code: "skill_installation_precondition_failed", message: "Changed pin", retryable: false } }), {
    status: 412, headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "update-1" },
  }));
  const body = '{"expected_source_ref":"skill:revision-a","source_ref":"skill:revision-b"}';
  const response = await POST(new Request("http://localhost/api/hub/self/skill-installations/i1/update", {
    method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", "idempotency-key": "frozen-update", authorization: "Bearer forged", "x-kokoro-subject": "forged" }, body,
  }), params(["self", "skill-installations", "i1", "update"]));
  expect(response.status).toBe(412);
  expect(requestWithDomain).toHaveBeenCalledTimes(1);
  const [url,,options] = vi.mocked(requestWithDomain).mock.calls[0]!;
  expect(url).toBe("http://bff.test/v1/skill-installations/i1/update");
  expect(options?.headers).toMatchObject({ authorization: "Bearer product-access", "idempotency-key": "frozen-update" });
  expect(options?.headers).not.toHaveProperty("x-kokoro-subject");
  expect(new TextDecoder().decode(options?.body)).toBe(body);
});

it.each([
  { expected_source_ref: "skill:a", source_ref: "skill:b", enabled: true },
  { expected_source_ref: "skill:a", source_ref: "skill:b", tenant_id: "forged" },
  { source_ref: "skill:b" }, { expected_source_ref: "skill:a\n", source_ref: "skill:b" },
])("rejects malformed update bodies before upstream %#", async body => {
  const { POST } = await import("@/app/api/hub/[...path]/route");
  const response = await POST(new Request("http://localhost/api/hub/self/skill-installations/i1/update", {
    method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", "idempotency-key": "frozen-update" }, body: JSON.stringify(body),
  }), params(["self", "skill-installations", "i1", "update"]));
  expect(response.status).toBe(400); expect(requestWithDomain).not.toHaveBeenCalled();
});

it("an update's single budget cancels a stalled input before any BFF dispatch", async () => {
  vi.useFakeTimers()
  try {
    const { POST } = await import("@/app/api/hub/[...path]/route");
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{"expected_source_ref":')); }, cancel });
    const pending = POST(new Request("http://localhost/api/hub/self/skill-installations/i1/update", {
      method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", "idempotency-key": "frozen-update" }, body, duplex: "half",
    } as RequestInit), params(["self", "skill-installations", "i1", "update"]));
    let settled = false; void pending.then(() => { settled = true });
    await vi.advanceTimersByTimeAsync(10_001);
    expect(settled).toBe(true);
    const response = await pending;
    expect(response.status).toBe(504); expect(cancel).toHaveBeenCalledTimes(1); expect(requestWithDomain).not.toHaveBeenCalled();
  } finally { vi.useRealTimers() }
});

describe("connector private recovery errors", () => {
  const reply = (code: string, status: number, retryable: boolean) => new Response(JSON.stringify({ error: { code, message: "Safe failure", retryable } }), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "owner-recovery" },
  });
  const post = async (path: string[], body: unknown, key = true) => {
    const { POST } = await import("@/app/api/hub/[...path]/route");
    return POST(new Request(`http://localhost/api/hub/${path.join("/")}`, {
      method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", ...(key ? { "idempotency-key": "original-command-key" } : {}) },
      body: JSON.stringify(body),
    }), params(path));
  };
  it("relays the exact published MCP recovery tuple, trusted session and original command once", async () => {
    for (const [code, status] of [
      ["mcp_personal_command_outcome_unknown", 503], ["mcp_personal_command_replay_expired", 412], ["mcp_personal_command_ownership_lost", 409],
    ] as const) {
      vi.mocked(requestWithDomain).mockResolvedValueOnce(reply(code, status, false));
      const before = vi.mocked(requestWithDomain).mock.calls.length;
      const response = await post(["mcp", "servers", "server-one", "prepare"], { expected_state_version: "4" });
      expect(response.status).toBe(status);
      expect((await response.json()).error).toEqual({ code, message: "Safe failure", retryable: false });
      expect(response.headers.get("x-request-id")).toBe("owner-recovery");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(requestWithDomain).toHaveBeenCalledTimes(before + 1);
      expect(vi.mocked(requestWithDomain).mock.calls.at(-1)![2]?.headers).toMatchObject({ authorization: "Bearer product-access", "idempotency-key": "original-command-key" });
    }
    vi.mocked(requestWithDomain).mockResolvedValueOnce(reply("mcp_personal_needs_client", 412, false));
    expect((await post(["mcp", "connectors", "connector-one", "authorization"], { server_id: "server-one", expected_state_version: "4" }, false)).status).toBe(412);
    expect(vi.mocked(requestWithDomain).mock.calls.at(-1)![2]?.headers).not.toHaveProperty("idempotency-key");
  });
  it("rejects wrong Custom API recovery tuples rather than forwarding arbitrary status/code/retryable", async () => {
    for (const [code, status, retryable] of [
      ["custom_api_command_outcome_unknown", 503, true], ["custom_api_command_replay_expired", 409, false],
      ["unpublished_custom_error", 503, true], ["custom_api_not_found", 404, false],
    ] as const) {
      vi.mocked(requestWithDomain).mockResolvedValueOnce(reply(code, status, retryable));
      const response = await post(["connectors", "custom-apis"], { name: "Test", environment: [] });
      expect(response.status).toBe(502);
      expect((await response.json()).error.code).toBe("custom_api_response_invalid");
    }
    expect(requestWithDomain).toHaveBeenCalledTimes(4);
  });
});


it("preserves valid Custom API recovery errors while rejecting those write receipts on a read", async () => {
  const route = await import("@/app/api/hub/[...path]/route");
  const path = ["connectors", "custom-apis"];
  const reply = (code: string, status: number, retryable: boolean) => new Response(JSON.stringify({ error: { code, message: "Safe failure", retryable } }), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "owner-api-recovery" },
  });
  for (const [code, status, retryable] of [
    ["custom_api_command_in_progress", 409, true], ["custom_api_command_outcome_unknown", 503, false],
    ["custom_api_command_replay_expired", 412, false], ["custom_api_conflict", 409, false],
    ["custom_api_command_ownership_lost", 409, false], ["custom_api_response_invalid", 502, false],
  ] as const) {
    vi.mocked(requestWithDomain).mockResolvedValueOnce(reply(code, status, retryable));
    const before = vi.mocked(requestWithDomain).mock.calls.length;
    const response = await route.POST(new Request(`http://localhost/api/hub/${path.join("/")}`, {
      method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", "idempotency-key": "original-api-key" },
      body: JSON.stringify({ name: "Test", environment: [] }),
    }), params(path));
    expect(response.status).toBe(status);
    expect((await response.json()).error).toEqual({ code, message: "Safe failure", retryable });
    expect(response.headers.get("x-request-id")).toBe("owner-api-recovery");
    expect(requestWithDomain).toHaveBeenCalledTimes(before + 1);
    vi.mocked(requestWithDomain).mockResolvedValueOnce(reply(code, status, retryable));
    const read = await route.GET(new Request(`http://localhost/api/hub/${path.join("/")}`), params(path));
    expect(read.status).toBe(502);
    expect((await read.json()).error.code).toBe("custom_api_response_invalid");
  }
});

it("routes installed package and download to exact installation BFF boundaries, not the series catalog", async () => {
  const { GET, POST } = await import("@/app/api/hub/[...path]/route")
  vi.mocked(requestWithDomain).mockResolvedValueOnce(Response.json(catalogPackage, { headers: catalogPackageHeaders }))
  const read = await GET(new Request("http://localhost/api/hub/skill-installations/install-A/package"), params(["skill-installations", "install-A", "package"]))
  expect(read.status).toBe(200)
  expect(await read.json()).toEqual(catalogPackage)
  expect(requestWithDomain).toHaveBeenLastCalledWith("http://bff.test/v1/skill-installations/install-A/package", ENV.KOKORO_DOMAIN, expect.objectContaining({ method: "GET" }))
  const ack = { data: { source_ref: "skill:revision-exact", revision: "7", download_info: { download_url: `/skill-downloads/${"a".repeat(43)}`, filename: "A.zip", expires_at: "2999-01-01T00:00:00Z" } } }
  vi.mocked(requestWithDomain).mockResolvedValueOnce(Response.json(ack, { headers: catalogPackageHeaders }))
  const download = await POST(new Request("http://localhost/api/hub/skill-installations/install-A/download", { method: "POST", headers: { origin: ENV.KOKORO_WEB_ORIGIN } }), params(["skill-installations", "install-A", "download"]))
  expect(download.status).toBe(200)
  expect(await download.json()).toEqual(ack)
  expect(requestWithDomain).toHaveBeenLastCalledWith("http://bff.test/browser/v1/skill-installations/install-A/download", ENV.KOKORO_DOMAIN, expect.objectContaining({ method: "POST" }))
})

it("installed content rejects malformed local requests before admission or BFF IO", async () => {
  const { GET, POST } = await import("@/app/api/hub/[...path]/route")
  currentProductSession.mockClear()
  for (const [method, tail, query, headers, body] of [
    ["GET", "package", "?file_path=SKILL.md&file_path=other", {}, undefined],
    ["GET", "package", "?file_path=..%2Fsecret", {}, undefined],
    ["GET", "package", "?file_path=%ZZ", {}, undefined],
    ["GET", "package", "", { "idempotency-key": "forbidden" }, undefined],
    ["POST", "download", "?file_path=SKILL.md", { origin: ENV.KOKORO_WEB_ORIGIN }, undefined],
    ["POST", "download", "", { origin: ENV.KOKORO_WEB_ORIGIN, "idempotency-key": "forbidden" }, undefined],
    ["POST", "download", "", { origin: ENV.KOKORO_WEB_ORIGIN }, "{}"],
    ["POST", "download", "", { origin: "https://other.example" }, undefined],
  ] as const) {
    const request = new Request(`http://localhost/api/hub/skill-installations/install-A/${tail}${query}`, { method, headers, ...(body === undefined ? {} : { body }) })
    const result = await (method === "GET" ? GET : POST)(request, params(["skill-installations", "install-A", tail]))
    expect([400, 403]).toContain(result.status)
  }
  expect(currentProductSession).not.toHaveBeenCalled()
  expect(requestWithDomain).not.toHaveBeenCalled()
})

it("installed inspection keeps its exact error contract separate from catalog and download errors", async () => {
  const { GET } = await import("@/app/api/hub/[...path]/route")
  for (const [status, code, retryable, valid] of [
    [404, "skill_package_not_found", false, true],
    [412, "skill_package_precondition_failed", false, true],
    [429, "skill_package_limit_exceeded", false, true],
    [503, "skill_package_dependency_unavailable", true, true],
    [404, "skill_not_found", false, false],
    [503, "skill_package_dependency_unavailable", false, false],
  ] as const) {
    vi.mocked(requestWithDomain).mockResolvedValueOnce(Response.json({ error: { code, message: "Bound error", retryable } }, { status, headers: catalogPackageHeaders }))
    const result = await GET(new Request("http://localhost/api/hub/skill-installations/install-A/package"), params(["skill-installations", "install-A", "package"]))
    expect(result.status).toBe(valid ? status : 502)
    expect((await result.json()).error.code).toBe(valid ? code : "skill_package_response_invalid")
  }
})

// Project lifecycle must not fall through the legacy generic Hub adapter.
it.each(["GET", "POST"] as const)("routes Project installation %s through the strict installation boundary", async (method) => {
  const { GET, POST } = await import("@/app/api/hub/[...path]/route");
  const projectId = "project_11111111-1111-4111-8111-111111111111";
  vi.mocked(requestWithDomain).mockResolvedValue(new Response(JSON.stringify({ data: [] }), {
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "project-installation" },
  }));
  const response = await (method === "GET" ? GET : POST)(new Request(`http://localhost/api/hub/projects/${projectId}/skill-installations`, {
    method, ...(method === "POST" ? { headers: { origin: "http://localhost", "content-type": "application/json", "idempotency-key": "project-install-key" }, body: '{"source_ref":"skill:mine"}' } : {}),
  }), params(["projects", projectId, "skill-installations"]));
  expect(response.status).toBe(method === "GET" ? 200 : 502); // a list is never an installation ACK
  expect(requestWithDomain).toHaveBeenCalledTimes(1);
  expect(vi.mocked(requestWithDomain).mock.calls[0]?.[0]).toBe(`http://bff.test/v1/projects/${projectId}/skill-installations`);
});

it("binds Project defaults ACK to exact project and ordered intent, and keeps the original key", async () => {
  const { GET, PUT } = await import("@/app/api/hub/[...path]/route");
  const projectId = "project_11111111-1111-4111-8111-111111111111";
  const path = ["projects", projectId, "skill-selection"];
  const url = `http://localhost/api/hub/${path.join("/")}`;
  const owner = (data: object) => new Response(JSON.stringify({ data }), { headers: {
    "content-type": "application/json", "cache-control": "no-store", "x-request-id": "selection-request",
  } });
  vi.mocked(requestWithDomain).mockResolvedValueOnce(owner({ project_id: "project_22222222-2222-4222-8222-222222222222", installation_ids: [] }));
  expect((await GET(new Request(url), params(path))).status).toBe(502);
  vi.mocked(requestWithDomain).mockResolvedValueOnce(owner({ project_id: projectId, installation_ids: ["i2", "i1"] }));
  const request = () => new Request(url, { method: "PUT", headers: { origin: "http://localhost", "content-type": "application/json", "idempotency-key": "frozen-selection" }, body: '{"installation_ids":["i1","i2"]}' });
  expect((await PUT(request(), params(path))).status).toBe(502);
  vi.mocked(requestWithDomain).mockResolvedValueOnce(owner({ project_id: projectId, installation_ids: ["i1", "i2"] }));
  const saved = await PUT(request(), params(path));
  expect(saved.status).toBe(200);
  expect(await saved.json()).toEqual({ data: { project_id: projectId, installation_ids: ["i1", "i2"] } });
  expect(new Headers(vi.mocked(requestWithDomain).mock.calls[2]?.[2]?.headers).get("idempotency-key")).toBe("frozen-selection");
  vi.mocked(requestWithDomain).mockClear();
  const invalid = new Request(url, { method: "PUT", headers: { origin: "http://localhost", "content-type": "application/json", "idempotency-key": "new-key" }, body: '{"installation_ids":["i1","i1"]}' });
  expect((await PUT(invalid, params(path))).status).toBe(400);
  expect(requestWithDomain).not.toHaveBeenCalled();
});

it("rejects invalid UTF-8 in Project selection errors rather than normalizing owner bytes", async () => {
  const { GET } = await import("@/app/api/hub/[...path]/route");
  const projectId = "project_11111111-1111-4111-8111-111111111111";
  const prefix = new TextEncoder().encode('{"error":{"code":"project_not_found","message":"');
  const suffix = new TextEncoder().encode('","retryable":false}}');
  const bytes = new Uint8Array([...prefix, 0xff, ...suffix]);
  vi.mocked(requestWithDomain).mockResolvedValue(new Response(bytes, { status: 404, headers: {
    "content-type": "application/json", "cache-control": "no-store", "x-request-id": "selection-error",
  } }));
  expect((await GET(new Request(`http://localhost/api/hub/projects/${projectId}/skill-selection`), params(["projects", projectId, "skill-selection"]))).status).toBe(502);
});

it("uses Project segment identities for Get, enabled, update and remove, never a personal target", async () => {
  const route = await import("@/app/api/hub/[...path]/route");
  const projectId = "project_11111111-1111-4111-8111-111111111111";
  const installation = { installation_id: "i1", source_ref: "skill:revision-a", series_id: "series-1", revision: "1",
    installed: true, enabled: false, installed_at: "2026-10-10T00:00:00Z", updated_at: "2026-10-10T00:00:00Z",
    display_name: "Project skill", summary: "Pinned", source_status: "active", skill_updated_at: "2026-10-10T00:00:00Z",
    example_prompts: [], category_keys: [], product: { publication_audience: "owner", state_version: "5" }, tags: [] };
  const cases = [
    { method: "GET", suffix: ["i1"], input: undefined, data: installation },
    { method: "PUT", suffix: ["i1", "enabled"], input: { enabled: true }, data: { installation: { ...installation, enabled: true }, change: "enabled", event_id: "event-1", replayed: false } },
    { method: "POST", suffix: ["i1", "update"], input: { expected_source_ref: "skill:revision-a", source_ref: "skill:revision-b" }, data: { installation: { ...installation, source_ref: "skill:revision-b", revision: "2" }, change: "upgraded", event_id: "event-2", replayed: true } },
    { method: "DELETE", suffix: ["i1"], input: undefined, data: { installation: { ...installation, installed: false, removed_at: "2026-10-10T00:00:00Z" }, change: "removed", event_id: "event-3", replayed: false } },
  ] as const;
  for (const entry of cases) {
    const path = ["projects", projectId, "skill-installations", ...entry.suffix];
    vi.mocked(requestWithDomain).mockResolvedValueOnce(Response.json({ data: entry.data }, { headers: { "cache-control": "no-store", "x-request-id": "project-lifecycle" } }));
    const response = await route[entry.method](new Request(`http://localhost/api/hub/${path.join("/")}`, { method: entry.method,
      ...(entry.method === "GET" ? {} : { headers: { origin: "http://localhost", "idempotency-key": "original-key", ...(entry.input === undefined ? {} : { "content-type": "application/json" }) } }),
      ...(entry.input === undefined ? {} : { body: JSON.stringify(entry.input) }),
    }), params(path));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ data: entry.data });
    expect(vi.mocked(requestWithDomain).mock.calls.at(-1)?.[0]).toBe(`http://bff.test/v1/${path.join("/")}`);
  }
});
it("rejects Project skill aliases and unadmitted mutation without dispatch", async () => {
  const { GET, PUT } = await import("@/app/api/hub/[...path]/route");
  const projectId = "project_11111111-1111-4111-8111-111111111111";
  for (const last of ["skill-selection", "skill-installations"]) {
    const path = ["self", "projects", projectId, last];
    expect((await GET(new Request(`http://localhost/api/hub/${path.join("/")}`), params(path))).status).toBe(404);
  }
  const path = ["projects", projectId, "skill-selection"];
  const url = `http://localhost/api/hub/${path.join("/")}`;
  expect((await PUT(new Request(url, { method: "PUT", headers: { origin: "https://other.example", "idempotency-key": "key", "content-type": "application/json" }, body: '{"installation_ids":[]}' }), params(path))).status).toBe(403);
  currentProductSession.mockResolvedValueOnce(null);
  expect((await PUT(new Request(url, { method: "PUT", headers: { origin: "http://localhost", "idempotency-key": "key", "content-type": "application/json" }, body: '{"installation_ids":[]}' }), params(path))).status).toBe(401);
  expect(requestWithDomain).not.toHaveBeenCalled();
});

it("retires the project skill-name switch before any legacy Hub dispatch", async () => {
  const { PATCH } = await import("@/app/api/hub/[...path]/route");
  vi.mocked(requestWithDomain).mockResolvedValue(Response.json({ data: { enabled: true } }));
  for (const path of [["projects", "project_11111111-1111-4111-8111-111111111111", "skills", "skill-builder"], ["self", "projects", "project_11111111-1111-4111-8111-111111111111", "skills", "skill-builder"]]) {
    const response = await PATCH(new Request(`http://localhost/api/hub/${path.join("/")}`, { method: "PATCH", headers: { origin: "http://localhost", "content-type": "application/json", "idempotency-key": "old-name-key" }, body: '{"enabled":true}' }), params(path));
    expect(response.status).toBe(404);
  }
  expect(requestWithDomain).not.toHaveBeenCalled();
});

it("owned history reads the precise versions route and refuses caller filters without owner IO", async () => {
  const data = { series_id: "history-series", publication: null, versions: [], next_cursor: null };
  vi.mocked(requestWithDomain).mockResolvedValue(Response.json({data, meta:{request_id:"history-read"}}, {headers:{"cache-control":"no-store", "x-request-id":"history-read"}}));
  const { GET } = await import("@/app/api/hub/[...path]/route");
  const path=["self","skills","managed","history-anchor","versions"];
  const response=await GET(new Request("http://localhost/api/hub/self/skills/managed/history-anchor/versions?limit=2&cursor=opaque"),params(path));
  expect(response.status).toBe(200);
  expect(requestWithDomain).toHaveBeenCalledWith("http://bff.test/v1/self/skills/history-anchor/versions?limit=2&cursor=opaque",ENV.KOKORO_DOMAIN, expect.objectContaining({method:"GET"}));
  expect(await response.json()).toEqual({data,meta:{request_id:"history-read"}});
  const before=vi.mocked(requestWithDomain).mock.calls.length;
  for(const query of ["?subject=other", "?status=active", "?limit=0", "?limit=2&limit=2", "?cursor="]){
    expect((await GET(new Request(`http://localhost/api/hub/self/skills/managed/history-anchor/versions${query}`),params(path))).status).toBe(400);
  }
  expect(requestWithDomain).toHaveBeenCalledTimes(before);
});

it("owned history package preview uses the exact managed revision rather than catalog or installation", async()=>{
  const { GET }=await import("@/app/api/hub/[...path]/route");
  const data={source_ref:"skill:history-old",revision:"2",files:[],selected_file:null};
  vi.mocked(requestWithDomain).mockResolvedValue(Response.json({data},{headers:{"cache-control":"no-store","x-request-id":"history-package"}}));
  const response=await GET(new Request("http://localhost/api/hub/self/skills/managed/history-old/package"),params(["self","skills","managed","history-old","package"]));
  expect(response.status).toBe(200);
  expect(requestWithDomain).toHaveBeenCalledWith("http://bff.test/v1/self/skills/history-old/package",ENV.KOKORO_DOMAIN,expect.objectContaining({method:"GET"}));
  expect(await response.json()).toEqual({data});
});

it("history body deadline remains dependency-unavailable instead of corrupt-response",async()=>{
 const {UpstreamTimeoutError}=await import("@/lib/server/upstream-http")
 const {GET}=await import("@/app/api/hub/[...path]/route")
 const body=new ReadableStream<Uint8Array>({start(controller){controller.error(new UpstreamTimeoutError())}})
 vi.mocked(requestWithDomain).mockResolvedValue(new Response(body,{headers:{"content-type":"application/json","cache-control":"no-store","x-request-id":"timeout-history"}}))
 const response=await GET(new Request("http://localhost/api/hub/self/skills/managed/anchor/versions"),params(["self","skills","managed","anchor","versions"]))
 expect(response.status).toBe(503)
 expect(await response.json()).toMatchObject({error:{code:"skill_dependency_unavailable"}})
})


it("routes publisher historical ZIP qualification to the existing exact managed download", async () => {
  const { POST } = await import("@/app/api/hub/[...path]/route")
  const path = ["self", "skills", "managed", "history-old", "download"]
  const ack = { data: { source_ref: "skill:history-old", revision: "1", download_info: { download_url: `/skill-downloads/${"a".repeat(43)}`, filename: "original.zip", expires_at: "2999-01-01T00:00:00Z" } } }
  vi.mocked(requestWithDomain).mockResolvedValueOnce(Response.json(ack, { headers: catalogPackageHeaders }))
  const response = await POST(new Request(`http://localhost/api/hub/${path.join("/")}`, { method: "POST", headers: { origin: ENV.KOKORO_WEB_ORIGIN } }), params(path))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(ack)
  expect(requestWithDomain).toHaveBeenLastCalledWith("http://bff.test/browser/v1/skills/history-old/download", ENV.KOKORO_DOMAIN, expect.objectContaining({ method: "POST" }))
})

it("keeps exact publisher download empty-body/Origin guards and rejects another source ACK", async () => {
 const {POST}=await import("@/app/api/hub/[...path]/route")
 const path=["self","skills","managed","history-old","download"],url=`http://localhost/api/hub/${path.join("/")}`
 for(const variant of ["origin","body","query","key"]){
  const response=await POST(new Request(`${url}${variant==="query"?"?extra=1":""}`,{method:"POST",headers:{origin:variant==="origin"?"https://other.test":ENV.KOKORO_WEB_ORIGIN,...(variant==="key"?{"idempotency-key":"not-allowed"}:{})},...(variant==="body"?{body:"x"}:{})}),params(path))
  expect(response.status).toBe(variant==="origin"?403:400)
 }
 expect(requestWithDomain).not.toHaveBeenCalled()
 const ack={data:{source_ref:"skill:other",revision:"1",download_info:{download_url:`/skill-downloads/${"a".repeat(43)}`,filename:"original.zip",expires_at:"2999-01-01T00:00:00Z"}}}
 vi.mocked(requestWithDomain).mockResolvedValueOnce(Response.json(ack,{headers:catalogPackageHeaders}))
 expect((await POST(new Request(url,{method:"POST",headers:{origin:ENV.KOKORO_WEB_ORIGIN}}),params(path))).status).toBe(502)
})

it("deletes the confirmed personal series through the sole formal route without changing command bytes",async()=>{
 const {DELETE}=await import("@/app/api/hub/[...path]/route")
 const data={series_id:"series",skill_id:"mine",state_version:"9",status:"deleted",event_id:`evt:${"a".repeat(64)}`,replayed:false}
 vi.mocked(requestWithDomain).mockResolvedValue(Response.json({data,meta:{request_id:"owner-1"}},{headers:{"cache-control":"no-store","x-request-id":"owner-1"}}))
 const body='{ "expected_state_version":"8", "expected_publication":{"current_version_id":"current","state_version":"9007199254740993"} }'
 const response=await DELETE(new Request("http://localhost/api/hub/self/skills/mine",{method:"DELETE",headers:{origin:"http://localhost","content-type":"application/json","idempotency-key":"original-delete"},body}),params(["self","skills","mine"]))
 expect(response.status).toBe(200);expect(await response.json()).toEqual({data,meta:{request_id:"owner-1"}})
 expect(vi.mocked(requestWithDomain)).toHaveBeenCalledWith("http://bff.test/v1/self/skills/mine",expect.anything(),expect.objectContaining({method:"DELETE",headers:expect.objectContaining({"idempotency-key":"original-delete"})}))
 expect(new TextDecoder().decode(vi.mocked(requestWithDomain).mock.calls[0]![2]!.body as ArrayBuffer)).toBe(body)
})

it.each(["missing-publication","extra-identity","duplicate-key"])("rejects invalid deletion %s before owner I/O",async(kind)=>{
 const {DELETE}=await import("@/app/api/hub/[...path]/route")
 const body=kind==="missing-publication"?'{"expected_state_version":"8"}':kind==="extra-identity"?'{"expected_state_version":"8","expected_publication":null,"actor":"self"}':'{"expected_state_version":"8","expected_publication":null,"expected_publication":null}'
 const response=await DELETE(new Request("http://localhost/api/hub/self/skills/mine",{method:"DELETE",headers:{origin:"http://localhost","content-type":"application/json","idempotency-key":"delete-key"},body}),params(["self","skills","mine"]))
 expect(response.status).toBe(400);expect(requestWithDomain).not.toHaveBeenCalled()
})

it.each([
 { expected:"4", actual:"5", valid:true },
 { expected:"4", actual:"6", valid:false },
 { expected:"9007199254740993", actual:"9007199254740994", valid:true },
 { expected:"9007199254740993", actual:"9007199254740995", valid:false },
])("proxies only an exact one-step deletion ACK, rejecting a wrong jump $expected → $actual",async({expected,actual,valid})=>{
 const {DELETE}=await import("@/app/api/hub/[...path]/route")
 const data={series_id:"series",skill_id:"mine",state_version:actual,status:"deleted",event_id:`evt:${"a".repeat(64)}`,replayed:false}
 vi.mocked(requestWithDomain).mockResolvedValue(Response.json({data,meta:{request_id:"owner-1"}},{headers:{"cache-control":"no-store","x-request-id":"owner-1"}}))
 const response=await DELETE(new Request("http://localhost/api/hub/self/skills/mine",{method:"DELETE",headers:{origin:"http://localhost","content-type":"application/json","idempotency-key":"delete-exact-step"},body:JSON.stringify({expected_state_version:expected,expected_publication:null})}),params(["self","skills","mine"]))
 expect(response.status).toBe(valid?200:502)
 if(valid)expect(await response.json()).toEqual({data,meta:{request_id:"owner-1"}})
 else expect(await response.json()).toMatchObject({error:{code:"skill_response_invalid"}})
})

// Icons remain on the same admitted, bounded private MCP adapter, not an asset proxy.
describe("MCP icon staging adapter", () => {
  const id = "12345678-1234-1234-1234-123456789abc";
  const at = "2099-01-01T00:00:00Z";
  const intent = { intent_id: id, state: "ready", state_version: "3", filename: "icon.png", mime_type: "image/png", content_sha256: "a".repeat(64), size_bytes: "8", expires_at: at, expired: false, width: 24, height: 24, created_at: at, updated_at: at };
  const reply = (data: unknown) => new Response(JSON.stringify({ data }), { headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "icon-owner" } });
  const cases = [
    { suffix: "uploads", body: { filename: "icon.png", mime_type: "image/png", content_sha256: "a".repeat(64), size_bytes: "8" }, data: { intent: { ...intent, state: "staged", state_version: "1", width: undefined, height: undefined }, replayed: false } },
    { suffix: "import", body: { image_url: "https://images.example/icon.png" }, data: { intent, replayed: false } },
    { suffix: `${id}/complete`, body: { expected_state_version: "1", source_version_id: "exact-version" }, data: { intent, replayed: false } },
    { suffix: `${id}/cancel`, body: { expected_state_version: "3" }, data: { intent: { ...intent, state: "released", state_version: "5" }, replayed: false } },
  ];
  it.each(cases)("relays $suffix once with original body/key and trusted session", async ({ suffix, body, data }) => {
    const { POST } = await import("@/app/api/hub/[...path]/route");
    vi.mocked(requestWithDomain).mockResolvedValue(reply(data));
    const response = await POST(new Request(`http://localhost/api/hub/mcp/icons/${suffix}`, { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", "idempotency-key": "icon-original", authorization: "Bearer untrusted" }, body: JSON.stringify(body) }), params(["mcp", "icons", ...suffix.split("/")]));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store"); expect(await response.json()).toEqual({ data });
    expect(requestWithDomain).toHaveBeenCalledTimes(1);
    const [url, , options] = vi.mocked(requestWithDomain).mock.calls[0]!;
    expect(String(url)).toBe(`http://bff.test/browser/v1/mcp/icons/${suffix}`);
    expect(options?.headers).toMatchObject({ authorization: "Bearer product-access", "idempotency-key": "icon-original" });
    expect(JSON.parse(new TextDecoder().decode(options?.body as ArrayBuffer))).toEqual(body);
  });
  it("GET is read-only; mismatched ACK and attempted keyless mutation do not become success", async () => {
    const { GET, POST } = await import("@/app/api/hub/[...path]/route");
    vi.mocked(requestWithDomain).mockResolvedValue(reply({ intent }));
    const read = await GET(new Request(`http://localhost/api/hub/mcp/icons/${id}`), params(["mcp", "icons", id]));
    expect(read.status).toBe(200);
    expect(vi.mocked(requestWithDomain).mock.calls[0]?.[2]?.headers).not.toHaveProperty("idempotency-key");
    vi.mocked(requestWithDomain).mockReset();
    const path = ["mcp", "icons", id, "cancel"], url = `http://localhost/api/hub/${path.join("/")}`;
    const headers = { origin: "http://localhost", "content-type": "application/json" }, body = JSON.stringify({ expected_state_version: "1" });
    expect((await POST(new Request(url, { method: "POST", headers, body }), params(path))).status).toBe(400);
    expect(requestWithDomain).not.toHaveBeenCalled();
    vi.mocked(requestWithDomain).mockResolvedValue(reply({ intent, replayed: false }));
    expect((await POST(new Request(url, { method: "POST", headers: { ...headers, "idempotency-key": "icon-original" }, body }), params(path))).status).toBe(502);
    expect(requestWithDomain).toHaveBeenCalledTimes(1);
  });
});

it("SSE same-origin adapter reuses strict operation context for new versus historical ACK and Current", async () => {
 const server = { availability: "unavailable", server_id: "sse-server", display_name: "SSE", server_url: "https://example.test/sse", transport: "sse_compat", status: "pending", state_version: "1", headers: [], prepare_status: "pending_prepare", declarations: [], declarations_available: false };
 const connector = { availability: "unavailable", connector_id: "sse-connector", server_id: server.server_id, provider_key: "private-sse", connector_type: "mcp", status: "pending", enabled: false, state_version: "1", approved_scopes: [] };
 const legacy = Object.fromEntries(Object.entries(server).filter(([key]) => key !== "transport"));
 const route = await import("@/app/api/hub/[...path]/route");
 const owner = (data: unknown, status: number) => new Response(JSON.stringify({ data }), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "owner-sse" } });
 for (const [transport, reply, replayed, expected] of [["sse_compat", server, false, 201], ["sse_compat", legacy, true, 502], ["streamable_http", legacy, true, 502], [undefined, legacy, true, 201], [undefined, legacy, false, 502]] as const) {
  vi.mocked(requestWithDomain).mockResolvedValueOnce(owner({ server: reply, connector, replayed }, 201));
  const body = { display_name: server.display_name, server_url: server.server_url, ...(transport === undefined ? {} : { transport }) };
  const response = await route.POST(new Request("http://localhost/api/hub/mcp/servers", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", "idempotency-key": "sse-original" }, body: JSON.stringify(body) }), params(["mcp", "servers"]));
  expect(response.status).toBe(expected);
 }
 vi.mocked(requestWithDomain).mockResolvedValueOnce(owner({ server: legacy }, 200));
 expect((await route.GET(new Request("http://localhost/api/hub/mcp/servers/sse-server"), params(["mcp", "servers", "sse-server"]))).status).toBe(502);
 expect(requestWithDomain).toHaveBeenCalledTimes(6);
});
