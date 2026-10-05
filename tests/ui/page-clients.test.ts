import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { admitBrowserAuthSessionIndexes, browserConversationMoveCoordinator, browserListClient, readBrowserAuthIndexSubject } from "@/ui/shell/page-clients"

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
