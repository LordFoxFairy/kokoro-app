import { afterEach, describe, expect, it, vi } from "vitest"
import { createSkillShareClient } from "@/hub/skill-share-client"
const origin = "https://app.example"
const ack = { share_id: "share-old", source_ref: "skill:revision-old", url: `${origin}/skills/shared/share-old`, created_at: "2026-10-10T00:00:00Z", expires_at: null, revoked_at: null }
const skill = { skill_id: "revision-old", series_id: "series", revision: "1", display_name: "Old revision", description: "Owner description", tags: ["real"], example_prompts: ["Real example"], category_keys: ["apps"], created_at: ack.created_at, updated_at: ack.created_at, owner_type: "official", source_kind: "official", author: { user_id: "author", display_name: "Author" }, cover_image: "/api/v1/skills/revision-old/cover" }
const headers = { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "request-share" }
function response(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers }) }
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe("formal Skill Share client", () => {
  it("creates once without idempotency and preserves the six-field ACK URL", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ data: ack }, 201)); vi.stubGlobal("fetch", fetcher)
    expect(await createSkillShareClient(origin).create({ source_ref: ack.source_ref })).toEqual(ack)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/hub/skill-shares")
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).has("idempotency-key")).toBe(false)
    expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body)).toEqual({ source_ref: ack.source_ref })
  })
  it("resolves and reads the exact old revision without a current-series call", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ data: ack })).mockResolvedValueOnce(response({ data: { share_id: ack.share_id, source_ref: ack.source_ref, skill } })); vi.stubGlobal("fetch", fetcher)
    const client = createSkillShareClient(origin)
    expect(await client.resolve(ack.share_id)).toEqual(ack)
    expect((await client.summary(ack.share_id)).skill).toEqual(skill)
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(["/api/hub/skill-shares/share-old", "/api/hub/skill-shares/share-old/skill"])
  })
  it.each([
    { ...ack, source_ref: "skill:series" }, { ...ack, url: "https://other.example/skills/shared/share-old" },
    { ...ack, url: `${origin}/skills/shared/share-old?extra=1` }, { ...ack, revoked_at: ack.created_at }, { ...ack, extra: true },
  ])("rejects a mismatched/extended Create ACK %j", async data => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ data }, 201)))
    await expect(createSkillShareClient(origin).create({ source_ref: ack.source_ref })).rejects.toMatchObject({ reason: "parse" })
  })
  it.each([
    { ...skill, skill_id: "current-revision" }, { ...skill, cover_image: "/api/v1/skills/series/cover" },
    { ...skill, current: true }, { ...skill, source_kind: undefined }, { ...skill, revision: "18446744073709551616" },
  ])("rejects non-exact summary facts %j", async value => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ data: { share_id: ack.share_id, source_ref: ack.source_ref, skill: value } })))
    await expect(createSkillShareClient(origin).summary(ack.share_id)).rejects.toMatchObject({ reason: "parse" })
  })
  it.each([[403, "skill_forbidden", "http"], [502, "skill_response_invalid", "http"], [503, "skill_dependency_unavailable", "http"], [400, "skill_forbidden", "parse"], [502, "session_invalid", "parse"]])("keeps exact error status/code %s %s", async (status, code, reason) => {
    const fetcher = vi.fn().mockResolvedValue(response({ error: { code, message: "Rejected", retryable: false } }, Number(status))); vi.stubGlobal("fetch", fetcher)
    await expect(createSkillShareClient(origin).create({ source_ref: ack.source_ref })).rejects.toMatchObject({ reason })
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it("keeps request identity and retry metadata on formal rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: { code: "skill_dependency_unavailable", message: "Unavailable", retryable: true } }, 503)))
    await expect(createSkillShareClient(origin).create({ source_ref: ack.source_ref })).rejects.toMatchObject({ reason: "http", retryable: true, requestId: "request-share", status: 503 })
  })
  it("binds an explicitly requested expiration to the returned ACK", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ data: ack }, 201)))
    await expect(createSkillShareClient(origin).create({ source_ref: ack.source_ref, expires_at: "2999-01-01T00:00:00Z" })).rejects.toMatchObject({ reason: "parse" })
  })
  it("does not rebuild an unknown Create and cancels its late response", async () => {
    vi.useFakeTimers(); let resolve!: (response: Response) => void; const cancel = vi.fn()
    const fetcher = vi.fn(() => new Promise<Response>(done => { resolve = done })); vi.stubGlobal("fetch", fetcher)
    const result = createSkillShareClient(origin).create({ source_ref: ack.source_ref }).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(10_001)
    expect(await result).toMatchObject({ reason: "network" }); expect(fetcher).toHaveBeenCalledOnce()
    resolve(new Response(new ReadableStream({ cancel }))); await Promise.resolve(); await Promise.resolve()
    expect(cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
  })
  it("bounds a never-closing body and caller cancellation", async () => {
    const cancel = vi.fn(), controller = new AbortController()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }), { headers })))
    const result = createSkillShareClient(origin).resolve(ack.share_id, controller.signal).catch((error: unknown) => error)
    await Promise.resolve(); await Promise.resolve(); controller.abort()
    expect(await result).toMatchObject({ reason: "aborted" }); expect(cancel).toHaveBeenCalledOnce()
  })
  it("rejects cumulative bytes above 1MiB and cancels", async () => {
    const cancel = vi.fn()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(1_048_577)) }, cancel }), { headers })))
    await expect(createSkillShareClient(origin).resolve(ack.share_id)).rejects.toMatchObject({ reason: "parse" }); expect(cancel).toHaveBeenCalledOnce()
  })
})

const downloadAck = { source_ref: "skill:revision-old", revision: "1", download_info: { download_url: `/skill-downloads/${"a".repeat(43)}`, filename: "actual.skill", expires_at: "2099-10-10T00:00:00Z" } }
it("prepares the shared exact revision with zero body and no idempotency", async () => {
  const fetcher = vi.fn().mockResolvedValue(response({ data: downloadAck })); vi.stubGlobal("fetch", fetcher)
  expect(await createSkillShareClient(origin).download("share-old", "skill:revision-old", "1")).toEqual(downloadAck)
  expect(fetcher.mock.calls[0]?.[0]).toBe("/api/hub/skill-shares/share-old/download")
  const init = fetcher.mock.calls[0]?.[1] as RequestInit
  expect(init.method).toBe("POST"); expect(init.body).toBeUndefined()
  expect(new Headers(init.headers).has("content-type")).toBe(false); expect(new Headers(init.headers).has("idempotency-key")).toBe(false)
})
it.each([
  { ...downloadAck, source_ref: "skill:series" }, { ...downloadAck, revision: "2" }, { ...downloadAck, extra: true },
  { ...downloadAck, download_info: { ...downloadAck.download_info, download_url: "https://object.example/raw.zip" } },
  { ...downloadAck, download_info: { ...downloadAck.download_info, download_url: `${downloadAck.download_info.download_url}?extra=1` } },
  { ...downloadAck, download_info: { ...downloadAck.download_info, filename: "../wrong.zip" } },
  { ...downloadAck, download_info: { ...downloadAck.download_info, expires_at: "2000-01-01T00:00:00Z" } },
])("rejects a changed exact download binding or invalid handle %j", async data => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ data })))
  await expect(createSkillShareClient(origin).download("share-old", "skill:revision-old", "1")).rejects.toMatchObject({ reason: "parse" })
})
it.each([[504, "skill_deadline_exceeded", "http"], [403, "skill_download_forbidden", "http"], [403, "skill_forbidden", "parse"], [503, "skill_deadline_exceeded", "parse"]])("keeps exact download error status %s/%s closed", async (status, code, reason) => {
  const fetcher = vi.fn().mockResolvedValue(response({ error: { code, message: "Owner error", retryable: true } }, Number(status))); vi.stubGlobal("fetch", fetcher)
  await expect(createSkillShareClient(origin).download("share-old", "skill:revision-old", "1")).rejects.toMatchObject({ reason })
  expect(fetcher).toHaveBeenCalledOnce()
})
