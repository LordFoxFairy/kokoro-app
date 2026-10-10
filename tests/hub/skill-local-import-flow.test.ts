import { afterEach, expect, it, vi } from "vitest"
import { HubClientError } from "@/hub/client"
import { localImportBeginSchema, localImportCompleteSchema, localImportFinalizeSchema, localImportGetSchema } from "@/hub/skill-local-import.schema"
import { createPersonalSkillImportFlow, LOCAL_IMPORT_LOCATOR_KEY } from "@/ui/skills/personal-skill-import-flow"
const sha = "a".repeat(64), expiry = "2999-01-01T00:00:00Z"
const begin = localImportBeginSchema.parse({ intent_id: "intent", skill_id: "series", phase: "upload_pending", upload_id: "upload", transfer_reference: { method: "PUT", url: "https://objects.example/put", required_headers: { "content-type": "application/zip" }, expires_at: expiry }, expires_at: expiry, replayed: false })
const proof = { upload_id: "upload", asset_id: "asset", source_version_id: "real-version", size_bytes: "3", content_sha256: sha }
const complete = localImportCompleteSchema.parse({ intent_id: "intent", skill_id: "series", phase: "uploaded", upload_proof: proof, scan_state: "clean", expires_at: expiry, replayed: false })
const skill = { skill_id: "revision", source_ref: "skill:revision", series_id: "series", revision: "1", status: "active", name: "Owner name", summary: "owner summary", tags: [], example_prompts: [], category_keys: [], skill_updated_at: "2026-10-10T00:00:00Z", product: { publication_audience: "owner", state_version: "4", source_kind: "personal" }, package_phase: "valid" }
const installation = { installation_id: "installation", source_ref: skill.source_ref, series_id: skill.series_id, revision: "1", installed: true, enabled: true, installed_at: skill.skill_updated_at, updated_at: skill.skill_updated_at, display_name: skill.name, summary: skill.summary, source_status: "active", skill_updated_at: skill.skill_updated_at, example_prompts: [], category_keys: [], product: skill.product, tags: [] }
const finalized = localImportFinalizeSchema.parse({ intent_id: "intent", phase: "completed", skill, installation, replayed: false })
function client() { return { begin: vi.fn().mockResolvedValue(begin), putPackage: vi.fn().mockResolvedValue({ source_version_id: "real-version" }), complete: vi.fn().mockResolvedValue(complete), finalize: vi.fn().mockResolvedValue(finalized), get: vi.fn().mockResolvedValue(localImportGetSchema.parse({ intent_id: "intent", skill_id: "series", phase: "uploaded", upload_proof: proof, expires_at: expiry })) } }
function flow(c = client(), subject = "alice") { let n = 0; return createPersonalSkillImportFlow({ client: c, subject, storage: window.sessionStorage, hash: async () => sha, key: () => `key-${++n}` }) }
afterEach(() => { window.sessionStorage.clear(); vi.useRealTimers() })
it("imports one actual archive through all stages with real PUT proof and owner metadata only", async () => {
  const c = client(), f = flow(c), file = new File(["zip"], "mine.skill")
  await f.select(file)
  expect(c.begin).toHaveBeenCalledWith({ filename: "mine.skill", size_bytes: 3, content_sha256: sha }, "key-1", expect.any(AbortSignal))
  expect(c.putPackage).toHaveBeenCalledWith(begin.transfer_reference, file, expect.any(AbortSignal))
  expect(c.complete).toHaveBeenCalledWith("intent", { upload_id: "upload", source_version_id: "real-version", size_bytes: 3, content_sha256: sha }, "key-2", expect.any(AbortSignal))
  expect(c.finalize).toHaveBeenCalledWith("intent", "key-3", expect.any(AbortSignal))
  expect(f.getSnapshot()).toMatchObject({ kind: "completed", skill: { name: "Owner name" }, installed: true })
  expect(window.sessionStorage.getItem(LOCAL_IMPORT_LOCATOR_KEY)).toBeNull()
})
it("unknown Complete keeps original body/key and proof frozen across retry, never re-PUT or re-Begin", async () => {
  const c = client(); c.complete.mockRejectedValueOnce(new HubClientError("network", "unknown", null, null))
  const f = flow(c); await f.select(new File(["zip"], "mine.zip"))
  expect(f.getSnapshot()).toMatchObject({ kind: "unknown", stage: "complete" })
  await f.select(new File(["other"], "other.zip")); expect(c.begin).toHaveBeenCalledOnce()
  await f.retry()
  expect(c.complete.mock.calls[1]?.slice(0, 3)).toEqual(c.complete.mock.calls[0]?.slice(0, 3))
  expect(Object.isFrozen(c.complete.mock.calls[0]?.[1])).toBe(true)
  expect(c.putPackage).toHaveBeenCalledOnce(); expect(c.begin).toHaveBeenCalledOnce()
})
it("late Begin after close cannot transfer, finalize, notify completion or replace the original key", async () => {
  let resolve!: (v: typeof begin) => void
  const c = client(); c.begin.mockImplementationOnce(() => new Promise((r) => { resolve = r }))
  const f = flow(c), running = f.select(new File(["zip"], "mine.zip"))
  await vi.waitFor(() => expect(c.begin).toHaveBeenCalledOnce())
  f.cancel(); resolve(begin); await running
  expect(c.begin.mock.calls[0]?.[2].aborted).toBe(true)
  expect(c.putPackage).not.toHaveBeenCalled(); expect(c.finalize).not.toHaveBeenCalled()
  expect(f.getSnapshot()).toMatchObject({ kind: "unknown", stage: "begin" })
  await f.retry(); expect(c.begin.mock.calls[1]?.slice(0, 2)).toEqual(c.begin.mock.calls[0]?.slice(0, 2))
})
it("persists only account-bound locator, restores uploaded proof without inventing PUT and uses explicit Finalize", async () => {
  window.sessionStorage.setItem(LOCAL_IMPORT_LOCATOR_KEY, JSON.stringify({ subject: "alice", intent_id: "intent", expires_at: expiry }))
  const c = client(), f = flow(c)
  expect(f.getSnapshot().kind).toBe("recoverable")
  await f.restore(); expect(c.finalize).not.toHaveBeenCalled()
  expect(JSON.parse(window.sessionStorage.getItem(LOCAL_IMPORT_LOCATOR_KEY)!)).toEqual({ subject: "alice", intent_id: "intent", expires_at: expiry })
  await f.continue(); expect(c.finalize).toHaveBeenCalledOnce(); expect(c.putPackage).not.toHaveBeenCalled()
})
it("pending reload has no File/Begin key and must explicitly reselect, never blindly create an intent", async () => {
  window.sessionStorage.setItem(LOCAL_IMPORT_LOCATOR_KEY, JSON.stringify({ subject: "alice", intent_id: "intent", expires_at: expiry }))
  const c = client(); c.get.mockResolvedValue(localImportGetSchema.parse({ intent_id: "intent", skill_id: "series", phase: "upload_pending", expires_at: expiry }))
  const f = flow(c); await f.restore()
  expect(f.getSnapshot().kind).toBe("reselect")
  expect(c.begin).not.toHaveBeenCalled(); expect(c.putPackage).not.toHaveBeenCalled()
  await f.select(new File(["zip"], "mine.zip")); expect(c.begin).not.toHaveBeenCalled()
  f.replace(); await f.select(new File(["zip"], "mine.zip")); expect(c.begin).toHaveBeenCalledOnce()
})
it("completed Get without installation is real imported metadata, not invented installed success", async () => {
  window.sessionStorage.setItem(LOCAL_IMPORT_LOCATOR_KEY, JSON.stringify({ subject: "alice", intent_id: "intent", expires_at: expiry }))
  const c = client(); c.get.mockResolvedValue(localImportGetSchema.parse({ intent_id: "intent", skill_id: "series", phase: "completed", expires_at: expiry, upload_proof: proof, skill }))
  const f = flow(c); await f.restore()
  expect(f.getSnapshot()).toMatchObject({ kind: "completed", installed: false })
  expect(c.finalize).not.toHaveBeenCalled(); expect(c.putPackage).not.toHaveBeenCalled()
})
it("fresh GET 401/403 stays closed and cannot continue a previously restored upload", async () => {
  window.sessionStorage.setItem(LOCAL_IMPORT_LOCATOR_KEY, JSON.stringify({ subject: "alice", intent_id: "intent", expires_at: expiry }))
  const c = client(), f = flow(c); await f.restore()
  c.get.mockRejectedValueOnce(new HubClientError("http", "denied", "session_forbidden", 403))
  await f.restore(); await f.continue()
  expect(f.getSnapshot().kind).toBe("rejected"); expect(c.finalize).not.toHaveBeenCalled()
})
it("account change/expiry clear locator, unadmitted boundary cancels and never authorizes requests", async () => {
  window.sessionStorage.setItem(LOCAL_IMPORT_LOCATOR_KEY, JSON.stringify({ subject: "alice", intent_id: "intent", expires_at: expiry }))
  const c = client(), bob = flow(c, "bob"); expect(bob.getSnapshot().kind).toBe("idle"); expect(window.sessionStorage.getItem(LOCAL_IMPORT_LOCATOR_KEY)).toBeNull()
  bob.setAdmitted(false); await bob.select(new File(["zip"], "mine.zip")); expect(c.begin).not.toHaveBeenCalled()
  window.sessionStorage.setItem(LOCAL_IMPORT_LOCATOR_KEY, JSON.stringify({ subject: "bob", intent_id: "intent", expires_at: "2000-01-01T00:00:00Z" }))
  expect(flow(c, "bob").getSnapshot().kind).toBe("idle"); expect(window.sessionStorage.getItem(LOCAL_IMPORT_LOCATOR_KEY)).toBeNull()
})
it("rejects foreign reserved series ACK and prevents Finalize", async () => {
  const c = client(); c.complete.mockResolvedValue({ ...complete, skill_id: "foreign" })
  const f = flow(c); await f.select(new File(["zip"], "mine.zip"))
  expect(f.getSnapshot()).toMatchObject({ kind: "unknown", stage: "complete" }); expect(c.finalize).not.toHaveBeenCalled()
})
it("ignores duplicate select and Finalize while a frozen command is pending", async () => {
  let resolve!: (v: typeof finalized) => void
  const c = client(); c.finalize.mockImplementationOnce(() => new Promise((r) => { resolve = r }))
  const f = flow(c), running = f.select(new File(["zip"], "mine.zip"))
  await vi.waitFor(() => expect(c.finalize).toHaveBeenCalledOnce())
  await f.retry(); await f.select(new File(["zip"], "other.zip")); expect(c.finalize).toHaveBeenCalledOnce(); expect(c.begin).toHaveBeenCalledOnce()
  resolve(finalized); await running
})

it("unknown Complete GET recovery binds proof to frozen original body and rejects a different version", async () => {
  const c = client(); c.complete.mockRejectedValueOnce(new HubClientError("network", "unknown", null, null))
  const f = flow(c); await f.select(new File(["zip"], "mine.zip"))
  c.get.mockResolvedValue(localImportGetSchema.parse({ intent_id: "intent", skill_id: "series", phase: "uploaded", expires_at: expiry, upload_proof: { ...proof, source_version_id: "foreign-version" } }))
  await f.restore(); await f.continue()
  expect(f.getSnapshot()).toMatchObject({ kind: "unknown", stage: "get" })
  expect(c.finalize).not.toHaveBeenCalled()
})
it("restored uploaded Finalize must match the reserved series and never fabricate another binding", async () => {
  window.sessionStorage.setItem(LOCAL_IMPORT_LOCATOR_KEY, JSON.stringify({ subject: "alice", intent_id: "intent", expires_at: expiry }))
  const c = client(), f = flow(c); await f.restore()
  c.finalize.mockResolvedValue({ ...finalized, skill: { ...finalized.skill, series_id: "foreign" }, installation: { ...finalized.installation, series_id: "foreign" } })
  await f.continue()
  expect(f.getSnapshot()).toMatchObject({ kind: "unknown", stage: "finalize" })
})
it("hashing is finite and caller cancellation stops even an uncooperative file reader", async () => {
  vi.useFakeTimers(); const c = client()
  const f = createPersonalSkillImportFlow({ client: c, subject: "alice", hash: () => new Promise(() => {}) })
  const running = f.select(new File(["zip"], "mine.zip"))
  await vi.advanceTimersByTimeAsync(20_000); await running
  expect(f.getSnapshot().kind).toBe("reselect"); expect(c.begin).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0)
})
