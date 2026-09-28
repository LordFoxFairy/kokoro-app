import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { requestWithDomain } from "@/lib/server/upstream-http"

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

  it("keeps an accepted Artifact response alive when the framework request signal ends after handoff", async () => {
    const requestAbort = new AbortController()
    let releaseTail: (() => void) | undefined
    const tailReady = new Promise<void>((resolve) => { releaseTail = resolve })
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(new Uint8Array([1, 2]))
        await tailReady
        controller.enqueue(new Uint8Array([3, 4]))
        controller.close()
      },
    })
    vi.mocked(requestWithDomain).mockResolvedValue(new Response(body, { status: 200, headers: {
      "content-type": "application/octet-stream", "content-length": "4",
      "content-disposition": "attachment; filename=\"report.bin\"; filename*=UTF-8''report.bin",
      "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff",
      "x-request-id": "req_artifact_handoff",
    } }))
    const { GET } = await import("@/app/api/hub/[...path]/route")
    const response = await GET(new Request("http://localhost/api/hub/library/artifacts/conversation-1/artifact-1/content", {
      signal: requestAbort.signal,
    }), params(["library", "artifacts", "conversation-1", "artifact-1", "content"]))

    expect(response.status).toBe(200)
    requestAbort.abort(new DOMException("framework request lifetime ended", "AbortError"))
    releaseTail?.()
    await expect(response.arrayBuffer()).resolves.toEqual(new Uint8Array([1, 2, 3, 4]).buffer)
  })

  it("still cancels the Artifact upstream when the downstream response body is cancelled", async () => {
    let cancelledReason: unknown
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array([1, 2])) },
      cancel(reason) { cancelledReason = reason },
    })
    vi.mocked(requestWithDomain).mockResolvedValue(new Response(body, { status: 200, headers: {
      "content-type": "application/octet-stream", "content-length": "4",
      "content-disposition": "attachment; filename=\"report.bin\"; filename*=UTF-8''report.bin",
      "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff",
      "x-request-id": "req_artifact_cancel",
    } }))
    const { GET } = await import("@/app/api/hub/[...path]/route")
    const response = await GET(new Request("http://localhost/api/hub/library/artifacts/conversation-1/artifact-1/content"), params(["library", "artifacts", "conversation-1", "artifact-1", "content"]))
    const reason = new DOMException("browser disconnected", "AbortError")

    await response.body?.cancel(reason)
    expect(cancelledReason).toBe(reason)
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
      new Response('{"data":{"skills":[]}}', {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "public, max-age=3600",
        },
      }),
    )
    const { GET } = await import("@/app/api/hub/[...path]/route")

    const request = new Request("http://localhost/api/hub/self/skills/pool", {
      headers: { cookie: sessionCookie() },
    })
    const res = await GET(request, params(["self", "skills", "pool"]))
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("private, no-store")

    const [target, domain, init] = vi.mocked(requestWithDomain).mock.calls[0] as [
      string,
      string,
      { headers: Record<string, string>; signal: AbortSignal },
    ]
    expect(target).toBe("http://bff.test/v1/skills/pool")
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
      new Response('{"data":{"skills":[]}}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    const { GET } = await import("@/app/api/hub/[...path]/route")

    await GET(
      new Request("http://localhost/api/hub/self/skills/pool", {
        headers: { cookie: sessionCookie(), "x-kokoro-namespace": "team_evil" },
      }),
      params(["self", "skills", "pool"]),
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
})
