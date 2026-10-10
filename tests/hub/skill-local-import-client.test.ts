import { afterEach, expect, it, vi } from "vitest"
import { createSkillLocalImportClient } from "@/hub/skill-local-import-client"
import { localImportGetSchema } from "@/hub/skill-local-import.schema"
const headers = { "content-type": "application/json", "cache-control": "private, no-store", "x-request-id": "owner-1" }
const expires_at = "2999-01-01T00:00:00Z"
const request = { filename: "mine.skill", size_bytes: 3, content_sha256: "a".repeat(64) }
const proof = { upload_id: "upload-1", asset_id: "asset-1", source_version_id: "real-version", size_bytes: "3", content_sha256: request.content_sha256 }
const begin = { intent_id: "intent-1", skill_id: "series-1", phase: "upload_pending", upload_id: "upload-1", transfer_reference: { url: "https://objects.example/put", method: "PUT", required_headers: { "content-type": "application/zip" }, expires_at }, expires_at, replayed: false }
const completeBody = { ...request, upload_id: proof.upload_id, source_version_id: proof.source_version_id }
const completeRequest = { upload_id: completeBody.upload_id, source_version_id: completeBody.source_version_id, size_bytes: completeBody.size_bytes, content_sha256: completeBody.content_sha256 }
const complete = { intent_id: "intent-1", skill_id: "series-1", phase: "uploaded", upload_proof: proof, scan_state: "clean", expires_at, replayed: false }
const skill = { skill_id: "revision-1", source_ref: "skill:revision-1", series_id: "series-1", revision: "1", status: "active", name: "Mine", summary: "", tags: [], example_prompts: [], category_keys: [], skill_updated_at: "2026-10-10T00:00:00Z", product: { publication_audience: "owner", state_version: "4", source_kind: "personal" }, package_phase: "valid" }
const installation = { installation_id: "installation-1", source_ref: skill.source_ref, series_id: skill.series_id, revision: "1", installed: true, enabled: true, installed_at: skill.skill_updated_at, updated_at: skill.skill_updated_at, display_name: skill.name, summary: "", source_status: "active", skill_updated_at: skill.skill_updated_at, example_prompts: [], category_keys: [], product: skill.product, tags: [] }
const finalized = { intent_id: "intent-1", phase: "completed", skill, installation, replayed: false }
function respond(data: unknown, status = 200) { return new Response(JSON.stringify({ data }), { status, headers }) }
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
it("consumes full owner Begin/Complete/Finalize/Get, binds proof and emits actual zero-body Finalize", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(respond(begin, 201)).mockResolvedValueOnce(respond(complete)).mockResolvedValueOnce(respond(finalized)).mockResolvedValueOnce(respond({ intent_id: "intent-1", skill_id: "series-1", phase: "completed", expires_at, skill, upload_proof: proof }))
  vi.stubGlobal("fetch", fetchMock)
  const client = createSkillLocalImportClient()
  await expect(client.begin(request, "begin-key")).resolves.toEqual(begin)
  await expect(client.complete("intent-1", completeRequest, "complete-key")).resolves.toEqual(complete)
  await expect(client.finalize("intent-1", "finalize-key")).resolves.toEqual(finalized)
  const state = await client.get("intent-1")
  expect(state).not.toHaveProperty("installation")
  expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(["/api/hub/skills/local-imports", "/api/hub/skills/local-imports/intent-1/complete", "/api/hub/skills/local-imports/intent-1/finalize", "/api/hub/skills/local-imports/intent-1"])
  expect(fetchMock.mock.calls[2]?.[1]).not.toHaveProperty("body")
  expect(fetchMock.mock.calls[2]?.[1].headers).not.toHaveProperty("content-type")
  expect(fetchMock.mock.calls[3]?.[1].headers).not.toHaveProperty("idempotency-key")
})
it.each(["upload_id", "source_version_id", "content_sha256", "size_bytes"])("rejects Complete proof mismatch %s", async (field) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond({ ...complete, upload_proof: { ...proof, [field]: field === "size_bytes" ? "4" : "wrong" } })))
  await expect(createSkillLocalImportClient().complete("intent-1", completeRequest, "key")).rejects.toMatchObject({ reason: "parse" })
})
it.each([
  { ...begin, extra: true }, { ...begin, replayed: undefined }, { ...begin, phase: "completed" },
])("rejects partial/extra/misphased Begin", async (data) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(data, 201)))
  await expect(createSkillLocalImportClient().begin(request, "key")).rejects.toMatchObject({ reason: "parse" })
})
it("rejects foreign intent, mismatched installation identity and publisher-profile substitution", async () => {
  for (const data of [{ ...finalized, intent_id: "other" }, { ...finalized, installation: { ...installation, source_ref: "skill:other" } }, { ...finalized, skill: { ...skill, publisher_profile: { kind: "user", id: "x", status: "missing" } } }]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(data)))
    await expect(createSkillLocalImportClient().finalize("intent-1", "key")).rejects.toMatchObject({ reason: "parse" })
  }
})
it("preserves phase projection without synthesizing transfer, scan or completed installation", () => {
  expect(localImportGetSchema.safeParse({ intent_id: "intent-1", skill_id: "series-1", phase: "upload_pending", expires_at }).success).toBe(true)
  expect(localImportGetSchema.safeParse({ intent_id: "intent-1", skill_id: "series-1", phase: "uploaded", expires_at, upload_proof: proof }).success).toBe(true)
  for (const data of [{ phase: "upload_pending", upload_proof: proof }, { phase: "uploaded" }, { phase: "uploaded", upload_proof: proof, scan_state: "clean" }, { phase: "completed", skill, upload_proof: proof, installation: { ...installation, series_id: "foreign" } }, { phase: "rejected", upload_proof: proof }]) expect(localImportGetSchema.safeParse({ intent_id: "intent-1", skill_id: "series-1", expires_at, ...data }).success).toBe(false)
})
it.each([[401, "session_authentication_required"], [401, "session_invalid"], [403, "service_auth_failed"], [403, "session_forbidden"], [403, "product_tenant_forbidden"], [429, "session_rate_limited"], [429, "local_skill_import_rate_limited"], [412, "local_skill_import_precondition_failed"], [503, "product_tenant_not_configured"], [503, "iam_admission_unavailable"]] as const)("accepts Get common error %i/%s without inventing Retry-After", async (status, code) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code, message: "owner", retryable: false } }), { status, headers })))
  await expect(createSkillLocalImportClient().get("intent-1")).rejects.toMatchObject({ reason: "http", status, code })
})
it.each([[403, "skill_forbidden"], [429, "skill_rate_limited"], [409, "local_skill_import_idempotency_conflict"]] as const)("accepts write error but rejects it on read %i/%s", async (status, code) => {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: { code, message: "owner", retryable: false } }), { status, headers })))
  vi.stubGlobal("fetch", fetchMock)
  await expect(createSkillLocalImportClient().finalize("intent-1", "key")).rejects.toMatchObject({ reason: "http", status, code })
  await expect(createSkillLocalImportClient().get("intent-1")).rejects.toMatchObject({ reason: "parse" })
})
it.each([[400, "session_invalid"], [502, "skill_response_invalid"], [503, "local_skill_import_not_found"]] as const)("rejects error-family or status crossover %i/%s", async (status, code) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code, message: "owner", retryable: false } }), { status, headers })))
  await expect(createSkillLocalImportClient().get("intent-1")).rejects.toMatchObject({ reason: "parse" })
})
it("caps actual streamed bytes and cancels body", async () => {
  const cancel = vi.fn(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(1_048_577)) }, cancel }), { headers })))
  await expect(createSkillLocalImportClient().get("intent-1")).rejects.toMatchObject({ reason: "parse" })
  expect(cancel).toHaveBeenCalledOnce()
})
it.each(["get", "finalize"] as const)("total %s deadline includes body stream which never closes", async (operation) => {
  vi.useFakeTimers(); const cancel = vi.fn()
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }), { headers })))
  const client = createSkillLocalImportClient()
  const assertion = expect(operation === "get" ? client.get("intent-1") : client.finalize("intent-1", "key")).rejects.toMatchObject({ reason: "network" })
  await vi.advanceTimersByTimeAsync(operation === "get" ? 10_000 : 20_000)
  await assertion
  expect(cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
})
it("caller abort cancels blocked response body", async () => {
  const controller = new AbortController(); const cancel = vi.fn()
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }), { headers })))
  const result = createSkillLocalImportClient().get("intent-1", controller.signal)
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  controller.abort()
  await expect(result).rejects.toMatchObject({ reason: "aborted" })
  expect(cancel).toHaveBeenCalledOnce()
})

it("Finalize accepts only its fixed active personal owner and installed/enabled receipt, while Get keeps current facts", async () => {
  const variants = [
    { ...finalized, installation: { ...installation, enabled: false } },
    { ...finalized, installation: { ...installation, installed: false, enabled: false, removed_at: installation.updated_at } },
    { ...finalized, skill: { ...skill, status: "disabled" } },
    { ...finalized, installation: { ...installation, source_status: "disabled" } },
    { ...finalized, installation: { ...installation, product: { ...installation.product, publication_audience: "catalog" } } },
    { ...finalized, installation: { ...installation, product: { ...installation.product, source_kind: "official" } } },
    { ...finalized, skill: { ...skill, product: { ...skill.product, publication_audience: "catalog" } } },
    { ...finalized, skill: { ...skill, product: { ...skill.product, source_kind: "official" } } },
  ]
  for (const data of variants) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(data)))
    await expect(createSkillLocalImportClient().finalize("intent-1", "key")).rejects.toMatchObject({ reason: "parse" })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond({ ...data, replayed: true })))
    await expect(createSkillLocalImportClient().finalize("intent-1", "key")).rejects.toMatchObject({ reason: "parse" })
  }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond({ intent_id: "intent-1", skill_id: "series-1", phase: "completed", expires_at, upload_proof: proof, skill: { ...skill, status: "disabled" }, installation: { ...installation, enabled: false } })))
  await expect(createSkillLocalImportClient().get("intent-1")).resolves.toMatchObject({ skill: { status: "disabled" }, installation: { enabled: false } })
})
