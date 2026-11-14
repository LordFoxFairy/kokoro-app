import { afterEach, expect, it, vi } from "vitest"
import { projectAccessCall } from "@/features/app/project-access-client"

const intent = { subjectId: "member", key: "original-key", version: "1", body: { role: "viewer" as const, expires_at: null } }
const grant = { project_id: "project-a", subject_id: "member", role: "viewer", expires_at: null, revoked_at: null, access_version: "2" }
const response = (data = grant) => Response.json({ data, meta: { request_id: "grant-read" } })
afterEach(() => vi.unstubAllGlobals())

it("never confirms a grant response for another member", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response({ ...grant, subject_id: "other" })),
  )
  await expect(projectAccessCall("project-a", "set", new AbortController().signal, intent)).rejects.toThrow()
})

it("retires a late grant ACK after cancellation without replacing its original command", async () => {
  const controller = new AbortController()
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      controller.abort()
      return response()
    }),
  )
  await expect(projectAccessCall("project-a", "set", controller.signal, intent)).rejects.toThrow()
  expect(intent).toEqual({ subjectId: "member", key: "original-key", version: "1", body: { role: "viewer", expires_at: null } })
})
