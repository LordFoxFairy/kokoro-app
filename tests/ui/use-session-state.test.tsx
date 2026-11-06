import { act, renderHook, waitFor } from "@testing-library/react"
import { createElement, useEffect } from "react"
import { renderToString } from "react-dom/server"
import { hydrateRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let useSessionProbe: typeof import("@/ui/auth/use-session-state").useSessionProbe

beforeEach(async () => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  vi.resetModules()
  useSessionProbe = (await import("@/ui/auth/use-session-state")).useSessionProbe
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const authenticated = (subject = "reader-a"): Response =>
  Response.json({ data: { authenticated: true, subject, tenant_id: "tenant", expires_at: "2030-01-01T00:00:00Z" } })
const anonymous = (): Response => Response.json({ data: { authenticated: false } })

describe("useSessionProbe native IAM boundary", () => {
  it.each([null, "reader-native"])("hydrates the actual safe server observation with index %s without a duplicate status request", async marker => {
    if (marker !== null) window.localStorage.setItem("kokoro.web.auth-index-subject", marker)
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const initialSession = { authenticated: true as const, subject: "reader-native", tenant_id: "tenant", expires_at: "2030-01-01T00:00:00Z" }
    const view = renderHook(() => useSessionProbe({ initialSession }))
    try {
      await act(async () => { await Promise.resolve() })
      expect(view.result.current.projectReadBoundary).toMatchObject({ admitted: true, subject: "reader-native" })
      expect(view.result.current.state).toBe("pass")
      expect(fetchMock).not.toHaveBeenCalled()
    } finally { view.unmount() }
  })

  it("hydrates the same inactive first frame when the browser index changed after SSR", async () => {
    const initialSession = { authenticated: true as const, subject: "reader-a", tenant_id: "tenant", expires_at: "2030-01-01T00:00:00Z" }
    function Probe() {
      const probe = useSessionProbe({ initialSession })
      return createElement("output", null, `${probe.state}|${probe.mode}|${probe.projectReadBoundary.admitted}|${probe.projectReadBoundary.subject ?? "none"}`)
    }
    const html = renderToString(createElement(Probe))
    window.localStorage.setItem("kokoro.web.auth-index-subject", "reader-b")
    window.localStorage.setItem("kokoro.web.drafts", "B-draft-bytes")
    let finish!: (response: Response) => void
    const fetchMock = vi.fn(() => new Promise<Response>(resolve => { finish = resolve }))
    vi.stubGlobal("fetch", fetchMock)
    const container = document.createElement("div"); container.innerHTML = html; document.body.append(container)
    const onRecoverableError = vi.fn()
    let root: Root | undefined
    try {
      await act(async () => { root = hydrateRoot(container, createElement(Probe), { onRecoverableError }) })
      expect(onRecoverableError).not.toHaveBeenCalled()
      expect(html).toContain("checking|checking|false|none")
      expect(container.textContent).toBe("checking|checking|false|none")
      expect(window.localStorage.getItem("kokoro.web.drafts")).toBe("B-draft-bytes")
      expect(fetchMock).toHaveBeenCalledOnce()
      await act(async () => finish(authenticated("reader-b")))
      expect(container.textContent).toBe("pass|authenticated|true|reader-b")
    } finally {
      if (root) await act(async () => root!.unmount())
      container.remove()
    }
  })

  it.each(["reader-a", null])("observes a persisted pre-hydration logout hint with index %s before admitting SSR", async marker => {
    const initialSession = { authenticated: true as const, subject: "reader-a", tenant_id: "tenant", expires_at: "2030-01-01T00:00:00Z" }
    const admissions: (string | null)[] = []
    function Probe() {
      const probe = useSessionProbe({ initialSession })
      if (probe.projectReadBoundary.admitted) admissions.push(probe.projectReadBoundary.subject)
      return createElement("output", null, `${probe.state}|${probe.projectReadBoundary.admitted}`)
    }
    const html = renderToString(createElement(Probe))
    admissions.length = 0
    if (marker !== null) window.localStorage.setItem("kokoro.web.auth-index-subject", marker)
    window.localStorage.setItem("kokoro.web.auth-invalidation", "logout-before-hydration")
    // This event is delivered before the hook registers; the existing persisted hint must still retire SSR.
    window.dispatchEvent(new StorageEvent("storage", { key: "kokoro.web.auth-invalidation", storageArea: window.localStorage, oldValue: null, newValue: "logout-before-hydration" }))
    let finish!: (response: Response) => void
    const fetchMock = vi.fn(() => new Promise<Response>(resolve => { finish = resolve }))
    vi.stubGlobal("fetch", fetchMock)
    const container = document.createElement("div"); container.innerHTML = html; document.body.append(container)
    const onRecoverableError = vi.fn()
    let root: Root | undefined
    try {
      await act(async () => { root = hydrateRoot(container, createElement(Probe), { onRecoverableError }) })
      expect(onRecoverableError).not.toHaveBeenCalled()
      expect(admissions).toEqual([])
      expect(container.textContent).toBe("checking|false")
      expect(fetchMock).toHaveBeenCalledOnce()
      await act(async () => finish(anonymous()))
      expect(container.textContent).toBe("anonymous|false")
      expect(admissions).toEqual([])
    } finally {
      if (root) await act(async () => root!.unmount())
      container.remove()
    }
  })

  it("rechecks a bootstrap invalidated before its admission microtask without publishing SSR", async () => {
    const initialSession = { authenticated: true as const, subject: "reader-a", tenant_id: "tenant", expires_at: "2030-01-01T00:00:00Z" }
    const fetchMock = vi.fn().mockResolvedValue(anonymous())
    vi.stubGlobal("fetch", fetchMock)
    const admissions: (string | null)[] = []
    const view = renderHook(() => {
      const probe = useSessionProbe({ initialSession })
      useEffect(() => { window.localStorage.setItem("kokoro.web.auth-invalidation", "logout-after-effect-start") }, [])
      if (probe.projectReadBoundary.admitted) admissions.push(probe.projectReadBoundary.subject)
      return probe
    })
    try {
      await waitFor(() => expect(view.result.current.state).toBe("anonymous"))
      expect(admissions).toEqual([])
      expect(fetchMock).toHaveBeenCalledOnce()
    } finally { view.unmount() }
  })

  it("fences a real status request when the persisted invalidation hint changes before the storage event is delivered", async () => {
    let finish!: (response: Response) => void
    const fetchMock = vi.fn(() => new Promise<Response>(resolve => { finish = resolve }))
    vi.stubGlobal("fetch", fetchMock)
    const view = renderHook(() => useSessionProbe())
    try {
      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
      window.localStorage.setItem("kokoro.web.auth-invalidation", "new-ui-retirement")
      await act(async () => finish(authenticated("reader-a")))
      expect(view.result.current.projectReadBoundary.admitted).toBe(false)
      expect(window.localStorage.getItem("kokoro.web.auth-index-subject")).toBeNull()
    } finally { view.unmount() }
  })

  it("does not admit stale SSR A or clear the current B draft and unknown journal before a fresh status read", async () => {
    const { AUTH_INDEX_SUBJECT_KEY, readBrowserAuthIndexSubject } = await import("@/ui/shell/page-clients")
    const { createBrowserSubmissionRecovery } = await import("@/ui/shell/browser-submission-recovery")
    // The RSC observation precedes the other tab's switch; hydration is not its request start.
    const initialSession = { authenticated: true as const, subject: "reader-a", tenant_id: "tenant", expires_at: "2030-01-01T00:00:00Z" }
    window.localStorage.setItem(AUTH_INDEX_SUBJECT_KEY, "reader-b")
    const drafts = JSON.stringify({ __pending__: "B's unsent draft" })
    window.localStorage.setItem("kokoro.web.drafts", drafts)
    const journal = createBrowserSubmissionRecovery({ subject: "reader-b", scope: { kind: "direct" }, isCurrent: () => readBrowserAuthIndexSubject() === "reader-b", storage: () => window.sessionStorage })
    const intent = { sessionId: "pending-local", optimisticUserId: "original-user", idempotencyKey: "original-key", content: "B's original unknown text", options: { mode: "fast" as const, model: null, selectedSkillSourceRefs: ["skill:original"], selectedMcpConnectionIds: ["connection-original"] } }
    expect(journal.save(intent)).toBe(true)
    journal.failure(intent, "network")
    const stored = Object.fromEntries(Object.keys(window.sessionStorage).map(key => [key, window.sessionStorage.getItem(key)]))
    let finish!: (response: Response) => void
    const fetchMock = vi.fn(() => new Promise<Response>(resolve => { finish = resolve }))
    vi.stubGlobal("fetch", fetchMock)
    const admissions: (string | null)[] = []
    const view = renderHook(() => {
      const probe = useSessionProbe({ initialSession })
      if (probe.projectReadBoundary.admitted) admissions.push(probe.projectReadBoundary.subject)
      return probe
    })
    try {
      await act(async () => { await Promise.resolve() })
      expect(admissions).toEqual([])
      expect(view.result.current.projectReadBoundary.admitted).toBe(false)
      expect(readBrowserAuthIndexSubject()).toBe("reader-b")
      expect(window.localStorage.getItem("kokoro.web.drafts")).toBe(drafts)
      expect(Object.fromEntries(Object.keys(window.sessionStorage).map(key => [key, window.sessionStorage.getItem(key)]))).toEqual(stored)
      expect(fetchMock).toHaveBeenCalledOnce()
      await act(async () => finish(authenticated("reader-b")))
      await waitFor(() => expect(view.result.current.projectReadBoundary).toMatchObject({ admitted: true, subject: "reader-b" }))
      expect(admissions).not.toContain("reader-a")
      expect(window.localStorage.getItem("kokoro.web.drafts")).toBe(drafts)
      expect(journal.read(intent.sessionId)).toEqual({ submission: intent, failureCode: "network" })
    } finally { view.unmount() }
  })

  it("revalidates an expired server observation without first admitting its subject", async () => {
    let finish!: (response: Response) => void
    const fetchMock = vi.fn(() => new Promise<Response>(resolve => { finish = resolve }))
    vi.stubGlobal("fetch", fetchMock)
    const initialSession = { authenticated: true as const, subject: "reader-a", tenant_id: "tenant", expires_at: "2000-01-01T00:00:00Z" }
    const admissions: (string | null)[] = []
    const view = renderHook(() => {
      const probe = useSessionProbe({ initialSession })
      if (probe.projectReadBoundary.admitted) admissions.push(probe.projectReadBoundary.subject)
      return probe
    })
    try {
      await act(async () => { await Promise.resolve() })
      expect(admissions).toEqual([])
      expect(view.result.current.projectReadBoundary.admitted).toBe(false)
      expect(fetchMock).toHaveBeenCalledOnce()
      await act(async () => finish(authenticated("reader-a")))
      await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    } finally { view.unmount() }
  })

  it("does not revive an already retired document from SSR and requires a fresh status read on return", async () => {
    const fetchMock = vi.fn().mockResolvedValue(authenticated("reader-a"))
    vi.stubGlobal("fetch", fetchMock)
    const initialSession = { authenticated: true as const, subject: "reader-a", tenant_id: "tenant", expires_at: "2030-01-01T00:00:00Z" }
    const first = renderHook(() => useSessionProbe({ initialSession }))
    await act(async () => { await Promise.resolve() })
    expect(first.result.current.projectReadBoundary.admitted).toBe(true)
    act(() => window.dispatchEvent(new Event("pagehide")))
    first.unmount()
    const admissions: (string | null)[] = []
    const view = renderHook(() => {
      const probe = useSessionProbe({ initialSession })
      if (probe.projectReadBoundary.admitted) admissions.push(probe.projectReadBoundary.subject)
      return probe
    })
    try {
      await act(async () => { await Promise.resolve() })
      expect(admissions).toEqual([])
      expect(view.result.current.projectReadBoundary.admitted).toBe(false)
      expect(fetchMock).not.toHaveBeenCalled()
      act(() => window.dispatchEvent(new Event("pageshow")))
      await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/auth/session", expect.objectContaining({ cache: "no-store" }))
    } finally { view.unmount() }
  })

  it("shares one in-flight native session read between concurrent mounts", async () => {
    let resolve!: (response: Response) => void
    const pending = new Promise<Response>((done) => { resolve = done })
    const fetchMock = vi.fn().mockReturnValueOnce(pending)
    vi.stubGlobal("fetch", fetchMock)
    const first = renderHook(() => useSessionProbe())
    const second = renderHook(() => useSessionProbe())
    try {
      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
      resolve(authenticated())
      await waitFor(() => expect(first.result.current.projectReadBoundary.admitted).toBe(true))
      expect(second.result.current.projectReadBoundary).toMatchObject({ admitted: true, subject: "reader-a" })
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/auth/session", expect.objectContaining({ cache: "no-store" }))
    } finally {
      first.unmount()
      second.unmount()
    }
  })

  it("admits a native projection without CSRF reads, refresh POSTs, or legacy session state", async () => {
    const fetchMock = vi.fn().mockResolvedValue(authenticated("reader-native"))
    vi.stubGlobal("fetch", fetchMock)
    const view = renderHook(() => useSessionProbe())
    try {
      await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
      expect(view.result.current).toMatchObject({ state: "pass", mode: "authenticated", projectReadBoundary: {
        subject: "reader-native", admitted: true,
      } })
      expect(fetchMock).toHaveBeenCalledOnce()
      expect(fetchMock.mock.calls.every(([path, init]) => path === "/api/auth/session" && init?.method === undefined)).toBe(true)
    } finally { view.unmount() }
  })

  it("keeps an anonymous projection closed and does not establish a browser subject", async () => {
    const fetchMock = vi.fn().mockResolvedValue(anonymous())
    vi.stubGlobal("fetch", fetchMock)
    const view = renderHook(() => useSessionProbe())
    try {
      await waitFor(() => expect(view.result.current.state).toBe("anonymous"))
      expect(view.result.current.projectReadBoundary).toEqual({ admitted: false, subject: null, generation: 1 })
      expect(fetchMock).toHaveBeenCalledOnce()
    } finally { view.unmount() }
  })

  it("rejects malformed session projections as unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ authenticated: true, subject: " " }))
    vi.stubGlobal("fetch", fetchMock)
    const view = renderHook(() => useSessionProbe())
    try {
      await waitFor(() => expect(view.result.current.state).toBe("unavailable"))
      expect(view.result.current.projectReadBoundary.admitted).toBe(false)
    } finally { view.unmount() }
  })

  it("distinguishes a strict qualification403 from anonymous and retires previous private admission", async () => {
    const fetchMock=vi.fn().mockResolvedValueOnce(authenticated()).mockResolvedValueOnce(Response.json({error:{code:"session_forbidden",message:"Current Product qualification is required",retryable:false}},{status:403}))
    vi.stubGlobal("fetch",fetchMock);const view=renderHook(()=>useSessionProbe())
    try { await waitFor(()=>expect(view.result.current.projectReadBoundary.admitted).toBe(true));act(()=>window.dispatchEvent(new Event("focus")));await waitFor(()=>expect(view.result.current.state).toBe("forbidden"));expect(view.result.current.projectReadBoundary.admitted).toBe(false) } finally {view.unmount()}
  })

  it("preserves a same-subject boundary during a focused recheck", async () => {
    let finish!: (response: Response) => void
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticated())
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve }))
    vi.stubGlobal("fetch", fetchMock)
    const view = renderHook(() => useSessionProbe())
    try {
      await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
      const boundary = view.result.current.projectReadBoundary
      act(() => window.dispatchEvent(new Event("focus")))
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
      expect(view.result.current.projectReadBoundary).toBe(boundary)
      await act(async () => { finish(authenticated()) })
      await waitFor(() => expect(view.result.current.requestPending).toBe(false))
      expect(view.result.current.projectReadBoundary).toBe(boundary)
    } finally { view.unmount() }
  })

  it("retires admission when a native recheck becomes anonymous", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(authenticated()).mockResolvedValueOnce(anonymous())
    vi.stubGlobal("fetch", fetchMock)
    const view = renderHook(() => useSessionProbe())
    try {
      await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
      act(() => window.dispatchEvent(new Event("focus")))
      await waitFor(() => expect(view.result.current.state).toBe("anonymous"))
      expect(view.result.current.projectReadBoundary).toMatchObject({ admitted: false, subject: null })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally { view.unmount() }
  })

  it("retires a pending check after a cross-tab identity marker change", async () => {
    let finish!: (response: Response) => void
    const fetchMock = vi.fn().mockResolvedValueOnce(authenticated()).mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve }))
    vi.stubGlobal("fetch", fetchMock)
    const view = renderHook(() => useSessionProbe())
    try {
      await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
      act(() => window.dispatchEvent(new Event("focus")))
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
      act(() => {
        window.localStorage.setItem("kokoro.web.auth-index-subject", "reader-b")
        window.dispatchEvent(new StorageEvent("storage", { key: "kokoro.web.auth-index-subject", storageArea: window.localStorage, oldValue: "reader-a", newValue: "reader-b" }))
      })
      expect(view.result.current.projectReadBoundary.admitted).toBe(false)
      await act(async () => { finish(authenticated()) })
      expect(view.result.current.projectReadBoundary.admitted).toBe(false)
    } finally { view.unmount() }
  })

  it("uses one bounded native GET for a read-unauthorized recovery", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(authenticated()).mockResolvedValueOnce(authenticated())
    vi.stubGlobal("fetch", fetchMock)
    const view = renderHook(() => useSessionProbe())
    try {
      await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
      const boundary = view.result.current.projectReadBoundary
      const signal = new AbortController().signal
      let accepted: Promise<boolean> | void = undefined
      act(() => { accepted = view.result.current.reportReadUnauthorized({ subject: "reader-a", generation: boundary.generation, signal }) })
      await expect(accepted).resolves.toBe(true)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock.mock.calls.every(([, init]) => init?.method === undefined)).toBe(true)
    } finally { view.unmount() }
  })
})
