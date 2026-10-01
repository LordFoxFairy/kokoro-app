import { afterEach, expect, it, vi } from "vitest"

import { createProject, ProjectCreateError } from "@/features/app/project-create"

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
  expect(await createProject("New project 1", "stable-key")).toEqual({ id: "project_canonical-1", slug: "new-project-1" })
  expect(fetchMock).toHaveBeenCalledWith("/api/hub/projects", {
    method: "POST", cache: "no-store",
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
  await expect(createProject("New project 1", "stable-key")).resolves.toEqual({ id: "project_canonical-1", slug: "new-project-1" })
})

it("rejects malformed success, including a missing canonical id or slug", async () => {
  for (const project of [
    { ...receipt.data.project, id: "" },
    { ...receipt.data.project, slug: "" },
    { ...receipt.data.project, id: "preview-project-1" },
  ]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...receipt, data: { project } }), { status: 200 })))
    await expect(createProject("New project 1", "stable-key")).rejects.toBeInstanceOf(ProjectCreateError)
  }
})

it("does not treat HTTP failure or invalid JSON as a project", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "project_slug_conflict" } }), { status: 409 })))
  await expect(createProject("New project 1", "stable-key")).rejects.toMatchObject({ code: "project_slug_conflict", status: 409 })
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })))
  await expect(createProject("New project 1", "stable-key")).rejects.toMatchObject({ code: "project_create_invalid_response" })
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
