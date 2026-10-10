import { afterEach, expect, it, vi } from "vitest"
import { createSkillGithubImportClient } from "@/hub/skill-github-import-client"
import { githubPreviewRequestSchema, githubSelectorSchema, githubPreviewSchema, githubDraftSchema } from "@/hub/skill-github-import.schema"

const selector = { owner: "acme", repository: "skills", commit: "a".repeat(40), path: "tools/check" }
const input = { repository_url: "https://github.com/acme/skills" }
const selected = { selection_required: false, selector, metadata: { display_name: "Check", summary: "Actual", tags: ["test"], example_prompts: ["Use this"], category_keys: ["apps"] }, repository: { repository_id: "123", repository_url: input.repository_url, owner_login: "acme", owner_url: "https://github.com/acme", commit: selector.commit, path: selector.path, repo_stats: { stars: "10", forks: "0", observed_at: "2026-10-10T00:00:00.000Z", metadata_source_url: "https://api.github.com/repos/acme/skills" } }, content_sha256: "b".repeat(64), size_bytes: "123" }
const choices = { selection_required: true, repository_url: input.repository_url, commit: selector.commit, paths: [selector.path, "tools/other"] }
const draft = { skill_id: "revision-new", source_ref: "skill:revision-new", status: "draft", state_version: "4", valid: true, content_digest: selected.content_sha256, manifest_identity: `skill-md-v1:sha256:${selected.content_sha256}` }
const headers = { "content-type": "application/json", "cache-control": "private, no-store", "x-request-id": "github-client" }
const reply = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status, headers })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

it.each([selected, choices])("accepts complete immutable Preview branch without a mutation key", async data => {
  const fetchMock = vi.fn(async () => reply(data)); vi.stubGlobal("fetch", fetchMock)
  expect(await createSkillGithubImportClient().preview(input)).toEqual(data)
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe("/api/hub/skills/github/preview")
  expect(JSON.parse(String(init.body))).toEqual(input)
  expect(new Headers(init.headers).has("idempotency-key")).toBe(false)
  expect(init).toMatchObject({ credentials: "same-origin", redirect: "error", cache: "no-store" })
})
it("keeps the exact immutable selector and original key for an unknown Import retry, returning only a draft", async () => {
  const fetchMock = vi.fn().mockRejectedValueOnce(new Error("unknown")).mockResolvedValueOnce(reply(draft, 201)); vi.stubGlobal("fetch", fetchMock)
  const client = createSkillGithubImportClient()
  await expect(client.import(selector, "original-key")).rejects.toMatchObject({ reason: "network" })
  expect(await client.import(selector, "original-key")).toEqual(draft)
  for (const [url, init] of fetchMock.mock.calls as [string, RequestInit][]) {
    expect(url).toBe("/api/hub/skills/github/import")
    expect(JSON.parse(String(init.body))).toEqual(selector)
    expect(new Headers(init.headers).get("idempotency-key")).toBe("original-key")
  }
})
it.each(["../outside", "/root", "a//b", "a\\b", "a/./b", "a".repeat(257)])("rejects unsafe selector path %s before I/O", async path => {
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock)
  expect(() => createSkillGithubImportClient().import({ ...selector, path }, "key")).toThrow()
  expect(fetchMock).not.toHaveBeenCalled()
})
it("keeps the character path limit distinct from owner archive bytes and rejects extra request fields", () => {
  expect(githubSelectorSchema.safeParse({ ...selector, path: "界".repeat(256) }).success).toBe(true)
  expect(githubPreviewRequestSchema.safeParse({ ...input, repository: "legacy" }).success).toBe(false)
  expect(githubSelectorSchema.safeParse({ ...selector, extra: true }).success).toBe(false)
})
it.each([
  { ...selected, extra: true }, { ...selected, metadata: { ...selected.metadata, extra: true } },
  { ...selected, repository: { ...selected.repository, commit: "c".repeat(40) } },
  { ...selected, repository: { ...selected.repository, path: "different" } },
  { ...selected, repository: { ...selected.repository, repository_url: "https://github.com/acme/other" } },
  { ...selected, repository: { ...selected.repository, repo_stats: { ...selected.repository.repo_stats, extra: true } } },
  { ...selected, size_bytes: "9223372036854775808" }, { ...choices, paths: [selector.path, selector.path] },
])("rejects malformed Preview fields or cross-identity binding", async data => {
  vi.stubGlobal("fetch", vi.fn(async () => reply(data)))
  await expect(createSkillGithubImportClient().preview(input)).rejects.toMatchObject({ reason: "parse" })
})
it("rejects Preview success from another requested resource or an unselected path", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => reply(selected)))
  await expect(createSkillGithubImportClient().preview({ repository_url: "https://github.com/acme/other" })).rejects.toMatchObject({ reason: "parse" })
  await expect(createSkillGithubImportClient().preview({ ...input, path: "other" })).rejects.toMatchObject({ reason: "parse" })
  vi.stubGlobal("fetch", vi.fn(async () => reply(choices)))
  await expect(createSkillGithubImportClient().preview({ ...input, path: selector.path })).rejects.toMatchObject({ reason: "parse" })
})
it.each([{ ...draft, installed: true }, { ...draft, source_ref: "skill:other" }, { ...draft, status: "active" }, { ...draft, valid: false }, { ...draft, state_version: "9223372036854775808" }])("rejects fake installed or malformed Import draft ACK", async data => {
  vi.stubGlobal("fetch", vi.fn(async () => reply(data, 201)))
  await expect(createSkillGithubImportClient().import(selector, "key")).rejects.toMatchObject({ reason: "parse" })
})
it("requires every owner Preview and draft field", () => {
  for (const key of Object.keys(selected)) { const copy: Record<string, unknown> = { ...selected }; delete copy[key]; expect(githubPreviewSchema.safeParse(copy).success).toBe(false) }
  for (const key of Object.keys(draft)) { const copy: Record<string, unknown> = { ...draft }; delete copy[key]; expect(githubDraftSchema.safeParse(copy).success).toBe(false) }
})
it.each([[400,"invalid_skill_request"],[401,"session_invalid"],[403,"skill_forbidden"],[404,"skill_not_found"],[409,"skill_command_in_progress"],[412,"skill_precondition_failed"],[413,"request_body_too_large"],[429,"skill_rate_limited"],[502,"skill_response_invalid"],[503,"skill_dependency_unavailable"]] as const)("accepts closed error %i %s on both operations", async (status, code) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code, message: "Owner failure", retryable: false } }), { status, headers })))
  const client = createSkillGithubImportClient()
  await expect(client.preview(input)).rejects.toMatchObject({ reason: "http", code, status })
  await expect(client.import(selector, "key")).rejects.toMatchObject({ reason: "http", code, status })
})
it.each([[400,"skill_command_in_progress"],[403,"skill_precondition_failed"],[502,"session_invalid"],[503,"github.unavailable"]] as const)("rejects status/code mismatch %i %s", async (status, code) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code, message: "Wrong", retryable: false } }), { status, headers })))
  await expect(createSkillGithubImportClient().preview(input)).rejects.toMatchObject({ reason: "parse" })
})
it.each(["content-type","cache-control","x-request-id"])("requires safe response header %s", async name => {
  const h = new Headers(headers); h.delete(name)
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: selected }), { headers: h })))
  await expect(createSkillGithubImportClient().preview(input)).rejects.toMatchObject({ reason: "parse" })
})
it("cancels an oversized real response stream", async () => {
  const cancel = vi.fn(); const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(1_048_577)) }, cancel })
  vi.stubGlobal("fetch", vi.fn(async () => new Response(stream, { headers })))
  await expect(createSkillGithubImportClient().preview(input)).rejects.toMatchObject({ reason: "parse" })
  expect(cancel).toHaveBeenCalled()
})
it.each(["preview","import"] as const)("applies the total deadline to an unclosed %s body", async operation => {
  vi.useFakeTimers(); const cancel = vi.fn()
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"data":')) }, cancel }), { status: operation === "import" ? 201 : 200, headers })))
  const client = createSkillGithubImportClient(); const work = operation === "import" ? client.import(selector,"key") : client.preview(input)
  const assertion = expect(work).rejects.toMatchObject({ reason: "network" })
  await vi.advanceTimersByTimeAsync(10_001); await assertion
  expect(cancel).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0)
})
it("honors caller cancellation and cleans a late fetch response", async () => {
  const controller = new AbortController(); let resolve!: (value: Response) => void
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(accept => { resolve = accept })))
  const work = createSkillGithubImportClient().import(selector,"original-key",controller.signal)
  const assertion = expect(work).rejects.toMatchObject({ reason: "aborted" }); controller.abort(); await assertion
  const cancel = vi.fn(); resolve(new Response(new ReadableStream({ cancel }), { headers })); await new Promise(accept => setTimeout(accept,0))
  expect(cancel).toHaveBeenCalled()
})
