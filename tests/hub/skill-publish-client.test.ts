import { afterEach, expect, it, vi } from "vitest"

import { HubClientError } from "@/hub/client"
import { createSkillPublishClient } from "@/hub/skill-publish-client"
import { completeSkillUploadSchema, skillUploadStateSchema } from "@/hub/schemas"

it("accepts the actual Public13 Draft ACK including signed64 state_version", async () => {
  const draft = { skill_id: "mine", series_id: "series", revision: 1, status: "draft", replayed: false, state_version: "1" }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: draft }), { status: 201, headers })))
  await expect(createSkillPublishClient().createDraft({ display_name: "Mine", summary: "", tags: [] }, "draft-current")).resolves.toEqual(draft)
})

it("retains the actual signed PUT version ACK", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200, headers: { "x-amz-version-id": "object-version-1" } })))
  await expect(createSkillPublishClient("https://app.example/").putPackage(reference, new File(["zip"], "mine.zip"))).resolves.toEqual({ source_version_id: "object-version-1" })
})

afterEach(() => vi.unstubAllGlobals())

const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-request-id": "owner-1" }
const reference = { url: "https://objects.example/put?signature=TOKEN", method: "PUT" as const, required_headers: { "content-type": "application/zip" as const }, expires_at: "2999-01-01T00:00:00Z" }

it("accepts final Proxy no-store directives for Draft and preserves authorization errors", async () => {
  const draft = { skill_id: "mine", series_id: "series", revision: 1, status: "draft", replayed: false, state_version: "1" }
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: draft }), { status: 201, headers: { ...headers, "cache-control": "private, no-store, max-age=0" } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "session_invalid", message: "revoked", retryable: false } }), { status: 401, headers: { ...headers, "cache-control": "private, no-store, max-age=0" } })))
  const client = createSkillPublishClient()
  await expect(client.createDraft({ display_name: "Mine", summary: "", tags: [] }, "create-key")).resolves.toEqual(draft)
  await expect(client.publishDraft("mine", { audience: "owner", expected_state_version: "4" }, "publish-key")).rejects.toMatchObject({ reason: "http", status: 401, code: "session_invalid" })
})

it("keeps no-store, media, request ID and receipt guards under final Proxy headers", async () => {
  const data = { source_ref: "skill:mine", revision: "2", status: "active", event_id: "550e8400-e29b-41d4-a716-446655440000", replayed: false, state_version: "5" }
  for (const overrides of [
    { "cache-control": "private, max-age=0" }, { "cache-control": "x-no-store" },
    { "cache-control": 'extension="value, no-store, value"' }, { "cache-control": "no-store=1" },
    { "content-type": "text/plain" }, { "x-request-id": "invalid request id" },
  ]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data }), { status: 200, headers: { ...headers, "cache-control": "private, no-store, max-age=0", ...overrides } })))
    await expect(createSkillPublishClient().publishDraft("mine", { audience: "owner", expected_state_version: "4" }, "key")).rejects.toMatchObject({ reason: "parse", status: 200 })
  }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { ...data, unexpected: true } }), { status: 200, headers: { ...headers, "cache-control": "private, no-store, max-age=0" } })))
  await expect(createSkillPublishClient().publishDraft("mine", { audience: "owner", expected_state_version: "4" }, "key")).rejects.toMatchObject({ reason: "parse", status: 200 })
})

it("sends the exact explicit JSON Publish command with one stable key and strict ACTIVE receipt", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { source_ref: "skill:mine", revision: "2", status: "active", event_id: "550e8400-e29b-41d4-a716-446655440000", replayed: false, state_version: "5" } }), { status: 200, headers }))
  vi.stubGlobal("fetch", fetchMock)
  const receipt = await createSkillPublishClient().publishDraft("mine", { audience: "owner", expected_state_version: "4" }, "skill-web:key")
  expect(receipt.source_ref).toBe("skill:mine")
  expect(fetchMock).toHaveBeenCalledWith("/api/hub/self/skills/mine/publish", expect.objectContaining({ method: "POST", cache: "no-store", redirect: "error", headers: { "content-type": "application/json", "idempotency-key": "skill-web:key" } }))
  expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toEqual({ audience: "owner", expected_state_version: "4" })
})

it("maps Draft/Get/Begin/Complete/Validate to the pinned same-origin paths and statuses", async () => {
  const sha = "a".repeat(64)
  const responses = [
    [201, { skill_id: "mine", series_id: "series", revision: 1, status: "draft", replayed: false, state_version: "1" }],
    [200, { skill_id: "mine", attempt_epoch: "0", phase: "none", state_version: "1" }],
    [201, { skill_id: "mine", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", transfer_reference: reference, replayed: false, state_version: "2" }],
    [200, { skill_id: "mine", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", phase: "uploaded", replayed: false, content_sha256: sha, scan_state: "pending", state_version: "3" }],
    [200, { skill_id: "mine", series_id: "series", valid: true, content_digest: sha, manifest_identity: `skill-md-v1:sha256:${sha}`, replayed: false, state_version: "4" }],
  ] as const
  const fetchMock = vi.fn()
  for (const [status, data] of responses) fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data }), { status, headers }))
  vi.stubGlobal("fetch", fetchMock)
  const client = createSkillPublishClient()
  await client.createDraft({ display_name: "Mine", summary: "", tags: [] }, "create-key")
  await client.getUpload("mine")
  await client.beginUpload("mine", { expected_state_version: "1", filename: "mine.zip", mime_type: "application/zip", size_bytes: 3, content_sha256: sha }, "begin-key")
  await client.completeUpload("mine", { expected_state_version: "2", source_version_id: "object-version-1", attempt_id: "attempt", upload_id: "upload", content_sha256: sha, size_bytes: 3 }, "complete-key")
  await client.validateDraft("mine", { attempt_id: "attempt", expected_state_version: "3" }, "validate-key")
  expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
    "/api/hub/self/skills/drafts", "/api/hub/self/skills/mine/package-upload", "/api/hub/self/skills/mine/package-upload",
    "/api/hub/self/skills/mine/package-upload/complete", "/api/hub/self/skills/mine/validate",
  ])
  expect(fetchMock.mock.calls.map(([, init]) => init?.headers?.["idempotency-key"])).toEqual(["create-key", undefined, "begin-key", "complete-key", "validate-key"])
  expect(JSON.parse(fetchMock.mock.calls[4]![1].body)).toEqual({ attempt_id: "attempt", expected_state_version: "3" })
})

it("PUTs original bytes only to a safe short-lived transfer reference, without credentials or redirects", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204, headers: { "x-amz-version-id": "object-version-1" } }))
  vi.stubGlobal("fetch", fetchMock)
  const file = new File(["raw"], "one.zip", { type: "application/zip" })
  await createSkillPublishClient("https://app.example/skills").putPackage(reference, file)
  expect(fetchMock).toHaveBeenCalledWith(reference.url, expect.objectContaining({ method: "PUT", body: file, credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", headers: { "content-type": "application/zip" } }))
  expect(Object.keys(fetchMock.mock.calls[0]![1].headers)).toEqual(["content-type"])
})

it("rejects mixed content, remote HTTP, URL credentials/fragments and expired references before PUT", async () => {
  const fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
  const file = new File(["raw"], "one.zip")
  const client = createSkillPublishClient("https://app.example/skills")
  for (const url of ["http://127.0.0.1:9000/put", "http://objects.example/put", "https://user:pass@objects.example/put", "https://objects.example/put#fragment"]) {
    await expect(client.putPackage({ ...reference, url }, file)).rejects.toBeInstanceOf(HubClientError)
  }
  await expect(client.putPackage({ ...reference, expires_at: "2020-01-01T00:00:00Z" }, file)).rejects.toBeInstanceOf(HubClientError)
  expect(fetchMock).not.toHaveBeenCalled()
})

it("permits only local HTTP page to local HTTP ObjectStore in development", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200, headers: { "x-amz-version-id": "object-version-1" } }))
  vi.stubGlobal("fetch", fetchMock)
  const file = new File(["raw"], "one.zip")
  await createSkillPublishClient("http://127.0.0.1:3310/skills").putPackage({ ...reference, url: "http://127.0.0.1:9000/put" }, file)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  await expect(createSkillPublishClient("http://app.example/skills").putPackage({ ...reference, url: "http://127.0.0.1:9000/put" }, file)).rejects.toBeInstanceOf(HubClientError)
})

it("rejects text/plain JSON and malformed success/error envelopes", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { source_ref: "skill:mine", revision: "2", status: "active", event_id: "550e8400-e29b-41d4-a716-446655440000", replayed: false, state_version: "5" } }), { status: 200, headers: { ...headers, "content-type": "text/plain" } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "unknown_code", message: "No", retryable: false } }), { status: 503, headers }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "skill_dependency_unavailable", message: "No", retryable: true } }), { status: 500, headers }))
  vi.stubGlobal("fetch", fetchMock)
  const client = createSkillPublishClient()
  await expect(client.publishDraft("mine", { audience: "owner", expected_state_version: "4" }, "key")).rejects.toMatchObject({ reason: "parse" })
  await expect(client.publishDraft("mine", { audience: "owner", expected_state_version: "4" }, "key")).rejects.toMatchObject({ reason: "parse" })
  await expect(client.publishDraft("mine", { audience: "owner", expected_state_version: "4" }, "key")).rejects.toMatchObject({ reason: "parse" })
})

it("rejects infected/fake-complete or stale upload phase shapes before Publish", () => {
  const complete = { skill_id: "mine", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", phase: "uploaded", replayed: false, content_sha256: "a".repeat(64), scan_state: "clean", state_version: "3" }
  expect(completeSkillUploadSchema.safeParse({ ...complete, scan_state: "infected" }).success).toBe(false)
  expect(completeSkillUploadSchema.safeParse({ ...complete, phase: "validated" }).success).toBe(false)
  expect(skillUploadStateSchema.safeParse({ skill_id: "mine", attempt_epoch: "0", phase: "none", attempt_id: "old" }).success).toBe(false)
  expect(skillUploadStateSchema.safeParse({ skill_id: "mine", attempt_epoch: "2", phase: "upload_pending", attempt_id: "old" }).success).toBe(false)
})

it("propagates cancellation to the authoritative by-ID recovery GET", async () => {
  const controller = new AbortController()
  const fetchMock = vi.fn().mockImplementation((_path: string, init: RequestInit) => {
    expect(init.signal?.aborted).toBe(false)
    controller.abort()
    expect(init.signal?.aborted).toBe(true)
    return Promise.reject(new DOMException("cancelled", "AbortError"))
  })
  vi.stubGlobal("fetch", fetchMock)
  await expect(createSkillPublishClient().getPublished("mine", controller.signal)).rejects.toMatchObject({ reason: "aborted" })
  expect(fetchMock).toHaveBeenCalledWith("/api/hub/self/skills/managed/mine", expect.objectContaining({ signal: expect.any(AbortSignal) }))
})


it("accepts the unique Public13 SKILL.md Validate receipt from a real Response", async () => {
  const sha = "a".repeat(64)
  const receipt = { skill_id: "mine", series_id: "series", valid: true, content_digest: sha, manifest_identity: `skill-md-v1:sha256:${sha}`, replayed: false, state_version: "4" }
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: receipt }), {
    status: 200, headers: { ...headers, "cache-control": "private, no-store, max-age=0" },
  }))
  vi.stubGlobal("fetch", fetchMock)
  const signal = new AbortController().signal
  await expect(createSkillPublishClient().validateDraft("mine", { attempt_id: "attempt", expected_state_version: "3" }, "validate-key", signal)).resolves.toEqual(receipt)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith("/api/hub/self/skills/mine/validate", expect.objectContaining({
    method: "POST", cache: "no-store", redirect: "error", signal: expect.any(AbortSignal),
    headers: { "content-type": "application/json", "idempotency-key": "validate-key" },
    body: JSON.stringify({ attempt_id: "attempt", expected_state_version: "3" }),
  }))
  expect(fetchMock.mock.calls.some(([path]) => path.endsWith("/publish"))).toBe(false)
})

it("rejects the removed ZIP V1 Validate receipt instead of accepting a legacy format", async () => {
  const sha = "a".repeat(64)
  const receipt = { skill_id: "mine", series_id: "series", valid: true, content_digest: sha, manifest_identity: `zip-v1:sha256:${sha}`, replayed: false, state_version: "4" }
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: receipt }), { status: 200, headers }))
  vi.stubGlobal("fetch", fetchMock)
  await expect(createSkillPublishClient().validateDraft("mine", { attempt_id: "attempt", expected_state_version: "3" }, "validate-key")).rejects.toMatchObject({ reason: "parse", status: 200 })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith("/api/hub/self/skills/mine/validate", expect.objectContaining({ body: JSON.stringify({ attempt_id: "attempt", expected_state_version: "3" }) }))
  expect(fetchMock.mock.calls.some(([path]) => path.endsWith("/publish"))).toBe(false)
})


it("preserves closed Validate fields and identity/header guards under the unique V2 format", async () => {
  const sha = "a".repeat(64)
  const receipt = { skill_id: "mine", series_id: "series", valid: true, content_digest: sha, manifest_identity: `skill-md-v1:sha256:${sha}`, replayed: false, state_version: "4" }
  const invalid = [
    { ...receipt, manifest_identity: `skill-md-v1:sha256:${"A".repeat(64)}` },
    { ...receipt, manifest_identity: `skill-md-v1:sha256:${"a".repeat(63)}` },
    { ...receipt, manifest_identity: `skill-md-v1:sha256:${"g".repeat(64)}` },
    { ...receipt, manifest_identity: `zip-v3:sha256:${sha}` },
    { ...receipt, unexpected: true }, { ...receipt, valid: false },
  ]
  for (const data of invalid) {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data }), { status: 200, headers }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(createSkillPublishClient().validateDraft("mine", { attempt_id: "attempt", expected_state_version: "3" }, "validate-key")).rejects.toMatchObject({ reason: "parse", status: 200 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  }
  for (const overrides of [{ "cache-control": "private, max-age=0" }, { "content-type": "text/plain" }, { "x-request-id": "invalid request id" }]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: receipt }), { status: 200, headers: { ...headers, ...overrides } })))
    await expect(createSkillPublishClient().validateDraft("mine", { attempt_id: "attempt", expected_state_version: "3" }, "validate-key")).rejects.toMatchObject({ reason: "parse", status: 200 })
  }
})

it("preserves the actual command-only 403 skill_forbidden without broadening other statuses", async () => {
  for (const status of [403, 400, 503]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "skill_forbidden", message: "Denied", retryable: false } }), { status, headers })))
    await expect(createSkillPublishClient().createDraft({ display_name: "Mine", summary: "", tags: [] }, "key")).rejects.toMatchObject(status === 403 ? { reason: "http", code: "skill_forbidden", status } : { reason: "parse", status })
  }
})

it("rejects oversized Skill ACK bodies before parsing them", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(" ".repeat(1_048_577), { status: 201, headers })))
  await expect(createSkillPublishClient().createDraft({ display_name: "Mine", summary: "", tags: [] }, "key")).rejects.toMatchObject({ reason: "parse", status: 201 })
})

it("accepts strict managed metadata and binds its request ID", async () => {
  const data = { skill_id: "mine", source_ref: "skill:mine", series_id: "series", revision: "1", name: "Mine", summary: "", tags: [], status: "draft", skill_updated_at: "2026-10-10T00:00:00Z", example_prompts: [], category_keys: [], product: { state_version: "1", publication_audience: "owner" } }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data, meta: { request_id: "owner-1" } }), { status: 200, headers })).mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "skill_not_found", message: "Missing" }, meta: { request_id: "owner-1" } }), { status: 404, headers })))
  await expect(createSkillPublishClient().getManaged("mine")).resolves.toEqual(data)
  await expect(createSkillPublishClient().getManaged("mine")).rejects.toMatchObject({ reason: "http", code: "skill_not_found", status: 404 })
})

it("cancels an in-progress ACK body without accepting a late result", async () => {
  const controller = new AbortController()
  let started!: () => void
  const reading = new Promise<void>((resolve) => { started = resolve })
  const stream = new ReadableStream<Uint8Array>({ pull() { started() } })
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream, { status: 201, headers })))
  const request = createSkillPublishClient().createDraft({ display_name: "Mine", summary: "", tags: [] }, "key", controller.signal)
  await reading
  controller.abort()
  await expect(request).rejects.toMatchObject({ reason: "aborted" })
})

it.each([null, "null", "", "bad value", "a".repeat(1025)])("rejects invalid actual PUT version ACK %s instead of substituting ETag", async (version) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200, headers: { etag: '"digest"', ...(version === null ? {} : { "x-amz-version-id": version }) } })))
  await expect(createSkillPublishClient("https://app.example/").putPackage(reference, new File(["zip"], "mine.zip"))).rejects.toMatchObject({ reason: "parse" })
})

it.each(["0", "01", "-1", "9223372036854775808", "1.0"])("rejects noncanonical or oversized state_version %s in current ACK", async (state_version) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { skill_id: "mine", series_id: "series", revision: 1, status: "draft", replayed: false, state_version } }), { status: 201, headers })))
  await expect(createSkillPublishClient().createDraft({ display_name: "Mine", summary: "", tags: [] }, "key")).rejects.toMatchObject({ reason: "parse" })
})

it("accepts owner Github provenance with its genuinely optional asset_ref", async () => {
  const provenance = { kind: "github", repository_id: "repo", repository_url: "https://github.example/org/repo", owner_login: "org", owner_url: "https://github.example/org", commit: "a".repeat(40), path: "", content_sha256: "b".repeat(64), size_bytes: "3", mime_type: "application/zip" }
  const data = { skill_id: "mine", source_ref: "skill:mine", series_id: "series", revision: "1", name: "Mine", summary: "", tags: [], status: "draft", skill_updated_at: "2026-10-10T00:00:00Z", example_prompts: [], category_keys: [], product: { state_version: "1", publication_audience: "owner", publisher: { kind: "github_repository", github_repository: provenance }, creation_provenance: provenance } }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data, meta: { request_id: "owner-1" } }), { status: 200, headers })))
  await expect(createSkillPublishClient().getManaged("mine")).resolves.toEqual(data)
})

it("ends a stalled signed PUT with a finite deadline and no synthetic version", async () => {
  vi.useFakeTimers()
  try {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("deadline", "AbortError")), { once: true })
    })))
    const request = createSkillPublishClient("https://app.example/").putPackage(reference, new File(["zip"], "mine.zip"))
    const outcome = expect(request).rejects.toMatchObject({ reason: "network" })
    await vi.advanceTimersByTimeAsync(60000)
    await outcome
  } finally { vi.useRealTimers() }
})

it("does not broaden Get or managed error families with command-only skill_forbidden", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "skill_forbidden", message: "Denied", retryable: false } }), { status: 403, headers })).mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "skill_forbidden", message: "Denied" }, meta: { request_id: "owner-1" } }), { status: 403, headers })))
  await expect(createSkillPublishClient().getUpload("mine")).rejects.toMatchObject({ reason: "parse", status: 403 })
  await expect(createSkillPublishClient().getManaged("mine")).rejects.toMatchObject({ reason: "parse", status: 403 })
})

// Public13.1 operation/status contracts: every allowed pair and every cross-status mismatch.
const operationErrorPairs: Record<string, Record<number, readonly string[]>> = {
  "createDraft": {
    "400": [
      "invalid_skill_request",
      "idempotency_key_required",
      "invalid_idempotency_key"
    ],
    "401": [
      "session_authentication_required",
      "session_invalid"
    ],
    "403": [
      "service_auth_failed",
      "session_forbidden",
      "product_tenant_forbidden",
      "skill_forbidden"
    ],
    "409": [
      "skill_idempotency_conflict",
      "skill_command_in_progress"
    ],
    "412": [
      "skill_precondition_failed"
    ],
    "413": [
      "request_body_too_large"
    ],
    "429": [
      "session_rate_limited",
      "skill_rate_limited"
    ],
    "502": [
      "skill_response_invalid"
    ],
    "503": [
      "product_tenant_not_configured",
      "iam_admission_unavailable",
      "skill_dependency_unavailable"
    ]
  },
  "getUpload": {
    "400": [
      "invalid_skill_request"
    ],
    "401": [
      "session_authentication_required",
      "session_invalid"
    ],
    "403": [
      "service_auth_failed",
      "session_forbidden",
      "product_tenant_forbidden"
    ],
    "404": [
      "skill_not_found"
    ],
    "412": [
      "skill_precondition_failed"
    ],
    "429": [
      "session_rate_limited",
      "skill_rate_limited"
    ],
    "502": [
      "skill_response_invalid"
    ],
    "503": [
      "product_tenant_not_configured",
      "iam_admission_unavailable",
      "skill_dependency_unavailable"
    ]
  },
  "beginUpload": {
    "400": [
      "invalid_skill_request",
      "idempotency_key_required",
      "invalid_idempotency_key"
    ],
    "401": [
      "session_authentication_required",
      "session_invalid"
    ],
    "403": [
      "service_auth_failed",
      "session_forbidden",
      "product_tenant_forbidden",
      "skill_forbidden"
    ],
    "404": [
      "skill_not_found"
    ],
    "409": [
      "skill_idempotency_conflict",
      "skill_command_in_progress"
    ],
    "412": [
      "skill_precondition_failed"
    ],
    "413": [
      "request_body_too_large"
    ],
    "429": [
      "session_rate_limited",
      "skill_rate_limited"
    ],
    "502": [
      "skill_response_invalid"
    ],
    "503": [
      "product_tenant_not_configured",
      "iam_admission_unavailable",
      "skill_dependency_unavailable"
    ]
  },
  "completeUpload": {
    "400": [
      "invalid_skill_request",
      "idempotency_key_required",
      "invalid_idempotency_key"
    ],
    "401": [
      "session_authentication_required",
      "session_invalid"
    ],
    "403": [
      "service_auth_failed",
      "session_forbidden",
      "product_tenant_forbidden",
      "skill_forbidden"
    ],
    "404": [
      "skill_not_found"
    ],
    "409": [
      "skill_idempotency_conflict",
      "skill_command_in_progress"
    ],
    "412": [
      "skill_precondition_failed"
    ],
    "413": [
      "request_body_too_large"
    ],
    "429": [
      "session_rate_limited",
      "skill_rate_limited"
    ],
    "502": [
      "skill_response_invalid"
    ],
    "503": [
      "product_tenant_not_configured",
      "iam_admission_unavailable",
      "skill_dependency_unavailable"
    ]
  },
  "validateDraft": {
    "400": [
      "invalid_skill_request",
      "idempotency_key_required",
      "invalid_idempotency_key"
    ],
    "401": [
      "session_authentication_required",
      "session_invalid"
    ],
    "403": [
      "service_auth_failed",
      "session_forbidden",
      "product_tenant_forbidden",
      "skill_forbidden"
    ],
    "404": [
      "skill_not_found"
    ],
    "409": [
      "skill_idempotency_conflict",
      "skill_command_in_progress"
    ],
    "412": [
      "skill_precondition_failed"
    ],
    "413": [
      "request_body_too_large"
    ],
    "429": [
      "session_rate_limited",
      "skill_rate_limited"
    ],
    "502": [
      "skill_response_invalid"
    ],
    "503": [
      "product_tenant_not_configured",
      "iam_admission_unavailable",
      "skill_dependency_unavailable"
    ]
  },
  "publishDraft": {
    "400": [
      "invalid_skill_request",
      "idempotency_key_required",
      "invalid_idempotency_key"
    ],
    "401": [
      "session_authentication_required",
      "session_invalid"
    ],
    "403": [
      "service_auth_failed",
      "session_forbidden",
      "product_tenant_forbidden",
      "skill_forbidden"
    ],
    "404": [
      "skill_not_found"
    ],
    "409": [
      "skill_idempotency_conflict",
      "skill_command_in_progress"
    ],
    "412": [
      "skill_precondition_failed"
    ],
    "413": [
      "request_body_too_large"
    ],
    "429": [
      "session_rate_limited",
      "skill_rate_limited"
    ],
    "502": [
      "skill_response_invalid"
    ],
    "503": [
      "product_tenant_not_configured",
      "iam_admission_unavailable",
      "skill_dependency_unavailable"
    ]
  },
  "managedList": {
    "400": [
      "invalid_skill_request"
    ],
    "401": [
      "session_authentication_required",
      "session_invalid"
    ],
    "403": [
      "service_auth_failed",
      "session_forbidden",
      "product_tenant_forbidden"
    ],
    "429": [
      "session_rate_limited"
    ],
    "502": [
      "skill_response_invalid"
    ],
    "503": [
      "product_tenant_not_configured",
      "iam_admission_unavailable",
      "skill_dependency_unavailable"
    ]
  },
  "managedDetail": {
    "400": [
      "invalid_skill_request"
    ],
    "401": [
      "session_authentication_required",
      "session_invalid"
    ],
    "403": [
      "service_auth_failed",
      "session_forbidden",
      "product_tenant_forbidden"
    ],
    "404": [
      "skill_not_found"
    ],
    "429": [
      "session_rate_limited"
    ],
    "502": [
      "skill_response_invalid"
    ],
    "503": [
      "product_tenant_not_configured",
      "iam_admission_unavailable",
      "skill_dependency_unavailable"
    ]
  }
}
const errorCalls = {
  createDraft: () => createSkillPublishClient().createDraft({ display_name: "Mine", summary: "", tags: [] }, "key"),
  getUpload: () => createSkillPublishClient().getUpload("mine"),
  beginUpload: () => createSkillPublishClient().beginUpload("mine", { expected_state_version: "1", filename: "mine.zip", mime_type: "application/zip", size_bytes: 3, content_sha256: "a".repeat(64) }, "key"),
  completeUpload: () => createSkillPublishClient().completeUpload("mine", { expected_state_version: "2", source_version_id: "version", attempt_id: "attempt", upload_id: "upload", content_sha256: "a".repeat(64), size_bytes: 3 }, "key"),
  validateDraft: () => createSkillPublishClient().validateDraft("mine", { attempt_id: "attempt", expected_state_version: "3" }, "key"),
  publishDraft: () => createSkillPublishClient().publishDraft("mine", { audience: "owner", expected_state_version: "4" }, "key"),
  managedList: () => createSkillPublishClient().listDrafts(),
  managedDetail: () => createSkillPublishClient().getManaged("mine"),
  activeList: () => createSkillPublishClient().listPublished(),
  activeDetail: () => createSkillPublishClient().getPublished("mine"),
}
for (const [operation, call] of Object.entries(errorCalls)) {
  const managed = ["managedList", "managedDetail", "activeList", "activeDetail"].includes(operation)
  const pairs = operationErrorPairs[operation === "activeList" ? "managedList" : operation === "activeDetail" ? "managedDetail" : operation]!
  const codes = [...new Set(Object.values(operationErrorPairs).flatMap((statuses) => Object.values(statuses).flat()))]
  it(`${operation} enforces every exact Public13.1 code/status pair`, async () => {
    for (const status of [400, 401, 403, 404, 409, 412, 413, 429, 502, 503, 418]) {
      for (const code of [...codes, "unexpected_owner_code"]) {
        const body = managed ? { error: { code, message: "rejected" }, meta: { request_id: "owner-1" } } : { error: { code, message: "rejected", retryable: false } }
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers })))
        await expect(call()).rejects.toMatchObject(pairs[status]?.includes(code) ? { reason: "http", status, code } : { reason: "parse", status, code: null })
      }
    }
  })
}

it("cancels the unused PUT ACK body, including streams which never close", async () => {
  const cancel = vi.fn()
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }), { headers: { "x-amz-version-id": "real-version" } })))
  await expect(createSkillPublishClient().putPackage(reference, new File(["zip"], "mine.zip"))).resolves.toEqual({ source_version_id: "real-version" })
  expect(cancel).toHaveBeenCalledOnce()
})

it("personal lifecycle consumes actual version initial CAS and exact withdrawal ACK", async () => {
  const created = { skill_id: "new-revision", series_id: "series", revision: "2", status: "draft", replayed: false, state_version: "1" }
  const withdrawn = { source_ref: "skill:mine", status: "withdrawn", event_id: `evt:${"a".repeat(64)}`, replayed: false, state_version: "5" }
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ data: created, meta: { request_id: "owner-1" } }, { status: 201, headers }))
    .mockResolvedValueOnce(Response.json({ data: withdrawn, meta: { request_id: "owner-1" } }, { headers }))
  vi.stubGlobal("fetch", fetcher)
  const client = createSkillPublishClient()
  await expect(client.createVersion("mine", { display_name: "Mine", summary: "", tags: [], example_prompts: ["真实例子"], category_keys: [] }, "version-key")).resolves.toEqual(created)
  await expect(client.withdraw("mine", { reason: "由本人撤回", expected_state_version: "4" }, "withdraw-key")).resolves.toEqual(withdrawn)
  expect(fetcher.mock.calls[0]?.[0]).toContain("/self/skills/mine/versions")
  expect(fetcher.mock.calls[1]?.[0]).toContain("/self/skills/mine/withdraw")
})

it.each([ [400,"skill_command_in_progress"], [403,"skill_precondition_failed"], [502,"session_invalid"] ] as const)("personal lifecycle rejects mismatched %s/%s without generic enum widening", async (status,code)=>{
 const headers={"content-type":"application/json","cache-control":"no-store","x-request-id":"owner-1"}
 vi.stubGlobal("fetch",vi.fn().mockImplementation(()=>Promise.resolve(Response.json({error:{code,message:"Rejected"},meta:{request_id:"owner-1"}},{status,headers}))))
 const client=createSkillPublishClient()
 await expect(client.createVersion("mine",{display_name:"Mine",summary:"",tags:[],example_prompts:[],category_keys:[]},"version-original")).rejects.toMatchObject({reason:"parse"})
 await expect(client.withdraw("mine",{reason:"本人撤回",expected_state_version:"4"},"withdraw-original")).rejects.toMatchObject({reason:"parse"})
})
it("personal lifecycle preserves its no-retryable error envelope and rejects legacy extra fields", async()=>{
 const headers={"content-type":"application/json","cache-control":"no-store","x-request-id":"owner-1"}
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({error:{code:"skill_not_found",message:"Not owned"},meta:{request_id:"owner-1"}},{status:404,headers})).mockResolvedValueOnce(Response.json({error:{code:"skill_not_found",message:"Not owned",retryable:false},meta:{request_id:"owner-1"}},{status:404,headers}))
 vi.stubGlobal("fetch",fetcher)
 const client=createSkillPublishClient()
 await expect(client.withdraw("mine",{reason:"本人撤回",expected_state_version:"4"},"withdraw-original")).rejects.toMatchObject({reason:"http",status:404,code:"skill_not_found"})
 await expect(client.withdraw("mine",{reason:"本人撤回",expected_state_version:"4"},"withdraw-original")).rejects.toMatchObject({reason:"parse"})
})
it.each([ ["skill:other","5"], ["skill:mine","4"] ])("withdrawal rejects resource/CAS mismatch %s %s",async(source_ref,state_version)=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({data:{source_ref,state_version,status:"withdrawn",event_id:`evt:${"a".repeat(64)}`,replayed:false},meta:{request_id:"owner-1"}},{headers:{"content-type":"application/json","cache-control":"no-store","x-request-id":"owner-1"}})))
 await expect(createSkillPublishClient().withdraw("mine",{reason:"本人撤回",expected_state_version:"4"},"original")).rejects.toMatchObject({reason:"parse"})
})
it("withdrawal reason follows the formal 2048 code-point boundary, not UTF-16 code units",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({data:{source_ref:"skill:mine",state_version:"5",status:"withdrawn",event_id:`evt:${"a".repeat(64)}`,replayed:false},meta:{request_id:"owner-1"}},{headers:{"content-type":"application/json","cache-control":"no-store","x-request-id":"owner-1"}})))
 await expect(createSkillPublishClient().withdraw("mine",{reason:"😀".repeat(2048),expected_state_version:"4"},"reason-original")).resolves.toMatchObject({status:"withdrawn"})
})
it("personal lifecycle total deadline retires a stalled fetch and cancels a late response body",async()=>{
 vi.useFakeTimers()
 try {
  let resolveFetch: (response:Response)=>void = ()=>{throw new Error("fetch not started")}
  vi.stubGlobal("fetch",vi.fn().mockImplementation(()=>new Promise<Response>(resolve=>{resolveFetch=resolve})))
  let failure:unknown
  const pending=createSkillPublishClient().withdraw("mine",{reason:"本人撤回",expected_state_version:"4"},"original").catch(error=>{failure=error})
  await vi.advanceTimersByTimeAsync(10001)
  expect(failure).toMatchObject({reason:"network"})
  const cancel=vi.fn()
  resolveFetch(new Response(new ReadableStream({cancel}),{headers:{"content-type":"application/json","cache-control":"no-store","x-request-id":"owner-1"}}))
  await pending
  await Promise.resolve()
  expect(cancel).toHaveBeenCalledTimes(1)
 } finally {vi.useRealTimers()}
})

it("preserves exact history current instead of newest and rejects raw duplicate or extra private facts",async()=>{
 const versions=[{skill_id:"new",revision:"3",name:"New",summary:"",status:"disabled",archive_size:"375",file_count:1,created_at:"2026-10-21T00:00:00Z",is_current:false},{skill_id:"old",revision:"1",name:"Old",summary:"",status:"active",archive_size:"374",file_count:1,created_at:"2026-10-20T00:00:00Z",is_current:true}]
 const data={series_id:"series",publication:{current_version_id:"old",state_version:"7",withdrawn_at:null},versions,next_cursor:null}
 const raw=JSON.stringify({data,meta:{request_id:"owner-1"}})
 const fetcher=vi.fn().mockImplementation(()=>Promise.resolve(new Response(raw,{headers})))
 vi.stubGlobal("fetch",fetcher)
 await expect(createSkillPublishClient().listHistory("anchor","cursor/1")).resolves.toEqual(data)
 expect(fetcher).toHaveBeenCalledWith("/api/hub/self/skills/managed/anchor/versions?cursor=cursor%2F1",expect.objectContaining({method:"GET",cache:"no-store"}))
 for(const invalid of [raw.replace('"versions":[','"versions":[],"versions":['),raw.replace('"is_current":false','"is_current":true'),raw.replace('"publication":{','"publication":{"secret":"private",'),raw.replace('"request_id":"owner-1"','"request_id":"other"')]){
  fetcher.mockResolvedValueOnce(new Response(invalid,{headers}));await expect(createSkillPublishClient().listHistory("anchor")).rejects.toMatchObject({reason:"parse"})
 }
})

it("history cancellation finishes even when fetch ignores its signal",async()=>{
 const controller=new AbortController()
 let complete:((response:Response)=>void)|undefined
 const cancel=vi.fn()
 vi.stubGlobal("fetch",vi.fn(()=>new Promise<Response>(resolve=>{complete=resolve})))
 const pending=createSkillPublishClient().listHistory("anchor",undefined,controller.signal)
 const assertion=expect(pending).rejects.toMatchObject({reason:"aborted"})
 controller.abort();await assertion
 complete!(new Response(new ReadableStream({cancel})))
 await vi.waitFor(()=>expect(cancel).toHaveBeenCalledTimes(1))
})
