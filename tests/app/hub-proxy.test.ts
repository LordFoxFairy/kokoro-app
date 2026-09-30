import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import YAML from "yaml"

import { requestWithDomain } from "@/lib/server/upstream-http"
import type { ProductBffConfig } from "@/lib/server/product-bff"

vi.mock("@/lib/server/upstream-http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/upstream-http")>()),
  requestWithDomain: vi.fn(),
}))

const { currentProductSession } = vi.hoisted(() => ({
  currentProductSession: vi.fn(),
}))
vi.mock("@/lib/server/product-session", () => ({ currentProductSession }))

const ENV = {
  KOKORO_WEB_AUTH_SECRET: "a".repeat(32),
  KOKORO_WEB_REDIS_URL: "redis://fixture.invalid/9",
  KOKORO_WEB_ORIGIN: "http://localhost",
  KOKORO_DOMAIN: "dev.kokoro.localhost",
  KOKORO_BFF_BASE_URL: "http://bff.test",
  KOKORO_INTERNAL_SECRET_WEB_BFF: "svc-secret",
}

const pinnedSpec = YAML.parse(readFileSync(resolve(process.cwd(), "src/generated/bff-public-openapi.yaml"), "utf8")) as {
  components: { schemas: {
    PlatformProjectionReadErrorResponse: { properties: { error: { properties: { code: { enum: string[] } } } } }
    PublishedPersonalSkillErrorDetail: { properties: { code: { enum: string[] } } }
  } }
}
const ownerErrorCodes = {
  projection: pinnedSpec.components.schemas.PlatformProjectionReadErrorResponse.properties.error.properties.code.enum,
  byId: pinnedSpec.components.schemas.PublishedPersonalSkillErrorDetail.properties.code.enum,
}

// A retired cookie must never be promoted into a Product Session.
function sessionCookie(): string {
  return "kokoro_session=retired-forged-envelope"
}

function params(path: string[]): { params: Promise<{ path: string[] }> } {
  return { params: Promise.resolve({ path }) }
}

beforeEach(() => {
  currentProductSession.mockReset()
  currentProductSession.mockResolvedValue({
    access: "product-access",
    accessExpiresAt: Date.now() + 60_000,
  })
  for (const [k, v] of Object.entries(ENV)) process.env[k] = v
  vi.mocked(requestWithDomain).mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
  currentProductSession.mockReset()
  for (const k of Object.keys(ENV)) delete process.env[k]
})

describe("/api/hub/[...path] proxy", () => {
  it("keeps list/MCP query errors separate from by-ID request errors in the pinned owner enums", () => {
    expect(ownerErrorCodes.projection).toContain("invalid_query_parameter")
    expect(ownerErrorCodes.projection).not.toContain("invalid_skill_request")
    expect(ownerErrorCodes.byId).toContain("invalid_skill_request")
    expect(ownerErrorCodes.byId).not.toContain("invalid_query_parameter")
  })

  async function expectProjectionError(response: Response, status: number, code: string, retryable: boolean, expectedRequestId?: string, ownerKind: "projection" | "byId" = "projection") {
    expect(response.status).toBe(status)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("content-type")).toMatch(/^application\/json/u)
    const requestId = response.headers.get("x-request-id")
    expect(requestId).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u)
    if (expectedRequestId) expect(requestId).toBe(expectedRequestId)
    expect(ownerErrorCodes[ownerKind]).toContain(code)
    expect(await response.json()).toEqual({ error: { code, message: code, retryable } })
  }

  it("emits typed local errors for projection config, IAM, query, network, and invalid owner branches", async () => {
    const { GET } = await import("@/app/api/hub/[...path]/route")
    const path = params(["self", "skills"])
    delete process.env.KOKORO_WEB_AUTH_SECRET
    await expectProjectionError(await GET(new Request("http://localhost/api/hub/self/skills?scope_kind=personal", { headers: { "x-kokoro-request-id": "client-valid" } }), path), 503, "product_tenant_not_configured", false, "client-valid")
    process.env.KOKORO_WEB_AUTH_SECRET = ENV.KOKORO_WEB_AUTH_SECRET

    const productBff = await import("@/lib/server/product-bff")
    const configSpy = vi.spyOn(productBff, "productBffConfig").mockReturnValueOnce({
      bffBaseUrl: null, domain: "dev.kokoro.localhost", internalSecret: "svc-secret",
      session: { redisUrl: ENV.KOKORO_WEB_REDIS_URL, webOrigin: ENV.KOKORO_WEB_ORIGIN, secret: ENV.KOKORO_WEB_AUTH_SECRET },
    } as unknown as ProductBffConfig)
    await expectProjectionError(await GET(new Request("http://localhost/api/hub/self/skills?scope_kind=personal"), path), 503, "skill_dependency_unavailable", false)
    configSpy.mockRestore()

    currentProductSession.mockRejectedValueOnce(new Error("IAM down"))
    const invalidId = await GET(new Request("http://localhost/api/hub/self/skills?scope_kind=personal", { headers: { "x-kokoro-request-id": "bad request id" } }), path)
    await expectProjectionError(invalidId, 503, "iam_admission_unavailable", true)
    expect(invalidId.headers.get("x-request-id")).not.toBe("bad request id")

    currentProductSession.mockResolvedValueOnce(null)
    await expectProjectionError(await GET(new Request("http://localhost/api/hub/self/skills?scope_kind=personal"), path), 401, "session_authentication_required", false)
    await expectProjectionError(await GET(new Request("http://localhost/api/hub/self/skills?scope=official"), path), 400, "invalid_query_parameter", false)
    await expectProjectionError(await GET(new Request("http://localhost/api/hub/self/mcp/servers?cursor="), params(["self", "mcp", "servers"])), 400, "invalid_query_parameter", false)
    await expectProjectionError(await GET(new Request("http://localhost/api/hub/self/skills/bad%20id"), params(["self", "skills", "bad id"])), 400, "invalid_skill_request", false, undefined, "byId")

    vi.mocked(requestWithDomain).mockRejectedValueOnce(new Error("BFF down"))
    await expectProjectionError(await GET(new Request("http://localhost/api/hub/self/skills?scope_kind=personal"), path), 503, "skill_dependency_unavailable", true)
    vi.mocked(requestWithDomain).mockResolvedValueOnce(new Response('{"data":{"skills":[]}}', { status: 200, headers: { "content-type": "application/json" } }))
    await expectProjectionError(await GET(new Request("http://localhost/api/hub/self/skills?scope_kind=personal"), path), 502, "skill_response_invalid", false)
  })

  it("accepts only JSON media type for successful and error owner projections", async () => {
    const { GET } = await import("@/app/api/hub/[...path]/route")
    const path = params(["self", "skills"])
    for (const status of [200, 404]) {
      vi.mocked(requestWithDomain).mockResolvedValueOnce(new Response(status === 200 ? '{"data":{"skills":[]}}' : '{"error":{"code":"skill_not_found","message":"hidden","retryable":false}}', {
        status, headers: { "content-type": "text/plain", "cache-control": "no-store", "x-request-id": "owner-request" },
      }))
      await expectProjectionError(await GET(new Request("http://localhost/api/hub/self/skills?scope_kind=personal"), path), 502, "skill_response_invalid", false)
    }
    for (const status of [200, 404]) {
      vi.mocked(requestWithDomain).mockResolvedValueOnce(new Response(status === 200 ? '{"data":{"skills":[]}}' : '{"error":{"code":"skill_not_found","message":"hidden","retryable":false}}', {
        status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-request-id": "owner-request" },
      }))
      const response = await GET(new Request("http://localhost/api/hub/self/skills?scope_kind=personal"), path)
      expect(response.status).toBe(status)
      expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8")
    }
  })

  it("preserves BFF personal Skill and MCP read request IDs while rejecting old scope and redirects", async () => {
    const { GET } = await import("@/app/api/hub/[...path]/route")
    vi.mocked(requestWithDomain).mockResolvedValueOnce(new Response(JSON.stringify({ data: { skills: [], next_cursor: null } }), {
      status: 200, headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "req_skill_1" },
    }))
    const list = await GET(new Request("http://localhost/api/hub/self/skills?scope_kind=personal"), params(["self", "skills"]))
    expect(list.status).toBe(200)
    expect(list.headers.get("cache-control")).toBe("no-store")
    expect(list.headers.get("x-request-id")).toBe("req_skill_1")
    expect(vi.mocked(requestWithDomain).mock.calls[0]?.[0]).toBe("http://bff.test/v1/skills?scope_kind=personal")

    const oldScope = await GET(new Request("http://localhost/api/hub/self/skills?scope=official"), params(["self", "skills"]))
    expect(oldScope.status).toBe(400)
    expect(requestWithDomain).toHaveBeenCalledTimes(1)

    vi.mocked(requestWithDomain).mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "skill_not_found", message: "hidden", retryable: false } }), {
      status: 404, headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "req_skill_2" },
    }))
    const hidden = await GET(new Request("http://localhost/api/hub/self/skills/skill-1"), params(["self", "skills", "skill-1"]))
    expect(hidden.status).toBe(404)
    expect(hidden.headers.get("x-request-id")).toBe("req_skill_2")

    vi.mocked(requestWithDomain).mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://invalid.example" } }))
    const redirect = await GET(new Request("http://localhost/api/hub/self/mcp/servers"), params(["self", "mcp", "servers"]))
    expect(redirect.status).toBe(502)
    expect(redirect.headers.get("location")).toBeNull()
  })
  it("streams only the exact Artifact binary path with a 1 GiB ceiling and safe attachment headers", async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close() } })
    vi.mocked(requestWithDomain).mockResolvedValue(new Response(body, { status: 200, headers: {
      "content-type": "application/octet-stream", "content-length": "3",
      "content-disposition": "attachment; filename=\"report.bin\"; filename*=UTF-8''report.bin",
      "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff",
      "x-request-id": "req_artifact_1", "x-owner-secret": "drop-me",
    } }))
    const { GET } = await import("@/app/api/hub/[...path]/route")
    const response = await GET(new Request("http://localhost/api/hub/library/artifacts/conversation-1/artifact-1/content"), params(["library", "artifacts", "conversation-1", "artifact-1", "content"]))
    expect(response.status).toBe(200)
    expect(response.headers.get("content-disposition")).toContain("report.bin")
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
    expect(response.headers.get("x-owner-secret")).toBeNull()
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    const [target, , options] = vi.mocked(requestWithDomain).mock.calls[0] as [string, string, Record<string, unknown>]
    expect(target).toBe("http://bff.test/v1/library/artifacts/conversation-1/artifact-1/content")
    expect(options).toMatchObject({ maxResponseBytes: 1_073_741_824, maxErrorResponseBytes: 16_777_216, errorResponseTimeoutMs: 15_000, strictResponseLength: true, streamIdleTimeoutMs: expect.any(Number), streamTotalTimeoutMs: expect.any(Number) })
  })

  it("rejects Artifact query/alias, unsafe headers and a short binary stream", async () => {
    const { GET } = await import("@/app/api/hub/[...path]/route")
    const query = await GET(new Request("http://localhost/api/hub/library/artifacts/conversation-1/artifact-1/content?x=1"), params(["library", "artifacts", "conversation-1", "artifact-1", "content"]))
    expect(query.status).toBe(400)
    const alias = await GET(new Request("http://localhost/api/hub/self/library/artifacts/conversation-1/artifact-1/content"), params(["self", "library", "artifacts", "conversation-1", "artifact-1", "content"]))
    expect(alias.status).toBe(404)
    expect(requestWithDomain).not.toHaveBeenCalled()
    vi.mocked(requestWithDomain).mockResolvedValueOnce(new Response("", { status: 302, headers: { location: "https://storage.invalid/object" } }))
    const redirect = await GET(new Request("http://localhost/api/hub/library/artifacts/conversation-1/artifact-1/content"), params(["library", "artifacts", "conversation-1", "artifact-1", "content"]))
    expect(redirect.status).toBe(502)
    expect(redirect.headers.get("location")).toBeNull()
    vi.mocked(requestWithDomain).mockResolvedValueOnce(new Response(new Uint8Array([1, 2]), { status: 200, headers: {
      "content-type": "application/octet-stream", "content-length": "2", "content-disposition": "inline",
      "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "x-request-id": "req_1",
    } }))
    const unsafe = await GET(new Request("http://localhost/api/hub/library/artifacts/conversation-1/artifact-1/content"), params(["library", "artifacts", "conversation-1", "artifact-1", "content"]))
    expect(unsafe.status).toBe(502)
    vi.mocked(requestWithDomain).mockResolvedValueOnce(new Response(new Uint8Array([1, 2]), { status: 200, headers: {
      "content-type": "application/octet-stream", "content-length": "3", "content-disposition": "attachment; filename=\"report.bin\"; filename*=UTF-8''report.bin",
      "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "x-request-id": "req_1",
    } }))
    const short = await GET(new Request("http://localhost/api/hub/library/artifacts/conversation-1/artifact-1/content"), params(["library", "artifacts", "conversation-1", "artifact-1", "content"]))
    await expect(short.arrayBuffer()).rejects.toThrow()
  })

  it("rejects non-200 success codes and preserves only safe Artifact error headers", async () => {
    const { GET } = await import("@/app/api/hub/[...path]/route")
    const request = () => new Request("http://localhost/api/hub/library/artifacts/conversation-1/artifact-1/content")
    const selector = () => params(["library", "artifacts", "conversation-1", "artifact-1", "content"])
    vi.mocked(requestWithDomain).mockResolvedValueOnce(new Response(null, { status: 204 }))
    const emptySuccess = await GET(request(), selector())
    expect(emptySuccess.status).toBe(502)
    vi.mocked(requestWithDomain).mockResolvedValueOnce(new Response("partial", { status: 206 }))
    const partial = await GET(request(), selector())
    expect(partial.status).toBe(502)
    vi.mocked(requestWithDomain).mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "admission_rate_limited" } }), {
      status: 429, headers: { "content-type": "application/json", "x-request-id": "req_429", "retry-after": "12", "content-disposition": "attachment; filename=bad", "x-owner-secret": "drop" },
    }))
    const limited = await GET(request(), selector())
    expect(limited.status).toBe(429)
    expect(limited.headers.get("x-request-id")).toBe("req_429")
    expect(limited.headers.get("retry-after")).toBe("12")
    expect(limited.headers.get("content-disposition")).toBeNull()
    expect(limited.headers.get("x-owner-secret")).toBeNull()
    vi.mocked(requestWithDomain).mockResolvedValueOnce(new Response("{}", { status: 503, headers: { "content-type": "application/json", "x-request-id": "bad id", "retry-after": "999999" } }))
    const unavailable = await GET(request(), selector())
    expect(unavailable.status).toBe(503)
    expect(unavailable.headers.get("x-request-id")).toBeNull()
    expect(unavailable.headers.get("retry-after")).toBeNull()
  })

  it("returns fully verified personal download bytes and only the narrow safe headers", async () => {
    const bytes = new Uint8Array([0, 255, 1, 42])
    vi.mocked(requestWithDomain).mockResolvedValue(new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(bytes.byteLength),
        "content-disposition": "attachment; filename=\"private.bin\"; filename*=UTF-8''private.bin",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
        "x-request-id": "req_download_1",
        "x-owner-secret": "never-forward",
      },
    }))
    const { GET } = await import("@/app/api/hub/[...path]/route")
    const response = await GET(new Request("http://localhost/api/hub/library/files/asset-1/content"), params(["library", "files", "asset-1", "content"]))
    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
    expect(response.headers.get("content-disposition")).toContain("private.bin")
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(response.headers.get("x-request-id")).toBe("req_download_1")
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(response.headers.get("x-owner-secret")).toBeNull()
    expect(vi.mocked(requestWithDomain).mock.calls[0]?.[0]).toBe("http://bff.test/v1/library/files/asset-1/content")
  })

  it.each([
    [{ "content-disposition": "inline; filename=private.bin" }, 502],
    [{ "referrer-policy": "unsafe-url" }, 502],
    [{ "x-content-type-options": "" }, 502],
    [{ "content-length": "3" }, 502],
    [{ "x-request-id": "bad request id" }, 502],
    [{ "x-request-id": "" }, 502],
  ])("rejects invalid personal download owner metadata %o", async (overrides, expected) => {
    vi.mocked(requestWithDomain).mockResolvedValue(new Response(new Uint8Array([1, 2]), {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "content-length": "2",
        "content-disposition": "attachment; filename=\"private.bin\"; filename*=UTF-8''private.bin",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
        "x-request-id": "req_download_1",
        ...overrides,
      },
    }))
    const { GET } = await import("@/app/api/hub/[...path]/route")
    const response = await GET(new Request("http://localhost/api/hub/library/files/asset-1/content"), params(["library", "files", "asset-1", "content"]))
    expect(response.status).toBe(expected)
    expect(response.headers.get("content-disposition")).toBeNull()
    expect(response.headers.get("x-request-id")).toBeNull()
  })

  it("rejects a personal 200 with no owner request id", async () => {
    vi.mocked(requestWithDomain).mockResolvedValue(new Response(new Uint8Array([1, 2]), {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "content-length": "2",
        "content-disposition": "attachment; filename=\"private.bin\"; filename*=UTF-8''private.bin",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      },
    }))
    const { GET } = await import("@/app/api/hub/[...path]/route")
    const response = await GET(new Request("http://localhost/api/hub/library/files/asset-1/content"), params(["library", "files", "asset-1", "content"]))
    expect(response.status).toBe(502)
    expect(response.headers.get("content-disposition")).toBeNull()
  })

  it.each([404, 401, 502])("keeps personal download owner error %i without success headers", async (status) => {
    vi.mocked(requestWithDomain).mockResolvedValue(new Response(JSON.stringify({ error: { code: "library_file_not_found" } }), {
      status,
      headers: { "content-type": "application/json", "content-disposition": "attachment; filename=\"leak\"" },
    }))
    const { GET } = await import("@/app/api/hub/[...path]/route")
    const response = await GET(new Request("http://localhost/api/hub/library/files/asset-1/content"), params(["library", "files", "asset-1", "content"]))
    expect(response.status).toBe(status)
    expect(response.headers.get("content-disposition")).toBeNull()
  })

  it("rejects redirects, extra query and self alias for personal content without exposing a download", async () => {
    vi.mocked(requestWithDomain).mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://storage.invalid/private" } }))
    const { GET } = await import("@/app/api/hub/[...path]/route")
    const redirected = await GET(new Request("http://localhost/api/hub/library/files/asset-1/content"), params(["library", "files", "asset-1", "content"]))
    expect(redirected.status).toBe(502)
    expect(redirected.headers.get("location")).toBeNull()
    const queried = await GET(new Request("http://localhost/api/hub/library/files/asset-1/content?download=1"), params(["library", "files", "asset-1", "content"]))
    expect(queried.status).toBe(400)
    expect(requestWithDomain).toHaveBeenCalledTimes(1)
    const aliased = await GET(new Request("http://localhost/api/hub/self/library/files/asset-1/content"), params(["self", "library", "files", "asset-1", "content"]))
    expect(aliased.status).toBe(404)
    expect(requestWithDomain).toHaveBeenCalledTimes(1)
  })
  it("allows the owner upload deadline only for Project resources and personal Library files", async () => {
    vi.mocked(requestWithDomain).mockResolvedValue(new Response('{"error":{"code":"resource_scan_pending"}}', {
      status: 503,
      headers: { "content-type": "application/json" },
    }))
    const { POST } = await import("@/app/api/hub/[...path]/route")
    const body = new FormData()
    body.append("files", new File(["content"], "notes.txt", { type: "text/plain" }))
    await POST(new Request("http://localhost/api/hub/projects/project-1/resources", {
      method: "POST",
      headers: { origin: "http://localhost", "idempotency-key": "project-resource:key-1" },
      body,
    }), params(["projects", "project-1", "resources"]))
    const [, , upload] = vi.mocked(requestWithDomain).mock.calls[0] as [string, string, { timeoutMs?: number; maxRequestBytes?: number; headers: Record<string, string> }]
    expect(upload.timeoutMs).toBe(50_000)
    expect(upload.maxRequestBytes).toBe(1024 * 1024)
    expect(new Headers(upload.headers).get("idempotency-key")).toBe("project-resource:key-1")

    await POST(new Request("http://localhost/api/hub/library/files", {
      method: "POST",
      headers: { origin: "http://localhost", "idempotency-key": "personal-file:key-1" },
      body,
    }), params(["library", "files"]))
    const [personalTarget, , personalUpload] = vi.mocked(requestWithDomain).mock.calls[1] as [string, string, { timeoutMs?: number; maxRequestBytes?: number; headers: Record<string, string> }]
    expect(personalTarget).toBe("http://bff.test/v1/library/files")
    expect(personalUpload.timeoutMs).toBe(50_000)
    expect(personalUpload.maxRequestBytes).toBe(1024 * 1024)
    expect(new Headers(personalUpload.headers).get("idempotency-key")).toBe("personal-file:key-1")

    await POST(new Request("http://localhost/api/hub/projects/project-1", {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "application/json" },
      body: "{}",
    }), params(["projects", "project-1"]))
    const [, , ordinary] = vi.mocked(requestWithDomain).mock.calls[2] as [string, string, { timeoutMs?: number }]
    expect(ordinary.timeoutMs).toBeUndefined()
  })
  it("rejects an oversized project resource body before forwarding it", async () => {
    const { POST } = await import("@/app/api/hub/[...path]/route")
    const response = await POST(new Request("http://localhost/api/hub/projects/project-1/resources", {
      method: "POST", headers: { origin: "http://localhost", "idempotency-key": "project-resource:huge", "content-type": "multipart/form-data; boundary=fixture" },
      body: new Uint8Array(1024 * 1024 + 1),
    }), params(["projects", "project-1", "resources"]))
    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ error: "request_body_too_large" })
    expect(requestWithDomain).not.toHaveBeenCalled()

    const personalResponse = await POST(new Request("http://localhost/api/hub/library/files", {
      method: "POST", headers: { origin: "http://localhost", "idempotency-key": "personal-file:huge", "content-type": "multipart/form-data; boundary=fixture" },
      body: new Uint8Array(1024 * 1024 + 1),
    }), params(["library", "files"]))
    expect(personalResponse.status).toBe(413)
    expect(requestWithDomain).not.toHaveBeenCalled()
  })
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
    )
    const { GET } = await import("@/app/api/hub/[...path]/route")

    const request = new Request("http://localhost/api/hub/self/skills?scope_kind=personal", {
      headers: { cookie: sessionCookie() },
    })
    const res = await GET(request, params(["self", "skills"]))
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(res.headers.get("x-request-id")).toBe("req-personal-list")

    const [target, domain, init] = vi.mocked(requestWithDomain).mock.calls[0] as [
      string,
      string,
      { headers: Record<string, string>; signal: AbortSignal },
    ]
    expect(target).toBe("http://bff.test/v1/skills?scope_kind=personal")
    expect(domain).toBe("dev.kokoro.localhost")
    expect(init.headers["x-kokoro-service"]).toBe("web-bff")
    expect(init.headers["x-kokoro-internal-secret"]).toBe("svc-secret")
    expect(init.headers["x-kokoro-namespace"]).toBeUndefined()
    expect(init.headers["x-kokoro-principal-id"]).toBeUndefined()
    expect(init.signal).toBe(request.signal)
  })

  it("fails closed when the business BFF base is omitted", async () => {
    delete process.env.KOKORO_BFF_BASE_URL
    const { GET } = await import("@/app/api/hub/[...path]/route")

    const response = await GET(
      new Request("http://localhost/api/hub/self/skills/pool", {
        headers: { cookie: sessionCookie() },
      }),
      params(["self", "skills", "pool"]),
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: "auth_not_configured" })
    expect(requestWithDomain).not.toHaveBeenCalled()
  })

  it("never forwards a browser-supplied scope header (identity from envelope only)", async () => {
    vi.mocked(requestWithDomain).mockResolvedValue(
      new Response('{"data":{"skills":[],"next_cursor":null}}', {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "req-scope" },
      }),
    )
    const { GET } = await import("@/app/api/hub/[...path]/route")

    await GET(
      new Request("http://localhost/api/hub/self/skills?scope_kind=personal", {
        headers: { cookie: sessionCookie(), "x-kokoro-namespace": "team_evil" },
      }),
      params(["self", "skills"]),
    )
    const [, domain, init] = vi.mocked(requestWithDomain).mock.calls[0] as [
      string,
      string,
      { headers: Record<string, string> },
    ]
    expect(domain).toBe("dev.kokoro.localhost")
    expect(init.headers["x-kokoro-namespace"]).toBeUndefined()
    // The helper is mocked here; wire-level Forwarded injection is covered by
    // tests/server/upstream-http.test.ts rather than duplicated in the route.
    expect(init.headers.forwarded).toBeUndefined()
  })

  it("returns 401 when there is no envelope", async () => {
    currentProductSession.mockResolvedValueOnce(null)
    vi.stubGlobal("fetch", vi.fn())
    const { GET } = await import("@/app/api/hub/[...path]/route")
    const res = await GET(new Request("http://localhost/api/hub/self/skills/pool"), params(["self", "skills", "pool"]))
    expect(res.status).toBe(401)
  })

  it("rejects a cross-origin mutation (POST) even with a valid envelope", async () => {
    vi.stubGlobal("fetch", vi.fn())
    const { POST } = await import("@/app/api/hub/[...path]/route")
    const res = await POST(
      new Request("http://localhost/api/hub/self/skills/x/disable", {
        method: "POST",
        headers: { cookie: sessionCookie(), origin: "http://evil.test" },
      }),
      params(["self", "skills", "x", "disable"]),
    )
    expect(res.status).toBe(403)
  })

  it("keeps formal Skill draft/Publish commands on a typed no-store owner boundary", async () => {
    const { POST } = await import("@/app/api/hub/[...path]/route")
    const draftPath = params(["self", "skills", "drafts"])
    const draftUrl = "http://localhost/api/hub/self/skills/drafts"
    delete process.env.KOKORO_WEB_AUTH_SECRET
    const config = await POST(new Request(draftUrl, { method: "POST", headers: { "idempotency-key": "draft-key", "content-type": "application/json" }, body: "{}" }), draftPath)
    expect(config.status).toBe(503)
    expect(config.headers.get("cache-control")).toBe("no-store")
    expect(await config.json()).toMatchObject({ error: { code: "product_tenant_not_configured", retryable: false } })
    process.env.KOKORO_WEB_AUTH_SECRET = ENV.KOKORO_WEB_AUTH_SECRET

    const wrongOrigin = await POST(new Request(draftUrl, { method: "POST", headers: { origin: "https://evil.example", "idempotency-key": "draft-key", "content-type": "application/json" }, body: "{}" }), draftPath)
    expect(wrongOrigin.status).toBe(403)
    expect(await wrongOrigin.json()).toMatchObject({ error: { code: "session_forbidden" } })

    const publishPath = params(["self", "skills", "mine", "publish"])
    const publishUrl = "http://localhost/api/hub/self/skills/mine/publish"
    const nonempty = await POST(new Request(publishUrl, { method: "POST", headers: { "idempotency-key": "publish-key" }, body: "{}" }), publishPath)
    expect(nonempty.status).toBe(400)
    expect(await nonempty.json()).toMatchObject({ error: { code: "invalid_skill_request" } })
    expect(requestWithDomain).not.toHaveBeenCalled()

    vi.mocked(requestWithDomain).mockResolvedValueOnce(new Response('{"data":{"source_ref":"skill:mine","revision":"1","status":"active","event_id":"550e8400-e29b-41d4-a716-446655440000","replayed":false}}', {
      status: 200, headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "owner-publish" },
    }))
    const published = await POST(new Request(publishUrl, { method: "POST", headers: { "idempotency-key": "publish-key" } }), publishPath)
    expect(published.status).toBe(200)
    expect(published.headers.get("x-request-id")).toBe("owner-publish")
    expect(published.headers.get("cache-control")).toBe("no-store")
    const [, , init] = vi.mocked(requestWithDomain).mock.calls[0] as [string, string, { body?: ArrayBuffer; headers: Record<string, string> }]
    expect(init.body?.byteLength).toBe(0)
    expect(init.headers["idempotency-key"]).toBe("publish-key")
    expect(init.headers["content-type"]).toBeUndefined()
  })

  it("rejects a non-JSON formal command owner response before the browser sees it", async () => {
    const { POST } = await import("@/app/api/hub/[...path]/route")
    vi.mocked(requestWithDomain).mockResolvedValueOnce(new Response('{"data":{}}', { status: 201, headers: { "content-type": "text/plain", "cache-control": "no-store", "x-request-id": "owner-draft" } }))
    const response = await POST(new Request("http://localhost/api/hub/self/skills/drafts", { method: "POST", headers: { "idempotency-key": "draft-key", "content-type": "application/json" }, body: "{}" }), params(["self", "skills", "drafts"]))
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: { code: "skill_response_invalid" } })
  })

  it("does not forward retired multipart preview/confirm or GitHub pseudo-publish routes", async () => {
    const { POST } = await import("@/app/api/hub/[...path]/route")
    for (const path of [["self", "skills", "upload", "preview"], ["self", "skills", "upload", "confirm"], ["self", "skills", "github", "import"]]) {
      const response = await POST(new Request(`http://localhost/api/hub/${path.join("/")}`, { method: "POST", body: "unused" }), params(path))
      expect(response.status).toBe(404)
      expect(response.headers.get("cache-control")).toBe("no-store")
    }
    expect(requestWithDomain).not.toHaveBeenCalled()
  })
})
