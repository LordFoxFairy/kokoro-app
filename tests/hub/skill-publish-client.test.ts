import { afterEach, expect, it, vi } from "vitest"

import { HubClientError } from "@/hub/client"
import { createSkillPublishClient } from "@/hub/skill-publish-client"
import { completeSkillUploadSchema, skillUploadStateSchema } from "@/hub/schemas"

afterEach(() => vi.unstubAllGlobals())

const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-request-id": "owner-1" }
const reference = { url: "https://objects.example/put?signature=TOKEN", method: "PUT" as const, required_headers: { "content-type": "application/zip" as const }, expires_at: "2999-01-01T00:00:00Z" }

it("sends the exact zero-byte Publish command with one stable key and strict ACTIVE receipt", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { source_ref: "skill:mine", revision: "2", status: "active", event_id: "550e8400-e29b-41d4-a716-446655440000", replayed: false } }), { status: 200, headers }))
  vi.stubGlobal("fetch", fetchMock)
  const receipt = await createSkillPublishClient().publishDraft("mine", "skill-web:key")
  expect(receipt.source_ref).toBe("skill:mine")
  expect(fetchMock).toHaveBeenCalledWith("/api/hub/self/skills/mine/publish", expect.objectContaining({ method: "POST", cache: "no-store", redirect: "error", headers: { "idempotency-key": "skill-web:key" } }))
  expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("body")
})

it("maps Draft/Get/Begin/Complete/Validate to the pinned same-origin paths and statuses", async () => {
  const sha = "a".repeat(64)
  const responses = [
    [201, { skill_id: "mine", series_id: "series", revision: 1, status: "draft", replayed: false }],
    [200, { skill_id: "mine", attempt_epoch: "0", phase: "none" }],
    [201, { skill_id: "mine", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", transfer_reference: reference, replayed: false }],
    [200, { skill_id: "mine", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", phase: "uploaded", replayed: false, content_sha256: sha, scan_state: "pending" }],
    [200, { skill_id: "mine", series_id: "series", valid: true, content_digest: sha, manifest_identity: `zip-v1:sha256:${sha}`, replayed: false }],
  ] as const
  const fetchMock = vi.fn()
  for (const [status, data] of responses) fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data }), { status, headers }))
  vi.stubGlobal("fetch", fetchMock)
  const client = createSkillPublishClient()
  await client.createDraft({ display_name: "Mine", summary: "", tags: [] }, "create-key")
  await client.getUpload("mine")
  await client.beginUpload("mine", { filename: "mine.zip", mime_type: "application/zip", size_bytes: 3, content_sha256: sha }, "begin-key")
  await client.completeUpload("mine", { attempt_id: "attempt", upload_id: "upload", content_sha256: sha, size_bytes: 3 }, "complete-key")
  await client.validateDraft("mine", "attempt", "validate-key")
  expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
    "/api/hub/self/skills/drafts", "/api/hub/self/skills/mine/package-upload", "/api/hub/self/skills/mine/package-upload",
    "/api/hub/self/skills/mine/package-upload/complete", "/api/hub/self/skills/mine/validate",
  ])
  expect(fetchMock.mock.calls.map(([, init]) => init?.headers?.["idempotency-key"])).toEqual(["create-key", undefined, "begin-key", "complete-key", "validate-key"])
  expect(JSON.parse(fetchMock.mock.calls[4]![1].body)).toEqual({ attempt_id: "attempt" })
})

it("PUTs original bytes only to a safe short-lived transfer reference, without credentials or redirects", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
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
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
  vi.stubGlobal("fetch", fetchMock)
  const file = new File(["raw"], "one.zip")
  await createSkillPublishClient("http://127.0.0.1:3310/skills").putPackage({ ...reference, url: "http://127.0.0.1:9000/put" }, file)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  await expect(createSkillPublishClient("http://app.example/skills").putPackage({ ...reference, url: "http://127.0.0.1:9000/put" }, file)).rejects.toBeInstanceOf(HubClientError)
})

it("rejects text/plain JSON and malformed success/error envelopes", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { source_ref: "skill:mine", revision: "2", status: "active", event_id: "550e8400-e29b-41d4-a716-446655440000", replayed: false } }), { status: 200, headers: { ...headers, "content-type": "text/plain" } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "unknown_code", message: "No", retryable: false } }), { status: 503, headers }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "skill_dependency_unavailable", message: "No", retryable: true } }), { status: 500, headers }))
  vi.stubGlobal("fetch", fetchMock)
  const client = createSkillPublishClient()
  await expect(client.publishDraft("mine", "key")).rejects.toMatchObject({ reason: "parse" })
  await expect(client.publishDraft("mine", "key")).rejects.toMatchObject({ reason: "parse" })
  await expect(client.publishDraft("mine", "key")).rejects.toMatchObject({ reason: "parse" })
})

it("rejects infected/fake-complete or stale upload phase shapes before Publish", () => {
  const complete = { skill_id: "mine", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", phase: "uploaded", replayed: false, content_sha256: "a".repeat(64), scan_state: "clean" }
  expect(completeSkillUploadSchema.safeParse({ ...complete, scan_state: "infected" }).success).toBe(false)
  expect(completeSkillUploadSchema.safeParse({ ...complete, phase: "validated" }).success).toBe(false)
  expect(skillUploadStateSchema.safeParse({ skill_id: "mine", attempt_epoch: "0", phase: "none", attempt_id: "old" }).success).toBe(false)
  expect(skillUploadStateSchema.safeParse({ skill_id: "mine", attempt_epoch: "2", phase: "upload_pending", attempt_id: "old" }).success).toBe(false)
})
