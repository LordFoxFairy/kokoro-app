import { afterEach, expect, it, vi } from "vitest"

import { createProject, ProjectCreateError } from "@/features/app/project-create"
import { projectResponseSchema } from "@/contract/project"

const receipt = {
  data: { project: {
    id: "project_canonical-1", slug: "new-project-1", name: "New project 1", description: "",
    created_at: "2026-09-28T00:00:00.000Z", updated_at: "2026-09-28T00:00:00.000Z",
  } },
  meta: { request_id: "req-1" },
}

afterEach(() => vi.unstubAllGlobals())

it("posts one owner request with caller-owned stable identity and returns canonical id, not slug", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(receipt), { status: 200 }))
  vi.stubGlobal("fetch", fetchMock)
  expect(await createProject("New project 1", "stable-key", new AbortController().signal)).toEqual({ id: "project_canonical-1", slug: "new-project-1" })
  expect(fetchMock).toHaveBeenCalledWith("/api/hub/projects", {
    method: "POST", cache: "no-store", signal: expect.any(AbortSignal),
    headers: { "content-type": "application/json", "Idempotency-Key": "stable-key" },
    body: JSON.stringify({ name: "New project 1" }),
  })
})

it("accepts compatible owner response additions without weakening required id/slug checks", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    ...receipt,
    data: { ...receipt.data, project: { ...receipt.data.project, future_owner_field: { enabled: true } }, future_data_field: 1 },
    future_envelope_field: "compatible",
  }), { status: 200 })))
  await expect(createProject("New project 1", "stable-key", new AbortController().signal)).resolves.toEqual({ id: "project_canonical-1", slug: "new-project-1" })
})

it("rejects malformed success, including a missing canonical id or slug", async () => {
  for (const project of [
    { ...receipt.data.project, id: "" },
    { ...receipt.data.project, slug: "" },
    { ...receipt.data.project, id: "preview-project-1" },
  ]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...receipt, data: { project } }), { status: 200 })))
    await expect(createProject("New project 1", "stable-key", new AbortController().signal)).rejects.toBeInstanceOf(ProjectCreateError)
  }
})

it("does not treat HTTP failure or invalid JSON as a project", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "project_slug_conflict" } }), { status: 409 })))
  await expect(createProject("New project 1", "stable-key", new AbortController().signal)).rejects.toMatchObject({ code: "project_slug_conflict", status: 409 })
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })))
  await expect(createProject("New project 1", "stable-key", new AbortController().signal)).rejects.toMatchObject({ code: "project_create_invalid_response" })
})

it("shared read schema preserves canonical strings and accepts additive fields but closes RequestMeta", async () => {
  const { projectListResponseSchema, projectResponseSchema } = await import("@/contract/project")
  const project = { ...receipt.data.project, id: " id / untouched ", name: " Name untouched ", slug: " slug untouched " }
  const parsed = projectListResponseSchema.parse({
    data: { projects: [{ ...project, future_field: 1 }], future_data_field: 1 },
    meta: { request_id: "req_shared" }, future_envelope_field: 1,
  })
  expect(parsed.data.projects[0]).toEqual(project)
  expect(projectResponseSchema.safeParse({ ...receipt, meta: { request_id: "req_shared", next_cursor: null } }).success).toBe(false)
  expect(projectResponseSchema.safeParse({ ...receipt, meta: { request_id: "x".repeat(257) } }).success).toBe(false)
  expect(projectResponseSchema.safeParse({ ...receipt, data: { project: { ...project, updated_at: "yesterday" } } }).success).toBe(false)
})

it("reads list/get through existing same-origin paths, encodes opaque id, and uses only GET/no-store/signal", async () => {
  const { listProjects, getProject } = await import("@/features/app/project-list")
  const id = " id/opaque?汉字 "
  const project = { ...receipt.data.project, id }
  const fetchMock = vi.fn().mockImplementation(async (path: string) => Response.json(path === "/api/hub/projects"
    ? { data: { projects: [project] }, meta: receipt.meta }
    : { data: { project }, meta: receipt.meta }))
  vi.stubGlobal("fetch", fetchMock)
  const controller = new AbortController()
  expect(await listProjects(controller.signal)).toEqual([project])
  expect(await getProject(id, controller.signal)).toEqual(project)
  expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(["/api/hub/projects", `/api/hub/projects/${encodeURIComponent(id)}`])
  for (const [, init] of fetchMock.mock.calls as [string, RequestInit][]) {
    expect(init).toEqual({ method: "GET", cache: "no-store", signal: expect.any(AbortSignal) })
    expect(init.body).toBeUndefined()
    expect(init.headers).toBeUndefined()
  }
})

it("read errors keep HTTP/shape/network classes, reject mismatched detail ids, and never retry or return empty success", async () => {
  const { listProjects, getProject } = await import("@/features/app/project-list")
  const controller = new AbortController()
  for (const status of [401, 403, 404, 429, 503]) {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ secret: "must-not-surface" }, { status }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(listProjects(controller.signal)).rejects.toMatchObject({ reason: "http", status })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: { projects: [{}] }, meta: receipt.meta })))
  await expect(listProjects(controller.signal)).rejects.toMatchObject({ reason: "parse" })
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json")))
  await expect(listProjects(controller.signal)).rejects.toMatchObject({ reason: "parse" })
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret-provider-response")))
  await expect(listProjects(controller.signal)).rejects.toMatchObject({ reason: "network", message: "project_read_network" })
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(receipt)))
  await expect(getProject("different-id", controller.signal)).rejects.toMatchObject({ reason: "parse" })
})

it("read deadline includes a stalled body and abort releases even a non-cooperating fetch", async () => {
  const { listProjects } = await import("@/features/app/project-list")
  vi.useFakeTimers()
  try {
    const body = new Promise<unknown>(() => {})
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => body }))
    const controller = new AbortController()
    const pending = listProjects(controller.signal)
    const expired = expect(pending).rejects.toMatchObject({ reason: "timeout" })
    await vi.advanceTimersByTimeAsync(10_000)
    await expired
    expect(vi.getTimerCount()).toBe(0)
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise<Response>(() => {})))
    const cancelled = listProjects(controller.signal)
    const rejection = expect(cancelled).rejects.toMatchObject({ name: "AbortError" })
    controller.abort()
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(0)
    await rejection
  } finally { vi.useRealTimers() }
})


// R243 Project rename is a closed command receipt, not ProjectResponse.
const renameId = "project_12345678-1234-1234-1234-123456789abc"
const renameHeaders = { "content-type": "application/json", "cache-control": "private, no-store, max-age=0", "x-request-id": "rename-request" }
const renameIntent = Object.freeze({ projectId: renameId, name: "我的项目", idempotencyKey: "stable-rename-key", body: JSON.stringify({ name: "我的项目" }) })

it("normalizes rename once, counts UTF-16 units and closes ID/key/request/ACK/error JSON", async () => {
  const schema = await import("@/contract/project-rename")
  expect(schema.projectRenameRequestSchema.parse({ name: "  我的  项目  " })).toEqual({ name: "我的  项目" })
  expect(schema.projectRenameRequestSchema.parse({ name: "😀".repeat(80) }).name).toHaveLength(160)
  for (const name of ["", "  ", "😀".repeat(81), "x\0y", "\ud800", "\udc00", "x\ud800y"]) {
    expect(schema.projectRenameRequestSchema.safeParse({ name }).success).toBe(false)
  }
  expect(schema.projectRenameRequestSchema.safeParse({ name: "okay", project_id: renameId }).success).toBe(false)
  for (const id of ["slug", renameId.toUpperCase(), `${renameId}\n`]) expect(schema.projectRenameIdSchema.safeParse(id).success).toBe(false)
  for (const key of ["", "x y", "x,y", "x".repeat(129), "x\n", "汉字"]) expect(schema.projectRenameKeySchema.safeParse(key).success).toBe(false)
  expect(schema.projectRenameKeySchema.safeParse("!~".repeat(64)).success).toBe(true)
  const ack = { data: { project_id: renameId, name: renameIntent.name } }
  expect(schema.projectRenameAckMatches(ack, renameIntent)).toBe(true)
  for (const raw of [{ ...ack, meta: {} }, { data: { ...ack.data, slug: "alias" } }, { data: { ...ack.data, name: "Later B" } }]) {
    expect(schema.projectRenameAckMatches(raw, renameIntent)).toBe(false)
  }
  for (const raw of ['{"name":"A","name":"B"}', '{"data":{"name":"A","na\\u006de":"B"}}']) {
    expect(() => schema.parseProjectRenameJson(raw)).toThrow(SyntaxError)
  }
  expect(schema.parseProjectRenameJson('{"name":"a\\"b"}')).toEqual({ name: 'a"b' })
  expect(schema.projectRenameOwnerHeadersValid(new Headers({ ...renameHeaders, "cache-control": "no-store" }))).toBe(true)
  expect(schema.projectRenameOwnerHeadersValid(new Headers(renameHeaders))).toBe(false)
  expect(schema.projectRenameBrowserHeadersValid(new Headers(renameHeaders))).toBe(true)
  expect(schema.projectRenameBrowserHeadersValid(new Headers({ ...renameHeaders, "cache-control": "no-store" }))).toBe(false)
  expect(schema.projectRenameOwnerErrorAllowed(503, "business_store_unavailable", true)).toBe(true)
  expect(schema.projectRenameOwnerErrorAllowed(200, "business_store_unavailable", true)).toBe(false)
  expect(schema.projectRenameOwnerErrorAllowed(403, "session_forbidden", true)).toBe(false)
  for (const value of ["0", "01", "86401", "99999", "1\n"]) expect(schema.projectRenameRetryAfterValid(value)).toBe(false)
  for (const value of ["1", "9999", "86399", "86400"]) expect(schema.projectRenameRetryAfterValid(value)).toBe(true)
})

it("issues one exact immutable PATCH and returns no resource or automatic retry", async () => {
  const { renameProject } = await import("@/features/app/project-rename")
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { project_id: renameId, name: renameIntent.name } }, { headers: renameHeaders }))
  vi.stubGlobal("fetch", fetchMock)
  await expect(renameProject(renameIntent, new AbortController().signal)).resolves.toBeUndefined()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(`/api/hub/projects/${renameId}/name`, {
    method: "PATCH", cache: "no-store", headers: { "content-type": "application/json", "Idempotency-Key": renameIntent.idempotencyKey },
    body: renameIntent.body, signal: expect.any(AbortSignal),
  })
  expect(fetchMock.mock.calls[0]?.[1].signal.aborted).toBe(true)
  const abort = new AbortController(); abort.abort()
  await expect(renameProject(renameIntent, abort.signal)).rejects.toMatchObject({ code: "request_aborted" })
  await expect(renameProject({ ...renameIntent, name: " raw ", body: '{"name":" raw "}' }, new AbortController().signal)).rejects.toMatchObject({ code: "invalid_project_rename" })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it("rejects wrong ACK target/name, additions, status, headers, duplicate keys and mismatched owner errors", async () => {
  const { renameProject } = await import("@/features/app/project-rename")
  const ack = { data: { project_id: renameId, name: renameIntent.name } }
  const vectors = [
    { body: { data: { ...ack.data, project_id: "project_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" } }, status: 200, code: "ack_shape_mismatch" },
    { body: { data: { ...ack.data, name: "B" } }, status: 200, code: "ack_shape_mismatch" },
    { body: { ...ack, meta: {} }, status: 200, code: "ack_shape_mismatch" },
    { body: ack, status: 201, code: "unexpected_status" },
    { body: { error: { code: "session_forbidden", message: "denied", retryable: false } }, status: 503, code: "unexpected_status" },
    { body: { error: { code: "business_store_unavailable", message: "unknown", retryable: true, extra: true } }, status: 503, code: "unexpected_status" },
  ]
  for (const vector of vectors) {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(vector.body, { status: vector.status, headers: renameHeaders }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(renameProject(renameIntent, new AbortController().signal)).rejects.toMatchObject({ code: vector.code })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  }
  for (const headers of [{ ...renameHeaders, "cache-control": "no-store" }, { ...renameHeaders, "cache-control": "public" }, { ...renameHeaders, "x-request-id": "x".repeat(129) }, { ...renameHeaders, "content-type": "text/plain" }]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(ack, { headers })))
    await expect(renameProject(renameIntent, new AbortController().signal)).rejects.toMatchObject({ code: "invalid_headers" })
  }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"data":{"project_id":"' + renameId + '","name":"A","name":"我的项目"}}', { headers: renameHeaders })))
  await expect(renameProject(renameIntent, new AbortController().signal)).rejects.toMatchObject({ code: "invalid_json" })
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code: "business_store_unavailable", message: "unknown", retryable: true } }, { status: 503, headers: renameHeaders })))
  await expect(renameProject(renameIntent, new AbortController().signal)).rejects.toMatchObject({ code: "business_store_unavailable", status: 503 })
})

it("uses one 10-second budget across delayed headers and held body and cleans up late delivery", async () => {
  const { renameProject } = await import("@/features/app/project-rename")
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] })
  try {
    let deliver: (value: Response) => void = () => { throw new Error("request not started") }
    let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined
    const cancel = vi.fn()
    const response = new Response(new ReadableStream<Uint8Array>({ start: (value) => { bodyController = value }, cancel }), { headers: renameHeaders })
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { deliver = resolve }))
    vi.stubGlobal("fetch", fetchMock)
    const pending = renameProject(renameIntent, new AbortController().signal)
    const rejected = expect(pending).rejects.toMatchObject({ code: "request_timeout" })
    await vi.advanceTimersByTimeAsync(6_000)
    deliver(response)
    await vi.advanceTimersByTimeAsync(3_999)
    expect(fetchMock.mock.calls[0]?.[1].signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await rejected
    expect(fetchMock.mock.calls[0]?.[1].signal.aborted).toBe(true)
    bodyController?.enqueue(new TextEncoder().encode(JSON.stringify({ data: { project_id: renameId, name: renameIntent.name } })))
    bodyController?.close()
    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  } finally { vi.useRealTimers() }
})


it.each(["headers", "success-body", "error-body"] as const)("R251 create settles at one total deadline while %s stalls", async (stage) => {
  vi.useFakeTimers()
  const outcome: { phase: "pending" | "fulfilled" | "rejected"; error?: unknown } = { phase: "pending" }
  const cancel = vi.fn().mockImplementation(() => stage === "error-body" ? new Promise<void>(() => {}) : undefined)
  const response = new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('{"data":'))
  }, cancel }), { status: stage === "error-body" ? 503 : 200 })
  const request = vi.fn().mockImplementation(() => stage === "headers" ? new Promise<Response>(() => {}) : Promise.resolve(response))
  vi.stubGlobal("fetch", request)
  try {
    void createProject("New project 1", "r251-original-key", new AbortController().signal).then(
      () => { outcome.phase = "fulfilled" },
      (error: unknown) => { outcome.phase = "rejected"; outcome.error = error },
    )
    await vi.advanceTimersByTimeAsync(9_999)
    expect(outcome.phase).toBe("pending")
    if (stage !== "headers") expect(response.body?.locked).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(outcome.phase).toBe("rejected")
    expect(outcome.error).toBeInstanceOf(ProjectCreateError)
    expect((outcome.error as ProjectCreateError).status).toBeUndefined()
    const init = request.mock.calls[0]?.[1] as RequestInit | undefined
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(init?.signal?.aborted).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    if (stage !== "headers") {
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(response.body?.locked).toBe(false)
    }
  } finally { vi.useRealTimers() }
})

it("R251 headers consume the same body budget, and a late legal body never revives the timed-out attempt", async () => {
  vi.useFakeTimers()
  let headers!: (response: Response) => void
  let body!: (raw: unknown) => void
  const request = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { headers = resolve }))
  vi.stubGlobal("fetch", request)
  const outcome: { phase: "pending" | "fulfilled" | "rejected" } = { phase: "pending" }
  const accepted = vi.fn()
  try {
    void createProject("New project 1", "r251-budget-key", new AbortController().signal).then(() => { outcome.phase = "fulfilled"; accepted() }, () => { outcome.phase = "rejected" })
    await vi.advanceTimersByTimeAsync(9_000)
    const response = new Response(new ReadableStream<Uint8Array>({ start(controller) {
      body = (raw) => { controller.enqueue(new TextEncoder().encode(JSON.stringify(raw))); controller.close() }
    } }), { status: 200 })
    headers(response)
    await vi.advanceTimersByTimeAsync(0)
    expect(response.body?.locked).toBe(true)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(outcome.phase).toBe("rejected")
    expect(response.body?.locked).toBe(false)
    expect(() => body(receipt)).toThrow(TypeError)
    await vi.advanceTimersByTimeAsync(0)
    expect(outcome.phase).toBe("rejected")
    expect(accepted).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  } finally { vi.useRealTimers() }
})


it("R251 pre-aborted caller performs no dispatch or timer allocation", async () => {
  vi.useFakeTimers()
  const caller = new AbortController()
  caller.abort()
  const request = vi.fn()
  vi.stubGlobal("fetch", request)
  try {
    await expect(createProject("New project 1", "aborted-key", caller.signal)).rejects.toMatchObject({ code: "project_create_request_aborted", status: undefined })
    expect(request).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  } finally { vi.useRealTimers() }
})

it.each(["headers", "body"] as const)("R251 caller abort releases %s wait, ignores its late completion, and removes the listener", async (stage) => {
  vi.useFakeTimers()
  const caller = new AbortController()
  const added = vi.spyOn(caller.signal, "addEventListener")
  const removed = vi.spyOn(caller.signal, "removeEventListener")
  let releaseHeaders!: (response: Response) => void
  let bodyController!: ReadableStreamDefaultController<Uint8Array>
  const cancel = vi.fn().mockRejectedValue(new Error("underlying cancellation rejected"))
  const delayedBody = new Response(new ReadableStream<Uint8Array>({
    start(controller) { bodyController = controller }, cancel,
  }), { status: 200 })
  const request = vi.fn().mockImplementation(() => stage === "headers"
    ? new Promise<Response>((resolve) => { releaseHeaders = resolve }) : Promise.resolve(delayedBody))
  vi.stubGlobal("fetch", request)
  const accepted = vi.fn()
  try {
    const pending = createProject("New project 1", "cancelled-original-key", caller.signal)
    void pending.then(accepted, () => undefined)
    const rejected = expect(pending).rejects.toMatchObject({ code: "project_create_request_aborted", status: undefined })
    await vi.advanceTimersByTimeAsync(0)
    if (stage === "body") expect(delayedBody.body?.locked).toBe(true)
    caller.abort()
    await rejected
    const init = request.mock.calls[0]?.[1] as RequestInit | undefined
    expect(init?.signal?.aborted).toBe(true)
    expect(removed).toHaveBeenCalledWith("abort", added.mock.calls[0]?.[1])
    expect(vi.getTimerCount()).toBe(0)
    if (stage === "headers") releaseHeaders(Response.json(receipt))
    else {
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(delayedBody.body?.locked).toBe(false)
      expect(() => bodyController.enqueue(new TextEncoder().encode(JSON.stringify(receipt)))).toThrow(TypeError)
    }
    await vi.advanceTimersByTimeAsync(0)
    expect(accepted).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledTimes(1)
  } finally { added.mockRestore(); removed.mockRestore(); vi.useRealTimers() }
})

it("R251 a late rejecting error body cannot become unhandled or change a timeout into owner rejection", async () => {
  vi.useFakeTimers()
  let rejectBody!: (error: unknown) => void
  const caller = new AbortController()
  const removed = vi.spyOn(caller.signal, "removeEventListener")
  const response = new Response(new ReadableStream<Uint8Array>({ start(controller) {
    rejectBody = (error) => controller.error(error)
  } }), { status: 409 })
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))
  try {
    const pending = createProject("New project 1", "error-body-original-key", caller.signal)
    const rejected = expect(pending).rejects.toMatchObject({ code: "project_create_request_timeout", status: undefined })
    await vi.advanceTimersByTimeAsync(10_000)
    await rejected
    rejectBody(new Error("late body read rejected"))
    await vi.advanceTimersByTimeAsync(0)
    await expect(pending).rejects.toMatchObject({ code: "project_create_request_timeout", status: undefined })
    expect(removed).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  } finally { removed.mockRestore(); vi.useRealTimers() }
})

it("R251 completed validation still enforces the monotonic deadline if synchronous work passes it", async () => {
  const monotonic = vi.spyOn(performance, "now")
  let elapsed = 0
  monotonic.mockImplementation(() => elapsed)
  const parse = projectResponseSchema.safeParse.bind(projectResponseSchema)
  const validation = vi.spyOn(projectResponseSchema, "safeParse").mockImplementation((raw, params) => {
    const result = parse(raw, params)
    elapsed = 10_001
    return result
  })
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(receipt)))
  try {
    await expect(createProject("New project 1", "parse-deadline-key", new AbortController().signal))
      .rejects.toMatchObject({ code: "project_create_request_timeout", status: undefined })
  } finally { validation.mockRestore(); monotonic.mockRestore() }
})


it("R251 a non-cooperating late headers response releases its unused body without reading or adopting it", async () => {
  vi.useFakeTimers()
  let headers!: (response: Response) => void
  const cancel = vi.fn()
  const late = new Response(new ReadableStream({ cancel }), { status: 200 })
  const consume = vi.spyOn(late, "json")
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { headers = resolve })))
  try {
    const pending = createProject("New project 1", "late-headers-key", new AbortController().signal)
    const rejected = expect(pending).rejects.toMatchObject({ code: "project_create_request_timeout" })
    await vi.advanceTimersByTimeAsync(10_000)
    await rejected
    headers(late)
    await vi.advanceTimersByTimeAsync(0)
    expect(consume).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  } finally { consume.mockRestore(); vi.useRealTimers() }
})
