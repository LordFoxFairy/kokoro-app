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
