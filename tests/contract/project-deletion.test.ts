import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import YAML from "yaml"

const id = "project_12345678-1234-1234-1234-123456789abc"
const otherId = "project_abcdef12-1234-1234-1234-123456789abc"
const key = "project-delete:one-intent"
const snapshot = { project_id: id, logical_release_state: "pending", physical_cleanup_state: "pending" } as const
const accepted = { data: snapshot }
type Snapshot = Readonly<{ project_id: string; logical_release_state: "pending" | "blocked" | "released"; physical_cleanup_state: "pending" }>
type Wire = Readonly<{
  projectDeletionIdSchema: { safeParse(raw: unknown): { success: boolean } }
  projectDeletionKeySchema: { safeParse(raw: unknown): { success: boolean } }
  projectDeletionAcceptedMatches(input: Readonly<{ raw: unknown; projectId: string }>): boolean
  projectDeletionStatusMatches(input: Readonly<{ raw: unknown; projectId: string }>): boolean
  projectDeletionOwnerErrorAllowed(input: Readonly<{ method: "GET" | "DELETE"; status: number; code: string; retryable: boolean }>): boolean
}>
type Browser = Readonly<{
  deleteProject(intent: Readonly<{ projectId: string; idempotencyKey: string }>, signal: AbortSignal): Promise<Snapshot>
  getProjectDeletion(projectId: string, signal: AbortSignal): Promise<Snapshot>
}>
// Runtime imports intentionally keep missing future modules separate from the actual Hub semantic RED suite.
const wire = () => vi.importActual<Wire>("@/contract/project-deletion")
const browser = () => vi.importActual<Browser>("@/features/app/project-deletion")
const response = (raw: unknown = accepted, status = 202, headers?: HeadersInit) => Response.json(raw, {
  status, headers: { "cache-control": "private, no-store, max-age=0", "x-request-id": "request-id-1",
    ...(status === 202 ? { location: `/v1/projects/${id}/deletion` } : {}), ...Object.fromEntries(new Headers(headers)) },
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe("F1 fixed Public19 project deletion owner facts", () => {
  it("pins exact released owner bytes, bodyless methods and method-specific response sets", async () => {
    const bytes = await readFile(resolve(process.cwd(), "src/generated/bff-public-openapi.yaml"))
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("6574930b3a893a208596e6f27c2f9e09122e759d111a7fdbf2d54c294efc0e8f")
    const spec = YAML.parse(bytes.toString()) as {
      info: { version: string }
      paths: Record<string, { delete?: { operationId: string; requestBody?: unknown; responses: object; parameters: unknown[] }; get?: { operationId: string; requestBody?: unknown; responses: object } }>
      components: { parameters: Record<string, unknown>; schemas: Record<string, unknown>; responses: Record<string, unknown> }
    }
    expect(spec.info.version).toBe("20.0.0")
    const command = spec.paths["/v1/projects/{projectId}"]?.delete
    const status = spec.paths["/v1/projects/{projectId}/deletion"]?.get
    expect(command).toMatchObject({ operationId: "deleteProject", "x-kokoro-owner": "kokoro-bff", "x-kokoro-idempotency": "required" })
    expect(status).toMatchObject({ operationId: "getProjectDeletion", "x-kokoro-idempotency": "none" })
    expect(command?.requestBody).toBeUndefined()
    expect(status?.requestBody).toBeUndefined()
    expect(Object.keys(command?.responses ?? {})).toEqual(["202", "400", "401", "403", "404", "409", "429", "503"])
    expect(Object.keys(status?.responses ?? {})).toEqual(["200", "400", "401", "403", "404", "429", "503"])
    expect(command?.parameters).toEqual([{ $ref: "#/components/parameters/ProjectDeletionId" }, { $ref: "#/components/parameters/ProjectDeletionIdempotencyKey" }])
    expect(spec.components.parameters.ProjectDeletionIdempotencyKey).toMatchObject({ required: true, schema: { minLength: 1, maxLength: 128 } })
    expect(spec.components.schemas.ProjectDeletionAcceptedResource).toMatchObject({ additionalProperties: false, required: ["project_id", "logical_release_state", "physical_cleanup_state"], properties: { logical_release_state: { const: "pending" }, physical_cleanup_state: { const: "pending" } } })
    expect(spec.components.schemas.ProjectDeletionStatusResource).toMatchObject({ additionalProperties: false, properties: { logical_release_state: { enum: ["pending", "blocked", "released"] }, physical_cleanup_state: { const: "pending" } } })
    expect(spec.components.schemas.ProjectDeletionAcceptedResponse).toMatchObject({ additionalProperties: false, required: ["data"] })
    expect(spec.components.responses.ProjectDeletionRateLimited).toMatchObject({ headers: { "Retry-After": { required: false } } })
    expect(spec.components.responses.ProjectDeletionAccepted).toMatchObject({ headers: { Location: { required: true }, "Cache-Control": { required: true, schema: { const: "no-store" } } } })
  })
})

describe("F1 future deletion wire implementation gap (not Hub RED evidence)", () => {
  it("closes canonical IDs and operation keys without trimming or accepting commas", async () => {
    const m = await wire()
    expect(m.projectDeletionIdSchema.safeParse(id).success).toBe(true)
    expect(m.projectDeletionKeySchema.safeParse(key).success).toBe(true)
    for (const value of ["slug", id.toUpperCase(), `${id}\n`, `%70${id.slice(1)}`, ` ${id}`]) expect(m.projectDeletionIdSchema.safeParse(value).success).toBe(false)
    for (const value of ["", "a,b", " a", "a ", "a\n", "非ascii", "x".repeat(129)]) expect(m.projectDeletionKeySchema.safeParse(value).success).toBe(false)
    expect(m.projectDeletionKeySchema.safeParse("!".repeat(128)).success).toBe(true)
  })
  it("matches target and strict 202 pending receipt, with blocked/released reserved for status GET", async () => {
    const m = await wire()
    expect(m.projectDeletionAcceptedMatches({ raw: accepted, projectId: id })).toBe(true)
    for (const raw of [accepted.data, { ...accepted, meta: {} }, { data: { ...snapshot, extra: true } }, { data: { ...snapshot, project_id: otherId } }, { data: { ...snapshot, physical_cleanup_state: "released" } }]) {
      expect(m.projectDeletionAcceptedMatches({ raw, projectId: id })).toBe(false)
      expect(m.projectDeletionStatusMatches({ raw, projectId: id })).toBe(false)
    }
    for (const state of ["pending", "blocked", "released"]) {
      const raw = { data: { ...snapshot, logical_release_state: state } }
      expect(m.projectDeletionAcceptedMatches({ raw, projectId: id })).toBe(state === "pending")
      expect(m.projectDeletionStatusMatches({ raw, projectId: id })).toBe(true)
    }
  })
  it("closes the method/status/code/retryable matrix including GET exclusions and retryable 409 in-progress", async () => {
    const m = await wire()
    const shared: ReadonlyArray<readonly [number, string, boolean]> = [
      [400, "invalid_project_deletion_request", false], [401, "session_authentication_required", false], [401, "session_invalid", false],
      [403, "service_auth_failed", false], [403, "session_forbidden", false], [403, "product_tenant_forbidden", false],
      [404, "project_not_found", false], [429, "session_rate_limited", true],
      [503, "product_tenant_not_configured", true], [503, "iam_admission_unavailable", true], [503, "business_store_unavailable", true],
    ]
    for (const method of ["GET", "DELETE"] as const) for (const [status, code, retryable] of shared) {
      expect(m.projectDeletionOwnerErrorAllowed({ method, status, code, retryable })).toBe(true)
      expect(m.projectDeletionOwnerErrorAllowed({ method, status, code, retryable: !retryable })).toBe(false)
    }
    for (const [status, code, retryable] of [[400, "idempotency_key_required", false], [400, "invalid_idempotency_key", false], [409, "idempotency_conflict", false], [409, "idempotency_in_progress", true]] as const) {
      expect(m.projectDeletionOwnerErrorAllowed({ method: "DELETE", status, code, retryable })).toBe(true)
      expect(m.projectDeletionOwnerErrorAllowed({ method: "GET", status, code, retryable })).toBe(false)
    }
    expect(m.projectDeletionOwnerErrorAllowed({ method: "DELETE", status: 409, code: "idempotency_in_progress", retryable: false })).toBe(false)
    expect(m.projectDeletionOwnerErrorAllowed({ method: "DELETE", status: 500, code: "business_store_unavailable", retryable: true })).toBe(false)
    expect(m.projectDeletionOwnerErrorAllowed({ method: "GET", status: 404, code: "unknown", retryable: false })).toBe(false)
  })
})

describe("F1 future bodyless browser operations gap (not Hub RED evidence)", () => {
  it("validates invalid IDs/keys and pre-aborted intent with zero fetch", async () => {
    const m = await browser(), fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    for (const intent of [{ projectId: "slug", idempotencyKey: key }, { projectId: id, idempotencyKey: "bad,key" }]) await expect(m.deleteProject(intent, new AbortController().signal)).rejects.toMatchObject({ code: "invalid_project_deletion_request" })
    await expect(m.getProjectDeletion("slug", new AbortController().signal)).rejects.toMatchObject({ code: "invalid_project_deletion_request" })
    const aborted = new AbortController(); aborted.abort()
    await expect(m.deleteProject({ projectId: id, idempotencyKey: key }, aborted.signal)).rejects.toMatchObject({ code: "request_aborted" })
    await expect(m.getProjectDeletion(id, aborted.signal)).rejects.toMatchObject({ code: "request_aborted" })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it("sends one bodyless DELETE with the frozen key, then a fixed same-origin GET without following Location", async () => {
    const m = await browser()
    const fetchMock = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(response({ data: { ...snapshot, logical_release_state: "released" } }, 200))
    vi.stubGlobal("fetch", fetchMock)
    expect(await m.deleteProject({ projectId: id, idempotencyKey: key }, new AbortController().signal)).toEqual(snapshot)
    expect(await m.getProjectDeletion(id, new AbortController().signal)).toEqual({ ...snapshot, logical_release_state: "released" })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/hub/projects/${id}`)
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/hub/projects/${id}/deletion`)
    const command = fetchMock.mock.calls[0]?.[1] as RequestInit
    const read = fetchMock.mock.calls[1]?.[1] as RequestInit
    expect(command).toMatchObject({ method: "DELETE", cache: "no-store", signal: expect.any(AbortSignal) })
    expect(command.body).toBeUndefined()
    expect(new Headers(command.headers).get("idempotency-key")).toBe(key)
    expect(read).toMatchObject({ method: "GET", cache: "no-store", signal: expect.any(AbortSignal) })
    expect(read.body).toBeUndefined()
    expect(new Headers(read.headers).has("idempotency-key")).toBe(false)
  })
  it.each([409, 429, 503])("never auto-retries status %i or generates a replacement key", async (status) => {
    const m = await browser()
    const code = status === 409 ? "idempotency_in_progress" : status === 429 ? "session_rate_limited" : "business_store_unavailable"
    const fetchMock = vi.fn().mockImplementation(async () => response({ error: { code, message: code, retryable: true } }, status))
    vi.stubGlobal("fetch", fetchMock)
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(m.deleteProject({ projectId: id, idempotencyKey: key }, new AbortController().signal)).rejects.toMatchObject({ code, status })
      expect(fetchMock).toHaveBeenCalledTimes(attempt + 1)
      expect(new Headers((fetchMock.mock.calls[attempt]?.[1] as RequestInit).headers).get("idempotency-key")).toBe(key)
    }
  })
  it("rejects wrong target/Location/state, extra keys, duplicate JSON/BOM and malformed UTF-8 without producing accepted data", async () => {
    const m = await browser()
    const cases = [
      response({ data: { ...snapshot, project_id: otherId } }), response({ ...accepted, meta: {} }),
      response({ data: { ...snapshot, logical_release_state: "released" } }),
      response(accepted, 202, { location: `/v1/projects/${otherId}/deletion` }),
      new Response(`{"data":${JSON.stringify(snapshot)},"data":${JSON.stringify(snapshot)}}`, { status: 202, headers: response().headers }),
      new Response("\uFEFF" + JSON.stringify(accepted), { status: 202, headers: response().headers }),
      new Response(new Uint8Array([0xff]), { status: 202, headers: response().headers }),
    ]
    for (const value of cases) {
      const fetchMock = vi.fn().mockResolvedValue(value); vi.stubGlobal("fetch", fetchMock)
      await expect(m.deleteProject({ projectId: id, idempotencyKey: key }, new AbortController().signal)).rejects.toBeInstanceOf(Error)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    }
  })
  it("does not interpret GET 404, 409 or key errors as successful physical or logical deletion", async () => {
    const m = await browser()
    for (const [status, code, retryable] of [[404, "project_not_found", false], [409, "idempotency_in_progress", true], [400, "invalid_idempotency_key", false]] as const) {
      const fetchMock = vi.fn().mockResolvedValue(response({ error: { code, message: code, retryable } }, status)); vi.stubGlobal("fetch", fetchMock)
      await expect(m.getProjectDeletion(id, new AbortController().signal)).rejects.toMatchObject({ code: status === 404 ? code : "unexpected_status" })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    }
  })
  it("budgets complete response EOF and cancels an uncooperative stream without waiting for cancel", async () => {
    const m = await browser(); vi.useFakeTimers()
    const cancel = vi.fn(() => new Promise<void>(() => {}))
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(JSON.stringify(accepted))) }, cancel })
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 202, headers: response().headers })); vi.stubGlobal("fetch", fetchMock)
    const pending = m.deleteProject({ projectId: id, idempotencyKey: key }, new AbortController().signal)
    const assertion = expect(pending).rejects.toMatchObject({ code: "request_timeout" })
    await vi.advanceTimersByTimeAsync(10_001); await assertion
    expect(cancel).toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe("F3 actual Proxy final cache policy reaches real browser deletion consumers", () => {
  it.each([
    { method: "DELETE", status: 202, path: `/api/hub/projects/${id}` },
    { method: "GET", status: 200, path: `/api/hub/projects/${id}/deletion` },
  ] as const)("accepts legal $method $status after the real Proxy response-header projection", async ({ method, status, path }) => {
    const { NextRequest } = await import("next/server")
    const { proxy } = await vi.importActual<typeof import("@/proxy")>("@/proxy")
    const origin = "https://web.example.test"
    const projection = await proxy(new NextRequest(`${origin}${path}`, {
      method, headers: { host: "web.example.test", ...(method === "DELETE" ? { origin } : {}) },
    }))
    const cacheControl = projection.headers.get("cache-control")
    if (cacheControl === null) throw new Error("Actual Proxy did not provide its final API cache policy")
    const routeResponse = response({ data: snapshot }, status)
    const headers = new Headers(routeResponse.headers)
    // Next applies Proxy's response policy over the route response. Obtain the
    // real policy above; do not replace it with a duplicated test constant.
    headers.set("cache-control", cacheControl)
    const finalResponse = new Response(routeResponse.body, { status, headers })
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(finalResponse)
    vi.stubGlobal("fetch", fetchMock)
    const m = await browser()
    const result = method === "DELETE"
      ? m.deleteProject({ projectId: id, idempotencyKey: key }, new AbortController().signal)
      : m.getProjectDeletion(id, new AbortController().signal)
    try {
      await expect(result).resolves.toEqual(snapshot)
    } finally {
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(path, expect.objectContaining({ method, signal: expect.any(AbortSignal) }))
      const request = fetchMock.mock.calls[0]?.[1]
      expect(request?.body).toBeUndefined()
      expect(new Headers(request?.headers).get("idempotency-key")).toBe(method === "DELETE" ? key : null)
    }
  })
  it.each([
    { method: "DELETE", status: 202 },
    { method: "GET", status: 200 },
  ] as const)("rejects every non-exact browser cache policy for $method $status without retry", async ({ method, status }) => {
    const m = await browser()
    for (const cacheControl of [null, "private, no-store", "no-store", "public, no-store, max-age=0", "private, no-store, max-age=60", "private, no-store, max-age=0, must-revalidate", "no-cache"]) {
      const finalResponse = response({ data: snapshot }, status)
      if (cacheControl === null) finalResponse.headers.delete("cache-control")
      else finalResponse.headers.set("cache-control", cacheControl)
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(finalResponse)
      vi.stubGlobal("fetch", fetchMock)
      const result = method === "DELETE"
        ? m.deleteProject({ projectId: id, idempotencyKey: key }, new AbortController().signal)
        : m.getProjectDeletion(id, new AbortController().signal)
      await expect(result).rejects.toMatchObject({ code: "invalid_headers" })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const request = fetchMock.mock.calls[0]?.[1]
      expect(request?.method).toBe(method)
      expect(request?.body).toBeUndefined()
      expect(new Headers(request?.headers).get("idempotency-key")).toBe(method === "DELETE" ? key : null)
    }
  })
})
