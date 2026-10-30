import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { waitFor } from "@testing-library/react"
import { makeSnapshot } from "../core/fixtures"

import { admitBrowserAuthSessionIndexes, bindBrowserMessagePartsReadRecheck, browserEngine, invalidateBrowserAuthSessionIndexes, releaseBrowserEngine, retainBrowserEngine, browserDraftLifecycle, browserConversationMoveCoordinator, browserListClient, readBrowserAuthIndexSubject } from "@/ui/shell/page-clients"

it("binds live ordered history to Product admission and repeats only the exact failed page GET", async () => {
  window.localStorage.clear(); window.sessionStorage.clear()
  admitBrowserAuthSessionIndexes("parts-read-actor", null)
  const recover = vi.fn(async (signal: AbortSignal) => !signal.aborted)
  const capture = vi.fn((subject: string) => subject === "parts-read-actor" ? recover : undefined)
  const unbind = bindBrowserMessagePartsReadRecheck(capture)
  const base = { session_id: "s", message_id: "m", run_id: "r", format_version: 1, revision: "7", event_watermark: null }
  const text = { kind: "text", part_id: "opaque", segment_id: "segment", first_sequence: "1", latest_sequence: "7", text: "a", offset: "0", end: "1", total_scalars: "2", completed: true }
  let parts = 0
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    expect(init?.method ?? "GET").toBe("GET")
    if (url.includes("/parts?")) {
      parts++
      if (parts === 1) return Response.json({ ...base, items: [text], next_cursor: "opaque-next" })
      if (parts === 2) return Response.json({ error: { code: "unauthenticated" } }, { status: 401 })
      return Response.json({ ...base, items: [{ ...text, text: "b", offset: "1", end: "2" }], next_cursor: null })
    }
    return Response.json(makeSnapshot({ sessionId: "s", messages: [{ message_id: "m", role: "assistant", run_id: "r", content: null, status: "completed", created_at: "now", rendering: { mode: "ordered", format_version: 1, revision: "7", event_watermark: null, parts_cursor: "opaque-initial" } }] }))
  })
  vi.stubGlobal("fetch", fetchMock)
  const engine = browserEngine({ preview: false, scope: { kind: "project", projectRef: "parts-auth-scope" }, messagePartsReadTarget: { scope: { kind: "project", projectRef: "parts-auth-scope" }, conversationId: "s" } })!
  try {
    engine.openConversation("s")
    await waitFor(() => expect(engine.getSnapshot().thread.messageParts?.m?.status).toBe("complete"))
    expect(engine.getSnapshot().thread.messages.filter(message => message.role === "assistant" && !message.orderedContainer).map(message => message.content)).toEqual(["ab"])
    const calls = fetchMock.mock.calls.filter(([url]) => url.includes("/parts?"))
    expect(calls).toHaveLength(3)
    expect(calls[1]![0]).toBe(calls[2]![0])
    expect(calls.every(([url]) => new URL(url, "http://localhost").searchParams.get("project_ref") === "parts-auth-scope")).toBe(true)
    expect(capture).toHaveBeenCalledWith("parts-read-actor")
    expect(recover).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls.every(call => !(call[1] as RequestInit | undefined)?.method || (call[1] as RequestInit).method === "GET")).toBe(true)
  } finally { engine.dispose(); releaseBrowserEngine(engine); unbind(); invalidateBrowserAuthSessionIndexes(); vi.unstubAllGlobals(); window.localStorage.clear(); window.sessionStorage.clear() }
})

describe("页面 Chat client transport selection", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("显式 live 模式不被开发环境的 preview 开关劫持", async () => {
    vi.stubEnv("NEXT_PUBLIC_SESSION_PREVIEW", "1")
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sessions: [], next_cursor: null }), { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await browserListClient({ preview: false }).listSessions()

    expect(fetchMock).toHaveBeenCalledWith("/api/session/sessions?scope=direct", {
      cache: "no-store",
      signal: expect.any(AbortSignal),
    })
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect((options.signal as AbortSignal).aborted).toBe(false)
  })

  it("BFCache 恢复后再次 pagehide 仍撤销页面 Move 槽", async () => {
    const coordinator = browserConversationMoveCoordinator()
    coordinator.revokeSubject()
    coordinator.admitVerifiedSubject("subject-pagehide")
    window.dispatchEvent(new Event("pagehide"))
    coordinator.admitVerifiedSubject("subject-pagehide")
    window.dispatchEvent(new Event("pagehide"))
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await expect(coordinator.start({
      sourceScopeKey: "direct",
      sessionId: "00000000-0000-4000-8000-000000000301",
      targetProjectId: "00000000-0000-4000-8000-000000000302",
    })).resolves.toMatchObject({ status: "rejected", commandId: "" })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})


// These values exercise existing browser-owned storage boundaries; subjects
// enter only through the existing verified-subject admission function.
const SUBJECT_MARKER = "kokoro.web.auth-index-subject"
const DRAFTS = "kokoro.web.drafts"
const PROJECT_DRAFTS = [
  "kokoro.web.pending-project-draft:project_00000000-0000-4000-8000-000000000301",
  "kokoro.web.pending-project-draft:project_00000000-0000-4000-8000-000000000302",
]
const CREATION = "kokoro.web.pending-creation-intent"
const INDEX = "kokoro.web.conversations.direct"
const UNRELATED = "r252-unrelated-preference"
const draftBody = JSON.stringify({ __pending__: "ordinary first\nordinary second", "__project__:project_00000000-0000-4000-8000-000000000301": "project first\nproject second" })

describe("verified-subject draft admission fence", () => {
  beforeEach(() => {
    window.localStorage.setItem(SUBJECT_MARKER, "subject-A")
    window.localStorage.setItem(DRAFTS, draftBody)
    window.localStorage.setItem(INDEX, "old-index")
    for (const key of PROJECT_DRAFTS) window.sessionStorage.setItem(key, "project first\nproject second")
    window.sessionStorage.setItem(CREATION, "project")
    window.localStorage.setItem(UNRELATED, "keep-local")
    window.sessionStorage.setItem(UNRELATED, "keep-session")
  })
  afterEach(() => {
    vi.restoreAllMocks()
    for (const key of [SUBJECT_MARKER, DRAFTS, INDEX, UNRELATED]) window.localStorage.removeItem(key)
    for (const key of [...PROJECT_DRAFTS, CREATION, UNRELATED]) window.sessionStorage.removeItem(key)
  })

  it.each(["drafts", "project-drafts", "creation"] as const)("clears %s before admitting a different verified subject", (kind) => {
    expect(admitBrowserAuthSessionIndexes("subject-B", "subject-A")).toBe(true)
    expect(readBrowserAuthIndexSubject()).toBe("subject-B")
    expect(window.localStorage.getItem(INDEX)).toBeNull()
    if (kind === "drafts") expect(window.localStorage.getItem(DRAFTS)).toBeNull()
    if (kind === "project-drafts") for (const key of PROJECT_DRAFTS) expect(window.sessionStorage.getItem(key)).toBeNull()
    if (kind === "creation") expect(window.sessionStorage.getItem(CREATION)).toBeNull()
    expect(window.localStorage.getItem(UNRELATED)).toBe("keep-local")
    expect(window.sessionStorage.getItem(UNRELATED)).toBe("keep-session")
  })

  it("preserves all three draft/creation categories on same-subject refresh", () => {
    expect(admitBrowserAuthSessionIndexes("subject-A", "subject-A")).toBe(true)
    expect(window.localStorage.getItem(DRAFTS)).toBe(draftBody)
    for (const key of PROJECT_DRAFTS) expect(window.sessionStorage.getItem(key)).toBe("project first\nproject second")
    expect(window.sessionStorage.getItem(CREATION)).toBe("project")
    expect(window.localStorage.getItem(INDEX)).toBe("old-index")
  })

  it("rejects a late admission after another subject changed the marker without clearing its data", () => {
    window.localStorage.setItem(SUBJECT_MARKER, "subject-C")
    expect(admitBrowserAuthSessionIndexes("subject-B", "subject-A")).toBe(false)
    expect(readBrowserAuthIndexSubject()).toBe("subject-C")
    expect(window.localStorage.getItem(DRAFTS)).toBe(draftBody)
    for (const key of PROJECT_DRAFTS) expect(window.sessionStorage.getItem(key)).toBe("project first\nproject second")
    expect(window.sessionStorage.getItem(CREATION)).toBe("project")
  })

  it.each(["drafts", "project-drafts", "creation"] as const)("fails closed if clearing %s storage fails", (kind) => {
    const originalRemove = Storage.prototype.removeItem
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key: string) {
      const failing = kind === "drafts" ? this === window.localStorage && key === DRAFTS
        : this === window.sessionStorage && (kind === "project-drafts" ? key.startsWith("kokoro.web.pending-project-draft:") : key === CREATION)
      if (failing) throw new DOMException("storage blocked", "SecurityError")
      originalRemove.call(this, key)
    })
    let admitted = false
    try { admitted = admitBrowserAuthSessionIndexes("subject-B", "subject-A") } catch { /* Existing caller treats storage errors as unavailable. */ }
    expect(admitted).toBe(false)
    expect(readBrowserAuthIndexSubject()).toBe("subject-A")
  })
})


describe("explicit same-tab landing prompt admission", () => {
  const handoff = "kokoro.web.anonymous-prompt-handoff"
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); window.sessionStorage.removeItem(handoff); window.localStorage.removeItem(SUBJECT_MARKER); window.localStorage.removeItem(DRAFTS) })
  it("keeps same-subject conversation drafts and consumes only the fresh explicit prompt once", () => {
    window.localStorage.setItem(SUBJECT_MARKER, "subject-A")
    window.localStorage.setItem(DRAFTS, JSON.stringify({ conversationA: "exact existing draft", __pending__: "previous pending" }))
    window.sessionStorage.setItem(handoff, JSON.stringify([1, Date.now(), "explicit new prompt"]))
    expect(admitBrowserAuthSessionIndexes("subject-A", "subject-A")).toBe(true)
    expect(JSON.parse(window.localStorage.getItem(DRAFTS) ?? "{}")).toEqual({ conversationA: "exact existing draft", __pending__: "explicit new prompt" })
    expect(window.sessionStorage.getItem(handoff)).toBeNull()
    window.localStorage.setItem(DRAFTS, JSON.stringify({ conversationA: "exact existing draft", __pending__: "edited after admission" }))
    expect(admitBrowserAuthSessionIndexes("subject-A", "subject-A")).toBe(true)
    expect(JSON.parse(window.localStorage.getItem(DRAFTS) ?? "{}").__pending__).toBe("edited after admission")
  })
})


describe("explicit prompt identity and fail-closed boundaries", () => {
  const handoff = "kokoro.web.anonymous-prompt-handoff"
  beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear() })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); window.localStorage.clear(); window.sessionStorage.clear() })
  it("clears all old actor data then only prefills the explicit prompt without sending", () => {
    window.localStorage.setItem(SUBJECT_MARKER, "subject-A")
    window.localStorage.setItem(DRAFTS, draftBody)
    window.sessionStorage.setItem(CREATION, "old creation")
    for (const key of PROJECT_DRAFTS) window.sessionStorage.setItem(key, "old project")
    window.sessionStorage.setItem(handoff, JSON.stringify([1, Date.now(), "explicit user input"]))
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    expect(admitBrowserAuthSessionIndexes("subject-B", "subject-A")).toBe(true)
    expect(JSON.parse(window.localStorage.getItem(DRAFTS) ?? "{}")).toEqual({ __pending__: "explicit user input" })
    expect(window.sessionStorage.getItem(CREATION)).toBeNull()
    for (const key of PROJECT_DRAFTS) expect(window.sessionStorage.getItem(key)).toBeNull()
    expect(window.sessionStorage.getItem(handoff)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it("does not consume or restore on a stale verified-subject race", () => {
    window.localStorage.setItem(SUBJECT_MARKER, "subject-C")
    const raw = JSON.stringify([1, Date.now(), "explicit choice"])
    window.sessionStorage.setItem(handoff, raw)
    expect(admitBrowserAuthSessionIndexes("subject-B", "subject-A")).toBe(false)
    expect(window.sessionStorage.getItem(handoff)).toBe(raw)
    expect(window.localStorage.getItem(DRAFTS)).toBeNull()
  })
  it.each(["get", "remove", "write", "marker"])("does not admit when strict handoff %s storage fails", (stage) => {
    window.localStorage.setItem(SUBJECT_MARKER, "subject-A")
    window.sessionStorage.setItem(handoff, JSON.stringify([1, Date.now(), "explicit prompt"]))
    const method = stage === "get" ? "getItem" : stage === "remove" ? "removeItem" : "setItem"
    const original = Storage.prototype[method]
    vi.spyOn(Storage.prototype, method).mockImplementation(function (this: Storage, key: string, value?: string) {
      if ((stage === "get" || stage === "remove") && this === window.sessionStorage && key === handoff ||
        stage === "write" && this === window.localStorage && key === DRAFTS ||
        stage === "marker" && this === window.localStorage && key === SUBJECT_MARKER) throw new DOMException("blocked", "SecurityError")
      return method === "setItem" ? (original as Storage["setItem"]).call(this, key, value ?? "") : (original as Storage["getItem"]).call(this, key)
    })
    expect(() => admitBrowserAuthSessionIndexes("subject-B", "subject-A")).toThrow()
    expect(window.localStorage.getItem(SUBJECT_MARKER)).toBe("subject-A")
  })
  it("does not use expired prompt as a fallback to unknown private pending", () => {
    window.localStorage.setItem(DRAFTS, draftBody)
    window.sessionStorage.setItem(handoff, JSON.stringify([1, Date.now() - 300_001, "expired choice"]))
    expect(admitBrowserAuthSessionIndexes("subject-new", null)).toBe(true)
    expect(window.localStorage.getItem(DRAFTS)).toBeNull()
    expect(window.sessionStorage.getItem(handoff)).toBeNull()
  })
})

// SET47-BEGIN: cached engine creation proof must retire on true actor switch, not renewal.
it("SET47 index invalidation retires live engine provenance without deleting a task or disposing its Run",async()=>{
 const {browserEngine,invalidateBrowserAuthSessionIndexes}=await import("@/ui/shell/page-clients");
 window.localStorage.setItem(SUBJECT_MARKER,"alice");expect(admitBrowserAuthSessionIndexes("alice","alice")).toBe(true);const engine=browserEngine({preview:false})!;engine.newConversation();const id=engine.getSnapshot().store!.activeId;
 expect(engine.getSnapshot().locallyCreatedSessionId).toBe(id);expect(admitBrowserAuthSessionIndexes("alice","alice")).toBe(true);expect(engine.getSnapshot().locallyCreatedSessionId).toBe(id);
 invalidateBrowserAuthSessionIndexes();expect(engine.getSnapshot().locallyCreatedSessionId).toBeUndefined();expect(engine.getSnapshot().store?.activeId).toBe(id);expect(engine.getSnapshot().canSubmitMessage).toBe(true);
 engine.dispose();releaseBrowserEngine(engine);
});
// SET47-END

describe("independent draft retirement persistence", () => {
  afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear() })
  it("survives stale index writes, isolates scopes and follows verified-subject cleanup", async () => {
    const drafts = browserDraftLifecycle("direct")
    const project = browserDraftLifecycle("project:one")
    expect(drafts.isUnsubmitted("conv_shared")).toBe(true)
    expect(drafts.retire("conv_shared")).toBe(true)
    window.localStorage.setItem(INDEX, JSON.stringify({ activeId: "conv_shared", conversations: [{ id: "conv_shared", title: "", updatedAt: 1, mode: "fast", localDraft: true }] }))
    expect(browserDraftLifecycle("direct").isUnsubmitted("conv_shared")).toBe(false)
    expect(project.isUnsubmitted("conv_shared")).toBe(true)
    window.localStorage.setItem(UNRELATED, "keep")
    window.localStorage.setItem(SUBJECT_MARKER, "actor-old")
    expect(admitBrowserAuthSessionIndexes("actor-new", "actor-old")).toBe(true)
    expect(drafts.isUnsubmitted("conv_shared")).toBe(true)
    expect(window.localStorage.getItem(INDEX)).toBeNull()
    expect(window.localStorage.getItem(UNRELATED)).toBe("keep")
  })
  it.each(["read", "write", "verify"])("fails closed when retirement %s is unavailable", stage => {
    const drafts = browserDraftLifecycle("direct")
    if (stage === "write") vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota") })
    else if (stage === "verify") vi.spyOn(Storage.prototype, "getItem").mockReturnValueOnce(null).mockImplementation(() => { throw new Error("blocked") })
    else vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked") })
    if (stage === "read") expect(drafts.isUnsubmitted("conv_failed")).toBe(false)
    else expect(drafts.retire("conv_failed")).toBe(false)
  })
})

it("actual browser storage retirement defeats stale-index reload without replaying a message", async () => {
  const {createSessionEngine} = await import("@/engine/machine")
  const {createPersistedStore} = await import("@/lib/persisted-store")
  const {storedConversationStoreSchema} = await import("@/core/persistence")
  const {createFakeClient,settle} = await import("../engine/fakes")
  const lifecycle = browserDraftLifecycle("direct")
  const store = createPersistedStore({key: INDEX, schema: storedConversationStoreSchema})
  const firstClient = createFakeClient()
  let engine = createSessionEngine({client: firstClient, storage: store, draftLifecycle: lifecycle, createId: prefix => `${prefix}_storage_reconstruction`})
  try {
    engine.newConversation()
    const id = engine.getSnapshot().store!.activeId
    const stale = window.localStorage.getItem(INDEX)!
    expect(JSON.parse(stale).conversations[0].localDraft).toBe(true)
    engine.submit("browser storage fixture"); await settle()
    expect(firstClient.createCalls[0]?.sessionId).toBe(id)
    window.localStorage.setItem(INDEX, stale)
    window.dispatchEvent(new StorageEvent("storage", {key: INDEX}))
    engine.openConversation(id)
    expect(engine.getSnapshot().thread.messages).not.toEqual([])
    engine.dispose()
    const nextClient = createFakeClient()
    engine = createSessionEngine({client: nextClient, storage: createPersistedStore({key: INDEX,schema: storedConversationStoreSchema}), draftLifecycle: browserDraftLifecycle("direct")})
    await settle()
    expect(nextClient.snapshotCalls).toEqual([id])
    expect(nextClient.createCalls).toEqual([])
    expect(engine.getSnapshot()).not.toHaveProperty("locallyCreatedSessionId")
  } finally { engine.dispose(); window.localStorage.clear() }
})

it("actual storage read/write failures cannot convert a positive draft into an unguarded POST", async () => {
  const {createSessionEngine} = await import("@/engine/machine")
  const {createPersistedStore} = await import("@/lib/persisted-store")
  const {storedConversationStoreSchema} = await import("@/core/persistence")
  const {createFakeClient,settle} = await import("../engine/fakes")
  const id = "conv_real_storage_failure"
  window.localStorage.setItem(INDEX, JSON.stringify({activeId:id,conversations:[{id,title:"",updatedAt:1,mode:"fast",localDraft:true}]}))
  const get = Storage.prototype.getItem
  vi.spyOn(Storage.prototype,"getItem").mockImplementation(function(this:Storage,key:string) {
    if (key.includes(".draft-retired.")) throw new Error("read blocked")
    return get.call(this,key)
  })
  vi.spyOn(Storage.prototype,"setItem").mockImplementation(() => {throw new Error("quota")})
  const client = createFakeClient()
  const engine = createSessionEngine({client,storage:createPersistedStore({key:INDEX,schema:storedConversationStoreSchema}),draftLifecycle:browserDraftLifecycle("direct")})
  try {
    await settle()
    expect(client.snapshotCalls).toEqual([id])
    expect(engine.submit("unsent on storage failure")).toBe(false)
    expect(client.createCalls).toEqual([])
  } finally {engine.dispose();vi.restoreAllMocks();window.localStorage.clear()}
})


describe("live engine factory admission before browser recovery construction", () => {
  const engines = new Set<NonNullable<ReturnType<typeof browserEngine>>>()
  const subject = "factory-admission-actor"
  function live(projectRef: string) {
    const engine = browserEngine({ preview: false, scope: { kind: "project", projectRef } })
    if (engine) engines.add(engine)
    return engine
  }
  function seed(projectRef: string) {
    const id = `conv_${projectRef}`
    const key = `kokoro.web.conversations.project:${projectRef}`
    const raw = JSON.stringify({ activeId: id, conversations: [{ id, title: "Fixture", updatedAt: 1, mode: "fast", localDraft: true }] })
    window.localStorage.setItem(key, raw)
    return { id, key, raw }
  }
  beforeEach(() => {
    invalidateBrowserAuthSessionIndexes()
    window.localStorage.clear()
    window.sessionStorage.clear()
    vi.stubGlobal("fetch", vi.fn())
  })
  afterEach(() => {
    for (const engine of engines) releaseBrowserEngine(engine)
    engines.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.localStorage.clear()
    window.sessionStorage.clear()
  })
  it("a cached marker and valid persisted index cannot create a null-subject recovery closure", () => {
    window.localStorage.setItem(SUBJECT_MARKER, subject)
    const stored = seed("before-verified-admission")
    const reads = vi.spyOn(Storage.prototype, "getItem")
    const writes = vi.spyOn(Storage.prototype, "setItem")
    expect(live("before-verified-admission")).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
    expect(reads.mock.calls.filter(([key]) => key.startsWith("kokoro.web.conversations.submission:"))).toEqual([])
    expect(writes).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(stored.key)).toBe(stored.raw)
  })
  it.each(["missing", "mismatched", "blocked"])("rejects a %s marker even after true admission, without opening recovery", kind => {
    expect(admitBrowserAuthSessionIndexes(subject, null)).toBe(true)
    const stored = seed(`marker-${kind}`)
    if (kind === "missing") window.localStorage.removeItem(SUBJECT_MARKER)
    else if (kind === "mismatched") window.localStorage.setItem(SUBJECT_MARKER, "other-subject")
    else {
      const get = Storage.prototype.getItem
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
        if (this === window.localStorage && key === SUBJECT_MARKER) throw new DOMException("blocked", "SecurityError")
        return get.call(this, key)
      })
    }
    expect(live(`marker-${kind}`)).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(stored.key)).toBe(stored.raw)
  })
  it("does not expose or dispose an already leased engine when its marker no longer matches", () => {
    expect(admitBrowserAuthSessionIndexes(subject, null)).toBe(true)
    const engine = live("leased-marker-fence")!
    const release = retainBrowserEngine(engine)
    const dispose = vi.spyOn(engine, "dispose")
    try {
      window.localStorage.setItem(SUBJECT_MARKER, "other-subject")
      expect(live("leased-marker-fence")).toBeNull()
      expect(dispose).not.toHaveBeenCalled()
      expect(fetch).not.toHaveBeenCalled()
    } finally { release() }
  })
  it("a truly admitted corrupt recovery remains an error, not null absence or ready", () => {
    expect(admitBrowserAuthSessionIndexes(subject, null)).toBe(true)
    const projectRef = "corrupt-admitted-recovery"
    const stored = seed(projectRef)
    const recoveryKey = `kokoro.web.conversations.submission:${encodeURIComponent(subject)}:${encodeURIComponent(`project:${projectRef}`)}:${encodeURIComponent(stored.id)}`
    window.sessionStorage.setItem(recoveryKey, "{broken")
    const engine = live(projectRef)!
    expect(engine).not.toBeNull()
    expect(engine.getSnapshot().machine).toMatchObject({ phase: "error", error: "local_recovery_unavailable" })
    expect(engine.getSnapshot().canSubmitMessage).toBe(false)
    expect(engine.submit("never send corrupt recovery")).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem(recoveryKey)).toBe("{broken")
  })
  it("explicit preview construction does not depend on live admission or its marker", () => {
    window.localStorage.setItem(SUBJECT_MARKER, "cached-only-preview")
    const engine = browserEngine({ preview: true, scope: { kind: "project", projectRef: "preview-without-live-admission" } })!
    engines.add(engine)
    expect(engine).not.toBeNull()
    expect(engine.getSnapshot().canSubmitMessage).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe("cold bare direct homepage selection before engine recovery", () => {
  const subject = "home-reload-reader"
  let engine: ReturnType<typeof browserEngine>
  beforeEach(() => {
    invalidateBrowserAuthSessionIndexes()
    window.localStorage.clear(); window.sessionStorage.clear()
    window.history.replaceState(null, "", "/app")
    expect(admitBrowserAuthSessionIndexes(subject, null)).toBe(true)
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(makeSnapshot({ sessionId: "owner-old" }))))
  })
  afterEach(() => {
    engine?.dispose(); releaseBrowserEngine(engine); engine = null
    vi.restoreAllMocks(); vi.unstubAllGlobals()
    window.localStorage.clear(); window.sessionStorage.clear(); window.history.replaceState(null, "", "/app")
  })
  const index = (id: string, localDraft = false) => ({ activeId: id, conversations: [{ id, title: localDraft ? "" : "Old failed task", updatedAt: 1, mode: "fast", ...(localDraft ? { localDraft: true } : {}) }] })
  const seed = (id: string, localDraft = false) => window.localStorage.setItem(INDEX, JSON.stringify(index(id, localDraft)))
  it("cold reload ignores a remembered owner active without reading, cancelling or sending to it", async () => {
    seed("owner-old")
    engine = browserEngine({ preview: false })
    expect(engine).not.toBeNull()
    expect(engine!.getSnapshot().store?.activeId).not.toBe("owner-old")
    expect(engine!.getSnapshot().locallyCreatedSessionId).toBe(engine!.getSnapshot().store?.activeId)
    expect(engine!.getSnapshot().thread.messages).toEqual([])
    expect(engine!.getSnapshot().store?.conversations).toContainEqual(index("owner-old").conversations[0])
    expect(fetch).not.toHaveBeenCalled()
  })
  it("a truly absent index stays unallocated so the original pending or login-handoff draft is not shadowed", () => {
    const text = JSON.stringify({ __pending__: "explicit landing prompt\nkeep exact text" })
    window.localStorage.setItem(DRAFTS, text)
    engine = browserEngine({ preview: false })!
    expect(engine.getSnapshot().store).toBeNull()
    expect(window.localStorage.getItem(INDEX)).toBeNull()
    expect(window.localStorage.getItem(DRAFTS)).toBe(text)
    expect(fetch).not.toHaveBeenCalled()
  })
  it("reuses an exact positive unsubmitted local draft and leaves its saved text untouched", () => {
    seed("home-local", true)
    const body = JSON.stringify({ "home-local": "keep exact unsent text\n🦊" })
    window.localStorage.setItem(DRAFTS, body)
    engine = browserEngine({ preview: false })
    expect(engine!.getSnapshot().store?.activeId).toBe("home-local")
    expect(engine!.getSnapshot().locallyCreatedSessionId).toBe("home-local")
    expect(window.localStorage.getItem(DRAFTS)).toBe(body)
    expect(fetch).not.toHaveBeenCalled()
  })
  it("a stale localDraft flag cannot override its independent retirement proof", () => {
    seed("retired-local", true)
    expect(browserDraftLifecycle("direct").retire("retired-local")).toBe(true)
    engine = browserEngine({ preview: false })
    expect(engine!.getSnapshot().store?.activeId).not.toBe("retired-local")
    expect(engine!.getSnapshot().locallyCreatedSessionId).toBe(engine!.getSnapshot().store?.activeId)
    expect(fetch).not.toHaveBeenCalled()
  })
  it("New then a peer's old-active write still reloads as home while every old entry remains", () => {
    seed("owner-old")
    engine = browserEngine({ preview: false })!
    engine.newConversation()
    const afterNew = engine.getSnapshot().store!
    engine.dispose(); releaseBrowserEngine(engine); engine = null
    window.localStorage.setItem(INDEX, JSON.stringify({ ...afterNew, activeId: "owner-old" }))
    ;(fetch as ReturnType<typeof vi.fn>).mockClear()
    engine = browserEngine({ preview: false })
    expect(engine!.getSnapshot().store?.activeId).not.toBe("owner-old")
    expect(engine!.getSnapshot().thread.messages).toEqual([])
    expect(engine!.getSnapshot().store?.conversations).toEqual(expect.arrayContaining(afterNew.conversations))
    expect(fetch).not.toHaveBeenCalled()
  })
  it("keeps the exact hidden pending journal on home and replays only its original body/key after explicit reopening", async () => {
    const { createBrowserSubmissionRecovery } = await import("@/ui/shell/browser-submission-recovery")
    const recovery = createBrowserSubmissionRecovery({ subject, scope: { kind: "direct" }, isCurrent: () => readBrowserAuthIndexSubject() === subject, storage: () => window.sessionStorage })
    const original = { sessionId: "pending-local", optimisticUserId: "original-user", idempotencyKey: "original-home-key", content: "original unknown text", options: { mode: "fast" as const, model: null, selectedSkillSourceRefs: ["skill:original"], selectedMcpConnectionIds: ["connection-original"] } }
    expect(recovery.save(original)).toBe(true)
    recovery.failure(original, "network")
    seed(original.sessionId, true)
    const raw = Object.fromEntries(Object.keys(window.sessionStorage).map(key => [key, window.sessionStorage.getItem(key)]))
    engine = browserEngine({ preview: false })!
    expect(engine.getSnapshot().store?.activeId).not.toBe(original.sessionId)
    expect(engine.getSnapshot().thread.messages).toEqual([])
    expect(Object.fromEntries(Object.keys(window.sessionStorage).map(key => [key, window.sessionStorage.getItem(key)]))).toEqual(raw)
    expect(fetch).not.toHaveBeenCalled()
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === "POST") throw Error("offline explicit retry")
      return Response.json({ error: { code: "session_not_found", message: "Not found" } }, { status: 404 })
    })
    engine.openConversation(original.sessionId)
    await waitFor(() => expect(engine!.getSnapshot().canRetryPendingSubmission).toBe(true))
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true)
    engine.retry()
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST")).toBe(true))
    const post = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "POST")!
    expect(JSON.parse(String(post[1]?.body))).toMatchObject({ content: original.content,
      selected_skill_source_refs: original.options.selectedSkillSourceRefs, selected_mcp_connection_ids: original.options.selectedMcpConnectionIds })
    expect(new Headers(post[1]?.headers).get("idempotency-key")).toBe(original.idempotencyKey)
    expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1)
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => ["GET", "POST"].includes(init?.method ?? "GET"))).toBe(true)
  })
  it("does not publish an engine if the actor changes during the local home index write", () => {
    seed("owner-old")
    const set = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      set.call(this, key, value)
      if (this === window.localStorage && key === INDEX) set.call(this, SUBJECT_MARKER, "replacement-home-actor")
    })
    engine = browserEngine({ preview: false })
    expect(engine).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
  it("does not mistake a failed local index write for a persisted home draft", () => {
    seed("owner-old")
    const original = window.localStorage.getItem(INDEX)
    const set = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (this === window.localStorage && key === INDEX) throw Error("quota")
      set.call(this, key, value)
    })
    engine = browserEngine({ preview: false })
    expect(engine).toBeNull()
    expect(window.localStorage.getItem(INDEX)).toBe(original)
    expect(fetch).not.toHaveBeenCalled()
  })
  it("a repeated committed factory read keeps the same home draft without a second allocation", () => {
    seed("owner-old")
    engine = browserEngine({ preview: false })!
    const id = engine.getSnapshot().store?.activeId
    const raw = window.localStorage.getItem(INDEX)
    expect(browserEngine({ preview: false })).toBe(engine)
    expect(engine.getSnapshot().store?.activeId).toBe(id)
    expect(window.localStorage.getItem(INDEX)).toBe(raw)
    expect(fetch).not.toHaveBeenCalled()
  })
  it("an explicit query id retains owner restoration instead of receiving a homepage draft", async () => {
    seed("owner-old")
    window.history.replaceState(null, "", "/app?conversation=owner-old")
    engine = browserEngine({ preview: false })
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    expect(engine!.getSnapshot().store?.activeId).toBe("owner-old")
  })
  it("blocked lifecycle proof does not fabricate an empty owner's absence or open a Run", () => {
    seed("blocked-local", true)
    const original = window.localStorage.getItem(INDEX)
    const get = Storage.prototype.getItem
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      if (key.includes(".draft-retired.")) throw Error("lifecycle unavailable")
      return get.call(this, key)
    })
    engine = browserEngine({ preview: false })
    expect(engine).toBeNull()
    expect(window.localStorage.getItem(INDEX)).toBe(original)
    expect(fetch).not.toHaveBeenCalled()
  })
})

it("visible parts browser factory defaults closed before Project remembered constructor hydration", async () => {
  invalidateBrowserAuthSessionIndexes(); window.localStorage.clear(); window.sessionStorage.clear()
  const scope = { kind: "project" as const, projectRef: "cold-visible-parts" }, subject = "cold-visible-reader"
  window.history.replaceState(null, "", `/app/project/${scope.projectRef}`)
  expect(admitBrowserAuthSessionIndexes(subject, null)).toBe(true)
  const index = { activeId: "s", conversations: [{ id: "s", title: "remembered", mode: "fast", updatedAt: 1 }] }
  window.localStorage.setItem(`kokoro.web.conversations.project:${scope.projectRef}`, JSON.stringify(index))
  let parts = 0
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/parts?")) { parts++; throw Error("hidden body must not read") }
    return Response.json(makeSnapshot({ sessionId: "s", messages: [{ message_id: "m", role: "assistant", run_id: "r", content: null, status: "completed", created_at: "now", rendering: { mode: "ordered", format_version: 1, revision: "7", event_watermark: null, parts_cursor: "original" } }] }))
  }))
  const current = browserEngine({ preview: false, scope })!
  try {
    await waitFor(() => expect(current.getSnapshot().hydrating).toBe(false))
    expect(current.getSnapshot().ownerConfirmedSessionId).toBe("s")
    expect(current.getSnapshot().store?.activeId).toBe("s")
    expect(parts).toBe(0)
    expect(JSON.parse(window.localStorage.getItem(`kokoro.web.conversations.project:${scope.projectRef}`)!)).toMatchObject({ activeId: "s", conversations: [{ id: "s", title: "server title", mode: "fast" }] })
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true)
    expect(current.setMessagePartsReadTarget).toBeTypeOf("function")
  } finally { current.dispose(); releaseBrowserEngine(current); invalidateBrowserAuthSessionIndexes(); vi.unstubAllGlobals(); window.localStorage.clear(); window.sessionStorage.clear(); window.history.replaceState(null, "", "/app") }
})

it("visible parts Project root keeps original unknown journal and never creates/replays a command", async () => {
  invalidateBrowserAuthSessionIndexes(); window.localStorage.clear(); window.sessionStorage.clear()
  const scope = { kind: "project" as const, projectRef: "unknown-visible-parts" }, subject = "unknown-visible-reader"
  window.history.replaceState(null, "", `/app/project/${scope.projectRef}`)
  expect(admitBrowserAuthSessionIndexes(subject, null)).toBe(true)
  const { createBrowserSubmissionRecovery } = await import("@/ui/shell/browser-submission-recovery")
  const recovery = createBrowserSubmissionRecovery({ subject, scope, isCurrent: () => readBrowserAuthIndexSubject() === subject, storage: () => window.sessionStorage })
  const original = { sessionId: "unknown-original", optimisticUserId: "original-user", idempotencyKey: "original-key", content: "original frozen text", options: { mode: "fast" as const, model: null, selectedSkillSourceRefs: undefined, selectedMcpConnectionIds: [] as string[] } }
  expect(recovery.save(original)).toBe(true); recovery.failure(original, "network")
  const frozen = recovery.read(original.sessionId)?.submission
  expect(frozen).toMatchObject(original)
  const journal = Object.fromEntries(Object.keys(window.sessionStorage).map(k => [k, window.sessionStorage.getItem(k)]))
  window.localStorage.setItem(`kokoro.web.conversations.project:${scope.projectRef}`, JSON.stringify({ activeId: original.sessionId, conversations: [{ id: original.sessionId, title: "", mode: "fast", updatedAt: 1, localDraft: true }] }))
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code: "session_not_found", message: "Missing" } }, { status: 404 })))
  const current = browserEngine({ preview: false, scope })!
  try {
    await waitFor(() => expect(current.getSnapshot().canRetryPendingSubmission).toBe(true))
    current.setMessagePartsReadTarget?.(null)
    expect(current.getSnapshot().hasPendingSubmission).toBe(true)
    expect(current.getSnapshot().store?.activeId).toBe(original.sessionId)
    expect(Object.fromEntries(Object.keys(window.sessionStorage).map(k => [k, window.sessionStorage.getItem(k)]))).toEqual(journal)
    expect(recovery.read(original.sessionId)?.submission).toEqual(frozen)
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true)
  } finally { current.dispose(); releaseBrowserEngine(current); invalidateBrowserAuthSessionIndexes(); vi.unstubAllGlobals(); window.localStorage.clear(); window.sessionStorage.clear(); window.history.replaceState(null, "", "/app") }
})
